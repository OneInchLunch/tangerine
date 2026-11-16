"""Account-domain policy enforced before any provisioning write."""

from __future__ import annotations

from typing import Any, Mapping

from .errors import DomainNotAllowed

_EMAIL_CLAIMS = ("email", "upn", "preferred_username")


def resolved_domain(claims: Mapping[str, Any]) -> str | None:
    """Return the lowercased domain from the first usable email/UPN claim."""

    for key in _EMAIL_CLAIMS:
        value = claims.get(key)
        if isinstance(value, str) and "@" in value:
            domain = value.rsplit("@", 1)[1].strip().lower()
            if domain:
                return domain
    return None


def enforce_domain_policy(
    claims: Mapping[str, Any],
    *,
    allowed_domains: list[str] | tuple[str, ...],
    require_hosted_domain: bool = False,
) -> None:
    """Reject a login whose account domain is outside the provider allowlist.

    An empty allowlist means no restriction. ``require_hosted_domain`` (Google)
    additionally requires the ID token to carry an ``hd`` claim inside the
    allowlist.
    """

    allowed = [domain.strip().lower() for domain in allowed_domains if domain.strip()]
    if not allowed:
        return

    domain = resolved_domain(claims)
    if domain is None:
        raise DomainNotAllowed(None, allowed)
    if domain not in allowed:
        raise DomainNotAllowed(domain, allowed)

    if require_hosted_domain:
        hosted = claims.get("hd")
        if not isinstance(hosted, str) or hosted.strip().lower() not in allowed:
            raise DomainNotAllowed(domain, allowed, hosted=True)
