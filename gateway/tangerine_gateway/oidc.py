"""OpenID Connect discovery, PKCE, and ID-token validation."""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKClient

from .errors import EmailUnverified

DISCOVERY_TTL_SECONDS = 3600
USERNAME_RE = re.compile(r"[^A-Za-z0-9@.+_-]+")
TENANT_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
MULTI_TENANT_AUTHORITIES = ("common", "organizations", "consumers")


def issuer_matches(configured: str, discovered: str) -> bool:
    configured = configured.rstrip("/")
    discovered = discovered.rstrip("/")
    if configured == discovered:
        return True
    if "{tenantid}" in discovered:
        return any(
            configured.endswith(f"/{authority}/v2.0")
            for authority in MULTI_TENANT_AUTHORITIES
        )
    return False


class OidcError(RuntimeError):
    """Raised when discovery, token exchange, or validation fails."""


@dataclass(frozen=True)
class Discovery:
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    end_session_endpoint: str | None
    userinfo_endpoint: str | None
    token_endpoint_auth_methods: tuple[str, ...]
    signing_algorithms: tuple[str, ...]


@dataclass(frozen=True)
class PkcePair:
    verifier: str
    challenge: str


_discovery_cache: dict[str, tuple[float, Discovery]] = {}
_jwk_clients: dict[str, PyJWKClient] = {}


def new_state() -> str:
    return secrets.token_urlsafe(32)


def new_nonce() -> str:
    return secrets.token_urlsafe(24)


def pkce_pair() -> PkcePair:
    verifier = secrets.token_urlsafe(64)[:96]
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return PkcePair(verifier=verifier, challenge=challenge)


