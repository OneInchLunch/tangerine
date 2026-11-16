# Helm

Two charts live in `deploy/helm/`:

| Chart | Purpose |
| --- | --- |
| `tangerine` | UI, optional SSO gateway, gateway database |
| `pulp` | Pulp via Pulp Operator: CR, database/S3/signing Secrets, settings |

They are separate releases so Pulp and the UI upgrade independently.

## Images

| Image | Purpose |
| --- | --- |
| `oneinchlunch/tangerine-ui` | Static UI served by nginx |
| `oneinchlunch/tangerine-gateway` | Optional OIDC gateway |

Pin explicit tags. Build the UI with the same base path as `config.uiBasePath`:

```sh
docker build --build-arg VITE_BASE_PATH=/ui/ -t oneinchlunch/tangerine-ui:0.1.4 .
```

## Install the UI

```sh
helm upgrade --install tangerine \
  oci://registry-1.docker.io/oneinchlunch/tangerine \
  --version 0.2.4 --namespace pulp \
  --set image.tag=0.1.4 \
  --set ingress.hosts[0].host=pulp.example.com \
  --set ingress.tls[0].secretName=pulp-tls
```

Resources:

- Deployment with non-root user, read-only root filesystem, probes;
- Service on 8080;
- ConfigMap with `config.json`;
- Ingress with `/` Exact, `/ui` Exact, `/ui/` Prefix;
- optional ServiceAccount, PDB, NetworkPolicy;
- writable `emptyDir` mounts for nginx cache/run/tmp;
- optional gateway Deployment/Service/Ingress/middlewares;
- optional internal PostgreSQL or external Secret;
- install/update Jobs and optional CronJobs.

## Ingress

- Traefik class, `websecure` entrypoint, priority `1000`.
- `/ui/` must win over Pulp's catch-all `/`.
- `/` stays `Exact`; `Prefix /` would capture Pulp paths.
- A shared host should have one certificate owner; the other Ingress references
  the same Secret.

## SSO values

```yaml
config:
  authMode: gateway
gateway:
  enabled: true
  externalBaseUrl: https://pulp.example.com
  pulpUrl: http://pulp-api-svc:24817
  existingSecret: tangerine-gateway-auth
  secretFilesSecret: tangerine-idp-secrets
  managedGroup: sso-managed
  adminGroup: tangerine-admins
  superadminGroup: tangerine-maintainers
postgres:
  mode: external
  externalSecret: tangerine-gateway-db
```

All gateway resources are conditional on `gateway.enabled`. See the
[SSO runbook](../sso.md).

## Pulp chart

```sh
helm repo add pulp-operator \
  https://github.com/pulp/pulp-k8s-resources/raw/main/helm-charts/ --force-update

helm upgrade --install pulp-operator pulp-operator/pulp-operator \
  --namespace pulp --set-json 'imagePullSecrets=[]'

helm upgrade --install pulp deploy/helm/pulp --namespace pulp \
  --set database.existingSecret=pulp-database \
  --set objectStorage.existingSecret=pulp-s3 \
  --set ingress.host=pulp.example.com \
  --set ingress.tlsSecret=pulp-tls
```

`--set-json` is required for the empty pull-secret list; the string form renders
invalid YAML.

The Pulp chart:

- deploys `pulp-minimal`/`pulp-web` with api/content/worker/web components;
- uses an external database and S3 by default;
- writes `custom_pulp_settings` with host, CSRF, cookie, and proxy settings;
- optionally registers RPM metadata signing from a key Secret and script.

## Pulp Ingress and SSO

With a non-nginx controller the operator creates one Prefix `/` Ingress to
`pulp-web-svc` and runs `pulp-web`. A middleware annotation would cover `/v2`
and `/token` too. Before enabling SSO, replace it with two Ingresses: `/pulp`
with the middlewares, and `/v2` + `/token` without them.

## Validate

```sh
helm lint deploy/helm/tangerine
helm lint deploy/helm/pulp
helm template tangerine deploy/helm/tangerine --namespace pulp > /tmp/tangerine.yaml
```

## Publishing

The UI chart is published as an OCI artifact under the same repository name as
the project. Bump `version` and `appVersion`, update the changelog and Artifact
Hub annotations, package, and push:

```sh
helm package deploy/helm/tangerine -d dist
helm push dist/tangerine-0.2.4.tgz oci://registry-1.docker.io/oneinchlunch
```
