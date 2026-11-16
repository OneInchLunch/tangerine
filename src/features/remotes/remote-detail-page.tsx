import { deleteAndWait, mutateAndWait, remoteTypeFromHref } from "@/api/resources";
import { scopeMutateObject } from "@/api/gateway";
import { useScopedMutation } from "@/hooks/use-scoped-mutation";
import { useApiDataPane } from "@/components/api-data-pane";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorPanel } from "@/components/ui/error-panel";
import { FormError } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { ObjectRolesCard } from "@/features/rbac/object-roles-card";
import { useRemote } from "@/hooks/queries";
import { errorMessage, formatApiError } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Braces, CloudDownload, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RemoteForm } from "./remote-form";
import { getRemoteType, type RemoteField } from "./remote-types";

function valueAsText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(String).join(", ") : "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function BadgeList({ values }: { values: string[] }) {
  if (!values.length) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} tone="neutral" className="font-mono">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function fieldValue(field: RemoteField, value: unknown, isSet: boolean): ReactNode {
  if (field.writeOnly) {
    return <Badge tone={isSet ? "success" : "neutral"}>{isSet ? "Set" : "Not set"}</Badge>;
  }

  if (field.kind === "boolean") {
    return <Badge tone={value ? "success" : "neutral"}>{value ? "Enabled" : "Disabled"}</Badge>;
  }

  if (field.kind === "select") {
    const option = field.options?.find((entry) => entry.value === value);
    return option?.label ?? valueAsText(value);
  }

  if (field.kind === "stringList") {
    return <BadgeList values={Array.isArray(value) ? value.map(String) : []} />;
  }

  if (field.kind === "keyValue") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
    }
    return (
      <BadgeList
        values={Object.entries(value as Record<string, unknown>).map(
          ([key, entry]) => `${key}=${entry ?? ""}`,
        )}
      />
    );
  }

  if (field.kind === "json" || field.kind === "textarea") {
    const text = valueAsText(value);
    if (text === "—") {
      return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
    }
    return (
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-2 font-mono text-meta text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-300">
        {text}
      </pre>
    );
  }

  const text = valueAsText(value);
  return (
    <span className={field.mono ? "break-all font-mono text-meta" : "break-words"}>{text}</span>
  );
}

function DetailField({
  field,
  value,
  isSet,
  wide,
}: {
  field: RemoteField;
  value: unknown;
  isSet: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <dt className="text-meta font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {field.label}
      </dt>
      <dd className="text-xs text-zinc-700 dark:text-zinc-300">
        {fieldValue(field, value, isSet)}
      </dd>
    </div>
  );
}

function RemoteDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

