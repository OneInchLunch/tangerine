"""Directory snapshots for scheduled SSO deprovision/reactivation."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from . import store
from .google_groups import GoogleGroupsError, list_group_members
from .graph import GraphError, list_app_assignment_users
from .oidc import OidcError, username_from_claims
from .pulp import PulpClient, PulpError
from .secrets import SecretError, read_secret
from .settings import Settings
from .store import Provider


class DirectoryError(RuntimeError):
    """Raised when an IdP directory snapshot cannot be built safely."""


def _username_from_identity(provider: Provider, value: str, *, key: str) -> str:
    claim = provider.username_claim or key
    if claim not in {key, "email", "preferred_username", "upn"}:
        raise DirectoryError(
            "directory sync needs a username claim that can be derived from "
            f"userPrincipalName or email, not {claim!r}"
        )
    try:
        return username_from_claims(
            {claim: value},
            claim=claim,
            prefix=provider.username_prefix,
            require_email_verified=False,
        )
    except OidcError as exc:
        raise DirectoryError(str(exc)) from exc


def _google_group_keys(provider: Provider) -> list[str]:
    keys = {str(key) for key in provider.group_map if key}
    for rule in provider.access_rules:
        if rule.get("claim") == "groups":
            match = str(rule.get("match") or "")
            if "@" in match:
                keys.add(match)
    return sorted(keys)


async def directory_usernames(
    provider: Provider,
    *,
    settings: Settings,
    timeout: float = 20.0,
    transport: Any | None = None,
) -> set[str]:
    """Return Pulp usernames authorized by the provider's directory/app."""

    try:
        secret = read_secret(settings.secrets_dir, provider.secret_file)
    except SecretError as exc:
        raise DirectoryError(str(exc)) from exc

    if provider.kind == "azuread":
        try:
            upns = await list_app_assignment_users(
                provider.client_id,
                secret,
                provider.issuer,
                timeout=timeout,
                verify=settings.verify_tls,
                transport=transport,
            )
        except GraphError as exc:
            raise DirectoryError(str(exc)) from exc
        return {
            _username_from_identity(provider, upn, key="preferred_username")
            for upn in upns
        }

    if provider.kind == "google":
        if not provider.google_service_account_file or not provider.google_admin_email:
            raise DirectoryError(
                "Google directory sync requires googleServiceAccountFile and googleAdminEmail"
            )
        try:
            service_account = read_secret(
                settings.secrets_dir, provider.google_service_account_file
            )
        except SecretError as exc:
            raise DirectoryError(str(exc)) from exc
        groups = _google_group_keys(provider)
        if not groups:
            raise DirectoryError(
                "Google directory sync requires mapped groups in groupMap or access rules"
            )
        users: set[str] = set()
        for group in groups:
            try:
                members = await list_group_members(
                    service_account,
                    admin_email=provider.google_admin_email,
                    group_email=group,
                    timeout=timeout,
                    verify=settings.verify_tls,
                    transport=transport,
                )
            except GoogleGroupsError as exc:
                raise DirectoryError(str(exc)) from exc
            users.update(
                _username_from_identity(provider, email, key="email") for email in members
            )
        return users

    raise DirectoryError(f"directory sync is not supported for provider kind {provider.kind!r}")


def _declared_group_names(
    settings: Settings, providers: Iterable[Provider]
) -> set[str]:
    """Groups this deployment manages, derived from enabled provider config.

    The old heuristic (``sso-users`` plus any ``tangerine-`` prefix) removed
    hand-made groups that happened to match the prefix. Use what the enabled
    providers actually declare instead: access rules, legacy group maps, the
    baseline, and the configured tier groups. The marker group is never
    removed.
    """

    names: set[str] = set()
    if settings.admin_group:
        names.add(settings.admin_group)
    if settings.superadmin_group:
        names.add(settings.superadmin_group)
    for provider in providers:
        if provider.baseline_group:
            names.add(provider.baseline_group)
        for group in provider.group_map.values():
            if group:
                names.add(str(group))
        for rule in provider.access_rules:
            group = str(rule.get("group") or "")
            if group:
                names.add(group)
    names.discard(settings.managed_group)
    return names


