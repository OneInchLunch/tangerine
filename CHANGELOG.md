# Changelog

## 0.1.4

- RPM repository metadata signing: superuser-only repository form, Pulp chart
  key/script provisioning, and verification guidance.
- Companion `pulp` Helm chart with external database, S3 object storage, and
  signing support.
- SSO gateway documentation for Google, Microsoft Entra ID, Keycloak, and
  generic OIDC providers.
- Review remediation: scope validation, gateway task waits, capability gates,
  URL-backed page sizes, and structural splits.
- Single UI replica by default; sticky top bar no longer moves on overscroll.

## 0.1.0

- Initial public release: dashboard, repositories, remotes, distributions,
  publications, content browser, tasks, workers, operations, import/export,
  RBAC, signing inventory, plugins, API admin, settings, and quick switcher.
- Optional OIDC gateway with declarative access rules and Pulp RBAC.
- Docker image and Helm chart.
