import type { ProviderPayload, ProviderTestResult, SsoProviderConfig } from "@/api/gateway";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/lib/toast-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminCsrf,
  useCreateProvider,
  useDeleteProvider,
  useGatewayBootstrap,
  useGatewayDiagnostics,
  useProviderConfigs,
  useSecretFiles,
  useTestProvider,
  useUpdateProvider,
} from "@/hooks/queries";
import { DeleteProviderModal, ProviderDialog } from "./sso/provider-dialog";
import {
  AccessPoliciesCard,
  BootstrapCard,
  DiagnosticsCard,
  SecurityActivityCard,
} from "./sso/cards";
import { errorMessage } from "@/lib/errors";
import { getConfig } from "@/lib/config";
import { gatewayPath } from "@/lib/sso";
import {
  ArrowDown,
  Download,
  ArrowUp,
  ExternalLink,
  Pencil,
  Play,
  Power,
  PowerOff,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

export function SsoPanel() {
  const csrf = useAdminCsrf();
  const providers = useProviderConfigs();
  const secrets = useSecretFiles();
  const diagnostics = useGatewayDiagnostics();
  const bootstrap = useGatewayBootstrap();
  const test = useTestProvider();
  const create = useCreateProvider();
  const remove = useDeleteProvider();
  const update = useUpdateProvider();

  const [editing, setEditing] = useState<SsoProviderConfig | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<SsoProviderConfig | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; result: ProviderTestResult } | null>(
    null,
  );

  const csrfToken = csrf.data?.csrfToken ?? "";
  const canWrite = Boolean(csrfToken);
  const rows = providers.data ?? [];

  async function handleTest(provider: SsoProviderConfig) {
    try {
      const result = await test.mutateAsync({ providerId: provider.id, csrfToken });
      setTestResult({ id: provider.id, result });
    } catch (caught) {
      setTestResult({
        id: provider.id,
        result: { ok: false, detail: errorMessage(caught, "Discovery failed.") },
      });
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(providers.data ?? [], null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tangerine-providers.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    setImportError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        throw new Error("The import file must contain a JSON array of providers.");
      }
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") {
          throw new Error("Every imported provider must be a JSON object.");
        }
        const provider = entry as SsoProviderConfig;
        const payload: ProviderPayload = {
          label: provider.label,
          kind: provider.kind,
          issuer: provider.issuer,
          clientId: provider.clientId,
          secretFile: provider.secretFile,
          scopes: provider.scopes,
          groupClaim: provider.groupClaim,
          roleClaim: provider.roleClaim,
          usernameClaim: provider.usernameClaim,
          usernamePrefix: provider.usernamePrefix,
          requireEmailVerified: provider.requireEmailVerified,
          allowedTenants: provider.allowedTenants,
          fetchGraphGroups: provider.fetchGraphGroups,
          fetchGoogleGroups: provider.fetchGoogleGroups,
          googleServiceAccountFile: provider.googleServiceAccountFile,
          googleAdminEmail: provider.googleAdminEmail,
          groupMap: provider.groupMap,
          roleMap: provider.roleMap,
          accessRules: provider.accessRules ?? [],
          baselineGroup: provider.baselineGroup ?? "",
          baselineRoles: provider.baselineRoles ?? [],
          strictGroups: Boolean(provider.strictGroups),
          allowedEmailDomains: provider.allowedEmailDomains ?? [],
          requireHostedDomain: Boolean(provider.requireHostedDomain),
          enabled: provider.enabled,
          sortOrder: provider.sortOrder,
        };
        if (provider.id && rows.some((row) => row.id === provider.id)) {
          await update.mutateAsync({ providerId: provider.id, payload, csrfToken });
        } else {
          await create.mutateAsync({ payload: { ...payload, id: provider.id }, csrfToken });
        }
      }
      await providers.refetch();
      toast.success("Providers imported");
    } catch (caught) {
      setImportError(errorMessage(caught, "Unable to import providers."));
    }
  }

  async function handleDelete() {
    if (!deleting) {
      return;
    }
    setDeleteError(null);
    try {
      await remove.mutateAsync({ providerId: deleting.id, csrfToken });
      toast.success("Provider deleted");
      setDeleting(null);
    } catch (caught) {
      setDeleteError(errorMessage(caught, "Unable to delete the provider."));
    }
  }

  async function handleToggle(provider: SsoProviderConfig) {
    try {
      await update.mutateAsync({
        providerId: provider.id,
        payload: { enabled: !provider.enabled },
        csrfToken,
      });
      toast.success(provider.enabled ? "Provider disabled" : "Provider enabled");
    } catch (caught) {
      toast.error(errorMessage(caught, "The provider could not be updated."));
    }
  }

  async function handleMove(provider: SsoProviderConfig, delta: number) {
    const index = rows.findIndex((row) => row.id === provider.id);
    const other = rows[index + delta];
    if (index < 0 || !other) {
      return;
    }
    try {
      await Promise.all([
        update.mutateAsync({
          providerId: provider.id,
          payload: { sortOrder: index + delta },
          csrfToken,
        }),
        update.mutateAsync({
          providerId: other.id,
          payload: { sortOrder: index },
          csrfToken,
        }),
      ]);
    } catch (caught) {
      toast.error(errorMessage(caught, "The provider order could not be saved."));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Identity providers</CardTitle>
          <CardDescription>
            Providers are applied immediately. Adding one never restarts Pulp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
              <Download className="size-4" />
              Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => importInput.current?.click()}
              disabled={!canWrite}
            >
              <Upload className="size-4" />
              Import
            </Button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.target.value = "";
              }}
            />
          </div>
          {importError ? <FormError>{importError}</FormError> : null}
          {providers.isError ? (
            <InlineAlert tone="danger" compact title="Could not load identity providers">
              The gateway did not accept this browser as a Pulp administrator. If you recently
              signed in through SSO with a non-admin account, sign out and sign in again as a Pulp
              administrator.
            </InlineAlert>
          ) : null}
          {csrf.isError ? (
            <InlineAlert tone="danger" compact title="Administrator access required">
              Only a Pulp administrator can manage providers.
            </InlineAlert>
          ) : null}

          {testResult ? (
            <InlineAlert
              tone={testResult.result.ok ? "success" : "danger"}
              compact
              title={
                testResult.result.ok
                  ? `Discovery succeeded for ${testResult.id}`
                  : `Discovery failed for ${testResult.id}`
              }
            >
              {testResult.result.ok
                ? `${testResult.result.tokenEndpoint ?? ""}${
                    testResult.result.secretReadable === false
                      ? " — secret file is not readable"
                      : ""
                  }`
                : testResult.result.detail}
            </InlineAlert>
          ) : null}

          {rows.length === 0 && !providers.isLoading ? (
            <EmptyState
              icon={ShieldAlert}
              title="No providers configured"
              description="Add an identity provider to enable single sign-on. Password sign-in keeps working."
              action={
                <Button size="sm" onClick={() => setEditing(null)} disabled={!canWrite}>
                  <Plus className="size-4" />
                  Add provider
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setEditing(null)} disabled={!canWrite}>
                  <Plus className="size-4" />
                  Add provider
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="hidden md:table-cell">Issuer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((provider, index) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {provider.label}
                        </p>
                        <p className="text-meta font-mono text-zinc-500">{provider.id}</p>
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-xs md:table-cell">
                        {provider.issuer}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={provider.enabled ? "success" : "neutral"}>
                            {provider.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <Badge tone="info">{provider.kind}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton
                            label={`Move ${provider.label} up`}
                            title="Move up"
                            icon={ArrowUp}
                            disabled={!canWrite || index === 0}
                            onClick={() => void handleMove(provider, -1)}
                          />
                          <IconButton
                            label={`Move ${provider.label} down`}
                            title="Move down"
                            icon={ArrowDown}
                            disabled={!canWrite || index === rows.length - 1}
                            onClick={() => void handleMove(provider, 1)}
                          />
                          <IconButton
                            label={`Test ${provider.label}`}
                            title="Test discovery"
                            icon={Play}
                            disabled={!canWrite}
                            onClick={() => void handleTest(provider)}
                          />
                          <IconButton
                            label={`Preview login for ${provider.label}`}
                            title="Preview login without changes"
                            icon={ExternalLink}
                            onClick={() => {
                              const config = getConfig();
                              const url = `${gatewayPath(config, "start")}?${new URLSearchParams({
                                provider: provider.id,
                                preview: "1",
                              }).toString()}`;
                              window.open(url, "_blank", "noopener,noreferrer");
                            }}
                          />
                          <IconButton
                            label={`Edit ${provider.label}`}
                            icon={Pencil}
                            disabled={!canWrite}
                            onClick={() => setEditing(provider)}
                          />
                          <IconButton
                            label={`${provider.enabled ? "Disable" : "Enable"} ${provider.label}`}
                            title={provider.enabled ? "Disable" : "Enable"}
                            icon={provider.enabled ? PowerOff : Power}
                            disabled={!canWrite}
                            onClick={() => void handleToggle(provider)}
                          />
                          <IconButton
                            label={`Delete ${provider.label}`}
                            icon={Trash2}
                            disabled={!canWrite}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(provider);
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <AccessPoliciesCard />
      <BootstrapCard />
      <DiagnosticsCard diagnostics={diagnostics.data} />
      <SecurityActivityCard />

      {editing !== undefined ? (
        <ProviderDialog
          provider={editing}
          secretFiles={secrets.data ?? []}
          csrfToken={csrfToken}
          callbackUrl={bootstrap.data?.callbackUrl ?? diagnostics.data?.callbackUrl ?? ""}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      {deleting ? (
        <DeleteProviderModal
          provider={deleting}
          busy={remove.isPending}
          error={deleteError}
          onClose={() => setDeleting(null)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}
