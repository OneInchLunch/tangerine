import { readStorage, removeStorage, writeStorage } from "./storage";

const STORAGE_KEY = "tangerine.session";
/** Match the gateway's default session TTL. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface SessionHint {
  expiresAt: number;
}

/**
 * Serialize a session hint. Kept pure so the expiry logic is testable without
 * a DOM.
 */
export function createSessionHint(now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  return JSON.stringify({ expiresAt: now + ttlMs } satisfies SessionHint);
}

/** Whether a stored hint exists and has not expired. */
export function isSessionHintValid(raw: string | null, now = Date.now()): boolean {
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { expiresAt?: unknown };
    return typeof parsed.expiresAt === "number" && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

/**
 * Whether the SPA should ask Pulp for the current user.
 *
 * A fresh browser has no hint, so the login page renders without sending an
 * unauthenticated request that would trigger Pulp's Basic auth challenge.
 */
export function hasSessionEvidence(): boolean {
  return isSessionHintValid(readStorage(STORAGE_KEY));
}

/**
 * Whether the SPA should ask the gateway for a session.
 *
 * A fresh browser has neither a local hint nor the gateway's readable CSRF
 * cookie, so the login page renders without a `/sso/session` 401 in the
 * console. The callback response sets the `tg_csrf` cookie, which covers the
 * first load after an SSO login; the hint is only written by password login.
 */
export function hasGatewayEvidence(): boolean {
  if (hasSessionEvidence()) {
    return true;
  }
  if (typeof document === "undefined") {
    return false;
  }
  return /(?:^|;\s*)(?:__Host-)?tg_csrf=/.test(document.cookie);
}

export function rememberSession(): void {
  writeStorage(STORAGE_KEY, createSessionHint());
}

export function forgetSession(): void {
  removeStorage(STORAGE_KEY);
}
