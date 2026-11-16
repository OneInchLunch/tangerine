from tangerine_gateway.sync import plan_sync


def test_plan_sync_adds_missing_and_removes_only_managed():
    plan = plan_sync(
        current_groups={"pulp-admins", "local-ops"},
        desired_groups={"pulp-devs"},
        managed_groups={"pulp-admins", "pulp-devs"},
        current_roles={"file.filesystem-role//", "manual/role/"},
        desired_roles={"core.repository_admin//"},
        managed_roles={"file.filesystem-role//", "core.repository_admin//"},
    )

    assert plan.groups_add == frozenset({"pulp-devs"})
    # `local-ops` is not managed, so it survives.
    assert plan.groups_remove == frozenset({"pulp-admins"})
    assert plan.roles_add == frozenset({"core.repository_admin//"})
    assert plan.roles_remove == frozenset({"file.filesystem-role//"})
    assert plan.changed


def test_plan_sync_is_a_noop_when_everything_matches():
    plan = plan_sync(
        current_groups={"pulp-devs"},
        desired_groups={"pulp-devs"},
        managed_groups={"pulp-devs"},
        current_roles=set(),
        desired_roles=set(),
        managed_roles=set(),
    )
    assert not plan.changed
    assert plan.as_dict() == {
        "groups_added": [],
        "groups_removed": [],
        "roles_added": [],
        "roles_removed": [],
    }


def test_plan_sync_removes_every_managed_item_for_an_explicit_empty_claim():
    plan = plan_sync(
        current_groups={"pulp-admins", "pulp-devs", "local-ops"},
        desired_groups=set(),
        managed_groups={"pulp-admins", "pulp-devs"},
        current_roles=set(),
        desired_roles=set(),
        managed_roles=set(),
    )
    assert plan.groups_remove == frozenset({"pulp-admins", "pulp-devs"})
    assert "local-ops" not in plan.groups_remove


def test_plan_sync_strict_preserves_groups_declared_by_other_providers():
    plan = plan_sync(
        current_groups={"entra-admins", "entra-stale", "google-admins", "local-ops"},
        desired_groups={"entra-admins"},
        managed_groups=set(),
        current_roles=set(),
        desired_roles=set(),
        managed_roles=set(),
        strict_groups=True,
        protected_groups={"local-ops"},
        strict_keep_groups={"google-admins"},
    )

    assert plan.groups_remove == frozenset({"entra-stale"})
    assert "google-admins" not in plan.groups_remove
    assert "local-ops" not in plan.groups_remove


def test_plan_sync_never_adds_roles_outside_the_desired_set():
    plan = plan_sync(
        current_groups=set(),
        desired_groups=set(),
        managed_groups=set(),
        current_roles=set(),
        desired_roles={"owner/default/"},
        managed_roles={"owner/default/"},
    )
    assert plan.roles_add == frozenset({"owner/default/"})
    assert plan.roles_remove == frozenset()
