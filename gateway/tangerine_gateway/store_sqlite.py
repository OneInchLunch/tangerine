"""SQLite backend for local development and unit tests."""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping

from .store_base import Store
from .store_provider import ProviderPersistence
from .store_models import (
    MIGRATIONS_DIR,
    IdentityAssertion,
    Provider,
    Session,
    StoreError,
    _now_iso,
    _PROVIDER_INSERT_SQL,
    _PROVIDER_UPDATE_SQL,
    _provider_insert_params,
    _provider_update_params,
    _row_to_provider,
    _validate,
)

class SqliteStore(ProviderPersistence, Store):
    """Local development and unit-test backend. Not used in deployments."""
    _placeholder = "?"

    def __init__(self, database_path: str | Path) -> None:
        self._path = Path(database_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    @contextmanager
    def _cursor(self) -> Iterator[sqlite3.Cursor]:
        connection = self._connect()
        try:
            with connection:
                yield connection.cursor()
        finally:
            connection.close()

    def migrate(self) -> None:
        connection = self._connect()
        try:
            with connection:
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migrations "
                    "(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
                )
                applied = {
                    row["version"]
                    for row in connection.execute("SELECT version FROM schema_migrations")
                }
                for path in sorted((MIGRATIONS_DIR / "sqlite").glob("*.sql")):
                    version = path.stem
                    if version in applied:
                        continue
                    connection.executescript(path.read_text())
                    connection.execute(
                        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                        (version, _now_iso()),
                    )
        finally:
            connection.close()

    def ping(self) -> bool:
        with self._cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone() is not None

    def close(self) -> None:
        return None

    def create_session(
        self,
        *,
        token_hash: str,
        username: str,
        provider_id: str | None,
        subject: str | None,
        id_token: str | None,
        expires_at: float,
    ) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "INSERT INTO sessions (token_hash, username, provider_id, subject, id_token, "
                "expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (token_hash, username, provider_id, subject, id_token, expires_at, time.time()),
            )

    def get_session(self, token_hash: str, now: float | None = None) -> Session | None:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            row = cursor.execute(
                "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?",
                (token_hash, now),
            ).fetchone()
        if row is None:
            return None
        return Session(
            username=row["username"],
            provider_id=row["provider_id"],
            subject=row["subject"],
            id_token=row["id_token"],
            expires_at=row["expires_at"],
        )

    def delete_session(self, token_hash: str) -> None:
        with self._cursor() as cursor:
            cursor.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def delete_sessions_for_username(self, username: str) -> None:
        with self._cursor() as cursor:
            cursor.execute("DELETE FROM sessions WHERE username = ?", (username,))

    def delete_sessions_for_provider(self, provider_id: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM sessions WHERE provider_id = ?", (provider_id,)
            )

    def list_repository_scopes(
        self, *, provider_id: str | None = None, group_name: str | None = None
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM repository_scopes"
        clauses: list[str] = []
        params: list[Any] = []
        if provider_id is not None:
            clauses.append("provider_id = ?")
            params.append(provider_id)
        if group_name is not None:
            clauses.append("group_name = ?")
            params.append(group_name)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at, repository_prn"
        with self._cursor() as cursor:
            rows = cursor.execute(query, params).fetchall()
        return [
            {
                "providerId": row["provider_id"],
                "groupName": row["group_name"],
                "repositoryPrn": row["repository_prn"],
                "source": row["source"],
                "createdBy": row["created_by"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def add_repository_scope(
        self,
        *,
        provider_id: str,
        group_name: str,
        repository_prn: str,
        source: str = "created",
        created_by: str | None = None,
        created_at: float | None = None,
    ) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "INSERT INTO repository_scopes "
                "(provider_id, group_name, repository_prn, source, created_by, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(provider_id, group_name, repository_prn) DO UPDATE SET "
                "source = excluded.source, created_by = excluded.created_by, "
                "created_at = excluded.created_at",
                (
                    provider_id,
                    group_name,
                    repository_prn,
                    source,
                    created_by,
                    time.time() if created_at is None else created_at,
                ),
            )

    def remove_repository_scope(
        self, *, provider_id: str, group_name: str, repository_prn: str
    ) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM repository_scopes WHERE provider_id = ? AND group_name = ? "
                "AND repository_prn = ?",
                (provider_id, group_name, repository_prn),
            )

    def delete_repository_scopes_for_provider(self, provider_id: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM repository_scopes WHERE provider_id = ?", (provider_id,)
            )

    def delete_repository_scope_for_prn(self, repository_prn: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM repository_scopes WHERE repository_prn = ?",
                (repository_prn,),
            )

    def delete_repository_scopes_for_group(
        self, *, group_name: str, provider_id: str | None = None
    ) -> None:
        query = "DELETE FROM repository_scopes WHERE group_name = ?"
        params: list[Any] = [group_name]
        if provider_id is not None:
            query += " AND provider_id = ?"
            params.append(provider_id)
        with self._cursor() as cursor:
            cursor.execute(query, params)

    def count_sessions(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            return int(
                cursor.execute(
                    "SELECT COUNT(*) FROM sessions WHERE expires_at > ?", (now,)
                ).fetchone()[0]
            )

    def create_auth_state(
        self,
        *,
        state: str,
        provider_id: str,
        code_verifier: str,
        nonce: str,
        next_path: str,
        preview: bool = False,
        created_at: float | None = None,
    ) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "INSERT INTO auth_states (state, provider_id, code_verifier, nonce, next_path, "
                "preview, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    state,
                    provider_id,
                    code_verifier,
                    nonce,
                    next_path,
                    1 if preview else 0,
                    created_at or time.time(),
                ),
            )

    def pop_auth_state(self, state: str, max_age_seconds: int) -> dict[str, Any] | None:
        now = time.time()
        with self._cursor() as cursor:
            row = cursor.execute("SELECT * FROM auth_states WHERE state = ?", (state,)).fetchone()
            cursor.execute("DELETE FROM auth_states WHERE state = ?", (state,))
        if row is None or now - row["created_at"] > max_age_seconds:
            return None
        return {
            "provider_id": row["provider_id"],
            "code_verifier": row["code_verifier"],
            "nonce": row["nonce"],
            "next_path": row["next_path"],
            "preview": bool(row["preview"]),
        }

    def purge_expired(
        self,
        *,
        now: float | None = None,
        state_ttl_seconds: int = 3600,
        audit_retention_days: int = 90,
    ) -> None:
        now = time.time() if now is None else now
        audit_cutoff = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - audit_retention_days * 86400)
        )
        with self._cursor() as cursor:
            cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            cursor.execute(
                "DELETE FROM auth_states WHERE created_at <= ?", (now - state_ttl_seconds,)
            )
            if audit_retention_days > 0:
                cursor.execute(
                    "DELETE FROM provider_audit WHERE created_at <= ?", (audit_cutoff,)
                )

    def upsert_identity_assertion(
        self,
        *,
        provider_id: str,
        subject: str,
        username: str,
        groups: list[str] | None,
        roles: list[str] | None,
        asserted_at: float | None = None,
    ) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "INSERT INTO identity_assertions "
                "(provider_id, subject, username, group_values, role_values, asserted_at) "
                "VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(provider_id, subject) DO UPDATE SET "
                "username = excluded.username, group_values = excluded.group_values, "
                "role_values = excluded.role_values, asserted_at = excluded.asserted_at",
                (
                    provider_id,
                    subject,
                    username,
                    json.dumps(groups) if groups is not None else None,
                    json.dumps(roles) if roles is not None else None,
                    time.time() if asserted_at is None else asserted_at,
                ),
            )

    def list_identity_assertions(
        self, *, max_age_seconds: int, now: float | None = None
    ) -> list[IdentityAssertion]:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            rows = cursor.execute(
                "SELECT * FROM identity_assertions WHERE asserted_at >= ? "
                "ORDER BY asserted_at",
                (now - max_age_seconds,),
            ).fetchall()
        return [
            IdentityAssertion(
                provider_id=row["provider_id"],
                subject=row["subject"],
                username=row["username"],
                groups=json.loads(row["group_values"]) if row["group_values"] else None,
                roles=json.loads(row["role_values"]) if row["role_values"] else None,
                asserted_at=row["asserted_at"],
            )
            for row in rows
        ]

    def list_identity_assertions_for_provider(
        self, provider_id: str
    ) -> list[IdentityAssertion]:
        with self._cursor() as cursor:
            rows = cursor.execute(
                "SELECT * FROM identity_assertions WHERE provider_id = ? "
                "ORDER BY asserted_at",
                (provider_id,),
            ).fetchall()
        return [
            IdentityAssertion(
                provider_id=row["provider_id"],
                subject=row["subject"],
                username=row["username"],
                groups=json.loads(row["group_values"]) if row["group_values"] else None,
                roles=json.loads(row["role_values"]) if row["role_values"] else None,
                asserted_at=row["asserted_at"],
            )
            for row in rows
        ]

    def delete_identity_assertions(self, provider_id: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM identity_assertions WHERE provider_id = ?", (provider_id,)
            )

    def purge_identity_assertions(
        self, *, max_age_seconds: int, now: float | None = None
    ) -> None:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM identity_assertions WHERE asserted_at < ?",
                (now - max_age_seconds,),
            )


