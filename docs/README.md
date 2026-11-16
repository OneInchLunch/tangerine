# Tangerine documentation

Tangerine is the web console for a [Pulp](https://pulpproject.org/) installation.
It talks directly to the Pulp REST API from the browser, so what you see is the
state of your Pulp server; the UI has no database of its own. The optional SSO
gateway has its own PostgreSQL store.

This guide is task-oriented. Each page covers one area of the console and the
jobs you can complete there. Screenshots are real captures of a running
installation with a small demonstration dataset.

## Start here

| Page | What it covers |
| --- | --- |
| [Installation](installation.md) | Local stack, first admin, production image, Helm |
| [Configuration](configuration.md) | `config.json`, auth modes, base paths, polling |
| [Getting started](getting-started.md) | Signing in, navigation, the shell, themes |
| [Single sign-on](sso.md) | Full OIDC gateway runbook for every supported provider |
| [Signing](signing.md) | RPM metadata signing, keys, verification, rotation |
| [Troubleshooting](troubleshooting.md) | Startup, auth, content, and SSO problems |

## Screens

| Page | What it covers |
| --- | --- |
| [Dashboard](dashboard.md) | Health checks, storage, component versions, recent tasks |
| [Repositories](repositories.md) | Creating repositories, versions, syncing, publishing, deleting |
| [Remotes](remotes.md) | Upstream sources, plugin fields, write-only credentials |
| [Distributions](distributions.md) | Content endpoints, metadata edits, changing the content source |
| [Publications](publications.md) | Immutable snapshots, filtering, inspecting, deleting |
| [Content](content.md) | Browsing content types, grouping, uploads, vulnerability badges |
| [Tasks](tasks.md) | Task history, progress, results, cancellation, workers |
| [Operations](operations.md) | Orphan cleanup, artifact repair, space reclamation, schedules |
| [Users, groups, and roles](rbac.md) | Accounts, membership, role assignment, custom roles |
| [Import and export](import-export.md) | Pulp exports, filesystem exports, importers, runs |
| [Administration](administration.md) | Signing services, plugins, API admin, settings |

## Developer guide

| Page | What it covers |
| --- | --- |
| [Architecture](developer/architecture.md) | Components, data flow, and key files |
| [Development](developer/development.md) | Local setup, commands, schema, conventions |
| [Testing](developer/testing.md) | Unit, end-to-end, and gateway suites |
| [Data layer](developer/data-layer.md) | API client, resources, hooks, mutations, query keys |
| [Gateway](developer/gateway.md) | OIDC gateway architecture, endpoints, storage, security |
| [Helm](developer/helm.md) | Charts, values, ingress, SSO, signing, publishing |
| [Releasing](developer/releasing.md) | Versioning, release checklist, and public sync policy |

## How to read the screenshots

Screenshots were taken at 1600×1000 in light mode against Pulp 3.123.0 with
core, file, rpm, deb, python, container, ansible, maven, npm, hugging_face, and
certguard plugins. Counts, versions, and timestamps reflect that environment;
yours will differ.

The demonstration data is seeded only for the capture and removed afterwards.

## Regenerating the screenshots

From a checkout with the local stack running:

```sh
docker compose up -d
npm install
npm run dev            # in another terminal
npm run docs:screenshots
```

The script logs in, creates the demonstration dataset, visits each screen, and
writes WebP files to `docs/images/`. It removes the demonstration resources
again on exit, including after a failure.

```sh
npm run docs:screenshots -- --list
npm run docs:screenshots -- --only repository
npm run docs:screenshots -- --keep
```

`--api-url`, `--user`, and `--password` override the Pulp target, which defaults
to `http://localhost:8080` with `admin` / `admin`.
