import asyncio
from types import SimpleNamespace

from tangerine_gateway.directory import apply_directory, directory_usernames
from tangerine_gateway.store import Provider


def _provider(**overrides):
    values = {
        "id": "microsoft",
        "label": "Entra",
        "kind": "azuread",
        "issuer": "https://login.microsoftonline.com/tenant/v2.0",
        "client_id": "client",
        "secret_file": "secret",
        "scopes": "openid",
        "group_claim": "groups",
        "role_claim": "roles",
        "username_prefix": "ms-",
        "baseline_group": "sso-users",
        "baseline_roles": ["tangerine-viewer//"],
        "access_rules": [
            {
                "claim": "groups",
                "match": "admins",
                "group": "tangerine-admins",
                "roles": ["tangerine-repository-admin//prn:file.filerepository:one"],
            }
        ],
    }
    values.update(overrides)
    return Provider(**values)


class FakeStore:
    def __init__(self, provider):
        self.provider = provider
        self.deleted_sessions = []
        self.deleted_scope_groups = []
        self.provider_usernames: set[str] | None = None

    def list_providers(self, *, enabled_only=False):
        return [self.provider]

    def delete_sessions_for_username(self, username):
        self.deleted_sessions.append(username)

    def delete_repository_scopes_for_group(self, *, group_name, provider_id=None):
        self.deleted_scope_groups.append((group_name, provider_id))

    def list_identity_assertions_for_provider(self, provider_id):
        return [
            SimpleNamespace(username=username, provider_id=provider_id)
            for username in self.provider_usernames or set()
        ]


class FakePulp:
    def __init__(self, users):
        self.users = users
        self.calls = []
        self.role_assignments = {
            "/pulp/api/v3/users/2/": [
                {
                    "pulp_href": "/pulp/api/v3/users/2/roles/1/",
                    "role": "tangerine-repository-admin",
                }
            ]
        }

    async def list_users(self):
        return self.users

    async def get_group(self, name):
        return {"name": name, "pulp_href": f"/pulp/api/v3/groups/{name}/"}

    async def remove_group_member(self, group_href, user_id):
        self.calls.append(("remove_group", group_href, user_id))

    async def user_role_assignments(self, user_href, role_names):
        return self.role_assignments.get(user_href, [])

    async def delete_user_role(self, href):
        self.calls.append(("delete_role", href))

    async def set_user_active(self, user_href, is_active):
        self.calls.append(("set_active", user_href, is_active))


def _settings(**overrides):
    values = {
        "managed_group": "sso-managed",
        "admin_group": "tangerine-admins",
        "superadmin_group": "tangerine-maintainers",
        "secrets_dir": "/tmp",
        "verify_tls": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_apply_directory_deprovisions_removed_and_reactivates_returning():
    provider = _provider()
    store = FakeStore(provider)
    pulp = FakePulp(
        [
            {
                "id": 1,
                "username": "ms-alice@example.com",
                "pulp_href": "/pulp/api/v3/users/1/",
                "is_active": False,
                "groups": [{"name": "sso-managed"}],
            },
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [
                    {"name": "sso-managed"},
                    {"name": "sso-users"},
                    {"name": "tangerine-admins"},
                ],
            },
        ]
    )

    result = asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized={"ms-alice@example.com"},
            apply=True,
        )
    )

    assert result["deprovisioned"] == 1
    assert result["reactivated"] == 1
    assert ("set_active", "/pulp/api/v3/users/1/", True) in pulp.calls
    assert ("remove_group", "/pulp/api/v3/groups/sso-users/", 2) in pulp.calls
    assert ("remove_group", "/pulp/api/v3/groups/tangerine-admins/", 2) in pulp.calls
    assert ("delete_role", "/pulp/api/v3/users/2/roles/1/") in pulp.calls
    assert ("set_active", "/pulp/api/v3/users/2/", False) in pulp.calls
    assert store.deleted_sessions == ["ms-bob@example.com"]
    assert ("sso-users", None) in store.deleted_scope_groups
    assert ("tangerine-admins", None) in store.deleted_scope_groups


def test_apply_directory_dry_run_does_not_write():
    provider = _provider()
    store = FakeStore(provider)
    pulp = FakePulp(
        [
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [{"name": "sso-managed"}, {"name": "sso-users"}],
            }
        ]
    )

    result = asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized=set(),
            apply=False,
        )
    )

    assert result["deprovisioned"] == 0
    assert pulp.calls == []
    assert store.deleted_sessions == []


