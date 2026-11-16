# Tangerine Helm chart

Deploys the Tangerine static web console alongside Pulp.

## Prerequisites

- Kubernetes >= 1.25
- An ingress controller; the defaults target Traefik
- Pulp reachable on the same host under `/pulp`
- An image built with `VITE_BASE_PATH` matching `config.uiBasePath`

## Install

```sh
helm upgrade --install tangerine . \
  --namespace pulp \
  --set image.repository=oneinchlunch/tangerine-ui \
  --set image.tag=0.1.4 \
  --set ingress.hosts[0].host=pulp.example.com \
  --set ingress.tls[0].secretName=pulp-tls
```

Images are published on Docker Hub:

| Image | Purpose |
| --- | --- |
| `oneinchlunch/tangerine-ui` | Static UI served by nginx |
| `oneinchlunch/tangerine-gateway` | Optional OIDC gateway for SSO |

Both are public. Pin `image.tag` to a release rather than relying on `latest`.

## Companion Pulp chart

`deploy/helm/pulp` deploys Pulp with Pulp Operator for this UI. It is a separate
release so Pulp and Tangerine can be upgraded independently:

```sh
helm upgrade --install pulp deploy/helm/pulp --namespace pulp \
  --set database.existingSecret=pulp-database \
  --set objectStorage.existingSecret=pulp-s3 \
  --set ingress.host=pulp.example.com \
  --set ingress.tlsSecret=pulp-tls
```

Install the operator chart first; see `deploy/helm/pulp/README.md`.

## Routing

The chart expects this layout on the shared Pulp host:

| Path | Backend |
| --- | --- |
| `/` | Redirect handled by nginx (`302` to `/ui/`) |
| `/ui` | Redirect handled by nginx (`301` to `/ui/`) |
| `/ui/` | This chart's Service, port 8080 |
| `/pulp` | Existing Pulp ingress |

Traefik-specific annotations set:

- entrypoint `websecure`
- router priority `1000`
- TLS enabled

For cert-manager, add the issuer annotation to `ingress.annotations` and point
`ingress.tls[0].secretName` at the Secret it creates:

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - secretName: pulp-tls
      hosts:
        - pulp.example.com
```

When Pulp and Tangerine share a host, let one Ingress own the certificate and
have the other reference the same Secret; do not annotate both, or
cert-manager issues two certificates for the same host.

The `/`, `/ui`, and `/ui/` rules are intentionally separate. `Exact` on `/` makes
the bare host root redirect to the UI without matching `/pulp`, `/v2`, or `/token`.
`Prefix` on `/ui/` avoids matching paths such as `/uix`, while `Exact` on `/ui` lets
nginx redirect cleanly. If you share this host with another application that owns
the root, delete the `/` path from `ingress.hosts[].paths`.

If Pulp uses a catch-all `/` Ingress on the same host, the explicit priority
keeps the UI routes ahead of it. If your Pulp route has a higher explicit
priority, increase `ingress.annotations["traefik.ingress.kubernetes.io/router.priority"]`.

### Existing Pulp deployment

The chart is designed to sit beside Pulp, not to install it. Install into the
namespace that owns the Pulp ingress (or allow cross-namespace middleware
references) and point at the existing Pulp service:

```sh
helm upgrade --install tangerine deploy/helm/tangerine \
  --namespace pulp \
  --set image.repository=oneinchlunch/tangerine-ui \
  --set image.tag=0.1.4 \
  --set config.authMode=session \
  --set ingress.hosts[0].host=pulp.example.com \
  --set ingress.tls[0].secretName=pulp-tls
```

When another application owns the host root, keep Tangerine on `/ui` and `/ui/`
only:

```sh
--set ingress.rootRedirect.enabled=false
```

For gateway/SSO mode, enable `gateway.enabled`, provide
`gateway.existingSecret`, `gateway.secretFilesSecret`, and a separate
PostgreSQL Secret (`postgres.mode=external`, `postgres.externalSecret`). The
chart creates the Traefik middlewares but cannot attach them: add both to the
existing Pulp `/pulp` ingress, strip-first, as shown in `NOTES.txt`. Pulp must
also receive the identity-header settings through `spec.custom_pulp_settings`
(Pulp Operator) or its settings file. With Pulp Operator the Ingress is a single
catch-all object, so split the registry paths (`/v2`, `/token`) onto their own
Ingress before attaching the middlewares.

## Configuration

All keys under `config` are written to a ConfigMap as `config.json` and mounted
at `/usr/share/nginx/html/ui/config.json`.

```yaml
config:
  apiBasePath: /pulp/api/v3/
  uiBasePath: /ui/
  authMode: session
  externalLoginUri: null
  pollIntervalMs: 3000
  extraVersion: ""
