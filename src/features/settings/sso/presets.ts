import type { AccessRule, ProviderPayload, SsoProviderConfig } from "@/api/gateway";

export const PROVIDER_KINDS = [
  { value: "oidc", label: "Generic OpenID Connect" },
  { value: "azuread", label: "Microsoft Entra ID" },
  { value: "google", label: "Google" },
  { value: "keycloak", label: "Keycloak" },
];

export type ProviderPreset = "generic" | "google" | "azuread" | "keycloak";

export const PROVIDER_PRESETS: Array<{
  value: ProviderPreset;
  label: string;
  description: string;
}> = [
  { value: "generic", label: "Generic OIDC", description: "Enter the issuer and claims manually." },
  {
    value: "google",
    label: "Google",
    description: "Google Workspace or consumer Google accounts; authentication-only.",
  },
  {
    value: "azuread",
    label: "Microsoft Entra ID",
    description: "Single- or multi-tenant app registration with a tenant GUID issuer.",
  },
  {
    value: "keycloak",
    label: "Keycloak",
    description: "Standard Keycloak groups and roles claims.",
  },
];

export const USERNAME_CLAIMS = [
  { value: "", label: "Auto (preferred_username, upn, email, sub)" },
  { value: "preferred_username", label: "preferred_username" },
  { value: "upn", label: "upn" },
  { value: "email", label: "email" },
  { value: "sub", label: "sub" },
];

export interface MappingRow {
  source: string;
  target: string;
}

export interface RuleRow {
  claim: "groups" | "roles";
  match: string;
  group: string;
  roles: string[];
}

export interface ProviderFormState {
  id: string;
  label: string;
  kind: string;
  preset: ProviderPreset;
  tenantId: string;
  multiTenant: boolean;
  allowedTenants: string;
  issuer: string;
  clientId: string;
  secretFile: string;
  scopes: string;
  groupClaim: string;
  roleClaim: string;
  usernameClaim: string;
  usernamePrefix: string;
  requireEmailVerified: boolean;
  fetchGraphGroups: boolean;
  fetchGoogleGroups: boolean;
  googleServiceAccountFile: string;
  googleAdminEmail: string;
  groupMappings: MappingRow[];
  roleMappings: MappingRow[];
  accessRules: RuleRow[];
  baselineGroup: string;
  baselineRoles: string[];
  strictGroups: boolean;
  allowedEmailDomains: string;
  requireHostedDomain: boolean;
  enabled: boolean;
  sortOrder: string;
}

export function emptyForm(): ProviderFormState {
  return {
    id: "",
    label: "",
    kind: "oidc",
    preset: "generic",
    tenantId: "",
    multiTenant: false,
    allowedTenants: "",
    issuer: "",
    clientId: "",
    secretFile: "",
    scopes: "openid profile email",
    groupClaim: "groups",
    roleClaim: "roles",
    usernameClaim: "",
    usernamePrefix: "",
    requireEmailVerified: false,
    fetchGraphGroups: false,
    fetchGoogleGroups: false,
    googleServiceAccountFile: "",
    googleAdminEmail: "",
    groupMappings: [],
    roleMappings: [],
    accessRules: [],
    baselineGroup: "",
    baselineRoles: [],
    strictGroups: false,
    allowedEmailDomains: "",
    requireHostedDomain: false,
    enabled: true,
    sortOrder: "0",
  };
}

function mappingsFromRecord(record: Record<string, string> | undefined): MappingRow[] {
  return Object.entries(record ?? {}).map(([source, target]) => ({ source, target }));
}

export function microsoftIssuer(tenantId: string): string {
  const tenant = tenantId.trim();
  return tenant ? `https://login.microsoftonline.com/${tenant}/v2.0` : "";
}

export function tenantIdFromIssuer(issuer: string): string {
  const match = issuer.match(/^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0$/i);
  return match?.[1] ?? "";
}

export function presetForProvider(provider: SsoProviderConfig): ProviderPreset {
  if (provider.kind === "google" || provider.kind === "azuread" || provider.kind === "keycloak") {
    return provider.kind;
  }
  return "generic";
}

export function formFromProvider(provider: SsoProviderConfig): ProviderFormState {
  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    preset: presetForProvider(provider),
    tenantId: tenantIdFromIssuer(provider.issuer),
    multiTenant: /\/common\/|\/organizations\/|\/consumers\//i.test(provider.issuer),
    allowedTenants: (provider.allowedTenants ?? []).join(", "),
    issuer: provider.issuer,
    clientId: provider.clientId,
    secretFile: provider.secretFile,
    scopes: provider.scopes,
    groupClaim: provider.groupClaim,
    roleClaim: provider.roleClaim,
    usernameClaim: provider.usernameClaim ?? "",
    usernamePrefix: provider.usernamePrefix ?? "",
    requireEmailVerified: Boolean(provider.requireEmailVerified),
    fetchGraphGroups: Boolean(provider.fetchGraphGroups),
    fetchGoogleGroups: Boolean(provider.fetchGoogleGroups),
    googleServiceAccountFile: provider.googleServiceAccountFile ?? "",
    googleAdminEmail: provider.googleAdminEmail ?? "",
    groupMappings: mappingsFromRecord(provider.groupMap),
    roleMappings: mappingsFromRecord(provider.roleMap),
    accessRules: (provider.accessRules ?? []).map((rule) => ({
      claim: rule.claim,
      match: rule.match,
      group: rule.group,
      roles: [...(rule.roles ?? [])],
    })),
    baselineGroup: provider.baselineGroup ?? "",
    baselineRoles: [...(provider.baselineRoles ?? [])],
    strictGroups: Boolean(provider.strictGroups),
    allowedEmailDomains: (provider.allowedEmailDomains ?? []).join(", "),
    requireHostedDomain: Boolean(provider.requireHostedDomain),
    enabled: provider.enabled,
    sortOrder: String(provider.sortOrder ?? 0),
  };
}

