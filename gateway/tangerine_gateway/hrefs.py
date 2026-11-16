"""Validation for Pulp API paths and URLs used by the scoped write proxy.

The gateway sends every Pulp request with its service-account credentials, so a
caller-supplied href must never be able to change the target origin or escape the
Pulp API. httpx normalises dot segments before sending, which means a raw string
prefix check is not enough: ``/pulp/api/v3/distributions/../../users/`` passes a
``startswith`` guard but resolves to ``/pulp/api/v3/users/``. Validate both the
raw and the normalised shape here, and keep ``PulpClient`` as a backstop so no
future caller can bypass it.
"""

from __future__ import annotations

from urllib.parse import unquote, urlparse

DEFAULT_API_PATH = "/pulp/api/v3/"

DOT_SEGMENTS = {".", ".."}


class PulpPathError(ValueError):
    """A path or URL that must not be sent to Pulp with service credentials."""


def _api_prefix(api_path: str) -> str:
    return "/" + api_path.strip("/") + "/"


def _origin(value: str) -> tuple[str, str, int | None]:
    parsed = urlparse(value)
    scheme = parsed.scheme.lower()
    port = parsed.port
    if port is None:
        port = {"http": 80, "https": 443}.get(scheme)
    return scheme, (parsed.hostname or "").lower(), port


def _reject_control_characters(value: str) -> None:
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        raise PulpPathError("control characters are not allowed")
    if "\\" in value:
        raise PulpPathError("backslashes are not allowed")


def _check_segments(path: str) -> None:
    for segment in path.split("/"):
        if not segment:
            continue
        decoded = unquote(segment).lower()
        if decoded in DOT_SEGMENTS:
            raise PulpPathError("path traversal is not allowed")
        if "/" in decoded or "\\" in decoded:
            raise PulpPathError("encoded path separators are not allowed")


def normalize_pulp_path(
    path: str,
    *,
    pulp_url: str,
    api_path: str = DEFAULT_API_PATH,
    allow_absolute: bool = True,
) -> str:
    """Validate a Pulp API path and return the value that may be requested.

    Relative paths must stay under ``api_path``. Absolute URLs are accepted only
    when they point at the configured Pulp origin (Pulp pagination ``next``
    links are absolute) and are reduced to path + query. Dot segments, encoded
    dots, protocol-relative values, fragments, and backslashes are rejected.
    """

    if not isinstance(path, str):
        raise PulpPathError("path must be a string")
    if not path:
        raise PulpPathError("path is required")
    _reject_control_characters(path)
    if path.startswith("//"):
        raise PulpPathError("protocol-relative paths are not allowed")

    parsed = urlparse(path)
    has_origin = bool(parsed.scheme or parsed.netloc)
    if has_origin:
        if not allow_absolute:
            raise PulpPathError("absolute URLs are not allowed")
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            raise PulpPathError("absolute URLs must be http or https")
        if parsed.username or parsed.password:
            raise PulpPathError("credentials in URLs are not allowed")
        if _origin(path) != _origin(pulp_url):
            raise PulpPathError("URL does not point at the configured Pulp origin")
        target = parsed.path or "/"
        if parsed.query:
            target = f"{target}?{parsed.query}"
    else:
        target = path

    path_only = target.split("?", 1)[0]
    if "#" in target:
        raise PulpPathError("fragments are not allowed")
    if "//" in path_only:
        raise PulpPathError("repeated slashes are not allowed")
    _check_segments(path_only)

    prefix = _api_prefix(api_path)
    if not path_only.startswith(prefix):
        raise PulpPathError("path is outside the Pulp API")
    return target


def ensure_pulp_endpoint(
    path: str,
    *,
    pulp_url: str,
    api_path: str = DEFAULT_API_PATH,
    prefixes: tuple[str, ...],
    allow_absolute: bool = True,
) -> str:
    """Validate a path and require it to belong to one of the endpoint families."""

    target = normalize_pulp_path(
        path,
        pulp_url=pulp_url,
        api_path=api_path,
        allow_absolute=allow_absolute,
    )
    path_only = target.split("?", 1)[0]
    base = _api_prefix(api_path)
    for prefix in prefixes:
        if path_only.startswith(f"{base}{prefix.strip('/')}/"):
            return target
    raise PulpPathError("path is outside the allowed Pulp endpoints")