```

Changing `config.uiBasePath` requires rebuilding the image with the matching
`VITE_BASE_PATH`; assets are served under that path at build time.

## Pulp requirements

For same-origin session auth:

```python
ALLOWED_HOSTS = ["pulp.example.com"]
CONTENT_ORIGIN = "https://pulp.example.com"
CSRF_TRUSTED_ORIGINS = ["https://pulp.example.com"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

Traefik must forward `X-Forwarded-Proto` and `X-Forwarded-Host`. Pulp's session
and CSRF cookies must use the default path `/`.

## Values

See `values.yaml` for the full set. Notable options:

- `replicaCount` (default 1)
- `image.repository`, `image.tag`
- `ingress.enabled`, `ingress.className`, `ingress.hosts`, `ingress.tls`
- `ingress.rootRedirect.enabled` (disable when another app owns the host root)
- `resources`
- `podSecurityContext`, `securityContext`
- `podDisruptionBudget.enabled`
- `networkPolicy.enabled`
- `gateway.superadminGroup`, `gateway.adminGroup`, `gateway.managedGroup`
- `gateway.rateLimitPerMinute`, `gateway.rateLimitBurst`,
  `gateway.rateLimitGlobalPerMinute`, `gateway.trustedProxies`
- `ops.jobs.*`
- `ops.cronjobs.directorySync`, `ops.cronjobs.pruneIdentities`

## Secrets

The default is a plain Kubernetes Secret referenced by
`gateway.secretFilesSecret`. Each key is a file name referenced by a provider
(do not put secret values in provider rows).

Optional production patterns:

- **External Secrets Operator:** create an `ExternalSecret` that produces the
  same Secret. Rotations refresh the mounted files; the gateway reads them per
  login.
- **CSI Secrets Store:** mount provider secrets through the CSI driver.
- **Encrypted etcd at rest:** a cluster-level API-server encryption config. It
  protects Secrets at rest but does not rotate them.
- **Sealed Secrets/SOPS:** encrypt the Secret material in Git and let the
  controller decrypt it.

No provider restart is required after rotation. The `secret-check` Job verifies
that enabled providers' files are present and readable.

## Install/update Jobs

When `gateway.enabled` and `ops.jobs.enabled` are true, the chart runs
post-install/post-upgrade Jobs:

- `migrate` — gateway database migrations; waits for PostgreSQL.
- `access-policies` — opt-in Pulp ORM Job; waits for PostgreSQL. Set
  `ops.jobs.accessPolicies.databaseSecret` to the Pulp database Secret.
- `managed-roles` — creates/updates `tangerine-*` roles; waits for Pulp
  `/pulp/api/v3/status/`.
- `secret-check` — verifies mounted IdP secret files; waits for PostgreSQL.

Hook weights run them in that order. Jobs are idempotent, have a bounded
deadline/backoff, and are deleted after success. The access-policy Job is
disabled by default because not every deployment exposes the Pulp database
Secret.

### Directory sync CronJob

`ops.cronjobs.directorySync` optionally runs `sync-directory` on a schedule. It
fetches Entra app assignments/groups or Google mapped-group members, then
deprovisions unauthorized SSO users and reactivates returning users. Set
`provider` and usually `apply: true`; run once with `apply: false` to inspect the
dry-run output.

`ops.cronjobs.pruneIdentities` optionally runs `prune-identities` against an
operator-supplied directory snapshot. Set `directoryConfigMap` to a ConfigMap
containing a JSON `{"usernames": [...]}` file, choose `directoryKey` (default
`directory.json`), and keep `apply: false` until the dry-run output is reviewed.

## Validate

```sh
helm lint .
helm template tangerine . | kubeconform -strict -summary
```
