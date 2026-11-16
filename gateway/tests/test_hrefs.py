import pytest

from tangerine_gateway.hrefs import (
    PulpPathError,
    ensure_pulp_endpoint,
    normalize_pulp_path,
)

PULP = "http://pulp.invalid:8080"


def test_accepts_relative_pulp_paths_with_query():
    assert (
        normalize_pulp_path("/pulp/api/v3/repositories/?limit=1", pulp_url=PULP)
        == "/pulp/api/v3/repositories/?limit=1"
    )


def test_accepts_absolute_urls_only_for_the_configured_origin():
    assert (
        normalize_pulp_path(
            "http://pulp.invalid:8080/pulp/api/v3/tasks/1/?a=b", pulp_url=PULP
        )
        == "/pulp/api/v3/tasks/1/?a=b"
    )
    with pytest.raises(PulpPathError):
        normalize_pulp_path("https://pulp.invalid:8080/pulp/api/v3/tasks/1/", pulp_url=PULP)
    with pytest.raises(PulpPathError):
        normalize_pulp_path("http://evil.example/pulp/api/v3/tasks/1/", pulp_url=PULP)
    with pytest.raises(PulpPathError):
        normalize_pulp_path("http://pulp.invalid:9090/pulp/api/v3/tasks/1/", pulp_url=PULP)


@pytest.mark.parametrize(
    "path",
    [
        "//evil.example/pulp/api/v3/users/",
        "/pulp/api/v3/distributions/../../users/",
        "/pulp/api/v3/distributions/./../../users/",
        "/pulp/api/v3/%2e%2e/users/",
        "/pulp/api/v3/%2E%2E/users/",
        "/pulp/api/v3/users//roles/",
        "/pulp/api/v3/users/#fragment",
        "/pulp/api/v3e/users/",
        "/other/users/",
        "",
    ],
)
def test_rejects_paths_that_escape_the_pulp_api(path):
    with pytest.raises(PulpPathError):
        normalize_pulp_path(path, pulp_url=PULP)


def test_rejects_control_characters_and_backslashes():
    with pytest.raises(PulpPathError):
        normalize_pulp_path("/pulp/api/v3/users/\x00", pulp_url=PULP)
    with pytest.raises(PulpPathError):
        normalize_pulp_path("/pulp/api/v3\\users/", pulp_url=PULP)


def test_rejects_absolute_urls_when_they_are_not_allowed():
    with pytest.raises(PulpPathError):
        normalize_pulp_path(
            "http://pulp.invalid:8080/pulp/api/v3/users/",
            pulp_url=PULP,
            allow_absolute=False,
        )


def test_ensure_pulp_endpoint_requires_a_family_prefix():
    assert (
        ensure_pulp_endpoint(
            "/pulp/api/v3/repositories/file/file/1/",
            pulp_url=PULP,
            prefixes=("repositories",),
        )
        == "/pulp/api/v3/repositories/file/file/1/"
    )
    with pytest.raises(PulpPathError):
        ensure_pulp_endpoint(
            "/pulp/api/v3/users/1/",
            pulp_url=PULP,
            prefixes=("repositories",),
        )
    # A dot segment must not satisfy the family prefix after normalisation.
    with pytest.raises(PulpPathError):
        ensure_pulp_endpoint(
            "/pulp/api/v3/users/../repositories/",
            pulp_url=PULP,
            prefixes=("repositories",),
        )
