# RPM signing

Tangerine can attach a signing service to an RPM repository to sign repository
metadata. This is separate from signing individual RPM packages.

| What | Field | When | Exposed |
| --- | --- | --- | --- |
| Repository metadata (`repomd.xml`) | `metadata_signing_service` | Publication | Yes, trusted staff only |
| Individual RPMs | `package_signing_service` | Upload and repo modify | No |
| Debian Release files | `signing_service` | Publication | Yes, trusted staff only |

Package signing is deliberately not exposed: it would let anyone who can upload
an RPM obtain a signature from the instance key. Sign packages in your build
pipeline instead.

## Generate a key

Use a dedicated key, not an OS-vendor or personal key.

```sh
export GNUPGHOME="$(mktemp -d)"
gpg --batch --gen-key <<'EOF'
%no-protection
Key-Type: RSA
Key-Length: 3072
Key-Usage: sign
Name-Real: Example RPM Signing
Name-Email: rpm-signing@example.com
Expire-Date: 2y
%commit
EOF

FPR=$(gpg --list-keys --with-colons | awk -F: '/^fpr:/{print $10; exit}')
gpg --armor --export-secret-keys "$FPR" > private.asc
gpg --armor --export "$FPR" > public.asc
```

Keep `private.asc` out of git. Publish `public.asc` (or its fingerprint) through
a channel your consumers trust.

## Provision the key

Create a Secret with the armored private key under `signing_service.gpg`:

```sh
kubectl -n pulp create secret generic pulp-signing-key \
  --from-file=signing_service.gpg=private.asc
```

Enable signing in the Pulp chart:

```sh
helm upgrade pulp deploy/helm/pulp --namespace pulp --reuse-values \
  --set signing.enabled=true \
  --set signing.existingSecret=pulp-signing-key \
  --set signing.fingerprint="$FPR"
```

The chart creates a hardened `rpm_script.sh` Secret. The operator imports the
key, mounts it for signing, and registers `rpm-signing-service` with
`core:AsciiArmoredDetachedSigningService`. The script signs only the file Pulp
passes and returns the JSON result Pulp expects.

If you supply your own script, set `signing.existingScriptsSecret` and use the
key `rpm_script.sh`. Keep it minimal: no `eval`, quoted arguments, and no
hardcoded passphrase.

## Attach a signing service

1. Open a repository of type RPM.
2. Edit it.
3. Choose **Metadata signing service**.
4. Save and publish a new version.

The selector is available only to trusted staff: gateway maintainers
(`is_superuser`) and local Pulp administrators. Repository-scoped gateway admins
do not see it, and the gateway rejects signing fields in scoped writes.

## Verify

RPM metadata lives under `repodata/`:

```sh
curl -fsSL https://pulp.example.com/pulp/content/<base_path>/repodata/repomd.xml -o repomd.xml
curl -fsSL https://pulp.example.com/pulp/content/<base_path>/repodata/repomd.xml.asc -o repomd.xml.asc
gpg --import public.asc
gpg --verify repomd.xml.asc repomd.xml
```

Object storage redirects content URLs to signed S3 URLs; follow redirects.

## Rotation

1. Generate a new key and publish its public half.
2. Update the `pulp-signing-key` Secret and `signing.fingerprint`.
3. Republish repositories.
4. Have consumers import the new key before you remove the old one.
5. Revoke the old key with the revocation certificate you stored offline.

Changing `rpm_script.sh` does not roll the Pulp pods (the operator watches the
key Secret). Delete the worker pod or force a new ReplicaSet after changing the
script.

## Security

- Any code execution in an api or worker pod can read the mounted key. A remote
  signer or HSM is the next hardening step for high-value keys.
- A malicious script Secret is equivalent to key compromise; restrict Secret
  read/write RBAC to the Pulp namespace.
- Metadata signing authenticates the repository description only. Clients still
  need package signatures for package-level trust (`gpgcheck`).
- Treat attaching a signing service as a privileged operation.
