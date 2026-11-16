CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    secret_file TEXT NOT NULL,
    scopes TEXT NOT NULL,
    group_claim TEXT,
    role_claim TEXT,
    username_claim TEXT,
    username_prefix TEXT,
    require_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_tenants TEXT NOT NULL DEFAULT '[]',
    fetch_graph_groups BOOLEAN NOT NULL DEFAULT FALSE,
    fetch_google_groups BOOLEAN NOT NULL DEFAULT FALSE,
    google_service_account_file TEXT,
    google_admin_email TEXT,
    group_map TEXT NOT NULL,
    role_map TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    provider_id TEXT,
    subject TEXT,
    id_token TEXT,
    expires_at DOUBLE PRECISION NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_states (
    state TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    next_path TEXT NOT NULL,
    preview BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_audit (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_states_created_idx ON auth_states(created_at);
CREATE INDEX IF NOT EXISTS provider_audit_created_idx ON provider_audit(created_at);
