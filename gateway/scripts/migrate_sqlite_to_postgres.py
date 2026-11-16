#!/usr/bin/env python3
"""Copy provider configuration from the old gateway SQLite database to Postgres.

Sessions and pending login states are intentionally not copied: users sign in
again after the cutover. Run this before switching the gateway to Postgres.

    python gateway/scripts/migrate_sqlite_to_postgres.py \
        --source /path/to/tangerine-gateway.db \
        --target postgresql://tangerine:...@host:5432/tangerine_gateway
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tangerine_gateway import store  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to the SQLite database")
    parser.add_argument("--target", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = store.SqliteStore(args.source)
    if not source.ping():
        print(f"source database is not readable: {args.source}", file=sys.stderr)
        return 1

    providers = source.list_providers()
    audit = source.list_provider_audit(limit=200)
    print(f"source: {len(providers)} provider(s), {len(audit)} audit row(s)")
    if args.dry_run:
        for provider in providers:
            print(f"  would copy provider {provider.id}")
        return 0

    target = store.PostgresStore(args.target)
    target.migrate()
    for provider in providers:
        try:
            target.create_provider(provider.to_admin(), allow_http_issuers=True)
        except store.StoreError:
            target.update_provider(provider.id, provider.to_admin(), allow_http_issuers=True)
        print(f"copied provider {provider.id}")

    for entry in reversed(audit):
        target.record_provider_audit(
            actor=entry["actor"],
            action=entry["action"],
            provider_id=entry["providerId"],
            detail=entry["detail"],
            created_at=entry["createdAt"],
        )
    print(f"copied {len(audit)} audit row(s)")
    target.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
