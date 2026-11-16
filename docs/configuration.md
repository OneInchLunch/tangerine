# Configuration

Tangerine is configured at runtime by `/ui/config.json`, loaded before the app
renders. The Helm chart writes this file from its `config` values and mounts it
over the image file.

## File

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

| Key | Meaning |
| --- | --- |
| `apiBasePath` | Pulp API base path. It must stay on the same origin as the UI. |
| `uiBasePath` | Router base path. It must equal `VITE_BASE_PATH` and the ingress path. |
| `authMode` | `session`, `external`, or `gateway`. Unknown values fall back to `session`. |
| `externalLoginUri` | Redirect target when ingress-level authentication is used. |
| `gatewayBasePath` | Base path of the SSO gateway (default `/sso/`). |
| `passwordLoginEnabled` | Show the local Pulp password form. |
| `ssoManagedGroup` | Pulp group marking provider-managed accounts. It must match the gateway's managed group. |
| `pollIntervalMs` | Base polling interval for tasks and workers. |
| `extraVersion` | Optional label shown in Settings. |

## Base-path invariant

```text
VITE_BASE_PATH == config.uiBasePath == ingress UI path
```

The asset paths are compiled at build time. Changing the UI path requires a new
image build with the matching `VITE_BASE_PATH`; editing `config.json` alone is
not enough.

## Authentication modes

### `session`

The default. Tangerine posts the username and password to Pulp's `login/`
endpoint. Pulp sets an HttpOnly `sessionid` cookie and a readable `csrftoken`
cookie; every write sends the CSRF token.

Use this mode for a local administrator or break-glass access. For SSO, use
`gateway` and keep password login available only if you need a fallback.

### `external`

The ingress authenticates the user before the request reaches the UI.
Unauthenticated visitors are redirected to `externalLoginUri`. Tangerine does no
login choreography in this mode.

### `gateway`

The login page shows one button per enabled provider. Providers are data in the
gateway's database, not static config. Choosing a provider performs a top-level
navigation to `<gatewayBasePath>start`.

Gateway mode never auto-redirects. Auto-redirecting would turn a provider outage
into a login loop. Only `external` mode redirects automatically.

See the [SSO runbook](sso.md).

## Runtime config in Helm

All keys under `config` are written to a ConfigMap:

```yaml
config:
  apiBasePath: /pulp/api/v3/
  uiBasePath: /ui/
  authMode: session
  gatewayBasePath: /sso/
  passwordLoginEnabled: true
  pollIntervalMs: 3000
```

The chart mounts the ConfigMap at
`/usr/share/nginx/html/ui/config.json`, so runtime settings can change without
rebuilding the image.

## Pulp-side configuration

Same-origin session auth needs:

```python
ALLOWED_HOSTS = ["pulp.example.com"]
CONTENT_ORIGIN = "https://pulp.example.com"
CSRF_TRUSTED_ORIGINS = ["https://pulp.example.com"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
```

With Pulp Operator, set these through `custom_pulp_settings`. The `pulp` chart
generates a ConfigMap from its `settings` values; `CONTENT_ORIGIN` comes from
`ingress.host`. Keep `ALLOWED_HOSTS = ["*"]` unless you know your kubelet probes
send a matching `Host` header; a narrow list breaks readiness probes.

## Polling

Tasks and workers poll on intervals derived from `pollIntervalMs`. Active task
lists and the top-bar running-task chip refresh more often; idle screens back
off. If Pulp is slow, raise the interval before raising timeouts.

## Images and tags

- `oneinchlunch/tangerine-ui`
- `oneinchlunch/tangerine-gateway`

Pin an explicit tag in production. `latest` is not published for every change.
