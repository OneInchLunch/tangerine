import asyncio
import os
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from tangerine_gateway import main, preview, store
from tangerine_gateway.errors import UsernameCollision
from tangerine_gateway.store import Provider
from tangerine_gateway.header import HEADER_NAME, identity_header_value
from tangerine_gateway.session import hash_token
from tangerine_gateway.settings import Settings


class FakePulp:
    admin = True
    calls: list[tuple] = []
    group_assignments: dict[str, list[dict]] = {}

    def __init__(self) -> None:
        self.resources: dict[str, dict] = {}
        self.requests: list[tuple] = []
        self.user_groups: list[str] = []
        self.user_superuser = False
        self.task_states: list[str] = []

    async def aclose(self) -> None:
        return None

    async def get_resource(self, href):
        return self.resources.get(href)

    async def list_resources(self, path, params=None):
        return [
            item
            for item in self.resources.values()
            if "/repositories/" in item.get("pulp_href", "")
            and item.get("pulp_href", "").startswith("/pulp/api/v3/repositories/")
        ]

    async def request_json(self, method, path, *, json=None, params=None):
        self.requests.append((method, path, json, params))
        if method == "POST" and path.endswith("/exports/"):
            return {"task": "/pulp/api/v3/tasks/1/"}
        if method == "GET" and path == "/pulp/api/v3/repositories/":
            name = (params or {}).get("name")
            return {
                "results": [
                    item
                    for item in self.resources.values()
                    if item.get("name") == name and "/repositories/" in item.get("pulp_href", "")
                ]
            }
        return {"pulp_href": path}

    async def request_content(self, method, path, *, content, content_type):
        self.requests.append((method, path, content_type))
        return {"pulp_href": "/pulp/api/v3/content/file/files/1/"}

    async def await_task(self, task_href, *, timeout=30.0, interval=0.5):
        state = self.task_states.pop(0) if self.task_states else "completed"
        if state == "pending":
            from tangerine_gateway.pulp import TaskTimeout

            raise TaskTimeout({"state": "running", "task": task_href})
        return {"task": task_href, "state": state}

    async def is_admin(self, username, admin_group=None):
        return self.admin

    async def is_superuser(self, username):
        return self.admin

    async def is_superadmin(self, username, group=None):
        return self.admin

    async def username_for_session_cookie(self, header):
        return None

    async def status(self):
        return {"versions": []}

    async def get_user(self, username):
        return {
            "username": username,
            "is_staff": bool(self.user_groups),
            "is_superuser": self.user_superuser,
            "groups": [{"name": name} for name in self.user_groups],
        }

    async def list_roles(self):
        return [
            {"name": "tangerine-viewer", "pulp_href": "/roles/1/", "permissions": []},
            {"name": "tangerine-maintainer", "pulp_href": "/roles/2/", "permissions": []},
            {"name": "tangerine-admin", "pulp_href": "/roles/3/", "permissions": []},
        ]

    async def create_role(self, name, permissions, description):
        return {"name": name, "pulp_href": f"/roles/{name}/"}

    async def update_role(self, role_href, permissions):
        return {"pulp_href": role_href, "permissions": permissions}

    async def get_group(self, name):
        return {"name": name, "pulp_href": f"/pulp/api/v3/groups/{name}/"}

    async def group_role_assignments(self, group_href, role_names):
        return self.group_assignments.get(group_href, [])

    async def delete_group_role(self, href):
        self.calls.append(("delete_group_role", href))

    async def domain_names(self):
        return {}

    async def access_policy(self, name):
        from tangerine_gateway.access_policies import EXPECTED_POLICIES

        return {
            "viewset_name": name,
            "customized": True,
            "statements": EXPECTED_POLICIES[name],
        }

    async def access_policies_for(self, names):
        from tangerine_gateway.access_policies import EXPECTED_POLICIES

        return {
            name: {
                "viewset_name": name,
                "customized": True,
                "statements": EXPECTED_POLICIES[name],
            }
            for name in names
        }


FakePulp.calls = []


def make_settings(tmp_path) -> Settings:
    return Settings(
        pulp_url="http://pulp.invalid",
        pulp_user="admin",
        pulp_password="secret",
        database_path=str(tmp_path / "gateway.db"),
        secrets_dir=str(tmp_path / "secrets"),
        external_base_url="http://localhost:5173",
        ui_base_path="/ui/",
        gateway_base_path="/sso/",
        session_ttl_seconds=3600,
        state_ttl_seconds=600,
        cookie_secure=False,
        managed_group="sso-managed",
        admin_group=None,
        allow_http_issuers=False,
        http_timeout=1.0,
        verify_tls=False,
        additive_mode=True,
    )


@pytest.fixture()
def settings(tmp_path):
    (tmp_path / "secrets").mkdir()
    return make_settings(tmp_path)


@pytest.fixture()
def database(tmp_path):
    url = os.environ.get("TANGERINE_TEST_DATABASE_URL")
    if url:
        backend = store.PostgresStore(url)
        backend.migrate()
        backend.truncate_for_tests()
        yield backend
        backend.close()
        return
    backend = store.SqliteStore(tmp_path / "gateway.db")
    backend.migrate()
    yield backend
    backend.close()


@pytest.fixture()
def client(settings, database, monkeypatch):
    monkeypatch.setattr(main, "PulpClient", lambda *args, **kwargs: FakePulp())
    return TestClient(main.create_app(settings, database=database))


def seed_session(database, username="alice", token="session-token", create_provider=True):
    if create_provider and database.get_provider("microsoft") is None:
        seed_provider(database)
    database.create_session(
        token_hash=hash_token(token),
        username=username,
        provider_id="microsoft",
        subject="sub",
        id_token=None,
        expires_at=time.time() + 600,
    )
    return token


def seed_provider(database, provider_id="microsoft"):
    return database.create_provider(
        {
            "id": provider_id,
            "label": "Microsoft Entra ID",
            "kind": "azuread",
            "issuer": "https://login.microsoftonline.com/tenant/v2.0",
            "clientId": "client",
            "secretFile": "azure-secret",
        },
    )


