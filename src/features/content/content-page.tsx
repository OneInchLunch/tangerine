import { InlineApiDataPanel, type ApiDataSelection } from "@/components/api-data-pane";
import { InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorPanel } from "@/components/ui/error-panel";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceList, type ResourceColumn } from "@/components/resource-list";
import { useApiRoot } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import type { ContentTypeEntry } from "@/features/content/content-entry";
import { PackageList } from "@/features/content/package-list";
import { PackageVersionsPane } from "@/features/content/package-versions-pane";
import { VulnerabilitiesPane } from "@/features/content/vulnerabilities-pane";
import { ContentViewToggle } from "@/features/content/view-toggle";
import {
  contentMatchesQuery,
  contentPluginLabel,
  contentPrimaryLabel,
  contentSecondaryLabel,
  contentTypeLabel,
} from "@/lib/content-labels";
import { MAX_CONTENT_REPOSITORY_FILTERS } from "@/lib/content-repositories";
import { packageConfigFor, packageKeyValues } from "@/lib/content-packages";
import { contentSearchConfig } from "@/lib/content-search";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatRelative, truncate } from "@/lib/format";
import { mergeListSearch } from "@/lib/list-url-state";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { Braces, ChevronDown, ChevronRight, Layers, Search, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentUploadDialog } from "./content-upload-dialog";
import { RepositoryFilter, useContentRepositoryFilter } from "./repository-filter";

type ContentRow = Record<string, unknown> & {
  pulp_href?: string;
  pulp_last_updated?: string;
};

function sizeLabel(row: ContentRow): string {
  const size = row.size ?? row.file_size;
  return typeof size === "number" ? formatBytes(size) : "—";
}

