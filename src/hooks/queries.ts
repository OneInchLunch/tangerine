import { listAllResource, listResource, openApiSchema, pulpApi } from "@/api/resources";
import type {
  Distribution,
  DistributionDetail,
  ObjectRolesResponse,
  Paginated,
  Publication,
  QueryParams,
  RemoteDetail,
  Repository,
  RepositoryDetail,
  RepositoryVersion,
  Task,
} from "@/api/types";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { apiRequest, apiRequestWithStatus } from "@/api/client";
import {
  createProvider,
  deleteProvider,
  fetchAdminCsrf,
  fetchAccessPolicyStatus,
  fetchBootstrap,
  fetchDiagnostics,
  fetchProviderConfigs,
  fetchProviderAudit,
  fetchProviderGroups,
  fetchSecretFiles,
  fetchSecretStatus,
  fetchSsoProviders,
  checkSecretFile,
  probeIssuer,
  testProvider,
  updateProvider,
  type ProviderPayload,
} from "@/api/gateway";
import { getConfig } from "@/lib/config";
import { queryKeys } from "@/lib/query-keys";
import type { VulnerabilityReport } from "@/lib/vulnerabilities";
import { ACTIVE_TASK_STATE_FILTER, isTerminalTask } from "@/lib/task-state";
import { useMemo, useState } from "react";

const FIFTEEN_SECONDS = 15_000;
const THIRTY_SECONDS = 30_000;
const LOAD_MORE_PAGE_SIZE = 50;

/** Runtime-configurable polling interval (defaults to 3s). */
function pollInterval(multiplier = 1): number {
  return Math.max(1_000, getConfig().pollIntervalMs * multiplier);
}

function taskRefetchInterval(tasks: Task[] | undefined): number {
  if (!tasks) {
    return pollInterval();
  }
  return tasks.some((task) => !isTerminalTask(task.state)) ? pollInterval() : pollInterval(5);
}

function useHrefResource<T>(
  queryKey: QueryKey,
  href: string | undefined,
  staleTime = FIFTEEN_SECONDS,
) {
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => apiRequest<T>(href!, { signal }),
    enabled: Boolean(href),
    staleTime,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: ({ signal }) => pulpApi.status({ signal }),
    staleTime: FIFTEEN_SECONDS,
    refetchInterval: pollInterval(10),
    retry: 1,
  });
}

export function useCount(resource: string) {
  return useQuery({
    queryKey: queryKeys.counts.resource(resource),
    queryFn: () => pulpApi.count(resource),
    staleTime: THIRTY_SECONDS,
  });
}

export function useRecentTasks(limit = 8, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.recent(limit),
    queryFn: ({ signal }) => pulpApi.tasks({ limit, offset: 0 }, { signal }),
    refetchInterval: (query) => taskRefetchInterval(query.state.data?.results),
    enabled: options.enabled ?? true,
  });
}

export function useTasks(params: QueryParams) {
  return useQuery({
    queryKey: queryKeys.tasks.list(params),
    queryFn: ({ signal }) => pulpApi.tasks(params, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => taskRefetchInterval(query.state.data?.results),
  });
}

/**
 * Count of tasks still waiting, running, or cancelling. The top-bar indicator
 * polls quickly while anything is active and backs off when the queue drains.
 */
export function useActiveTaskCount(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.active,
    queryFn: ({ signal }) =>
      pulpApi.tasks({ limit: 1, offset: 0, state__in: ACTIVE_TASK_STATE_FILTER }, { signal }),
    refetchInterval: (query) =>
      (query.state.data?.count ?? 0) > 0 ? pollInterval() : pollInterval(5),
    enabled: options.enabled ?? true,
  });
}

export function useRepositories(params: QueryParams) {
  return useQuery({
    queryKey: queryKeys.repositories.list(params),
    queryFn: ({ signal }) => pulpApi.repositories(params, { signal }),
    placeholderData: keepPreviousData,
    staleTime: FIFTEEN_SECONDS,
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: ({ signal }) => pulpApi.task(taskId!, { signal }),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task) {
        return pollInterval();
      }
      return isTerminalTask(task.state) ? false : pollInterval();
    },
  });
}

export function useRepository(href: string | undefined) {
  return useHrefResource<RepositoryDetail>(queryKeys.repository(href), href);
}

export function useRemote(href: string | undefined) {
  return useHrefResource<RemoteDetail>(queryKeys.remote(href), href);
}

export function useDistribution(href: string | undefined) {
  return useHrefResource<DistributionDetail>(queryKeys.distribution(href), href);
}

export function usePublication(href: string | undefined) {
  return useHrefResource<Publication>(queryKeys.publication(href), href);
}

export function useRepositoryDistributions(repositoryHref: string | undefined) {
  return useQuery({
    queryKey: queryKeys.repositoryDistributions(repositoryHref),
    queryFn: ({ signal }) =>
      listAllResource<Distribution>(
        "distributions",
        {
          repository: repositoryHref,
          ordering: "name",
        },
        { signal },
      ),
    enabled: Boolean(repositoryHref),
    staleTime: FIFTEEN_SECONDS,
  });
}