export function RemoteDetailPage() {
  const search = useSearch({ strict: false }) as { href?: string };
  const href = search.href;
  const navigate = useNavigate();
  const { openApiData } = useApiDataPane();
  const remote = useRemote(href);

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useScopedMutation<unknown, Record<string, unknown>>({
    scope: (body, csrfToken) => scopeMutateObject("PATCH", href ?? "", body, csrfToken),
    direct: (body) => mutateAndWait(href ?? "", { method: "PATCH", body }),
    invalidation: [
      queryKeys.remote(href),
      queryKeys.apiList.endpoint("remotes"),
      queryKeys.counts.resource("remotes"),
    ],
    successMessage: "Remote updated",
    onSuccess: () => setEditing(false),
    onError: (caught) => setError(formatApiError(caught, "Unable to update remote.")),
  });

  const remove = useScopedMutation<void, { href: string }>({
    scope: async ({ href: remoteHref }, csrfToken) => {
      await scopeMutateObject("DELETE", remoteHref, null, csrfToken);
    },
    direct: async ({ href: remoteHref }) => {
      await deleteAndWait(remoteHref);
    },
    invalidation: [queryKeys.apiList.endpoint("remotes"), queryKeys.counts.resource("remotes")],
    successMessage: "Remote deleted",
    onSuccess: async () => {
      setDeleteOpen(false);
      await navigate({ to: "/remotes" });
    },
    onError: (caught) => setError(errorMessage(caught, "Unable to delete remote.")),
  });

  if (!href) {
    return (
      <div className="space-y-4">
        <BackLink to="/remotes" label="Back to remotes" />
        <ErrorPanel
          title="Remote not specified"
          message="Open a remote from the remotes list to view its details."
        />
      </div>
    );
  }

  if (remote.isError) {
    return (
      <div className="space-y-4">
        <BackLink to="/remotes" label="Back to remotes" />
        <ErrorPanel
          title="Could not load this remote"
          message={remote.error instanceof Error ? remote.error.message : String(remote.error)}
          onRetry={() => void remote.refetch()}
        />
      </div>
    );
  }

  if (remote.isLoading || !remote.data) {
    return <RemoteDetailLoading />;
  }

  const data = remote.data;
  const typeId = remoteTypeFromHref(data.pulp_href);
  const type = getRemoteType(typeId);
  const hiddenFields = new Set(
    (data.hidden_fields ?? []).filter((field) => field.is_set).map((field) => field.name),
  );

  async function handleUpdate(body: Record<string, unknown>) {
    if (!data.pulp_href) {
      return;
    }
    setError(null);
    await update.mutateAsync(body).catch(() => undefined);
  }

  function handleDelete() {
    if (!data.pulp_href || !href) {
      return;
    }
    setError(null);
    remove.mutate({ href });
  }

  if (!type) {
    return (
      <div className="space-y-4">
        <BackLink to="/remotes" label="Back to remotes" />
        <ErrorPanel
          title="Unsupported remote type"
          message={`Tangerine does not have a curated form for the remote type "${typeId}". Use API admin to manage it.`}
        />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-5">
        <div>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="size-3.5" />
            Back to remote
          </button>
          <PageHeader
            title={`Edit ${data.name}`}
            description={`Update the ${type.label.toLowerCase()} remote configuration. Write-only values are left unchanged unless you enter a new value.`}
          />
        </div>

        <RemoteForm
          key={data.pulp_href}
          type={type}
          remote={data}
          isEdit
          isSubmitting={update.isPending}
          error={error}
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <BackLink to="/remotes" label="Back to remotes" className="mb-3" />
        <PageHeader
          title={data.name}
          description={data.url}
          actions={
            <>
              {data.pulp_href ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openApiData({ href: data.pulp_href!, title: data.name })}
                >
                  <Braces className="size-3.5" />
                  API data
                </Button>
              ) : null}
              <RefreshButton isFetching={remote.isFetching} onClick={() => void remote.refetch()} />
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </>
          }
        />
      </div>

      {error && !editing && !deleteOpen ? <FormError>{error}</FormError> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={type.tone} className="capitalize">
          <CloudDownload className="size-3" />
          {type.label}
        </Badge>
        {data.policy ? <Badge tone="neutral">{String(data.policy)}</Badge> : null}
        <Badge tone={data.tls_validation ? "success" : "warning"}>
          TLS {data.tls_validation ? "validation on" : "validation off"}
        </Badge>
        <Badge tone="neutral">{type.id}</Badge>
        <span className="text-meta text-zinc-400 dark:text-zinc-500">
          Updated {formatRelative(data.pulp_last_updated)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {type.groups.map((group) => (
          <Card key={group.id} className={group.id === "basics" ? "lg:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              {group.description ? <CardDescription>{group.description}</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <DetailField
                    key={field.key}
                    field={field}
                    value={data[field.key]}
                    isSet={hiddenFields.has(field.key)}
                    wide={field.kind === "json" || field.kind === "textarea"}
                  />
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record metadata</CardTitle>
          <CardDescription>Pulp identifiers and timestamps for this remote.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-meta font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Created
            </p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              {formatDateTime(data.pulp_created)}
            </p>
          </div>
          <div>
            <p className="text-meta font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Updated
            </p>
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              {formatDateTime(data.pulp_last_updated)}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-meta font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              API resource
            </p>
            <p className="mt-1 break-all font-mono text-micro text-zinc-400 dark:text-zinc-500">
              {data.pulp_href ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <ObjectRolesCard objectHref={data.pulp_href} objectName={data.name} />

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setError(null);
        }}
        title={`Delete ${data.name}`}
        description="This permanently removes the remote. Repositories that reference it may need to be updated."
        itemName={data.name}
        nameLabel="Remote name"
        confirmLabel="Delete remote"
        isDeleting={remove.isPending}
        error={error}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
