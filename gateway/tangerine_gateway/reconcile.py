"""Apply identity-provider claims to Pulp over its REST API."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

from .claims import build_identity
from .domain_policy import enforce_domain_policy
from .errors import ManagedGroupRequired, UsernameCollision
from .mapping import claim_values
from .oidc import username_from_claims
from .pulp import PulpClient, PulpError, role_key, split_role_key
from .rules import (
    collect_declared_group_roles,
    declared_role_keys,
    other_declared_groups,
    sso_config,
)
from .scope import apply_scoped_roles
from .store import Provider
from .sync import plan_group_roles, plan_sync

_logger = logging.getLogger(__name__)


def _role_names(role_keys: Iterable[str]) -> list[str]:
    return sorted({split_role_key(key)[0] for key in role_keys})


def _flatten_group_roles(mapping: Mapping[str, Iterable[str]]) -> list[str]:
    return [
        f"{group}: {role}"
        for group in sorted(mapping)
        for role in sorted(mapping[group])
    ]


async def _read_group_roles(
    pulp: PulpClient,
    group_hrefs: Mapping[str, str],
    role_names: list[str],
    domain_names: Mapping[str, str],
) -> dict[str, dict[str, str]]:
    """Return ``group -> {role/domain/prn: assignment href}``."""

    current: dict[str, dict[str, str]] = {}
    for group, href in group_hrefs.items():
        if not href:
            current[group] = {}
            continue
        assignments = await pulp.group_role_assignments(href, role_names)
        current[group] = {
            role_key(
                assignment.get("role", ""),
                domain_names.get(assignment.get("domain") or "", ""),
                assignment.get("content_object_prn") or "",
            ): assignment.get("pulp_href", "")
            for assignment in assignments
        }
    return current


@dataclass
class ReconcileResult:
    username: str
    groups_added: list[str] = field(default_factory=list)
    groups_removed: list[str] = field(default_factory=list)
    roles_added: list[str] = field(default_factory=list)
    roles_removed: list[str] = field(default_factory=list)
    group_roles_added: list[str] = field(default_factory=list)
    group_roles_removed: list[str] = field(default_factory=list)
    staff: bool | None = None
    staff_changed: bool = False
    superuser: bool | None = None
    superuser_changed: bool = False
    reactivated: bool = False
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "groupsAdded": self.groups_added,
            "groupsRemoved": self.groups_removed,
            "rolesAdded": self.roles_added,
            "rolesRemoved": self.roles_removed,
            "groupRolesAdded": self.group_roles_added,
            "groupRolesRemoved": self.group_roles_removed,
            "staff": self.staff,
            "staffChanged": self.staff_changed,
            "superuser": self.superuser,
            "superuserChanged": self.superuser_changed,
            "reactivated": self.reactivated,
            "errors": self.errors,
        }


@dataclass
class ReconcilePreview:
    username: str
    existing: bool = False
    managed: bool = False
    collision: bool = False
    groups_added: list[str] = field(default_factory=list)
    groups_removed: list[str] = field(default_factory=list)
    roles_added: list[str] = field(default_factory=list)
    roles_removed: list[str] = field(default_factory=list)
    group_roles_added: list[str] = field(default_factory=list)
    group_roles_removed: list[str] = field(default_factory=list)
    baseline_group: str | None = None
    strict: bool = False
    staff: bool | None = None
    staff_changed: bool = False
    superuser: bool | None = None
    superuser_changed: bool = False
    active: bool = True
    will_reactivate: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "existing": self.existing,
            "managed": self.managed,
            "collision": self.collision,
            "groupsAdded": self.groups_added,
            "groupsRemoved": self.groups_removed,
            "rolesAdded": self.roles_added,
            "rolesRemoved": self.roles_removed,
            "groupRolesAdded": self.group_roles_added,
            "groupRolesRemoved": self.group_roles_removed,
            "baselineGroup": self.baseline_group,
            "strict": self.strict,
            "staff": self.staff,
            "staffChanged": self.staff_changed,
            "superuser": self.superuser,
            "superuserChanged": self.superuser_changed,
            "active": self.active,
            "willReactivate": self.will_reactivate,
        }


def _desired_staff(
    *,
    staff_groups: Iterable[str],
    groups_asserted: bool,
    desired_groups: frozenset[str],
    current_groups: set[str],
    current_staff: bool,
) -> bool:
    """Keep staff in sync with the admin/superadmin groups."""

    groups = tuple(staff_groups)
    if not groups:
        return current_staff
    if any(group in desired_groups for group in groups):
        return True
    if groups_asserted and any(group in current_groups for group in groups):
        return False
    return current_staff


def _desired_superuser(
    *,
    superadmin_group: str | None,
    groups_asserted: bool,
    desired_groups: frozenset[str],
    current_groups: set[str],
    current_superuser: bool,
) -> bool:
    """Keep the superadmin flag in sync without touching local break-glass accounts."""

    if not superadmin_group:
        return current_superuser
    if superadmin_group in desired_groups:
        return True
    if groups_asserted and superadmin_group in current_groups:
        return False
    return current_superuser


async def preview_reconcile(
    pulp: PulpClient,
    provider: Provider,
    claims: Mapping[str, Any],
    *,
    managed_group: str | None,
    admin_group: str | None = None,
    superadmin_group: str | None = None,
    providers: Iterable[Provider] | None = None,
    protected_groups: Iterable[str] = (),
    baseline_excluded_groups: tuple[str, ...] = (),
    scoped_group_roles: Mapping[str, Iterable[str]] | None = None,
) -> ReconcilePreview:
    """Compute what a login would change without writing to Pulp.

    The provider form uses this to show the resolved username, collision status,
    and group/role diff before an administrator enables a real IdP.
    """

    claims = dict(claims)
    enforce_domain_policy(
        claims,
        allowed_domains=provider.allowed_email_domains,
        require_hosted_domain=provider.require_hosted_domain,
    )
    username = username_from_claims(
        claims,
        claim=provider.username_claim,
        prefix=provider.username_prefix,
        require_email_verified=provider.require_email_verified,
    )
    if not managed_group:
        raise ManagedGroupRequired()

    existing = await pulp.get_user(username)
    current_groups: set[str] = set()
    current_roles: set[str] = set()
    user_href = ""
    if existing is not None:
        current_groups = {group.get("name") for group in existing.get("groups") or []}
        user_href = existing.get("pulp_href") or ""
    managed = bool(existing is not None and managed_group in current_groups)
    if existing is not None and not managed:
        return ReconcilePreview(
            username=username,
            existing=True,
            managed=False,
            collision=True,
        )

    config = sso_config(
        provider,
        managed_group=managed_group,
        baseline_excluded_groups=baseline_excluded_groups,
    )
    identity = apply_scoped_roles(
        build_identity(claims, config), scoped_group_roles or {}
    )

    provider_list = list(providers) if providers is not None else [provider]
    declared_group_roles = collect_declared_group_roles(provider_list)
    for group, roles in (scoped_group_roles or {}).items():
        declared_group_roles.setdefault(group, set()).update(roles)
    managed_role_keys = declared_role_keys(provider_list)
    for roles in (scoped_group_roles or {}).values():
        managed_role_keys.update(roles)
    role_names = _role_names(managed_role_keys)
    other_groups = other_declared_groups(provider_list, provider)

    domain_names = await pulp.domain_names()
    managed_role_names = sorted(
        {split_role_key(key)[0] for key in identity.managed_roles}
        | {split_role_key(key)[0] for key in identity.desired_roles}
        | set(role_names)
    )
    if user_href:
        assignments = await pulp.user_role_assignments(user_href, managed_role_names)
    else:
        assignments = []
    for assignment in assignments:
        current_roles.add(
            role_key(
                assignment.get("role", ""),
                domain_names.get(assignment.get("domain") or "", ""),
                assignment.get("content_object_prn") or "",
            )
        )

    plan = plan_sync(
        current_groups=current_groups,
        desired_groups=identity.desired_groups,
        managed_groups=identity.managed_groups,
        current_roles=current_roles,
        desired_roles=identity.desired_roles,
        managed_roles=identity.managed_roles,
        strict_groups=identity.strict,
        protected_groups=protected_groups,
        strict_keep_groups=other_groups,
    )

    group_hrefs: dict[str, str] = {}
    for group in declared_group_roles:
        record = await pulp.get_group(group)
        group_hrefs[group] = (record or {}).get("pulp_href", "")
    current_group_roles = await _read_group_roles(
        pulp, group_hrefs, role_names, domain_names
    )
    group_plan = plan_group_roles(
        declared_group_roles=declared_group_roles,
        current_group_roles={
            group: set(assignments_by_key)
            for group, assignments_by_key in current_group_roles.items()
        },
        managed_role_keys=managed_role_keys,
    )

    current_staff = bool(existing.get("is_staff")) if existing is not None else False
    current_superuser = (
        bool(existing.get("is_superuser")) if existing is not None else False
    )
    active = bool(existing.get("is_active", True)) if existing is not None else True
    staff_groups = tuple(group for group in (admin_group, superadmin_group) if group)
    groups_asserted = claim_values(claims, provider.group_claim_path) is not None
    desired_staff = _desired_staff(
        staff_groups=staff_groups,
        groups_asserted=groups_asserted,
        desired_groups=identity.desired_groups,
        current_groups=current_groups,
        current_staff=current_staff,
    )
    desired_superuser = _desired_superuser(
        superadmin_group=superadmin_group,
        groups_asserted=groups_asserted,
        desired_groups=identity.desired_groups,
        current_groups=current_groups,
        current_superuser=current_superuser,
    )
    return ReconcilePreview(
        username=username,
        existing=existing is not None,
        managed=managed,
        groups_added=sorted(plan.groups_add),
        groups_removed=sorted(plan.groups_remove),
        roles_added=sorted(plan.roles_add),
        roles_removed=sorted(plan.roles_remove),
        group_roles_added=_flatten_group_roles(group_plan.add),
        group_roles_removed=_flatten_group_roles(group_plan.remove),
        baseline_group=provider.baseline_group,
        strict=identity.strict,
        staff=desired_staff,
        staff_changed=desired_staff != current_staff,
        superuser=desired_superuser,
        superuser_changed=desired_superuser != current_superuser,
        active=active,
        will_reactivate=not active,
    )


async def reconcile(
    pulp: PulpClient,
    provider: Provider,
    claims: Mapping[str, Any],
    *,
    managed_group: str | None,
    admin_group: str | None = None,
    superadmin_group: str | None = None,
    providers: Iterable[Provider] | None = None,
    protected_groups: Iterable[str] = (),
    username_override: str | None = None,
    check_domain: bool = True,
    baseline_excluded_groups: tuple[str, ...] = (),
    scoped_group_roles: Mapping[str, Iterable[str]] | None = None,
) -> ReconcileResult:
    """Provision the user and reconcile managed groups and roles.

    Errors are collected rather than raised: a failed group write must not stop
    the user from signing in.
    """

    claims = dict(claims)
    if check_domain:
        enforce_domain_policy(
            claims,
            allowed_domains=provider.allowed_email_domains,
            require_hosted_domain=provider.require_hosted_domain,
        )
    username = username_override or username_from_claims(
        claims,
        claim=provider.username_claim,
        prefix=provider.username_prefix,
        require_email_verified=provider.require_email_verified,
    )
    result = ReconcileResult(username=username)

    if not managed_group:
        raise ManagedGroupRequired()

    existing = await pulp.get_user(username)
    if existing is None:
        user = await pulp.create_user(username)
    else:
        groups = {group.get("name") for group in existing.get("groups") or []}
        if managed_group not in groups:
            raise UsernameCollision(username)
        user = existing

    user_href = user.get("pulp_href") or ""
    user_id = user.get("id")
    if existing is not None and user.get("is_active") is False:
        await pulp.set_user_active(user_href, True)
        user = {**user, "is_active": True}
        result.reactivated = True

    config = sso_config(
        provider,
        managed_group=managed_group,
        baseline_excluded_groups=baseline_excluded_groups,
    )
    identity = apply_scoped_roles(
        build_identity(claims, config), scoped_group_roles or {}
    )

    provider_list = list(providers) if providers is not None else [provider]
    declared_group_roles = collect_declared_group_roles(provider_list)
    for group, roles in (scoped_group_roles or {}).items():
        declared_group_roles.setdefault(group, set()).update(roles)
    managed_role_keys = declared_role_keys(provider_list)
    for roles in (scoped_group_roles or {}).values():
        managed_role_keys.update(roles)
    role_names = _role_names(managed_role_keys)
    other_groups = other_declared_groups(provider_list, provider)

    current_groups = {group.get("name") for group in user.get("groups") or []}
    group_hrefs = {
        group.get("name"): group.get("pulp_href") for group in user.get("groups") or []
    }

    domain_names = await pulp.domain_names()
    managed_role_names = sorted(
        {split_role_key(key)[0] for key in identity.managed_roles}
        | {split_role_key(key)[0] for key in identity.desired_roles}
        | set(role_names)
    )
    assignments = await pulp.user_role_assignments(user_href, managed_role_names)
    current_roles: dict[str, str] = {}
    for assignment in assignments:
        key = role_key(
            assignment.get("role", ""),
            domain_names.get(assignment.get("domain") or "", ""),
            assignment.get("content_object_prn") or "",
        )
        current_roles[key] = assignment.get("pulp_href", "")

    plan = plan_sync(
        current_groups=current_groups,
        desired_groups=identity.desired_groups,
        managed_groups=identity.managed_groups,
        current_roles=current_roles.keys(),
        desired_roles=identity.desired_roles,
        managed_roles=identity.managed_roles,
        strict_groups=identity.strict,
        protected_groups=protected_groups,
        strict_keep_groups=other_groups,
    )

    for name in sorted(plan.groups_add):
        try:
            group = await pulp.ensure_group(name)
            await pulp.add_group_member(group["pulp_href"], username)
            result.groups_added.append(name)
        except PulpError as exc:
            result.errors.append(f"add group {name}: {exc.detail}")

    for name in sorted(plan.groups_remove):
        href = group_hrefs.get(name)
        if not href or user_id is None:
            continue
        try:
            await pulp.remove_group_member(href, user_id)
            result.groups_removed.append(name)
        except PulpError as exc:
            result.errors.append(f"remove group {name}: {exc.detail}")

    # --- group roles --------------------------------------------------------

    declared_hrefs: dict[str, str] = {}
    for group in sorted(declared_group_roles):
        try:
            record = await pulp.ensure_group(group)
            declared_hrefs[group] = record.get("pulp_href", "")
        except PulpError as exc:
            result.errors.append(f"ensure group {group}: {exc.detail}")

    current_group_roles = await _read_group_roles(
        pulp, declared_hrefs, role_names, domain_names
    )
    group_plan = plan_group_roles(
        declared_group_roles=declared_group_roles,
        current_group_roles={
            group: set(assignments_by_key)
            for group, assignments_by_key in current_group_roles.items()
        },
        managed_role_keys=managed_role_keys,
    )

    group_domain_hrefs: dict[str, str] | None = None
    for group in sorted(group_plan.remove):
        for key in sorted(group_plan.remove[group]):
            assignment_href = current_group_roles.get(group, {}).get(key)
            if not assignment_href:
                continue
            try:
                await pulp.delete_group_role(assignment_href)
                result.group_roles_removed.append(f"{group}: {key}")
            except PulpError as exc:
                result.errors.append(f"remove group role {group}:{key}: {exc.detail}")

    for group in sorted(group_plan.add):
        group_href = declared_hrefs.get(group, "")
        if not group_href:
            continue
        for key in sorted(group_plan.add[group]):
            role, domain, prn = split_role_key(key)
            try:
                domain_href = None
                if domain:
                    if group_domain_hrefs is None:
                        group_domain_hrefs = await pulp.domain_hrefs()
                    domain_href = group_domain_hrefs.get(domain)
                    if domain_href is None:
                        result.errors.append(
                            f"add group role {group}:{key}: unknown domain {domain!r}"
                        )
                        continue
                await pulp.add_group_role(
                    group_href,
                    role=role,
                    domain_href=domain_href,
                    prn=prn or None,
                )
                result.group_roles_added.append(f"{group}: {key}")
            except PulpError as exc:
                result.errors.append(f"add group role {group}:{key}: {exc.detail}")

    # --- direct user roles (legacy roleMap) ---------------------------------

    user_domain_hrefs: dict[str, str] | None = None
    for key in sorted(plan.roles_remove):
        href = current_roles.get(key)
        if not href:
            continue
        try:
            await pulp.delete_user_role(href)
            result.roles_removed.append(key)
        except PulpError as exc:
            result.errors.append(f"remove role {key}: {exc.detail}")

    for key in sorted(plan.roles_add):
        role, domain, prn = split_role_key(key)
        try:
            domain_href = None
            if domain:
                if user_domain_hrefs is None:
                    user_domain_hrefs = await pulp.domain_hrefs()
                domain_href = user_domain_hrefs.get(domain)
                if domain_href is None:
                    result.errors.append(f"add role {key}: unknown domain {domain!r}")
                    continue
            await pulp.add_user_role(
                user_href,
                role=role,
                domain_href=domain_href,
                prn=prn or None,
            )
            result.roles_added.append(key)
        except PulpError as exc:
            result.errors.append(f"add role {key}: {exc.detail}")

    current_staff = bool(existing.get("is_staff")) if existing is not None else False
    current_superuser = (
        bool(existing.get("is_superuser")) if existing is not None else False
    )
    staff_groups = tuple(group for group in (admin_group, superadmin_group) if group)
    groups_asserted = claim_values(claims, provider.group_claim_path) is not None
    desired_staff = _desired_staff(
        staff_groups=staff_groups,
        groups_asserted=groups_asserted,
        desired_groups=identity.desired_groups,
        current_groups=current_groups,
        current_staff=current_staff,
    )
    desired_superuser = _desired_superuser(
        superadmin_group=superadmin_group,
        groups_asserted=groups_asserted,
        desired_groups=identity.desired_groups,
        current_groups=current_groups,
        current_superuser=current_superuser,
    )
    if desired_superuser:
        desired_staff = True
    if desired_staff != current_staff and user_href:
        try:
            await pulp.set_user_staff(user_href, desired_staff)
            result.staff = desired_staff
            result.staff_changed = True
        except PulpError as exc:
            result.errors.append(f"set is_staff={desired_staff}: {exc.detail}")
    else:
        result.staff = current_staff
    if desired_superuser != current_superuser and user_href:
        try:
            await pulp.set_user_superuser(user_href, desired_superuser)
            result.superuser = desired_superuser
            result.superuser_changed = True
        except PulpError as exc:
            result.errors.append(
                f"set is_superuser={desired_superuser}: {exc.detail}"
            )
    else:
        result.superuser = current_superuser

    if result.errors:
        _logger.warning("reconcile for %s completed with errors: %s", username, result.errors)
    return result


def claims_from_response(response: Mapping[str, Any]) -> dict[str, Any]:
    """Expose claim extraction for callers that hold a raw token response."""

    from .mapping import extract_claims

    return extract_claims(response)
