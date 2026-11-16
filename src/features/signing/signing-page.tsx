import type { SigningService } from "@/api/types";
import { useApiDataPane } from "@/components/api-data-pane";
import { IconButton } from "@/components/ui/icon-button";
import { ResourceList } from "@/components/resource-list";
import { formatRelative } from "@/lib/format";
import { Braces } from "lucide-react";
import { entityIcons } from "@/lib/icons";

export function SigningPage() {
  const { openApiData } = useApiDataPane();

  return (
    <ResourceList<SigningService>
      title="Signing"
      description="Signing services registered on the Pulp host. The Pulp REST API exposes this inventory as read-only."
      endpoint="signing-services"
      icon={entityIcons.signing}
      searchParam="name"
      searchPlaceholder="Search by exact name…"
      params={{ ordering: "name" }}
      getRowKey={(row) => row.pulp_href ?? row.name}
      countLabel={(count) => `${count} ${count === 1 ? "service" : "services"}`}
      emptyTitle="No signing services"
      emptyDescription="Register a signing service with pulpcore-manager add-signing-service on the Pulp host, then refresh this page."
      columns={[
        {
          header: "Service",
          sortKey: "name",
          cell: (row) => (
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                <entityIcons.signing className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</p>
                <p className="truncate font-mono text-micro text-zinc-400 dark:text-zinc-500">
                  {row.script}
                </p>
              </div>
            </div>
          ),
        },
        {
          header: "Fingerprint",
          className: "hidden md:table-cell",
          cell: (row) => (
            <span className="font-mono text-meta text-zinc-500 dark:text-zinc-400">
              {row.pubkey_fingerprint}
            </span>
          ),
        },
        {
          header: "Created",
          className: "hidden sm:table-cell text-xs text-zinc-500 dark:text-zinc-400",
          cell: (row) => formatRelative(row.pulp_created),
        },
        {
          header: "",
          className: "w-10",
          cell: (row) =>
            row.pulp_href ? (
              <IconButton
                label={`View API data for ${row.name}`}
                title="View API data"
                icon={Braces}
                onClick={() => openApiData({ href: row.pulp_href!, title: row.name })}
              />
            ) : null,
        },
      ]}
    />
  );
}
