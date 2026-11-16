"""Environment configuration for the Tangerine SSO gateway.

Everything is read once at import time. Secrets (client secrets, the Pulp
service-account password) are files or environment variables supplied by the
deployment; nothing is persisted by this module.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import quote, urlparse

ENV_PREFIX = "TANGERINE_"


def _text(name: str, default: str | None = None) -> str:
    value = os.environ.get(ENV_PREFIX + name, default)
    if value is None:
        raise RuntimeError(f"{ENV_PREFIX}{name} is required")
    return value


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(ENV_PREFIX + name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.environ.get(ENV_PREFIX + name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value is not None and value.strip():
            return value.strip()
    return ""


def _list(name: str) -> list[str]:
    raw = os.environ.get(ENV_PREFIX + name, "")
    return [value.strip() for value in raw.split(",") if value.strip()]


def _database_url() -> str | None:
    """Build a Postgres URL from a DSN or the Pulp-style POSTGRES_* keys."""

    explicit = _env(f"{ENV_PREFIX}DATABASE_URL", "DATABASE_URL")
    if explicit:
        return explicit

    host = _env(f"{ENV_PREFIX}DATABASE_HOST", "POSTGRES_HOST")
    if not host:
        return None

    port = _env(f"{ENV_PREFIX}DATABASE_PORT", "POSTGRES_PORT") or "5432"
    user = _env(f"{ENV_PREFIX}DATABASE_USER", "POSTGRES_USERNAME", "POSTGRES_USER")
    password = _env(f"{ENV_PREFIX}DATABASE_PASSWORD", "POSTGRES_PASSWORD")
    name = _env(f"{ENV_PREFIX}DATABASE_NAME", "POSTGRES_DB_NAME", "POSTGRES_DB")
    sslmode = (
        _env(f"{ENV_PREFIX}DATABASE_SSLMODE", "POSTGRES_SSLMODE", "POSTGRES_SSL_MODE")
        or "prefer"
    )
    if not user or not name:
        raise RuntimeError(
            "database host is set but POSTGRES_USERNAME or POSTGRES_DB_NAME is missing"
        )
    return (
        f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@{host}:{port}/{quote(name, safe='')}?sslmode={sslmode}"
    )


def _float(name: str, default: float) -> float:
    raw = os.environ.get(ENV_PREFIX + name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    pulp_url: str
    pulp_user: str
    pulp_password: str
    database_path: str
    secrets_dir: str
    external_base_url: str
    ui_base_path: str
    gateway_base_path: str
    session_ttl_seconds: int
    state_ttl_seconds: int
    cookie_secure: bool
    managed_group: str | None
    admin_group: str | None
    allow_http_issuers: bool
    http_timeout: float
    verify_tls: bool
    additive_mode: bool
    database_url: str | None = None
    token_encryption_key: str | None = None
    purge_interval_seconds: int = 15 * 60
    audit_retention_days: int = 90
    protected_groups: list[str] = field(default_factory=list)
    reconcile_interval_seconds: int = 0
    reconcile_max_age_seconds: int = 14 * 24 * 3600
    superadmin_group: str | None = None
    rate_limit_per_minute: int = 60
    rate_limit_burst: int = 20
    rate_limit_global_per_minute: int = 600
    trusted_proxies: list[str] = field(default_factory=list)
    pulp_api_path: str = "/pulp/api/v3/"
    require_database: bool = False
    scoped_task_timeout_seconds: float = 30.0

    @property
    def cookie_prefix(self) -> str:
        return "__Host-" if self.cookie_secure else ""

    @property
    def session_cookie(self) -> str:
        return f"{self.cookie_prefix}tg_session"

    @property
    def state_cookie(self) -> str:
        return f"{self.cookie_prefix}tg_state"

    @property
    def csrf_cookie(self) -> str:
        return f"{self.cookie_prefix}tg_csrf"

    @property
    def callback_url(self) -> str:
        return f"{self.external_base_url.rstrip('/')}{self.gateway_base_path}callback"

    @property
    def origin(self) -> str:
        parsed = urlparse(self.external_base_url)
        return f"{parsed.scheme}://{parsed.netloc}"


def load_settings() -> Settings:
    external_base_url = _text("EXTERNAL_BASE_URL", "http://localhost:5173")
    secure_default = external_base_url.startswith("https://")
    database_url = _database_url()
    require_database = _bool("REQUIRE_DATABASE", False)
    if require_database and database_url is None:
        raise RuntimeError(
            "TANGERINE_REQUIRE_DATABASE is set but no database URL or host is configured"
        )
    pulp_api_path = "/" + _text("PULP_API_PATH", "/pulp/api/v3/").strip("/") + "/"
    return Settings(
        pulp_url=_text("PULP_URL", "http://localhost:8080").rstrip("/"),
        pulp_user=_text("PULP_USER", "admin"),
        pulp_password=_text("PULP_PASSWORD", ""),
        database_url=database_url,
        database_path=_text("DATABASE_PATH", "/tmp/tangerine-gateway.db"),
        secrets_dir=_text("SECRETS_DIR", "/tmp/tangerine-secrets"),
        external_base_url=external_base_url.rstrip("/"),
        ui_base_path=_text("UI_BASE_PATH", "/ui/"),
        gateway_base_path=_text("GATEWAY_BASE_PATH", "/sso/"),
        session_ttl_seconds=_int("SESSION_TTL_SECONDS", 8 * 60 * 60),
        state_ttl_seconds=_int("STATE_TTL_SECONDS", 10 * 60),
        cookie_secure=_bool("COOKIE_SECURE", secure_default),
        managed_group=os.environ.get(ENV_PREFIX + "MANAGED_GROUP") or None,
        admin_group=os.environ.get(ENV_PREFIX + "ADMIN_GROUP") or None,
        superadmin_group=os.environ.get(ENV_PREFIX + "SUPERADMIN_GROUP") or None,
        # Development-only escape hatch for a local mock IdP reachable over
        # plain HTTP. Production issuers must remain https.
        allow_http_issuers=_bool("ALLOW_HTTP_ISSUERS", False),
        http_timeout=_float("HTTP_TIMEOUT_SECONDS", 20.0),
        verify_tls=_bool("VERIFY_TLS", True),
        additive_mode=_bool("ADDITIVE_MODE", True),
        token_encryption_key=_env(f"{ENV_PREFIX}TOKEN_ENCRYPTION_KEY") or None,
        purge_interval_seconds=_int("PURGE_INTERVAL_SECONDS", 15 * 60),
        audit_retention_days=_int("AUDIT_RETENTION_DAYS", 90),
        protected_groups=_list("PROTECTED_GROUPS"),
        reconcile_interval_seconds=_int("RECONCILE_INTERVAL_SECONDS", 0),
        reconcile_max_age_seconds=_int("RECONCILE_MAX_AGE_SECONDS", 14 * 24 * 3600),
        rate_limit_per_minute=_int("RATE_LIMIT_PER_MINUTE", 60),
        rate_limit_burst=_int("RATE_LIMIT_BURST", 20),
        rate_limit_global_per_minute=_int("RATE_LIMIT_GLOBAL_PER_MINUTE", 600),
        trusted_proxies=_list("TRUSTED_PROXIES"),
        pulp_api_path=pulp_api_path,
        require_database=require_database,
        scoped_task_timeout_seconds=_float("SCOPED_TASK_TIMEOUT_SECONDS", 30.0),
    )
