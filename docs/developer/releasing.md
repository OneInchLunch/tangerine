# Releasing

Tangerine's public history is curated. The public `main` branch contains release
snapshots; development happens in a private upstream. This keeps the public
history linear and free of internal staging data, credentials, and experiments.

## What gets published

The public tree includes the application, gateway, tests, documentation, and the
Helm charts. It excludes private infrastructure, local-only deployment files,
internal planning notes, and live signing material.

## Versioning

- Use semantic versions for the application and chart.
- Tag public releases as `vX.Y.Z`.
- Keep `package.json`, chart `version`/`appVersion`, the changelog, and image
  tags aligned within a release.
- Do not move a published tag.

## Sync policy

Maintainers run a one-way sync from the private upstream into this repository:

1. Start from a committed, CI-green upstream state.
2. Copy the allowlisted code and the curated public documentation.
3. Apply sanitization rules (public repository URLs, `example.com` test
   domains, placeholder-free public examples).
4. Run a leak scan for private hostnames, paths, credentials, and local
   deployment names.
5. Populate the public tree and review the diff.
6. Commit one curated snapshot, tag the release, and push.

The sync is manual. There is no scheduled automation, and the public repository
does not pull from the private upstream at runtime.

Recommended cadence:

- weekly or per release for routine changes;
- immediately for security fixes;
- monthly tagged releases, or more often for user-facing features.

## Release checklist

- [ ] Upstream checks pass: `lint`, `format:check`, `typecheck`, unit, gateway,
  build, bundle budget, Playwright.
- [ ] Helm charts lint and render.
- [ ] Documentation is current, with examples on `pulp.example.com`.
- [ ] No private hostnames, IP addresses, filesystem paths, or secrets.
- [ ] No internal planning notes or local deployment files.
- [ ] Image and chart references are consistent.
- [ ] Changelog updated.
- [ ] Public tree reviewed, committed as one snapshot, tagged, and pushed.

## Contributing to a release

External contributions are welcome as issues and pull requests. To keep the
public history curated, accepted changes are applied upstream first and appear
in a later release snapshot. A pull request may therefore be closed with a note
that it was incorporated upstream rather than merged directly.