function columnsFor(
  entry: ContentTypeEntry,
  onOpenApiData: (selection: ApiDataSelection) => void,
): ResourceColumn<ContentRow>[] {
  return [
    {
      header: "Content",
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
            <Layers className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
              {truncate(contentPrimaryLabel(row, entry), 72)}
            </p>
            <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
              {row.pulp_href ?? "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Version",
      className: "hidden sm:table-cell",
      hideWhenEmpty: (row) => contentSecondaryLabel(row, entry) === "—",
      cell: (row) => <Badge tone="neutral">{contentSecondaryLabel(row, entry)}</Badge>,
    },
    {
      header: "Size",
      className: "hidden md:table-cell text-xs text-zinc-500 dark:text-zinc-400",
      hideWhenEmpty: (row) => {
        const size = row.size ?? row.file_size;
        return typeof size !== "number";
      },
      cell: (row) => sizeLabel(row),
    },
    {
      header: "Updated",
      className: "hidden lg:table-cell text-xs text-zinc-500 dark:text-zinc-400",
      cell: (row) => formatRelative(row.pulp_last_updated),
    },
    {
      header: "",
      className: "w-10",
      cell: (row) =>
        row.pulp_href ? (
          <IconButton
            label={`View API data for ${contentPrimaryLabel(row, entry)}`}
            title="View API data"
            icon={Braces}
            onClick={() =>
              onOpenApiData({ href: row.pulp_href!, title: contentPrimaryLabel(row, entry) })
            }
          />
        ) : null,
    },
  ];
}

function ContentDrawer({ entry, onClose }: { entry: ContentTypeEntry; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const config = packageConfigFor(entry.plugin, entry.type);
  const packageParam = typeof search.package === "string" ? search.package : "";
  const packageValues = packageKeyValues(packageParam);
  const validPackage =
    Boolean(config) &&
    packageValues.length === (config?.identity.length ?? 0) &&
    packageValues.every(Boolean);
  const unitsView = search.view === "units";
  const [apiData, setApiData] = useState<ApiDataSelection | null>(null);
  const [vulnerabilityReport, setVulnerabilityReport] = useState<{
    href: string;
    title: string;
  } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [returnFocusKey, setReturnFocusKey] = useState<string | null>(null);
  const { session } = useAuth();
  const scopedRepositories = Boolean(session?.capabilities?.repositoryAdmin);
  const repositoryFilter = useContentRepositoryFilter();
  const omittedRepositories = scopedRepositories
    ? Math.max(0, repositoryFilter.selected.length - MAX_CONTENT_REPOSITORY_FILTERS)
    : 0;
  const repositoryPicker = scopedRepositories ? (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">Assigned repositories only</Badge>
      {omittedRepositories > 0 ? (
        <Badge tone="warning">
          Showing {MAX_CONTENT_REPOSITORY_FILTERS} of {repositoryFilter.selected.length} assigned
          repositories
        </Badge>
      ) : null}
    </div>
  ) : (
    <RepositoryFilter filter={repositoryFilter} />
  );

  const updateSearch = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      void navigate({
        to: location.pathname,
        replace: true,
        search: (previous: unknown) =>
          mergeListSearch(previous as Record<string, unknown>, updates),
      });
    },
    [location.pathname, navigate],
  );

  const openPackage = useCallback(
    (key: string) => {
      setReturnFocusKey(null);
      updateSearch({ package: key, view: undefined });
    },
    [updateSearch],
  );

  const closePackage = useCallback(() => {
    setReturnFocusKey(packageParam || null);
    updateSearch({ package: undefined });
  }, [packageParam, updateSearch]);

  const showUnits = useCallback(() => {
    updateSearch({ view: "units", package: undefined });
  }, [updateSearch]);

  const showPackages = useCallback(() => {
    updateSearch({ view: undefined });
  }, [updateSearch]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (apiData) {
        setApiData(null);
        return;
      }
      if (vulnerabilityReport) {
        setVulnerabilityReport(null);
        return;
      }
      if (validPackage) {
        closePackage();
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [apiData, closePackage, onClose, validPackage, vulnerabilityReport]);

  const uploadButton = (
    <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
      <Upload className="size-3.5" />
      Upload content
    </Button>
  );
  const apiDataButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        setApiData({
          href: `${entry.key}/`,
          title: `${contentPluginLabel(entry.plugin)} ${contentTypeLabel(entry.type)} API data`,
        })
      }
    >
      <Braces className="size-3.5" />
      API data
    </Button>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss content pane"
        className="fixed inset-x-0 bottom-0 top-16 z-30 bg-zinc-950/30 lg:left-[var(--app-sidebar-width)]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${contentPluginLabel(entry.plugin)} ${contentTypeLabel(entry.type)} content`}
        className="fixed bottom-0 right-0 top-16 z-40 flex w-full max-w-4xl flex-col overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-4 shadow-2xl outline-none dark:border-zinc-800 dark:bg-zinc-950 3xl:w-[min(60vw,80rem)] 3xl:max-w-none"
      >
        {apiData ? (
          <InlineApiDataPanel
            selection={apiData}
            onBack={() => setApiData(null)}
            onClose={onClose}
          />
        ) : vulnerabilityReport ? (
          <VulnerabilitiesPane
            href={vulnerabilityReport.href}
            title={vulnerabilityReport.title}
            onBack={() => setVulnerabilityReport(null)}
            onClose={onClose}
          />
        ) : config && validPackage ? (
          <PackageVersionsPane
            entry={entry}
            config={config}
            values={packageValues}
            onBack={closePackage}
            onClose={onClose}
            onOpenApiData={setApiData}
            onOpenVulnerabilities={setVulnerabilityReport}
          />
        ) : config && !unitsView ? (
          <PackageList
            entry={entry}
            config={config}
            repositoryFilter={repositoryFilter}
            onOpenPackage={(group) => openPackage(group.key)}
            onOpenApiData={setApiData}
            onClose={onClose}
            onShowUnits={showUnits}
            onUpload={() => setUploadOpen(true)}
            focusKey={returnFocusKey}
          />
        ) : (
          <ResourceList<ContentRow>
            key={entry.key}
            title={`${contentPluginLabel(entry.plugin)} · ${contentTypeLabel(entry.type)}`}
            description={`Content units served by the ${entry.plugin} plugin at /${entry.key}/.`}
            headerMode="section"
            endpoint={entry.key}
            icon={Layers}
            params={repositoryFilter.params}
            filters={repositoryPicker}
            enabled={repositoryFilter.listEnabled}
            loading={repositoryFilter.isLoading}
            searchParam={contentSearchConfig(entry.plugin, entry.type).parameter}
            clientFilter={
              contentSearchConfig(entry.plugin, entry.type).pageScoped
                ? contentMatchesQuery
                : undefined
            }
            liveSearch
            searchPlaceholder={contentSearchConfig(entry.plugin, entry.type).placeholder}
            getRowKey={(row) => row.pulp_href ?? JSON.stringify(row).slice(0, 120)}
            countLabel={(count) => `${count} ${count === 1 ? "unit" : "units"}`}
            leading={
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close content pane"
                title="Close"
              >
                <X className="size-4" />
              </Button>
            }
            headerActions={
              <>
                {config ? (
                  <ContentViewToggle
                    view="units"
                    onChange={(next) => {
                      if (next === "packages") {
                        showPackages();
                      }
                    }}
                  />
                ) : null}
                {uploadButton}
                {apiDataButton}
              </>
            }
            emptyTitle={
              repositoryFilter.selected.length
                ? "No content in the selected repositories"
                : "No content of this type"
            }
            emptyDescription={
              repositoryFilter.isBlocked
                ? "The selected repositories have no versions yet. Sync content or change the repository filter."
                : repositoryFilter.selected.length
                  ? "The selected repositories do not contain this content type, or the search excludes it."
                  : "Sync a repository or upload content to populate this content type."
            }
            columns={columnsFor(entry, setApiData)}
          />
        )}

        {uploadOpen ? (
          <ContentUploadDialog
            key={`upload:${entry.key}`}
            contentType={entry}
            onClose={() => setUploadOpen(false)}
          />
        ) : null}
      </div>
    </>
  );
}

