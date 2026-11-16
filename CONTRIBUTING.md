# Contributing

Thanks for helping improve Tangerine.

## Before you start

- Read [AGENTS.md](AGENTS.md) for the architecture, conventions, and Pulp API
  quirks.
- Read [Development](docs/developer/development.md) and
  [Testing](docs/developer/testing.md).
- For security issues, do not open a public issue; follow [SECURITY.md](SECURITY.md).

## Development workflow

```sh
docker compose up -d
docker compose exec pulp pulpcore-manager reset-admin-password --password admin
npm install
npm run dev
```

Then make a focused change and run the required checks:

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

Playwright needs Chromium:

```sh
npx playwright install chromium
```

## Code style

- TypeScript is strict; avoid `any` and unused locals/parameters.
- Use the existing API client, React Query hooks, mutation hooks, UI primitives,
  and registries. Do not add a second HTTP client or state library.
- Match the surrounding style: double quotes, semicolons, 2-space indentation,
  100-column width.
- Keep accessibility intact: visible labels, aria labels on icon buttons, focus
  handling, and keyboard behavior.
- Add tests with the change. Prefer the area spec over a new monolith.

## Pull requests

- Keep the change small and explain the user-visible behavior.
- Include screenshots for UI changes when practical.
- Update documentation when behavior, setup, or configuration changes.
- Do not include credentials, private endpoints, or personal infrastructure in
  code, tests, screenshots, or examples.

## Reporting bugs

Open an issue with:

- what you expected and what happened;
- the Pulp version and installed plugins;
- browser and Tangerine version;
- relevant API error text (redact hostnames and credentials);
- reproduction steps.

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0.