export function useRepositoryVersions(
  href: string | undefined,
  params: { limit?: number; offset?: number } = {},
) {
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: queryKeys.repositoryVersions(href, { limit, offset }),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<RepositoryVersion>>(
        `${href}versions/?limit=${limit}&offset=${offset}&ordering=-number`,
        { signal },
      ),
    enabled: Boolean(href),
    placeholderData: keepPreviousData,
    staleTime: FIFTEEN_SECONDS,
  });
}

export function useRepositoryContent<T>(
  resource: string,
  repositoryVersionHref: string | undefined,
  params: QueryParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<Paginated<T>>({
    queryKey: queryKeys.repositoryContent(resource, repositoryVersionHref, params),
    queryFn: ({ signal }) =>
      listResource<T>(
        resource,
        {
          repository_version: repositoryVersionHref,
          ...params,
        },
        { signal },
      ),
    enabled: Boolean(repositoryVersionHref) && (options.enabled ?? true),
    staleTime: FIFTEEN_SECONDS,
    placeholderData: keepPreviousData,
  });
}

export function useObjectRoles(href: string | undefined) {
  return useQuery({
    queryKey: queryKeys.objectRoles(href),
    queryFn: ({ signal }) => apiRequest<ObjectRolesResponse>(`${href}list_roles/`, { signal }),
    enabled: Boolean(href),
    staleTime: FIFTEEN_SECONDS,
  });
}

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers,
    queryFn: ({ signal }) => pulpApi.workers({ limit: 100 }, { signal }),
    refetchInterval: pollInterval(5),
  });
}

export function useApiList<T>(
  resource: string,
  params: QueryParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<Paginated<T>>({
    queryKey: queryKeys.apiList.resource(resource, params),
    queryFn: ({ signal }) => listResource<T>(resource, params, { signal }),
    placeholderData: keepPreviousData,
    staleTime: FIFTEEN_SECONDS,
    enabled: options.enabled ?? true,
  });
}

/** Fetch every page of a small summary resource without a silent upper limit. */
export function useAllList<T>(
  resource: string,
  params: QueryParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<Paginated<T>>({
    queryKey: queryKeys.apiList.allResults(resource, params),
    queryFn: ({ signal }) => listAllResource<T>(resource, params, { signal }),
    placeholderData: keepPreviousData,
    staleTime: FIFTEEN_SECONDS,
    enabled: options.enabled ?? true,
  });
}

/** Repositories assigned to a repository-scoped gateway admin. */
export function useScopedRepositoryHrefs(prns: string[] | undefined) {
  return useAllList<Repository>(
    "repositories",
    {
      prn__in: prns && prns.length > 0 ? prns.join(",") : undefined,
      fields: "pulp_href,remote,prn",
    },
    { enabled: Boolean(prns && prns.length > 0) },
  );
}

/**
 * Paginated list for selects: server-side search narrows the result set and
 * callers can grow the limit explicitly instead of silently truncating it.
 */
export function useLoadMoreList<T>(
  resource: string,
  params: QueryParams = {},
  options: { enabled?: boolean; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? LOAD_MORE_PAGE_SIZE;
  const [limit, setLimit] = useState(pageSize);
  const query = useApiList<T>(resource, { ...params, limit }, { enabled: options.enabled });
  return {
    ...query,
    total: query.data?.count ?? 0,
    hasMore: Boolean(query.data?.next),
    loadMore: () => setLimit((current) => current + pageSize),
  };
}

/**
 * Follow a paginated endpoint with an explicit "load more" control. Unlike
 * `useLoadMoreList`, this keeps each page in the cache and fetches only the
 * next page instead of re-downloading every loaded row.
 */
export function useApiPages<T>(
  resource: string,
  params: QueryParams = {},
  options: { enabled?: boolean; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? 250;
  const queryParams: QueryParams = { ...params, limit: pageSize };
  const queryKey = queryKeys.apiList.pages(resource, queryParams);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      pageParam
        ? apiRequest<Paginated<T>>(pageParam, { signal })
        : listResource<T>(resource, queryParams, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: options.enabled ?? true,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
    total: query.data?.pages[0]?.count ?? 0,
    hasMore: Boolean(query.hasNextPage),
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    queryKey,
  };
}

export function useApiRoot() {
  return useQuery({
    queryKey: queryKeys.apiRoot,
    queryFn: ({ signal }) => pulpApi.root({ signal }),
    staleTime: Infinity,
  });
}

const VULNERABILITY_REPORT_CHUNK = 40;

/**
 * Fetch vulnerability reports for many content units in one cache entry.
 * Reports are keyed by their own href, so chunking keeps the query string
 * under proxy URL limits while still avoiding one request per version.
 */
export function useVulnerabilityReports(hrefs: string[]) {
  const unique = useMemo(() => [...new Set(hrefs.filter((href) => Boolean(href)))].sort(), [hrefs]);
  return useQuery({
    queryKey: queryKeys.vulnerabilityReports(unique),
    queryFn: async ({ signal }) => {
      const chunks: string[][] = [];
      for (let index = 0; index < unique.length; index += VULNERABILITY_REPORT_CHUNK) {
        chunks.push(unique.slice(index, index + VULNERABILITY_REPORT_CHUNK));
      }
      const pages = await Promise.all(
        chunks.map((chunk) =>
          listResource<VulnerabilityReport>(
            "vuln_report",
            {
              pulp_href__in: chunk.join(","),
              fields: "pulp_href,vulns",
              limit: chunk.length,
            },
            { signal },
          ),
        ),
      );
      return pages.flatMap((page) => page.results);
    },
    enabled: unique.length > 0,
    staleTime: FIFTEEN_SECONDS,
  });
}
export function useApiResource(href: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.apiResource(href),
    queryFn: ({ signal }) => apiRequestWithStatus<unknown>(href!, { signal }),
    enabled: Boolean(href),
    staleTime: 0,
  });
}

