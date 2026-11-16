import pytest

from tangerine_gateway.claims import SsoConfig, build_identity
from tangerine_gateway.domain_policy import enforce_domain_policy, resolved_domain
from tangerine_gateway.errors import DomainNotAllowed
from tangerine_gateway.mapping import AccessRule
from tangerine_gateway.rules import collect_declared_group_roles, other_declared_groups
from tangerine_gateway.store import Provider
from tangerine_gateway.sync import plan_group_roles, plan_sync

VIEWER = "tangerine-viewer//"
ADMIN = "tangerine-admin//"

RULES = (
    AccessRule("groups", "idp-admins", "pulp-admins", (VIEWER,)),
    AccessRule("groups", "idp-devs", "pulp-devs", ()),
)


def _config(**overrides):
    return SsoConfig(access_rules=RULES, managed_group="sso-managed", **overrides)


def test_rule_matches_add_the_group_and_its_roles():
    identity = build_identity({"groups": ["idp-admins"]}, _config())

    assert identity.desired_groups == frozenset({"pulp-admins", "sso-managed"})
    assert identity.declared_groups == frozenset({"pulp-admins", "pulp-devs"})
    assert identity.group_roles["pulp-admins"] == frozenset({VIEWER})
    assert identity.group_roles["pulp-devs"] == frozenset()


def test_rule_groups_are_managed_only_when_the_claim_is_asserted():
    identity = build_identity({}, _config())

    assert identity.desired_groups == frozenset({"sso-managed"})
    assert identity.managed_groups == frozenset({"sso-managed"})


def test_rule_groups_are_removable_for_an_explicit_empty_claim():
    identity = build_identity({"groups": []}, _config())

    assert identity.desired_groups == frozenset({"sso-managed"})
    assert identity.managed_groups == frozenset(
        {"pulp-admins", "pulp-devs", "sso-managed"}
    )


def test_baseline_group_is_always_desired_and_carries_roles():
    identity = build_identity(
        {},
        _config(baseline_group="sso-users", baseline_roles=(VIEWER,)),
    )

    assert identity.desired_groups == frozenset({"sso-users", "sso-managed"})
    assert identity.declared_groups == frozenset(
        {"pulp-admins", "pulp-devs", "sso-users"}
    )
    assert identity.group_roles["sso-users"] == frozenset({VIEWER})


def test_role_claim_rules_use_the_role_claim_path():
    rule = AccessRule("roles", "viewer", "pulp-viewers", ())
    identity = build_identity(
        {"roles": ["viewer"]}, SsoConfig(access_rules=(rule,))
    )

    assert identity.desired_groups == frozenset({"pulp-viewers"})
    assert identity.managed_groups == frozenset({"pulp-viewers"})


def test_strict_mode_requires_the_group_claim():
    strict = _config(strict_groups=True)

    assert build_identity({"groups": []}, strict).strict is True
    assert build_identity({}, strict).strict is False


def test_absent_group_claim_does_not_remove_role_based_rule_groups():
    rule = AccessRule("roles", "viewer", "pulp-viewers", ())
    identity = build_identity(
        {}, SsoConfig(access_rules=(rule,), strict_groups=True)
    )

    assert identity.managed_groups == frozenset()
    assert identity.strict is False


def _provider_for_rules(**overrides):
    values = {
        "id": "provider",
        "label": "Provider",
        "kind": "oidc",
        "issuer": "https://idp.example.com",
        "client_id": "client",
        "secret_file": "secret",
        "scopes": "openid profile email",
        "group_claim": "groups",
        "role_claim": "roles",
    }
    values.update(overrides)
    return Provider(**values)


def test_other_declared_groups_includes_legacy_and_baseline_groups():
    entra = _provider_for_rules(
        id="entra",
        access_rules=[
            {
                "claim": "groups",
                "match": "admins",
                "group": "entra-admins",
                "roles": ["tangerine-admin//"],
            }
        ],
        baseline_group="sso-users",
        baseline_roles=["tangerine-viewer//"],
    )
    google = _provider_for_rules(
        id="google",
        group_map={"g-ops": "google-ops"},
        baseline_group="google-users",
        baseline_roles=["tangerine-viewer//"],
    )

    assert other_declared_groups([entra, google], entra) == {
        "google-ops",
        "google-users",
    }
    # Legacy map targets are strict-mode keep groups, not role-managed groups.
    assert "google-ops" not in collect_declared_group_roles([entra, google])


