# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Report it privately to
the maintainers through GitHub's private vulnerability reporting for this
repository, or by the contact listed on the repository profile.

Include:

- affected version or commit;
- deployment mode (session, gateway, or external ingress);
- reproduction steps or a proof of concept;
- impact and any known mitigation.

## Supported versions

Security fixes are made on the current release line. Older releases may not
receive patches.

## Security model

- Tangerine is a static SPA. It has no server-side session store; Pulp enforces
  authorization for every API call.
- The UI and Pulp API are expected to share an origin. Cookies must use path `/`.
- The optional SSO gateway injects an unsigned identity header that Pulp trusts.
  It is safe only when:
  - the ingress strips inbound identity headers before forwardAuth;
  - the CNI enforces a NetworkPolicy that allows only the ingress and gateway to
    reach Pulp;
  - provider administration is restricted to trusted administrators.
- Never commit credentials, private keys, or personal infrastructure details.
  Use placeholders such as `pulp.example.com` in examples.
- Signing keys are high-impact. Keep the private key out of the repository and
  restrict who can change signing configuration.

## Dependency and secret handling

- Do not put passwords, tokens, or private keys in config files, chart values, or
  screenshots.
- Use Kubernetes Secrets or an external secret manager for deployment secrets.
- Report exposed credentials immediately so they can be rotated.
