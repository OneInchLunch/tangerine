# Tangerine SSO gateway

An OpenID Connect relying party that authenticates browser requests to Pulp.

Tangerine is a static SPA, so it cannot exchange an OIDC token for a Pulp
credential. Pulp has no token-exchange endpoint and cannot verify a signed
header on a stock image. This gateway therefore owns the OIDC flow and answers
Traefik `forwardAuth` requests with an identity header Pulp reads through
`JSONHeaderRemoteAuthentication`.

```
Browser ──/sso───▶ gateway          OIDC, sessions, provider admin
Browser ──/pulp──▶ Traefik ──forwardAuth──▶ gateway /sso/auth
                           + X-Tangerine-Identity: base64({"user":"alice"})
                           ▼
                         Pulp API
```

Pulp API traffic is not proxied: uploads, downloads, and streaming keep their
existing path.

## Security model — read this first

The identity header is **not signed**; Pulp's stock authentication class only
extracts a username with jq. Identity therefore rests on two controls:

1. **The edge strips inbound copies of the header.** Traefik's `Headers`
   middleware blanks `X-Tangerine-Identity` before `forwardAuth` runs. Attach
   the strip-first chain to a dedicated `/pulp` router; do not cover `/v2` or
   `/token`.
2. **Pulp is unreachable except through that ingress.** Enforce it with
   NetworkPolicy and confirm the cluster's CNI actually enforces policy.
   Some default CNIs do not enforce it; verify with a pod outside the allowed namespaces.

If either control is missing, any workload that can reach Pulp can impersonate
any existing user. `PulpNoCreateRemoteUserBackend` limits that to existing
accounts but does not prevent it.

Existing usernames are accepted only when they already belong to
`TANGERINE_MANAGED_GROUP`; otherwise provisioning fails with
`username_collision`. An empty managed group fails closed with
`sso_not_configured`.

The UI includes a self-test (Settings → SSO → *Run header-strip test*) that
sends a client-side identity header and confirms Pulp rejects it.

Local password login stays enabled, so the gateway can be removed without
locking anyone out.

Pulp evaluates `SessionAuthentication` before the injected identity header, so
a leftover local login cookie would outrank the SSO identity and could act as
the previous (possibly administrator) account. The gateway therefore expires
Pulp's `sessionid` and `csrftoken` cookies on SSO start (except admin preview),
on a successful callback, and on logout. Keep that behaviour when changing the
login flow.

`GET /sso/session` returns the CSRF token used by `POST /sso/logout` along with
the matching `__Host-tg_csrf` cookie. Logout deletes `__Host-tg_session` with
the `Secure` attribute; a `__Host-` cookie cannot be replaced by an insecure
`Set-Cookie`.

### Known gaps

These are tracked in `TODO.md` with severities:

- The header is unsigned, so trust is positional. Confirming that the CNI
  enforces NetworkPolicy is a deployment prerequisite, not a nicety.
- `/sso/start` and `/sso/callback` are unauthenticated and write rows to
  `auth_states`; expired rows are purged periodically, but there is no rate
  limit.
- Microsoft group overage requires a Graph scope with admin consent; otherwise
  an omitted `groups` claim means no assertion.
- Google Workspace groups require a service-account key with domain-wide
  delegation and an admin account.
- A real Google/Microsoft app needs a stable HTTPS redirect URI. Register
  `<your-origin>/sso/callback` at the provider; do not rely on a temporary
  tunnel hostname that changes on restart.
- The background reconciler is opt-in and only replays each user's last asserted
  groups/roles; it does not crawl the IdP to discover changed membership.
- `email_verified` is enforced only when a provider opts in.
- Secret rotation is a Kubernetes Secret update; there is no one-click action.
- Provider audit entries are stored with a retention policy, but there is no
  export tooling.
- The ID token is encrypted only when `TANGERINE_TOKEN_ENCRYPTION_KEY` is set;
  otherwise it is not persisted and logout omits `id_token_hint`.
- Sessions have a fixed absolute lifetime with no idle timeout or revocation UI.
- Provider administration is gated on Pulp `is_staff`; changes are recorded in
  `provider_audit`, but there is no confirmation step or retention/export policy.
- Kubernetes Secrets are not encrypted at rest unless the cluster is configured
  for it.

## Configuration