def test_baseline_is_skipped_for_admin_tiers():
    config = SsoConfig(
        access_rules=(AccessRule("groups", "admins", "tangerine-admins"),),
        baseline_group="sso-users",
        baseline_roles=(VIEWER,),
        baseline_excluded_groups=("tangerine-admins",),
        managed_group="sso-managed",
    )
    identity = build_identity({"groups": ["admins"]}, config)

    assert "tangerine-admins" in identity.desired_groups
    assert "sso-users" not in identity.desired_groups
    assert "sso-users" in identity.managed_groups
    assert "sso-users" not in identity.group_roles


def test_baseline_remains_for_plain_viewers():
    config = SsoConfig(
        access_rules=(AccessRule("groups", "admins", "tangerine-admins"),),
        baseline_group="sso-users",
        baseline_roles=(VIEWER,),
        baseline_excluded_groups=("tangerine-admins",),
        managed_group="sso-managed",
    )
    identity = build_identity({"groups": []}, config)

    assert "sso-users" in identity.desired_groups
    assert identity.group_roles["sso-users"] == frozenset({VIEWER})


def test_plan_sync_strict_removes_undeclared_groups_but_keeps_protected():
    plan = plan_sync(
        current_groups={"keep-me", "manual", "desired"},
        desired_groups={"desired"},
        managed_groups=set(),
        current_roles=set(),
        desired_roles=set(),
        managed_roles=set(),
        strict_groups=True,
        protected_groups={"keep-me"},
    )

    assert plan.groups_remove == frozenset({"manual"})


def test_plan_sync_without_strict_leaves_undeclared_groups_alone():
    plan = plan_sync(
        current_groups={"manual", "managed", "desired"},
        desired_groups={"desired"},
        managed_groups={"managed"},
        current_roles=set(),
        desired_roles=set(),
        managed_roles=set(),
    )

    assert plan.groups_remove == frozenset({"managed"})


def test_plan_group_roles_adds_missing_and_removes_only_declared_roles():
    plan = plan_group_roles(
        declared_group_roles={"pulp-admins": {VIEWER, ADMIN}},
        current_group_roles={
            "pulp-admins": {VIEWER, "core.repository_admin//", "manual//"}
        },
        managed_role_keys={VIEWER, ADMIN},
    )

    assert plan.add == {"pulp-admins": frozenset({ADMIN})}
    # The hand-assigned role survives because no rule declares it.
    assert plan.remove == {}


def test_plan_group_roles_revokes_a_removed_declared_role():
    plan = plan_group_roles(
        declared_group_roles={"pulp-admins": {VIEWER}},
        current_group_roles={"pulp-admins": {VIEWER, ADMIN}},
        managed_role_keys={VIEWER, ADMIN},
    )

    assert plan.remove == {"pulp-admins": frozenset({ADMIN})}
    assert plan.add == {}


def test_domain_policy_is_a_noop_without_an_allowlist():
    enforce_domain_policy({"email": "someone@elsewhere.test"}, allowed_domains=[])


def test_domain_policy_accepts_an_allowed_domain():
    enforce_domain_policy(
        {"email": "alice@example.com"}, allowed_domains=["example.com"]
    )
    assert (
        resolved_domain({"preferred_username": "alice@example.com"})
        == "example.com"
    )


def test_domain_policy_rejects_another_domain():
    with pytest.raises(DomainNotAllowed) as excinfo:
        enforce_domain_policy(
            {"email": "alice@gmail.com"}, allowed_domains=["example.com"]
        )

    assert excinfo.value.code == "domain_not_allowed"
    assert "gmail.com" in str(excinfo.value)


def test_domain_policy_rejects_a_missing_domain():
    with pytest.raises(DomainNotAllowed):
        enforce_domain_policy({"sub": "alice"}, allowed_domains=["example.com"])


def test_hosted_domain_requires_a_matching_hd_claim():
    with pytest.raises(DomainNotAllowed):
        enforce_domain_policy(
            {"email": "alice@example.com"},
            allowed_domains=["example.com"],
            require_hosted_domain=True,
        )
    with pytest.raises(DomainNotAllowed):
        enforce_domain_policy(
            {"email": "alice@example.com", "hd": "other.test"},
            allowed_domains=["example.com"],
            require_hosted_domain=True,
        )

    enforce_domain_policy(
        {"email": "alice@example.com", "hd": "example.com"},
        allowed_domains=["example.com"],
        require_hosted_domain=True,
    )
