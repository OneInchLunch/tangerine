"""Path validation shared by the login and callback handlers."""

from __future__ import annotations

import posixpath
from urllib.parse import unquote, urlsplit


def safe_next_path(value: str | None, ui_base_path: str) -> str:
    """Return a destination inside the UI base path, or the base path itself.

    Handles protocol-relative values, encoded dot segments, and backslashes the
    way a browser would resolve them, so a crafted ``next`` cannot leave the app.
    """

    base = ui_base_path if ui_base_path.endswith("/") else f"{ui_base_path}/"
    if not value or not value.startswith("/"):
        return base
    if value.startswith("//") or value.startswith("/\\"):
        return base

    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return base

    raw_path = parts.path.replace("\\", "/")
    normalized = posixpath.normpath(unquote(raw_path))

    if normalized == base.rstrip("/"):
        path = base
    elif normalized.startswith(base):
        path = normalized
    else:
        return base

    if parts.query:
        path = f"{path}?{parts.query}"
    return path
