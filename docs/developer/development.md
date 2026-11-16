# Development

## Prerequisites

- Node.js `>= 22.12`
- Docker with Compose
- Chromium for Playwright

```sh
npx playwright install chromium
```

## Local stack

```sh
docker compose up -d
docker compose exec pulp pulpcore-manager reset-admin-password --password admin
npm install
npm run dev
```

Open <http://127.0.0.1:5173/ui/>. Vite proxies `/pulp` to
`http://localhost:8080` with `changeOrigin: false`, preserving the same-origin
cookie model. Override the target with `PULP_PROXY`:

```sh
PULP_PROXY=http://pulp.example.com:8080 npm run dev
```

`compose.yaml` mounts `deploy/example/settings/settings.py`, a disposable
development settings file. It enables the bundled Redis cache and disables token
auth. Do not reuse it in production.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run typecheck` | Strict TypeScript |
| `npm run lint` | Biome lint |
| `npm run format` / `format:check` | Format or verify |
| `npm run test:unit` | Node unit tests |
| `npm run test:e2e` | Playwright |
| `npm run test:gateway` | Python gateway suite |
| `npm run build` | Typecheck + production build |
| `npm run check:bundle` | Bundle budget |
| `npm run preview` | Preview the build |
| `npm run api:sync` | Fetch live OpenAPI and regenerate types |
| `npm run api:types` | Regenerate from `schema/pulp.json` |
| `npm run docs:screenshots` | Capture guide screenshots |

## Schema

`schema/pulp.json` and `src/api/schema.d.ts` are generated. Do not hand-edit
them.

```sh
npm run api:sync
```

Regenerate only from the checked-in snapshot:

```sh
npm run api:types
```

The local stack pins a Pulp version with a plugin set; regenerate when your
deployed plugin set differs.

## Code style

- TypeScript is strict, with `noUnusedLocals` and `noUnusedParameters`.
- Use double quotes, semicolons, 2-space indentation, and 100 columns.
- Prefer existing primitives and registries over new abstractions.
- Use `cn()` for conditional classes and semantic text sizes.
- Keep accessibility: labels, aria names, focus, keyboard behavior.
- Prefer generated API types; avoid `any`. Use a narrow cast through `unknown`
  with a comment when the generated shape is wrong.

## Data and state

- Extend `src/api/client.ts`, `src/api/resources.ts`, and
  `src/hooks/queries.ts`; do not add another client or state library.
- Add query keys to `query-keys.ts` and invalidation prefixes to
  `invalidations.ts`.
- Use mutation hooks so dialogs close only after lists refresh.
- Render failures with `formatApiError` / `errorMessage`.

## Plugins and content

- Add plugin capabilities to `src/lib/plugins.ts`.
- Add distribution endpoint mappings to `src/lib/distributions.ts`.
- Add package grouping to `src/lib/content-packages.ts`.
- Keep per-page maps out of feature folders.

## Documentation

- Update the public docs when behavior, configuration, or setup changes.
- Screenshots are generated with `npm run docs:screenshots`; the script seeds and
  removes its own demo data.
- Keep examples on `pulp.example.com` and `example.com`.

## Release check

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