def test_healthz(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_checks_the_database(client):
    assert client.get("/readyz").status_code == 200
    assert client.get("/sso/readyz").status_code == 200


def test_public_providers_only_exposes_enabled_public_fields(client, database):
    seed_provider(database)
    database.create_provider(
        {
            "id": "disabled",
            "label": "Disabled",
            "kind": "oidc",
            "issuer": "https://idp.example.com",
            "clientId": "c",
            "secretFile": "s",
            "enabled": False,
        }
    )

    payload = client.get("/sso/providers").json()
    assert payload == [{"id": "microsoft", "label": "Microsoft Entra ID", "kind": "azuread"}]


def test_forward_auth_is_additive_without_a_session(client):
    response = client.get("/sso/auth")
    assert response.status_code == 200
    assert HEADER_NAME not in response.headers


def test_forward_auth_injects_the_identity_header_for_a_session(client, settings, database):
    token = seed_session(database)
    response = client.get("/sso/auth", cookies={settings.session_cookie: token})
    assert response.status_code == 200
    assert response.headers[HEADER_NAME] == identity_header_value("alice")


def test_forward_auth_rejects_cross_origin_writes(client, settings, database):
    token = seed_session(database)
    response = client.post(
        "/sso/auth",
        cookies={settings.session_cookie: token},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403
    assert HEADER_NAME not in response.headers


def test_forward_auth_allows_same_origin_writes(client, settings, database):
    token = seed_session(database)
    response = client.post(
        "/sso/auth",
        cookies={settings.session_cookie: token},
        headers={"Origin": settings.origin},
    )
    assert response.status_code == 200
    assert response.headers[HEADER_NAME] == identity_header_value("alice")


def test_session_endpoint_requires_a_session(client):
    assert client.get("/sso/session").status_code == 401


def test_session_endpoint_publishes_a_csrf_cookie(client, settings, database):
    token = seed_session(database)
    response = client.get("/sso/session", cookies={settings.session_cookie: token})
    assert response.status_code == 200
    assert response.json()["username"] == "alice"
    assert response.json()["csrfToken"] == response.cookies.get(settings.csrf_cookie)


def test_logout_requires_a_csrf_token(client, settings, database):
    token = seed_session(database)
    response = client.post(
        "/sso/logout",
        cookies={settings.session_cookie: token},
        headers={"Origin": settings.origin},
    )
    assert response.status_code == 403
    assert client.get("/sso/session", cookies={settings.session_cookie: token}).status_code == 200


def test_logout_revokes_the_session_and_expires_the_cookie(client, settings, database):
    token = seed_session(database)
    session = client.get("/sso/session", cookies={settings.session_cookie: token})
    csrf = session.json()["csrfToken"]
    response = client.post(
        "/sso/logout",
        cookies={settings.session_cookie: token, settings.csrf_cookie: csrf},
        headers={"Origin": settings.origin, "X-Tangerine-CSRF": csrf},
    )
    assert response.status_code == 200
    assert response.json()["redirectUrl"] == "/ui/login"
    assert client.get("/sso/session", cookies={settings.session_cookie: token}).status_code == 401
    set_cookie = response.headers.get_list("set-cookie")
    assert any(c.startswith(settings.session_cookie) and "Max-Age=0" in c for c in set_cookie)
    assert any(c.startswith("sessionid=") and "Max-Age=0" in c for c in set_cookie)
    assert any(c.startswith("csrftoken=") and "Max-Age=0" in c for c in set_cookie)


def test_logout_delete_cookie_keeps_the_secure_flag(settings, database, monkeypatch):
    import dataclasses

    secure_settings = dataclasses.replace(
        settings, cookie_secure=True, external_base_url="https://pulp.example.com"
    )
    monkeypatch.setattr(main, "PulpClient", lambda *args, **kwargs: FakePulp())
    token = seed_session(database)
    secure_client = TestClient(main.create_app(secure_settings, database=database))
    csrf = secure_client.get(
        "/sso/session", cookies={secure_settings.session_cookie: token}
    ).json()["csrfToken"]
    response = secure_client.post(
        "/sso/logout",
        cookies={secure_settings.session_cookie: token, secure_settings.csrf_cookie: csrf},
        headers={"Origin": secure_settings.origin, "X-Tangerine-CSRF": csrf},
    )
    assert response.status_code == 200, response.text
    set_cookie = response.headers["set-cookie"]
    assert secure_settings.session_cookie in set_cookie
    assert "Secure" in set_cookie


def _fake_discovery():
    return SimpleNamespace(
        issuer="https://login.microsoftonline.com/tenant-guid/v2.0",
        authorization_endpoint="https://idp.example.com/authorize",
        token_endpoint="https://idp.example.com/token",
        jwks_uri="https://idp.example.com/jwks",
        end_session_endpoint=None,
        signing_algorithms=("RS256",),
        token_endpoint_auth_methods=("client_secret_post",),
    )


def test_start_clears_a_local_pulp_session(client, settings, database, monkeypatch):
    seed_provider(database)

    async def fake_discover(*args, **kwargs):
        return _fake_discovery()

    monkeypatch.setattr(main, "discover", fake_discover)
    response = client.get(
        "/sso/start",
        params={"provider": "microsoft", "next": "/ui/"},
        cookies={"sessionid": "local-admin-session", "csrftoken": "local-csrf"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    cookies = response.headers.get_list("set-cookie")
    assert any(c.startswith("sessionid=") and "Max-Age=0" in c for c in cookies)
    assert any(c.startswith("csrftoken=") and "Max-Age=0" in c for c in cookies)


def test_callback_clears_a_local_pulp_session(client, settings, database, monkeypatch):
    seed_provider(database)
    state = "state-success"
    database.create_auth_state(
        state=state,
        provider_id="microsoft",
        code_verifier="verifier",
        nonce="nonce",
        next_path="/ui/",
    )

    async def fake_discover(*args, **kwargs):
        return _fake_discovery()

    async def fake_exchange(*args, **kwargs):
        return {"id_token": "token"}

    async def fake_reconcile(*args, **kwargs):
        return SimpleNamespace(username="alice")

    monkeypatch.setattr(main, "read_secret", lambda *args: "secret")
    monkeypatch.setattr(preview, "read_secret", lambda *args: "secret")
    monkeypatch.setattr(main, "discover", fake_discover)
    monkeypatch.setattr(main, "exchange_code", fake_exchange)
    monkeypatch.setattr(main, "validate_id_token", lambda *args, **kwargs: {"sub": "alice"})
    monkeypatch.setattr(main, "reconcile", fake_reconcile)
    monkeypatch.setattr(preview, "reconcile", fake_reconcile)

    response = client.get(
        f"/sso/callback?code=abc&state={state}",
        cookies={settings.state_cookie: state, "sessionid": "local-admin-session"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/ui/"
    cookies = response.headers.get_list("set-cookie")
    assert any(c.startswith("sessionid=") and "Max-Age=0" in c for c in cookies)
    assert any(c.startswith("csrftoken=") and "Max-Age=0" in c for c in cookies)


def test_admin_routes_require_authentication(client):
    assert client.get("/sso/admin/providers").status_code == 401


def test_admin_routes_work_for_a_pulp_administrator(client, settings, database):
    token = seed_session(database, username="root", create_provider=False)
    response = client.get("/sso/admin/providers", cookies={settings.session_cookie: token})
    assert response.status_code == 200
    assert response.json() == []


def test_local_admin_works_when_a_non_admin_gateway_session_exists(settings, database, monkeypatch):
    class MixedPulp(FakePulp):
        async def is_admin(self, username, admin_group=None):
            return username == "root"

        async def username_for_session_cookie(self, header):
            return "root" if "sessionid=" in header else None

    token = seed_session(database, username="alice", token="alice-token")
    monkeypatch.setattr(main, "PulpClient", lambda *args, **kwargs: MixedPulp())
    client = TestClient(main.create_app(settings, database=database))
    response = client.get(
        "/sso/admin/providers",
        cookies={settings.session_cookie: "alice-token", "sessionid": "pulp-session"},
    )
    assert response.status_code == 200, response.text


def test_admin_writes_require_a_csrf_token(client, settings, database):
    token = seed_session(database, username="root")
    payload = {
        "id": "google",
        "label": "Google",
        "kind": "google",
        "issuer": "https://accounts.google.com",
        "clientId": "client",
        "secretFile": "google-secret",
    }
    response = client.post(
        "/sso/admin/providers",
        json=payload,
        cookies={settings.session_cookie: token},
        headers={"Origin": settings.origin},
    )
    assert response.status_code == 403


def test_admin_writes_succeed_with_csrf_and_same_origin(client, settings, database):
    token = seed_session(database, username="root")
    payload = {
        "id": "google",
        "label": "Google",
        "kind": "google",
        "issuer": "https://accounts.google.com",
        "clientId": "client",
        "secretFile": "google-secret",
    }
    response = client.post(
        "/sso/admin/providers",
        json=payload,
        cookies={settings.session_cookie: token, settings.csrf_cookie: "csrf-1"},
        headers={"Origin": settings.origin, "X-Tangerine-CSRF": "csrf-1"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] == "google"
    assert "secret" not in response.json()

    audit = client.get(
        "/sso/admin/audit", cookies={settings.session_cookie: token}
    ).json()
    assert audit[0]["action"] == "create"
    assert audit[0]["actor"] == "root"
    assert audit[0]["providerId"] == "google"


def test_admin_bootstrap_exposes_the_pulp_settings_block(client, settings, database):
    token = seed_session(database, username="root")
    payload = client.get(
        "/sso/admin/bootstrap", cookies={settings.session_cookie: token}
    ).json()
    assert "JSONHeaderRemoteAuthentication" in payload["settingsBlock"]
    assert "PulpNoCreateRemoteUserBackend" in payload["settingsBlock"]
    assert payload["callbackUrl"].endswith("/sso/callback")


def test_admin_discover_reports_an_issuer_mismatch(client, settings, database, monkeypatch):
    token = seed_session(database, username="root")

    async def fake_discover(issuer, **kwargs):
        return SimpleNamespace(
            issuer="https://login.microsoftonline.com/tenant-guid/v2.0",
            authorization_endpoint="https://idp.example.com/authorize",
            token_endpoint="https://idp.example.com/token",
            jwks_uri="https://idp.example.com/jwks",
            end_session_endpoint=None,
            signing_algorithms=("RS256",),
            token_endpoint_auth_methods=("client_secret_post",),
        )

    monkeypatch.setattr(main, "discover", fake_discover)
    response = client.get(
        "/sso/admin/discover",
        params={"issuer": "https://login.microsoftonline.com/example.onmicrosoft.com/v2.0"},
        cookies={settings.session_cookie: token},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["issuerMatches"] is False
    assert payload["issuer"].endswith("/tenant-guid/v2.0")


def test_admin_secret_check_reports_readability(client, settings, database):
    token = seed_session(database, username="root")
    Path(settings.secrets_dir, "client-secret").write_text("secret-value")

    found = client.get(
        "/sso/admin/secrets/check",
        params={"file": "client-secret"},
        cookies={settings.session_cookie: token},
    ).json()
    assert found == {"present": True, "readable": True}

    missing = client.get(
        "/sso/admin/secrets/check",
        params={"file": "missing"},
        cookies={settings.session_cookie: token},
    ).json()
    assert missing == {"present": False, "readable": False}


def test_enrich_group_claims_fills_microsoft_overage(settings, monkeypatch):
    provider = Provider(
        id="entra",
        label="Entra",
        kind="azuread",
        issuer="https://login.microsoftonline.com/common/v2.0",
        client_id="client",
        secret_file="secret",
        scopes="openid profile email",
        group_claim="groups",
        role_claim="roles",
        fetch_graph_groups=True,
    )

    async def fake_graph(access_token, **kwargs):
        assert access_token == "graph-token"
        return ["group-id"]

    monkeypatch.setattr(main, "resolve_overage_groups", fake_graph)
    monkeypatch.setattr(preview, "resolve_overage_groups", fake_graph)
    result = asyncio.run(
        main._enrich_group_claims(
            settings,
            provider,
            {"_claim_names": {"groups": "src1"}, "email": "alice@example.com"},
            {"access_token": "graph-token"},
        )
    )
    assert result["groups"] == ["group-id"]


def test_enrich_group_claims_fills_missing_microsoft_groups(settings, monkeypatch):
    provider = Provider(
        id="entra",
        label="Entra",
        kind="azuread",
        issuer="https://login.microsoftonline.com/tenant/v2.0",
        client_id="client",
        secret_file="secret",
        scopes="openid profile email User.Read GroupMember.Read.All",
        group_claim="groups",
        role_claim="roles",
        fetch_graph_groups=True,
    )

    async def fake_graph(access_token, **kwargs):
        assert access_token == "graph-token"
        return ["group-id"]

    monkeypatch.setattr(main, "resolve_overage_groups", fake_graph)
    monkeypatch.setattr(preview, "resolve_overage_groups", fake_graph)
    result = asyncio.run(
        main._enrich_group_claims(
            settings,
            provider,
            {"email": "alice@example.com"},
            {"access_token": "graph-token"},
        )
    )
    assert result["groups"] == ["group-id"]


def test_enrich_group_claims_fills_google_workspace(settings, monkeypatch):
    provider = Provider(
        id="google",
        label="Google",
        kind="google",
        issuer="https://accounts.google.com",
        client_id="client",
        secret_file="secret",
        scopes="openid profile email",
        group_claim="",
        role_claim="",
        fetch_google_groups=True,
        google_service_account_file="google-service-account.json",
        google_admin_email="admin@example.com",
    )

    monkeypatch.setattr(main, "read_secret", lambda *args: "{}")
    monkeypatch.setattr(preview, "read_secret", lambda *args: "{}")

    async def fake_groups(service_account, **kwargs):
        assert kwargs["admin_email"] == "admin@example.com"
        assert kwargs["user_email"] == "alice@example.com"
        return ["group@example.com"]

    monkeypatch.setattr(main, "resolve_workspace_groups", fake_groups)
    monkeypatch.setattr(preview, "resolve_workspace_groups", fake_groups)
    result = asyncio.run(
        main._enrich_group_claims(
            settings,
            provider,
            {"email": "alice@example.com"},
            {},
        )
    )
    assert result["groups"] == ["group@example.com"]


def test_login_error_redirects_to_the_login_screen(client):
    response = client.get("/sso/callback?error=access_denied", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/ui/login?sso_error=access_denied"


def test_callback_rejects_a_state_mismatch(client):
    response = client.get(
        "/sso/callback?code=abc&state=one", cookies={"tg_state": "two"}, follow_redirects=False
    )
    assert response.status_code == 302
    assert "sso_error=state_mismatch" in response.headers["location"]


def test_callback_maps_a_username_collision(client, settings, database, monkeypatch):
    seed_provider(database)
    state = "state-collision"
    database.create_auth_state(
        state=state,
        provider_id="microsoft",
        code_verifier="verifier",
        nonce="nonce",
        next_path="/ui/",
    )

    async def fake_discover(*args, **kwargs):
        return SimpleNamespace()

    async def fake_exchange(*args, **kwargs):
        return {"id_token": "token"}

    async def fake_reconcile(*args, **kwargs):
        raise UsernameCollision("admin")

    monkeypatch.setattr(main, "read_secret", lambda *args: "secret")
    monkeypatch.setattr(preview, "read_secret", lambda *args: "secret")
    monkeypatch.setattr(main, "discover", fake_discover)
    monkeypatch.setattr(main, "exchange_code", fake_exchange)
    monkeypatch.setattr(main, "validate_id_token", lambda *args, **kwargs: {"sub": "admin"})
    monkeypatch.setattr(main, "reconcile", fake_reconcile)
    monkeypatch.setattr(preview, "reconcile", fake_reconcile)

    response = client.get(
        f"/sso/callback?code=abc&state={state}",
        cookies={settings.state_cookie: state},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/ui/login?sso_error=username_collision"


def test_admin_csrf_endpoint_requires_admin(client):
    assert client.get("/sso/admin/csrf").status_code == 401


def test_admin_csrf_endpoint_issues_a_matching_cookie(client, settings, database):
    token = seed_session(database, username="root")
    response = client.get("/sso/admin/csrf", cookies={settings.session_cookie: token})
    assert response.status_code == 200
    csrf = response.json()["csrfToken"]
    assert csrf
    assert response.cookies.get(settings.csrf_cookie) == csrf


def test_routes_follow_the_configured_base_path(tmp_path, database, monkeypatch):
    import dataclasses

    (tmp_path / "secrets").mkdir()
    settings = dataclasses.replace(make_settings(tmp_path), gateway_base_path="/auth/")
    monkeypatch.setattr(main, "PulpClient", lambda *args, **kwargs: FakePulp())
    client = TestClient(main.create_app(settings, database=database))

    assert client.get("/auth/healthz").status_code == 200
    assert client.get("/auth/providers").status_code == 200
    assert client.get("/sso/providers").status_code == 404
    assert client.get("/healthz").status_code == 200


GOOGLE_PAYLOAD = {
    "id": "google",
    "label": "Google",
    "kind": "google",
    "issuer": "https://accounts.google.com",
    "clientId": "client",
    "secretFile": "google-secret",
    "accessRules": [
        {
            "claim": "groups",
            "match": "tangerine-admins@example.com",
            "group": "tangerine-admins",
            "roles": ["tangerine-viewer//"],
        }
    ],
    "baselineGroup": "sso-users",
    "baselineRoles": ["tangerine-viewer//"],
    "strictGroups": True,
    "allowedEmailDomains": ["example.com"],
}


def _admin_write(client, settings, token, payload, *, method="post", url="/sso/admin/providers"):
    return getattr(client, method)(
        url,
        json=payload,
        cookies={settings.session_cookie: token, settings.csrf_cookie: "csrf-1"},
        headers={"Origin": settings.origin, "X-Tangerine-CSRF": "csrf-1"},
    )


def test_admin_provider_save_rejects_unknown_roles(client, settings, database):
    token = seed_session(database, username="root")
    payload = {
        **GOOGLE_PAYLOAD,
        "accessRules": [
            {
                "claim": "groups",
                "match": "admins",
                "group": "tangerine-admins",
                "roles": ["missing-role//"],
            }
        ],
    }
    response = _admin_write(client, settings, token, payload)

    assert response.status_code == 400
    assert "missing-role" in response.json()["detail"]
    assert database.get_provider("google") is None


def test_admin_provider_save_round_trips_access_rules(client, settings, database):
    token = seed_session(database, username="root")
    response = _admin_write(client, settings, token, GOOGLE_PAYLOAD)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["accessRules"] == GOOGLE_PAYLOAD["accessRules"]
    assert body["baselineGroup"] == "sso-users"
    assert body["strictGroups"] is True
    assert body["allowedEmailDomains"] == ["example.com"]


def test_admin_provider_save_rejects_the_marker_as_baseline(client, settings, database):
    token = seed_session(database, username="root")
    payload = {**GOOGLE_PAYLOAD, "baselineGroup": "sso-managed"}
    response = _admin_write(client, settings, token, payload)

    assert response.status_code == 400
    assert "marker group" in response.json()["detail"]


def test_admin_provider_update_revokes_orphaned_group_roles(client, settings, database):
    FakePulp.calls = []
    FakePulp.group_assignments = {
        "/pulp/api/v3/groups/tangerine-admins/": [
            {
                "pulp_href": "/pulp/api/v3/groups/1/roles/1/",
                "role": "tangerine-viewer",
                "domain": None,
                "content_object_prn": None,
            }
        ]
    }
    database.create_provider(
        {
            "id": "google",
            "label": "Google",
            "kind": "google",
            "issuer": "https://accounts.google.com",
            "clientId": "client",
            "secretFile": "google-secret",
            "accessRules": GOOGLE_PAYLOAD["accessRules"],
        }
    )
    token = seed_session(database, username="root")

    response = _admin_write(
        client,
        settings,
        token,
        {"accessRules": [], "baselineGroup": "", "baselineRoles": []},
        method="patch",
        url="/sso/admin/providers/google",
    )

    assert response.status_code == 200, response.text
    assert ("delete_group_role", "/pulp/api/v3/groups/1/roles/1/") in FakePulp.calls
    FakePulp.group_assignments = {}


def test_admin_groups_rejects_an_unknown_provider(client, settings, database):
    token = seed_session(database, username="root")
    response = client.get(
        "/sso/admin/groups",
        params={"provider": "missing"},
        cookies={settings.session_cookie: token},
    )
    assert response.status_code == 404


def test_admin_groups_rejects_an_unsupported_provider_kind(client, settings, database):
    token = seed_session(database, username="root")
    database.create_provider(
        {
            "id": "generic",
            "label": "Generic",
            "kind": "oidc",
            "issuer": "https://idp.example.com",
            "clientId": "client",
            "secretFile": "secret",
        }
    )
    response = client.get(
        "/sso/admin/groups",
        params={"provider": "generic"},
        cookies={settings.session_cookie: token},
    )
    assert response.status_code == 400


def test_admin_groups_lists_google_workspace_groups(
    client, settings, database, monkeypatch
):
    token = seed_session(database, username="root")
    database.create_provider(
        {
            "id": "google",
            "label": "Google",
            "kind": "google",
            "issuer": "https://accounts.google.com",
            "clientId": "client",
            "secretFile": "google-secret",
            "fetchGoogleGroups": True,
            "googleServiceAccountFile": "sa.json",
            "googleAdminEmail": "admin@example.com",
        }
    )
    Path(settings.secrets_dir, "sa.json").write_text("{}")

    async def fake_groups(service_account, **kwargs):
        assert kwargs["admin_email"] == "admin@example.com"
        assert kwargs["query"] == "adm"
        return [{"id": "admins@example.com", "label": "Admins"}]

    monkeypatch.setattr(main, "list_workspace_groups", fake_groups)
    response = client.get(
        "/sso/admin/groups",
        params={"provider": "google", "q": "adm"},
        cookies={settings.session_cookie: token},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "groups": [{"id": "admins@example.com", "label": "Admins"}]
    }


def test_admin_access_policies_report_expected_statements(client, settings, database):
    token = seed_session(database, username="root")
    response = client.get(
        "/sso/admin/access-policies",
        cookies={settings.session_cookie: token},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert [item["name"] for item in payload] == [
        "tasks",
        "users",
        "roles",
        "signing-services",
        "workers",
        "exporters/core/pulp",
        "exporters/core/filesystem",
        "exporters/core/pulp/exports",
        "exporters/core/filesystem/exports",
        "importers/core/pulp",
        "importers/core/pulp/imports",
    ]
    assert all(item["present"] for item in payload)
    assert all(item["matchesExpected"] for item in payload)


def test_policy_matches_ignores_key_order():
    from tangerine_gateway.access_policies import EXPECTED_POLICIES, policy_matches

    expected = EXPECTED_POLICIES["users"]
    reordered = [dict(reversed(list(item.items()))) for item in expected]
    assert policy_matches(reordered, expected)
    assert not policy_matches([], expected)


def test_reconcile_assertions_replays_stored_claims(settings, database, monkeypatch):
    database.create_provider(
        {
            "id": "google",
            "label": "Google",
            "kind": "google",
            "issuer": "https://accounts.google.com",
            "clientId": "client",
            "secretFile": "google-secret",
        }
    )
    database.upsert_identity_assertion(
        provider_id="google",
        subject="subject-1",
        username="g-alice",
        groups=["admins@example.com"],
        roles=None,
    )
    calls = []

    async def fake_reconcile(pulp, record, claims, **kwargs):
        calls.append((record.id, claims, kwargs))
        return SimpleNamespace(username=kwargs.get("username_override"))

    monkeypatch.setattr(main, "reconcile", fake_reconcile)
    monkeypatch.setattr(preview, "reconcile", fake_reconcile)
    counts = asyncio.run(main.reconcile_assertions(settings, database, FakePulp()))

    assert counts == {"checked": 1, "applied": 1, "skipped": 0, "failed": 0}
    provider_id, claims, kwargs = calls[0]
    assert provider_id == "google"
    assert claims["groups"] == ["admins@example.com"]
    assert "roles" not in claims
    assert kwargs["username_override"] == "g-alice"
    assert kwargs["check_domain"] is False


def test_reconcile_assertions_skips_a_deleted_provider(settings, database):
    database.upsert_identity_assertion(
        provider_id="gone",
        subject="subject-1",
        username="g-alice",
        groups=[],
        roles=None,
    )
    counts = asyncio.run(main.reconcile_assertions(settings, database, FakePulp()))

    assert counts == {"checked": 0, "applied": 0, "skipped": 1, "failed": 0}

def _scope_client(settings, database, monkeypatch, *, groups, superuser=False, resources=None):
    pulp = FakePulp()
    pulp.admin = superuser
    pulp.user_groups = groups
    pulp.user_superuser = superuser
    pulp.resources = resources or {}

    def factory(*args, **kwargs):
        return pulp

    monkeypatch.setattr(main, "PulpClient", factory)
    return TestClient(main.create_app(settings, database=database)), [pulp]


def _seed_scoped_admin(database):
    database.create_provider(
        {
            "id": "microsoft",
            "label": "Microsoft Entra ID",
            "kind": "azuread",
            "issuer": "https://login.microsoftonline.com/tenant/v2.0",
            "clientId": "client",
            "secretFile": "azure-secret",
            "accessRules": [
                {
                    "claim": "groups",
                    "match": "admins",
                    "group": "tangerine-admins",
                    "roles": [
                        "tangerine-admin-read//",
                        "tangerine-repository-admin//prn:file.filerepository:one",
                    ],
                }
            ],
        },
    )


def test_scope_import_export_validates_the_exporter_repositories(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    repositories = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
        "/pulp/api/v3/exporters/core/pulp/1/": {
            "pulp_href": "/pulp/api/v3/exporters/core/pulp/1/",
            "repositories": ["/pulp/api/v3/repositories/file/file/1/"],
        },
        "/pulp/api/v3/exporters/core/pulp/2/": {
            "pulp_href": "/pulp/api/v3/exporters/core/pulp/2/",
            "repositories": ["/pulp/api/v3/repositories/file/file/2/"],
        },
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=repositories,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    allowed = client.post(
        "/sso/scope/import-export",
        headers=headers,
        json={"path": "/pulp/api/v3/exporters/core/pulp/1/exports/", "body": {"full": True}},
    )
    assert allowed.status_code == 201
    assert allowed.json()["result"]["task"] == "/pulp/api/v3/tasks/1/"

    denied = client.post(
        "/sso/scope/import-export",
        headers=headers,
        json={"path": "/pulp/api/v3/exporters/core/pulp/2/exports/", "body": {"full": True}},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "repository is outside scope"


def test_scope_content_upload_requires_an_assigned_repository(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    repositories = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=repositories,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {
        "Origin": "http://localhost:5173",
        "X-Tangerine-CSRF": "csrf-token",
        "Content-Type": "multipart/form-data; boundary=x",
    }
    body = (
        b'--x\r\nContent-Disposition: form-data; name="relative_path"\r\n\r\n\r\n'
        b'--x\r\nContent-Disposition: form-data; name="repository"\r\n\r\n'
        b"/pulp/api/v3/repositories/file/file/1/\r\n"
        b"--x--\r\n"
    )

    allowed = client.post(
        "/sso/scope/content-upload",
        params={
            "path": "/pulp/api/v3/content/file/files/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        headers=headers,
        content=body,
    )
    assert allowed.status_code == 201
    assert allowed.json()["result"]["pulp_href"].endswith("/content/file/files/1/")

    denied = client.post(
        "/sso/scope/content-upload",
        params={
            "path": "/pulp/api/v3/content/file/files/",
            "repository": "/pulp/api/v3/repositories/file/file/2/",
        },
        headers=headers,
        content=body,
    )
    assert denied.status_code == 403

def test_scoped_imports_require_mapped_repositories_inside_scope(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "name": "assigned",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "name": "other",
            "prn": "prn:file.filerepository:two",
        },
        "/pulp/api/v3/importers/core/pulp/1/": {
            "pulp_href": "/pulp/api/v3/importers/core/pulp/1/",
            "repo_mapping": {"exported": "other"},
        },
    }
    client, _ = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    denied = client.post(
        "/sso/scope/import-export",
        headers=headers,
        json={
            "path": "/pulp/api/v3/importers/core/pulp/1/imports/",
            "body": {"path": "/var/lib/pulp/exports/export.tar.gz", "create_repositories": False},
        },
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "repository is outside scope"

    create = client.post(
        "/sso/scope/import-export",
        headers=headers,
        json={
            "path": "/pulp/api/v3/importers/core/pulp/1/imports/",
            "body": {"path": "/var/lib/pulp/exports/export.tar.gz", "create_repositories": True},
        },
    )
    assert create.status_code == 403
    assert create.json()["detail"] == "scoped importers cannot create repositories"

def test_scope_repository_delete_removes_registry_rows(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    database.add_repository_scope(
        provider_id="microsoft",
        group_name="tangerine-admins",
        repository_prn="prn:file.filerepository:one",
    )
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        }
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    response = client.post(
        "/sso/scope/repository",
        headers=headers,
        json={"method": "DELETE", "href": "/pulp/api/v3/repositories/file/file/1/"},
    )
    assert response.status_code == 200
    assert database.list_repository_scopes() == []
    assert ("DELETE", "/pulp/api/v3/repositories/file/file/1/", None, None) in created[0].requests


def test_scope_repository_delete_rejects_unassigned_prns(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        }
    }
    client, _ = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    response = client.post(
        "/sso/scope/repository",
        headers=headers,
        json={"method": "DELETE", "href": "/pulp/api/v3/repositories/file/file/2/"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "repository is outside scope"

def test_scope_repository_patch_validates_assignment(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    allowed = client.post(
        "/sso/scope/repository",
        headers=headers,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/repositories/file/file/1/",
            "body": {"description": "updated"},
        },
    )
    assert allowed.status_code == 200
    assert (
        "PATCH",
        "/pulp/api/v3/repositories/file/file/1/",
        {"description": "updated"},
        None,
    ) in created[0].requests

    denied = client.post(
        "/sso/scope/repository",
        headers=headers,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/repositories/file/file/2/",
            "body": {"description": "nope"},
        },
    )
    assert denied.status_code == 403


def test_scope_remote_patch_and_delete_validate_every_using_repository(
    settings, database, monkeypatch
):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
            "remote": "/pulp/api/v3/remotes/file/file/1/",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
            "remote": "/pulp/api/v3/remotes/file/file/2/",
        },
        "/pulp/api/v3/remotes/file/file/1/": {
            "pulp_href": "/pulp/api/v3/remotes/file/file/1/",
        },
        "/pulp/api/v3/remotes/file/file/2/": {
            "pulp_href": "/pulp/api/v3/remotes/file/file/2/",
        },
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    patched = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/remotes/file/file/1/",
            "body": {"url": "https://example.com"},
        },
    )
    assert patched.status_code == 200

    denied = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/remotes/file/file/2/",
            "body": None,
        },
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "repository is outside scope"

    deleted = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/remotes/file/file/1/",
            "body": None,
        },
    )
    assert deleted.status_code == 200

def test_scope_publication_delete_checks_the_source_repository(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
        "/pulp/api/v3/repositories/file/file/1/versions/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/versions/1/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        "/pulp/api/v3/repositories/file/file/2/versions/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/versions/1/",
            "repository": "/pulp/api/v3/repositories/file/file/2/",
        },
        "/pulp/api/v3/publications/file/file/1/": {
            "pulp_href": "/pulp/api/v3/publications/file/file/1/",
            "repository_version": "/pulp/api/v3/repositories/file/file/1/versions/1/",
        },
        "/pulp/api/v3/publications/file/file/2/": {
            "pulp_href": "/pulp/api/v3/publications/file/file/2/",
            "repository_version": "/pulp/api/v3/repositories/file/file/2/versions/1/",
        },
    }
    client, _ = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    allowed = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/publications/file/file/1/",
            "body": None,
        },
    )
    assert allowed.status_code == 200

    denied = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/publications/file/file/2/",
            "body": None,
        },
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "repository is outside scope"

def test_scope_distribution_delete_checks_the_repository(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
        "/pulp/api/v3/distributions/file/file/1/": {
            "pulp_href": "/pulp/api/v3/distributions/file/file/1/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        "/pulp/api/v3/distributions/file/file/2/": {
            "pulp_href": "/pulp/api/v3/distributions/file/file/2/",
            "repository": "/pulp/api/v3/repositories/file/file/2/",
        },
    }
    client, _ = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    headers = {"Origin": "http://localhost:5173", "X-Tangerine-CSRF": "csrf-token"}

    allowed = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/distributions/file/file/1/",
            "body": None,
        },
    )
    assert allowed.status_code == 200

    denied = client.post(
        "/sso/scope/object",
        headers=headers,
        json={
            "method": "DELETE",
            "href": "/pulp/api/v3/distributions/file/file/2/",
            "body": None,
        },
    )
    assert denied.status_code == 403

def test_admin_client_ip_diagnostic_reports_forwarded_headers(client, settings, database):
    token = seed_session(database, username="root")
    response = client.get(
        "/sso/admin/diagnostics/client-ip",
        cookies={settings.session_cookie: token},
        headers={
            "CF-Connecting-IP": "203.0.113.9",
            "X-Real-IP": "198.51.100.2",
            "X-Forwarded-For": "198.51.100.1, 10.0.0.1",
            "X-Forwarded-Proto": "https",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["resolvedClientIp"] == "203.0.113.9"
    assert payload["cfConnectingIp"] == "203.0.113.9"
    assert payload["xForwardedFor"] == "198.51.100.1, 10.0.0.1"
    assert payload["xRealIp"] == "198.51.100.2"
    assert payload["xForwardedProto"] == "https"
    assert payload["forwardedHeaders"]["cf-connecting-ip"] == "203.0.113.9"
    assert payload["forwardedHeaders"]["x-forwarded-for"] == "198.51.100.1, 10.0.0.1"
    assert payload["socketAddress"]
    assert payload["trustedProxies"] == []
    assert payload["forwardedTrusted"] is True
    assert payload["rateLimitPerMinute"] == 60

def test_session_capabilities_separate_read_only_viewers_from_scoped_admins(
    settings, database, monkeypatch
):
    _seed_scoped_admin(database)
    token = seed_session(database)
    client, _ = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
    )
    payload = client.get(
        "/sso/session", cookies={settings.session_cookie: token}
    ).json()
    assert payload["capabilities"]["repositoryAdmin"] is True
    assert payload["capabilities"]["repositoryWrite"] is True
    assert payload["capabilities"]["contentRead"] is True
    assert payload["capabilities"]["tasksRead"] is False

    viewer_token = seed_session(database, username="viewer", token="viewer-token")
    viewer, _ = _scope_client(
        settings, database, monkeypatch, groups=["sso-managed"]
    )
    viewer_payload = viewer.get(
        "/sso/session", cookies={settings.session_cookie: viewer_token}
    ).json()
    assert viewer_payload["capabilities"]["repositoryAdmin"] is False
    assert viewer_payload["capabilities"]["repositoryWrite"] is False
    assert viewer_payload["capabilities"]["contentRead"] is False
    assert viewer_payload["capabilities"]["tasksRead"] is True


SCOPE_HEADERS = {
    "Origin": "http://localhost:5173",
    "X-Tangerine-CSRF": "csrf-token",
}


def _scope_fixture(settings, database, monkeypatch):
    _seed_scoped_admin(database)
    token = seed_session(database)
    resources = {
        "/pulp/api/v3/repositories/file/file/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/",
            "prn": "prn:file.filerepository:one",
        },
        "/pulp/api/v3/repositories/file/file/2/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/",
            "prn": "prn:file.filerepository:two",
        },
        "/pulp/api/v3/publications/file/file/1/": {
            "pulp_href": "/pulp/api/v3/publications/file/file/1/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        "/pulp/api/v3/publications/file/file/2/": {
            "pulp_href": "/pulp/api/v3/publications/file/file/2/",
            "repository": "/pulp/api/v3/repositories/file/file/2/",
        },
        "/pulp/api/v3/repositories/file/file/1/versions/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/1/versions/1/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        "/pulp/api/v3/repositories/file/file/2/versions/1/": {
            "pulp_href": "/pulp/api/v3/repositories/file/file/2/versions/1/",
            "repository": "/pulp/api/v3/repositories/file/file/2/",
        },
        "/pulp/api/v3/distributions/file/file/1/": {
            "pulp_href": "/pulp/api/v3/distributions/file/file/1/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        "/pulp/api/v3/exporters/core/pulp/1/": {
            "pulp_href": "/pulp/api/v3/exporters/core/pulp/1/",
            "repositories": ["/pulp/api/v3/repositories/file/file/1/"],
        },
    }
    client, created = _scope_client(
        settings,
        database,
        monkeypatch,
        groups=["sso-managed", "tangerine-admins"],
        resources=resources,
    )
    client.cookies.set("tg_session", token)
    client.cookies.set("tg_csrf", "csrf-token")
    return client, created


def test_scope_repository_rejects_dot_segment_hrefs(settings, database, monkeypatch):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/repository",
        headers=SCOPE_HEADERS,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/repositories/../../users/",
            "body": {},
        },
    )

    assert response.status_code == 400
    assert created[0].requests == []