All settings are environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TANGERINE_PULP_URL` | `http://localhost:8080` | Pulp base URL for the service account |
| `TANGERINE_PULP_USER` | `admin` | Service account username |
| `TANGERINE_PULP_PASSWORD` | empty | Service account password (Secret) |
| `TANGERINE_DATABASE_URL` | empty | Full PostgreSQL DSN; wins over the keys below |
| `TANGERINE_DATABASE_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASSWORD` / `_SSLMODE` | empty | Explicit PostgreSQL components |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_USERNAME` / `POSTGRES_PASSWORD` / `POSTGRES_DB_NAME` / `POSTGRES_SSLMODE` | empty | Pulp-compatible database Secret keys |
| `TANGERINE_DATABASE_PATH` | `/tmp/tangerine-gateway.db` | SQLite path for local tests and `npm run dev` |
| `TANGERINE_TOKEN_ENCRYPTION_KEY` | empty | Fernet key for the stored ID token; when empty it is not persisted |
| `TANGERINE_PURGE_INTERVAL_SECONDS` | `900` | Expired session/state/audit cleanup interval |
| `TANGERINE_AUDIT_RETENTION_DAYS` | `90` | Provider audit retention |
| `TANGERINE_SECRETS_DIR` | `/tmp/tangerine-secrets` | Mounted IdP client secrets |
| `TANGERINE_EXTERNAL_BASE_URL` | `http://localhost:5173` | Public origin, used for the callback URL |
| `TANGERINE_UI_BASE_PATH` | `/ui/` | Tangerine base path |
| `TANGERINE_GATEWAY_BASE_PATH` | `/sso/` | Gateway base path |
| `TANGERINE_MANAGED_GROUP` | empty | Group added to every SSO account; required for login |
| `TANGERINE_ADMIN_GROUP` | empty | Repository-scoped admin group; grants `is_staff` |
| `TANGERINE_SUPERADMIN_GROUP` | empty | Superadmin group; grants `is_staff` and `is_superuser` |
| `TANGERINE_PROTECTED_GROUPS` | empty | Comma-separated groups strict mode must never remove |
| `TANGERINE_RECONCILE_INTERVAL_SECONDS` | `0` | Background replay interval; `0` disables it |
| `TANGERINE_RECONCILE_MAX_AGE_SECONDS` | `1209600` | Skip and purge assertions older than this (14 days) |
| `TANGERINE_RATE_LIMIT_PER_MINUTE` | `60` | Per-client-IP rate for start/callback |
| `TANGERINE_RATE_LIMIT_BURST` | `20` | Per-client burst |
| `TANGERINE_RATE_LIMIT_GLOBAL_PER_MINUTE` | `600` | Per-replica global ceiling |
| `TANGERINE_TRUSTED_PROXIES` | empty | CIDRs/hosts allowed to assert forwarded client IPs; empty trusts the chain |
| `TANGERINE_ALLOW_HTTP_ISSUERS` | `false` | Development-only plain-HTTP issuer support |
| `TANGERINE_ADDITIVE_MODE` | `true` | Pass unauthenticated requests through to Pulp |
| `TANGERINE_SESSION_TTL_SECONDS` | `28800` | Session lifetime |
| `TANGERINE_STATE_TTL_SECONDS` | `600` | Pending login lifetime |
| `TANGERINE_COOKIE_SECURE` | from the base URL scheme | `Secure` cookie flag |

## Database

Production uses PostgreSQL. SQLite is only the local-development and test
fallback; the Helm chart does not deploy a SQLite volume.

Precedence:

