"""PostgreSQL backend for deployments."""

from __future__ import annotations

import json
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Mapping

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .store_base import Store
from .store_provider import ProviderPersistence
from .store_models import (
    MIGRATIONS_DIR,
    MIGRATION_LOCK_ID,
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

class PostgresStore(ProviderPersistence, Store):
    """Production backend."""
    _placeholder = "%s"

    def __init__(self, database_url: str, *, connect_timeout: float = 30.0) -> None:
        self._pool = ConnectionPool(
            conninfo=database_url,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        self._connect_timeout = connect_timeout

    def _ensure_open(self) -> None:
        if self._pool.closed:
            self._pool.open(wait=True, timeout=self._connect_timeout)

    @contextmanager
    def _cursor(self) -> Iterator[psycopg.Cursor[Any]]:
        self._ensure_open()
        with self._pool.connection() as connection:
            with connection.cursor() as cursor:
                yield cursor

    def migrate(self) -> None:
        self._ensure_open()
        with self._pool.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
                try:
                    cursor.execute(
                        "CREATE TABLE IF NOT EXISTS schema_migrations "
                        "(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
                    )
                    cursor.execute("SELECT version FROM schema_migrations")
                    applied = {row["version"] for row in cursor.fetchall()}
                    for path in sorted((MIGRATIONS_DIR / "postgres").glob("*.sql")):
                        version = path.stem
                        if version in applied:
                            continue
                        cursor.execute(path.read_text())
                        cursor.execute(
                            "INSERT INTO schema_migrations (version) VALUES (%s)", (version,)
                        )
                finally:
                    cursor.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))

    def ping(self) -> bool:
        with self._cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone() is not None

    def close(self) -> None:
        self._pool.close()

    def truncate_for_tests(self) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "TRUNCATE providers, provider_audit, sessions, auth_states, "
                "identity_assertions, repository_scopes RESTART IDENTITY CASCADE"
            )

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
                "expires_at, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (token_hash, username, provider_id, subject, id_token, expires_at, time.time()),
            )

    def get_session(self, token_hash: str, now: float | None = None) -> Session | None:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            cursor.execute(
                "SELECT * FROM sessions WHERE token_hash = %s AND expires_at > %s",
                (token_hash, now),
            )
            row = cursor.fetchone()
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
            cursor.execute("DELETE FROM sessions WHERE token_hash = %s", (token_hash,))

    def delete_sessions_for_username(self, username: str) -> None:
        with self._cursor() as cursor:
            cursor.execute("DELETE FROM sessions WHERE username = %s", (username,))

    def delete_sessions_for_provider(self, provider_id: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM sessions WHERE provider_id = %s", (provider_id,)
            )

    def list_repository_scopes(
        self, *, provider_id: str | None = None, group_name: str | None = None
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM repository_scopes"
        clauses: list[str] = []
        params: list[Any] = []
        if provider_id is not None:
            clauses.append("provider_id = %s")
            params.append(provider_id)
        if group_name is not None:
            clauses.append("group_name = %s")
            params.append(group_name)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at, repository_prn"
        with self._cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()
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
                "VALUES (%s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (provider_id, group_name, repository_prn) DO UPDATE SET "
                "source = EXCLUDED.source, created_by = EXCLUDED.created_by, "
                "created_at = EXCLUDED.created_at",
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
                "DELETE FROM repository_scopes WHERE provider_id = %s AND group_name = %s "
                "AND repository_prn = %s",
                (provider_id, group_name, repository_prn),
            )

    def delete_repository_scopes_for_provider(self, provider_id: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM repository_scopes WHERE provider_id = %s", (provider_id,)
            )

    def delete_repository_scope_for_prn(self, repository_prn: str) -> None:
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM repository_scopes WHERE repository_prn = %s",
                (repository_prn,),
            )

    def delete_repository_scopes_for_group(
        self, *, group_name: str, provider_id: str | None = None
    ) -> None:
        query = "DELETE FROM repository_scopes WHERE group_name = %s"
        params: list[Any] = [group_name]
        if provider_id is not None:
            query += " AND provider_id = %s"
            params.append(provider_id)
        with self._cursor() as cursor:
            cursor.execute(query, params)

    def count_sessions(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) AS count FROM sessions WHERE expires_at > %s", (now,)
            )
            row = cursor.fetchone()
            return int(row["count"]) if row else 0

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
                "preview, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    state,
                    provider_id,
                    code_verifier,
                    nonce,
                    next_path,
                    preview,
                    created_at or time.time(),
                ),
            )

    def pop_auth_state(self, state: str, max_age_seconds: int) -> dict[str, Any] | None:
        now = time.time()
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM auth_states WHERE state = %s "
                "RETURNING provider_id, code_verifier, nonce, next_path, preview, created_at",
                (state,),
            )
            row = cursor.fetchone()
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
            cursor.execute("DELETE FROM sessions WHERE expires_at <= %s", (now,))
            cursor.execute(
                "DELETE FROM auth_states WHERE created_at <= %s", (now - state_ttl_seconds,)
            )
            if audit_retention_days > 0:
                cursor.execute(
                    "DELETE FROM provider_audit WHERE created_at <= %s", (audit_cutoff,)
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
                "VALUES (%s, %s, %s, %s, %s, %s) "
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
            cursor.execute(
                "SELECT * FROM identity_assertions WHERE asserted_at >= %s "
                "ORDER BY asserted_at",
                (now - max_age_seconds,),
            )
            rows = cursor.fetchall()
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
            cursor.execute(
                "SELECT * FROM identity_assertions WHERE provider_id = %s "
                "ORDER BY asserted_at",
                (provider_id,),
            )
            rows = cursor.fetchall()
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
                "DELETE FROM identity_assertions WHERE provider_id = %s", (provider_id,)
            )

    def purge_identity_assertions(
        self, *, max_age_seconds: int, now: float | None = None
    ) -> None:
        now = time.time() if now is None else now
        with self._cursor() as cursor:
            cursor.execute(
                "DELETE FROM identity_assertions WHERE asserted_at < %s",
                (now - max_age_seconds,),
            )