def test_scope_scoped_objects_rejects_a_foreign_absolute_publication(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/scoped-objects",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/distributions/file/file/",
            "body": {
                "name": "demo",
                "base_path": "demo",
                "publication": "http://evil.example/pulp/api/v3/publications/file/file/1/",
            },
        },
    )

    assert response.status_code == 400
    assert created[0].requests == []


def test_scope_object_rejects_a_publication_introduced_by_patch(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/object",
        headers=SCOPE_HEADERS,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/distributions/file/file/1/",
            "body": {
                "publication": "/pulp/api/v3/publications/file/file/2/",
            },
        },
    )

    assert response.status_code == 403
    assert created[0].requests == []


def test_scope_object_requires_a_repository_for_a_sourceless_distribution(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)
    created[0].resources["/pulp/api/v3/distributions/file/file/2/"] = {
        "pulp_href": "/pulp/api/v3/distributions/file/file/2/",
        "repository": None,
    }

    response = client.post(
        "/sso/scope/object",
        headers=SCOPE_HEADERS,
        json={
            "method": "PATCH",
            "href": "/pulp/api/v3/distributions/file/file/2/",
            "body": {"name": "renamed"},
        },
    )

    assert response.status_code == 403
    assert created[0].requests == []


def test_scope_distribution_create_checks_the_publication_scope(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)

    denied = client.post(
        "/sso/scope/scoped-objects",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/distributions/file/file/",
            "body": {
                "name": "demo",
                "base_path": "demo",
                "publication": "/pulp/api/v3/publications/file/file/2/",
            },
        },
    )
    allowed = client.post(
        "/sso/scope/scoped-objects",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/distributions/file/file/",
            "body": {
                "name": "demo",
                "base_path": "demo",
                "publication": "/pulp/api/v3/publications/file/file/1/",
            },
        },
    )

    assert denied.status_code == 403
    assert allowed.status_code == 201


