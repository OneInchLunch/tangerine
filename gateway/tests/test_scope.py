from tangerine_gateway.claims import IdentityPlan
from tangerine_gateway.scope import (
    apply_scoped_roles,
    repository_prns_for_provider,
    repository_prns_from_roles,
)
from tangerine_gateway.store import Provider


def _provider(**overrides):
    values = {
        "id": "microsoft",
        "label": "Entra",
        "kind": "azuread",
        "issuer": "https://login.microsoftonline.com/tenant/v2.0",
        "client_id": "client",
        "secret_file": "secret",
        "scopes": "openid",
        "group_claim": "groups",
        "role_claim": "roles",
    }
    values.update(overrides)
    return Provider(**values)


def test_repository_prns_from_roles_only_accepts_scoped_repository_roles():
    assert repository_prns_from_roles(
        [
            "tangerine-repository-admin//prn:file.filerepository:one",
            "tangerine-admin-read//",
            "file.filerepository_owner//prn:file.filerepository:two",
        ]
    ) == {"prn:file.filerepository:one"}


def test_repository_prns_for_provider_unions_static_and_dynamic_scopes():
    provider = _provider(
        access_rules=[
            {
                "claim": "groups",
                "match": "admins",
                "group": "tangerine-admins",
                "roles": [
                    "tangerine-repository-admin//prn:file.filerepository:static"
                ],
            }
        ]
    )
    dynamic = {
        "tangerine-admins": {
            "tangerine-repository-admin//prn:file.filerepository:dynamic"
        }
    }
    assert repository_prns_for_provider(
        provider, dynamic, {"tangerine-admins"}
    ) == {
        "prn:file.filerepository:static",
        "prn:file.filerepository:dynamic",
    }
    assert repository_prns_for_provider(provider, dynamic, set()) == set()


def test_apply_scoped_roles_only_touches_groups_the_user_joins():
    identity = IdentityPlan(
        desired_groups=frozenset({"tangerine-admins"}),
        group_roles={"tangerine-admins": frozenset({"tangerine-admin-read//"})},
        declared_groups=frozenset({"tangerine-admins"}),
    )
    result = apply_scoped_roles(
        identity,
        {
            "tangerine-admins": {
                "tangerine-repository-admin//prn:file.filerepository:one"
            },
            "other-team": {
                "tangerine-repository-admin//prn:file.filerepository:two"
            },
        },
    )
    assert result.group_roles["tangerine-admins"] == frozenset(
        {
            "tangerine-admin-read//",
            "tangerine-repository-admin//prn:file.filerepository:one",
        }
    )
    assert "other-team" not in result.group_roles


def test_signing_fields_require_superuser():
    from fastapi import HTTPException
    import pytest

    from tangerine_gateway.scope_routes import _reject_signing_fields

    body = {"name": "rpms", "metadata_signing_service": "/pulp/api/v3/signing-services/1/"}
    with pytest.raises(HTTPException) as excinfo:
        _reject_signing_fields(body, is_super=False)
    assert excinfo.value.status_code == 403

    # Superusers are the only role allowed to attach a signing service.
    _reject_signing_fields(body, is_super=True)
    _reject_signing_fields({"name": "rpms"}, is_super=False)
