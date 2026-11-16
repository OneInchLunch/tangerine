"""One provider persistence path shared by the SQLite and PostgreSQL backends.

Both drivers expose ``execute``/``fetchone``/``fetchall`` and row objects that
index by column name, so the only dialect difference is the placeholder token.
Each backend sets :attr:`ProviderPersistence._placeholder` and inherits these
methods instead of repeating them.
"""

from __future__ import annotations

from typing import Any, ClassVar

from .store_models import (
    Provider,
    StoreError,
    _now_iso,
    _PROVIDER_INSERT_SQL,
    _PROVIDER_UPDATE_SQL,
    _provider_insert_params,
    _provider_update_params,
    _row_to_provider,
    _validate,
)


class ProviderPersistence:
    _placeholder: ClassVar[str] = "?"

    def list_providers(self, *, enabled_only: bool = False) -> list[Provider]:
        query = "SELECT * FROM providers"
        params: tuple[Any, ...] = ()
        if enabled_only:
            query += f" WHERE enabled = {self._placeholder}"
            params = (True,)
        query += " ORDER BY sort_order, label"
        with self._cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()
        return [_row_to_provider(row) for row in rows]

    def get_provider(self, provider_id: str) -> Provider | None:
        with self._cursor() as cursor:
            cursor.execute(
                f"SELECT * FROM providers WHERE id = {self._placeholder}",
                (provider_id,),
            )
            row = cursor.fetchone()
        return _row_to_provider(row) if row else None

    def count_providers(self) -> int:
        with self._cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM providers")
            row = cursor.fetchone()
        return int(row["count"]) if row else 0

    def create_provider(
        self, payload: dict[str, Any], *, allow_http_issuers: bool = False
    ) -> Provider:
        values = _validate(payload, require_id=True, allow_http_issuers=allow_http_issuers)
        now = _now_iso()
        placeholders = ", ".join([self._placeholder] * 29)
        with self._cursor() as cursor:
            cursor.execute(
                _PROVIDER_INSERT_SQL.format(placeholders=placeholders),
                _provider_insert_params(values, now),
            )
        created = self.get_provider(values["id"])
        assert created is not None
        return created

    def update_provider(
        self,
        provider_id: str,
        payload: dict[str, Any],
        *,
        allow_http_issuers: bool = False,
    ) -> Provider:
        existing = self.get_provider(provider_id)
        if existing is None:
            raise StoreError(f"provider {provider_id!r} does not exist")
        merged = {**existing.to_admin(), **payload, "id": provider_id}
        values = _validate(merged, require_id=False, allow_http_issuers=allow_http_issuers)
        with self._cursor() as cursor:
            cursor.execute(
                _PROVIDER_UPDATE_SQL.format(p=self._placeholder),
                _provider_update_params(values, _now_iso()),
            )
        updated = self.get_provider(provider_id)
        assert updated is not None
        return updated

    def delete_provider(self, provider_id: str) -> bool:
        with self._cursor() as cursor:
            cursor.execute(
                f"DELETE FROM repository_scopes WHERE provider_id = {self._placeholder}",
                (provider_id,),
            )
            cursor.execute(
                f"DELETE FROM providers WHERE id = {self._placeholder}",
                (provider_id,),
            )
            return cursor.rowcount > 0

    def record_provider_audit(
        self,
        *,
        actor: str,
        action: str,
        provider_id: str,
        detail: str = "",
        created_at: str | None = None,
    ) -> None:
        markers = ", ".join([self._placeholder] * 5)
        with self._cursor() as cursor:
            cursor.execute(
                "INSERT INTO provider_audit (actor, action, provider_id, detail, created_at) "
                f"VALUES ({markers})",
                (actor, action, provider_id, detail, created_at or _now_iso()),
            )

    def list_provider_audit(self, *, limit: int = 50) -> list[dict[str, Any]]:
        with self._cursor() as cursor:
            cursor.execute(
                "SELECT id, actor, action, provider_id, detail, created_at "
                f"FROM provider_audit ORDER BY id DESC LIMIT {self._placeholder}",
                (max(1, min(limit, 200)),),
            )
            rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "actor": row["actor"],
                "action": row["action"],
                "providerId": row["provider_id"],
                "detail": row["detail"] or "",
                "createdAt": row["created_at"],
            }
            for row in rows
        ]
