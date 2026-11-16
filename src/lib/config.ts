export type AuthMode = "session" | "external" | "gateway";

export interface AppConfig {
  apiBasePath: string;
  uiBasePath: string;
  authMode: AuthMode;
  externalLoginUri: string | null;
  /** Base path of the Tangerine SSO gateway, e.g. `/sso/`. */
  gatewayBasePath: string;
  /** Whether the username/password form is offered alongside SSO. */
  passwordLoginEnabled: boolean;
  /**
   * Pulp group whose members are provisioned by the identity provider. When
   * set, password management is hidden for those accounts.
   */
  ssoManagedGroup: string | null;
  pollIntervalMs: number;
  extraVersion: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  apiBasePath: "/pulp/api/v3/",
  uiBasePath: "/ui/",
  authMode: "session",
  externalLoginUri: null,
  gatewayBasePath: "/sso/",
  passwordLoginEnabled: true,
  ssoManagedGroup: null,
  pollIntervalMs: 3000,
  extraVersion: "",
};

function normalizeBasePath(value: string): string {
  if (!value.startsWith("/")) {
    value = `/${value}`;
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Apply defaults, clamping, and safe-value filtering to runtime config. */
export function normalizeConfig(input: Partial<AppConfig>): AppConfig {
  const authMode: AuthMode =
    input.authMode === "external"
      ? "external"
      : input.authMode === "gateway"
        ? "gateway"
        : "session";

  return {
    ...DEFAULT_CONFIG,
    ...input,
    apiBasePath: normalizeBasePath(input.apiBasePath ?? DEFAULT_CONFIG.apiBasePath),
    uiBasePath: normalizeBasePath(input.uiBasePath ?? DEFAULT_CONFIG.uiBasePath),
    authMode,
    externalLoginUri: optionalString(input.externalLoginUri),
    gatewayBasePath: normalizeBasePath(input.gatewayBasePath ?? DEFAULT_CONFIG.gatewayBasePath),
    passwordLoginEnabled: input.passwordLoginEnabled !== false,
    ssoManagedGroup: optionalString(input.ssoManagedGroup),
    pollIntervalMs:
      typeof input.pollIntervalMs === "number" && input.pollIntervalMs >= 500
        ? input.pollIntervalMs
        : DEFAULT_CONFIG.pollIntervalMs,
  };
}

let configPromise: Promise<AppConfig> | null = null;

export function loadConfig(): Promise<AppConfig> {
  configPromise ??= fetch(`${import.meta.env.BASE_URL}config.json`, {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) {
        return DEFAULT_CONFIG;
      }
      return normalizeConfig((await response.json()) as Partial<AppConfig>);
    })
    .catch(() => DEFAULT_CONFIG);

  return configPromise;
}

let resolvedConfig: AppConfig | null = null;

export function setConfig(config: AppConfig): void {
  resolvedConfig = config;
}

export function getConfig(): AppConfig {
  if (!resolvedConfig) {
    throw new Error("Application config has not been loaded yet.");
  }
  return resolvedConfig;
}

export function routerBasePath(config: AppConfig): string {
  return config.uiBasePath.replace(/\/$/, "") || "/";
}
