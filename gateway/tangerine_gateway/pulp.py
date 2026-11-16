"""Async Pulp REST client used for user provisioning and reconciliation.

Only the service account uses this client. It authenticates with Basic auth, so
the gateway never relies on the identity header it injects for browsers.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Iterable, Mapping

import httpx

from .hrefs import PulpPathError, normalize_pulp_path

ROLE_PAGE_LIMIT = 100
TASK_TERMINAL_STATES = {"completed", "failed", "canceled"}


class PulpError(RuntimeError):
    def __init__(self, status: int, detail: str):
        super().__init__(f"Pulp returned {status}: {detail}")
        self.status = status
        self.detail = detail


class TaskTimeout(RuntimeError):
    """The task did not reach a terminal state before the deadline."""

    def __init__(self, task: dict[str, Any]):
        super().__init__("task did not finish in time")
        self.task = task


def role_key(role: str, domain_name: str, prn: str) -> str:
    """The ``role/domain/prn`` key used by the mapping config and the plan."""

    return f"{role}/{domain_name}/{prn}"


def split_role_key(key: str) -> tuple[str, str, str]:
    role, domain, prn = key.split("/", 2)
    return role, domain, prn


class PulpClient:
    def __init__(
        self,
        base_url: str,
        user: str,
        password: str,
        *,
        verify: bool = True,
        timeout: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
        api_path: str = "/pulp/api/v3/",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_path = api_path
        self._verify = verify
        self._timeout = timeout
        self._transport = transport
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            auth=(user, password),
            verify=verify,
            timeout=timeout,
            headers={"Accept": "application/json"},
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> PulpClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    # --- plumbing -----------------------------------------------------------

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            url = normalize_pulp_path(
                path, pulp_url=self._base_url, api_path=self._api_path
            )
        except PulpPathError as exc:
            raise PulpError(400, f"invalid Pulp path: {exc}") from exc
        try:
            response = await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise PulpError(0, f"unreachable: {exc}") from exc
        if response.status_code >= 400:
            raise PulpError(response.status_code, response.text[:300])
        return response

    async def _json(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._request(method, path, **kwargs)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def _paginated(self, path: str, params: Mapping[str, Any] | None = None) -> list[dict]:
        results: list[dict] = []
        seen: set[str] = set()
        next_url: str | None = path
        query = dict(params or {})
        while next_url:
            if next_url in seen:
                # Some endpoints repeat the same next link; stop instead of looping.
                break
            seen.add(next_url)
            payload = await self._json("GET", next_url, params=query)
            if not isinstance(payload, dict):
                break
            results.extend(payload.get("results") or [])
            next_url = payload.get("next")
            # `next` is absolute and already carries the query string.
            query = {}
        return results

    # --- users --------------------------------------------------------------

    async def get_user(self, username: str) -> dict | None:
        payload = await self._json("GET", "/pulp/api/v3/users/", params={"username": username})
        results = (payload or {}).get("results") or []
        return results[0] if results else None

    async def list_users(self) -> list[dict]:
        return await self._paginated("/pulp/api/v3/users/")

    async def create_user(self, username: str) -> dict:
        return await self._json(
            "POST",
            "/pulp/api/v3/users/",
            json={"username": username, "password": None, "is_active": True},
        )

    async def is_admin(self, username: str, admin_group: str | None = None) -> bool:
        user = await self.get_user(username)
        if user is None:
            return False
        if user.get("is_superuser") or user.get("is_staff"):
            return True
        if admin_group:
            return any(group.get("name") == admin_group for group in user.get("groups") or [])
        return False

    async def is_superuser(self, username: str) -> bool:
        user = await self.get_user(username)
        return bool(user and user.get("is_superuser"))

    async def is_superadmin(self, username: str, group: str | None = None) -> bool:
        user = await self.get_user(username)
        if user is None:
            return False
        if user.get("is_superuser"):
            return True
        return bool(
            group
            and any(
                item.get("name") == group for item in user.get("groups") or []
            )
        )

    async def username_for_session_cookie(self, cookie_header: str) -> str | None:
        """Resolve a browser's Pulp session cookie to a username.

        This must not reuse the service-account client: Pulp prefers Basic auth
        over a session cookie, so sending the service account alongside the
        browser cookie would resolve every request to the service account and
        turn any cookie into administrator access.
        """

        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                verify=self._verify,
                timeout=self._timeout,
                headers={"Accept": "application/json"},
                transport=self._transport,
            ) as client:
                response = await client.get(
                    "/pulp/api/v3/login/", headers={"Cookie": cookie_header}
                )
        except httpx.HTTPError:
            return None
        if response.status_code != 200:
            return None
        try:
            return (response.json() or {}).get("username")
        except ValueError:
            return None

    # --- groups -------------------------------------------------------------

    async def get_group(self, name: str) -> dict | None:
        payload = await self._json("GET", "/pulp/api/v3/groups/", params={"name": name})
        results = (payload or {}).get("results") or []
        return results[0] if results else None

    async def ensure_group(self, name: str) -> dict:
        existing = await self.get_group(name)
        if existing is not None:
            return existing
        created = await self._json("POST", "/pulp/api/v3/groups/", json={"name": name})
        # Creating a group returns the object; re-read for a consistent shape.
        return created or (await self.get_group(name)) or {"name": name, "pulp_href": ""}

    async def add_group_member(self, group_href: str, username: str) -> None:
        await self._request(
            "POST", f"{group_href}users/", json={"username": username}
        )

    async def remove_group_member(self, group_href: str, user_id: int | str) -> None:
        await self._request("DELETE", f"{group_href}users/{user_id}/")

    # --- roles --------------------------------------------------------------

    async def user_role_assignments(
        self, user_href: str, role_names: Iterable[str]
    ) -> list[dict]:
        names = sorted(set(role_names))
        if not names:
            return []
        return await self._paginated(
            f"{user_href}roles/",
            {"role__in": ",".join(names), "limit": ROLE_PAGE_LIMIT},
        )

    async def add_user_role(
        self,
        user_href: str,
        *,
        role: str,
        domain_href: str | None = None,
        prn: str | None = None,
    ) -> None:
        body: dict[str, Any] = {"role": role}
        if domain_href:
            body["domain"] = domain_href
        else:
            # Pulp requires content_object_prn explicitly; null means global.
            body["content_object_prn"] = prn
        await self._request("POST", f"{user_href}roles/", json=body)

    async def delete_user_role(self, assignment_href: str) -> None:
        await self._request("DELETE", assignment_href)

    async def group_role_assignments(
        self, group_href: str, role_names: Iterable[str]
    ) -> list[dict]:
        names = sorted(set(role_names))
        if not names:
            return []
        return await self._paginated(
            f"{group_href}roles/",
            {"role__in": ",".join(names), "limit": ROLE_PAGE_LIMIT},
        )

    async def add_group_role(
        self,
        group_href: str,
        *,
        role: str,
        domain_href: str | None = None,
        prn: str | None = None,
    ) -> None:
        body: dict[str, Any] = {"role": role}
        if domain_href:
            body["domain"] = domain_href
        else:
            # Pulp requires content_object_prn explicitly; null means global.
            body["content_object_prn"] = prn
        await self._request("POST", f"{group_href}roles/", json=body)

    async def delete_group_role(self, assignment_href: str) -> None:
        await self._request("DELETE", assignment_href)

    async def list_roles(self) -> list[dict]:
        # Paginate by offset explicitly: Pulp's role `next` link can repeat the
        # same offset, which makes a generic next-link loop non-terminating.
        results: list[dict] = []
        offset = 0
        while True:
            payload = await self._json(
                "GET",
                "/pulp/api/v3/roles/",
                params={"limit": ROLE_PAGE_LIMIT, "offset": offset},
            )
            if not isinstance(payload, dict):
                break
            batch = payload.get("results") or []
            results.extend(batch)
            if not payload.get("next") or not batch:
                break
            offset += len(batch)
        return results

    async def update_role(self, role_href: str, permissions: list[str]) -> dict:
        return await self._json(
            "PATCH", role_href, json={"permissions": permissions}
        )

    async def create_role(
        self, name: str, permissions: list[str], description: str
    ) -> dict:
        return await self._json(
            "POST",
            "/pulp/api/v3/roles/",
            json={"name": name, "permissions": permissions, "description": description},
        )

    async def set_user_staff(self, user_href: str, is_staff: bool) -> None:
        await self._request("PATCH", user_href, json={"is_staff": is_staff})

    async def set_user_superuser(self, user_href: str, is_superuser: bool) -> None:
        await self._request("PATCH", user_href, json={"is_superuser": is_superuser})

    async def set_user_active(self, user_href: str, is_active: bool) -> None:
        await self._request("PATCH", user_href, json={"is_active": is_active})

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        json: Any | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> Any:
        """Public generic request used by the scoped admin API."""

        return await self._json(method, path, json=json, params=params)

    async def get_resource(self, href: str) -> dict[str, Any] | None:
        payload = await self._json("GET", href)
        return payload if isinstance(payload, dict) else None

    async def await_task(
        self,
        task_href: str,
        *,
        timeout: float = 30.0,
        interval: float = 0.5,
    ) -> dict[str, Any]:
        """Poll a Pulp task until it reaches a terminal state.

        The scoped write proxy waits server-side because repository-scoped admins
        intentionally cannot read tasks. ``TaskTimeout`` carries the last task
        record so the caller can return a pending envelope instead of failing a
        write that may still complete.
        """

        deadline = time.monotonic() + max(0.0, timeout)
        while True:
            task = await self.get_resource(task_href)
            if task is None:
                raise PulpError(404, "task not found")
            if task.get("state") in TASK_TERMINAL_STATES:
                return task
            if time.monotonic() >= deadline:
                raise TaskTimeout(task)
            await asyncio.sleep(interval)

    async def list_resources(
        self, path: str, params: Mapping[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Return every page of a Pulp list endpoint."""

        return await self._paginated(path, params)

    async def request_content(
        self,
        method: str,
        path: str,
        *,
        content: bytes,
        content_type: str,
    ) -> Any:
        """Forward a raw request body, used by the scoped multipart upload proxy."""

        response = await self._request(
            method,
            path,
            content=content,
            headers={"Content-Type": content_type},
        )
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def domain_names(self) -> dict[str, str]:
        """Map domain hrefs to names. Domains are usually disabled."""

        try:
            domains = await self._paginated("/pulp/api/v3/domains/")
        except PulpError:
            return {}
        return {
            domain["pulp_href"]: domain["name"]
            for domain in domains
            if domain.get("pulp_href") and domain.get("name")
        }

    async def domain_hrefs(self) -> dict[str, str]:
        return {name: href for href, name in (await self.domain_names()).items()}

    # --- diagnostics --------------------------------------------------------

    async def status(self) -> dict:
        return await self._json("GET", "/pulp/api/v3/status/")

    async def access_policy(self, viewset_name: str) -> dict | None:
        policies = await self.access_policies_for([viewset_name])
        return policies.get(viewset_name)

    async def access_policies_for(
        self, viewset_names: Iterable[str]
    ) -> dict[str, dict]:
        """Return policies by viewset name.

        Newer Pulp releases filter the list by ``viewset_name``; older ones
        ignore the filter and omit the field from the list, so fall back to
        reading each detail record once.
        """

        wanted = list(dict.fromkeys(viewset_names))
        found: dict[str, dict] = {}
        for name in wanted:
            payload = await self._json(
                "GET",
                "/pulp/api/v3/access_policies/",
                params={"viewset_name": name},
            )
            results = (payload or {}).get("results") or []
            if results:
                found[name] = results[0]
        remaining = [name for name in wanted if name not in found]
        if remaining:
            for summary in await self._paginated("/pulp/api/v3/access_policies/"):
                href = summary.get("pulp_href")
                if not href:
                    continue
                detail = await self._json("GET", href)
                name = (detail or {}).get("viewset_name")
                if name in remaining:
                    found[name] = detail
        return found
