from tangerine_gateway.paths import safe_next_path

BASE = "/ui/"


def test_safe_next_path_accepts_paths_inside_the_ui():
    assert safe_next_path("/ui/repositories", BASE) == "/ui/repositories"
    assert safe_next_path("/ui/repositories?q=file", BASE) == "/ui/repositories?q=file"
    assert safe_next_path("/ui", BASE) == "/ui/"
    assert safe_next_path("/ui/", BASE) == "/ui/"


def test_safe_next_path_rejects_off_origin_and_escaping_paths():
    assert safe_next_path("//evil.example/ui/", BASE) == BASE
    assert safe_next_path("/\\evil.example", BASE) == BASE
    assert safe_next_path("https://evil.example/ui/", BASE) == BASE
    assert safe_next_path("/pulp/api/v3/", BASE) == BASE
    assert safe_next_path("/ui/../pulp/api/v3/", BASE) == BASE
    # The URL parser resolves encoded dot segments before the prefix check.
    assert safe_next_path("/ui/%2e%2e/pulp/", BASE) == BASE
    assert safe_next_path("", BASE) == BASE
    assert safe_next_path(None, BASE) == BASE


def test_safe_next_path_normalizes_dot_segments():
    assert safe_next_path("/ui/a/../repositories", BASE) == "/ui/repositories"
