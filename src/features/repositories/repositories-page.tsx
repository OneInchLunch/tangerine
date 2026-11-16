import { ApiError, apiRequest } from "@/api/client";
import {
  repositoryTypeFromHref,
  repositoryVersionNumber,
  resourceIdFromHref,
} from "@/api/resources";
import type { Distribution } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { FormError } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select } from "@/components/ui/select";
import { REPOSITORY_NAME_PATTERN } from "@/lib/validation";
import { TableSkeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAllList, useRepositories } from "@/hooks/queries";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { useCanConfigureSigning } from "@/hooks/use-can-configure-signing";
import { scopeCreateRepository } from "@/api/gateway";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { copyText } from "@/lib/clipboard";
import { formatRelative, truncate } from "@/lib/format";
import { encodeListReturn } from "@/lib/list-url-state";
import { repositoryTypeOptions } from "@/lib/plugins";
import { queryKeys } from "@/lib/query-keys";
import { repositoryAutopublishSupport, repositoryTypeLabelForType } from "@/lib/repositories";
import { RepositoryFormFields, type RepositoryFormValue } from "./repository-form-fields";
import { useFormState } from "@/lib/use-form-state";
import {
  OsvConfigFields,
  osvConfigError,
  serializeOsvConfig,
  type OsvConfigRow,
} from "./osv-config-fields";
import { Link, useSearch } from "@tanstack/react-router";
import { Braces, Check, Copy, Plus, Search } from "lucide-react";
import { entityIcons } from "@/lib/icons";
import { useEffect, useState, type FormEvent } from "react";

const REPOSITORY_TYPES = repositoryTypeOptions();

function CreateRepositoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, refresh } = useAuth();
  const canConfigureSigning = useCanConfigureSigning();
  const [type, setType] = useState<(typeof REPOSITORY_TYPES)[number]["id"]>("file");
  const [osvConfig, setOsvConfig] = useState<OsvConfigRow[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const form = useFormState<RepositoryFormValue>({
    name: "",
    description: "",
    remote: "",
    autopublish: false,
    metadataSigningService: "",
  });

  const selected = REPOSITORY_TYPES.find((item) => item.id === type) ?? REPOSITORY_TYPES[0];
  const autopublishSupport = repositoryAutopublishSupport(type);

  const create = useApiMutation<Record<string, unknown>, Record<string, unknown>>({
    mutationFn: async (payload) => {
      if (session?.capabilities?.repositoryAdmin) {
        if (!session.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        await scopeCreateRepository(selected.path, payload, session.csrfToken);
        return payload;
      }
      return apiRequest<Record<string, unknown>>(selected.path, {
        method: "POST",
        body: payload,
      });
    },
    invalidation: [queryKeys.repositories.all, queryKeys.counts.resource("repositories")],
    successMessage: "Repository created",
    errorMode: "inline",
    onSuccess: () => {
      form.reset();
      setOsvConfig([]);
      void refresh();
      onClose();
    },
  });

  const error =
    validationError ??
    (create.error
      ? create.error instanceof ApiError && create.error.status === 404
        ? `The ${selected.label} plugin does not appear to be installed on this Pulp instance.`
        : create.error instanceof Error
          ? create.error.message
          : "Unable to create repository."
      : null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    if (type === "rpm") {
      const osvError = osvConfigError(osvConfig);
      if (osvError) {
        setValidationError(osvError);
        return;
      }
    }
    create.mutate({
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      remote: form.value.remote || null,
      ...(autopublishSupport ? { autopublish: form.value.autopublish } : {}),
      ...(type === "rpm" && canConfigureSigning
        ? { metadata_signing_service: form.value.metadataSigningService || null }
        : {}),
      ...(type === "rpm" ? { osv_config: serializeOsvConfig(osvConfig) } : {}),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create repository"
      description="Choose a content type, give the repository a unique name, and optionally attach a compatible remote."
      dirty={form.isDirty || osvConfig.length > 0}
      footer={
        <>
          <ModalCancelButton disabled={create.isPending}>Cancel</ModalCancelButton>
          <SubmitButton
            form="create-repository-form"
            isSubmitting={create.isPending}
            label="Create repository"
            busyLabel="Creating…"
            icon={Plus}
            disabled={!form.value.name.trim()}
          />
        </>
      }
    >
      <form id="create-repository-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="repository-type">Repository type</Label>
          <Select
            id="repository-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              form.patch({ remote: "" });
            }}
          >
            {REPOSITORY_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            Only plugins installed on the Pulp server are available.
          </p>
        </div>

        <RepositoryFormFields
          idPrefix="create-repository"
          value={form.value}
          onChange={form.patch}
          repositoryType={type}
          autopublishSupport={autopublishSupport}
          disabled={create.isPending}
          nameHint="Letters, digits, dots, underscores, and hyphens only."
          namePattern={REPOSITORY_NAME_PATTERN}
        />

        {type === "rpm" ? (
          <OsvConfigFields
            idPrefix="create-repository"
            rows={osvConfig}
            onChange={setOsvConfig}
            disabled={create.isPending}
          />
        ) : null}

        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}

export function RepositoriesPage() {
  const { openApiData } = useApiDataPane();
  const {
    page,
    pageSize,
    query: search,
    ordering,
    setPage,
    setPageSize,
    setQuery,
    setSort,
  } = useListUrlState();
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const returnSearch = encodeListReturn(routeSearch);
  const { user, session } = useAuth();
  const [searchInput, setSearchInput] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedRepository, setCopiedRepository] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const repositories = useRepositories({
    limit: pageSize,
    offset: page * pageSize,
    ordering: ordering || undefined,
    name__contains: search || undefined,
    ...(session?.capabilities?.repositoryAdmin
      ? {
          prn__in:
            session.repositoryPrns && session.repositoryPrns.length > 0
              ? session.repositoryPrns.join(",")
              : "prn:none",
        }
      : {}),
  });

  const repositoryHrefs = (repositories.data?.results ?? [])
    .map((repository) => repository.pulp_href)
    .filter((href): href is string => Boolean(href));
  const distributions = useAllList<Distribution>(
    "distributions",
    {
      repository__in: repositoryHrefs.join(","),
      fields: "name,base_url,base_path,pulp_href,repository",
      ordering: "name",
    },
    { enabled: repositoryHrefs.length > 0 },
  );

  const distributionsByRepository = new Map<string, Distribution[]>();
  for (const distribution of distributions.data?.results ?? []) {
    if (!distribution.repository) {
      continue;
    }
    const key = resourceIdFromHref(distribution.repository);
    const existing = distributionsByRepository.get(key) ?? [];
    existing.push(distribution);
    distributionsByRepository.set(key, existing);
  }

  const total = repositories.data?.count ?? 0;
  const hasNext = Boolean(repositories.data?.next);

  async function copyRepositoryDistributions(repositoryHref: string, urls: string[]) {
    if (!urls.length) {
      return;
    }
    const copied = await copyText(urls.join("\n"));
    if (!copied) {
      return;
    }
    setCopiedRepository(repositoryHref);
    window.setTimeout(() => {
      setCopiedRepository((current) => (current === repositoryHref ? null : current));
    }, 1500);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Repositories"
        description="Browse content repositories across every installed Pulp plugin."
        actions={
          <>
            <RefreshButton
              isFetching={repositories.isFetching}
              onClick={() => void repositories.refetch()}
            />
            {session?.capabilities?.repositoryWrite === false ? null : (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!user?.is_staff && !user?.is_superuser}
              >
                <Plus className="size-4" />
                Create repository
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <form className="relative w-full sm:max-w-xs" onSubmit={submitSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search repositories…"
              className="pl-9"
              aria-label="Search repositories"
            />
          </form>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {repositories.isLoading
              ? "Loading…"
              : `${total} ${total === 1 ? "repository" : "repositories"}`}
          </p>
        </div>

        {repositories.isError ? (
          <div className="p-4">
            <ErrorPanel
              title="Could not load repositories"
              message={
                repositories.error instanceof Error
                  ? repositories.error.message
                  : String(repositories.error)
              }
              onRetry={() => void repositories.refetch()}
            />
          </div>
        ) : repositories.isLoading ? (
          <TableSkeleton rows={5} />
        ) : repositories.data?.results.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    sortKey="name"
                    ordering={ordering}
                    onSort={setSort}
                  />
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Latest version</TableHead>
                  <TableHead className="hidden lg:table-cell">Description</TableHead>
                  <SortableTableHead
                    label="Updated"
                    sortKey="pulp_last_updated"
                    ordering={ordering}
                    onSort={setSort}
                    className="hidden md:table-cell"
                  />
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {repositories.data.results.map((repository) => {
                  const type = repositoryTypeFromHref(repository.pulp_href);
                  const repositoryDistributions = repository.pulp_href
                    ? (distributionsByRepository.get(resourceIdFromHref(repository.pulp_href)) ??
                      [])
                    : [];
                  const distributionUrls = repositoryDistributions
                    .map((distribution) => distribution.base_url || distribution.base_path)
                    .filter((url): url is string => Boolean(url));
                  const copied = Boolean(
                    repository.pulp_href && copiedRepository === repository.pulp_href,
                  );
                  let copyTitle = "Copy distribution URL";
                  if (distributions.isFetching) {
                    copyTitle = "Loading distributions…";
                  } else if (distributions.isError) {
                    copyTitle = "Could not load distributions";
                  } else if (!distributionUrls.length) {
                    copyTitle = "No distribution configured for this repository";
                  } else if (distributionUrls.length > 1) {
                    copyTitle = `Copy ${distributionUrls.length} distribution URLs`;
                  }
                  if (copied) {
                    copyTitle = "Copied distribution URL";
                  }
                  return (
                    <TableRow key={repository.pulp_href ?? repository.name}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                            <entityIcons.repositories className="size-4" />
                          </span>
                          <div className="min-w-0">
                            {repository.pulp_href ? (
                              <Link
                                to="/repositories/detail"
                                search={
                                  {
                                    href: repository.pulp_href,
                                    ...(returnSearch ? { from: returnSearch } : {}),
                                  } as never
                                }
                                className="block truncate font-medium text-zinc-900 hover:text-orange-600 dark:text-zinc-100 dark:hover:text-orange-400"
                              >
                                {repository.name}
                              </Link>
                            ) : (
                              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                {repository.name}
                              </p>
                            )}
                            <p
                              className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500"
                              title={repository.pulp_href ?? undefined}
                            >
                              {repository.pulp_href ? truncate(repository.pulp_href, 40) : "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone="brand">{repositoryTypeLabelForType(type)}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge tone="neutral">
                          v{repositoryVersionNumber(repository.latest_version_href)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                        {repository.description || "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-zinc-500 dark:text-zinc-400 md:table-cell">
                        {formatRelative(repository.pulp_last_updated)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <span title={copyTitle}>
                            <button
                              type="button"
                              disabled={
                                !repository.pulp_href ||
                                distributions.isFetching ||
                                distributionUrls.length === 0
                              }
                              onClick={() => {
                                if (repository.pulp_href) {
                                  void copyRepositoryDistributions(
                                    repository.pulp_href,
                                    distributionUrls,
                                  );
                                }
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 dark:disabled:hover:bg-transparent dark:disabled:hover:text-zinc-400"
                              title={copyTitle}
                              aria-label={
                                copied
                                  ? `Copied distribution for ${repository.name}`
                                  : `Copy distribution for ${repository.name}`
                              }
                            >
                              {copied ? (
                                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </span>
                          {repository.pulp_href ? (
                            <button
                              type="button"
                              onClick={() =>
                                openApiData({
                                  href: repository.pulp_href!,
                                  title: repository.name,
                                })
                              }
                              className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                              title="View API data"
                              aria-label={`View API data for ${repository.name}`}
                            >
                              <Braces className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              hasNext={hasNext}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : (
          <EmptyState
            icon={entityIcons.repositories}
            title={search ? "No repositories match your search" : "No repositories yet"}
            description={
              search
                ? "Try a different name or clear the search."
                : "Create your first repository to start syncing and publishing content."
            }
            action={
              search ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    setQuery("");
                  }}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      <CreateRepositoryModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
