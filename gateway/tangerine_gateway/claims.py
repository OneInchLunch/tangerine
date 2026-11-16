"""Turn raw identity-provider claims into a desired Pulp identity."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from .mapping import (
    DEFAULT_GROUP_CLAIM,
    DEFAULT_ROLE_CLAIM,
    AccessRule,
    RoleSpec,
    claim_values,
    managed_role_keys,
    resolve_access_rules,
    resolve_groups,
    resolve_roles,
)


@dataclass(frozen=True)
class SsoConfig:
    """Everything the sync step needs, independent of Django settings."""

    enabled: bool = True
    group_claim: str = DEFAULT_GROUP_CLAIM
    role_claim: str = DEFAULT_ROLE_CLAIM
    group_map: Mapping[str, str] = field(default_factory=dict)
    role_map: Mapping[str, RoleSpec | str] = field(default_factory=dict)
    # Declarative rules: IdP value -> Pulp group, plus roles for that group.
    access_rules: tuple[AccessRule, ...] = ()
    baseline_group: str | None = None
    baseline_roles: tuple[str, ...] = ()
    # Higher tiers do not inherit the viewer baseline.
    baseline_excluded_groups: tuple[str, ...] = ()
    strict_groups: bool = False
    # Group added to every identity-provider account so the UI can mark it.
    managed_group: str | None = None


@dataclass(frozen=True)
class IdentityPlan:
    desired_groups: frozenset[str] = frozenset()
    managed_groups: frozenset[str] = frozenset()
    desired_roles: frozenset[str] = frozenset()
    managed_roles: frozenset[str] = frozenset()
    # Groups whose roles this login owns (rule groups and the baseline group).
    declared_groups: frozenset[str] = frozenset()
    group_roles: Mapping[str, frozenset[str]] = field(default_factory=dict)
    strict: bool = False


EMPTY_PLAN = IdentityPlan()


def build_identity(claims: Mapping[str, Any], config: SsoConfig) -> IdentityPlan:
    """Resolve claims to the groups and roles the user should end up with.

    A claim the provider does not send is not treated as "no groups": removal is
    limited to what the provider actually asserted, so a partial token can never
    strip every managed permission.
    """

    if not config.enabled:
        return EMPTY_PLAN

    group_values = claim_values(claims, config.group_claim)
    groups_asserted = group_values is not None
    desired_groups = resolve_groups(group_values or (), config.group_map)
    managed_groups: set[str] = set()

    if groups_asserted:
        managed_groups |= set(config.group_map.values())

    resolution = resolve_access_rules(
        claims,
        config.access_rules,
        group_claim=config.group_claim,
        role_claim=config.role_claim,
    )
    desired_groups |= set(resolution.desired_groups)
    for rule in config.access_rules:
        if rule.claim == "groups" and resolution.groups_asserted:
            managed_groups.add(rule.group)
        elif rule.claim == "roles" and resolution.roles_asserted:
            managed_groups.add(rule.group)

    if config.baseline_group:
        higher_tier = any(
            group in desired_groups for group in config.baseline_excluded_groups
        )
        if not higher_tier:
            desired_groups.add(config.baseline_group)
        # The baseline stays managed so a promoted user loses it on next login.
        managed_groups.add(config.baseline_group)

    if config.managed_group:
        desired_groups.add(config.managed_group)
        managed_groups.add(config.managed_group)

    group_roles: dict[str, set[str]] = {
        group: set(roles) for group, roles in resolution.group_roles.items()
    }
    if config.baseline_group and config.baseline_group in desired_groups:
        group_roles.setdefault(config.baseline_group, set()).update(config.baseline_roles)

    role_values = claim_values(claims, config.role_claim)
    roles_asserted = role_values is not None
    desired_roles = resolve_roles(role_values or (), config.role_map)
    managed_roles = managed_role_keys(config.role_map) if roles_asserted else set()

    return IdentityPlan(
        desired_groups=frozenset(desired_groups),
        managed_groups=frozenset(managed_groups),
        desired_roles=frozenset(str(spec) for spec in desired_roles),
        managed_roles=frozenset(managed_roles),
        declared_groups=frozenset(group_roles),
        group_roles={group: frozenset(roles) for group, roles in group_roles.items()},
        strict=bool(config.strict_groups and groups_asserted),
    )
