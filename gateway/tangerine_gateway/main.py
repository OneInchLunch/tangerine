"""Tangerine SSO gateway HTTP application.

Endpoints fall into three groups:

* ``/sso/providers``, ``/sso/start``, ``/sso/callback`` — the OIDC round trip.
* ``/sso/auth`` — Traefik forwardAuth; mints the Pulp identity header.
* ``/sso/admin/*`` — provider management, restricted to Pulp administrators.
"""

from __future__ import annotations

import asyncio
import csv
import hmac
import html
import io
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Mapping
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from . import store
from .access_policies import EXPECTED_POLICIES, policy_matches
from .bootstrap import render_apply_command, render_settings_block
from .errors import IdentityError
from .header import HEADER_NAME, identity_header_value
from .hrefs import PulpPathError, ensure_pulp_endpoint, normalize_pulp_path
from .google_groups import GoogleGroupsError, list_workspace_groups, resolve_workspace_groups
from .graph import GraphError, list_entra_groups, resolve_overage_groups
from .scope import repository_prns_for_provider, scoped_group_roles as dynamic_group_scopes
from .rate_limit import TokenBucketLimiter, client_ip, is_trusted_proxy
from .oidc import (
    OidcError,
    authorize_url,
    discover,
    end_session_url,
    exchange_code,
    issuer_matches,
    new_nonce,
    new_state,
    pkce_pair,
    validate_id_token,
)
from .paths import safe_next_path
from .pulp import PulpClient, PulpError, TaskTimeout, role_key, split_role_key
from .reconcile import ReconcilePreview, preview_reconcile, reconcile
from .managed_roles import ensure_managed_roles
from .mapping import claim_values
from .rules import collect_declared_group_roles
from .secrets import SecretError, list_secrets, read_secret
from .session import hash_token, new_token
from .token_crypto import TokenCipher
from .settings import Settings, load_settings

_logger = logging.getLogger(__name__)
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value: str) -> str:
    """Neutralise spreadsheet formula injection in an exported cell."""

    if value.startswith(CSV_FORMULA_PREFIXES):
        return "'" + value
    return value


class ProviderPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str | None = None
    label: str
    kind: str = "oidc"
    issuer: str
    clientId: str
    secretFile: str
    scopes: str = "openid profile email"
    groupClaim: str | None = "groups"
    roleClaim: str | None = "roles"
    usernameClaim: str | None = None
    usernamePrefix: str | None = None
    requireEmailVerified: bool = False
    allowedTenants: list[str] = Field(default_factory=list)
    fetchGraphGroups: bool = False
    fetchGoogleGroups: bool = False
    googleServiceAccountFile: str | None = None
    googleAdminEmail: str | None = None
    groupMap: dict[str, str] = Field(default_factory=dict)
    roleMap: dict[str, str] = Field(default_factory=dict)
    accessRules: list[dict[str, Any]] = Field(default_factory=list)
    baselineGroup: str | None = None
    baselineRoles: list[str] = Field(default_factory=list)
    strictGroups: bool = False
    allowedEmailDomains: list[str] = Field(default_factory=list)
    requireHostedDomain: bool = False
    enabled: bool = True
    sortOrder: int = 0


class ProviderUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str | None = None
    kind: str | None = None
    issuer: str | None = None
    clientId: str | None = None
    secretFile: str | None = None
    scopes: str | None = None
    groupClaim: str | None = None
    roleClaim: str | None = None
    usernameClaim: str | None = None
    usernamePrefix: str | None = None
    requireEmailVerified: bool | None = None
    allowedTenants: list[str] | None = None
    fetchGraphGroups: bool | None = None
    fetchGoogleGroups: bool | None = None
    googleServiceAccountFile: str | None = None
    googleAdminEmail: str | None = None
    groupMap: dict[str, str] | None = None
    roleMap: dict[str, str] | None = None
    accessRules: list[dict[str, Any]] | None = None
    baselineGroup: str | None = None
    baselineRoles: list[str] | None = None
    strictGroups: bool | None = None
    allowedEmailDomains: list[str] | None = None
    requireHostedDomain: bool | None = None
    enabled: bool | None = None
    sortOrder: int | None = None


def _cookie_kwargs(settings: Settings, *, samesite: str, http_only: bool) -> dict[str, Any]:
    return {
        "path": "/",
        "secure": settings.cookie_secure,
        "httponly": http_only,
        "samesite": samesite,
    }


# Pulp's DRF authentication tries SessionAuthentication before the identity
# header, so a leftover local login cookie wins over the SSO identity: a browser
# that once signed in as an administrator would keep acting as that
# administrator after an SSO login. SSO start, a successful callback, and logout
# therefore drop Pulp's own cookies.
PULP_SESSION_COOKIES = ("sessionid", "csrftoken")


def clear_pulp_session(response: Response, settings: Settings) -> None:
    for name in PULP_SESSION_COOKIES:
        response.delete_cookie(name, path="/", secure=settings.cookie_secure)


