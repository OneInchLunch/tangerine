"""Repository-scoped write endpoints for the Tangerine gateway.

Repository-scoped admins cannot be authorized by Pulp for every write, so these
endpoints validate every affected repository PRN with the gateway service
account and audit the write. Extracted from ``main.py``; register them on the
gateway router with :func:`register_scope_routes`.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Mapping

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from . import store
from .hrefs import PulpPathError, ensure_pulp_endpoint, normalize_pulp_path
from .pulp import PulpClient, TaskTimeout
from .scope import repository_prns_for_provider
from .scope import scoped_group_roles as dynamic_group_scopes
from .settings import Settings

logger = logging.getLogger(__name__)

# Signing configuration is a trust operation: attaching a service lets a caller
# have instance-key signatures produced. Only superusers may set it; the UI
# hides the fields for everyone else and this guard keeps scoped sessions from
# bypassing that by calling the gateway directly.
SIGNING_FIELDS = frozenset(
    {
        "metadata_signing_service",
        "package_signing_service",
        "package_signing_fingerprint",
        "signing_service",
        "signing_service_release_overrides",
        "package_signing_fingerprint_release_overrides",
        "manifest_signing_service",
    }
)


def _reject_signing_fields(body: Mapping[str, Any], *, is_super: bool) -> None:
    if is_super:
        return
    if SIGNING_FIELDS.intersection(body):
        raise HTTPException(
            status_code=403,
            detail="signing configuration requires a superuser",
        )


def register_scope_routes(
    router: APIRouter,
    *,
    settings: Settings,
    db: store.Store,
    session_for: Any,
    require_csrf: Any,
    pulp_dep: Any,
) -> None:
    """Register the ``/scope/*`` endpoints on the gateway router."""

    # --- repository-scoped admin writes -------------------------------------

    async def _scope_context(
        request: Request, pulp: PulpClient
    ) -> tuple[str, store.Provider, set[str], bool]:
        session = session_for(request)
        if session is None:
            raise HTTPException(status_code=401, detail="not signed in")
        provider = db.get_provider(session.provider_id) if session.provider_id else None
        if provider is None:
            raise HTTPException(status_code=400, detail="provider is required")
        user = await pulp.get_user(session.username)
        if user is None:
            raise HTTPException(status_code=403, detail="Pulp user required")
        groups = {group.get("name") for group in user.get("groups") or []}
        is_super = bool(user.get("is_superuser"))
        prns = repository_prns_for_provider(
            provider, dynamic_group_scopes(db), groups
        )
        if not is_super and not prns:
            raise HTTPException(status_code=403, detail="repository scope required")
        return session.username, provider, prns, is_super

    def _scope_path(value: str, prefixes: tuple[str, ...]) -> str:
        try:
            return ensure_pulp_endpoint(
                value,
                pulp_url=settings.pulp_url,
                api_path=settings.pulp_api_path,
                prefixes=prefixes,
            )
        except PulpPathError as exc:
            raise HTTPException(status_code=400, detail="invalid Pulp endpoint") from exc

    def _scope_href(value: str) -> str:
        try:
            return normalize_pulp_path(
                value,
                pulp_url=settings.pulp_url,
                api_path=settings.pulp_api_path,
            )
        except PulpPathError as exc:
            raise HTTPException(status_code=400, detail="invalid Pulp href") from exc

    def _scope_body(value: Any) -> Mapping[str, Any]:
        if value is None:
            return {}
        if not isinstance(value, Mapping):
            raise HTTPException(status_code=400, detail="request body must be an object")
        return value

    async def _require_repository_scope(
        pulp: PulpClient, href: str, prns: set[str], *, is_super: bool
    ) -> str:
        if not href:
            raise HTTPException(status_code=400, detail="repository is required")
        href = _scope_href(href)
        record = await pulp.get_resource(href)
        if record is None:
            raise HTTPException(status_code=404, detail="repository not found")
        prn = str(record.get("prn") or "")
        if not prn:
            raise HTTPException(status_code=400, detail="repository has no PRN")
        if not is_super and prn not in prns:
            raise HTTPException(status_code=403, detail="repository is outside scope")
        return prn

    async def _require_version_scope(
        pulp: PulpClient, href: str, prns: set[str], *, is_super: bool
    ) -> str:
        href = _scope_href(href)
        record = await pulp.get_resource(href)
        if record is None:
            raise HTTPException(status_code=404, detail="repository version not found")
        repository_href = (record or {}).get("repository")
        if not isinstance(repository_href, str) or not repository_href:
            raise HTTPException(
                status_code=400, detail="repository version has no repository"
            )
        return await _require_repository_scope(
            pulp, repository_href, prns, is_super=is_super
        )

    async def _require_publication_scope(
        pulp: PulpClient, href: str, prns: set[str], *, is_super: bool
    ) -> str:
        href = _scope_href(href)
        record = await pulp.get_resource(href)
        if record is None:
            raise HTTPException(status_code=404, detail="publication not found")
        repository_href = (record or {}).get("repository")
        if not isinstance(repository_href, str) or not repository_href:
            raise HTTPException(
                status_code=400, detail="publication has no repository"
            )
        return await _require_repository_scope(
            pulp, repository_href, prns, is_super=is_super
        )

    async def _require_body_scope(
        pulp: PulpClient,
        body: Mapping[str, Any],
        prns: set[str],
        *,
        is_super: bool,
    ) -> int:
        """Validate every repository reference a write body introduces.

        Returns the number of references checked so callers can fail closed when
        an object has no repository at all.
        """

        checked = 0
        repository = body.get("repository")
        publication = body.get("publication")
        if (
            isinstance(repository, str)
            and repository
            and isinstance(publication, str)
            and publication
        ):
            raise HTTPException(
                status_code=400,
                detail="repository and publication are mutually exclusive",
            )
        if isinstance(repository, str) and repository:
            await _require_repository_scope(
                pulp, repository, prns, is_super=is_super
            )
            checked += 1
        if isinstance(publication, str) and publication:
            await _require_publication_scope(
                pulp, publication, prns, is_super=is_super
            )
            checked += 1
        version = body.get("repository_version") or body.get("start_repository_version")
        if isinstance(version, str) and version:
            await _require_version_scope(pulp, version, prns, is_super=is_super)
            checked += 1
        repositories = body.get("repositories")
        if isinstance(repositories, list):
            for href in repositories:
                if isinstance(href, str) and href:
                    await _require_repository_scope(
                        pulp, href, prns, is_super=is_super
                    )
                    checked += 1
        versions = body.get("versions")
        if isinstance(versions, list):
            for href in versions:
                if isinstance(href, str) and href:
                    await _require_version_scope(
                        pulp, href, prns, is_super=is_super
                    )
                    checked += 1
        return checked

    async def _require_record_scope(
        pulp: PulpClient,
        record: Mapping[str, Any],
        prns: set[str],
        *,
        is_super: bool,
        href: str,
    ) -> int:
        """Validate the repository references an existing Pulp record carries."""

        checked = 0
        repositories = record.get("repositories")
        if isinstance(repositories, list):
            for item in repositories:
                if isinstance(item, str) and item:
                    await _require_repository_scope(
                        pulp, item, prns, is_super=is_super
                    )
                    checked += 1
        repository_href = record.get("repository")
        version_href = record.get("repository_version")
        publication_href = record.get("publication")
        if isinstance(repository_href, str) and repository_href:
            await _require_repository_scope(
                pulp, repository_href, prns, is_super=is_super
            )
            checked += 1
        elif isinstance(version_href, str) and version_href:
            await _require_version_scope(
                pulp, version_href, prns, is_super=is_super
            )
            checked += 1
        if isinstance(publication_href, str) and publication_href:
            await _require_publication_scope(
                pulp, publication_href, prns, is_super=is_super
            )
            checked += 1
        if not checked and href.startswith(f"{settings.pulp_api_path}remotes/"):
            repos = await pulp.list_resources(f"{settings.pulp_api_path}repositories/")
            attached = [item for item in repos if item.get("remote") == href]
            if not attached and not is_super:
                raise HTTPException(status_code=403, detail="remote is outside scope")
            for item in attached:
                await _require_repository_scope(
                    pulp,
                    str(item.get("pulp_href") or ""),
                    prns,
                    is_super=is_super,
                )
                checked += 1
        return checked

    async def _require_write_scope(
        pulp: PulpClient,
        href: str,
        body: Mapping[str, Any],
        prns: set[str],
        *,
        is_super: bool,
    ) -> dict[str, Any]:
        record = await pulp.get_resource(href)
        if record is None:
            raise HTTPException(status_code=404, detail="object not found")
        checked = await _require_record_scope(
            pulp, record, prns, is_super=is_super, href=href
        )
        checked += await _require_body_scope(
            pulp, body, prns, is_super=is_super
        )
        if not checked and not is_super:
            raise HTTPException(status_code=403, detail="object is outside scope")
        return record

    async def _scope_result(pulp: PulpClient, result: Any, *, status_code: int = 200) -> JSONResponse:
        """Await a Pulp task envelope with the service account.

        Scoped admins cannot read tasks, so waiting in the browser would turn a
        successful write into a 403. A task that outlives the timeout returns the
        original envelope plus ``pending`` so the UI can invalidate and poll.
        """

        task_href = result.get("task") if isinstance(result, dict) else None
        if not isinstance(task_href, str) or not task_href:
            return JSONResponse({"result": result}, status_code=status_code)
        try:
            task = await pulp.await_task(
                task_href, timeout=settings.scoped_task_timeout_seconds
            )
        except TaskTimeout as exc:
            return JSONResponse(
                {"result": result, "pending": True, "task": exc.task},
                status_code=status_code,
            )
        state = str(task.get("state") or "")
        if state == "completed":
            return JSONResponse({"result": task}, status_code=status_code)
        error = task.get("error") or task.get("messages") or "no detail"
        raise HTTPException(
            status_code=502, detail=f"Pulp task {state}: {error}"
        )


    def _audit_scope(
        actor: str, provider_id: str, action: str, detail: str
    ) -> None:
        try:
            db.record_provider_audit(
                actor=actor,
                action=action,
                provider_id=provider_id,
                detail=detail,
            )
        except Exception:
            logger.exception("failed to record scope audit")

    @router.post("/scope/repositories")
    async def scope_create_repository(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        path = _scope_path(str(data.get("path") or ""), ("repositories",))
        body = _scope_body(data.get("body"))
        _reject_signing_fields(body, is_super=is_super)
        remote = body.get("remote")
        if isinstance(remote, str) and remote:
            remote_href = _scope_href(remote)
            if await pulp.get_resource(remote_href) is None:
                raise HTTPException(status_code=400, detail="remote not found")
        created = await pulp.request_json("POST", path, json=dict(body))
        if not isinstance(created, dict):
            raise HTTPException(status_code=502, detail="unexpected Pulp response")
        prn = str(created.get("prn") or "")
        if prn and settings.admin_group:
            db.add_repository_scope(
                provider_id=provider.id,
                group_name=settings.admin_group,
                repository_prn=prn,
                source="created",
                created_by=actor,
            )
        _audit_scope(actor, provider.id, "scope.repository.create", prn)
        return JSONResponse(
            {"repository": created, "repositoryPrn": prn}, status_code=201
        )

    @router.post("/scope/repository")
    async def scope_repository_action(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        method = str(data.get("method") or "").upper()
        href = _scope_path(str(data.get("href") or ""), ("repositories",))
        body = _scope_body(data.get("body"))
        if method not in {"PATCH", "DELETE"}:
            raise HTTPException(status_code=400, detail="invalid scope method")
        _reject_signing_fields(body, is_super=is_super)
        record = await pulp.get_resource(href)
        if record is None:
            raise HTTPException(status_code=404, detail="repository not found")
        prn = str(record.get("prn") or "")
        if not prn:
            raise HTTPException(status_code=400, detail="repository has no PRN")
        if not is_super and prn not in prns:
            raise HTTPException(status_code=403, detail="repository is outside scope")
        remote = body.get("remote")
        if isinstance(remote, str) and remote:
            remote_href = _scope_href(remote)
            if await pulp.get_resource(remote_href) is None:
                raise HTTPException(status_code=400, detail="remote not found")
        result = await pulp.request_json(
            "PATCH" if method == "PATCH" else "DELETE",
            href,
            json=dict(body) or None,
        )
        if method == "DELETE":
            # A deleted repository must not linger in the scope registry, or a
            # later repository with the same PRN would be silently visible.
            db.delete_repository_scope_for_prn(prn)
        _audit_scope(actor, provider.id, f"scope.repository.{method.lower()}", prn)
        return await _scope_result(pulp, result)


    @router.post("/scope/remotes")
    async def scope_create_remote(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        path = _scope_path(str(data.get("path") or ""), ("remotes",))
        body = _scope_body(data.get("body"))
        _reject_signing_fields(body, is_super=is_super)
        repository_href = _scope_href(str(data.get("repositoryHref") or ""))
        await _require_repository_scope(
            pulp, repository_href, prns, is_super=is_super
        )
        remote = await pulp.request_json("POST", path, json=dict(body))
        if not isinstance(remote, dict):
            raise HTTPException(status_code=502, detail="unexpected Pulp response")
        remote_href = remote.get("pulp_href")
        if isinstance(remote_href, str) and remote_href:
            attached = await pulp.request_json(
                "PATCH", repository_href, json={"remote": remote_href}
            )
            await _scope_result(pulp, attached)
        _audit_scope(actor, provider.id, "scope.remote.create", str(remote_href or ""))
        return JSONResponse({"remote": remote}, status_code=201)


    @router.post("/scope/scoped-objects")
    async def scope_create_object(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        path = _scope_path(
            str(data.get("path") or ""),
            ("distributions", "publications", "exporters", "importers"),
        )
        body = _scope_body(data.get("body"))
        _reject_signing_fields(body, is_super=is_super)
        await _require_body_scope(pulp, body, prns, is_super=is_super)
        if "/exporters/" in path and path.endswith("/exports/"):
            parent = path.rsplit("exports/", 1)[0]
            exporter = await pulp.get_resource(parent)
            if exporter:
                repositories = exporter.get("repositories") or []
                for href in repositories:
                    if isinstance(href, str) and href:
                        await _require_repository_scope(
                            pulp, href, prns, is_super=is_super
                        )
        created = await pulp.request_json("POST", path, json=dict(body))
        _audit_scope(actor, provider.id, "scope.create", path)
        return await _scope_result(pulp, created, status_code=201)


    @router.post("/scope/object")
    async def scope_mutate_object(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        method = str(data.get("method") or "").upper()
        href = _scope_path(
            str(data.get("href") or ""),
            ("distributions", "publications", "remotes", "exporters", "importers"),
        )
        body = _scope_body(data.get("body"))
        if method not in {"PATCH", "DELETE"}:
            raise HTTPException(status_code=400, detail="invalid scope method")
        _reject_signing_fields(body, is_super=is_super)
        await _require_write_scope(pulp, href, body, prns, is_super=is_super)
        result = await pulp.request_json(
            "PATCH" if method == "PATCH" else "DELETE",
            href,
            json=dict(body) or None,
        )
        _audit_scope(actor, provider.id, f"scope.{method.lower()}", href)
        return await _scope_result(pulp, result)


    @router.post("/scope/content-upload")
    async def scope_content_upload(
        request: Request,
        path: str = Query(...),
        repository: str = Query(...),
        pulp: PulpClient = Depends(pulp_dep),
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        path = _scope_path(path, ("content",))
        repository_href = _scope_href(repository)
        await _require_repository_scope(
            pulp, repository_href, prns, is_super=is_super
        )
        body = await request.body()
        content_type = request.headers.get("content-type", "")
        if not content_type.startswith("multipart/form-data"):
            raise HTTPException(status_code=400, detail="multipart content is required")
        try:
            async with request.form() as form:
                field = form.get("repository")
        except Exception as exc:  # missing parser or malformed multipart
            raise HTTPException(
                status_code=400, detail="multipart content could not be validated"
            ) from exc
        if not isinstance(field, str) or not field:
            raise HTTPException(
                status_code=400, detail="multipart repository is required"
            )
        if _scope_href(field) != repository_href:
            raise HTTPException(
                status_code=400,
                detail="multipart repository does not match the request scope",
            )
        result = await pulp.request_content(
            "POST", path, content=body, content_type=content_type
        )
        _audit_scope(actor, provider.id, "scope.content.upload", path)
        return await _scope_result(pulp, result, status_code=201)


    @router.post("/scope/import-export")
    async def scope_import_export(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        require_csrf(request)
        actor, provider, prns, is_super = await _scope_context(request, pulp)
        data = await request.json()
        path = _scope_path(
            str(data.get("path") or ""),
            ("exporters", "importers", "exports", "imports"),
        )
        body = _scope_body(data.get("body"))
        body_dict = dict(body)
        mapping = body_dict.get("repo_mapping")
        if isinstance(mapping, str) and mapping.strip():
            try:
                mapping = json.loads(mapping)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail="repo_mapping must be a JSON object",
                ) from exc
        if mapping is not None and not isinstance(mapping, dict):
            raise HTTPException(
                status_code=400, detail="repo_mapping must be an object"
            )
        if path.endswith("/exports/"):
            exporter = await pulp.get_resource(path[: -len("exports/")])
            if exporter is None:
                raise HTTPException(status_code=404, detail="exporter not found")
            for href in exporter.get("repositories") or []:
                if isinstance(href, str) and href:
                    await _require_repository_scope(
                        pulp, href, prns, is_super=is_super
                    )
        if path.endswith("/imports/") or path.endswith("/import-check/"):
            if not is_super:
                if body_dict.get("create_repositories"):
                    raise HTTPException(
                        status_code=403,
                        detail="scoped importers cannot create repositories",
                    )
                if path.endswith("/imports/") and not mapping:
                    importer = await pulp.get_resource(path[: -len("imports/")])
                    if importer is None:
                        raise HTTPException(status_code=404, detail="importer not found")
                    mapping = importer.get("repo_mapping") or {}
                if not isinstance(mapping, dict) or not mapping:
                    raise HTTPException(
                        status_code=400,
                        detail="scoped imports require an explicit repo_mapping",
                    )
                for name in sorted({str(value) for value in mapping.values()}):
                    if not name:
                        continue
                    found = await pulp.request_json(
                        "GET",
                        f"{settings.pulp_api_path}repositories/",
                        params={"name": name},
                    )
                    hrefs = [
                        item.get("pulp_href")
                        for item in (found or {}).get("results") or []
                        if item.get("pulp_href")
                    ]
                    if not hrefs:
                        raise HTTPException(
                            status_code=400,
                            detail=f"mapped repository {name!r} was not found",
                        )
                    for href in hrefs:
                        await _require_repository_scope(
                            pulp, str(href), prns, is_super=is_super
                        )
        await _require_body_scope(pulp, body_dict, prns, is_super=is_super)
        created = await pulp.request_json("POST", path, json=body_dict)
        _audit_scope(actor, provider.id, "scope.import_export", path)
        return await _scope_result(pulp, created, status_code=201)


