import type { QueryParams } from "@/api/types";

/**
 * Central query-key factory. Invalidation prefixes intentionally omit the
 * trailing params so a single key invalidates every paginated variant.
 */
export const queryKeys = {
  status: ["status"] as const,

  counts: {
    all: ["count"] as const,
    resource: (resource: string) => ["count", resource] as const,
  },

  repositories: {
    all: ["repositories"] as const,
    list: (params?: QueryParams) => ["repositories", params] as const,
  },
  repository: (href?: string | null) => ["repository", href] as const,
  repositoryVersions: (href?: string | null, params?: QueryParams) =>
    params === undefined
      ? (["repository-versions", href] as const)
      : (["repository-versions", href, params] as const),
  repositoryContent: (
    resource: string,
    repositoryVersionHref?: string | null,
    params?: QueryParams,
  ) => ["repository-content", resource, repositoryVersionHref, params] as const,
  repositoryDistributions: (href?: string | null) => ["repository-distributions", href] as const,
  repositoryDistributionsAll: ["repository-distributions"] as const,
  repositoryContentAll: ["repository-content"] as const,

  remotes: {
    all: ["remotes"] as const,
    list: (params?: QueryParams) => ["remotes", params] as const,
  },
  remote: (href?: string | null) => ["remote", href] as const,

  distributions: {
    all: ["distributions"] as const,
  },
  distribution: (href?: string | null) => ["distribution", href] as const,

  publications: {
    all: ["publications"] as const,
  },
  publication: (href?: string | null) => ["publication", href] as const,

  tasks: {
    all: ["tasks"] as const,
    list: (params?: QueryParams) => ["tasks", params] as const,
    recent: (limit: number) => ["tasks", "recent", limit] as const,
    active: ["tasks", "active"] as const,
    detail: (taskId?: string) => ["task", taskId] as const,
  },

  objectRoles: (href?: string | null) => ["object-roles", href] as const,
  workers: ["workers"] as const,
  apiRoot: ["api-root"] as const,
  openApiSchema: ["openapi-schema"] as const,

  gateway: {
    providers: ["gateway", "providers"] as const,
    bootstrap: ["gateway", "bootstrap"] as const,
    diagnostics: ["gateway", "diagnostics"] as const,
    secrets: ["gateway", "secrets"] as const,
    adminProviders: ["gateway", "admin-providers"] as const,
    csrf: ["gateway", "csrf"] as const,
    groups: (providerId: string, query: string) =>
      ["gateway", "groups", providerId, query] as const,
    accessPolicies: ["gateway", "access-policies"] as const,
  },

  apiList: {
    all: ["api-list"] as const,
    resource: (resource: string, params?: QueryParams) => ["api-list", resource, params] as const,
    pages: (resource: string, params?: QueryParams) =>
      ["api-list", resource, "pages", params] as const,
    allResults: (resource: string, params?: QueryParams) =>
      ["api-list", resource, "all", params] as const,
    endpoint: (resource: string) => ["api-list", resource] as const,
  },
  apiResource: (href?: string | null) => ["api-resource", href] as const,
  vulnerabilityReports: (hrefs: string[]) => ["vulnerability-reports", hrefs] as const,
  vulnerabilityReportsAll: ["vulnerability-reports"] as const,
} as const;