def create_app(
    config: Settings | None = None, database: store.Store | None = None
) -> FastAPI:
    settings = config or load_settings()
    db = database or store.build_store(settings.database_url, settings.database_path)
    cipher = TokenCipher(settings.token_encryption_key)

    def pulp_client() -> PulpClient:
        return PulpClient(
            settings.pulp_url,
            settings.pulp_user,
            settings.pulp_password,
            verify=settings.verify_tls,
            timeout=settings.http_timeout,
            api_path=settings.pulp_api_path,
        )

    async def purge_loop() -> None:
        while True:
            await asyncio.sleep(max(60, settings.purge_interval_seconds))
            try:
                await asyncio.to_thread(
                    db.purge_expired,
                    state_ttl_seconds=settings.state_ttl_seconds,
                    audit_retention_days=settings.audit_retention_days,
                )
                await asyncio.to_thread(
                    db.purge_identity_assertions,
                    max_age_seconds=settings.reconcile_max_age_seconds,
                )
            except Exception:
                _logger.exception("periodic database purge failed")

    async def reconcile_loop() -> None:
        while True:
            await asyncio.sleep(max(60, settings.reconcile_interval_seconds))
            try:
                async with pulp_client() as pulp:
                    counts = await reconcile_assertions(settings, db, pulp)
                _logger.info("background reconcile: %s", counts)
            except Exception:
                _logger.exception("background reconciliation cycle failed")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await asyncio.to_thread(db.migrate)
        await asyncio.to_thread(
            db.purge_expired,
            state_ttl_seconds=settings.state_ttl_seconds,
            audit_retention_days=settings.audit_retention_days,
        )
        await asyncio.to_thread(
            db.purge_identity_assertions,
            max_age_seconds=settings.reconcile_max_age_seconds,
        )
        purge_task = asyncio.create_task(purge_loop())
        reconcile_task = (
            asyncio.create_task(reconcile_loop())
            if settings.reconcile_interval_seconds > 0
            else None
        )
        try:
            yield
        finally:
            purge_task.cancel()
            if reconcile_task is not None:
                reconcile_task.cancel()
            for task in (purge_task, reconcile_task):
                if task is None:
                    continue
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            db.close()

    app = FastAPI(title="Tangerine SSO Gateway", docs_url=None, redoc_url=None, lifespan=lifespan)
    limiter = TokenBucketLimiter(
        per_minute=settings.rate_limit_per_minute,
        burst=settings.rate_limit_burst,
        global_per_minute=settings.rate_limit_global_per_minute,
    )
    limited_paths = {
        f"{settings.gateway_base_path.rstrip('/')}/start",
        f"{settings.gateway_base_path.rstrip('/')}/callback",
    }

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        if request.url.path in limited_paths:
            allowed, retry = limiter.allow(
                client_ip(request, settings.trusted_proxies)
            )
            if not allowed:
                return JSONResponse(
                    {"detail": "too many sign-in attempts"},
                    status_code=429,
                    headers={"Retry-After": str(retry)},
                )
        return await call_next(request)

    @app.exception_handler(PulpError)
    async def pulp_error_handler(request: Request, exc: PulpError) -> JSONResponse:
        status = exc.status if 400 <= exc.status < 600 else 502
        return JSONResponse({"detail": exc.detail}, status_code=status)
    # Routes follow `gatewayBasePath` so config.json and the server agree.
    router = APIRouter(prefix=settings.gateway_base_path.rstrip("/"))

    async def pulp_dep() -> AsyncIterator[PulpClient]:
        client = pulp_client()
        try:
            yield client
        finally:
            await client.aclose()

    def session_for(request: Request) -> store.Session | None:
        token = request.cookies.get(settings.session_cookie)
        if not token:
            return None
        return db.get_session(hash_token(token))

    async def caller_usernames(request: Request, pulp: PulpClient) -> list[str]:
        usernames: list[str] = []
        session = session_for(request)
        if session is not None:
            usernames.append(session.username)
        # A local Pulp login also counts: the SPA is same-origin, so its
        # sessionid cookie reaches the gateway. Check both identities so a stale
        # non-admin gateway session cannot hide a fresh local admin login.
        cookie_header = request.headers.get("cookie")
        if cookie_header:
            cookie_user = await pulp.username_for_session_cookie(cookie_header)
            if cookie_user and cookie_user not in usernames:
                usernames.append(cookie_user)
        return usernames

    def require_origin(request: Request) -> None:
        origin = request.headers.get("origin")
        if origin is None:
            referer = request.headers.get("referer")
            if referer:
                parts = urlsplit(referer)
                origin = f"{parts.scheme}://{parts.netloc}" if parts.netloc else None
        if origin != settings.origin:
            raise HTTPException(status_code=403, detail="cross-origin request rejected")

    def require_csrf(request: Request) -> None:
        require_origin(request)
        cookie = request.cookies.get(settings.csrf_cookie)
        supplied = request.headers.get("x-tangerine-csrf")
        if not cookie or not supplied or not hmac.compare_digest(cookie, supplied):
            raise HTTPException(status_code=403, detail="missing CSRF token")

    async def require_admin(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> str:
        usernames = await caller_usernames(request, pulp)
        if not usernames:
            raise HTTPException(status_code=401, detail="not signed in")
        for username in usernames:
            if await pulp.is_admin(username, settings.admin_group):
                return username
        raise HTTPException(status_code=403, detail="Pulp administrator required")

    async def require_superadmin(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> str:
        usernames = await caller_usernames(request, pulp)
        if not usernames:
            raise HTTPException(status_code=401, detail="not signed in")
        for username in usernames:
            if await pulp.is_superadmin(username, settings.superadmin_group):
                return username
        raise HTTPException(status_code=403, detail="Pulp superuser required")


    async def _ensure_roles(pulp: PulpClient, values: dict[str, Any]) -> dict[str, Any]:
        """Ensure the SSO tier roles exist when Google or rules are configured."""

        if (
            values.get("kind") != "google"
            and not values.get("group_map")
            and not values.get("access_rules")
            and not values.get("baseline_group")
        ):
            return {}
        try:
            created = await ensure_managed_roles(pulp)
        except Exception as exc:  # noqa: BLE001 - provider saves must not fail on this
            _logger.warning("managed role creation failed: %s", exc)
            return {"managedRolesError": str(exc)}
        return {"managedRoles": created}

    async def _validate_provider_references(
        pulp: PulpClient, values: dict[str, Any]
    ) -> None:
        """Reject role specs that do not exist in Pulp before saving."""

        specs: set[str] = set()
        for rule in values.get("access_rules") or []:
            specs.update(rule.get("roles") or [])
        specs.update(values.get("baseline_roles") or [])
        baseline_group = values.get("baseline_group")
        if baseline_group and baseline_group == settings.managed_group:
            raise HTTPException(
                status_code=400,
                detail="baselineGroup must not be the SSO marker group",
            )
        if not specs:
            return
        try:
            existing = {str(role.get("name")) for role in await pulp.list_roles()}
        except PulpError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"cannot validate role references: {exc.detail}",
            ) from exc
        unknown = sorted({split_role_key(spec)[0] for spec in specs} - existing)
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"unknown Pulp role: {', '.join(unknown)}",
            )

    async def _revoke_group_roles(
        pulp: PulpClient,
        old_declared: dict[str, set[str]],
        new_declared: dict[str, set[str]],
    ) -> None:
        """Remove roles this integration no longer declares for a group."""

        if not old_declared:
            return
        domain_names: dict[str, str] | None = None
        for group, roles in old_declared.items():
            stale = roles - new_declared.get(group, set())
            if not stale:
                continue
            try:
                record = await pulp.get_group(group)
                if not record:
                    continue
                href = record.get("pulp_href") or ""
                if not href:
                    continue
                names = sorted({split_role_key(role)[0] for role in stale})
                assignments = await pulp.group_role_assignments(href, names)
                if domain_names is None:
                    domain_names = await pulp.domain_names()
                for assignment in assignments:
                    key = role_key(
                        assignment.get("role", ""),
                        domain_names.get(assignment.get("domain") or "", ""),
                        assignment.get("content_object_prn") or "",
                    )
                    if key in stale and assignment.get("pulp_href"):
                        await pulp.delete_group_role(assignment["pulp_href"])
            except PulpError as exc:
                _logger.warning("group role cleanup failed for %s: %s", group, exc)

    # --- OIDC round trip ----------------------------------------------------

    @router.get("/providers")
    async def public_providers() -> list[dict[str, str]]:
        providers = db.list_providers(enabled_only=True)
        return [provider.to_public() for provider in providers]

    @router.get("/start")
    async def start(
        request: Request,
        pulp: PulpClient = Depends(pulp_dep),
        provider: str = Query(...),
        next: str | None = Query(default=None),
        preview: bool = Query(default=False),
    ) -> RedirectResponse:
        record = db.get_provider(provider)
        if record is None or not record.enabled:
            return RedirectResponse(f"{settings.ui_base_path}login?sso_error=unknown_provider", 302)
        if preview:
            usernames = await caller_usernames(request, pulp)
            is_admin = False
            for username in usernames:
                if await pulp.is_admin(username, settings.admin_group):
                    is_admin = True
                    break
            if not is_admin:
                raise HTTPException(status_code=403, detail="administrator access required")

        try:
            discovery = await discover(
                record.issuer, timeout=settings.http_timeout, verify=settings.verify_tls
            )
        except OidcError as exc:
            _logger.warning("discovery failed for %s: %s", record.id, exc)
            return RedirectResponse(
                f"{settings.ui_base_path}login?sso_error=discovery_failed", 302
            )

        state = new_state()
        nonce = new_nonce()
        pkce = pkce_pair()
        next_path = safe_next_path(next, settings.ui_base_path)
        db.create_auth_state(
            state=state,
            provider_id=record.id,
            code_verifier=pkce.verifier,
            nonce=nonce,
            next_path=next_path,
            preview=preview,
        )

        hosted_domain = None
        if record.require_hosted_domain and len(record.allowed_email_domains) == 1:
            hosted_domain = record.allowed_email_domains[0]
        url = authorize_url(
            discovery,
            client_id=record.client_id,
            scopes=record.scopes,
            redirect_uri=settings.callback_url,
            state=state,
            nonce=nonce,
            code_challenge=pkce.challenge,
            hosted_domain=hosted_domain,
        )
        redirect = RedirectResponse(url, 302)
        redirect.set_cookie(
            settings.state_cookie,
            state,
            max_age=settings.state_ttl_seconds,
            **_cookie_kwargs(settings, samesite="lax", http_only=True),
        )
        if not preview:
            # The SSO identity supersedes any local Pulp login in this browser.
            clear_pulp_session(redirect, settings)
        return redirect

    @router.get("/callback")
    async def callback(
        request: Request,
        pulp: PulpClient = Depends(pulp_dep),
        code: str | None = Query(default=None),
        state: str | None = Query(default=None),
        error: str | None = Query(default=None),
    ) -> RedirectResponse:
        if error:
            return _login_error(settings, error)
        if not code or not state:
            return _login_error(settings, "invalid_callback")
        if not hmac.compare_digest(request.cookies.get(settings.state_cookie, ""), state):
            return _login_error(settings, "state_mismatch")

        pending = db.pop_auth_state(state, settings.state_ttl_seconds)
        if pending is None:
            return _login_error(settings, "state_expired")

        record = db.get_provider(pending["provider_id"])
        if record is None or not record.enabled:
            return _login_error(settings, "unknown_provider")

        try:
            secret = read_secret(settings.secrets_dir, record.secret_file)
            discovery = await discover(
                record.issuer, timeout=settings.http_timeout, verify=settings.verify_tls
            )
            tokens = await exchange_code(
                discovery,
                client_id=record.client_id,
                client_secret=secret,
                code=code,
                redirect_uri=settings.callback_url,
                code_verifier=pending["code_verifier"],
                timeout=settings.http_timeout,
                verify=settings.verify_tls,
            )
            claims = validate_id_token(
                tokens["id_token"],
                discovery,
                client_id=record.client_id,
                nonce=pending["nonce"],
                allowed_tenants=record.allowed_tenants,
            )
        except (OidcError, SecretError) as exc:
            _logger.warning("login failed for provider %s: %s", record.id, exc)
            return _login_error(settings, "provider_error")

        try:
            provider_list = db.list_providers(enabled_only=True)
            dynamic_scopes = dynamic_group_scopes(db)
            if pending.get("preview"):
                claims = await _enrich_group_claims(settings, record, claims, tokens)
                preview = await preview_reconcile(
                    pulp,
                    record,
                    claims,
                    managed_group=settings.managed_group,
                    admin_group=settings.admin_group,
                    superadmin_group=settings.superadmin_group,
                    providers=provider_list,
                    protected_groups=settings.protected_groups,
                    baseline_excluded_groups=tuple(
                        group
                        for group in (settings.admin_group, settings.superadmin_group)
                        if group
                    ),
                    scoped_group_roles=dynamic_scopes,
                )
                return _preview_response(settings, record, claims, preview)
            claims = await _enrich_group_claims(settings, record, claims, tokens)
            result = await reconcile(
                pulp,
                record,
                claims,
                managed_group=settings.managed_group,
                admin_group=settings.admin_group,
                superadmin_group=settings.superadmin_group,
                providers=provider_list,
                protected_groups=settings.protected_groups,
                baseline_excluded_groups=tuple(
                    group
                    for group in (settings.admin_group, settings.superadmin_group)
                    if group
                ),
                scoped_group_roles=dynamic_scopes,
            )
        except IdentityError as exc:
            _logger.warning("login rejected for provider %s: %s", record.id, exc)
            if pending.get("preview"):
                return _preview_error(settings, record, exc.code, str(exc))
            return _login_error(settings, exc.code)
        except (PulpError, OidcError) as exc:
            _logger.warning("provisioning failed for provider %s: %s", record.id, exc)
            if pending.get("preview"):
                return _preview_error(settings, record, "provisioning_failed", str(exc))
            return _login_error(settings, "provisioning_failed")

        try:
            db.upsert_identity_assertion(
                provider_id=record.id,
                subject=str(claims.get("sub") or "") or result.username,
                username=result.username,
                groups=claim_values(claims, record.group_claim_path),
                roles=claim_values(claims, record.role_claim_path),
            )
        except Exception:
            _logger.exception("failed to record the identity assertion")

        token = new_token()
        db.create_session(
            token_hash=hash_token(token),
            username=result.username,
            provider_id=record.id,
            subject=str(claims.get("sub") or "") or None,
            id_token=cipher.encrypt(tokens.get("id_token")),
            expires_at=time.time() + settings.session_ttl_seconds,
        )

        redirect = RedirectResponse(pending["next_path"], 302)
        redirect.set_cookie(
            settings.session_cookie,
            token,
            max_age=settings.session_ttl_seconds,
            **_cookie_kwargs(settings, samesite="strict", http_only=True),
        )
        redirect.delete_cookie(
            settings.state_cookie, path="/", secure=settings.cookie_secure
        )
        clear_pulp_session(redirect, settings)
        return redirect

    @router.post("/logout")
    async def logout(request: Request) -> JSONResponse:
        require_csrf(request)
        session = session_for(request)
        redirect_url = f"{settings.ui_base_path}login"

        if session is not None:
            db.delete_session(hash_token(request.cookies.get(settings.session_cookie, "")))
            id_token = cipher.decrypt(session.id_token)
            if session.provider_id and id_token:
                record = db.get_provider(session.provider_id)
                if record is not None:
                    try:
                        discovery = await discover(
                            record.issuer,
                            timeout=settings.http_timeout,
                            verify=settings.verify_tls,
                        )
                        candidate = end_session_url(
                            discovery,
                            id_token=id_token,
                            post_logout_redirect=f"{settings.external_base_url}{settings.ui_base_path}login",
                        )
                        redirect_url = candidate or redirect_url
                    except OidcError as exc:
                        _logger.warning("end-session lookup failed: %s", exc)

        response = JSONResponse({"redirectUrl": redirect_url})
        # A __Host- prefixed cookie is only replaceable by a Set-Cookie that is
        # itself Secure, so an unqualified delete would leave the stale cookie
        # in the browser.
        response.delete_cookie(
            settings.session_cookie, path="/", secure=settings.cookie_secure
        )
        clear_pulp_session(response, settings)
        return response

    @router.get("/session")
    async def session_info(
        request: Request, pulp: PulpClient = Depends(pulp_dep)
    ) -> JSONResponse:
        session = session_for(request)
        if session is None:
            raise HTTPException(status_code=401, detail="not signed in")
        provider = (
            db.get_provider(session.provider_id) if session.provider_id else None
        )
        if provider is None or not provider.enabled:
            raise HTTPException(status_code=401, detail="provider is disabled")
        # Reuse the CSRF cookie so an admin write token fetched earlier stays
        # valid. Rotating on every read raced the SPA's cached token.
        csrf = request.cookies.get(settings.csrf_cookie)
        issue_cookie = not csrf
        if not csrf:
            csrf = new_token()
        is_staff = False
        is_superuser = False
        repository_prns: set[str] = set()
        try:
            user = await pulp.get_user(session.username)
            if user:
                is_staff = bool(user.get("is_staff"))
                is_superuser = await pulp.is_superadmin(
                    session.username, settings.superadmin_group
                )
                groups = {group.get("name") for group in user.get("groups") or []}
                dynamic = dynamic_group_scopes(db)
                repository_prns = repository_prns_for_provider(
                    provider, dynamic, groups
                )
        except PulpError as exc:
            _logger.warning("session staff lookup failed: %s", exc)
        payload = {
            "username": session.username,
            "providerId": session.provider_id,
            "expiresAt": session.expires_at,
            # Pulp only lets staff read their own full user record, so the
            # fallback record cannot carry is_staff. The gateway supplies it.
            "isStaff": is_staff,
            "isSuperuser": is_superuser,
            "repositoryPrns": sorted(repository_prns),
            "capabilities": {
                "isSuperuser": is_superuser,
                "isStaff": is_staff,
                "manageSso": is_superuser,
                "repositoryAdmin": bool(repository_prns),
                "repositoryWrite": is_superuser or bool(repository_prns),
                "tasksRead": is_superuser or not bool(repository_prns),
                "operationsRead": is_superuser or (is_staff and not repository_prns),
                "importExportRead": is_superuser or is_staff,
                "signingRead": is_superuser or (is_staff and not repository_prns),
                "contentRead": is_superuser or bool(repository_prns),
            },
            # The SPA needs this to sign out; the cookie alone is not readable
            # by scripts when the __Host- prefix is in play.
            "csrfToken": csrf,
        }
        response = JSONResponse(payload)
        if issue_cookie:
            response.set_cookie(
                settings.csrf_cookie,
                csrf,
                max_age=settings.session_ttl_seconds,
                **_cookie_kwargs(settings, samesite="strict", http_only=False),
            )
        return response

    # --- forwardAuth --------------------------------------------------------

    @router.api_route(
        "/auth",
        methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )
    async def forward_auth(request: Request) -> Response:
        session = session_for(request)
        if session is None:
            if settings.additive_mode:
                return Response(status_code=200)
            return Response(status_code=401)
        provider = (
            db.get_provider(session.provider_id) if session.provider_id else None
        )
        if provider is None or not provider.enabled:
            # A disabled or deleted provider must stop issuing identities even
            # for sessions created before the change.
            if settings.additive_mode:
                return Response(status_code=200)
            return Response(status_code=401)

        if request.method not in SAFE_METHODS:
            try:
                require_origin(request)
            except HTTPException:
                return Response(status_code=403)

        return Response(
            status_code=200,
            headers={HEADER_NAME: identity_header_value(session.username)},
        )

    # --- administration -----------------------------------------------------

    @router.get("/admin/csrf")
    async def admin_csrf(_: str = Depends(require_superadmin)) -> JSONResponse:
        """Issue a CSRF token for admin writes.

        Separate from ``/sso/session`` so a local Pulp administrator, who has no
        gateway session, can still manage providers.
        """

        csrf = new_token()
        response = JSONResponse({"csrfToken": csrf})
        response.set_cookie(
            settings.csrf_cookie,
            csrf,
            max_age=settings.session_ttl_seconds,
            **_cookie_kwargs(settings, samesite="strict", http_only=False),
        )
        return response

    @router.get("/admin/providers")
    async def admin_list_providers(_: str = Depends(require_superadmin)) -> list[dict[str, Any]]:
        return [p.to_admin() for p in db.list_providers()]

    @router.post("/admin/providers")
    async def admin_create_provider(
        payload: ProviderPayload,
        request: Request,
        admin: str = Depends(require_superadmin),
        pulp: PulpClient = Depends(pulp_dep),
    ) -> dict[str, Any]:
        require_csrf(request)
        if payload.id is None:
            raise HTTPException(status_code=400, detail="id is required")
        raw = payload.model_dump(exclude_none=True)
        try:
            values = store.validate_provider_payload(
                raw,
                require_id=True,
                allow_http_issuers=settings.allow_http_issuers,
            )
        except store.StoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        roles_result = await _ensure_roles(pulp, values)
        await _validate_provider_references(pulp, values)
        try:
            provider = db.create_provider(
                raw,
                allow_http_issuers=settings.allow_http_issuers,
            )
        except store.StoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        db.record_provider_audit(
            actor=admin,
            action="create",
            provider_id=provider.id,
            detail=f"kind={provider.kind} issuer={provider.issuer}",
        )
        return {**provider.to_admin(), **roles_result}

    @router.patch("/admin/providers/{provider_id}")
    async def admin_update_provider(
        provider_id: str,
        payload: ProviderUpdatePayload,
        request: Request,
        admin: str = Depends(require_superadmin),
        pulp: PulpClient = Depends(pulp_dep),
    ) -> dict[str, Any]:
        require_csrf(request)
        existing = db.get_provider(provider_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="provider not found")
        raw = payload.model_dump(exclude_none=True)
        try:
            values = store.validate_provider_payload(
                {**existing.to_admin(), **raw, "id": provider_id},
                require_id=False,
                allow_http_issuers=settings.allow_http_issuers,
            )
        except store.StoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        roles_result = await _ensure_roles(pulp, values)
        await _validate_provider_references(pulp, values)
        try:
            provider = db.update_provider(
                provider_id,
                raw,
                allow_http_issuers=settings.allow_http_issuers,
            )
        except store.StoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        db.record_provider_audit(
            actor=admin,
            action="update",
            provider_id=provider.id,
            detail=", ".join(sorted(raw)),
        )
        await _revoke_group_roles(
            pulp,
            collect_declared_group_roles([existing]),
            collect_declared_group_roles(db.list_providers(enabled_only=True)),
        )
        return {**provider.to_admin(), **roles_result}

    @router.delete("/admin/providers/{provider_id}")
    async def admin_delete_provider(
        provider_id: str,
        request: Request,
        admin: str = Depends(require_superadmin),
        pulp: PulpClient = Depends(pulp_dep),
    ) -> dict[str, bool]:
        require_csrf(request)
        existing = db.get_provider(provider_id)
        deleted = db.delete_provider(provider_id)
        if deleted:
            db.delete_identity_assertions(provider_id)
            db.delete_sessions_for_provider(provider_id)
            db.record_provider_audit(
                actor=admin,
                action="delete",
                provider_id=provider_id,
            )
            await _revoke_group_roles(
                pulp,
                collect_declared_group_roles([existing] if existing else []),
                collect_declared_group_roles(db.list_providers(enabled_only=True)),
            )
        return {"deleted": deleted}

    @router.get("/admin/audit")
    async def admin_audit(
        limit: int = Query(default=50, ge=1, le=200),
        _: str = Depends(require_superadmin),
    ) -> list[dict[str, Any]]:
        return db.list_provider_audit(limit=limit)

    @router.get("/admin/audit/export")
    async def admin_audit_export(
        _: str = Depends(require_superadmin),
    ) -> PlainTextResponse:
        rows = db.list_provider_audit(limit=200)
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow(["id", "actor", "action", "providerId", "detail", "createdAt"])
        for row in rows:
            writer.writerow(
                [
                    _csv_safe(str(row.get("id", ""))),
                    _csv_safe(str(row.get("actor", ""))),
                    _csv_safe(str(row.get("action", ""))),
                    _csv_safe(str(row.get("providerId", ""))),
                    _csv_safe(str(row.get("detail", ""))),
                    _csv_safe(str(row.get("createdAt", ""))),
                ]
            )
        return PlainTextResponse(
            buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="tangerine-provider-audit.csv"'},
        )

    @router.post("/admin/providers/{provider_id}/test")
    async def admin_test_provider(
        provider_id: str, request: Request, _: str = Depends(require_superadmin)
    ) -> dict[str, Any]:
        require_csrf(request)
        record = db.get_provider(provider_id)
        if record is None:
            raise HTTPException(status_code=404, detail="provider not found")
        secret_readable = True
        try:
            read_secret(settings.secrets_dir, record.secret_file)
        except SecretError:
            secret_readable = False
        try:
            discovery = await discover(
                record.issuer, timeout=settings.http_timeout, verify=settings.verify_tls
            )
        except OidcError as exc:
            return {"ok": False, "detail": str(exc), "secretReadable": secret_readable}
        return {
            "ok": True,
            "issuer": discovery.issuer,
            "issuerMatches": issuer_matches(record.issuer, discovery.issuer),
            "issuerTemplate": "{tenantid}" in discovery.issuer,
            "authorizationEndpoint": discovery.authorization_endpoint,
            "tokenEndpoint": discovery.token_endpoint,
            "endSessionEndpoint": discovery.end_session_endpoint,
            "signingAlgorithms": list(discovery.signing_algorithms),
            "tokenEndpointAuthMethods": list(discovery.token_endpoint_auth_methods),
            "secretReadable": secret_readable,
        }

    @router.get("/admin/discover")
    async def admin_discover(
        issuer: str = Query(...), _: str = Depends(require_superadmin)
    ) -> dict[str, Any]:
        """Lenient discovery for the provider form.

        Unlike login, this returns the discovered issuer even when it differs
        from the value in the field, so the UI can offer to correct it (for
        example a Microsoft tenant domain resolving to a GUID).
        """

        normalized = issuer.strip().rstrip("/")
        if not normalized:
            raise HTTPException(status_code=400, detail="issuer is required")
        if not normalized.startswith("https://") and not normalized.startswith("http://"):
            raise HTTPException(status_code=400, detail="issuer must be an http(s) URL")
        if not normalized.startswith("https://") and not normalized.startswith(
            "http://localhost"
        ):
            if not settings.allow_http_issuers:
                raise HTTPException(status_code=400, detail="issuer must be an https URL")
        try:
            discovery = await discover(
                normalized,
                timeout=settings.http_timeout,
                verify=settings.verify_tls,
                strict=False,
            )
        except OidcError as exc:
            return {"ok": False, "detail": str(exc)}
        return {
            "ok": True,
            "configuredIssuer": normalized,
            "issuer": discovery.issuer,
            "issuerMatches": issuer_matches(normalized, discovery.issuer),
            "issuerTemplate": "{tenantid}" in discovery.issuer,
            "authorizationEndpoint": discovery.authorization_endpoint,
            "tokenEndpoint": discovery.token_endpoint,
            "jwksUri": discovery.jwks_uri,
            "endSessionEndpoint": discovery.end_session_endpoint,
            "signingAlgorithms": list(discovery.signing_algorithms),
            "tokenEndpointAuthMethods": list(discovery.token_endpoint_auth_methods),
        }

    @router.get("/admin/groups")
    async def admin_groups(
        provider: str = Query(...),
        q: str = Query(default=""),
        _: str = Depends(require_superadmin),
    ) -> dict[str, Any]:
        """Group search for the access-rule picker (Google or Microsoft)."""

        record = db.get_provider(provider)
        if record is None:
            raise HTTPException(status_code=404, detail="provider not found")
        query = q.strip()[:100]
        if record.kind == "google":
            if not record.google_service_account_file or not record.google_admin_email:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Google group search requires googleServiceAccountFile "
                        "and googleAdminEmail"
                    ),
                )
            try:
                service_account = read_secret(
                    settings.secrets_dir, record.google_service_account_file
                )
                groups = await list_workspace_groups(
                    service_account,
                    admin_email=record.google_admin_email,
                    query=query,
                    timeout=settings.http_timeout,
                    verify=settings.verify_tls,
                )
            except (SecretError, GoogleGroupsError) as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            return {"groups": groups}
        if record.kind == "azuread":
            try:
                secret = read_secret(settings.secrets_dir, record.secret_file)
                groups = await list_entra_groups(
                    record.client_id,
                    secret,
                    record.issuer,
                    query=query,
                    timeout=settings.http_timeout,
                    verify=settings.verify_tls,
                )
            except (SecretError, GraphError) as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            return {"groups": groups}
        raise HTTPException(
            status_code=400,
            detail="group search is not supported for this provider kind",
        )

    def _service_account_files() -> set[str]:
        return {
            provider.google_service_account_file
            for provider in db.list_providers()
            if provider.google_service_account_file
        }

    def _client_secret_files() -> list[str]:
        excluded = _service_account_files()
        return [
            name
            for name in list_secrets(settings.secrets_dir)
            if name not in excluded
        ]

    @router.get("/admin/secrets/check")
    async def admin_check_secret(
        file: str = Query(...), _: str = Depends(require_superadmin)
    ) -> dict[str, bool]:
        try:
            read_secret(settings.secrets_dir, file)
        except SecretError:
            return {"present": False, "readable": False}
        return {"present": True, "readable": True}

    @router.get("/admin/secrets/status")
    async def admin_secret_status(_: str = Depends(require_superadmin)) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for name in _client_secret_files():
            try:
                read_secret(settings.secrets_dir, name)
                readable = True
            except SecretError:
                readable = False
            try:
                modified = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(Path(settings.secrets_dir, name).stat().st_mtime),
                )
            except OSError:
                modified = None
            result.append({"name": name, "readable": readable, "modifiedAt": modified})
        return result

    @router.get("/admin/secrets")
    async def admin_list_secrets(_: str = Depends(require_superadmin)) -> list[str]:
        return _client_secret_files()

    @router.get("/admin/bootstrap")
    async def admin_bootstrap(_: str = Depends(require_superadmin)) -> dict[str, str]:
        return {
            "settingsBlock": render_settings_block(),
            "applyCommand": render_apply_command(),
            "callbackUrl": settings.callback_url,
            "headerName": HEADER_NAME,
        }

    @router.get("/admin/access-policies")
    async def admin_access_policies(
        _: str = Depends(require_superadmin),
        pulp: PulpClient = Depends(pulp_dep),
    ) -> list[dict[str, Any]]:
        """Read-only status of the SSO administrator access policies."""

        result: list[dict[str, Any]] = []
        try:
            policies = await pulp.access_policies_for(EXPECTED_POLICIES)
        except PulpError as exc:
            raise HTTPException(status_code=502, detail=exc.detail) from exc
        for name, expected in EXPECTED_POLICIES.items():
            record = policies.get(name)
            statements = (record or {}).get("statements")
            result.append(
                {
                    "name": name,
                    "present": record is not None,
                    "customized": bool(record.get("customized")) if record else False,
                    "matchesExpected": policy_matches(statements, expected),
                }
            )
        return result

    @router.get("/admin/diagnostics")
    async def admin_diagnostics(
        request: Request,
        pulp: PulpClient = Depends(pulp_dep),
        _: str = Depends(require_superadmin),
    ) -> dict[str, Any]:
        pulp_reachable = True
        try:
            await pulp.status()
        except PulpError:
            pulp_reachable = False

        header_auth_active = False
        if pulp_reachable:
            header_auth_active = await _probe_header_auth(
                settings, settings.pulp_user, identity_header_value(settings.pulp_user)
            )

        return {
            "pulpReachable": pulp_reachable,
            "headerAuthActive": header_auth_active,
            "additiveMode": settings.additive_mode,
            "allowHttpIssuers": settings.allow_http_issuers,
            "providerCount": db.count_providers(),
            "sessionCount": db.count_sessions(),
            "callbackUrl": settings.callback_url,
            "stripProbe": {
                "headerName": HEADER_NAME,
                "headerValue": identity_header_value(settings.pulp_user),
                "username": settings.pulp_user,
                "endpoint": "/pulp/api/v3/login/",
            },
        }

    @router.get("/admin/diagnostics/client-ip")
    async def admin_client_ip(
        request: Request, _: str = Depends(require_superadmin)
    ) -> dict[str, Any]:
        """Show the forwarded-header chain used by the rate limiter.

        Run this once behind a new proxy so the chosen header can be verified
        before relying on it for per-client throttling.
        """

        forwarded = {
            name: value
            for name, value in request.headers.items()
            if name.startswith("x-forwarded-")
            or name in {"forwarded", "cf-connecting-ip", "x-real-ip"}
        }
        return {
            "socketAddress": request.client.host if request.client else None,
            "socketPort": request.client.port if request.client else None,
            "forwardedHeaders": forwarded,
            "cfConnectingIp": request.headers.get("cf-connecting-ip"),
            "xRealIp": request.headers.get("x-real-ip"),
            "xForwardedFor": request.headers.get("x-forwarded-for"),
            "xForwardedProto": request.headers.get("x-forwarded-proto"),
            "forwarded": request.headers.get("forwarded"),
            "resolvedClientIp": client_ip(request, settings.trusted_proxies),
            "forwardedTrusted": is_trusted_proxy(
                request, settings.trusted_proxies
            ),
            "trustedProxies": settings.trusted_proxies,
            "rateLimitPerMinute": settings.rate_limit_per_minute,
            "rateLimitBurst": settings.rate_limit_burst,
            "rateLimitGlobalPerMinute": settings.rate_limit_global_per_minute,
        }

    @app.get("/healthz")
    async def healthz_root() -> dict[str, str]:
        return {"status": "ok"}

    # --- repository-scoped admin writes -------------------------------------
    from .scope_routes import register_scope_routes

    register_scope_routes(
        router,
        settings=settings,
        db=db,
        session_for=session_for,
        require_csrf=require_csrf,
        pulp_dep=pulp_dep,
    )

    @router.get("/healthz")
    async def healthz_prefixed() -> dict[str, str]:
        return {"status": "ok"}

    async def readiness() -> Response:
        ok = await asyncio.to_thread(db.ping)
        return Response(status_code=200 if ok else 503)

    @app.get("/readyz")
    async def readyz_root() -> Response:
        return await readiness()

    @router.get("/readyz")
    async def readyz_prefixed() -> Response:
        return await readiness()

    app.include_router(router)
    return app


from .preview import (
    _enrich_group_claims,
    _login_error,
    _preview_error,
    _preview_response,
    _probe_header_auth,
    reconcile_assertions,
)

app = create_app()
