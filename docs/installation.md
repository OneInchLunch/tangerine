# Installation

Tangerine is a static UI. It must be served on the same origin as Pulp:

```text
https://pulp.example.com/ui/     -> Tangerine
https://pulp.example.com/pulp/   -> Pulp API and content
```

This guide covers a disposable local stack, a production container, and the Helm
charts. For the optional OIDC gateway, continue with the [SSO runbook](sso.md).

## Requirements

| Requirement | Notes |
| --- | --- |
| Docker + Compose | Local Pulp stack and image build |
| Node.js `>= 22.12` | Vite and the toolchain |
| Chromium | Playwright only: `npx playwright install chromium` |
| Helm 3.8+ | OCI chart installs |
| Kubernetes 1.25+ | Helm chart target |

## Local development

```sh
docker compose up -d

# Wait for /pulp/api/v3/status/ to return 200, then set the admin password.
docker compose exec pulp pulpcore-manager reset-admin-password --password admin

npm install
npm run dev
```

Open <http://127.0.0.1:5173/ui/> and sign in as `admin` / `admin`.

The Vite dev server proxies `/pulp` to `http://localhost:8080` with
`changeOrigin: false`, so the browser sees one origin. Point it elsewhere with
`PULP_PROXY`:

```sh
PULP_PROXY=http://pulp.example.com:8080 npm run dev
```

`compose.yaml` mounts `deploy/example/settings/settings.py`. It trusts local
ports, enables the bundled Redis cache, and disables token auth. It is
development-only; do not copy it to production.

## First sign-in

1. Open `/ui/`.
2. Sign in with the Pulp administrator.
3. The dashboard should show the API as reachable and the Pulp version.
4. If the API is unreachable, check `config.json` (`apiBasePath`) and the
   reverse proxy.

The login page shows the configured API base path at the bottom; it is the first
thing to compare with the ingress.

## Production image

```sh
docker build --build-arg VITE_BASE_PATH=/ui/ -t tangerine:0.1.4 .
docker run --rm -p 8090:8080 tangerine:0.1.4
curl http://127.0.0.1:8090/healthz
```

The image:

- serves static files from `/ui/`;
- redirects `/` and `/ui` to `/ui/`;
- falls back to `index.html` for deep links;
- returns `200 ok` on `/healthz`;
- caches hashed assets for one year and never caches `config.json` or
  `index.html`.

`VITE_BASE_PATH` is compiled into the assets. If the UI path changes, rebuild
the image with the matching value. Runtime config alone cannot move assets.

Published images:

```sh
docker pull oneinchlunch/tangerine-ui:0.1.4
docker pull oneinchlunch/tangerine-gateway:0.1.0   # optional SSO gateway
```

## Runtime configuration

The app loads `/ui/config.json` before rendering. A minimal production file:

```json
{
  "apiBasePath": "/pulp/api/v3/",
  "uiBasePath": "/ui/",
  "authMode": "session",
  "externalLoginUri": null,
  "gatewayBasePath": "/sso/",
  "passwordLoginEnabled": true,
  "ssoManagedGroup": null,
  "pollIntervalMs": 3000,
  "extraVersion": ""
}
```

See [Configuration](configuration.md) for every key and auth mode.

## Pulp settings

For same-origin session authentication through an ingress:

```python
ALLOWED_HOSTS = ["pulp.example.com"]
CONTENT_ORIGIN = "https://pulp.example.com"
CSRF_TRUSTED_ORIGINS = ["https://pulp.example.com"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

The ingress must forward `X-Forwarded-Proto` and `X-Forwarded-Host`. Pulp cookies
must use path `/`. With Pulp Operator, the `pulp` chart writes these through
`spec.custom_pulp_settings`.

## Helm: Tangerine only

Use this when Pulp is already deployed.

```sh
helm upgrade --install tangerine \
  oci://registry-1.docker.io/oneinchlunch/tangerine \
  --version 0.2.4 --namespace pulp \
  --set image.tag=0.1.4 \
  --set ingress.hosts[0].host=pulp.example.com \
  --set ingress.tls[0].secretName=pulp-tls
