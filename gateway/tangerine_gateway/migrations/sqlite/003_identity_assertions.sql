-- Last asserted IdP groups/roles per user, replayed by the background reconciler.
CREATE TABLE IF NOT EXISTS identity_assertions (
    provider_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    username TEXT NOT NULL,
    group_values TEXT,
    role_values TEXT,
    asserted_at REAL NOT NULL,
    PRIMARY KEY (provider_id, subject)
);

CREATE INDEX IF NOT EXISTS identity_assertions_asserted_idx
    ON identity_assertions(asserted_at);
