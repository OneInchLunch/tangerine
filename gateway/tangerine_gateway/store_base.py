"""Backend-neutral storage interface for the gateway."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .store_models import IdentityAssertion, Provider, Session

class Store(ABC):
    """Backend-neutral persistence interface."""

    @abstractmethod
    def migrate(self) -> None: ...

    @abstractmethod
    def ping(self) -> bool: ...

    @abstractmethod
    def close(self) -> None: ...

    @abstractmethod
    def list_providers(self, *, enabled_only: bool = False) -> list[Provider]: ...

    @abstractmethod
    def get_provider(self, provider_id: str) -> Provider | None: ...

    @abstractmethod
    def count_providers(self) -> int: ...

    @abstractmethod
    def create_provider(
        self, payload: dict[str, Any], *, allow_http_issuers: bool = False
    ) -> Provider: ...

    @abstractmethod
    def update_provider(
        self,
        provider_id: str,
        payload: dict[str, Any],
        *,
        allow_http_issuers: bool = False,
    ) -> Provider: ...

    @abstractmethod
    def delete_provider(self, provider_id: str) -> bool: ...

    @abstractmethod
    def record_provider_audit(
        self,
        *,
        actor: str,
        action: str,
        provider_id: str,
        detail: str = "",
        created_at: str | None = None,
    ) -> None: ...

    @abstractmethod
    def list_provider_audit(self, *, limit: int = 50) -> list[dict[str, Any]]: ...

    @abstractmethod
    def create_session(
        self,
        *,
        token_hash: str,
        username: str,
        provider_id: str | None,
        subject: str | None,
        id_token: str | None,
        expires_at: float,
    ) -> None: ...

    @abstractmethod
    def get_session(self, token_hash: str, now: float | None = None) -> Session | None: ...

    @abstractmethod
    def delete_session(self, token_hash: str) -> None: ...

    @abstractmethod
    def delete_sessions_for_username(self, username: str) -> None: ...

    @abstractmethod
    def delete_sessions_for_provider(self, provider_id: str) -> None: ...

    @abstractmethod
    def list_repository_scopes(
        self, *, provider_id: str | None = None, group_name: str | None = None
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    def add_repository_scope(
        self,
        *,
        provider_id: str,
        group_name: str,
        repository_prn: str,
        source: str = "created",
        created_by: str | None = None,
        created_at: float | None = None,
    ) -> None: ...

    @abstractmethod
    def remove_repository_scope(
        self, *, provider_id: str, group_name: str, repository_prn: str
    ) -> None: ...

    @abstractmethod
    def delete_repository_scopes_for_provider(self, provider_id: str) -> None: ...

    @abstractmethod
    def delete_repository_scope_for_prn(self, repository_prn: str) -> None: ...

    @abstractmethod
    def delete_repository_scopes_for_group(
        self, *, group_name: str, provider_id: str | None = None
    ) -> None: ...

    @abstractmethod
    def count_sessions(self, now: float | None = None) -> int: ...

    @abstractmethod
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
    ) -> None: ...

    @abstractmethod
    def pop_auth_state(self, state: str, max_age_seconds: int) -> dict[str, Any] | None: ...

    @abstractmethod
    def purge_expired(
        self,
        *,
        now: float | None = None,
        state_ttl_seconds: int = 3600,
        audit_retention_days: int = 90,
    ) -> None: ...

    @abstractmethod
    def upsert_identity_assertion(
        self,
        *,
        provider_id: str,
        subject: str,
        username: str,
        groups: list[str] | None,
        roles: list[str] | None,
        asserted_at: float | None = None,
    ) -> None: ...

    @abstractmethod
    def list_identity_assertions(
        self, *, max_age_seconds: int, now: float | None = None
    ) -> list[IdentityAssertion]: ...

    @abstractmethod
    def list_identity_assertions_for_provider(
        self, provider_id: str
    ) -> list[IdentityAssertion]: ...

    @abstractmethod
    def delete_identity_assertions(self, provider_id: str) -> None: ...

    @abstractmethod
    def purge_identity_assertions(
        self, *, max_age_seconds: int, now: float | None = None
    ) -> None: ...


