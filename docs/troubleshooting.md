# Troubleshooting

## The UI is blank or cannot reach Pulp

- Open `/ui/` and check the browser console.
- Compare the API base path in the login footer with the ingress path.
- `GET /pulp/api/v3/status/` must return `200` on the same origin.
- A 404 on `/ui/assets/...` usually means the image was built with the wrong
  `VITE_BASE_PATH` or the ingress path does not match `config.uiBasePath`.
- A 401 on `/login/` is expected when signed out.

## Login fails

- Invalid username/password comes from Pulp; verify with `curl` first.
- A CSRF rejection usually means the browser origin does not match Pulp's
  trusted origins.
- Cookies must use path `/`; a path-scoped cookie from an old deployment can
  sign the user back in after logout. Clear cookies and retry.
- If the native browser Basic-auth dialog appears, the ingress is challenging
  anonymous requests. Tangerine sends a synthetic auth header to prevent cached
  Basic credentials from being reused; check the reverse proxy.

## Data is stale or polling stops

- Check the connection badge in the top bar.
- Tasks and workers poll on intervals; an unreachable Pulp stops the updates.
- A scoped session intentionally does not poll `/tasks/`; its writes wait in the
  gateway instead.

## A repository-backed distribution returns 404

File, RPM, and DEB distributions serve a publication. A distribution attached to
a repository serves the newest publication implicitly, but if none exists the
content app returns 404.

- Open the repository and choose **Publish latest version**, or
- enable auto-publish (new versions only), or
- attach an existing publication to the distribution.

## Content is missing after a sync

- Confirm the task completed successfully.
- Check the repository version's added content.
- Distribution base paths are independent; check the correct distribution URL.
- On object storage, content URLs redirect to signed S3 URLs; follow redirects.

## A write returns 403

- Pulp enforces object-level permissions on every request.
- Repository-scoped SSO admins write through the gateway; direct repository
  PATCHes are intentionally not granted.
- Superuser-only operations include user/role writes and signing-service
  creation.

## Task cancel does nothing

- Only waiting or running tasks can be cancelled.
- Finished tasks return `409`; refresh the task.
- The top-bar chip shows waiting/running/cancelling tasks only.

## API admin shows the endpoint but the request fails

API admin sends the request as the current user. It is not a way to bypass Pulp
permissions. Check the response body and the Pulp task detail.

## SSO does not appear

- `config.authMode` must be `gateway`.
- `gateway.enabled` must be true.
- `GET /sso/providers` must return at least one enabled provider.
- Gateway mode never auto-redirects; use the provider button.

See the [SSO runbook](sso.md) for gateway, provider, middleware, and Pulp
identity-header problems.

## Signing is missing

- The signing-service list must contain `rpm-signing-service`.
- The repository must be RPM.
- Only trusted staff see the signing field.
- Publishing an empty repository still produces signed `repomd.xml`; check the
  `repodata/` path, not the base path root.
- Object storage redirects; use `curl -L`.

## Bundle or build problems

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run check:bundle
```

If the bundle budget fails, check for a new eager route import; heavy routes
should use `lazyRouteComponent`.
