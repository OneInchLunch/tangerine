import os
import time

import pytest

from tangerine_gateway import store


def _payload(**overrides):
    base = {
        "id": "microsoft",
        "label": "Microsoft Entra ID",
        "kind": "azuread",
        "issuer": "https://login.microsoftonline.com/tenant/v2.0",
        "clientId": "client-id",
        "secretFile": "azure-secret",
        "scopes": "openid profile email",
        "groupClaim": "groups",
        "roleClaim": "roles",
        "groupMap": {"idp-admins": "pulp-admins"},
        "roleMap": {"repo-admin": "core.repository_admin//"},
        "enabled": True,
        "sortOrder": 1,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def db(tmp_path):
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


def test_migrate_is_idempotent(db):
    db.migrate()
    assert db.ping()


def test_provider_crud_round_trip(db):
    created = db.create_provider(_payload())
    assert created.id == "microsoft"
    assert created.group_map == {"idp-admins": "pulp-admins"}
    assert created.username_claim is None
    assert created.username_prefix is None
    assert created.require_email_verified is False
    assert created.to_public() == {
        "id": "microsoft",
        "label": "Microsoft Entra ID",
        "kind": "azuread",
    }

    assert db.count_providers() == 1
    assert [p.id for p in db.list_providers()] == ["microsoft"]

    updated = db.update_provider("microsoft", {"label": "Entra ID", "enabled": False})
    assert updated.label == "Entra ID"
    assert updated.enabled is False
    assert db.list_providers(enabled_only=True) == []

    assert db.delete_provider("microsoft") is True
    assert db.get_provider("microsoft") is None


def test_provider_username_options_round_trip(db):
    created = db.create_provider(
        _payload(
            usernameClaim="email",
            usernamePrefix="google-",
            requireEmailVerified=True,
        )
    )
    assert created.username_claim == "email"
    assert created.username_prefix == "google-"
    assert created.require_email_verified is True
    restored = db.get_provider("microsoft")
    assert restored is not None
    assert restored.to_admin()["usernameClaim"] == "email"
    assert restored.to_admin()["requireEmailVerified"] is True


def test_provider_validation_rejects_invalid_username_options(db):
    for overrides in (
        {"usernameClaim": "nickname"},
        {"usernamePrefix": "bad prefix"},
        {"usernamePrefix": "x" * 31},
    ):
        with pytest.raises(store.StoreError):
            db.create_provider(_payload(**overrides))


def test_provider_validation_rejects_multi_tenant_microsoft_issuers(db):
    with pytest.raises(store.StoreError):
        db.create_provider(
            _payload(issuer="https://login.microsoftonline.com/common/v2.0")
        )
    with pytest.raises(store.StoreError):
        db.create_provider(
            _payload(
                issuer="https://login.microsoftonline.com/{tenantid}/v2.0",
                allowedTenants=["72f988bf-86f1-41af-91ab-2d7cd011db47"],
            )
        )
    with pytest.raises(store.StoreError):
        db.create_provider(
            _payload(
                issuer="https://login.microsoftonline.com/common/v2.0",
                allowedTenants=["not-a-guid"],
            )
        )

    created = db.create_provider(
        _payload(
            issuer="https://login.microsoftonline.com/common/v2.0",
            allowedTenants=["72f988bf-86f1-41af-91ab-2d7cd011db47"],
        )
    )
    assert created.allowed_tenants == ["72f988bf-86f1-41af-91ab-2d7cd011db47"]


def test_sessions_round_trip_and_expire(db):
    db.create_session(
        token_hash="token-hash",
        username="alice",
        provider_id="microsoft",
        subject="sub",
        id_token="v1:encrypted",
        expires_at=time.time() + 600,
    )
    session = db.get_session("token-hash")
    assert session is not None
    assert session.username == "alice"
    assert session.id_token == "v1:encrypted"
    assert db.count_sessions() == 1

    db.create_session(
        token_hash="old",
        username="bob",
        provider_id=None,
        subject=None,
        id_token=None,
        expires_at=time.time() - 10,
    )
    assert db.get_session("old") is None
    db.purge_expired()
    assert db.count_sessions() == 1

    db.delete_session("token-hash")
    assert db.count_sessions() == 0


def test_sessions_can_be_revoked_by_provider(db):
    for token, provider in (("a", "microsoft"), ("b", "google")):
        db.create_session(
            token_hash=token,
            username="alice",
            provider_id=provider,
            subject="sub",
            id_token=None,
            expires_at=time.time() + 600,
        )

    db.delete_sessions_for_provider("microsoft")

    assert db.get_session("a") is None
    assert db.get_session("b") is not None


def test_auth_states_are_single_use_and_expire(db):
    db.create_auth_state(
        state="state-1",
        provider_id="microsoft",
        code_verifier="verifier",
        nonce="nonce",
        next_path="/ui/repositories",
    )
    pending = db.pop_auth_state("state-1", 600)
    assert pending == {
        "provider_id": "microsoft",
        "code_verifier": "verifier",
        "nonce": "nonce",
        "next_path": "/ui/repositories",
        "preview": False,
    }
    assert db.pop_auth_state("state-1", 600) is None

    db.create_auth_state(
        state="state-2",
        provider_id="microsoft",
        code_verifier="verifier",
        nonce="nonce",
        next_path="/ui/",
        created_at=time.time() - 1000,
    )
    assert db.pop_auth_state("state-2", 600) is None


def test_provider_audit_is_listed_newest_first(db):
    db.record_provider_audit(actor="root", action="create", provider_id="microsoft")
    db.record_provider_audit(actor="root", action="update", provider_id="microsoft")
    entries = db.list_provider_audit()
    assert [entry["action"] for entry in entries] == ["update", "create"]


def test_provider_access_rules_round_trip(db):
    created = db.create_provider(
        _payload(
            accessRules=[
                {
                    "claim": "groups",
                    "match": "idp-admins",
                    "group": "pulp-admins",
                    "roles": ["tangerine-viewer//"],
                }
            ],
            baselineGroup="sso-users",
            baselineRoles=["tangerine-viewer//"],
            strictGroups=True,
            allowedEmailDomains=["Example.COM", "@example.org"],
            requireHostedDomain=False,
        )
    )

    assert created.access_rules == [
        {
            "claim": "groups",
            "match": "idp-admins",
            "group": "pulp-admins",
            "roles": ["tangerine-viewer//"],
        }
    ]
    assert created.baseline_group == "sso-users"
    assert created.baseline_roles == ["tangerine-viewer//"]
    assert created.strict_groups is True
    assert created.allowed_email_domains == ["example.com", "example.org"]
    assert created.require_hosted_domain is False

    restored = db.get_provider("microsoft")
    assert restored is not None
    admin = restored.to_admin()
    assert admin["accessRules"] == created.access_rules
    assert admin["baselineGroup"] == "sso-users"
    assert admin["strictGroups"] is True
    assert admin["allowedEmailDomains"] == ["example.com", "example.org"]


def test_provider_defaults_keep_existing_rows_safe(db):
    created = db.create_provider(_payload())

    assert created.access_rules == []
    assert created.baseline_group is None
    assert created.baseline_roles == []
    assert created.strict_groups is False
    assert created.allowed_email_domains == []
    assert created.require_hosted_domain is False


def test_provider_validation_rejects_bad_access_rules(db):
    for overrides in (
        {"accessRules": [{"claim": "nickname", "match": "x", "group": "g"}]},
        {"accessRules": [{"claim": "groups", "match": "", "group": "g"}]},
        {"accessRules": [{"claim": "groups", "match": "x", "group": ""}]},
        {
            "accessRules": [
                {"claim": "groups", "match": "x", "group": "g"},
                {"claim": "groups", "match": "x", "group": "other"},
            ]
        },
        {
            "accessRules": [
                {
                    "claim": "groups",
                    "match": "x",
                    "group": "g",
                    "roles": ["not-a-role"],
                }
            ]
        },
    ):
        with pytest.raises(store.StoreError):
            db.create_provider(_payload(**overrides))


def test_provider_validation_rejects_bad_domain_policy(db):
    for overrides in (
        {"allowedEmailDomains": ["not a domain"]},
        {"allowedEmailDomains": ["@"]},
        {"requireHostedDomain": True},
        {"requireHostedDomain": True, "allowedEmailDomains": ["example.com"]},
    ):
        with pytest.raises(store.StoreError):
            db.create_provider(_payload(**overrides))

    created = db.create_provider(
        _payload(
            issuer="https://accounts.google.com",
            kind="google",
            requireHostedDomain=True,
            allowedEmailDomains=["example.com"],
        )
    )
    assert created.require_hosted_domain is True


def test_repository_scopes_round_trip(db):
    db.add_repository_scope(
        provider_id="microsoft",
        group_name="tangerine-admins",
        repository_prn="prn:file.filerepository:one",
        source="created",
        created_by="alice",
        created_at=1.0,
    )
    db.add_repository_scope(
        provider_id="microsoft",
        group_name="tangerine-admins",
        repository_prn="prn:file.filerepository:two",
        source="rule",
        created_at=2.0,
    )

    rows = db.list_repository_scopes(provider_id="microsoft")
    assert [row["repositoryPrn"] for row in rows] == [
        "prn:file.filerepository:one",
        "prn:file.filerepository:two",
    ]
    assert rows[0]["source"] == "created"
    assert rows[0]["createdBy"] == "alice"

    db.remove_repository_scope(
        provider_id="microsoft",
        group_name="tangerine-admins",
        repository_prn="prn:file.filerepository:one",
    )
    assert [row["repositoryPrn"] for row in db.list_repository_scopes()] == [
        "prn:file.filerepository:two"
    ]

    db.delete_repository_scopes_for_provider("microsoft")
    assert db.list_repository_scopes() == []


def test_repository_scope_cleanup_helpers(db):
    for provider, group, prn in [
        ("microsoft", "tangerine-admins", "prn:file.filerepository:one"),
        ("microsoft", "tangerine-admins", "prn:file.filerepository:two"),
        ("google", "tangerine-admins", "prn:file.filerepository:one"),
        ("microsoft", "other-group", "prn:file.filerepository:three"),
    ]:
        db.add_repository_scope(
            provider_id=provider,
            group_name=group,
            repository_prn=prn,
        )

    db.delete_repository_scope_for_prn("prn:file.filerepository:one")
    assert {row["repositoryPrn"] for row in db.list_repository_scopes()} == {
        "prn:file.filerepository:two",
        "prn:file.filerepository:three",
    }

    db.delete_repository_scopes_for_group(
        group_name="tangerine-admins", provider_id="microsoft"
    )
    assert {row["repositoryPrn"] for row in db.list_repository_scopes()} == {
        "prn:file.filerepository:three"
    }

    db.delete_repository_scopes_for_group(group_name="other-group")
    assert db.list_repository_scopes() == []


def test_validate_provider_payload_does_not_write(db):
    values = store.validate_provider_payload(
        _payload(
            accessRules=[
                {
                    "claim": "groups",
                    "match": "idp-admins",
                    "group": "pulp-admins",
                    "roles": ["tangerine-viewer//"],
                }
            ]
        ),
        require_id=True,
    )

    assert values["access_rules"][0]["group"] == "pulp-admins"
    assert db.get_provider("microsoft") is None


def test_identity_assertions_round_trip_and_purge(db):
    db.upsert_identity_assertion(
        provider_id="google",
        subject="subject-1",
        username="g-alice",
        groups=["admins@example.com"],
        roles=None,
        asserted_at=time.time(),
    )
    db.upsert_identity_assertion(
        provider_id="google",
        subject="subject-1",
        username="g-alice",
        groups=[],
        roles=["tangerine-viewer//"],
        asserted_at=time.time(),
    )
    rows = db.list_identity_assertions(max_age_seconds=3600)
    assert len(rows) == 1
    assert rows[0].username == "g-alice"
    assert rows[0].groups == []
    assert rows[0].roles == ["tangerine-viewer//"]

    db.purge_identity_assertions(max_age_seconds=0)
    assert db.list_identity_assertions(max_age_seconds=3600) == []

    db.upsert_identity_assertion(
        provider_id="microsoft",
        subject="subject-2",
        username="ms-bob",
        groups=["admins"],
        roles=None,
    )
    provider_rows = db.list_identity_assertions_for_provider("microsoft")
    assert [row.username for row in provider_rows] == ["ms-bob"]
    assert db.list_identity_assertions_for_provider("google") == []

    db.upsert_identity_assertion(
        provider_id="google",
        subject="subject-1",
        username="g-alice",
        groups=None,
        roles=None,
    )
    db.delete_identity_assertions("google")
    assert len(db.list_identity_assertions_for_provider("microsoft")) == 1
    assert db.list_identity_assertions_for_provider("google") == []
