import asyncio
from dataclasses import replace

import pytest

from tangerine_gateway.errors import DomainNotAllowed, ManagedGroupRequired, UsernameCollision
from tangerine_gateway.pulp import PulpError
from tangerine_gateway.reconcile import preview_reconcile, reconcile
from tangerine_gateway.store import Provider

USER = {
    "id": 9,
    "username": "alice",
    "pulp_href": "/pulp/api/v3/users/9/",
    "groups": [
        {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
        {"name": "local-ops", "pulp_href": "/pulp/api/v3/groups/2/"},
    ],
}

PROVIDER = Provider(
    id="microsoft",
    label="Microsoft Entra ID",
    kind="azuread",
    issuer="https://login.microsoftonline.com/tenant/v2.0",
    client_id="client",
    secret_file="azure-secret",
    scopes="openid profile email",
    group_claim="groups",
    role_claim="roles",
    group_map={"idp-admins": "pulp-admins"},
    role_map={"idp-admin": "core.repository_admin//"},
)


class FakePulp:
    def __init__(self, *, user=USER, assignments=None, fail_after=None, group_roles=None):
        self.user = user
        self.assignments = assignments or []
        self.fail_after = fail_after
        self.group_roles = group_roles or {}
        self.calls: list[tuple] = []

    def _record(self, *call):
        self.calls.append(call)
        if self.fail_after is not None and len(self.calls) > self.fail_after:
            raise PulpError(500, "boom")

    async def get_user(self, username):
        self.calls.append(("get_user", username))
        return self.user

    async def create_user(self, username):
        self.calls.append(("create_user", username))
        return {
            "id": 10,
            "username": username,
            "pulp_href": "/pulp/api/v3/users/10/",
            "groups": [],
        }

    async def domain_names(self):
        return {}

    async def domain_hrefs(self):
        return {}

    async def user_role_assignments(self, user_href, role_names):
        return self.assignments

    async def get_group(self, name):
        self.calls.append(("get_group", name))
        return {"name": name, "pulp_href": f"/pulp/api/v3/groups/{name}/"}

    async def ensure_group(self, name):
        self.calls.append(("ensure_group", name))
        return {"name": name, "pulp_href": f"/pulp/api/v3/groups/{name}/"}

    async def add_group_member(self, group_href, username):
        self._record("add_group", group_href, username)

    async def remove_group_member(self, group_href, user_id):
        self._record("remove_group", group_href, user_id)

    async def group_role_assignments(self, group_href, role_names):
        self.calls.append(("group_role_assignments", group_href, tuple(role_names)))
        return self.group_roles.get(group_href, [])

    async def add_group_role(self, group_href, *, role, domain_href, prn):
        self._record("add_group_role", group_href, role, domain_href, prn)

    async def delete_group_role(self, href):
        self._record("delete_group_role", href)

    async def delete_user_role(self, href):
        self._record("delete_role", href)

    async def add_user_role(self, user_href, *, role, domain_href, prn):
        self._record("add_role", role, domain_href, prn)

    async def set_user_staff(self, user_href, is_staff):
        self._record("set_staff", user_href, is_staff)

    async def set_user_superuser(self, user_href, is_superuser):
        self._record("set_superuser", user_href, is_superuser)

    async def set_user_active(self, user_href, is_active):
        self._record("set_active", user_href, is_active)


def test_reconcile_adds_mapped_state_and_preserves_unmanaged_state():
    pulp = FakePulp()
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"], "roles": ["idp-admin"]},
            managed_group="sso-managed",
        )
    )

    assert result.username == "alice"
    assert result.errors == []
    assert result.groups_added == ["pulp-admins"]
    # `local-ops` is unmanaged and survives.
    assert result.groups_removed == []
    assert result.roles_added == ["core.repository_admin//"]
    assert result.roles_removed == []
    assert ("ensure_group", "pulp-admins") in pulp.calls
    assert ("ensure_group", "sso-managed") not in pulp.calls


def test_reconcile_removes_stale_managed_state_for_an_empty_claim():
    pulp = FakePulp(
        user={
            **USER,
            "groups": [
                {"name": "pulp-admins", "pulp_href": "/pulp/api/v3/groups/1/"},
                {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
            ],
        },
        assignments=[
            {
                "pulp_href": "/pulp/api/v3/users/9/roles/abc/",
                "role": "core.repository_admin",
                "domain": None,
                "content_object_prn": None,
            }
        ],
    )
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": [], "roles": []},
            managed_group="sso-managed",
        )
    )

    assert result.groups_removed == ["pulp-admins"]
    assert result.roles_removed == ["core.repository_admin//"]
    assert ("remove_group", "/pulp/api/v3/groups/1/", 9) in pulp.calls
    assert ("delete_role", "/pulp/api/v3/users/9/roles/abc/") in pulp.calls