def _sso_groups(
    declared: set[str], user: Mapping[str, Any]
) -> list[str]:
    groups = [group.get("name") for group in user.get("groups") or []]
    return [name for name in groups if name and name in declared]


def _managed_role_names(providers: Iterable[Provider]) -> list[str]:
    names: set[str] = set()
    for provider in providers:
        specs = (
            list(provider.role_map.values())
            + list(provider.baseline_roles)
            + [
                role
                for rule in provider.access_rules
                for role in rule.get("roles") or []
            ]
        )
        for spec in specs:
            names.add(str(spec).split("/", 1)[0])
    return sorted(name for name in names if name)



async def apply_directory(
    *,
    settings: Settings,
    backend: store.Store,
    pulp: PulpClient,
    authorized: set[str],
    apply: bool,
    provider_id: str | None = None,
) -> dict[str, int]:
    """Disable unauthorized SSO users and reactivate authorized returning users."""

    managed = settings.managed_group
    if not managed:
        raise DirectoryError("TANGERINE_MANAGED_GROUP is required")
    providers = backend.list_providers(enabled_only=True)
    role_names = _managed_role_names(providers)
    declared_groups = _declared_group_names(settings, providers)
    users = await pulp.list_users()
    provider_usernames: set[str] | None = None
    if provider_id is not None:
        # Only users that have logged in through this provider are candidates;
        # a Microsoft directory snapshot must not deprovision Google accounts.
        provider_usernames = {
            assertion.username
            for assertion in backend.list_identity_assertions_for_provider(provider_id)
        }
    members_by_group: dict[str, set[str]] = {}
    for user in users:
        username = str(user.get("username") or "")
        groups = {group.get("name") for group in user.get("groups") or []}
        if not username or managed not in groups:
            continue
        for name in _sso_groups(declared_groups, user):
            members_by_group.setdefault(name, set()).add(username)
    deprovisioned = 0
    reactivated = 0
    for user in users:
        username = str(user.get("username") or "")
        if not username:
            continue
        if provider_usernames is not None and username not in provider_usernames:
            continue
        groups = {group.get("name") for group in user.get("groups") or []}
        if managed not in groups:
            continue
        user_href = str(user.get("pulp_href") or "")
        is_active = bool(user.get("is_active", True))
        if username in authorized:
            if not is_active:
                print(f"would reactivate {username}")
                if apply and user_href:
                    await pulp.set_user_active(user_href, True)
                    reactivated += 1
            continue
        sso_groups = _sso_groups(declared_groups, user)
        print(f"would deprovision {username}: groups={sorted(sso_groups)}")
        if not apply:
            continue
        user_id = user.get("id")
        for name in sso_groups:
            group = await pulp.get_group(name)
            href = (group or {}).get("pulp_href")
            if href and user_id is not None:
                try:
                    await pulp.remove_group_member(href, user_id)
                except PulpError as exc:
                    print(f"  remove group {name}: {exc.detail}")
            remaining = members_by_group.get(name, set())
            remaining.discard(username)
            if not remaining:
                print(f"  would remove repository scopes for group {name}")
                backend.delete_repository_scopes_for_group(
                    group_name=name, provider_id=provider_id
                )
        for assignment in await pulp.user_role_assignments(user_href, role_names):
            href = assignment.get("pulp_href")
            if href:
                try:
                    await pulp.delete_user_role(href)
                except PulpError as exc:
                    print(f"  remove user role: {exc.detail}")
        if user_href:
            await pulp.set_user_active(user_href, False)
        backend.delete_sessions_for_username(username)
        deprovisioned += 1
    return {
        "deprovisioned": deprovisioned,
        "reactivated": reactivated,
        "apply": int(apply),
    }
