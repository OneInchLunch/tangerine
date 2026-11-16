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
    require_email_verified INTEGER NOT NULL DEFAULT 0,
    allowed_tenants TEXT NOT NULL DEFAULT '[]',
    fetch_graph_groups INTEGER NOT NULL DEFAULT 0,
    fetch_google_groups INTEGER NOT NULL DEFAULT 0,
    google_service_account_file TEXT,
    google_admin_email TEXT,
    group_map TEXT NOT NULL,
    role_map TEXT NOT NULL,
    enabled INTEGER NOT NULL,
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
    expires_at REAL NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_states (
    state TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    next_path TEXT NOT NULL,
    preview INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_states_created_idx ON auth_states(created_at);
CREATE INDEX IF NOT EXISTS provider_audit_created_idx ON provider_audit(created_at);
