"""Encryption for the ID token kept alongside a gateway session."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

PREFIX = "v1:"


class TokenCipher:
    """Encrypt ID tokens at rest with a Fernet key from the environment."""

    def __init__(self, key: str | None) -> None:
        self._fernet = Fernet(key.encode()) if key else None

    @property
    def enabled(self) -> bool:
        return self._fernet is not None

    def encrypt(self, token: str | None) -> str | None:
        if not token or self._fernet is None:
            return None
        return PREFIX + self._fernet.encrypt(token.encode()).decode()

    def decrypt(self, value: str | None) -> str | None:
        if not value or self._fernet is None or not value.startswith(PREFIX):
            return None
        try:
            return self._fernet.decrypt(value[len(PREFIX) :].encode()).decode()
        except (InvalidToken, ValueError):
            return None