export function ContentPage() {
  const apiRoot = useApiRoot();
  const navigate = useNavigate();
  const location = useLocation();
  const routeSearch = useSearch({ strict: false }) as { plugin?: unknown; type?: unknown };
  const selectedPlugin = typeof routeSearch.plugin === "string" ? routeSearch.plugin : "";
  const selectedType = typeof routeSearch.type === "string" ? routeSearch.type : "";

  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const contentTypes = useMemo<ContentTypeEntry[]>(() => {
    if (!apiRoot.data) {
      return [];
    }
    return Object.entries(apiRoot.data)
      .filter(([key]) => key.startsWith("content/"))
      .map(([key]) => {
        const parts = key.split("/");
        return {
          key,
          plugin: parts[1] ?? "core",
          type: parts.slice(2).join("/") || "content",
        };
      })
      .sort(
        (a, b) =>
          contentPluginLabel(a.plugin).localeCompare(contentPluginLabel(b.plugin)) ||
          contentTypeLabel(a.type).localeCompare(contentTypeLabel(b.type)),
      );
  }, [apiRoot.data]);

  const groups = useMemo(() => {
    const byPlugin = new Map<string, ContentTypeEntry[]>();
    for (const entry of contentTypes) {
      const entries = byPlugin.get(entry.plugin) ?? [];
      entries.push(entry);
      byPlugin.set(entry.plugin, entries);
    }
    return [...byPlugin.entries()]
      .map(([plugin, entries]) => ({ plugin, entries }))
      .sort((a, b) => contentPluginLabel(a.plugin).localeCompare(contentPluginLabel(b.plugin)));
  }, [contentTypes]);

  const selected = useMemo(
    () =>
      contentTypes.find(
        (entry) => entry.plugin === selectedPlugin && entry.type === selectedType,
      ) ?? null,
    [contentTypes, selectedPlugin, selectedType],
  );

  const selectedPluginKey = selected?.plugin;
  const hasSelectionParams = Boolean(selectedPlugin || selectedType);
  const invalidSelection =
    hasSelectionParams && !apiRoot.isLoading && !apiRoot.isError && selected === null;

  const needle = filter.trim().toLowerCase();
  const filtering = needle.length > 0;
  const visibleGroups = useMemo(() => {
    if (!needle) {
      return groups;
    }
    return groups.flatMap((group) => {
      const pluginMatches = `${group.plugin} ${contentPluginLabel(group.plugin)}`
        .toLowerCase()
        .includes(needle);
      const entries = pluginMatches
        ? group.entries
        : group.entries.filter((entry) =>
            `${entry.key} ${entry.type} ${contentTypeLabel(entry.type)}`
              .toLowerCase()
              .includes(needle),
          );
      return entries.length ? [{ ...group, entries }] : [];
    });
  }, [groups, needle]);

  useEffect(() => {
    if (!selectedPluginKey) {
      return;
    }
    setExpanded((previous) => {
      if (previous.has(selectedPluginKey)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(selectedPluginKey);
      return next;
    });
  }, [selectedPluginKey]);

  function togglePlugin(plugin: string) {
    if (filtering) {
      return;
    }
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(plugin)) {
        next.delete(plugin);
      } else {
        next.add(plugin);
      }
      return next;
    });
  }

  function selectType(entry: ContentTypeEntry) {
    setExpanded((previous) => new Set(previous).add(entry.plugin));
    void navigate({
      to: location.pathname,
      replace: true,
      search: (previous: unknown) =>
        mergeListSearch(previous as Record<string, unknown>, {
          plugin: entry.plugin,
          type: entry.type,
          page: undefined,
          q: undefined,
          filter: undefined,
          package: undefined,
          view: undefined,
        }),
    });
  }

  function clearSelection() {
    void navigate({
      to: location.pathname,
      replace: true,
      search: (previous: unknown) =>
        mergeListSearch(previous as Record<string, unknown>, {
          plugin: undefined,
          type: undefined,
          page: undefined,
          q: undefined,
          filter: undefined,
          package: undefined,
          view: undefined,
        }),
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-5 lg:min-h-[calc(100dvh-8rem)]">
      <PageHeader
        title="Content"
        description="Browse content by plugin and type. Selecting a type opens it in a side pane."
      />

      {apiRoot.isError ? (
        <ErrorPanel
          title="Could not discover content types"
          message={errorMessage(apiRoot.error)}
          onRetry={() => void apiRoot.refetch()}
        />
      ) : apiRoot.isLoading ? (
        <Card className="max-w-3xl p-4 3xl:max-w-5xl">
          <div className="h-96 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        </Card>
      ) : (
        <div className="flex min-h-0 max-w-3xl flex-1 flex-col gap-3 3xl:max-w-5xl">
          {invalidSelection ? (
            <InlineAlert tone="warning" title="Content type not available">
              This Pulp installation does not expose{" "}
              {[selectedPlugin, selectedType].filter(Boolean).join("/")}.{" "}
              <button
                type="button"
                onClick={clearSelection}
                className="font-medium underline underline-offset-2"
              >
                Choose another type
              </button>
              .
            </InlineAlert>
          ) : null}

          <Card className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Plugins</p>
                  <p className="text-meta text-zinc-500 dark:text-zinc-400">
                    {groups.length} plugins · {contentTypes.length} content types
                  </p>
                </div>
                <Badge tone="neutral">{contentTypes.length}</Badge>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter plugins or content types…"
                  className="pl-9"
                  aria-label="Filter content types"
                />
              </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
              {visibleGroups.length ? (
                <ul className="space-y-0.5">
                  {visibleGroups.map(({ plugin, entries }) => {
                    const isExpanded = filtering || expanded.has(plugin);
                    return (
                      <li key={plugin}>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`content-plugin-${plugin}`}
                          onClick={() => togglePlugin(plugin)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4 shrink-0 text-zinc-400" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {contentPluginLabel(plugin)}
                          </span>
                          <span className="text-meta text-zinc-400">{entries.length}</span>
                        </button>

                        {isExpanded ? (
                          <ul
                            id={`content-plugin-${plugin}`}
                            className="mb-1 ml-4 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800"
                          >
                            {entries.map((entry) => {
                              const active = selected?.key === entry.key;
                              return (
                                <li key={entry.key}>
                                  <button
                                    type="button"
                                    aria-current={active ? "true" : undefined}
                                    onClick={() => selectType(entry)}
                                    className={cn(
                                      "w-full rounded-md px-2 py-1.5 text-left transition-colors",
                                      active
                                        ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60",
                                    )}
                                  >
                                    <span className="block truncate text-xs font-medium">
                                      {contentTypeLabel(entry.type)}
                                    </span>
                                    <span className="block truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                                      /{entry.key}/
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="p-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No plugins or content types match “{filter}”.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {selected ? (
        <ContentDrawer key={selected.key} entry={selected} onClose={clearSelection} />
      ) : null}
    </div>
  );
}