def test_scope_export_rejects_versions_outside_the_scope(settings, database, monkeypatch):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/import-export",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/exporters/core/pulp/1/exports/",
            "body": {
                "versions": [
                    "/pulp/api/v3/repositories/file/file/2/versions/1/"
                ],
            },
        },
    )

    assert response.status_code == 403
    assert created[0].requests == []


def test_scope_upload_rejects_a_body_repository_that_differs_from_the_query(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)
    body = (
        b'--x\r\nContent-Disposition: form-data; name="repository"\r\n\r\n'
        b"/pulp/api/v3/repositories/file/file/2/\r\n"
        b"--x--\r\n"
    )

    response = client.post(
        "/sso/scope/content-upload",
        params={
            "path": "/pulp/api/v3/content/file/files/",
            "repository": "/pulp/api/v3/repositories/file/file/1/",
        },
        headers={
            **SCOPE_HEADERS,
            "Content-Type": "multipart/form-data; boundary=x",
        },
        content=body,
    )

    assert response.status_code == 400
    assert created[0].requests == []


def test_scope_import_export_rejects_a_json_string_repo_mapping(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/import-export",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/importers/core/pulp/1/import-check/",
            "body": {"repo_mapping": "not-json"},
        },
    )

    assert response.status_code == 400
    assert created[0].requests == []


