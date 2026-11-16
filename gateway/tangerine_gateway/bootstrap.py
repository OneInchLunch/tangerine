"""Generate the one-time Pulp settings block shown in the UI."""

from __future__ import annotations

HEADER_SETTING = "HTTP_X_TANGERINE_IDENTITY"
HEADER_NAME = "X-Tangerine-Identity"

SETTINGS_BLOCK = f"""# Tangerine SSO gateway: identity header authentication.
# Additive: Basic and session auth stay enabled so local admin access,
# pulp-cli, and break-glass accounts keep working without the gateway.
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "pulpcore.backends.ObjectRolePermissionBackend",
    "pulpcore.app.authentication.PulpNoCreateRemoteUserBackend",
]

REST_FRAMEWORK__DEFAULT_AUTHENTICATION_CLASSES = [
    "pulpcore.app.authentication.BasicAuthentication",
    "rest_framework.authentication.SessionAuthentication",
    # Last so unauthenticated requests still produce 401 (not 403).
    "pulpcore.app.authentication.JSONHeaderRemoteAuthentication",
]

AUTHENTICATION_JSON_HEADER = "{HEADER_SETTING}"
AUTHENTICATION_JSON_HEADER_JQ_FILTER = ".user"
"""

APPLY_COMMAND = """# Helm / Pulp Operator
kubectl -n pulp patch pulp pulp \\
  --type merge \\
  -p '{"spec":{"pulp_settings":"<the block above>"}}'
"""


def render_settings_block() -> str:
    return SETTINGS_BLOCK


def render_apply_command() -> str:
    return APPLY_COMMAND