export function useOpenApiSchema() {
  return useQuery({
    queryKey: queryKeys.openApiSchema,
    queryFn: ({ signal }) => openApiSchema({ signal }),
    staleTime: Infinity,
  });
}

// --- SSO gateway ------------------------------------------------------------

function gatewayEnabled(): boolean {
  return getConfig().authMode === "gateway";
}

/** Providers offered on the login screen. Public gateway endpoint. */
export function useSsoProviders() {
  return useQuery({
    queryKey: queryKeys.gateway.providers,
    queryFn: fetchSsoProviders,
    enabled: gatewayEnabled(),
    staleTime: THIRTY_SECONDS,
    retry: 1,
  });
}

export function useGatewayBootstrap(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gateway.bootstrap,
    queryFn: fetchBootstrap,
    enabled: enabled && gatewayEnabled(),
    staleTime: THIRTY_SECONDS,
    retry: 1,
  });
}

export function useGatewayDiagnostics(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gateway.diagnostics,
    queryFn: fetchDiagnostics,
    enabled: enabled && gatewayEnabled(),
    refetchInterval: pollInterval(10),
    retry: 1,
  });
}

export function useSecretFiles(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gateway.secrets,
    queryFn: fetchSecretFiles,
    enabled: enabled && gatewayEnabled(),
    staleTime: THIRTY_SECONDS,
  });
}

export function useProviderConfigs(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gateway.adminProviders,
    queryFn: fetchProviderConfigs,
    enabled: enabled && gatewayEnabled(),
    staleTime: 0,
  });
}

export function useProviderGroups(providerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.gateway.groups(providerId ?? "", ""),
    queryFn: () => fetchProviderGroups(providerId ?? ""),
    enabled: Boolean(providerId) && gatewayEnabled(),
    staleTime: THIRTY_SECONDS,
    retry: 1,
  });
}

export function useAccessPolicyStatus() {
  return useQuery({
    queryKey: queryKeys.gateway.accessPolicies,
    queryFn: fetchAccessPolicyStatus,
    enabled: gatewayEnabled(),
    staleTime: THIRTY_SECONDS,
    retry: 1,
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, csrfToken }: { payload: ProviderPayload; csrfToken: string }) =>
      createProvider(payload, csrfToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.adminProviders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.providers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.diagnostics });
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      payload,
      csrfToken,
    }: {
      providerId: string;
      payload: Partial<ProviderPayload>;
      csrfToken: string;
    }) => updateProvider(providerId, payload, csrfToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.adminProviders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.providers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.diagnostics });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, csrfToken }: { providerId: string; csrfToken: string }) =>
      deleteProvider(providerId, csrfToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.adminProviders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.providers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gateway.diagnostics });
    },
  });
}

export function useTestProvider() {
  return useMutation({
    mutationFn: ({ providerId, csrfToken }: { providerId: string; csrfToken: string }) =>
      testProvider(providerId, csrfToken),
  });
}

export function useProbeIssuer() {
  return useMutation({
    mutationFn: (issuer: string) => probeIssuer(issuer),
  });
}

export function useSecretCheck(file: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.gateway.secrets, "check", file] as const,
    queryFn: () => checkSecretFile(file),
    enabled: enabled && gatewayEnabled() && Boolean(file),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSecretStatus() {
  return useQuery({
    queryKey: [...queryKeys.gateway.secrets, "status"] as const,
    queryFn: fetchSecretStatus,
    enabled: gatewayEnabled(),
    staleTime: 30_000,
  });
}

export function useProviderAudit() {
  return useQuery({
    queryKey: [...queryKeys.gateway.adminProviders, "audit"] as const,
    queryFn: fetchProviderAudit,
    enabled: gatewayEnabled(),
    staleTime: 15_000,
  });
}

/**
 * CSRF token for gateway admin writes. A local Pulp administrator has no gateway
 * session, so this cannot come from the session payload.
 */
export function useAdminCsrf(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gateway.csrf,
    queryFn: fetchAdminCsrf,
    enabled: enabled && gatewayEnabled(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
