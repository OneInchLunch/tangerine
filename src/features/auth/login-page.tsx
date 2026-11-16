import { useAuth } from "@/auth/auth-context";
import { BrandMark } from "@/components/brand-mark";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useSsoProviders } from "@/hooks/queries";
import type { SsoProviderSummary } from "@/api/gateway";
import { getConfig } from "@/lib/config";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Fingerprint,
  Github,
  Globe,
  KeyRound,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

/** Best-effort glyph for a provider kind; unknown kinds get a generic mark. */
function providerIcon(kind: string): LucideIcon {
  switch (kind.toLowerCase()) {
    case "microsoft":
    case "azure":
    case "azuread":
    case "entra":
      return Building2;
    case "google":
      return Globe;
    case "keycloak":
      return KeyRound;
    case "github":
      return Github;
    default:
      return Fingerprint;
  }
}

function ProviderButton({ provider }: { provider: SsoProviderSummary }) {
  const { startSso } = useAuth();
  const Icon = providerIcon(provider.kind);

  return (
    <Button
      size="lg"
      variant="outline"
      className="w-full justify-start"
      onClick={() => startSso(provider.id)}
      data-testid={`sso-${provider.id}`}
    >
      <Icon className="size-4" />
      Continue with {provider.label}
      <ArrowRight className="ml-auto size-4 text-zinc-400" />
    </Button>
  );
}

export function LoginPage() {
  const { login, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const config = getConfig();
  const providers = useSsoProviders();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const external = config.authMode === "external";
  const providerList = external ? [] : (providers.data ?? []);
  const showProviders = providerList.length > 0;
  const showPasswordForm = !external && config.passwordLoginEnabled;
  const showDivider = showProviders && showPasswordForm;
  const providersUnavailable =
    !external && config.authMode === "gateway" && providers.isError && !providers.isLoading;
  const hasMethod = external || showProviders || showPasswordForm;

  const shownError = error ?? authError;

  const showAuthBadge = external || config.authMode !== "gateway" || showProviders;
  const authModeLabel = external
    ? "External authentication"
    : config.authMode === "gateway"
      ? "Single sign-on"
      : "Session authentication";

  const heading = external
    ? "Continue to your identity provider"
    : showProviders && !showPasswordForm
      ? "Continue with your identity provider"
      : "Sign in";

  const description = external
    ? "Your cluster handles authentication. Continue to the configured login page."
    : showProviders
      ? showPasswordForm
        ? "Use your organization account, or sign in with a Pulp username and password."
        : "Your organization manages authentication. Continue with the account you already use."
      : "Use your Pulp account to access the administration console.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    clearAuthError();
    setIsSubmitting(true);
    try {
      await login(username, password);
      await navigate({ to: "/", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col bg-zinc-100 dark:bg-zinc-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.05)_1px,transparent_1px)] bg-[size:48px_48px] opacity-70 dark:bg-[linear-gradient(to_right,rgba(250,250,250,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(250,250,250,0.045)_1px,transparent_1px)] dark:opacity-100"
      />

      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/80 px-5 backdrop-blur sm:px-8 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-6" />
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Tangerine
          </span>
          <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
            Pulp administration console
          </span>
        </div>
        {showAuthBadge ? (
          <div className="flex items-center gap-1.5 text-meta font-medium text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="size-3.5" />
            {authModeLabel}
          </div>
        ) : null}
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="p-6 sm:p-8">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {heading}
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                {description}
              </p>

              {shownError ? (
                <div className="mt-5">
                  <FormError>{shownError}</FormError>
                </div>
              ) : null}

              {external ? (
                <div className="mt-6">
                  {config.externalLoginUri ? (
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => window.location.assign(config.externalLoginUri!)}
                    >
                      Continue to sign in
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                      External authentication is enabled, but no login URI is configured.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {showProviders ? (
                    <div className="mt-6 space-y-2" data-testid="sso-providers">
                      <p className="text-meta font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Single sign-on
                      </p>
                      {providerList.map((provider) => (
                        <ProviderButton key={provider.id} provider={provider} />
                      ))}
                    </div>
                  ) : null}

                  {providersUnavailable && showPasswordForm ? (
                    <div className="mt-5">
                      <InlineAlert tone="warning" compact title="Single sign-on unavailable">
                        The SSO gateway could not be reached. Password sign-in still works.
                      </InlineAlert>
                    </div>
                  ) : null}

                  {showDivider ? (
                    <div className="my-5 flex items-center gap-3">
                      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                      <span className="text-meta font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        or
                      </span>
                      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ) : null}

                  {showPasswordForm ? (
                    <form
                      className={showProviders ? "space-y-4" : "mt-6 space-y-4"}
                      onSubmit={handleSubmit}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="username">Username</Label>
                        <div className="relative">
                          <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                          <Input
                            id="username"
                            name="username"
                            autoComplete="username"
                            autoFocus={!showProviders}
                            required
                            value={username}
                            onChange={(event) => {
                              setUsername(event.target.value);
                              clearAuthError();
                            }}
                            className="h-10 pl-9"
                            placeholder="admin"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(event) => {
                              setPassword(event.target.value);
                              clearAuthError();
                            }}
                            className="h-10 px-9"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={isSubmitting || !username || !password}
                      >
                        {isSubmitting ? <Spinner /> : <LogIn className="size-4" />}
                        {isSubmitting ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                  ) : null}

                  {!hasMethod && !providers.isLoading ? (
                    <div className="mt-6">
                      <InlineAlert tone="warning" title="No sign-in method configured">
                        {config.authMode === "gateway"
                          ? "Add a provider in Settings → SSO, or enable password sign-in."
                          : "Enable password sign-in in config.json."}
                      </InlineAlert>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="flex items-start gap-2 border-t border-zinc-200 px-6 py-3.5 text-meta leading-5 text-zinc-500 sm:px-8 dark:border-zinc-800 dark:text-zinc-400">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {external
                ? "Authentication is handled by your cluster's identity provider."
                : showProviders
                  ? showPasswordForm
                    ? "Sign in with your identity provider, or with a Pulp username and password. Credentials are never stored in the browser."
                    : "Authentication completes with your identity provider. Your password is never shared with Tangerine."
                  : "Your session is established directly with the Pulp API. Passwords are never stored in the browser."}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex shrink-0 flex-col gap-1 border-t border-zinc-200 bg-white/60 px-5 py-3 text-meta text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-500">
        <span>
          Tangerine
          {config.extraVersion ? ` ${config.extraVersion}` : ""} · Pulp administration console
        </span>
        <span className="font-mono">API {config.apiBasePath}</span>
      </footer>
    </div>
  );
}
