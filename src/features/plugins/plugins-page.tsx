import type { Status } from "@/api/types";
import { InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStatus } from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { coreVersion } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Blocks, CircleOff, Puzzle } from "lucide-react";
import { PLUGIN_CATALOG } from "./plugin-catalog";

type Version = Status["versions"][number];

interface PluginRow {
  component: string;
  name: string;
  package: string;
  version: string | null;
  description: string;
  enabled: boolean;
}

function humanizeComponent(component: string): string {
  const label = component.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildRows(versions: Version[]): { enabled: PluginRow[]; disabled: PluginRow[] } {
  const catalogByComponent = new Map(PLUGIN_CATALOG.map((entry) => [entry.component, entry]));
  const enabledVersions = versions.filter((item) => item.component !== "core");
  const enabledComponents = new Set(enabledVersions.map((item) => item.component));

  const enabled = enabledVersions
    .map((item) => {
      const catalog = catalogByComponent.get(item.component);
      return {
        component: item.component,
        name: catalog?.name ?? humanizeComponent(item.component),
        package: item.package,
        version: item.version,
        description:
          catalog?.description ?? "Plugin reported by Pulp. Add a catalog entry to describe it.",
        enabled: true,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const disabled = PLUGIN_CATALOG.filter((entry) => !enabledComponents.has(entry.component))
    .map((entry) => ({
      component: entry.component,
      name: entry.name,
      package: entry.package,
      version: null,
      description: entry.description,
      enabled: false,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return { enabled, disabled };
}

export function PluginsPage() {
  const status = useStatus();
  const versions = status.data?.versions ?? [];
  const { enabled, disabled } = buildRows(versions);
  const plugins = [...enabled, ...disabled];
  const isRefreshing = status.isFetching;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plugins"
        description="Inspect the Pulp plugin components reported by the running API."
        actions={<RefreshButton isFetching={isRefreshing} onClick={() => void status.refetch()} />}
      />

      {status.isError ? (
        <ErrorPanel
          title="Unable to load the plugin inventory"
          message={errorMessage(status.error)}
          onRetry={() => void status.refetch()}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Enabled plugins"
          value={status.data ? enabled.length : "—"}
          icon={Puzzle}
          hint="Reported by the Pulp status endpoint"
          tone="success"
        />
        <StatCard
          label="Disabled plugins"
          value={status.data ? disabled.length : "—"}
          icon={CircleOff}
          hint="Known but not installed in this Pulp image"
          tone="neutral"
        />
        <StatCard
          label="Pulp core"
          value={coreVersion(status.data) ?? "—"}
          icon={Blocks}
          hint="Platform version"
          tone="brand"
        />
      </div>

      <InlineAlert tone="info" title="Plugin changes require a new Pulp image">
        Pulp reports active components through{" "}
        <code className="font-mono">/pulp/api/v3/status/</code>, but it has no REST API to install
        or uninstall plugins. To change the plugin set, build a Pulp image with the required
        packages or update your operator/Helm configuration, then restart Pulp.{" "}
        <code className="font-mono">pulpcore-manager remove-plugin</code> removes plugin data and is
        destructive.
      </InlineAlert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Plugin inventory</CardTitle>
            <CardDescription>
              Enabled plugins and known plugins that are not installed
            </CardDescription>
          </div>
          <Puzzle className="size-4 text-zinc-400" />
        </CardHeader>
        <CardContent className="p-0">
          {status.isLoading ? (
            <TableSkeleton rows={6} rowClassName="h-10" />
          ) : status.isError ? (
            <EmptyState
              icon={Puzzle}
              title="Plugin inventory unavailable"
              description="The Pulp status endpoint could not be reached."
            />
          ) : plugins.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="hidden md:table-cell">Package</TableHead>
                    <TableHead className="hidden lg:table-cell">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plugins.map((plugin) => (
                    <TableRow
                      key={plugin.component}
                      className={cn(!plugin.enabled && "bg-zinc-50/50 dark:bg-zinc-900/30")}
                    >
                      <TableCell>
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">
                          {plugin.name}
                        </p>
                        <p className="font-mono text-micro text-zinc-400 dark:text-zinc-500">
                          {plugin.component}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={plugin.enabled ? "success" : "neutral"}>
                          {plugin.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {plugin.version ?? "—"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-zinc-500 dark:text-zinc-400 md:table-cell">
                        {plugin.package}
                      </TableCell>
                      <TableCell className="hidden max-w-md text-xs text-zinc-500 dark:text-zinc-400 lg:table-cell">
                        {plugin.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t border-zinc-100 px-4 py-3 text-meta text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                Disabled means the plugin is not installed in the running Pulp image. Pulp does not
                report installed-but-inactive plugins.
              </p>
            </>
          ) : (
            <EmptyState
              icon={Puzzle}
              title="No plugin information"
              description="Pulp did not report any plugin components."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
