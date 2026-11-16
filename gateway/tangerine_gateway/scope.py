"""Repository-scope helpers shared by login, preview, and the admin API."""

from __future__ import annotations

from dataclasses import replace
from typing import Any, Iterable, Mapping

from .claims import IdentityPlan
from .managed_roles import REPOSITORY_ADMIN_ROLE
from .mapping import parse_role_spec
from .rules import access_rules_for
from .store import Provider, Store


def scoped_group_roles(store: Store, *, provider_id: str | None = None) -> dict[str, set[str]]:
    """Return ``group -> role specs`` for dynamic repository scopes."""

    result: dict[str, set[str]] = {}
    for row in store.list_repository_scopes(provider_id=provider_id):
        prn = str(row.get("repositoryPrn") or "").strip()
        group = str(row.get("groupName") or "").strip()
        if not prn or not group:
            continue
        result.setdefault(group, set()).add(f"{REPOSITORY_ADMIN_ROLE}//{prn}")
    return result


def repository_prns_from_roles(roles: Iterable[str]) -> set[str]:
    """Extract repository PRNs from scoped repository-admin role specs."""

    result: set[str] = set()
    for value in roles:
        spec = parse_role_spec(str(value))
        if spec is None or spec.role != REPOSITORY_ADMIN_ROLE:
            continue
        if spec.object_prn:
            result.add(spec.object_prn)
    return result


def repository_prns_for_provider(
    provider: Provider,
    scopes: Mapping[str, Iterable[str]],
    groups: Iterable[str],
) -> set[str]:
    """Union of static rule scopes and dynamic registry scopes for the user."""

    membership = set(groups)
    result: set[str] = set()
    for rule in access_rules_for(provider):
        if rule.group not in membership:
            continue
        result |= repository_prns_from_roles(rule.roles)
        result |= repository_prns_from_roles(scopes.get(rule.group, ()))
    return result


def apply_scoped_roles(
    identity: IdentityPlan, scopes: Mapping[str, Iterable[str]]
) -> IdentityPlan:
    """Add dynamic scoped roles to groups the current login actually joins."""

    if not scopes:
        return identity
    group_roles = {group: set(roles) for group, roles in identity.group_roles.items()}
    changed = False
    for group, roles in scopes.items():
        if group not in identity.desired_groups:
            continue
        extra = set(roles)
        if not extra:
            continue
        current = group_roles.setdefault(group, set())
        if not extra.issubset(current):
            current |= extra
            changed = True
    if not changed:
        return identity
    return replace(
        identity,
        group_roles={group: frozenset(roles) for group, roles in group_roles.items()},
        declared_groups=frozenset(set(identity.declared_groups) | set(group_roles)),
    )


def scope_rows_for_groups(
    store: Store, groups: Iterable[str], *, provider_id: str | None = None
) -> list[dict[str, Any]]:
    wanted = set(groups)
    return [
        row
        for row in store.list_repository_scopes(provider_id=provider_id)
        if row.get("groupName") in wanted
    ]
