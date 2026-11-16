"""Persistence for gateway providers, sessions, and pending login states.

Metadata only: client secrets live in mounted files and are referenced by
filename. The one exception is the ID token kept alongside a session so the
gateway can perform an RP-initiated logout; it is encrypted by the caller before
it reaches this layer.

Production uses PostgreSQL. SQLite is retained for local development and the
gateway unit tests, which must not require a database server. The backends live
in `store_sqlite.py` and `store_postgres.py`; this module is the stable facade.
"""

from __future__ import annotations

from pathlib import Path

from .store_base import Store
from .store_models import (
    IdentityAssertion,
    Provider,
    Session,
    StoreError,
    validate_provider_payload,
)
from .store_postgres import PostgresStore
from .store_sqlite import SqliteStore

__all__ = [
    "IdentityAssertion",
    "PostgresStore",
    "Provider",
    "Session",
    "SqliteStore",
    "Store",
    "StoreError",
    "build_store",
    "validate_provider_payload",
]


def build_store(database_url: str | None, database_path: str | Path) -> Store:
    if database_url:
        return PostgresStore(database_url)
    return SqliteStore(database_path)