def test_scope_result_returns_a_terminal_task(settings, database, monkeypatch):
    client, created = _scope_fixture(settings, database, monkeypatch)

    response = client.post(
        "/sso/scope/import-export",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/exporters/core/pulp/1/exports/",
            "body": {"full": True},
        },
    )

    assert response.status_code == 201
    assert response.json()["result"]["state"] == "completed"


def test_scope_result_returns_pending_when_the_task_outlives_the_timeout(
    settings, database, monkeypatch
):
    client, created = _scope_fixture(settings, database, monkeypatch)
    created[0].task_states = ["pending"]

    response = client.post(
        "/sso/scope/import-export",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/exporters/core/pulp/1/exports/",
            "body": {"full": True},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["pending"] is True
    assert payload["task"]["state"] == "running"


def test_scope_result_fails_a_failed_task(settings, database, monkeypatch):
    client, created = _scope_fixture(settings, database, monkeypatch)
    created[0].task_states = ["failed"]

    response = client.post(
        "/sso/scope/import-export",
        headers=SCOPE_HEADERS,
        json={
            "path": "/pulp/api/v3/exporters/core/pulp/1/exports/",
            "body": {"full": True},
        },
    )

    assert response.status_code == 502
    assert "failed" in response.json()["detail"]


def test_session_reuses_the_existing_csrf_cookie(client, settings, database):
    token = seed_session(database)

    response = client.get(
        "/sso/session",
        cookies={settings.session_cookie: token, settings.csrf_cookie: "fixed-token"},
    )

    assert response.status_code == 200
    assert response.json()["csrfToken"] == "fixed-token"
    assert not any(
        header.startswith(f"{settings.csrf_cookie}=")
        for header in response.headers.get_list("set-cookie")
    )


def test_session_rejects_a_disabled_provider(client, settings, database):
    token = seed_session(database)
    database.update_provider("microsoft", {"enabled": False})

    response = client.get("/sso/session", cookies={settings.session_cookie: token})

    assert response.status_code == 401


def test_forward_auth_stops_issuing_identities_for_a_disabled_provider(
    client, settings, database
):
    token = seed_session(database)
    database.update_provider("microsoft", {"enabled": False})

    response = client.get(
        "/sso/auth",
        cookies={settings.session_cookie: token},
        headers={"Origin": settings.origin},
    )

    assert response.status_code == 200
    assert HEADER_NAME not in response.headers


def test_audit_export_neutralises_spreadsheet_formulas(client, settings, database):
    token = seed_session(database)
    database.record_provider_audit(
        actor="=cmd()",
        action="create",
        provider_id="@evil",
        detail="+SUM(1)",
    )

    response = client.get(
        "/sso/admin/audit/export",
        cookies={settings.session_cookie: token},
    )

    assert response.status_code == 200
    body = response.text
    assert "'=cmd()" in body
    assert "'@evil" in body
    assert "'+SUM(1)" in body


def test_secret_picker_excludes_google_service_account_files(
    client, settings, database, tmp_path
):
    from pathlib import Path

    secrets_dir = Path(settings.secrets_dir)
    (secrets_dir / "google-client-secret").write_text("client", encoding="utf-8")
    (secrets_dir / "google-sa.json").write_text("{}", encoding="utf-8")
    database.create_provider(
        {
            "id": "google",
            "label": "Google",
            "kind": "google",
            "issuer": "https://accounts.google.com",
            "clientId": "client",
            "secretFile": "google-client-secret",
            "googleServiceAccountFile": "google-sa.json",
        }
    )
    token = seed_session(database)

    response = client.get(
        "/sso/admin/secrets",
        cookies={settings.session_cookie: token},
    )

    assert response.status_code == 200
    assert "google-client-secret" in response.json()
    assert "google-sa.json" not in response.json()
