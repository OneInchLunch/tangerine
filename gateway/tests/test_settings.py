from urllib.parse import parse_qs, unquote, urlsplit

from tangerine_gateway.settings import load_settings


def test_postgres_keys_build_a_pulp_style_database_url(monkeypatch):
    monkeypatch.delenv("TANGERINE_DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "db.example.com")
    monkeypatch.setenv("POSTGRES_PORT", "6543")
    monkeypatch.setenv("POSTGRES_USERNAME", "tangerine")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss word")
    monkeypatch.setenv("POSTGRES_DB_NAME", "tangerine_gateway")
    monkeypatch.setenv("POSTGRES_SSLMODE", "require")

    settings = load_settings()
    assert settings.database_url is not None
    parsed = urlsplit(settings.database_url)
    assert parsed.username == "tangerine"
    assert unquote(parsed.password or "") == "p@ss word"
    assert parsed.hostname == "db.example.com"
    assert parsed.port == 6543
    assert parsed.path == "/tangerine_gateway"
    assert parse_qs(parsed.query)["sslmode"] == ["require"]


def test_explicit_database_url_wins(monkeypatch):
    monkeypatch.setenv("TANGERINE_DATABASE_URL", "postgresql://explicit/db")
    monkeypatch.setenv("POSTGRES_HOST", "ignored.example.com")
    assert load_settings().database_url == "postgresql://explicit/db"


def test_no_database_environment_falls_back_to_sqlite(tmp_path, monkeypatch):
    for name in (
        "TANGERINE_DATABASE_URL",
        "POSTGRES_HOST",
        "TANGERINE_DATABASE_HOST",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("TANGERINE_DATABASE_PATH", str(tmp_path / "gateway.db"))
    settings = load_settings()
    assert settings.database_url is None
    assert settings.database_path.endswith("gateway.db")


def test_require_database_fails_fast_without_a_url(tmp_path, monkeypatch):
    for name in (
        "TANGERINE_DATABASE_URL",
        "POSTGRES_HOST",
        "TANGERINE_DATABASE_HOST",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("TANGERINE_DATABASE_PATH", str(tmp_path / "gateway.db"))
    monkeypatch.setenv("TANGERINE_REQUIRE_DATABASE", "1")

    try:
        load_settings()
    except RuntimeError as error:
        assert "TANGERINE_REQUIRE_DATABASE" in str(error)
    else:  # pragma: no cover - the assertion documents the expected failure
        raise AssertionError("load_settings should fail without a database URL")
