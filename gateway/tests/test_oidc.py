import asyncio
import base64
import hashlib
import time
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from tangerine_gateway import oidc
from tangerine_gateway.errors import EmailUnverified

ISSUER = "https://idp.example.com"
JWKS_URI = f"{ISSUER}/jwks"
CLIENT_ID = "tangerine"


def discovery_document(**overrides):
    document = {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/authorize",
        "token_endpoint": f"{ISSUER}/token",
        "jwks_uri": JWKS_URI,
        "end_session_endpoint": f"{ISSUER}/logout",
        "id_token_signing_alg_values_supported": ["RS256"],
        "token_endpoint_auth_methods_supported": ["client_secret_post"],
    }
    document.update(overrides)
    return document


def make_discovery(**overrides):
    document = discovery_document(**overrides)
    return oidc.Discovery(
        issuer=document["issuer"],
        authorization_endpoint=document["authorization_endpoint"],
        token_endpoint=document["token_endpoint"],
        jwks_uri=document["jwks_uri"],
        end_session_endpoint=document.get("end_session_endpoint"),
        userinfo_endpoint=document.get("userinfo_endpoint"),
        token_endpoint_auth_methods=tuple(
            document.get("token_endpoint_auth_methods_supported") or ["client_secret_basic"]
        ),
        signing_algorithms=tuple(
            document.get("id_token_signing_alg_values_supported") or ["RS256"]
        ),
    )


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture()
def stub_jwks(monkeypatch, signing_key):
    class StubJwkClient:
        def get_signing_key_from_jwt(self, _token):
            return SimpleNamespace(key=signing_key.public_key())

    monkeypatch.setitem(oidc._jwk_clients, JWKS_URI, StubJwkClient())
    return signing_key


def id_token(key, claims):
    payload = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "sub": "subject-1",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "nonce": "nonce-1",
        "preferred_username": "alice",
    }
    payload.update(claims)
    return jwt.encode(payload, key, algorithm="RS256")


def test_discovery_parses_the_document_and_rejects_issuer_mismatch():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/.well-known/openid-configuration"
        return httpx.Response(200, json=discovery_document())

    transport = httpx.MockTransport(handler)
    discovery = asyncio.run(oidc.discover(ISSUER, transport=transport, use_cache=False))
    assert discovery.authorization_endpoint == f"{ISSUER}/authorize"
    assert discovery.end_session_endpoint == f"{ISSUER}/logout"

    def mismatched(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=discovery_document(issuer="https://other.example.com"))

    transport = httpx.MockTransport(mismatched)
    with pytest.raises(oidc.OidcError):
        asyncio.run(oidc.discover(ISSUER, transport=transport, use_cache=False))


def test_discovery_reports_http_failures():
    transport = httpx.MockTransport(lambda request: httpx.Response(404))
    with pytest.raises(oidc.OidcError):
        asyncio.run(oidc.discover(ISSUER, transport=transport, use_cache=False))


def test_issuer_matches_microsoft_multi_tenant_template():
    template = "https://login.microsoftonline.com/{tenantid}/v2.0"
    assert oidc.issuer_matches("https://login.microsoftonline.com/common/v2.0", template)
    assert oidc.issuer_matches("https://login.microsoftonline.com/organizations/v2.0", template)
    assert not oidc.issuer_matches("https://login.microsoftonline.com/example/v2.0", template)


