# AGENTS.md

Guidance for agents and contributors working on Tangerine.

## Project overview

Tangerine is a full-admin web console for [Pulp](https://pulpproject.org/).
It is a static React single-page application that talks directly to the Pulp
REST API, plus an optional Python SSO gateway.

Primary assumptions:

- Pulp local session authentication is used by default.
- Pulp domains are disabled.
- The UI and API are same-origin.
- Default paths are `/ui/` and `/pulp/api/v3/`.
- The UI is deployed as a static container behind the same ingress as Pulp.
- A host may be shared with Pulp: `/ui` belongs to Tangerine, `/pulp`, `/v2`, and
  `/token` belong to Pulp.

## Stack

- React 19 + TypeScript 5.9
- Vite 8
- TanStack Router (code-based routes, no generated route tree)
- TanStack Query
- Tailwind CSS v4
- Generated OpenAPI types from Pulp
- Playwright for end-to-end tests
- Docker + nginx for static hosting
- Helm for Kubernetes, with Traefik ingress defaults
- Python 3.12 for the optional SSO gateway

Node requirement: `>= 22.12`.

## Quick start

```sh
docker compose up -d
docker compose exec pulp pulpcore-manager reset-admin-password --password admin
npm install
npm run dev
```

Open <http://127.0.0.1:5173/ui/> and sign in as `admin` / `admin`.

Vite proxies `/pulp` to `http://localhost:8080` with `changeOrigin: false`, so
development uses the same same-origin cookie model as production. Override the
target with `PULP_PROXY`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite on 5173 with the `/pulp` proxy |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | Biome lint rules |
| `npm run format` | Format supported files |
| `npm run format:check` | Verify formatting |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run check:bundle` | Verify the built bundle against size budgets |
| `npm run preview` | Preview the production build on 4173 |
| `npm run test:unit` | Node unit tests through `tsx` |
| `npm run test:e2e` | Playwright, Chromium only |
| `npm run test:gateway` | Python suite for `gateway/` |
| `npm run api:sync` | Fetch the live OpenAPI schema and regenerate types |
| `npm run api:types` | Regenerate types from `schema/pulp.json` |
| `npm run docs:screenshots` | Capture user-guide screenshots |

Required before a code change is finished:

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:gateway
npm run build
npm run check:bundle
npx playwright test
```

## Repository map

```text
src/api/                 fetch client, Pulp operations, generated schema types
src/auth/                session login/logout and current user
src/components/          app shell, tables, panes, gates, UI primitives
src/features/<area>/     one folder per screen area
src/hooks/               queries, mutations, URL state, scoped sessions
src/lib/                 registries and helpers
src/router.tsx           every route and the auth gate
src/main.tsx             config -> router -> providers bootstrap

deploy/helm/tangerine/   UI chart (optional SSO gateway)
deploy/helm/pulp/        Pulp chart (Pulp Operator CR, Secrets, settings)
deploy/nginx/            production nginx config and CSP
docs/                    user guide and screenshots
gateway/                 OIDC relying party and Pulp identity bridge
schema/pulp.json         checked-in OpenAPI snapshot (generated)
scripts/                 schema sync, screenshots, bundle budget
tests/                   Playwright specs and Node unit tests
```

## Routes

`/`, `/login`, `/repositories`, `/repositories/detail`, `/remotes`,
`/remotes/new`, `/remotes/detail`, `/distributions`, `/distributions/detail`,
`/publications`, `/content`, `/tasks`, `/tasks/$taskId`, `/workers`,
`/operations`, `/import-export/{pulp-export,filesystem-export,pulp-import}`,
`/users`, `/groups`, `/roles`, `/signing`, `/plugins`, `/api-admin`, `/settings`.

Detail screens use `?href=<pulp_href>`. Lists keep `?q=`, `?page=`, `?per=`, and
`?sort=` in the URL. Content uses `?plugin=`, `?type=`, `?view=units`,
`?package=`, and `?repos=`.

## Application bootstrap

1. `main.tsx` loads `/ui/config.json` through `loadConfig()`.
2. Providers mount as `ThemeProvider` -> `QueryClientProvider` -> `AuthProvider`.
3. `router.tsx` creates the code-based route tree at `config.uiBasePath`.
4. `RootComponent` is the auth gate: splash while loading, redirect to `/login`,
   render `AppShell` for authenticated users.

Base-path invariant:

```text
VITE_BASE_PATH == config.uiBasePath == ingress UI path
```

Changing `uiBasePath` requires rebuilding the image with a matching
`VITE_BASE_PATH`; runtime config cannot move compiled assets.

## Auth and CSRF

Local session flow:

1. `POST /pulp/api/v3/login/` with HTTP Basic credentials and `{}`.
2. Pulp returns `201` and sets the HttpOnly `sessionid` and readable
   `csrftoken` cookies.
3. `GET /login/` returns `prn`, `pulp_href`, and `username`; the full user
   record is fetched from the href. Non-staff accounts may get `403` reading
   their own record, so fall back to the partial session user.
4. `DELETE /login/` requires CSRF. Logout repeats until `GET /login/` returns
   `401`, then clears the React Query cache.

`src/api/client.ts`:

- adds `Accept: application/json` and a synthetic
  `Authorization: TangerineSession` when the caller set no auth header, which
  suppresses browser-cached Basic credentials after logout;
- JSON-encodes object bodies and sets `Content-Type`;
- sends `X-CSRFToken` for every method except `GET`, `HEAD`, and `OPTIONS`;
- uses `credentials: "same-origin"`;
- normalizes Pulp hrefs onto `apiBasePath`;
- throws `ApiError` with status, detail, field errors, correlation ID, and body.

Never persist passwords in `localStorage`/`sessionStorage`. The CSRF token is
intentionally readable by JavaScript.

## SSO gateway

`authMode: gateway` shows provider buttons fetched from the gateway. Providers
are data in the gateway database, not static config. The gateway owns an OIDC
session and answers Traefik forwardAuth requests with an identity header that
Pulp reads through `JSONHeaderRemoteAuthentication`.

Security invariants:

1. The identity header is unsigned. Pulp must be reachable only through an
   ingress that strips inbound `X-Tangerine-Identity` before forwardAuth, and a
   CNI must actually enforce NetworkPolicy.
2. Existing usernames are accepted only when already in the managed group.
3. Attach strip and forwardAuth to a dedicated `/pulp` router, strip-first. Do
   not attach them to `/v2` or `/token`; a gateway outage must not break the
   registry.
4. Provider administration is privilege escalation; treat it as a privileged
   operation and audit it.

Gateway details live in `gateway/README.md` and the public SSO runbook.

## Data fetching conventions

Use the existing layers:

- `apiRequest<T>` / `apiRequestWithStatus<T>` for one-off reads and writes.
- `pulpApi.*` for common Pulp operations in `src/api/resources.ts`.
- `listResource<T>`, `listAllResource<T>`, `useAllList`, `useLoadMoreList`,
  and `useApiPages` for pagination shapes.
- React Query hooks in `src/hooks/queries.ts` for screen data.
- `useApiMutation`, `usePulpWrite`, `usePulpDelete`, and `useScopedMutation` for
  writes. Keep invalidation lists next to the hook.
- `query-keys.ts` is the single key factory; `invalidations.ts` resolves keys.
- Await `202 { task }` responses with `waitForTask()` before invalidating.

Do not add a second HTTP client or state library. Extend these layers.

## Pulp API quirks

- Combined lists exist at `/repositories/`, `/remotes/`, `/distributions/`,
  `/publications/`, `/tasks/`, and `/workers/`, but plugin-specific endpoints
  are used for writes.
- `/content/` itself is empty; real types live under `/content/<plugin>/<type>/`
  and are discovered from the API root.
- The combined `/distributions/` response omits `publication`; fetch the
  plugin-specific record before showing or editing a source.
- Use `repositoryTypeFromHref()`, `repositoryVersionNumber()`,
  `resourceIdFromHref()`, and `publicationResourceForRepositoryFromHref()`
  rather than duplicating regexes.
- Pulp hrefs may be absolute or relative; normalize through the client.
- Async writes return `{ "task": "<href>" }`; wait before invalidating.
- Task detail and cancel work at runtime even though the checked-in schema omits
  them. Cancel is `PATCH {task_href}` with `{"state":"canceled"}`.
- Repository sync is `POST ${repositoryHref}sync/` with `{}`.
- Publication creation is `POST publications/<plugin>/<type>/` with
  `repository_version`; it returns a task.
- The combined `/publications/` is read-only and omits `pulp_type`; derive the
  type from the href.
- Repository-backed distributions serve the newest publication implicitly; do
  not claim no publication exists.
- `autopublish` applies to File, RPM, DEB, and Python repositories and only to
  versions created after it is enabled.
- Signing services are read-only over REST. RPM `metadata_signing_service` signs
  `repomd.xml` at publication; package signing is deliberately not exposed.
- Remote responses omit write-only credentials; use `hidden_fields` and only
  send a secret when the user enters a new value.
- User search uses `username__contains`; groups, roles, remotes, and
  distributions use `name__contains`. Signing services support exact `name`
  only.
- Some content endpoints reject `ordering=-pulp_last_updated`; the generic
  content browser sends no ordering.

## UI conventions

- Use the shared primitives in `src/components/ui/`.
- Use `ResourceList` for paginated/searchable tables; use `headerMode="section"`
  for nested lists.
- Use `PageHeader` at the top of every route; do not add a second page heading.
- Use `Modal` for create and destructive flows, with dirty-state protection.
- Use `BottomPane` for bottom-anchored detail panes and
  `useApiDataPane().openApiData()` for API JSON.
- Use `Combobox` / `MultiCombobox` for Pulp-backed pickers; native `Select` for
  short static lists.
- Use `useFormState` for multi-field dialogs and pass `value` plus one
  `onChange(patch)` callback to fields.
- Use `toast.success` / `toast.error` via mutation hooks; never toast during
  render.
- Use `Badge` tones consistently: brand/orange for primary types, success for
  healthy, warning for caution, danger for destructive, info/neutral for
  metadata.
- Use `lucide-react` icons at `size-4`; entity icons come from `src/lib/icons.ts`.
- Use `BrandMark` for the logo, not a Lucide icon.
- Keep the zinc + orange palette and dark-mode variants.
- Match the surrounding style: double quotes, semicolons, 2-space indentation,
  100-column width.
- Use semantic text sizes `text-micro`, `text-meta`, `text-label`.
- The shell `<main>` is full-bleed; use the `3xl` breakpoint for wide screens.
- Every control needs a visible label or `aria-label`; icon-only buttons need an
  accessible name.
- Preserve keyboard behavior of Modal, BottomPane, Button, and form components.
- Entity icons are unique per concept; one icon means one entity.

## Testing

- Playwright base URL: `http://127.0.0.1:5173`; Chromium only; `fullyParallel`.
- Tests create unique resources and clean up through `page.request`.
- Do not depend on pre-seeded names or assume a new resource is on page one.
- Intercept fake tasks instead of waiting for real long-running operations.
- Unit tests use the Node test runner through `tsx`; `tsconfig.json` includes
  `tests`.
- The gateway suite needs no Django, Pulp, or network; it uses SQLite by default
  and accepts `TANGERINE_TEST_DATABASE_URL` for PostgreSQL.
- Add tests for new behavior in the area suite rather than one monolith.

## Docker and Helm

- The UI image is multi-stage: Node build, nginx runtime.
- Static files land in `/usr/share/nginx/html/ui`; nginx listens on 8080.
- `/healthz` returns `200 ok`; `/` and `/ui` redirect to `/ui/`; deep links fall
  back to `index.html`.
- Hashed assets are cached for a year; `config.json` and `index.html` are never
  cached.
- The container is static-only; the ingress routes `/pulp` to Pulp.
- `VITE_BASE_PATH` is compiled in; rebuild when the UI path changes.
- The Tangerine chart renders a Deployment, Service, runtime ConfigMap, Ingress,
  optional gateway, optional internal/external PostgreSQL, Jobs, PDB, and
  NetworkPolicy.
- Every gateway-related resource is conditional on `gateway.enabled`.
- `deploy/helm/pulp` provisions Pulp through Pulp Operator with external
  database and S3 object storage by default.
- The Pulp chart writes `custom_pulp_settings` (not `spec.pulp_settings`).
- One Ingress should own the shared host certificate; the other references the
  same TLS Secret.
- The Pulp Operator Ingress is a Prefix `/` route. Before enabling SSO, split
  `/pulp` from `/v2` and `/token` so the forwardAuth middlewares do not cover the
  registry.

## Schema workflow

Do not hand-edit `schema/pulp.json` or `src/api/schema.d.ts`. After changing
plugins or Pulp versions:

```sh
npm run api:sync
```

To regenerate only from the checked-in schema:

```sh
npm run api:types
```

## Current gaps

- Signing services are inventory-only; the operator or host registers them.
- Package signing is intentionally not exposed.
- Imports/exports are curated, but Pulp must allow the configured server paths.
- Plugin install/uninstall requires a new Pulp image; there is no REST API.
- The SSO identity header is unsigned; edge stripping and enforced
  NetworkPolicy are mandatory.
- Gateway background reconciliation only replays the last assertion; scheduled
  directory sync discovers IdP changes.

## Workspace notes

- Keep changes small and focused.
- Do not commit `dist/`, `node_modules/`, `test-results/`, or
  `playwright-report/`.
- The local Pulp instance is disposable; tests create and delete their own data.
- Prefer the existing architecture over new abstractions.
