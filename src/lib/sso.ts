import type { AppConfig } from "@/lib/config";

/**
 * Validate a post-login destination. Only paths inside the UI base path are
 * accepted so a crafted `next` value cannot bounce the browser to another
 * origin after authentication.
 *
 * The value is parsed with the URL constructor first: that resolves encoded dot
 * segments (`%2e%2e`) and treats a backslash as a slash, which are exactly the
 * tricks a hand-written prefix check would miss.
 */
export function safeRedirectPath(value: unknown, uiBasePath: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }
  // `//evil.example` and `/\evil.example` are treated as protocol-relative
  // URLs by browsers even though they start with a slash.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }

  const base = uiBasePath.endsWith("/") ? uiBasePath : `${uiBasePath}/`;
  const sentinel = "https://tangerine.invalid";

  let url: URL;
  try {
    url = new URL(value, sentinel);
  } catch {
    return null;
  }
  if (url.origin !== sentinel) {
    return null;
  }

  const suffix = `${url.search}${url.hash}`;
  if (url.pathname === base.replace(/\/$/, "")) {
    return `${base}${suffix}`;
  }
  if (!url.pathname.startsWith(base)) {
    return null;
  }
  return `${url.pathname}${suffix}`;
}

/** Join the gateway base path with an endpoint name. */
export function gatewayPath(config: AppConfig, endpoint: string): string {
  return `${config.gatewayBasePath}${endpoint.replace(/^\/+/, "")}`;
}

/**
 * Build the gateway login URL. The gateway validates `next` again server-side
 * and stores it with the pending login state, so a provider that drops query
 * parameters cannot strand the user.
 */
export function ssoStartUrl(config: AppConfig, providerId: string, currentPath: string): string {
  const validated = safeRedirectPath(currentPath, config.uiBasePath);
  const pathname = (validated ?? config.uiBasePath).split(/[?#]/, 1)[0] ?? "";
  // Starting from the login screen must not send the user back to it.
  const target =
    pathname.replace(/\/$/, "").endsWith("/login") || !validated ? config.uiBasePath : validated;
  const params = new URLSearchParams({ provider: providerId, next: target });
  return `${gatewayPath(config, "start")}?${params.toString()}`;
}

const SSO_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Sign-in was cancelled at your identity provider.",
  login_required: "Your identity provider requires you to sign in again.",
  consent_required: "Your identity provider needs consent before continuing.",
  interaction_required: "Your identity provider needs more information to continue.",
  invalid_request: "The identity provider rejected the sign-in request.",
  invalid_scope: "The identity provider did not grant the requested scopes.",
  temporarily_unavailable: "Your identity provider is temporarily unavailable. Try again.",
  server_error: "Your identity provider reported an error. Try again.",
  unknown_provider: "That sign-in provider is not configured.",
  discovery_failed: "The identity provider could not be reached. Check the issuer URL.",
  invalid_callback: "The sign-in response was incomplete. Try again.",
  state_mismatch: "The sign-in request did not match this browser. Try again.",
  state_expired: "The sign-in request expired. Try again.",
  provider_error: "The identity provider rejected the sign-in.",
  provisioning_failed: "Signed in, but your Pulp account could not be prepared.",
  username_collision:
    "This identity conflicts with an existing local Pulp account. Ask an administrator to resolve it.",
  email_unverified: "The identity provider did not verify your email address.",
  domain_not_allowed:
    "This account's domain is not allowed for this deployment. Ask an administrator to review the SSO domain policy.",
  sso_not_configured: "Single sign-on is enabled but no provider is configured yet.",
};

/**
 * Turn the query string produced by a failed identity-provider round trip into
 * a message the login screen can show. Returns null when there is no error.
 */
export function ssoErrorMessage(search: string): string | null {
  const params = new URLSearchParams(search);
  const code = params.get("sso_error") ?? params.get("error");
  const message = params.get("message");

  if (code) {
    return (
      SSO_ERROR_MESSAGES[code] ??
      (message ? `Single sign-on failed: ${message}` : `Single sign-on failed (${code}).`)
    );
  }
  if (message) {
    return `Single sign-on failed: ${message.slice(0, 300)}`;
  }
  return null;
}

/**
 * True when the account is provisioned by the identity provider. Pulp exposes
 * no `has_usable_password` field, so membership in the configured marker group
 * is the signal used to hide local password management.
 */
export function isSsoManagedUser(
  user: { groups?: Array<{ name: string }> } | null,
  managedGroup: string | null,
): boolean {
  if (!user || !managedGroup) {
    return false;
  }
  return user.groups?.some((group) => group.name === managedGroup) ?? false;
}