1. `TANGERINE_DATABASE_URL`
2. `TANGERINE_DATABASE_*`
3. `POSTGRES_*` (same keys as Pulp operator's `external_db_secret`)
4. `TANGERINE_DATABASE_PATH` (SQLite)

The Helm chart defaults to a single PostgreSQL StatefulSet. To use an external
database, create a Pulp-style Secret and switch modes:

```sh
kubectl -n pulp create secret generic tangerine-external-db \
  --from-literal=POSTGRES_HOST=db.example.com \
  --from-literal=POSTGRES_PORT=5432 \
  --from-literal=POSTGRES_USERNAME=tangerine \
  --from-literal=POSTGRES_PASSWORD='...' \
  --from-literal=POSTGRES_DB_NAME=tangerine_gateway \
  --from-literal=POSTGRES_SSLMODE=require

helm upgrade --install tangerine deploy/helm/tangerine \
  --set postgres.mode=external \
  --set postgres.externalSecret=tangerine-external-db
```

Do not reuse Pulp's own database Secret. Use a separate database and user, even
when both point at the same PostgreSQL server.

Schema migrations run at startup with a PostgreSQL advisory lock, so multiple
gateway replicas can start together. Expired sessions, pending login states, and
old audit rows are purged periodically.

Copy providers from an old SQLite gateway database with:

```sh
python gateway/scripts/migrate_sqlite_to_postgres.py \
  --source /path/to/tangerine-gateway.db \
  --target "postgresql://..."
```

The built-in PostgreSQL pod is a single replica. Back it up with `pg_dump` or a
volume snapshot; use an external managed database for HA or PITR.

Client secrets are **files** in `TANGERINE_SECRETS_DIR`. The database stores only
the filename, so a PVC snapshot cannot leak them. Mount the directory from a
Kubernetes Secret:

```yaml
volumes:
  - name: secrets
    secret:
      secretName: tangerine-idp-secrets
```

## Provider options

Providers are stored in PostgreSQL and managed from Settings → SSO. The admin API
accepts:

- `issuer`, `clientId`, `secretFile`, `scopes`
- `groupClaim` / `roleClaim` — JSON claim paths, default `groups` / `roles`
- `usernameClaim` — `preferred_username`, `upn`, `email`, `sub`, or empty for the
  historical priority order
- `usernamePrefix` — optional prefix applied after sanitization
- `requireEmailVerified` — reject a login when `email` is the username source and
  `email_verified` is not `true`
- `allowedTenants` — Microsoft multi-tenant GUID allowlist; required whenever
  the issuer uses `common`, `organizations`, or `consumers`
- `fetchGraphGroups` — fill missing Microsoft group claims through
  `/me/memberOf`, including overage and providers without `groupMembershipClaims`
- `fetchGoogleGroups`, `googleServiceAccountFile`, `googleAdminEmail` — resolve
  Google Workspace membership through the Admin SDK
- `groupMap` / `roleMap` — legacy source value to Pulp group or
  `role/domain/prn`
- `accessRules` — array of `{claim, match, group, roles[]}`; `claim` is `groups`
  or `roles`
- `baselineGroup` / `baselineRoles` — group added to every login and the roles it
  carries. This is not a login gate; restrict authentication at the IdP
  (Entra Enterprise App assignment, Google OAuth app access). On Entra Free,
  assign users directly; the assignment authorizes sign-in, while Entra group
  membership still selects the repository-scoped admin or maintainer tier.
- `strictGroups` — remove memberships not declared by the provider, the
  baseline, the marker group, or another enabled provider when the group claim is
  present
- `allowedEmailDomains` / `requireHostedDomain` — account-domain policy; the
  hosted-domain flag is Google-only and requires at least one domain
- `enabled`, `sortOrder`

The UI exposes presets for Google, Microsoft Entra ID, Keycloak, and generic
OIDC. For single-tenant Microsoft apps the preset requires a tenant GUID. For
multi-tenant apps use the `common` or `organizations` authority and list the
allowed tenant GUIDs; the gateway substitutes the token's `tid` into the
metadata issuer template and rejects tenants outside the list.

### SSO tiers and repository scope

- `TANGERINE_SUPERADMIN_GROUP` (for example `tangerine-maintainers`) members get
  Pulp `is_superuser=true` and `is_staff=true`.
- `TANGERINE_ADMIN_GROUP` (for example `tangerine-admins`) members get
  `is_staff=true` but not `is_superuser`; they are repository-scoped.
- Higher tiers do not inherit the provider baseline.
- `tangerine-admin-read` supplies non-task read permissions; repository reads
  come from the object-scoped `tangerine-repository-admin` role, so the repository
  list only contains assigned repositories on the Pulp API as well as in the UI.
  `tangerine-repository-admin//<prn>` grants repository writes on one PRN.
- `repository_scopes` stores dynamic scopes created by the gateway.
- `/sso/scope/repositories`, `/scope/repository`, `/scope/remotes`,
  `/scope/scoped-objects`, `/scope/object`, `/scope/content-upload`, and
  `/scope/import-export` validate every target against the caller's PRNs before
  using the service account. `scope/repository` with `DELETE` also removes the
  PRN from `repository_scopes`. Scoped admins have no global add permissions.
- Scoped admins do not receive Tasks, Workers, Operations, users, groups, roles,
  signing, API admin, SSO, or secrets.
- Deprovisioning removes groups/scopes (the group's dynamic repository scopes
  are deleted once no member remains), disables the user, revokes sessions, and
  keeps `sso-managed`; login reactivates and reapplies.
- Rate limiting applies to `/sso/start` and `/sso/callback` via
  `TANGERINE_RATE_LIMIT_*` using the forwarded client address.

### Operational CLI

```sh
python -m tangerine_gateway.cli migrate
python -m tangerine_gateway.cli ensure-roles
python -m tangerine_gateway.cli check-secrets
python -m tangerine_gateway.cli reconcile-assertions
python -m tangerine_gateway.cli prune-identities --directory-file /tmp/users.json [--apply]
python -m tangerine_gateway.cli sync-directory --provider microsoft [--apply]
```

`sync-directory` needs Graph application permissions `Application.Read.All`,
`Group.Read.All`, and `User.Read.All` for Entra, or the delegated Admin SDK
service account for Google. Run it without `--apply` first. A provider-scoped
sync only considers users with an assertion for that provider, so one IdP cannot
deprovision another provider's accounts. Entra guest identities use `mail`,
then `otherMails`, then `userPrincipalName` so guest `#EXT#` UPNs map to the
same username the login flow provisions.

**Preview login** (`/sso/start?...&preview=1`) is admin-only. It completes OIDC
and renders the resolved username, collision state, group/role diff, group-role
diff, baseline and strict state, domain rejection, and safe claims without
creating a user, group, role, or session.

Provider create/update/delete operations are recorded in `provider_audit` with
the acting Pulp administrator. Settings shows recent entries and mounted secret
readability/mtime. Rotation is an operational Kubernetes Secret update; the
gateway re-reads the file on each login.

## Pulp configuration

Pulp needs this once. The Settings page renders the same block with a copy
button:

```python
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

AUTHENTICATION_JSON_HEADER = "HTTP_X_TANGERINE_IDENTITY"
AUTHENTICATION_JSON_HEADER_JQ_FILTER = ".user"
```

Order matters: the header class must be last, otherwise anonymous requests
return `403` and the SPA cannot tell "signed out" from "not permitted".

No `INSTALLED_APPS` change, no migrations, no custom Pulp image.

Apply it the way your deployment manages Pulp settings: a Pulp Operator
deployment patches `spec.custom_pulp_settings`, while an all-in-one Pulp deployment edits its settings file and redeploys. Pulp only reads these at
startup, so the change requires a restart.

## Endpoints

Paths below assume `TANGERINE_GATEWAY_BASE_PATH=/sso/`. The routes are mounted
under that value, so changing it in `config.json` and in this setting together
moves every endpoint (the `/healthz` and `/readyz` routes stay at the root as
well).

| Endpoint | Purpose |
| --- | --- |
| `GET /sso/providers` | Enabled providers for the login screen (public, no secrets) |
| `GET /sso/start?provider=&next=` | Discovery, PKCE, state; redirects to the IdP |
| `GET /sso/start?provider=&preview=1` | Admin-only login preview; validates claims and computes the plan without writes |
| `GET /sso/callback` | Validates state and ID token, provisions the user, reconciles, sets the session |
| `GET /sso/auth` | `forwardAuth` target; emits the identity header |
| `GET /sso/session` | Current identity plus a CSRF token |
| `POST /sso/logout` | Revokes the session and redirects to the IdP end-session endpoint |
| `GET /sso/admin/csrf` | CSRF token for a local Pulp administrator |
| `GET/POST/PATCH/DELETE /sso/admin/providers` | Provider CRUD |
| `POST /sso/admin/providers/{id}/test` | Runs discovery and checks the secret file |
| `GET /sso/admin/discover?issuer=` | Lenient discovery for the provider form; returns issuer match state |
| `GET /sso/admin/groups?provider=&q=` | Google Workspace or Entra group search for the access-rule picker |
| `GET /sso/admin/access-policies` | Read-only status of the tasks/users/roles/signing/workers/import-export access policies |
| `GET /sso/admin/secrets` | Mounted secret file names |
| `GET /sso/admin/secrets/check?file=` | Secret presence/readability preflight |
| `GET /sso/admin/secrets/status` | Secret readability and modification time |
| `GET /sso/admin/audit` | Recent provider create/update/delete entries |
| `GET /sso/admin/bootstrap` | Pulp settings block and apply command |
| `GET /sso/admin/diagnostics` | Pulp reachability, header auth, strip probe |
| `GET /sso/admin/diagnostics/client-ip` | Socket address, forwarded headers, resolved rate-limit IP |
| `GET /healthz` | Liveness |
| `GET /readyz` | Readiness; verifies the database with `SELECT 1` |

Admin endpoints require a Pulp administrator. A gateway session counts, and so
does a local Pulp session cookie, because the SPA is same-origin. If both
sessions exist, either one being a Pulp administrator is sufficient; this keeps
a stale non-admin gateway session from hiding a fresh local admin login. The
cookie is resolved with an unauthenticated client: never reuse the
service-account client, because Pulp prefers Basic auth and would resolve every
cookie to the service account.

## Provisioning and reconciliation

On each login the gateway:

1. Enforces the provider's account-domain policy before any write.
2. Creates the Pulp user if it does not exist, with no usable password.
3. Resolves declarative access rules (and legacy map tables) into desired groups
   and group roles, then adds and removes only what enabled providers declare. A
   claim the provider omits is treated as "no assertion" rather than "none".
4. Reconciles the union of group roles across all enabled providers. Only role
   specs some provider declares are removable; hand-assigned roles survive.
5. Assigns legacy per-user roles through `/users/{href}roles/` using the
   `role/domain/prn` convention.
6. Applies strict membership when enabled, skipping `TANGERINE_PROTECTED_GROUPS`.

Errors are collected per item: a failed group write never blocks the login.

Sync runs at login. Setting `TANGERINE_RECONCILE_INTERVAL_SECONDS` also replays
each user's last asserted groups/roles on a timer; it repairs manual drift but
does not discover IdP changes without a login.

## Access policies

`tangerine-admins` reads users, roles, and signing services through Pulp access
policies. The same set grants Workers to every authenticated user and gates the
import/export viewsets on their own permissions. Apply the existing records with:

```sh
python gateway/scripts/bootstrap_access_policies.py            # dry run
python gateway/scripts/bootstrap_access_policies.py --apply
```

The script is idempotent, touches only the expected viewsets, and never grants
write access to the admin group. The users and roles policies keep their write
actions on `principal: admin`, so superusers can still create users and roles.
It reads `TANGERINE_PULP_URL`/`_USER`/`_PASSWORD`, so it can also run inside the
gateway pod.

Pulp rejects `POST` on the access-policies collection, so a fresh install must
create the missing records through the ORM. Generate the policy map from the
gateway package and run the Pulp-side helper:

```sh
python3 -c 'import json; from tangerine_gateway.access_policies import \
EXPECTED_POLICIES; print(json.dumps(EXPECTED_POLICIES))' > /tmp/policies.json

kubectl -n pulp exec -i deploy/pulp -c pulp -- \
  sh -c 'cat > /tmp/apply_pulp_access_policies.py' \
  < gateway/scripts/apply_pulp_access_policies.py

kubectl -n pulp exec -i deploy/pulp -c pulp -- \
  python3 /tmp/apply_pulp_access_policies.py --apply < /tmp/policies.json
```

Settings shows a read-only matched/drifted card; deployment automation can run the
gateway script after Pulp is ready.

> **Username collisions are rejected.** The username is taken from
> `preferred_username`, then `upn`, then `email`, then `sub`. If that name
> belongs to an existing Pulp account that is not in
> `TANGERINE_MANAGED_GROUP`, provisioning fails with `username_collision` and no
> group or role writes occur. A new username is created and added to the marker
> group. `TANGERINE_MANAGED_GROUP` is required; login fails closed without it.

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -e ".[test]"

TANGERINE_PULP_URL=http://localhost:8080 \
TANGERINE_PULP_PASSWORD=admin \
TANGERINE_EXTERNAL_BASE_URL=http://localhost:5173 \
TANGERINE_COOKIE_SECURE=false \
  .venv/bin/uvicorn tangerine_gateway.main:app --port 8081
```

Vite proxies `/sso` to port 8081, so sign-in works from the dev server.

Tests need no Django, Pulp, or network. They run against SQLite by default and
against PostgreSQL when a test URL is supplied:

```sh
python -m pytest gateway -q
TANGERINE_TEST_DATABASE_URL=postgresql://tangerine:test@localhost:5432/tangerine_test \
  python -m pytest gateway -q
```
