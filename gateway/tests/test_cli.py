from tangerine_gateway import cli, store
from tangerine_gateway.settings import Settings


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


def _provider(provider_id: str, *, secret: str, enabled: bool) -> dict:
    return {
        "id": provider_id,
        "label": provider_id,
        "kind": "azuread",
        "issuer": "https://login.microsoftonline.com/tenant/v2.0",
        "clientId": "client",
        "secretFile": secret,
        "scopes": "openid profile email",
        "enabled": enabled,
    }


def test_check_secrets_only_checks_enabled_providers(tmp_path):
    settings = make_settings(tmp_path)
    (tmp_path / "secrets").mkdir()
    (tmp_path / "secrets" / "enabled-secret").write_text("value")
    backend = store.build_store(None, settings.database_path)
    backend.migrate()
    backend.create_provider(_provider("enabled", secret="enabled-secret", enabled=True))
    backend.create_provider(_provider("disabled", secret="missing-secret", enabled=False))
    backend.close()

    assert cli._cmd_check_secrets(settings) == 0


def test_check_secrets_fails_when_an_enabled_secret_is_missing(tmp_path):
    settings = make_settings(tmp_path)
    (tmp_path / "secrets").mkdir()
    backend = store.build_store(None, settings.database_path)
    backend.migrate()
    backend.create_provider(_provider("enabled", secret="missing-secret", enabled=True))
    backend.close()

    assert cli._cmd_check_secrets(settings) == 1
