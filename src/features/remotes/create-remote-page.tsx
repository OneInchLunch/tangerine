import { apiRequest, ApiError } from "@/api/client";
import type { RemoteDetail } from "@/api/types";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { useApiRoot, useScopedRepositoryHrefs } from "@/hooks/queries";
import { useAuth } from "@/auth/auth-context";
import { scopeCreateRemote } from "@/api/gateway";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RemoteForm } from "./remote-form";
import { REMOTE_TYPES, remoteRootKey } from "./remote-types";
import { formatApiError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";

function createErrorMessage(caught: unknown, plugin: string): string {
  if (caught instanceof ApiError && caught.status === 404) {
    return `The ${plugin} plugin does not appear to be installed on this Pulp instance.`;
  }
  return formatApiError(caught, "Unable to create remote.");
}

export function CreateRemotePage() {
  const apiRoot = useApiRoot();
  const navigate = useNavigate();
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const scopedRepositories = useScopedRepositoryHrefs(scoped ? session?.repositoryPrns : undefined);
  const [selectedId, setSelectedId] = useState("");
  const [repositoryHref, setRepositoryHref] = useState("");
  const [error, setError] = useState<string | null>(null);

  const availableTypes = apiRoot.data
    ? REMOTE_TYPES.filter((type) => Object.hasOwn(apiRoot.data!, remoteRootKey(type)))
    : REMOTE_TYPES;
  const selected = availableTypes.find((type) => type.id === selectedId) ?? availableTypes[0];

  const create = useApiMutation<RemoteDetail, Record<string, unknown>>({
    mutationFn: async (body) => {
      if (scoped) {
        if (!repositoryHref) {
          throw new Error("Select an assigned repository for this remote.");
        }
        if (!session?.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        const result = await scopeCreateRemote(
          selected?.apiPath ?? "",
          repositoryHref,
          body,
          session.csrfToken,
        );
        return result.remote as RemoteDetail;
      }
      return apiRequest<RemoteDetail>(selected?.apiPath ?? "", { method: "POST", body });
    },
    invalidation: [queryKeys.apiList.endpoint("remotes"), queryKeys.counts.resource("remotes")],
    successMessage: "Remote created",
    onSuccess: async (created) => {
      if (created.pulp_href) {
        await navigate({
          to: "/remotes/detail",
          search: { href: created.pulp_href },
        });
      } else {
        await navigate({ to: "/remotes" });
      }
    },
    onError: (caught) => setError(createErrorMessage(caught, selected?.plugin ?? "")),
  });

  async function handleCreate(body: Record<string, unknown>) {
    if (!selected) {
      return;
    }
    if (scoped && !repositoryHref) {
      setError("Select an assigned repository for this remote.");
      return;
    }
    setError(null);
    await create.mutateAsync(body).catch(() => undefined);
  }

  return (
    <div className="max-w-full space-y-5 3xl:max-w-5xl">
      <div>
        <BackLink to="/remotes" label="Back to remotes" className="mb-3" />
        <PageHeader
          title="Create remote"
          description="Configure an upstream source for repositories to synchronize from."
        />
      </div>

      {apiRoot.isError ? (
        <ErrorPanel
          title="Could not discover installed remote types"
          message={formatApiError(apiRoot.error, "Unable to load the API root.")}
          onRetry={() => void apiRoot.refetch()}
        />
      ) : null}

      {!selected ? (
        <ErrorPanel
          title="No remote types available"
          message="The Pulp API root did not report any installed remote types."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Remote type</CardTitle>
              <CardDescription>
                {selected.description} Only plugin types installed on the Pulp server are listed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="remote-type"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Plugin and content type
              </label>
              <select
                id="remote-type"
                value={selected.id}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setError(null);
                }}
                className="flex h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-md"
              >
                {availableTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label} ({type.id})
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {scoped ? (
            <Card>
              <CardHeader>
                <CardTitle>Repository scope</CardTitle>
                <CardDescription>
                  A scoped remote must be attached to one of your assigned repositories.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <label
                  htmlFor="remote-repository"
                  className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Assigned repository
                </label>
                <select
                  id="remote-repository"
                  value={repositoryHref}
                  onChange={(event) => setRepositoryHref(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm focus-visible:border-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-md"
                >
                  <option value="">Select a repository…</option>
                  {(scopedRepositories.data?.results ?? []).flatMap((repository) =>
                    repository.pulp_href
                      ? [
                          <option key={repository.pulp_href} value={repository.pulp_href}>
                            {repository.name}
                          </option>,
                        ]
                      : [],
                  )}
                </select>
              </CardContent>
            </Card>
          ) : null}

          <RemoteForm
            key={selected.id}
            type={selected}
            isSubmitting={create.isPending}
            error={error}
            onSubmit={handleCreate}
            onCancel={() => void navigate({ to: "/remotes" })}
          />
        </>
      )}
    </div>
  );
}
