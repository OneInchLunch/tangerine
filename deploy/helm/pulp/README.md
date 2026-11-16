# Pulp Helm chart

Deploys a Pulp instance for Tangerine using [Pulp Operator](https://pulpproject.org/pulp_operator/).
This chart does not install the operator; install it once in the same namespace.

## Prerequisites

- Kubernetes >= 1.25
- Pulp Operator installed in the release namespace
- An external PostgreSQL database (recommended) or a storage class for the
  operator-managed database
- Object storage (S3-compatible) or a `ReadWriteMany` storage class
- Traefik (the default ingress annotations target it)

## Install Pulp Operator

```sh
helm repo add pulp-operator \
  https://github.com/pulp/pulp-k8s-resources/raw/main/helm-charts/ --force-update

helm upgrade --install pulp-operator pulp-operator/pulp-operator \
  --namespace pulp --create-namespace \
  --set imagePullSecrets=[]
```

The operator chart ships the `Pulp`, `PulpBackup`, and `PulpRestore` CRDs.

## Install Pulp

```sh
kubectl create namespace pulp --dry-run=client -o yaml | kubectl apply -f -

kubectl -n pulp create secret generic pulp-database \
  --from-literal=POSTGRES_HOST=db.example.com \
  --from-literal=POSTGRES_PORT=5432 \
  --from-literal=POSTGRES_USERNAME=pulp \
  --from-literal=POSTGRES_PASSWORD='...' \
  --from-literal=POSTGRES_DB_NAME=pulp \
  --from-literal=POSTGRES_SSLMODE=require

kubectl -n pulp create secret generic pulp-s3 \
  --from-literal=s3-bucket-name=pulp-content \
  --from-literal=s3-endpoint=https://nbg1.your-objectstorage.com \
  --from-literal=s3-access-key-id='...' \
  --from-literal=s3-secret-access-key='...'

helm upgrade --install pulp deploy/helm/pulp \
  --namespace pulp \
  --set database.existingSecret=pulp-database \
  --set objectStorage.existingSecret=pulp-s3 \
  --set ingress.host=pulp.example.com \
  --set ingress.tlsSecret=pulp-tls
```

The Secrets can also be created from `values.yaml` when `existingSecret` is
empty. Prefer an external Secret manager in production.

## Signing

Set `signing.enabled=true` with `signing.existingSecret` pointing at a Secret
that holds an ASCII-armored, passphrase-less private key under
`signing_service.gpg`. The chart ships a hardened `rpm_script.sh`; the operator
imports the key, mounts it read-only, and registers `rpm-signing-service` with
class `core:AsciiArmoredDetachedSigningService`.

```sh
kubectl -n pulp create secret generic pulp-signing-key \
  --from-file=signing_service.gpg=/secure/tangerine-rpm-signing.asc

helm upgrade pulp deploy/helm/pulp --namespace pulp \
  --reuse-values \
  --set signing.enabled=true \
  --set signing.existingSecret=pulp-signing-key \
  --set signing.fingerprint=<FINGERPRINT>
```

Safety properties:

- The private key never enters git, chart values, or the image.
- The script imports the key into a temporary `GNUPGHOME` and removes it after
  each run; the operator's own keyring import is not relied on.
- The script signs exactly the file Pulp passes and nothing else.
- `metadata_signing_service` only signs `repomd.xml`. Tangerine does not expose
  `package_signing_service`: signing uploaded packages would let anyone with
  repository upload rights mint trusted package signatures.

Verify after publishing:

```sh
curl -fsS https://HOST/pulp/content/<base_path>/repomd.xml.asc -o repomd.xml.asc
gpg --verify repomd.xml.asc repomd.xml
```

Treat the private key as a high-impact credential. Scope the Secret's RBAC to
the Pulp namespace, rotate it deliberately, and remember that any process in an
api or worker pod can read the mounted key.

## Settings

`custom_pulp_settings` points at a ConfigMap generated from `settings.*`.
Values are Python literals; the operator uppercases the keys. `CONTENT_ORIGIN`
and `ANSIBLE_API_HOSTNAME` are set by the operator from `ingress.host`.

Keep `settings.allowedHosts` at `["*"]` unless you know kubelet probes send a
matching `Host` header; a narrow list breaks readiness probes.

## Images

The defaults use the upstream Pulp images:

| Setting | Default |
| --- | --- |
| `image.repository` / `image.tag` | `quay.io/pulp/pulp-minimal:3.123.0` |
| `image.webRepository` / `image.webTag` | `quay.io/pulp/pulp-web:3.123.0` |

The upstream image set includes core, deb, certguard, file, rpm, container,
ansible, npm, python, hugging_face, and maven, but not `pulp_gem`. Build a
custom image and override these values when a plugin outside that set is needed.

## Storage

- Object storage (`objectStorage.enabled=true`) is the default and needs no PVC.
- File storage (`objectStorage.enabled=false`) requires `fileStorage.storageClass`.
  With a `ReadWriteOnce` class, all Pulp pods that mount the volume must run on
  the same node.
- The Redis cache uses an emptyDir volume unless `cache.storageClass` is set.

## Ingress and SSO

`ingress.enabled=true` creates a Prefix `/` Ingress to `<name>-web-svc:24880`
(the operator's nginx sidecar that routes the API, content, and registry
paths). The Tangerine chart must route `/ui/` at a higher Traefik priority.

The Ingress is a single object, so any middleware annotation applies to every
Pulp path, including `/v2` and `/token`. When enabling the Tangerine SSO
gateway, replace the operator Ingress with two chart-managed Ingresses: one for
`/pulp` with the strip/forwardAuth middlewares and one for `/v2` and `/token`
without them.

## Verify

```sh
kubectl -n pulp get pulp,pods,svc,ingress
curl -sS https://pulp.example.com/pulp/api/v3/status/ | head
```
