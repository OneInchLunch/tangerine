import { apiRequest, ApiError } from "@/api/client";
import { isTaskResponse, waitForTask } from "@/api/resources";
import type { Repository } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MultipartFields } from "@/components/ui/multipart-fields";
import { Combobox } from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import { flattenEndpoints, type OpenApiDocument } from "@/features/api-admin/openapi";
import { useLoadMoreList, useOpenApiSchema } from "@/hooks/queries";
import { useListSearch } from "@/hooks/use-list-search";
import { formatApiError } from "@/lib/errors";
import { buildMultipartForm, multipartContentForOperation } from "@/lib/multipart";
import { repositoryFilterTypes } from "@/lib/plugins";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { scopeUploadContent } from "@/api/gateway";
import { Upload } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

export function ContentUploadDialog({
  contentType,
  onClose,
}: {
  contentType: { key: string; plugin: string; type: string };
  onClose: () => void;
}) {
  const schema = useOpenApiSchema();
  const document = schema.data as OpenApiDocument | undefined;
  const endpoint = useMemo(() => {
    if (!document) {
      return undefined;
    }
    return flattenEndpoints(document).find(
      (item) => item.method === "post" && item.path.endsWith(`/${contentType.key}/`),
    );
  }, [contentType.key, document]);
  const multipart = useMemo(
    () =>
      document && endpoint ? multipartContentForOperation(document, endpoint.operation) : null,
    [document, endpoint],
  );
  const fields = multipart?.fields ?? [];
  const { session } = useAuth();
  const scoped = Boolean(session?.capabilities?.repositoryAdmin);
  const repositoryField = fields.find((field) => field.name === "repository");
  const uploadFields = fields.filter(
    (field) =>
      field.name !== "repository" &&
      (field.kind === "file" || field.required || field.name === "overwrite"),
  );

  const repositorySearchSearch = useListSearch();
  const compatibleType = repositoryFilterTypes(contentType.plugin).join(",") || undefined;
  const repositories = useLoadMoreList<Repository>(
    "repositories",
    {
      pulp_type__in: compatibleType,
      name__contains: repositorySearchSearch.queryParam,
      ordering: "name",
      ...(scoped
        ? {
            prn__in:
              session?.repositoryPrns && session.repositoryPrns.length > 0
                ? session.repositoryPrns.join(",")
                : "prn:none",
          }
        : {}),
    },
    { enabled: Boolean(repositoryField) },
  );
  const repositoryOptions = (repositories.data?.results ?? []).flatMap((repository) =>
    repository.pulp_href ? [{ value: repository.pulp_href, label: repository.name }] : [],
  );

  const [repositoryHref, setRepositoryHref] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const field of fields) {
      initial[field.name] = field.kind === "boolean" ? field.defaultValue === true : "";
    }
    return initial;
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState<string | null>(null);

  const upload = useApiMutation<void, void>({
    mutationFn: async () => {
      if (scoped && !repositoryHref) {
        throw new Error("Select an assigned repository for this upload.");
      }
      const bodyValues = { ...values };
      if (repositoryField && repositoryHref) {
        bodyValues.repository = repositoryHref;
      }
      const form = buildMultipartForm(fields, bodyValues, files);
      if (scoped) {
        if (!session?.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        await scopeUploadContent(endpoint!.path, repositoryHref, form, session.csrfToken);
        // The gateway waits for the task with its service account; scoped
        // sessions cannot read tasks, so never poll them from the browser.
        return;
      }
      const path = endpoint!.path.replace(/^\/pulp\/api\/v3\//, "");
      const response = await apiRequest<unknown>(path, {
        method: "POST",
        body: form,
      });
      if (isTaskResponse(response)) {
        await waitForTask(response.task);
      }
    },
    invalidation: [queryKeys.apiList.endpoint(contentType.key)],
    successMessage: "Content uploaded",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) => {
      if (caught instanceof ApiError) {
        setError(formatApiError(caught, "The content could not be uploaded."));
      } else {
        setError(caught instanceof Error ? caught.message : "The content could not be uploaded.");
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endpoint) {
      setError("This content type does not expose an upload endpoint.");
      return;
    }
    if (scoped && !repositoryHref) {
      setError("Select an assigned repository for this upload.");
      return;
    }
    setError(null);
    upload.mutate();
  }

  const unavailable = schema.isError || (schema.isSuccess && !multipart?.hasBinary);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Upload ${contentType.type}`}
      description="Upload content through the plugin's multipart endpoint. Required fields are generated from the live API schema."
      className="max-w-2xl"
      busy={upload.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={upload.isPending}>
            Cancel
          </Button>
          <SubmitButton
            form="content-upload-form"
            isSubmitting={upload.isPending}
            label="Upload content"
            busyLabel="Uploading…"
            icon={Upload}
            disabled={unavailable || !multipart?.hasBinary}
          />
        </>
      }
    >
      <form id="content-upload-form" className="space-y-4" onSubmit={handleSubmit}>
        {schema.isLoading ? (
          <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Spinner />
            Loading the content schema…
          </p>
        ) : unavailable ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            This content type does not expose a multipart upload endpoint. Use the API admin console
            for advanced content creation.
          </p>
        ) : (
          <>
            {repositoryField ? (
              <Combobox
                id="content-upload-repository"
                label="Repository"
                value={repositoryHref}
                onChange={setRepositoryHref}
                options={repositoryOptions}
                emptyLabel="No repository"
                searchValue={repositorySearchSearch.input}
                onSearchChange={repositorySearchSearch.setInput}
                searchPlaceholder="Search repositories…"
                isLoading={repositories.isLoading}
                isError={repositories.isError}
                onRetry={() => void repositories.refetch()}
                helper="Optional. Attach the uploaded content to a repository; otherwise it remains orphaned."
                hasMore={repositories.hasMore}
                loadedCount={repositoryOptions.length}
                totalCount={repositories.total}
                onLoadMore={repositories.loadMore}
                disabled={upload.isPending}
              />
            ) : null}

            <MultipartFields
              idPrefix="content-upload"
              fields={uploadFields}
              values={values}
              files={files}
              onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
              onFileChange={(name, file) => setFiles((current) => ({ ...current, [name]: file }))}
              disabled={upload.isPending}
            />
          </>
        )}
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
