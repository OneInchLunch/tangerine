import { getConfig } from "@/lib/config";
import { gatewayPath } from "@/lib/sso";

/** A provider as shown to an unauthenticated login screen. */
export interface SsoProviderSummary {
  id: string;
  label: string;
  kind: string;
}

/** A provider's full configuration. Never contains secret material. */
export interface AccessRule {
  claim: "groups" | "roles";
  match: string;
  group: string;
  roles: string[];
}

export interface SsoProviderConfig {
  id: string;
  label: string;
  kind: string;
  issuer: string;
  clientId: string;
  secretFile: string;
  scopes: string;
  groupClaim: string;
  roleClaim: string;
  usernameClaim: string;
  usernamePrefix: string;
  requireEmailVerified: boolean;
  allowedTenants: string[];
  fetchGraphGroups: boolean;
  fetchGoogleGroups: boolean;
  googleServiceAccountFile: string;
  googleAdminEmail: string;
  groupMap: Record<string, string>;
  roleMap: Record<string, string>;
  accessRules: AccessRule[];
  baselineGroup: string;
  baselineRoles: string[];
  strictGroups: boolean;
  allowedEmailDomains: string[];
  requireHostedDomain: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface ProviderPayload {
  id?: string;
  label: string;
  kind: string;
  issuer: string;
  clientId: string;
  secretFile: string;
  scopes?: string;
  groupClaim?: string;
  roleClaim?: string;
  usernameClaim?: string;
  usernamePrefix?: string;
  requireEmailVerified?: boolean;
  allowedTenants?: string[];
  fetchGraphGroups?: boolean;
  fetchGoogleGroups?: boolean;
  googleServiceAccountFile?: string;
  googleAdminEmail?: string;
  groupMap?: Record<string, string>;
  roleMap?: Record<string, string>;
  accessRules?: AccessRule[];
  baselineGroup?: string;
  baselineRoles?: string[];
  strictGroups?: boolean;
  allowedEmailDomains?: string[];
  requireHostedDomain?: boolean;
  enabled?: boolean;
  sortOrder?: number;
}

export interface GatewayCapabilities {
  isSuperuser: boolean;
  isStaff: boolean;
  manageSso: boolean;
  repositoryAdmin: boolean;
  repositoryWrite?: boolean;
  tasksRead?: boolean;
  operationsRead?: boolean;
  importExportRead?: boolean;
  signingRead?: boolean;
  contentRead?: boolean;
}

export interface GatewaySession {
  username: string;
  providerId: string | null;
  expiresAt: number;
  csrfToken: string;
  isStaff?: boolean;
  isSuperuser?: boolean;
  repositoryPrns?: string[];
  capabilities?: GatewayCapabilities;
}

export interface GatewayBootstrap {
  settingsBlock: string;
  applyCommand: string;
  callbackUrl: string;
  headerName: string;
}

export interface StripProbe {
  headerName: string;
  headerValue: string;
  username: string;
  endpoint: string;
}

export interface GatewayDiagnostics {
  pulpReachable: boolean;
  headerAuthActive: boolean;
  additiveMode: boolean;
  allowHttpIssuers: boolean;
  providerCount: number;
  sessionCount: number;
  callbackUrl: string;
  stripProbe: StripProbe;
}

export interface ProviderTestResult {
  ok: boolean;
  detail?: string;
  issuer?: string;
  issuerMatches?: boolean;
  issuerTemplate?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  endSessionEndpoint?: string | null;
  signingAlgorithms?: string[];
  tokenEndpointAuthMethods?: string[];
  secretReadable?: boolean;
}

export interface ProviderProbeResult {
  ok: boolean;
  detail?: string;
  configuredIssuer?: string;
  issuer?: string;
  issuerMatches?: boolean;
  issuerTemplate?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  endSessionEndpoint?: string | null;
  signingAlgorithms?: string[];
  tokenEndpointAuthMethods?: string[];
}

export interface SecretCheckResult {
  present: boolean;
  readable: boolean;
}

export interface SecretStatus {
  name: string;
  readable: boolean;
  modifiedAt: string | null;
}

export interface ProviderAuditEntry {
  id: number;
  actor: string;
  action: string;
  providerId: string;
  detail: string;
  createdAt: string;
}

export interface ProviderGroupOption {
  id: string;
  label: string;
}

export interface AccessPolicyStatus {
  name: string;
  present: boolean;
  customized: boolean;
  matchesExpected: boolean;
}

export class GatewayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

async function gatewayRequest<T>(
  endpoint: string,
  options: Omit<RequestInit, "body"> & { csrfToken?: string; body?: unknown } = {},
): Promise<T> {
  const config = getConfig();
  const { csrfToken, body, ...rest } = options;
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  if (csrfToken) {
    headers.set("X-Tangerine-CSRF", csrfToken);
  }

  const response = await fetch(gatewayPath(config, endpoint), {
    ...rest,
    headers,
    body: payload,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (parsed.detail) {
        message = parsed.detail;
      }
    } catch {
      // Non-JSON error body.
    }
    throw new GatewayError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = (await response.text()) as T;
    return text;
  }
  const parsed = (await response.json()) as T;
  return parsed;
}

export function fetchSsoProviders(): Promise<SsoProviderSummary[]> {
  return gatewayRequest<SsoProviderSummary[]>("providers");
}

/** Current gateway identity, or null when there is no gateway session. */
export async function fetchGatewaySession(): Promise<GatewaySession | null> {
  try {
    return await gatewayRequest<GatewaySession>("session");
  } catch (error) {
    if (error instanceof GatewayError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function fetchAdminCsrf(): Promise<{ csrfToken: string }> {
  return gatewayRequest<{ csrfToken: string }>("admin/csrf");
}

export function fetchBootstrap(): Promise<GatewayBootstrap> {
  return gatewayRequest<GatewayBootstrap>("admin/bootstrap");
}

export function fetchDiagnostics(): Promise<GatewayDiagnostics> {
  return gatewayRequest<GatewayDiagnostics>("admin/diagnostics");
}

export function fetchSecretFiles(): Promise<string[]> {
  return gatewayRequest<string[]>("admin/secrets");
}

export function fetchProviderConfigs(): Promise<SsoProviderConfig[]> {
  return gatewayRequest<SsoProviderConfig[]>("admin/providers");
}

export function fetchProviderGroups(
  providerId: string,
  query = "",
): Promise<{ groups: ProviderGroupOption[] }> {
  const params = new URLSearchParams({ provider: providerId, q: query });
  return gatewayRequest<{ groups: ProviderGroupOption[] }>(`admin/groups?${params.toString()}`);
}

/** Normalize a Pulp resource path for the scope write API. */
function scopeApiPath(path: string): string {
  if (path.startsWith("/pulp/api/v3/")) {
    return path;
  }
  return `/pulp/api/v3/${path.replace(/^\/+/, "")}`;
}

export function scopeCreateRepository(
  path: string,
  body: Record<string, unknown>,
  csrfToken: string,
): Promise<{ repository: { pulp_href?: string; prn?: string }; repositoryPrn: string }> {
  return gatewayRequest("scope/repositories", {
    method: "POST",
    csrfToken,
    body: { path: scopeApiPath(path), body },
  });
}

export function scopeRepositoryAction(
  method: "PATCH" | "DELETE",
  href: string,
  body: Record<string, unknown> | null,
  csrfToken: string,
): Promise<{ result: unknown }> {
  return gatewayRequest("scope/repository", {
    method: "POST",
    csrfToken,
    body: { method, href, body },
  });
}

export function scopeCreateObject(
  path: string,
  body: Record<string, unknown>,
  csrfToken: string,
): Promise<{ result: unknown }> {
  return gatewayRequest("scope/scoped-objects", {
    method: "POST",
    csrfToken,
    body: { path: scopeApiPath(path), body },
  });
}

export function scopeCreateRemote(
  path: string,
  repositoryHref: string,
  body: Record<string, unknown>,
  csrfToken: string,
): Promise<{ remote: unknown }> {
  return gatewayRequest("scope/remotes", {
    method: "POST",
    csrfToken,
    body: { path: scopeApiPath(path), repositoryHref, body },
  });
}

export function scopeMutateObject(
  method: "PATCH" | "DELETE",
  href: string,
  body: Record<string, unknown> | null,
  csrfToken: string,
): Promise<{ result: unknown }> {
  return gatewayRequest("scope/object", {
    method: "POST",
    csrfToken,
    body: { method, href, body },
  });
}

export function scopeImportExport(
  path: string,
  body: Record<string, unknown>,
  csrfToken: string,
): Promise<{ result: unknown }> {
  return gatewayRequest("scope/import-export", {
    method: "POST",
    csrfToken,
    body: { path, body },
  });
}

export async function scopeUploadContent(
  path: string,
  repositoryHref: string,
  form: FormData,
  csrfToken: string,
): Promise<unknown> {
  const config = getConfig();
  const params = new URLSearchParams({
    path: scopeApiPath(path),
    repository: repositoryHref,
  });
  const response = await fetch(
    `${gatewayPath(config, "scope/content-upload")}?${params.toString()}`,
    {
      method: "POST",
      headers: { "X-Tangerine-CSRF": csrfToken },
      body: form,
      credentials: "same-origin",
    },
  );
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (parsed.detail) {
        message = parsed.detail;
      }
    } catch {
      // Non-JSON error body.
    }
    throw new GatewayError(message, response.status);
  }
  const payload = (await response.json()) as { result?: unknown };
  return payload.result;
}

export function fetchAccessPolicyStatus(): Promise<AccessPolicyStatus[]> {
  return gatewayRequest<AccessPolicyStatus[]>("admin/access-policies");
}

export function createProvider(
  payload: ProviderPayload,
  csrfToken: string,
): Promise<SsoProviderConfig> {
  return gatewayRequest<SsoProviderConfig>("admin/providers", {
    method: "POST",
    body: payload,
    csrfToken,
  });
}

export function updateProvider(
  providerId: string,
  payload: Partial<ProviderPayload>,
  csrfToken: string,
): Promise<SsoProviderConfig> {
  return gatewayRequest<SsoProviderConfig>(`admin/providers/${providerId}`, {
    method: "PATCH",
    body: payload,
    csrfToken,
  });
}

export function deleteProvider(
  providerId: string,
  csrfToken: string,
): Promise<{ deleted: boolean }> {
  return gatewayRequest<{ deleted: boolean }>(`admin/providers/${providerId}`, {
    method: "DELETE",
    csrfToken,
  });
}

export function testProvider(providerId: string, csrfToken: string): Promise<ProviderTestResult> {
  return gatewayRequest<ProviderTestResult>(`admin/providers/${providerId}/test`, {
    method: "POST",
    csrfToken,
  });
}

export function probeIssuer(issuer: string): Promise<ProviderProbeResult> {
  const params = new URLSearchParams({ issuer });
  return gatewayRequest<ProviderProbeResult>(`admin/discover?${params.toString()}`);
}

export function checkSecretFile(file: string): Promise<SecretCheckResult> {
  const params = new URLSearchParams({ file });
  return gatewayRequest<SecretCheckResult>(`admin/secrets/check?${params.toString()}`);
}

export function fetchSecretStatus(): Promise<SecretStatus[]> {
  return gatewayRequest<SecretStatus[]>("admin/secrets/status");
}

export function fetchProviderAudit(): Promise<ProviderAuditEntry[]> {
  return gatewayRequest<ProviderAuditEntry[]>("admin/audit");
}

/** End the gateway session and return where the browser should go next. */
export function logoutGateway(csrfToken: string): Promise<{ redirectUrl: string }> {
  return gatewayRequest<{ redirectUrl: string }>("logout", {
    method: "POST",
    csrfToken,
  });
}

/**
 * Ask Pulp to authenticate a request carrying the identity header. If this
 * succeeds, the edge is not stripping client-supplied headers and the
 * deployment is unsafe.
 */
export async function probeHeaderStripping(probe: StripProbe): Promise<boolean> {
  const config = getConfig();
  const response = await fetch(`${config.apiBasePath}login/`, {
    headers: { Accept: "application/json", [probe.headerName]: probe.headerValue },
    credentials: "same-origin",
  });
  if (!response.ok) {
    return false;
  }
  try {
    const body = (await response.json()) as { username?: string };
    return body.username === probe.username;
  } catch {
    return false;
  }
}
