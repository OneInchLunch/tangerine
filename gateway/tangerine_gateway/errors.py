"""Identity provisioning errors that map to login-screen error codes."""

from __future__ import annotations


class IdentityError(RuntimeError):
    """A provisioning failure safe to expose as an ``sso_error`` code."""

    code = "provisioning_failed"


class UsernameCollision(IdentityError):
    """An existing non-SSO account already owns the asserted username."""

    code = "username_collision"

    def __init__(self, username: str):
        super().__init__(f"existing local account {username!r} is not SSO-managed")
        self.username = username


class ManagedGroupRequired(IdentityError):
    """TANGERINE_MANAGED_GROUP is required to distinguish SSO accounts."""

    code = "sso_not_configured"

    def __init__(self) -> None:
        super().__init__("TANGERINE_MANAGED_GROUP must be configured before SSO login")


class EmailUnverified(IdentityError):
    """The provider offered an email username without verifying it."""

    code = "email_unverified"

    def __init__(self) -> None:
        super().__init__("the identity provider did not verify the email address")


class DomainNotAllowed(IdentityError):
    """The resolved account domain is outside the provider's allowlist."""

    code = "domain_not_allowed"

    def __init__(self, domain: str | None, allowed: list[str], *, hosted: bool = False):
        if hosted:
            detail = (
                "the identity provider did not assert an hd claim matching the "
                "allowed Workspace domains"
            )
        elif domain:
            detail = f"account domain {domain!r} is not allowed (allowed: {', '.join(allowed)})"
        else:
            detail = "the identity provider did not assert a usable email or UPN domain"
        super().__init__(detail)
        self.domain = domain
        self.allowed = allowed
