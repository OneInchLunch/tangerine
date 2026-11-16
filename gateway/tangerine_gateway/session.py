"""Opaque session tokens.

The cookie carries a random token; only its SHA-256 digest is stored. That keeps
the session table useless to anyone who reads it and lets logout revoke
immediately.
"""

from __future__ import annotations

import hashlib
import secrets

TOKEN_BYTES = 32


def new_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