def test_apply_directory_keeps_scopes_while_another_member_remains():
    provider = _provider()
    store = FakeStore(provider)
    pulp = FakePulp(
        [
            {
                "id": 1,
                "username": "ms-alice@example.com",
                "pulp_href": "/pulp/api/v3/users/1/",
                "is_active": True,
                "groups": [
                    {"name": "sso-managed"},
                    {"name": "tangerine-admins"},
                ],
            },
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [
                    {"name": "sso-managed"},
                    {"name": "tangerine-admins"},
                ],
            },
        ]
    )

    store.provider_usernames = {"ms-alice@example.com", "ms-bob@example.com"}
    result = asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized={"ms-alice@example.com"},
            apply=True,
            provider_id="microsoft",
        )
    )

    assert result["deprovisioned"] == 1
    assert store.deleted_scope_groups == []


def test_apply_directory_removes_scopes_for_the_last_member():
    provider = _provider()
    store = FakeStore(provider)
    pulp = FakePulp(
        [
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [
                    {"name": "sso-managed"},
                    {"name": "tangerine-admins"},
                ],
            }
        ]
    )

    store.provider_usernames = {"ms-bob@example.com"}
    asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized=set(),
            apply=True,
            provider_id="microsoft",
        )
    )

    assert ("tangerine-admins", "microsoft") in store.deleted_scope_groups


def test_provider_sync_does_not_deprovision_users_from_another_provider():
    provider = _provider()
    store = FakeStore(provider)
    store.provider_usernames = {"ms-bob@example.com"}
    pulp = FakePulp(
        [
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [{"name": "sso-managed"}, {"name": "sso-users"}],
            },
            {
                "id": 3,
                "username": "g-google@example.com",
                "pulp_href": "/pulp/api/v3/users/3/",
                "is_active": True,
                "groups": [{"name": "sso-managed"}, {"name": "sso-users"}],
            },
        ]
    )

    result = asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized=set(),
            apply=True,
            provider_id="microsoft",
        )
    )

    assert result["deprovisioned"] == 1
    assert store.deleted_sessions == ["ms-bob@example.com"]
    assert "g-google@example.com" not in store.deleted_sessions


def test_entra_directory_usernames_applies_prefix(tmp_path, monkeypatch):
    provider = _provider()
    (tmp_path / "secret").write_text("s")
    settings = _settings(secrets_dir=tmp_path)

    async def fake_users(*args, **kwargs):
        return ["alice@example.com"]

    monkeypatch.setattr(
        "tangerine_gateway.directory.list_app_assignment_users", fake_users
    )
    users = asyncio.run(directory_usernames(provider, settings=settings))
    assert users == {"ms-alice@example.com"}


def test_google_directory_usernames_uses_mapped_groups(tmp_path, monkeypatch):
    provider = _provider(
        id="google",
        kind="google",
        group_map={"team@example.com": "tangerine-admins"},
        google_service_account_file="sa.json",
        google_admin_email="admin@example.com",
        username_prefix="g-",
        access_rules=[],
    )
    (tmp_path / "secret").write_text("s")
    (tmp_path / "sa.json").write_text("{}")
    settings = _settings(secrets_dir=tmp_path)

    async def fake_members(*args, **kwargs):
        return ["bob@example.com"]

    monkeypatch.setattr("tangerine_gateway.directory.list_group_members", fake_members)
    users = asyncio.run(directory_usernames(provider, settings=settings))
    assert users == {"g-bob@example.com"}


def test_apply_directory_ignores_groups_no_provider_declares():
    provider = _provider()
    store = FakeStore(provider)
    pulp = FakePulp(
        [
            {
                "id": 2,
                "username": "ms-bob@example.com",
                "pulp_href": "/pulp/api/v3/users/2/",
                "is_active": True,
                "groups": [
                    {"name": "sso-managed"},
                    {"name": "tangerine-legacy-hand-made"},
                    {"name": "sso-users"},
                ],
            }
        ]
    )

    asyncio.run(
        apply_directory(
            settings=_settings(),
            backend=store,
            pulp=pulp,
            authorized=set(),
            apply=True,
        )
    )

    assert ("remove_group", "/pulp/api/v3/groups/tangerine-legacy-hand-made/", 2) not in pulp.calls
    assert ("remove_group", "/pulp/api/v3/groups/sso-users/", 2) in pulp.calls
    assert ("tangerine-legacy-hand-made", None) not in store.deleted_scope_groups
