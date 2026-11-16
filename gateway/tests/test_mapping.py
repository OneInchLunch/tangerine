import base64
import json

from tangerine_gateway.mapping import (
    RoleSpec,
    claim_values,
    decode_id_token_claims,
    extract_claims,
    managed_role_keys,
    parse_role_spec,
    resolve_groups,
    resolve_roles,
)


def test_claim_values_reads_flat_and_nested_paths():
    assert claim_values({"groups": ["a", "b"]}, "groups") == ["a", "b"]
    assert claim_values({"groups": "admin"}, "groups") == ["admin"]
    assert claim_values({"realm_access": {"roles": ["r1"]}}, "realm_access.roles") == ["r1"]


def test_claim_values_distinguishes_missing_from_empty():
    # Missing means "the provider said nothing"; empty means "explicitly none".
    assert claim_values({}, "groups") is None
    assert claim_values({"groups": []}, "groups") == []
    assert claim_values({"realm_access": {}}, "realm_access.roles") is None


def test_claim_values_skips_unusable_entries():
    assert claim_values({"groups": [None, {"nested": 1}, " a ", "", 7]}, "groups") == ["a", "7"]
    assert claim_values({"groups": 42}, "groups") is None


def test_resolve_groups_only_keeps_mapped_values():
    mapping = {"idp-admins": "pulp-admins", "idp-devs": "pulp-devs"}
    assert resolve_groups(["idp-admins", "unknown"], mapping) == {"pulp-admins"}
    assert resolve_groups([], mapping) == set()


def test_parse_role_spec_accepts_role_domain_prn():
    assert parse_role_spec("file.filesystem-role//") == RoleSpec(
        role="file.filesystem-role", domain="", object_prn=""
    )
    assert parse_role_spec(" core.repository_admin / default / ") == RoleSpec(
        role="core.repository_admin", domain="default", object_prn=""
    )


def test_parse_role_spec_rejects_malformed_values():
    assert parse_role_spec("no-slashes") is None
    assert parse_role_spec("a/b") is None
    assert parse_role_spec("a/b/c/d") is None
    assert parse_role_spec("//prn") is None


def test_resolve_roles_and_managed_keys_normalize_str_and_spec():
    mapping = {
        "idp-admin": "file.filesystem-role//",
        "idp-owner": RoleSpec(role="core.repository_owner", domain="default", object_prn=""),
        "broken": "not-a-role",
    }
    resolved = resolve_roles(["idp-admin", "idp-owner", "broken", "unmapped"], mapping)
    assert resolved == {
        RoleSpec(role="file.filesystem-role", domain="", object_prn=""),
        RoleSpec(role="core.repository_owner", domain="default", object_prn=""),
    }
    assert managed_role_keys(mapping) == {
        "file.filesystem-role//",
        "core.repository_owner/default/",
    }


def _jwt(payload):
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    return f"header.{encoded}.signature"


def test_decode_id_token_claims_reads_the_payload():
    token = _jwt({"groups": ["idp-admins"], "sub": "abc"})
    assert decode_id_token_claims(token) == {"groups": ["idp-admins"], "sub": "abc"}


def test_decode_id_token_claims_is_defensive():
    assert decode_id_token_claims("not-a-jwt") == {}
    assert decode_id_token_claims("a.b") == {}
    assert decode_id_token_claims("a.%%%.c") == {}


def test_extract_claims_merges_id_token_user_data_and_response():
    token = _jwt({"groups": ["from-token"]})
    claims = extract_claims(
        {
            "id_token": token,
            "user_data": {"email": "user@example.com"},
            "name": "User",
            "groups": ["from-response"],
        }
    )
    assert claims["email"] == "user@example.com"
    assert claims["name"] == "User"
    # Direct response values win over decoded token claims.
    assert claims["groups"] == ["from-response"]
