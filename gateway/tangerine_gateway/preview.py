"""Login preview, background reconcile, and header probe helpers.

Extracted from ``main.py``. These helpers take ``Settings`` and the store
explicitly, so they do not depend on the FastAPI app closure.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
from typing import Any, Mapping

import httpx
from fastapi.responses import HTMLResponse, RedirectResponse

from . import store
from .google_groups import GoogleGroupsError, resolve_workspace_groups
from .graph import GraphError, resolve_overage_groups
from .header import HEADER_NAME
from .pulp import PulpClient
from .reconcile import ReconcilePreview, reconcile
from .scope import scoped_group_roles as dynamic_group_scopes
from .secrets import SecretError, read_secret
from .settings import Settings

logger = logging.getLogger(__name__)


def _login_error(settings: Settings, code: str) -> RedirectResponse:
    return RedirectResponse(f"{settings.ui_base_path}login?sso_error={code}", 302)


async def reconcile_assertions(
    settings: Settings, db: store.Store, pulp: PulpClient
) -> dict[str, int]:
    """Replay the last asserted groups and roles for recently active users.

    This repairs manual drift; it does not discover IdP changes. A login updates
    the assertion, and assertions older than the retention window are skipped.
    """

    providers = await asyncio.to_thread(db.list_providers, enabled_only=True)
    by_id = {provider.id: provider for provider in providers}
    assertions = await asyncio.to_thread(
        db.list_identity_assertions,
        max_age_seconds=settings.reconcile_max_age_seconds,
    )
    result = {"checked": 0, "applied": 0, "skipped": 0, "failed": 0}
    for assertion in assertions:
        provider = by_id.get(assertion.provider_id)
        if provider is None:
            result["skipped"] += 1
            continue
        claims: dict[str, Any] = {"sub": assertion.subject}
        if assertion.groups is not None:
            claims[provider.group_claim_path] = assertion.groups
        if assertion.roles is not None:
            claims[provider.role_claim_path] = assertion.roles
        result["checked"] += 1
        try:
            dynamic_scopes = dynamic_group_scopes(db)
            await reconcile(
                pulp,
                provider,
                claims,
                managed_group=settings.managed_group,
                admin_group=settings.admin_group,
                superadmin_group=settings.superadmin_group,
                providers=providers,
                protected_groups=settings.protected_groups,
                baseline_excluded_groups=tuple(
                    group
                    for group in (settings.admin_group, settings.superadmin_group)
                    if group
                ),
                scoped_group_roles=dynamic_scopes,
                username_override=assertion.username,
                check_domain=False,
            )
            result["applied"] += 1
        except Exception:
            logger.exception(
                "background reconcile failed for %s", assertion.username
            )
            result["failed"] += 1
    return result


async def _enrich_group_claims(
    settings: Settings,
    record: store.Provider,
    claims: Mapping[str, Any],
    tokens: Mapping[str, Any],
) -> dict[str, Any]:
    """Fill group claims that the provider omitted, without failing login."""

    enriched = dict(claims)
    if record.fetch_graph_groups:
        claim_names = enriched.get("_claim_names")
        overaged = isinstance(claim_names, dict) and "groups" in claim_names
        access_token = tokens.get("access_token")
        # Fetch when the token has no groups claim at all, not only on overage:
        # an app registration without groupMembershipClaims emits no groups and
        # no overage marker either.
        if "groups" not in enriched and isinstance(access_token, str):
            try:
                enriched["groups"] = await resolve_overage_groups(
                    access_token,
                    timeout=settings.http_timeout,
                    verify=settings.verify_tls,
                )
            except GraphError as exc:
                logger.warning(
                    "Graph group lookup failed (overage=%s): %s", overaged, exc
                )

    if record.fetch_google_groups:
        user_email = enriched.get("email")
        if (
            isinstance(user_email, str)
            and user_email
            and record.google_service_account_file
            and record.google_admin_email
        ):
            try:
                service_account = read_secret(
                    settings.secrets_dir, record.google_service_account_file
                )
                enriched["groups"] = await resolve_workspace_groups(
                    service_account,
                    admin_email=record.google_admin_email,
                    user_email=user_email,
                    timeout=settings.http_timeout,
                    verify=settings.verify_tls,
                )
            except (SecretError, GoogleGroupsError) as exc:
                logger.warning("Google group lookup failed: %s", exc)

    return enriched


def _preview_error(
    settings: Settings, record: store.Provider, code: str, detail: str
) -> HTMLResponse:
    return HTMLResponse(
        _preview_shell(
            settings,
            record,
            "Login preview failed",
            f"<p class='error'>{html.escape(code)}: {html.escape(detail)}</p>"
            "<p class='muted'>No Pulp changes were made.</p>",
        ),
        status_code=400,
    )


def _preview_response(
    settings: Settings,
    record: store.Provider,
    claims: Mapping[str, Any],
    preview: ReconcilePreview,
) -> HTMLResponse:
    safe_claims = {
        key: claims.get(key)
        for key in (
            "sub",
            "preferred_username",
            "upn",
            "email",
            "email_verified",
            "groups",
            "roles",
            "hd",
            "tid",
        )
        if key in claims
    }

    def items(values: list[str]) -> str:
        if not values:
            return "<span class='muted'>none</span>"
        return "<ul>" + "".join(f"<li>{html.escape(value)}</li>" for value in values) + "</ul>"

    if preview.collision:
        status = (
            "<p class='error'><strong>Username collision.</strong> "
            "This existing local account is not in the managed group; login would be "
            "rejected.</p>"
        )
    else:
        status = (
            "<p class='ok'><strong>Login would succeed.</strong> "
            f"Existing account: {'yes' if preview.existing else 'no'}; "
            f"managed: {'yes' if preview.managed else 'no'}.</p>"
        )

    body = f"""
    {status}
    <table>
      <tr><th>Provider</th><td>{html.escape(record.label)}</td></tr>
      <tr><th>Username</th><td><code>{html.escape(preview.username)}</code></td></tr>
      <tr><th>Groups added</th><td>{items(preview.groups_added)}</td></tr>
      <tr><th>Groups removed</th><td>{items(preview.groups_removed)}</td></tr>
      <tr><th>Group roles added</th><td>{items(preview.group_roles_added)}</td></tr>
      <tr><th>Group roles removed</th><td>{items(preview.group_roles_removed)}</td></tr>
      <tr><th>User roles added</th><td>{items(preview.roles_added)}</td></tr>
      <tr><th>User roles removed</th><td>{items(preview.roles_removed)}</td></tr>
      <tr><th>Baseline group</th><td>{html.escape(preview.baseline_group or "none")}</td></tr>
      <tr><th>Strict mode</th><td>{"yes" if preview.strict else "no"}</td></tr>
    </table>
    <h2>ID-token claims</h2>
    <pre>{html.escape(json.dumps(safe_claims, indent=2, sort_keys=True))}</pre>
    <p class="muted">No users, groups, roles, or sessions were created.</p>
    """
    return HTMLResponse(_preview_shell(settings, record, "Login preview", body))


def _preview_shell(
    settings: Settings, record: store.Provider, title: str, body: str
) -> str:
    settings_link = html.escape(f"{settings.ui_base_path}settings")
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 52rem; margin: 3rem auto; padding: 0 1rem;
       color: #18181b; }}
h1 {{ font-size: 1.35rem; }} h2 {{ font-size: 1rem; margin-top: 1.5rem; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ text-align: left; vertical-align: top; padding: .4rem .6rem;
          border-bottom: 1px solid #e4e4e7; }}
th {{ width: 11rem; color: #52525b; }}
code, pre {{ font-family: ui-monospace, monospace; }}
pre {{ background: #fafafa; border: 1px solid #e4e4e7; padding: .75rem; overflow: auto; }}
.error {{ color: #b91c1c; }} .ok {{ color: #15803d; }} .muted {{ color: #71717a; }}
a {{ color: #c2410c; }}
</style></head><body>
<h1>{html.escape(title)}: {html.escape(record.label)}</h1>
{body}
<p><a href="{settings_link}">Back to Settings → SSO</a> ·
<a href="javascript:window.close()">Close</a></p>
</body></html>"""


async def _probe_header_auth(settings: Settings, username: str, value: str) -> bool:
    """Ask Pulp directly whether the identity header authenticates.

    This proves the Pulp side is configured. It cannot prove the edge strips
    inbound copies; the UI runs that check from the browser.
    """

    try:
        async with httpx.AsyncClient(
            base_url=settings.pulp_url, timeout=settings.http_timeout, verify=settings.verify_tls
        ) as client:
            response = await client.get(
                "/pulp/api/v3/login/", headers={HEADER_NAME: value}
            )
    except httpx.HTTPError:
        return False
    if response.status_code != 200:
        return False
    try:
        return (response.json() or {}).get("username") == username
    except ValueError:
        return False


