"""Development-only Pulp settings for the public compose stack.

This file is mounted at /etc/pulp/settings.py by compose.yaml. It is intended
for a disposable local machine and must not be reused in production.
"""

ALLOWED_HOSTS = ["*"]

# The browser and the API share one origin in production. Locally Vite proxies
# /pulp to this container, so both local ports must be trusted for CSRF.
CONTENT_ORIGIN = "http://localhost:8080"
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Keep session/CSRF cookies usable over plain HTTP during local development.
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# The all-in-one image includes Redis; enable it so the dashboard health card
# reflects a fully configured installation.
CACHE_ENABLED = True

# Local development does not need short-lived API tokens.
TOKEN_AUTH_DISABLED = True
