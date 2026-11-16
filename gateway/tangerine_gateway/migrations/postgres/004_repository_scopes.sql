-- Dynamic repository scopes granted to an SSO admin group.
CREATE TABLE IF NOT EXISTS repository_scopes (
    provider_id TEXT NOT NULL,
    group_name TEXT NOT NULL,
    repository_prn TEXT NOT NULL,
    source TEXT NOT NULL,
    created_by TEXT,
    created_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (provider_id, group_name, repository_prn)
);

CREATE INDEX IF NOT EXISTS repository_scopes_group_idx
    ON repository_scopes(provider_id, group_name);
