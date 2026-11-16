"""Resolve Google Workspace group membership through the Admin SDK."""

from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import quote

import httpx
import jwt

ADMIN_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly"
ADMIN_GROUPS = "https://admin.googleapis.com/admin/directory/v1/groups"
ADMIN_MEMBERS = "https://admin.googleapis.com/admin/directory/v1/groups/{group}/members"
MAX_PAGES = 10


class GoogleGroupsError(RuntimeError):
    """Raised when service-account delegation or group lookup fails."""


async def _delegated_access_token(
    service_account_json: str,
    *,
    admin_email: str,
    timeout: float,
    verify: bool,
    transport: httpx.AsyncBaseTransport | None,
) -> str:
    try:
        service_account: dict[str, Any] = json.loads(service_account_json)
        client_email = service_account["client_email"]
        private_key = service_account["private_key"]
        token_uri = service_account.get("token_uri", "https://oauth2.googleapis.com/token")
    except (ValueError, KeyError) as exc:
        raise GoogleGroupsError("the Google service-account file is invalid") from exc

    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": client_email,
            "sub": admin_email,
            "scope": ADMIN_SCOPE,
            "aud": token_uri,
            "iat": now,
            "exp": now + 3600,
        },
        private_key,
        algorithm="RS256",
    )

    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            token_response = await client.post(
                token_uri,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion,
                },
                headers={"Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise GoogleGroupsError(f"Google is unreachable: {exc}") from exc

    if token_response.status_code != 200:
        raise GoogleGroupsError(
            "Google token exchange returned "
            f"{token_response.status_code}: {token_response.text[:200]}"
        )
    access_token = token_response.json().get("access_token")
    if not access_token:
        raise GoogleGroupsError("Google token exchange did not return an access token")
    return str(access_token)


async def resolve_workspace_groups(
    service_account_json: str,
    *,
    admin_email: str,
    user_email: str,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    """Return Google Workspace group emails for ``user_email``.

    Requires a service account with domain-wide delegation and an admin account
    allowed to read the Directory API.
    """

    access_token = await _delegated_access_token(
        service_account_json,
        admin_email=admin_email,
        timeout=timeout,
        verify=verify,
        transport=transport,
    )

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            groups: list[str] = []
            page_token: str | None = None
            for _ in range(MAX_PAGES):
                params = {"userKey": user_email, "maxResults": 200}
                if page_token:
                    params["pageToken"] = page_token
                response = await client.get(ADMIN_GROUPS, params=params, headers=headers)
                if response.status_code != 200:
                    raise GoogleGroupsError(
                        f"Google groups returned {response.status_code}: {response.text[:200]}"
                    )
                payload = response.json()
                for entry in payload.get("groups") or []:
                    value = entry.get("email") or entry.get("name") or entry.get("id")
                    if isinstance(value, str) and value:
                        groups.append(value)
                page_token = payload.get("nextPageToken")
                if not page_token:
                    break
            return groups
    except httpx.HTTPError as exc:
        raise GoogleGroupsError(f"Google is unreachable: {exc}") from exc


async def list_group_members(
    service_account_json: str,
    *,
    admin_email: str,
    group_email: str,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[str]:
    """Return member emails for one Workspace group, including nested members."""

    access_token = await _delegated_access_token(
        service_account_json,
        admin_email=admin_email,
        timeout=timeout,
        verify=verify,
        transport=transport,
    )
    url = ADMIN_MEMBERS.format(group=quote(group_email, safe=""))
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }
    members: set[str] = set()
    page_token: str | None = None
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            for _ in range(MAX_PAGES):
                params = {"maxResults": 200}
                if page_token:
                    params["pageToken"] = page_token
                response = await client.get(url, params=params, headers=headers)
                if response.status_code != 200:
                    raise GoogleGroupsError(
                        f"Google group members returned {response.status_code}: "
                        f"{response.text[:200]}"
                    )
                payload = response.json()
                for entry in payload.get("members") or []:
                    email = entry.get("email")
                    if isinstance(email, str) and email:
                        members.add(email)
                page_token = payload.get("nextPageToken")
                if not page_token:
                    break
    except httpx.HTTPError as exc:
        raise GoogleGroupsError(f"Google is unreachable: {exc}") from exc
    return sorted(members)


async def list_workspace_groups(
    service_account_json: str,
    *,
    admin_email: str,
    query: str = "",
    limit: int = 100,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict[str, str]]:
    """List Workspace groups for the access-rule picker.

    Fetches a bounded page set and filters locally so the picker does not depend
    on Google's query syntax. Free-text entry remains available in the UI.
    """

    access_token = await _delegated_access_token(
        service_account_json,
        admin_email=admin_email,
        timeout=timeout,
        verify=verify,
        transport=transport,
    )
    needle = query.strip().lower()
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }
    results: list[dict[str, str]] = []
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            page_token: str | None = None
            for _ in range(MAX_PAGES):
                params = {"customer": "my_customer", "maxResults": 200}
                if page_token:
                    params["pageToken"] = page_token
                response = await client.get(ADMIN_GROUPS, params=params, headers=headers)
                if response.status_code != 200:
                    raise GoogleGroupsError(
                        f"Google groups returned {response.status_code}: {response.text[:200]}"
                    )
                payload = response.json()
                for entry in payload.get("groups") or []:
                    email = entry.get("email")
                    name = entry.get("name") or email
                    if not isinstance(email, str) or not email:
                        continue
                    if needle and needle not in email.lower() and needle not in str(name).lower():
                        continue
                    results.append({"id": email, "label": str(name)})
                    if len(results) >= limit:
                        return results
                page_token = payload.get("nextPageToken")
                if not page_token:
                    break
    except httpx.HTTPError as exc:
        raise GoogleGroupsError(f"Google is unreachable: {exc}") from exc
    return results


def admin_groups_url(user_email: str) -> str:
    """Exposed for diagnostics/tests."""

    return f"{ADMIN_GROUPS}?userKey={quote(user_email)}"
