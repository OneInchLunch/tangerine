import type { Distribution, RepositoryDetail } from "@/api/types";
import { Button } from "@/components/ui/button";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import { DescriptorFields } from "@/components/ui/descriptor-fields";
import { DistributionMetadataFields } from "@/features/distributions/distribution-metadata-fields";
import { distributionTypeForRepository, uniqueDistributionDefaults } from "@/lib/distributions";
import {
  buildDescriptorBody,
  initialDescriptorValues,
  type DescriptorValues,
  FieldValueError,
} from "@/lib/field-descriptors";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  repositorySupportsAutopublishFromHref,
  repositorySupportsPublicationsFromHref,
} from "@/lib/repositories";
import { useApiMutation, usePulpWrite } from "@/hooks/use-api-mutation";
import { useAuth } from "@/auth/auth-context";
import { scopeCreateObject } from "@/api/gateway";
import { mutateAndWait } from "@/api/resources";
import { Plus, Power } from "lucide-react";
import { useState, type FormEvent } from "react";

export function CreateDistributionModal({
  repository,
  existingDistributions = [],
  onClose,
}: {
  repository: RepositoryDetail;
  existingDistributions?: Distribution[];
  onClose: () => void;
}) {
  const { session } = useAuth();
  const info = distributionTypeForRepository(repository.pulp_href);
  const [defaults] = useState(() =>
    uniqueDistributionDefaults(repository.name, existingDistributions),
  );
  const fields = info?.fields ?? [];
  const [name, setName] = useState(defaults.name);
  const [basePath, setBasePath] = useState(defaults.basePath);
  const [hidden, setHidden] = useState(false);
  const [advancedValues, setAdvancedValues] = useState<DescriptorValues>(() =>
    initialDescriptorValues(fields),
  );
  const [autopublishError, setAutopublishError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autopublishSupported = repositorySupportsAutopublishFromHref(repository.pulp_href);
  const publicationsSupported = repositorySupportsPublicationsFromHref(repository.pulp_href);

  const autopublish = usePulpWrite({
    method: "PATCH",
    path: repository.pulp_href ?? "",
    body: () => ({ autopublish: true }),
    invalidation: [queryKeys.repository(repository.pulp_href), queryKeys.repositories.all],
    successMessage: "Auto-publish enabled",
    errorMode: "inline",
    onError: (caught) =>
      setAutopublishError(
        caught instanceof Error ? caught.message : "Auto-publish could not be enabled.",
      ),
  });

  function enableAutopublish() {
    if (!repository.pulp_href) {
      return;
    }
    setAutopublishError(null);
    autopublish.mutate({});
  }

  const create = useApiMutation<unknown, Record<string, unknown>>({
    mutationFn: async (body) => {
      const resource = info?.resource ?? "";
      if (session?.capabilities?.repositoryAdmin) {
        if (!session.csrfToken) {
          throw new Error("The gateway session is missing its CSRF token.");
        }
        await scopeCreateObject(resource, body, session.csrfToken);
        return body;
      }
      return mutateAndWait(resource, { method: "POST", body });
    },
    invalidation: repository.pulp_href
      ? [
          queryKeys.repositoryDistributions(repository.pulp_href),
          queryKeys.apiList.endpoint("distributions"),
          queryKeys.counts.resource("distributions"),
        ]
      : [],
    successMessage: "Distribution created",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) =>
      setError(
        caught instanceof FieldValueError
          ? caught.message
          : errorMessage(caught, "Unable to create the distribution."),
      ),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!info || !repository.pulp_href) {
      return;
    }
    const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
    if (!name.trim() || !normalizedBasePath) {
      setError("Name and base path are required.");
      return;
    }

    setError(null);
    const advanced = buildDescriptorBody(fields, advancedValues);
    create.mutate({
      name: name.trim(),
      base_path: normalizedBasePath,
      repository: repository.pulp_href,
      hidden,
      ...advanced,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create distribution"
      description={
        info
          ? `Create a ${info.label} distribution for ${repository.name}.`
          : "This repository type does not have a compatible distribution type."
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <SubmitButton
            form="create-distribution-form"
            isSubmitting={create.isPending}
            label="Create distribution"
            busyLabel="Creating…"
            icon={Plus}
            disabled={!info || !name.trim() || !basePath.trim()}
          />
        </>
      }
    >
      <form id="create-distribution-form" className="space-y-4" onSubmit={handleSubmit}>
        {info ? null : (
          <p
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
          >
            Tangerine does not yet expose a distribution type for this repository plugin. Use the
            API admin console to create one.
          </p>
        )}
        {existingDistributions.length ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-meta text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
            This repository already has {existingDistributions.length}{" "}
            {existingDistributions.length === 1 ? "distribution" : "distributions"}. The defaults
            below avoid the existing names and base paths, and each distribution can serve the same
            repository independently.
          </p>
        ) : null}
        <DistributionMetadataFields
          idPrefix="create-distribution"
          name={name}
          onNameChange={setName}
          basePath={basePath}
          onBasePathChange={setBasePath}
          hidden={hidden}
          onHiddenChange={setHidden}
        />
        <DescriptorFields
          idPrefix="create-distribution-advanced"
          fields={fields}
          values={advancedValues}
          onChange={(key, value) => setAdvancedValues((current) => ({ ...current, [key]: value }))}
          disabled={create.isPending}
        />
        <p className="text-meta text-zinc-400 dark:text-zinc-500">
          The distribution is attached to this repository. You can switch it to a publication later
          from the distribution details page.
        </p>
        {autopublishSupported && !repository.autopublish ? (
          <InlineAlert
            tone="warning"
            title="Auto-publish is off for this repository"
            className="space-y-2 p-3"
          >
            <p className="text-meta">
              Pulp serves repository content through a publication. New versions are not published
              automatically, so this distribution can return 404 until the repository has a
              publication.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={enableAutopublish}
              disabled={autopublish.isPending || create.isPending}
            >
              {autopublish.isPending ? <Spinner /> : <Power className="size-3.5" />}
              {autopublish.isPending ? "Enabling…" : "Enable auto-publish"}
            </Button>
            <p className="text-meta">
              Auto-publish applies to future versions. Publish the current version from the
              repository page.
            </p>
            {autopublishError ? <FormError>{autopublishError}</FormError> : null}
          </InlineAlert>
        ) : null}
        {publicationsSupported && !autopublishSupported ? (
          <InlineAlert
            tone="info"
            title="This repository type does not support auto-publish"
            className="p-3"
          >
            Pulp creates publications manually for this plugin. After creating this distribution,
            sync or upload content and run Publish latest version from the repository page.
          </InlineAlert>
        ) : null}
        {!publicationsSupported ? (
          <InlineAlert
            tone="info"
            title="This repository type serves content directly"
            className="p-3"
          >
            Publications and auto-publish are not used by this plugin, so the distribution serves
            repository content without a publication step.
          </InlineAlert>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}
