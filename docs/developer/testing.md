# Testing

Four layers: static checks, Node unit tests, Playwright end-to-end tests, and
the gateway's Python suite.

## Suites

| Suite | Command | Needs |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Node |
| Lint / format | `npm run lint`, `npm run format:check` | Node |
| Unit | `npm run test:unit` | Node (`tsx`) |
| E2E | `npx playwright test` | Chromium, Vite, local Pulp |
| Gateway | `npm run test:gateway` | Python deps; PostgreSQL optional |

The current snapshot is 125 unit tests, 76 Playwright tests, and 242 gateway
tests. Treat counts as a snapshot, not a rule.

## End-to-end setup

`playwright.config.ts`:

- base URL `http://127.0.0.1:5173`;
- Chromium only;
- `fullyParallel`;
- 60 s test timeout, 10 s expect timeout;
- reuses an existing dev server or starts one.

Point the suite at a deployment with:

```sh
PLAYWRIGHT_BASE_URL=https://pulp.example.com npx playwright test
```

Tests assume Pulp at `http://localhost:8080` with `admin` / `admin`. Override
with `PULP_ADMIN_USER` and `PULP_ADMIN_PASSWORD`. They create uniquely named
resources and delete them through authenticated `page.request` calls, so they
are safe under parallel workers and against a disposable instance.

## Spec map

| Spec | Covers |
| --- | --- |
| `auth.spec.ts` | Sign-in/out, stale cookies, cached Basic auth, admin identity, gates, gateway mode, SSO errors |
| `repositories.spec.ts` | Create/inspect, plugin coverage, auto-publish, distributions, dirty-modal guard |
| `remotes.spec.ts` | Create, edit, delete |
| `distributions.spec.ts` | Metadata edits, source changes, system artifact distribution |
| `publications.spec.ts` | Filter, delete, persistence, 404 after delete |
| `publication-settings.spec.ts` | Custom publication settings and immutable detail |
| `content.spec.ts` | Plugin accordion, drawer, search, API record view |
| `content-packages.spec.ts` | Grouped packages, variants, load more, deep links |
| `cve-badges.spec.ts` | Severity chips, clean/not-scanned, advisory pane, OSV config |
| `content-repositories.spec.ts` | Repository multi-picker and query filters |
| `content-upload.spec.ts` | Multipart File upload |
| `tasks-cancel.spec.ts` | Intercepted task cancellation |
| `admin.spec.ts` | Section titles, settings nav, wide layout, sidebar collapse |
| `rbac.spec.ts` | Role and group membership changes |
| `import-export.spec.ts` | Pulp exporter/importer lifecycle |
| `api-admin.spec.ts` | Live schema request console |
| `list-state.spec.ts` | URL state and Back |
| `list-navigation.spec.ts` | Detail back links |
| `quick-switcher.spec.ts` | Palette, search, page commands |
| `table-controls.spec.ts` | Page size and sorting |
| `ui-feedback.spec.ts` | Toasts and task chip |
| `unsaved-guard.spec.ts` | Dirty-dialog protection |
| `signing.spec.ts` | RPM signing field, fingerprint, submitted href |

## Gateway suite

```sh
npm run test:gateway
```

It needs no Django, Pulp, or network. It uses SQLite by default and accepts
`TANGERINE_TEST_DATABASE_URL` for PostgreSQL. It covers claims, OIDC validation,
sessions, the admin API, access rules, domain policy, reconciliation, identity
assertions, scoped writes, rate limiting, directory sync, and secret checks.

## Unit tests

`tests/unit/*.test.ts` use the Node test runner through `tsx`. Coverage includes
API error parsing, mutation invalidation, field descriptors, multipart bodies,
task cancellation, URL state, formatting, plugin capabilities, content labels
and search, navigation gating, icon uniqueness, validation patterns, query keys,
toast behavior, form dirty state, SSO redirects and config normalization,
package grouping, OSV parsing, and Helm Job ordering.

## Conventions

- Never depend on pre-seeded names or assume a new resource is on page one.
- Clean up through the API in a `finally` block.
- Intercept fake tasks instead of waiting for real long operations.
- Keep specs split by area.
- Use tighter per-expect timeouts for fast operations instead of raising global
  timeouts.
- Do not commit `test-results/` or `playwright-report/`.