def test_reconcile_keeps_managed_state_when_the_claim_is_absent():
    pulp = FakePulp()
    result = asyncio.run(
        reconcile(pulp, PROVIDER, {"sub": "alice"}, managed_group="sso-managed")
    )

    # Missing claim means "no assertion": nothing managed is removed.
    assert result.groups_removed == []
    assert result.roles_removed == []
    assert result.groups_added == []


def test_reconcile_collects_errors_without_aborting():
    pulp = FakePulp(fail_after=0)
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"], "roles": ["idp-admin"]},
            managed_group="sso-managed",
        )
    )

    assert result.errors
    assert result.username == "alice"


def test_reconcile_requires_a_username():
    pulp = FakePulp()
    with pytest.raises(Exception) as excinfo:
        asyncio.run(reconcile(pulp, PROVIDER, {}, managed_group="sso-managed"))
    assert "username" in str(excinfo.value)


def test_reconcile_rejects_a_local_account_collision():
    pulp = FakePulp(
        user={
            "id": 1,
            "username": "admin",
            "pulp_href": "/pulp/api/v3/users/1/",
            "groups": [],
        }
    )
    with pytest.raises(UsernameCollision):
        asyncio.run(
            reconcile(pulp, PROVIDER, {"sub": "admin"}, managed_group="sso-managed")
        )
    # The guard must run before any provisioning writes.
    assert not any(call[0] in {"ensure_group", "add_group", "add_role"} for call in pulp.calls)


def test_reconcile_requires_a_managed_group():
    pulp = FakePulp()
    with pytest.raises(ManagedGroupRequired):
        asyncio.run(reconcile(pulp, PROVIDER, {"sub": "alice"}, managed_group=None))
    assert ("create_user", "alice") not in pulp.calls


def test_reconcile_creates_a_new_sso_user():
    pulp = FakePulp(user=None)
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "new-user", "groups": ["idp-admins"]},
            managed_group="sso-managed",
        )
    )
    assert result.username == "new-user"
    assert ("create_user", "new-user") in pulp.calls
    assert result.groups_added == ["pulp-admins", "sso-managed"]
    assert result.errors == []


def test_preview_reconcile_reports_a_collision_without_writes():
    pulp = FakePulp(
        user={
            "id": 1,
            "username": "admin",
            "pulp_href": "/pulp/api/v3/users/1/",
            "groups": [],
        }
    )
    preview = asyncio.run(
        preview_reconcile(
            pulp, PROVIDER, {"sub": "admin"}, managed_group="sso-managed"
        )
    )
    assert preview.username == "admin"
    assert preview.collision is True
    assert preview.existing is True
    assert preview.groups_added == []
    assert not any(call[0] in {"ensure_group", "add_group", "add_role"} for call in pulp.calls)


def test_preview_reconcile_reports_the_plan_without_writes():
    pulp = FakePulp()
    preview = asyncio.run(
        preview_reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"], "roles": ["idp-admin"]},
            managed_group="sso-managed",
        )
    )
    assert preview.collision is False
    assert preview.managed is True
    assert preview.groups_added == ["pulp-admins"]
    assert preview.roles_added == ["core.repository_admin//"]
    assert not any(
        call[0] in {"create_user", "ensure_group", "add_group", "delete_role", "add_role"}
        for call in pulp.calls
    )


def test_preview_reconcile_handles_a_new_user():
    pulp = FakePulp(user=None)
    preview = asyncio.run(
        preview_reconcile(
            pulp, PROVIDER, {"sub": "new-user"}, managed_group="sso-managed"
        )
    )
    assert preview.existing is False
    assert preview.groups_added == ["sso-managed"]
    assert ("create_user", "new-user") not in pulp.calls


def test_reconcile_promotes_the_admin_group_to_staff():
    pulp = FakePulp()
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
            admin_group="pulp-admins",
        )
    )
    assert result.staff is True
    assert result.staff_changed is True
    assert ("set_staff", "/pulp/api/v3/users/9/", True) in pulp.calls