async def discover(
    issuer: str,
    *,
    timeout: float = 20.0,
    verify: bool = True,
    use_cache: bool = True,
    strict: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Discovery:
    issuer = issuer.rstrip("/")
    now = time.time()
    if use_cache:
        cached = _discovery_cache.get(issuer)
        if cached and now - cached[0] < DISCOVERY_TTL_SECONDS:
            return cached[1]

    url = f"{issuer}/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            response = await client.get(url, headers={"Accept": "application/json"})
    except httpx.HTTPError as exc:
        raise OidcError(f"could not reach {url}: {exc}") from exc

    if response.status_code != 200:
        raise OidcError(f"{url} returned {response.status_code}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise OidcError(f"{url} did not return JSON") from exc

    try:
        discovery = Discovery(
            issuer=payload["issuer"],
            authorization_endpoint=payload["authorization_endpoint"],
            token_endpoint=payload["token_endpoint"],
            jwks_uri=payload["jwks_uri"],
            end_session_endpoint=payload.get("end_session_endpoint"),
            userinfo_endpoint=payload.get("userinfo_endpoint"),
            token_endpoint_auth_methods=tuple(
                payload.get("token_endpoint_auth_methods_supported") or ["client_secret_basic"]
            ),
            signing_algorithms=tuple(
                payload.get("id_token_signing_alg_values_supported") or ["RS256"]
            ),
        )
    except KeyError as exc:
        raise OidcError(f"{url} is missing {exc.args[0]}") from exc

    if not issuer_matches(issuer, discovery.issuer):
        if strict:
            raise OidcError(
                f"issuer mismatch: configured {issuer!r}, discovery reports {discovery.issuer!r}"
            )
    elif use_cache:
        _discovery_cache[issuer] = (now, discovery)
    return discovery


def authorize_url(
    discovery: Discovery,
    *,
    client_id: str,
    scopes: str,
    redirect_uri: str,
    state: str,
    nonce: str,
    code_challenge: str,
    hosted_domain: str | None = None,
) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    if hosted_domain:
        params["hd"] = hosted_domain
    separator = "&" if "?" in discovery.authorization_endpoint else "?"
    return f"{discovery.authorization_endpoint}{separator}{urlencode(params)}"


async def exchange_code(
    discovery: Discovery,
    *,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    timeout: float = 20.0,
    verify: bool = True,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Mapping[str, Any]:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "code_verifier": code_verifier,
    }
    auth = None
    if "client_secret_post" in discovery.token_endpoint_auth_methods:
        data["client_secret"] = client_secret
    else:
        auth = (client_id, client_secret)

    try:
        async with httpx.AsyncClient(
            timeout=timeout, verify=verify, transport=transport
        ) as client:
            response = await client.post(
                discovery.token_endpoint,
                data=data,
                auth=auth,
                headers={"Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise OidcError(f"token endpoint unreachable: {exc}") from exc

    if response.status_code != 200:
        raise OidcError(f"token endpoint returned {response.status_code}: {response.text[:200]}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise OidcError("token endpoint did not return JSON") from exc
    if "id_token" not in payload:
        raise OidcError("token response did not include an id_token")
    return payload


def validate_id_token(
    token: str,
    discovery: Discovery,
    *,
    client_id: str,
    nonce: str | None = None,
    allowed_tenants: list[str] | None = None,
) -> dict[str, Any]:
    """Verify signature, issuer, audience, expiry, nonce, and tenant scope."""

    client = _jwk_clients.get(discovery.jwks_uri)
    if client is None:
        client = PyJWKClient(discovery.jwks_uri)
        _jwk_clients[discovery.jwks_uri] = client

    template = "{tenantid}" in discovery.issuer
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        decode_options = {"require": ["exp", "iat", "iss", "aud"]}
        if template:
            decode_options["verify_iss"] = False
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=list(discovery.signing_algorithms),
            audience=client_id,
            issuer=None if template else discovery.issuer,
            options=decode_options,
        )
    except jwt.PyJWTError as exc:
        raise OidcError(f"id_token validation failed: {exc}") from exc

    if template:
        tenant_id = claims.get("tid")
        if not isinstance(tenant_id, str) or not TENANT_ID_RE.match(tenant_id):
            raise OidcError("id_token is missing a valid Microsoft tenant id")
        expected_issuer = discovery.issuer.replace("{tenantid}", tenant_id)
        if claims.get("iss") != expected_issuer:
            raise OidcError(
                f"id_token issuer {claims.get('iss')!r} does not match {expected_issuer!r}"
            )
        if allowed_tenants:
            allowed = {tenant.lower() for tenant in allowed_tenants}
            if tenant_id.lower() not in allowed:
                raise OidcError(f"tenant {tenant_id} is not allowed for this provider")

    if nonce is not None and claims.get("nonce") != nonce:
        raise OidcError("id_token nonce does not match the login request")

    return claims


def username_from_claims(
    claims: Mapping[str, Any],
    *,
    claim: str | None = None,
    prefix: str | None = None,
    require_email_verified: bool = False,
) -> str:
    """Pick a stable, Django-compatible username from the ID-token claims.

    ``claim`` restricts extraction to one claim; without it the historical
    preferred_username/upn/email/sub order is used.
    """

    keys = (claim,) if claim else ("preferred_username", "upn", "email", "sub")
    for key in keys:
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            if key == "email" and require_email_verified and claims.get("email_verified") is not True:
                raise EmailUnverified()
            username = value.strip()
            username = USERNAME_RE.sub("_", username)[:150]
            if prefix:
                username = f"{prefix}{username}"[:150]
            if username:
                return username
    if claim:
        raise OidcError(f"id_token claim {claim!r} did not contain a usable username")
    raise OidcError("id_token did not contain a usable username claim")


def end_session_url(discovery: Discovery, *, id_token: str | None, post_logout_redirect: str) -> str | None:
    if not discovery.end_session_endpoint:
        return None
    params: dict[str, str] = {"post_logout_redirect_uri": post_logout_redirect}
    if id_token:
        params["id_token_hint"] = id_token
    separator = "&" if "?" in discovery.end_session_endpoint else "?"
    return f"{discovery.end_session_endpoint}{separator}{urlencode(params)}"
