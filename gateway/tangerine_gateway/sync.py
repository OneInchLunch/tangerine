"""Reconciliation rules for identity-provider managed group and role state.

The diff is deliberately conservative: only groups and roles named in the
configured map are ever removed. Anything an administrator assigned by hand
stays untouched, which keeps SSO sync idempotent and non-destructive. Strict
mode is opt-in per provider and skips deployment-wide protected groups.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping


@dataclass(frozen=True)
class SyncPlan:
    groups_add: frozenset[str] = frozenset()
    groups_remove: frozenset[str] = frozenset()
    roles_add: frozenset[str] = frozenset()
    roles_remove: frozenset[str] = frozenset()

    @property
    def changed(self) -> bool:
        return bool(self.groups_add or self.groups_remove or self.roles_add or self.roles_remove)

    def as_dict(self) -> dict[str, list[str]]:
        return {
            "groups_added": sorted(self.groups_add),
            "groups_removed": sorted(self.groups_remove),
            "roles_added": sorted(self.roles_add),
            "roles_removed": sorted(self.roles_remove),
        }


@dataclass(frozen=True)
class GroupRolePlan:
    """Role assignments to add or remove on declared Pulp groups."""

    add: Mapping[str, frozenset[str]] = field(default_factory=dict)
    remove: Mapping[str, frozenset[str]] = field(default_factory=dict)

    @property
    def changed(self) -> bool:
        return bool(self.add or self.remove)

    def as_dict(self) -> dict[str, dict[str, list[str]]]:
        return {
            "added": {group: sorted(roles) for group, roles in self.add.items()},
            "removed": {group: sorted(roles) for group, roles in self.remove.items()},
        }


def plan_sync(
    *,
    current_groups: Iterable[str],
    desired_groups: Iterable[str],
    managed_groups: Iterable[str],
    current_roles: Iterable[str],
    desired_roles: Iterable[str],
    managed_roles: Iterable[str],
    strict_groups: bool = False,
    protected_groups: Iterable[str] = (),
    strict_keep_groups: Iterable[str] = (),
) -> SyncPlan:
    """Compute the changes needed to match the identity provider's claims.

    ``strict_keep_groups`` holds groups declared by other enabled providers.
    Strict mode preserves them so signing in through one provider does not
    remove memberships owned by another.
    """

    current_group_set = set(current_groups)
    desired_group_set = set(desired_groups)
    managed_group_set = set(managed_groups)
    keep_group_set = set(strict_keep_groups)

    current_role_set = set(current_roles)
    desired_role_set = set(desired_roles)
    managed_role_set = set(managed_roles)

    if strict_groups:
        # True strict: drop every membership not declared by this login, except
        # groups another enabled provider declares and groups the deployment
        # marked as externally owned.
        groups_remove = (current_group_set - desired_group_set - keep_group_set) - set(
            protected_groups
        )
    else:
        # Only drop membership in groups this integration manages.
        groups_remove = (current_group_set & managed_group_set) - desired_group_set

    return SyncPlan(
        groups_add=frozenset(desired_group_set - current_group_set),
        groups_remove=frozenset(groups_remove),
        roles_add=frozenset(desired_role_set - current_role_set),
        # Likewise for roles: hand-assigned roles must survive.
        roles_remove=frozenset((current_role_set & managed_role_set) - desired_role_set),
    )


def plan_group_roles(
    *,
    declared_group_roles: Mapping[str, Iterable[str]],
    current_group_roles: Mapping[str, Iterable[str]],
    managed_role_keys: Iterable[str],
) -> GroupRolePlan:
    """Diff the roles each declared group should carry.

    Only role specs declared by some enabled provider are removable, so a role
    an administrator assigned by hand on a declared group survives.
    """

    managed = set(managed_role_keys)
    add: dict[str, frozenset[str]] = {}
    remove: dict[str, frozenset[str]] = {}
    for group, desired in declared_group_roles.items():
        wanted = set(desired)
        current = set(current_group_roles.get(group, ()))
        added = wanted - current
        removed = (current & managed) - wanted
        if added:
            add[group] = frozenset(added)
        if removed:
            remove[group] = frozenset(removed)
    return GroupRolePlan(add=add, remove=remove)
