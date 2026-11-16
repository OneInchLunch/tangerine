"""Read OIDC client secrets from a mounted secret directory.

Secrets live in Kubernetes Secrets mounted as files, never in the provider
database, so a PVC dump cannot expose them. Only the filename is stored.
"""

from __future__ import annotations

from pathlib import Path


class SecretError(RuntimeError):
    """Raised when a secret file is missing or the reference is unsafe."""


def _safe_name(filename: str) -> str:
    if not filename:
        raise SecretError("secret file name is empty")
    if "/" in filename or "\\" in filename or filename in {".", ".."}:
        raise SecretError(f"invalid secret file name: {filename!r}")
    return filename


def read_secret(secrets_dir: str | Path, filename: str) -> str:
    """Return the trimmed contents of ``secrets_dir/filename``."""

    path = Path(secrets_dir) / _safe_name(filename)
    try:
        value = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise SecretError(f"secret file {filename!r} is not mounted") from exc
    except OSError as exc:
        raise SecretError(f"secret file {filename!r} is unreadable: {exc}") from exc
    if not value:
        raise SecretError(f"secret file {filename!r} is empty")
    return value


def list_secrets(secrets_dir: str | Path) -> list[str]:
    """List the mounted secret filenames, for the settings UI picker."""

    directory = Path(secrets_dir)
    if not directory.is_dir():
        return []
    return sorted(
        entry.name
        for entry in directory.iterdir()
        if entry.is_file() and not entry.name.startswith(".")
    )
