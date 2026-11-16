import { fetchGatewaySession, logoutGateway, type GatewaySession } from "@/api/gateway";
import { pulpApi } from "@/api/resources";
import type { User } from "@/api/types";
import { getConfig } from "@/lib/config";
import { setUnauthorizedHandler } from "@/lib/query-client";
import { ssoErrorMessage, ssoStartUrl } from "@/lib/sso";
import {
  forgetSession,
  hasGatewayEvidence,
  hasSessionEvidence,
  rememberSession,
} from "@/lib/session-hint";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  user: User | null;
  session: GatewaySession | null;
  isLoading: boolean;
  /** Message from a failed single-sign-on round trip, if any. */
  authError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
  startSso: (providerId: string) => void;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  // Read by the unauthorized handler, which is registered once per client.
  const userRef = useRef<User | null>(null);

  const refresh = useCallback(async () => {
    try {
      const config = getConfig();

      // The gateway session check is safe: a missing session is a 401 without a
      // WWW-Authenticate header, so the browser cannot show a Basic auth prompt.
      let gatewaySession = null;
      if (config.authMode === "gateway" && hasGatewayEvidence()) {
        try {
          gatewaySession = await fetchGatewaySession();
        } catch {
          gatewaySession = null;
        }
      }

      // A fresh browser has no session hint. Skip the Pulp probe entirely:
      // GET /login/ returns 401 with `WWW-Authenticate: Basic`, which makes the
      // browser open its native sign-in dialog on the login page.
      if (!gatewaySession && !hasSessionEvidence()) {
        setSession(null);
        setUser(null);
        return null;
      }

      const current = await pulpApi.currentUser();
      if (current) {
        rememberSession();
        // Pulp refuses the full self-record for non-staff accounts, so the
        // partial login record carries no is_staff. The gateway session knows
        // the flag from the service-account lookup.
        const merged =
          gatewaySession?.isStaff !== undefined
            ? {
                ...current,
                is_staff: Boolean(current.is_staff || gatewaySession.isStaff),
                is_superuser: Boolean(current.is_superuser || gatewaySession.isSuperuser),
              }
            : current;
        setSession(gatewaySession);
        setUser(merged);
        return merged;
      }

      forgetSession();
      setSession(null);
      setUser(null);
      return null;
    } catch {
      setSession(null);
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setAuthError(ssoErrorMessage(window.location.search));
    void refresh();
  }, [refresh]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    // A 401 from any query or mutation means the session expired. Drop the
    // cached Pulp data and let the router redirect to the login screen.
    //
    // Two guards matter here:
    //  * While already signed out, 401s are expected (the router briefly probes
    //    Pulp before redirecting to the login screen). Acting on them would wipe
    //    unrelated queries such as the SSO provider list.
    //  * Gateway queries must survive, because the login screen depends on them.
    setUnauthorizedHandler(() => {
      if (userRef.current === null) {
        return;
      }
      forgetSession();
      setUser(null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "gateway",
      });
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  useEffect(() => {
    const config = getConfig();
    // Only ingress-level SSO bounces automatically. Gateway mode shows the login
    // screen so a provider outage cannot trap the browser in a redirect loop.
    if (!isLoading && !user && config.authMode === "external" && config.externalLoginUri) {
      window.location.assign(config.externalLoginUri);
    }
  }, [isLoading, user]);

  const login = useCallback(async (username: string, password: string) => {
    const authenticated = await pulpApi.login(username, password);
    rememberSession();
    setAuthError(null);
    setUser(authenticated);
  }, []);

  const startSso = useCallback((providerId: string) => {
    const config = getConfig();
    const target = `${window.location.pathname}${window.location.search}`;
    // Do not write a session hint before the redirect: a cancelled login would
    // leave it behind and make the next load probe Pulp, which answers with a
    // Basic-auth challenge. The callback sets the readable `tg_csrf` cookie, so
    // the first load after a real login still has gateway evidence.
    window.location.assign(ssoStartUrl(config, providerId, target));
  }, []);

  const logout = useCallback(async () => {
    const config = getConfig();

    // The gateway owns the SSO session, so sign out there first. That also lets
    // the identity provider end its own session when it supports it.
    if (config.authMode === "gateway") {
      try {
        const session = await fetchGatewaySession();
        if (session) {
          const { redirectUrl } = await logoutGateway(session.csrfToken);
          forgetSession();
          setSession(null);
          setUser(null);
          setAuthError(null);
          queryClient.clear();
          window.location.assign(redirectUrl);
          return;
        }
      } catch {
        // Fall through to the local session flow.
      }
    }

    try {
      await pulpApi.logout();

      // Browsers can accumulate multiple sessionid cookies when an older
      // deployment used a different SESSION_COOKIE_PATH. The first DELETE only
      // expires the cookie for the current path, so a stale session cookie can
      // silently sign the user back in on refresh. Invalidate any remaining
      // server-side sessions before clearing local auth state.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await pulpApi.currentUser();
        if (!current) {
          break;
        }
        await pulpApi.logout();
      }
    } finally {
      forgetSession();
      setSession(null);
      setUser(null);
      setAuthError(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      authError,
      login,
      logout,
      refresh,
      startSso,
      clearAuthError,
    }),
    [user, session, isLoading, authError, login, logout, refresh, startSso, clearAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