def test_reconcile_demotes_staff_when_the_admin_group_is_removed():
    pulp = FakePulp(
        user={
            **USER,
            "is_staff": True,
            "groups": [
                {"name": "pulp-admins", "pulp_href": "/pulp/api/v3/groups/1/"},
                {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
            ],
        }
    )
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": []},
            managed_group="sso-managed",
            admin_group="pulp-admins",
        )
    )
    assert result.staff is False
    assert result.staff_changed is True
    assert ("set_staff", "/pulp/api/v3/users/9/", False) in pulp.calls


def test_reconcile_leaves_staff_alone_when_the_group_claim_is_absent():
    pulp = FakePulp(
        user={
            **USER,
            "is_staff": True,
            "groups": [
                {"name": "pulp-admins", "pulp_href": "/pulp/api/v3/groups/1/"},
                {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
            ],
        }
    )
    result = asyncio.run(
        reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice"},
            managed_group="sso-managed",
            admin_group="pulp-admins",
        )
    )
    assert result.staff is True
    assert result.staff_changed is False
    assert not any(call[0] == "set_staff" for call in pulp.calls)


def test_preview_reports_staff_changes_without_writing():
    pulp = FakePulp()
    preview = asyncio.run(
        preview_reconcile(
            pulp,
            PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
            admin_group="pulp-admins",
        )
    )
    assert preview.staff is True
    assert preview.staff_changed is True
    assert not any(call[0] == "set_staff" for call in pulp.calls)


RULE_PROVIDER = replace(
    PROVIDER,
    group_map={},
    role_map={},
    access_rules=[
        {
            "claim": "groups",
            "match": "idp-admins",
            "group": "pulp-admins",
            "roles": ["tangerine-viewer//"],
        }
    ],
    baseline_group="sso-users",
    baseline_roles=["tangerine-viewer//"],
)


def test_reconcile_applies_rules_baseline_and_group_roles():
    pulp = FakePulp()
    result = asyncio.run(
        reconcile(
            pulp,
            RULE_PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
        )
    )

    assert result.errors == []
    assert result.groups_added == ["pulp-admins", "sso-users"]
    assert result.group_roles_added == [
        "pulp-admins: tangerine-viewer//",
        "sso-users: tangerine-viewer//",
    ]
    assert (
        "add_group_role",
        "/pulp/api/v3/groups/pulp-admins/",
        "tangerine-viewer",
        None,
        None,
    ) in pulp.calls


