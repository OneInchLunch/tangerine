from tangerine_gateway.claims import SsoConfig, build_identity
from tangerine_gateway.mapping import RoleSpec

GROUP_MAP = {"idp-admins": "pulp-admins", "idp-devs": "pulp-devs"}
ROLE_MAP = {"idp-repo-admin": "core.repository_admin//"}
CONFIG = SsoConfig(
    group_map=GROUP_MAP,
    role_map=ROLE_MAP,
    managed_group="sso-managed",
)


def test_build_identity_maps_groups_roles_and_adds_the_marker_group():
    identity = build_identity(
        {"groups": ["idp-admins", "unknown"], "roles": ["idp-repo-admin"]},
        CONFIG,
    )
    assert identity.desired_groups == frozenset({"pulp-admins", "sso-managed"})
    assert identity.managed_groups == frozenset({"pulp-admins", "pulp-devs", "sso-managed"})
    assert identity.desired_roles == frozenset({"core.repository_admin//"})
    assert identity.managed_roles == frozenset({"core.repository_admin//"})


def test_build_identity_keeps_existing_groups_when_the_claim_is_absent():
    identity = build_identity({}, CONFIG)

    # Only the marker group is desired, and nothing mapped can be removed.
    assert identity.desired_groups == frozenset({"sso-managed"})
    assert identity.managed_groups == frozenset({"sso-managed"})
    assert identity.managed_roles == frozenset()


def test_build_identity_treats_an_empty_claim_as_authoritative():
    identity = build_identity({"groups": [], "roles": []}, CONFIG)

    assert identity.desired_groups == frozenset({"sso-managed"})
    # The provider asserted "no groups", so managed memberships may be removed.
    assert identity.managed_groups == frozenset({"pulp-admins", "pulp-devs", "sso-managed"})
    assert identity.managed_roles == frozenset({"core.repository_admin//"})


def test_build_identity_reads_nested_claims():
    identity = build_identity(
        {"realm_access": {"roles": ["idp-repo-admin"]}, "groups": ["idp-devs"]},
        CONFIG,
    )
    assert "pulp-devs" in identity.desired_groups


def test_build_identity_supports_custom_claim_paths():
    config = SsoConfig(
        group_claim="realm_access.groups",
        role_claim="resource_access.pulp.roles",
        group_map=GROUP_MAP,
        role_map=ROLE_MAP,
    )
    identity = build_identity(
        {
            "realm_access": {"groups": ["idp-admins"]},
            "resource_access": {"pulp": {"roles": ["idp-repo-admin"]}},
        },
        config,
    )
    assert identity.desired_groups == frozenset({"pulp-admins"})
    assert identity.desired_roles == frozenset({"core.repository_admin//"})


def test_build_identity_without_a_marker_group_leaves_it_out():
    identity = build_identity(
        {"groups": ["idp-devs"]},
        SsoConfig(group_map=GROUP_MAP),
    )
    assert identity.desired_groups == frozenset({"pulp-devs"})
    assert identity.managed_groups == frozenset({"pulp-admins", "pulp-devs"})


def test_build_identity_accepts_role_spec_values():
    identity = build_identity(
        {"roles": ["owner"]},
        SsoConfig(role_map={"owner": RoleSpec("core.repository_owner", "default", "")}),
    )
    assert identity.desired_roles == frozenset({"core.repository_owner/default/"})


def test_build_identity_is_inert_when_disabled():
    identity = build_identity(
        {"groups": ["idp-admins"]},
        SsoConfig(enabled=False, group_map=GROUP_MAP, managed_group="sso-managed"),
    )
    assert identity.desired_groups == frozenset()
    assert identity.managed_groups == frozenset()
    assert identity.desired_roles == frozenset()
    assert identity.managed_roles == frozenset()


def test_build_identity_ignores_groups_not_in_the_map():
    identity = build_identity({"groups": ["some-other-idp-group"]}, CONFIG)
    assert identity.desired_groups == frozenset({"sso-managed"})