```

From a checkout, replace the OCI reference with `deploy/helm/tangerine`.

The chart renders:

- a Deployment with a non-root user, read-only root filesystem, and probes;
- a Service on port 8080;
- a ConfigMap containing `config.json`;
- an Ingress with `/` Exact, `/ui` Exact, and `/ui/` Prefix paths;
- optional ServiceAccount, PDB, and NetworkPolicy;
- an optional SSO gateway at `config.gatewayBasePath`.

The `/ui/` route uses Traefik priority `1000` so it wins over a Pulp catch-all
`/` route. Keep `/` as `Exact`; a `Prefix /` would capture `/pulp`, `/v2`, and
`/token`.

### TLS and cert-manager

Let one Ingress own the certificate for the shared host and reference the same
Secret from the other. For cert-manager:

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - secretName: pulp-tls
      hosts:
        - pulp.example.com
```

Do not annotate both the Pulp and Tangerine Ingresses for the same host; that
creates two certificates.

## Helm: Pulp and Tangerine

`deploy/helm/pulp` deploys Pulp via Pulp Operator, an external PostgreSQL, and
S3-compatible object storage. Install the operator first:

```sh
helm repo add pulp-operator \
  https://github.com/pulp/pulp-k8s-resources/raw/main/helm-charts/ --force-update

helm upgrade --install pulp-operator pulp-operator/pulp-operator \
  --namespace pulp --create-namespace \
  --set-json 'imagePullSecrets=[]'
```

The upstream operator chart defaults `imagePullSecrets` to
`redhat-operators-pull-secret`; `--set imagePullSecrets=[]` renders invalid YAML,
so use `--set-json`.

Create the database and object-storage Secrets:

```sh
kubectl -n pulp create secret generic pulp-database \
  --from-literal=POSTGRES_HOST=db.example.com \
  --from-literal=POSTGRES_PORT=5432 \
  --from-literal=POSTGRES_USERNAME=pulp \
  --from-literal=POSTGRES_PASSWORD='...' \
  --from-literal=POSTGRES_DB_NAME=pulp \
  --from-literal=POSTGRES_SSLMODE=require

kubectl -n pulp create secret generic pulp-s3 \
  --from-literal=s3-bucket-name=pulp-content \
  --from-literal=s3-endpoint=https://s3.example.com \
  --from-literal=s3-access-key-id='...' \
  --from-literal=s3-secret-access-key='...'
```

Install Pulp:

```sh
helm upgrade --install pulp deploy/helm/pulp --namespace pulp \
  --set database.existingSecret=pulp-database \
  --set objectStorage.existingSecret=pulp-s3 \
  --set ingress.host=pulp.example.com \
  --set ingress.tlsSecret=pulp-tls
```

The operator runs migrations and a password-reset Job. Read the generated
administrator password:

```sh
kubectl -n pulp get secret pulp-admin-password \
  -o jsonpath='{.data.password}' | base64 -d
```

Install Tangerine in the same namespace. The Pulp Ingress owns the certificate;
Tangerine references the same Secret.

## Verify

```sh
curl -fsS https://pulp.example.com/ui/ >/dev/null
curl -fsS https://pulp.example.com/pulp/api/v3/status/ >/dev/null
```

Then sign in, check the dashboard, create a small File repository, sync it, and
delete it. For content endpoints, remember that repository-backed distributions
need a publication before they serve files.

## Upgrades

- Rebuild the UI image when `VITE_BASE_PATH` changes; otherwise bump
  `image.tag`.
- `helm upgrade` the Tangerine release.
- Upgrade Pulp and its chart independently.
- Keep chart and image versions documented; do not use floating tags in
  production.

## Next

- [Configuration](configuration.md)
- [SSO runbook](sso.md)
- [Signing](signing.md)
- [Troubleshooting](troubleshooting.md)
