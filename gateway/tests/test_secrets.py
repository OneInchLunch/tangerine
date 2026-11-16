import pytest

from tangerine_gateway.secrets import SecretError, list_secrets, read_secret


def test_read_secret_returns_trimmed_contents(tmp_path):
    (tmp_path / "azure-secret").write_text("  s3cret\n")
    assert read_secret(tmp_path, "azure-secret") == "s3cret"


def test_read_secret_rejects_path_traversal(tmp_path):
    (tmp_path / "outside").write_text("nope")
    for name in ("../outside", "nested/secret", "..", ""):
        with pytest.raises(SecretError):
            read_secret(tmp_path, name)


def test_read_secret_reports_missing_and_empty_files(tmp_path):
    with pytest.raises(SecretError):
        read_secret(tmp_path, "absent")
    (tmp_path / "empty").write_text("  \n")
    with pytest.raises(SecretError):
        read_secret(tmp_path, "empty")


def test_list_secrets_ignores_hidden_entries(tmp_path):
    (tmp_path / "one").write_text("x")
    (tmp_path / "two").write_text("y")
    (tmp_path / ".hidden").write_text("z")
    (tmp_path / "nested").mkdir()
    assert list_secrets(tmp_path) == ["one", "two"]
