"""Create the Pulp roles used by the SSO access tiers.

The permissions are derived from Pulp's own built-in plugin roles, so the set
follows the installed plugins instead of hardcoding permission names. Missing
roles are created; existing roles are updated when the derived set changes.
"""

from __future__ import annotations

from typing import Any

from .admin_permissions import ADMIN_PERMISSIONS
from .pulp import PulpClient

VIEWER_ROLE = "tangerine-viewer"
MAINTAINER_ROLE = "tangerine-maintainer"
ADMIN_ROLE = "tangerine-admin"
ADMIN_READ_ROLE = "tangerine-admin-read"
REPOSITORY_ADMIN_ROLE = "tangerine-repository-admin"


def _is_repository_write(permission: str) -> bool:
    """Direct repository writes go through the gateway's scoped endpoints.

    Repository-scoped admins keep view, sync, and scan permissions. If they kept
    add/change/delete/modify on repositories, they could bypass the gateway and
    PATCH trust fields (for example ``metadata_signing_service``) directly.
    """
    action = permission.split(".", 1)[-1]
    return action.startswith(("add_", "change_", "delete_", "modify_")) and action.endswith(
        "repository"
    )

MANAGED_ROLE_NAMES = (
    VIEWER_ROLE,
    MAINTAINER_ROLE,
    ADMIN_ROLE,
    ADMIN_READ_ROLE,
    REPOSITORY_ADMIN_ROLE,
)

_DESCRIPTIONS = {
    VIEWER_ROLE: "View repository content and tasks (managed by Tangerine SSO).",
    MAINTAINER_ROLE: "Superadmin tier (managed by Tangerine SSO).",
    ADMIN_ROLE: "Legacy global administrator role (managed by Tangerine SSO).",
    ADMIN_READ_ROLE: "Repository-scoped admin read access (managed by Tangerine SSO).",
    REPOSITORY_ADMIN_ROLE: "Manage assigned repositories (managed by Tangerine SSO).",
}

_CORE_VIEWER_ROLES = ("core.task_viewer",)
_CORE_ADMIN_ROLES = (
    "core.group_owner",
    "core.task_owner",
    "core.taskschedule_owner",
)
_ADMIN_READ_CORE_PERMISSIONS = (
    "core.view_remote",
    "core.view_distribution",
    "core.view_publication",
    "core.view_content",
)
_ADMIN_READ_RESOURCE_KEYWORDS = ("repository", "remote", "distribution", "publication", "content")


def _permissions(role: dict[str, Any]) -> set[str]:
    return {str(permission) for permission in role.get("permissions") or []}


def _union(roles: dict[str, dict[str, Any]], names: tuple[str, ...] | list[str]) -> set[str]:
    found: set[str] = set()
    for name in names:
        role = roles.get(name)
        if role is not None:
            found |= _permissions(role)
    return found


def _repository_roles(roles: dict[str, dict[str, Any]], suffix: str) -> list[dict[str, Any]]:
    return [
        role
        for name, role in roles.items()
        if "repository" in name and name.endswith(suffix)
    ]


def _resource_roles(
    roles: dict[str, dict[str, Any]],
    suffix: str,
    keywords: tuple[str, ...],
) -> list[dict[str, Any]]:
    return [
        role
        for name, role in roles.items()
        if name.endswith(suffix) and any(keyword in name for keyword in keywords)
    ]


def build_role_permissions(roles: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Return the permissions for each managed role, derived from Pulp roles."""

    by_name = {str(role.get("name")): role for role in roles}
    viewer_permissions = _union(by_name, _CORE_VIEWER_ROLES)
    maintainer_permissions = set(viewer_permissions)
    admin_permissions = set(viewer_permissions)
    admin_read_permissions = set(_ADMIN_READ_CORE_PERMISSIONS)
    admin_read_permissions |= {
        permission
        for permission in ADMIN_PERMISSIONS
        if ("export" in permission or "import" in permission)
        and ".view_" in permission
    }
    repository_admin_permissions: set[str] = set()

    for role in _repository_roles(by_name, "_viewer"):
        viewer_permissions |= _permissions(role)
        maintainer_permissions |= _permissions(role)
        admin_permissions |= _permissions(role)

    for role in _resource_roles(
        by_name, "_viewer", _ADMIN_READ_RESOURCE_KEYWORDS
    ):
        admin_read_permissions |= {
            permission
            for permission in _permissions(role)
            # Repository reads come from the object-scoped repository-admin
            # role, so a scoped admin's repository list stays limited to
            # assigned repositories.
            if not permission.endswith("repository")
        }

    for role in _repository_roles(by_name, "_owner"):
        permissions = _permissions(role)
        maintainer_permissions |= {
            permission for permission in permissions if "manage_roles_" not in permission
        }
        admin_permissions |= permissions
        repository_admin_permissions |= {
            permission
            for permission in permissions
            if "manage_roles_" not in permission
            and not _is_repository_write(permission)
        }
    # Repository reads are granted per assigned repository, so the scoped
    # repository list contains only objects the admin may see.
    repository_admin_permissions.add("core.view_repository")

    admin_permissions |= set(ADMIN_PERMISSIONS)
    admin_permissions |= _union(by_name, _CORE_ADMIN_ROLES)
    maintainer_permissions |= _union(by_name, _CORE_VIEWER_ROLES)
    # Import/export is content management: maintainers may run and clean up
    # exporters, exports, importers, and imports. Role-management permissions
    # stay admin-only.
    maintainer_permissions |= {
        permission
        for permission in ADMIN_PERMISSIONS
        if "export" in permission or "import" in permission
    }

    return {
        VIEWER_ROLE: viewer_permissions,
        MAINTAINER_ROLE: maintainer_permissions,
        ADMIN_ROLE: admin_permissions,
        ADMIN_READ_ROLE: admin_read_permissions,
        REPOSITORY_ADMIN_ROLE: repository_admin_permissions,
    }


async def ensure_managed_roles(pulp: PulpClient) -> list[str]:
    """Create missing managed roles. Returns the names that were created."""

    roles = await pulp.list_roles()
    permissions = build_role_permissions(roles)
    existing = {str(role.get("name")): role for role in roles}
    changed: list[str] = []
    for name in MANAGED_ROLE_NAMES:
        desired = sorted(permissions[name])
        current = existing.get(name)
        if current is None:
            await pulp.create_role(name, desired, _DESCRIPTIONS[name])
            changed.append(name)
            continue
        if set(current.get("permissions") or []) != set(desired):
            await pulp.update_role(current["pulp_href"], desired)
            changed.append(name)
    return changed
