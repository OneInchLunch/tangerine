import asyncio

from tangerine_gateway.managed_roles import (
    ADMIN_READ_ROLE,
    ADMIN_ROLE,
    MAINTAINER_ROLE,
    REPOSITORY_ADMIN_ROLE,
    VIEWER_ROLE,
    build_role_permissions,
    ensure_managed_roles,
)


ROLES = [
    {
        "name": "file.filerepository_viewer",
        "permissions": ["file.view_filerepository"],
    },
    {
        "name": "file.filerepository_owner",
        "permissions": [
            "file.change_filerepository",
            "file.delete_filerepository",
            "file.manage_roles_filerepository",
            "file.sync_filerepository",
            "file.view_filerepository",
        ],
    },
    {"name": "core.task_viewer", "permissions": ["core.view_task"]},
    {"name": "core.task_owner", "permissions": ["core.change_task", "core.delete_task"]},
    {"name": "core.group_viewer", "permissions": ["core.view_group"]},
    {"name": "core.group_owner", "permissions": ["core.change_group", "core.view_group"]},
]


class FakePulp:
    def __init__(self, roles, existing=()):
        self.roles = roles
        self.existing = set(existing)
        self.created: list[tuple[str, list[str]]] = []
        self.updated: list[tuple[str, list[str]]] = []

    async def list_roles(self):
        return self.roles

    async def create_role(self, name, permissions, description):
        self.created.append((name, permissions))
        return {"name": name, "permissions": permissions, "description": description}

    async def update_role(self, role_href, permissions):
        self.updated.append((role_href, permissions))
        return {"pulp_href": role_href, "permissions": permissions}


def test_build_role_permissions_uses_installed_plugin_roles():
    permissions = build_role_permissions(ROLES)

    assert "file.view_filerepository" in permissions[VIEWER_ROLE]
    assert "core.view_task" in permissions[VIEWER_ROLE]
    # Group permissions are not part of the viewer tier.
    assert "core.view_group" not in permissions[VIEWER_ROLE]

    assert "file.sync_filerepository" in permissions[MAINTAINER_ROLE]
    assert "file.manage_roles_filerepository" not in permissions[MAINTAINER_ROLE]
    assert "core.view_pulpexporter" in permissions[MAINTAINER_ROLE]
    assert "core.add_pulpimporter" in permissions[MAINTAINER_ROLE]
    assert "core.view_distribution" in permissions[ADMIN_READ_ROLE]
    assert "file.view_filerepository" not in permissions[ADMIN_READ_ROLE]
    assert "core.view_task" not in permissions[ADMIN_READ_ROLE]
    assert "core.view_taskschedule" not in permissions[ADMIN_READ_ROLE]
    # Repository writes go through the gateway's scoped endpoints, so the role
    # keeps read/sync/scan but not direct add/change/delete/modify permissions.
    assert "file.view_filerepository" in permissions[REPOSITORY_ADMIN_ROLE]
    assert "file.sync_filerepository" in permissions[REPOSITORY_ADMIN_ROLE]
    assert "file.change_filerepository" not in permissions[REPOSITORY_ADMIN_ROLE]
    assert "file.delete_filerepository" not in permissions[REPOSITORY_ADMIN_ROLE]
    assert "file.add_filerepository" not in permissions[REPOSITORY_ADMIN_ROLE]
    assert "file.manage_roles_filerepository" not in permissions[REPOSITORY_ADMIN_ROLE]
    assert "core.view_task" in permissions[VIEWER_ROLE]
    assert "core.view_taskschedule" not in permissions[VIEWER_ROLE]

    assert "file.manage_roles_filerepository" in permissions[ADMIN_ROLE]
    assert "core.change_group" in permissions[ADMIN_ROLE]
    assert "core.change_task" in permissions[ADMIN_ROLE]
    assert "auth.view_user" in permissions[ADMIN_ROLE]
    assert "core.view_role" in permissions[ADMIN_ROLE]
    assert "core.view_signingservice" in permissions[ADMIN_ROLE]


def test_ensure_managed_roles_creates_only_missing_roles():
    pulp = FakePulp([role for role in ROLES if role["name"] != VIEWER_ROLE])

    created = asyncio.run(ensure_managed_roles(pulp))

    assert created == [VIEWER_ROLE, MAINTAINER_ROLE, ADMIN_ROLE, ADMIN_READ_ROLE, REPOSITORY_ADMIN_ROLE]
    assert [name for name, _ in pulp.created] == [
        VIEWER_ROLE,
        MAINTAINER_ROLE,
        ADMIN_ROLE,
        ADMIN_READ_ROLE,
        REPOSITORY_ADMIN_ROLE,
    ]


def test_ensure_managed_roles_tolerates_missing_plugin_roles():
    pulp = FakePulp([{"name": "core.task_viewer", "permissions": ["core.view_task"]}])

    created = asyncio.run(ensure_managed_roles(pulp))

    assert created == [VIEWER_ROLE, MAINTAINER_ROLE, ADMIN_ROLE, ADMIN_READ_ROLE, REPOSITORY_ADMIN_ROLE]
    assert pulp.created[0][1] == ["core.view_task"]


def test_ensure_managed_roles_updates_an_outdated_role():
    existing = {
        "name": ADMIN_ROLE,
        "pulp_href": "/pulp/api/v3/roles/admin/",
        "permissions": [],
    }
    pulp = FakePulp([existing])

    created = asyncio.run(ensure_managed_roles(pulp))

    assert set(created) == {
        VIEWER_ROLE,
        MAINTAINER_ROLE,
        ADMIN_ROLE,
        ADMIN_READ_ROLE,
        REPOSITORY_ADMIN_ROLE,
    }
    assert any(href == "/pulp/api/v3/roles/admin/" for href, _ in pulp.updated)