export function applyPreset(preset: ProviderPreset, current: ProviderFormState): ProviderFormState {
  const reset = (kind: string): ProviderFormState => {
    const next = { ...current, kind };
    if (kind !== "google") {
      next.fetchGoogleGroups = false;
      next.googleServiceAccountFile = "";
      next.googleAdminEmail = "";
      next.requireHostedDomain = false;
    }
    if (kind !== "azuread") {
      next.fetchGraphGroups = false;
      next.tenantId = "";
      next.multiTenant = false;
      next.allowedTenants = "";
    }
    next.usernamePrefix = kind === "google" ? "g-" : kind === "azuread" ? "ms-" : "";
    return next;
  };
  switch (preset) {
    case "google":
      return {
        ...reset("google"),
        preset,
        issuer: "https://accounts.google.com",
        scopes: "openid profile email",
        groupClaim: "",
        roleClaim: "",
        usernameClaim: "email",
        requireEmailVerified: true,
      };
    case "azuread":
      return {
        ...reset("azuread"),
        preset,
        issuer: current.multiTenant
          ? "https://login.microsoftonline.com/common/v2.0"
          : microsoftIssuer(current.tenantId),
        scopes: "openid profile email User.Read GroupMember.Read.All",
        groupClaim: "groups",
        roleClaim: "roles",
        usernameClaim: "preferred_username",
        requireEmailVerified: false,
        fetchGraphGroups: true,
      };
    case "keycloak":
      return {
        ...reset("keycloak"),
        preset,
        scopes: "openid profile email",
        groupClaim: "groups",
        roleClaim: "roles",
      };
    default:
      return { ...reset("oidc"), preset, kind: "oidc" };
  }
}

/** Map a kind change onto the preset that resets provider-specific fields. */
export function applyKind(kind: string, current: ProviderFormState): ProviderFormState {
  const preset: ProviderPreset =
    kind === "google" || kind === "azuread" || kind === "keycloak" ? kind : "generic";
  return applyPreset(preset, current);
}

export function updateMapping(
  rows: MappingRow[],
  index: number,
  changes: Partial<MappingRow>,
): MappingRow[] {
  return rows.map((row, current) => (current === index ? { ...row, ...changes } : row));
}

export function mappingRecord(rows: MappingRow[], label: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const source = row.source.trim();
    if (!source) {
      continue;
    }
    if (Object.hasOwn(result, source)) {
      throw new Error(`${label} contains the duplicate key ${source}`);
    }
    if (!row.target.trim()) {
      throw new Error(`${label} target is required for ${source}`);
    }
    result[source] = row.target.trim();
  }
  return result;
}

export function accessRuleList(rows: RuleRow[]): AccessRule[] {
  const result: AccessRule[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const match = row.match.trim();
    const group = row.group.trim();
    if (!match && !group) {
      continue;
    }
    if (!match) {
      throw new Error("Access rule match is required.");
    }
    if (!group) {
      throw new Error(`Access rule group is required for ${match}.`);
    }
    const key = `${row.claim}:${match}`;
    if (seen.has(key)) {
      throw new Error(`Access rules contain the duplicate match ${match}.`);
    }
    seen.add(key);
    result.push({ claim: row.claim, match, group, roles: [...row.roles] });
  }
  return result;
}

export function buildPayload(form: ProviderFormState): ProviderPayload {
  const payload: ProviderPayload = {
    label: form.label.trim(),
    kind: form.kind,
    issuer: form.issuer.trim(),
    clientId: form.clientId.trim(),
    secretFile: form.secretFile.trim(),
    scopes: form.scopes.trim(),
    groupClaim: form.groupClaim.trim(),
    roleClaim: form.roleClaim.trim(),
    usernameClaim: form.usernameClaim.trim(),
    usernamePrefix: form.usernamePrefix.trim(),
    requireEmailVerified: form.requireEmailVerified,
    allowedTenants: form.allowedTenants
      .split(/[,\s]+/)
      .map((tenant) => tenant.trim())
      .filter(Boolean),
    fetchGraphGroups: form.fetchGraphGroups,
    fetchGoogleGroups: form.fetchGoogleGroups,
    googleServiceAccountFile: form.googleServiceAccountFile.trim(),
    googleAdminEmail: form.googleAdminEmail.trim(),
    groupMap: mappingRecord(form.groupMappings, "Group mapping"),
    roleMap: mappingRecord(form.roleMappings, "Role mapping"),
    accessRules: accessRuleList(form.accessRules),
    baselineGroup: form.baselineGroup.trim(),
    baselineRoles: form.baselineRoles,
    strictGroups: form.strictGroups,
    allowedEmailDomains: form.allowedEmailDomains
      .split(/[,\s]+/)
      .map((domain) => domain.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
    requireHostedDomain: form.kind === "google" ? form.requireHostedDomain : false,
    enabled: form.enabled,
    sortOrder: Number(form.sortOrder) || 0,
  };
  if (form.id.trim()) {
    payload.id = form.id.trim();
  }
  return payload;
}

export function isLocalCallback(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

export function callbackNeedsHttps(callbackUrl: string, kind: string): boolean {
  if (kind !== "google" && kind !== "azuread") {
    return false;
  }
  if (!callbackUrl || isLocalCallback(callbackUrl)) {
    return false;
  }
  try {
    return new URL(callbackUrl).protocol !== "https:";
  } catch {
    return false;
  }
}
