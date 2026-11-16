"""Provider-to-plan adapters for declarative access rules.

Kept out of :mod:`store` so the persistence layer never imports the identity
planner, and out of :mod:`claims` so the planner stays store-agnostic.
"""

from __future__ import annotations

from typing import Iterable

from .claims import SsoConfig
from .mapping import AccessRule
from .store import Provider


def access_rules_for(provider: Provider) -> tuple[AccessRule, ...]:
    return tuple(
        AccessRule(
            claim=rule["claim"],
            match=rule["match"],
            group=rule["group"],
            roles=tuple(rule.get("roles") or ()),
        )
        for rule in provider.access_rules
    )


def sso_config(
    provider: Provider,
    *,
    managed_group: str | None,
    baseline_excluded_groups: tuple[str, ...] = (),
) -> SsoConfig:
    return SsoConfig(
        group_claim=provider.group_claim_path,
        role_claim=provider.role_claim_path,
        group_map=provider.group_map,
        role_map=provider.role_map,
        access_rules=access_rules_for(provider),
        baseline_group=provider.baseline_group,
        baseline_roles=tuple(provider.baseline_roles),
        baseline_excluded_groups=baseline_excluded_groups,
        strict_groups=provider.strict_groups,
        managed_group=managed_group,
    )


def collect_declared_group_roles(providers: Iterable[Provider]) -> dict[str, set[str]]:
    """Union of group -> role specs declared by every enabled provider."""

    result: dict[str, set[str]] = {}
    for provider in providers:
        for rule in access_rules_for(provider):
            result.setdefault(rule.group, set()).update(rule.roles)
        if provider.baseline_group:
            result.setdefault(provider.baseline_group, set()).update(provider.baseline_roles)
    return result


def declared_groups(providers: Iterable[Provider]) -> set[str]:
    """Groups owned by the listed providers, including legacy group maps.

    Used by strict mode to preserve memberships declared by another provider.
    Legacy ``groupMap`` targets carry no roles, so they stay out of
    :func:`collect_declared_group_roles` and their role assignments are never
    touched by role reconciliation.
    """

    result: set[str] = set()
    for provider in providers:
        result.update(provider.group_map.values())
        for rule in access_rules_for(provider):
            result.add(rule.group)
        if provider.baseline_group:
            result.add(provider.baseline_group)
    return result


def other_declared_groups(
    providers: Iterable[Provider], provider: Provider
) -> set[str]:
    """Groups declared by enabled providers other than ``provider``."""

    return declared_groups(item for item in providers if item.id != provider.id)


def declared_role_keys(providers: Iterable[Provider]) -> set[str]:
    return {
        role
        for roles in collect_declared_group_roles(providers).values()
        for role in roles
    }