def test_pkce_pair_uses_s256():
    pair = oidc.pkce_pair()
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(pair.verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    assert pair.challenge == expected
    assert 43 <= len(pair.verifier) <= 128


def test_authorize_url_carries_pkce_state_and_nonce():
    discovery = make_discovery()
    url = oidc.authorize_url(
        discovery,
        client_id=CLIENT_ID,
        scopes="openid profile",
        redirect_uri="https://pulp.example.com/sso/callback",
        state="state-1",
        nonce="nonce-1",
        code_challenge="challenge-1",
    )
    assert url.startswith(f"{ISSUER}/authorize?")
    assert "code_challenge_method=S256" in url
    assert "state=state-1" in url
    assert "nonce=nonce-1" in url
    assert "response_type=code" in url


def test_validate_id_token_accepts_a_valid_token(stub_jwks):
    token = id_token(stub_jwks, {})
    claims = oidc.validate_id_token(token, make_discovery(), client_id=CLIENT_ID, nonce="nonce-1")
    assert claims["preferred_username"] == "alice"


def test_validate_id_token_rejects_bad_audience(stub_jwks):
    token = id_token(stub_jwks, {"aud": "someone-else"})
    with pytest.raises(oidc.OidcError):
        oidc.validate_id_token(token, make_discovery(), client_id=CLIENT_ID, nonce="nonce-1")


def test_validate_id_token_rejects_expired_tokens(stub_jwks):
    token = id_token(stub_jwks, {"exp": int(time.time()) - 30, "iat": int(time.time()) - 60})
    with pytest.raises(oidc.OidcError):
        oidc.validate_id_token(token, make_discovery(), client_id=CLIENT_ID, nonce="nonce-1")


def test_validate_id_token_rejects_a_mismatched_nonce(stub_jwks):
    token = id_token(stub_jwks, {})
    with pytest.raises(oidc.OidcError):
        oidc.validate_id_token(token, make_discovery(), client_id=CLIENT_ID, nonce="other")


def test_validate_id_token_accepts_a_multi_tenant_token(stub_jwks):
    tenant = "72f988bf-86f1-41af-91ab-2d7cd011db47"
    discovery = make_discovery(
        issuer="https://login.microsoftonline.com/{tenantid}/v2.0"
    )
    token = id_token(
        stub_jwks,
        {
            "iss": f"https://login.microsoftonline.com/{tenant}/v2.0",
            "tid": tenant,
        },
    )
    claims = oidc.validate_id_token(
        token, discovery, client_id=CLIENT_ID, nonce="nonce-1", allowed_tenants=[tenant]
    )
    assert claims["tid"] == tenant

    with pytest.raises(oidc.OidcError):
        oidc.validate_id_token(
            token,
            discovery,
            client_id=CLIENT_ID,
            nonce="nonce-1",
            allowed_tenants=["00000000-0000-0000-0000-000000000000"],
        )


def test_validate_id_token_rejects_an_invalid_multi_tenant_tid(stub_jwks):
    discovery = make_discovery(
        issuer="https://login.microsoftonline.com/{tenantid}/v2.0"
    )
    token = id_token(stub_jwks, {"iss": "https://login.microsoftonline.com/x/v2.0"})
    with pytest.raises(oidc.OidcError):
        oidc.validate_id_token(token, discovery, client_id=CLIENT_ID, nonce="nonce-1")


def test_username_from_claims_prefers_stable_identifiers():
    assert oidc.username_from_claims({"preferred_username": "alice"}) == "alice"
    assert oidc.username_from_claims({"upn": "alice@example.com"}) == "alice@example.com"
    assert oidc.username_from_claims({"email": "alice@example.com"}) == "alice@example.com"
    assert oidc.username_from_claims({"sub": "abc-123"}) == "abc-123"
    assert oidc.username_from_claims({"sub": "a b/c"}) == "a_b_c"
    with pytest.raises(oidc.OidcError):
        oidc.username_from_claims({})


def test_username_from_claims_honours_claim_prefix_and_email_verification():
    claims = {"preferred_username": "alice", "email": "alice@example.com", "sub": "s-1"}
    assert oidc.username_from_claims(claims, claim="sub") == "s-1"
    assert oidc.username_from_claims(claims, prefix="google-") == "google-alice"
    with pytest.raises(oidc.OidcError):
        oidc.username_from_claims(claims, claim="upn")

    verified = {"email": "alice@example.com", "email_verified": True}
    assert oidc.username_from_claims(verified, require_email_verified=True) == "alice@example.com"
    with pytest.raises(EmailUnverified):
        oidc.username_from_claims(
            {"email": "alice@example.com", "email_verified": False},
            require_email_verified=True,
        )
    # A non-email claim does not require the email verification flag.
    assert oidc.username_from_claims({"sub": "s-1"}, require_email_verified=True) == "s-1"


def test_end_session_url_includes_the_id_token_hint():
    url = oidc.end_session_url(
        make_discovery(),
        id_token="the-token",
        post_logout_redirect="https://pulp.example.com/ui/login",
    )
    assert url is not None
    assert url.startswith(f"{ISSUER}/logout?")
    assert "id_token_hint=the-token" in url
    assert "post_logout_redirect_uri=" in url


def test_exchange_code_posts_the_verifier_and_returns_tokens():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.content.decode()
        return httpx.Response(200, json={"id_token": "token", "access_token": "at"})

    transport = httpx.MockTransport(handler)
    tokens = asyncio.run(
        oidc.exchange_code(
            make_discovery(),
            client_id=CLIENT_ID,
            client_secret="secret",
            code="code-1",
            redirect_uri="https://pulp.example.com/sso/callback",
            code_verifier="verifier",
            transport=transport,
        )
    )
    assert tokens["id_token"] == "token"
    assert "code_verifier=verifier" in captured["body"]
    assert "client_secret=secret" in captured["body"]


def test_exchange_code_rejects_error_responses():
    transport = httpx.MockTransport(lambda request: httpx.Response(400, text="bad code"))
    with pytest.raises(oidc.OidcError):
        asyncio.run(
            oidc.exchange_code(
                make_discovery(),
                client_id=CLIENT_ID,
                client_secret="secret",
                code="code-1",
                redirect_uri="https://pulp.example.com/sso/callback",
                code_verifier="verifier",
                transport=transport,
            )
        )