def test_reconcile_strict_removes_undeclared_groups_but_keeps_protected():
    user = {
        **USER,
        "groups": [
            {"name": "pulp-admins", "pulp_href": "/pulp/api/v3/groups/1/"},
            {"name": "manual", "pulp_href": "/pulp/api/v3/groups/2/"},
            {"name": "keep-me", "pulp_href": "/pulp/api/v3/groups/4/"},
            {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
        ],
    }
    pulp = FakePulp(user=user)
    result = asyncio.run(
        reconcile(
            pulp,
            replace(RULE_PROVIDER, strict_groups=True),
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
            protected_groups=["keep-me"],
        )
    )

    assert "manual" in result.groups_removed
    assert "keep-me" not in result.groups_removed


def test_reconcile_strict_keeps_groups_declared_by_other_providers():
    other = replace(
        RULE_PROVIDER,
        id="google",
        label="Google",
        kind="google",
        access_rules=[
            {
                "claim": "groups",
                "match": "g-ops",
                "group": "google-ops",
                "roles": [],
            }
        ],
        baseline_group=None,
        baseline_roles=[],
    )
    user = {
        **USER,
        "groups": [
            {"name": "pulp-admins", "pulp_href": "/pulp/api/v3/groups/1/"},
            {"name": "google-ops", "pulp_href": "/pulp/api/v3/groups/5/"},
            {"name": "manual", "pulp_href": "/pulp/api/v3/groups/2/"},
            {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
        ],
    }
    pulp = FakePulp(user=user)
    result = asyncio.run(
        reconcile(
            pulp,
            replace(RULE_PROVIDER, strict_groups=True),
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
            providers=[replace(RULE_PROVIDER, strict_groups=True), other],
        )
    )

    assert "manual" in result.groups_removed
    assert "google-ops" not in result.groups_removed


def test_reconcile_reactivates_and_promotes_a_returning_superadmin():
    provider = replace(
        RULE_PROVIDER,
        access_rules=[
            {
                "claim": "groups",
                "match": "maintainers",
                "group": "tangerine-maintainers",
                "roles": ["tangerine-maintainer//"],
            }
        ],
        baseline_group="sso-users",
        baseline_roles=["tangerine-viewer//"],
    )
    user = {
        **USER,
        "is_active": False,
        "is_staff": False,
        "is_superuser": False,
        "groups": [
            {"name": "sso-managed", "pulp_href": "/pulp/api/v3/groups/3/"},
            {"name": "sso-users", "pulp_href": "/pulp/api/v3/groups/2/"},
            {"name": "tangerine-maintainers", "pulp_href": "/pulp/api/v3/groups/5/"},
        ],
    }
    pulp = FakePulp(user=user)
    result = asyncio.run(
        reconcile(
            pulp,
            provider,
            {"sub": "alice", "groups": ["maintainers"]},
            managed_group="sso-managed",
            admin_group="tangerine-admins",
            superadmin_group="tangerine-maintainers",
            baseline_excluded_groups=("tangerine-admins", "tangerine-maintainers"),
        )
    )

    assert result.reactivated is True
    assert result.staff is True
    assert result.superuser is True
    assert ("set_active", "/pulp/api/v3/users/9/", True) in pulp.calls
    assert ("set_staff", "/pulp/api/v3/users/9/", True) in pulp.calls
    assert ("set_superuser", "/pulp/api/v3/users/9/", True) in pulp.calls
    assert "sso-users" in result.groups_removed


def test_reconcile_rejects_a_disallowed_domain_before_any_call():
    pulp = FakePulp()
    with pytest.raises(DomainNotAllowed):
        asyncio.run(
            reconcile(
                pulp,
                replace(RULE_PROVIDER, allowed_email_domains=["example.com"]),
                {"sub": "alice", "email": "alice@gmail.com", "groups": ["idp-admins"]},
                managed_group="sso-managed",
            )
        )

    assert pulp.calls == []


def test_reconcile_revokes_a_role_no_longer_declared_for_the_group():
    provider = replace(
        RULE_PROVIDER,
        baseline_group=None,
        baseline_roles=[],
        access_rules=[
            {
                "claim": "groups",
                "match": "idp-admins",
                "group": "pulp-admins",
                "roles": ["tangerine-viewer//"],
            },
            {
                "claim": "groups",
                "match": "idp-devs",
                "group": "pulp-devs",
                "roles": ["tangerine-admin//"],
            },
        ],
    )
    pulp = FakePulp(
        group_roles={
            "/pulp/api/v3/groups/pulp-admins/": [
                {
                    "pulp_href": "/pulp/api/v3/groups/1/roles/1/",
                    "role": "tangerine-admin",
                    "domain": None,
                    "content_object_prn": None,
                },
                {
                    "pulp_href": "/pulp/api/v3/groups/1/roles/2/",
                    "role": "tangerine-viewer",
                    "domain": None,
                    "content_object_prn": None,
                },
            ]
        }
    )
    result = asyncio.run(
        reconcile(
            pulp,
            provider,
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
        )
    )

    assert result.group_roles_removed == ["pulp-admins: tangerine-admin//"]
    assert (
        "delete_group_role",
        "/pulp/api/v3/groups/1/roles/1/",
    ) in pulp.calls


def test_reconcile_uses_the_cross_provider_group_role_union():
    provider_a = replace(
        RULE_PROVIDER,
        baseline_group=None,
        baseline_roles=[],
        access_rules=[
            {
                "claim": "groups",
                "match": "shared",
                "group": "shared-group",
                "roles": ["tangerine-viewer//"],
            }
        ],
    )
    provider_b = replace(
        provider_a,
        id="other",
        access_rules=[
            {
                "claim": "groups",
                "match": "shared",
                "group": "shared-group",
                "roles": ["tangerine-admin//"],
            }
        ],
    )
    pulp = FakePulp()
    result = asyncio.run(
        reconcile(
            pulp,
            provider_a,
            {"sub": "alice", "groups": ["shared"]},
            managed_group="sso-managed",
            providers=[provider_a, provider_b],
        )
    )

    assert result.group_roles_added == [
        "shared-group: tangerine-admin//",
        "shared-group: tangerine-viewer//",
    ]


def test_preview_reports_group_roles_without_writes():
    pulp = FakePulp()
    preview = asyncio.run(
        preview_reconcile(
            pulp,
            RULE_PROVIDER,
            {"sub": "alice", "groups": ["idp-admins"]},
            managed_group="sso-managed",
        )
    )

    assert preview.group_roles_added == [
        "pulp-admins: tangerine-viewer//",
        "sso-users: tangerine-viewer//",
    ]
    assert preview.baseline_group == "sso-users"
    assert not any(
        call[0]
        in {
            "create_user",
            "ensure_group",
            "add_group",
            "add_group_role",
            "delete_group_role",
        }
        for call in pulp.calls
    )
