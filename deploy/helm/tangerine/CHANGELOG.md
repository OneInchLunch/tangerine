# Changelog

## 0.2.4

- Add maintainer-only RPM repository metadata signing (`metadata_signing_service`).
- Repository-scoped admins lose direct repository write permissions; repository
  writes and auto-publish go through the gateway scope endpoints.
- Fix signing visibility for local Pulp staff sessions; repository-scoped gateway
  admins stay excluded.
- Publish the UI image as `oneinchlunch/tangerine-ui:0.1.4`.

## 0.2.1

- Default UI `replicaCount` is now 1.
- Stop the top bar moving when the browser overscrolls past the page top.
- Publish the UI image as `oneinchlunch/tangerine-ui:0.1.1`.

## 0.2.0

- Add image defaults for the Docker Hub repositories `oneinchlunch/tangerine-ui`
  and `oneinchlunch/tangerine-gateway`.
- Document the companion `pulp` chart and the cert-manager certificate split for
  hosts shared with Pulp.
- Fix the SSO notes: Pulp Operator takes `spec.custom_pulp_settings`, and the
  registry paths need their own Ingress before the forwardAuth middlewares are
  attached.
- Add Artifact Hub metadata.

## 0.1.1

- Initial published chart: static UI, optional SSO gateway, internal or external
  PostgreSQL, install/update Jobs, and Traefik middlewares.
