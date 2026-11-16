"""Operational commands for Kubernetes Jobs and local operators."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from . import store
from .directory import DirectoryError, apply_directory, directory_usernames
from .managed_roles import ensure_managed_roles
from .pulp import PulpClient, PulpError
from .secrets import SecretError, read_secret
from .settings import Settings, load_settings


def _store(settings: Settings) -> store.Store:
    return store.build_store(settings.database_url, settings.database_path)


def _pulp(settings: Settings) -> PulpClient:
    return PulpClient(
        settings.pulp_url,
        settings.pulp_user,
        settings.pulp_password,
        verify=settings.verify_tls,
        timeout=settings.http_timeout,
        api_path=settings.pulp_api_path,
    )


def _cmd_migrate(settings: Settings) -> int:
    backend = _store(settings)
    try:
        backend.migrate()
        print("migrations complete")
        return 0
    finally:
        backend.close()


async def _cmd_ensure_roles(settings: Settings) -> int:
    pulp = _pulp(settings)
    try:
        changed = await ensure_managed_roles(pulp)
        print(json.dumps({"changed": changed}))
        return 0
    finally:
        await pulp.aclose()


def _cmd_check_secrets(settings: Settings) -> int:
    backend = _store(settings)
    failures = 0
    try:
        for provider in backend.list_providers(enabled_only=True):
            try:
                read_secret(settings.secrets_dir, provider.secret_file)
                readable = True
            except SecretError:
                readable = False
            print(f"{provider.id}: secretFile={provider.secret_file} readable={readable}")
            if not readable:
                failures += 1
        return 1 if failures else 0
    finally:
        backend.close()


async def _cmd_reconcile_assertions(settings: Settings) -> int:
    from .main import reconcile_assertions

    backend = _store(settings)
    pulp = _pulp(settings)
    try:
        result = await reconcile_assertions(settings, backend, pulp)
        print(json.dumps(result))
        return 0 if not result.get("errors") else 1
    finally:
        await pulp.aclose()
        backend.close()


async def _run_directory(
    settings: Settings,
    authorized: set[str],
    *,
    apply: bool,
    provider_id: str | None = None,
) -> int:
    backend = _store(settings)
    pulp = _pulp(settings)
    try:
        result = await apply_directory(
            settings=settings,
            backend=backend,
            pulp=pulp,
            authorized=authorized,
            apply=apply,
            provider_id=provider_id,
        )
        print(json.dumps(result))
        return 0
    finally:
        await pulp.aclose()
        backend.close()


async def _cmd_prune_identities(
    settings: Settings, *, directory_file: Path, apply: bool
) -> int:
    payload = json.loads(directory_file.read_text())
    authorized = {str(value) for value in payload.get("usernames") or []}
    if not authorized and not payload.get("allow_empty"):
        print(
            "refusing to prune with an empty authorized list; set allow_empty=true",
            file=sys.stderr,
        )
        return 2
    return await _run_directory(settings, authorized, apply=apply)


async def _cmd_sync_directory(
    settings: Settings, *, provider_id: str, apply: bool
) -> int:
    backend = _store(settings)
    provider = backend.get_provider(provider_id)
    backend.close()
    if provider is None or not provider.enabled:
        print(f"enabled provider {provider_id!r} was not found", file=sys.stderr)
        return 2
    try:
        authorized = await directory_usernames(provider, settings=settings)
    except DirectoryError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(f"directory users for {provider_id}: {len(authorized)}")
    return await _run_directory(
        settings, authorized, apply=apply, provider_id=provider_id
    )

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate")
    sub.add_parser("ensure-roles")
    sub.add_parser("check-secrets")
    sub.add_parser("reconcile-assertions")
    prune = sub.add_parser("prune-identities")
    prune.add_argument("--directory-file", type=Path, required=True)
    prune.add_argument("--apply", action="store_true")
    sync = sub.add_parser("sync-directory")
    sync.add_argument("--provider", required=True)
    sync.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    settings = load_settings()
    if args.command == "migrate":
        return _cmd_migrate(settings)
    if args.command == "ensure-roles":
        return asyncio.run(_cmd_ensure_roles(settings))
    if args.command == "check-secrets":
        return _cmd_check_secrets(settings)
    if args.command == "reconcile-assertions":
        return asyncio.run(_cmd_reconcile_assertions(settings))
    if args.command == "prune-identities":
        return asyncio.run(
            _cmd_prune_identities(
                settings, directory_file=args.directory_file, apply=args.apply
            )
        )
    if args.command == "sync-directory":
        return asyncio.run(
            _cmd_sync_directory(settings, provider_id=args.provider, apply=args.apply)
        )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
