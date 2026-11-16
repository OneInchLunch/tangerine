/** Provider create/edit dialog and its field sections. */

import type { ProviderProbeResult, SsoProviderConfig } from "@/api/gateway";
import type { Group, Role } from "@/api/types";
import { FormError, InlineAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { DetailRow } from "@/components/ui/detail-row";
import { IconButton } from "@/components/ui/icon-button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  useAllList,
  useCreateProvider,
  useProbeIssuer,
  useSecretCheck,
  useUpdateProvider,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast-store";
import { isDirtyValue } from "@/lib/use-form-state";
import { SSO_PROVIDER_ID_PATTERN } from "@/lib/validation";
import { KeyRound, Play, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { AccessRulesEditor } from "./access-rules-editor";
import { CopyButton } from "./cards";
import {
  applyKind,
  applyPreset,
  buildPayload,
  callbackNeedsHttps,
  emptyForm,
  formFromProvider,
  microsoftIssuer,
  tenantIdFromIssuer,
  updateMapping,
  PROVIDER_KINDS,
  PROVIDER_PRESETS,
  USERNAME_CLAIMS,
  type MappingRow,
  type ProviderFormState,
  type ProviderPreset,
} from "./presets";

const GRAPH_SCOPES = new Set([
  "user.read",
  "groupmember.read.all",
  "group.read.all",
  "directory.read.all",
]);

function hasMicrosoftGraphScope(scopes: string): boolean {
  return scopes
    .split(/\s+/)
    .filter(Boolean)
    .some((scope) => GRAPH_SCOPES.has(scope.toLowerCase()));
}

export function MappingEditor({
  label,
  addLabel,
  help,
  rows,
  onChange,
  suggestions,
  sourcePlaceholder,
  targetPlaceholder,
}: {
  label: string;
  addLabel: string;
  help: string;
  rows: MappingRow[];
  onChange: (rows: MappingRow[]) => void;
  suggestions: string[];
  sourcePlaceholder: string;
  targetPlaceholder: string;
}) {
  const listId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { source: "", target: "" }])}
        >
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-meta text-zinc-400 dark:text-zinc-500">No mappings configured.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label={`${label} source ${index + 1}`}
                value={row.source}
                placeholder={sourcePlaceholder}
                onChange={(event) =>
                  onChange(updateMapping(rows, index, { source: event.target.value }))
                }
              />
              <Combobox
                id={`${listId}-target-${index}`}
                label={`${label} target ${index + 1}`}
                value={row.target}
                onChange={(next) => onChange(updateMapping(rows, index, { target: next }))}
                options={suggestions.map((value) => ({ value, label: value }))}
                placeholder={targetPlaceholder}
                pinnedLabel={row.target || targetPlaceholder}
                allowCustom
                customLabel={(query) => `Use “${query}”`}
                hideLabel
              />
              <IconButton
                label={`Remove ${label} row ${index + 1}`}
                icon={Trash2}
                tone="danger"
                onClick={() => onChange(rows.filter((_, current) => current !== index))}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-meta text-zinc-400 dark:text-zinc-500">{help}</p>
    </div>
  );
}

export function ProviderDialog({
  provider,
  secretFiles,
  csrfToken,
  callbackUrl,
  onClose,
}: {
  provider: SsoProviderConfig | null;
  secretFiles: string[];
  csrfToken: string;
  callbackUrl: string;
  onClose: () => void;
}) {
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const probe = useProbeIssuer();
  const groups = useAllList<Group>("groups");
  const roles = useAllList<Role>("roles");
  const [form, setForm] = useState<ProviderFormState>(
    provider ? formFromProvider(provider) : emptyForm(),
  );
  const [initialForm] = useState<ProviderFormState>(() =>
    provider ? formFromProvider(provider) : emptyForm(),
  );
  const secretCheck = useSecretCheck(form.secretFile, true);
  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<ProviderProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const isEdit = provider !== null;
  const busy = create.isPending || update.isPending;
  const groupSuggestions = (groups.data?.results ?? []).map((group) => group.name);
  const roleSuggestions = (roles.data?.results ?? []).map((role) => `${role.name}//`);
  const groupNames = new Set(groupSuggestions);
  const roleNames = new Set((roles.data?.results ?? []).map((role) => role.name));

  function patch(changes: Partial<ProviderFormState>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function convertGroupMappings() {
    const converted = form.groupMappings
      .map((row) => ({
        claim: "groups" as const,
        match: row.source.trim(),
        group: row.target.trim(),
        roles: [],
      }))
      .filter((row) => row.match && row.group);
    patch({
      accessRules: [...form.accessRules, ...converted],
      groupMappings: [],
    });
  }

  async function handleProbe() {
    const issuer = form.issuer.trim();
    setProbeError(null);
    setProbeResult(null);
    if (!issuer) {
      setProbeError("Enter an issuer URL first.");
      return;
    }
    try {
      setProbeResult(await probe.mutateAsync(issuer));
    } catch (caught) {
      setProbeError(errorMessage(caught, "Discovery failed."));
    }
  }

  function applyDiscoveredIssuer() {
    if (!probeResult?.issuer) {
      return;
    }
    if (probeResult.issuer.includes("{tenantid}")) {
      setProbeError(
        "Use a common/organizations issuer with an allowed tenant list instead of the template.",
      );
      return;
    }
    patch({
      issuer: probeResult.issuer,
      tenantId: tenantIdFromIssuer(probeResult.issuer),
    });
    setProbeResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      for (const row of form.groupMappings) {
        const target = row.target.trim();
        if (target && groupNames.size > 0 && !groupNames.has(target)) {
          throw new Error(`Group mapping target ${target} is not a known Pulp group.`);
        }
      }
      for (const row of form.roleMappings) {
        const target = row.target.trim();
        const role = target.split("/", 1)[0] ?? "";
        if (role && roleNames.size > 0 && !roleNames.has(role)) {
          throw new Error(`Role mapping target ${target} does not start with a known Pulp role.`);
        }
      }
      const payload = buildPayload(form);
      if (isEdit) {
        await update.mutateAsync({
          providerId: provider.id,
          payload,
          csrfToken,
        });
      } else {
        await create.mutateAsync({ payload, csrfToken });
      }
      toast.success(isEdit ? "Provider updated" : "Provider added");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "Unable to save the provider."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      dirty={isDirtyValue(form, initialForm)}
      title={isEdit ? `Edit ${provider.label}` : "Add identity provider"}
      description={
        isEdit
          ? "Client secrets stay in Kubernetes Secrets; this form only references the file name."
          : "Register the provider in your identity service first, then reference its client secret file here."
      }
      footer={
        <>
          <ModalCancelButton disabled={busy}>Cancel</ModalCancelButton>
          <SubmitButton
            form="provider-form"
            isSubmitting={busy}
            label={isEdit ? "Save changes" : "Add provider"}
            busyLabel="Saving…"
            icon={KeyRound}
            disabled={
              !csrfToken || !form.label.trim() || !form.issuer.trim() || !form.clientId.trim()
            }
          />
        </>
      }
    >
      <form id="provider-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="provider-preset">Provider preset</Label>
          <Select
            id="provider-preset"
            value={form.preset}
            onChange={(event) => {
              const preset = event.target.value as ProviderPreset;
              setForm(applyPreset(preset, form));
            }}
          >
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </Select>
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            {PROVIDER_PRESETS.find((preset) => preset.value === form.preset)?.description}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="provider-id">Identifier</Label>
            <Input
              id="provider-id"
              value={form.id}
              disabled={isEdit}
              required
              pattern={SSO_PROVIDER_ID_PATTERN}
              onChange={(event) => patch({ id: event.target.value })}
              placeholder="microsoft"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-label">Display name</Label>
            <Input
              id="provider-label"
              value={form.label}
              required
              onChange={(event) => patch({ label: event.target.value })}
              placeholder="Microsoft Entra ID"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="provider-kind">Kind</Label>
            <Select
              id="provider-kind"
              value={form.kind}
              onChange={(event) => setForm(applyKind(event.target.value, form))}
            >
              {PROVIDER_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-secret">Client secret file</Label>
            <Select
              id="provider-secret"
              value={form.secretFile}
              required
              onChange={(event) => patch({ secretFile: event.target.value })}
            >
              <option value="">Select a mounted secret…</option>
              {secretFiles.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </Select>
            {secretFiles.length === 0 ? (
              <p className="text-meta text-amber-700 dark:text-amber-400">
                No secrets are mounted. Create a Kubernetes Secret and mount it at the gateway's
                secret directory first.
              </p>
            ) : form.secretFile ? (
              <p
                className={
                  secretCheck.isError || secretCheck.data?.readable === false
                    ? "text-meta text-red-600 dark:text-red-400"
                    : "text-meta text-zinc-400 dark:text-zinc-500"
                }
              >
                {secretCheck.isLoading || secretCheck.data === undefined
                  ? "Checking the selected secret…"
                  : secretCheck.isError
                    ? "The secret file could not be checked."
                    : secretCheck.data.readable
                      ? "Mounted and readable."
                      : "The selected secret file is not readable."}
              </p>
            ) : null}
          </div>
        </div>

        {(form.preset === "azuread" || form.kind === "azuread") && (
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <CheckboxField
              checked={form.multiTenant}
              onChange={(multiTenant) =>
                patch({
                  multiTenant,
                  issuer: multiTenant
                    ? "https://login.microsoftonline.com/common/v2.0"
                    : microsoftIssuer(form.tenantId),
                })
              }
              label="Multi-tenant Microsoft app"
              description="Accept users from an explicit allowlist of tenant GUIDs. Leave off for a single-tenant app."
            />
            {form.multiTenant ? (
              <div className="space-y-1.5">
                <Label htmlFor="provider-allowed-tenants">Allowed tenant GUIDs</Label>
                <Input
                  id="provider-allowed-tenants"
                  value={form.allowedTenants}
                  onChange={(event) => patch({ allowedTenants: event.target.value })}
                  placeholder="00000000-0000-0000-0000-000000000000, …"
                />
                <p className="text-meta text-zinc-400 dark:text-zinc-500">
                  Comma- or space-separated GUIDs. The issuer can be{" "}
                  <code className="font-mono">common</code> or{" "}
                  <code className="font-mono">organizations</code>; the gateway validates the token
                  <code className="font-mono">tid</code> against this list.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="provider-tenant">Microsoft tenant ID</Label>
                <Input
                  id="provider-tenant"
                  value={form.tenantId}
                  onChange={(event) => {
                    const tenantId = event.target.value;
                    patch({ tenantId, issuer: microsoftIssuer(tenantId) });
                  }}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
                <p className="text-meta text-zinc-400 dark:text-zinc-500">
                  Use the tenant GUID. Discovery returns a GUID issuer, and the gateway requires an
                  exact match; tenant domain names will not work.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="provider-issuer">Issuer URL</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleProbe()}
              disabled={probe.isPending || !form.issuer.trim()}
            >
              {probe.isPending ? <Spinner /> : <Play className="size-3.5" />}
              Test issuer
            </Button>
          </div>
          <Input
            id="provider-issuer"
            value={form.issuer}
            required
            onChange={(event) => patch({ issuer: event.target.value })}
            placeholder="https://login.microsoftonline.com/<tenant-guid>/v2.0"
          />
          <p className="text-meta text-zinc-400 dark:text-zinc-500">
            Discovery is read from{" "}
            <code className="font-mono">&lt;issuer&gt;/.well-known/openid-configuration</code>.
          </p>
          {probeError ? <FormError>{probeError}</FormError> : null}
          {probeResult && !probeResult.ok ? (
            <InlineAlert tone="danger" compact title="Discovery failed">
              {probeResult.detail ?? "The issuer could not be discovered."}
            </InlineAlert>
          ) : null}
          {probeResult?.ok ? (
            <div className="space-y-2 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
              <InlineAlert
                tone={probeResult.issuerMatches ? "success" : "warning"}
                compact
                title={probeResult.issuerMatches ? "Issuer matches" : "Issuer mismatch"}
              >
                {probeResult.issuerMatches
                  ? "Discovery reports the configured issuer."
                  : `Discovery reports ${probeResult.issuer}. Use it to avoid a login-time mismatch.`}
              </InlineAlert>
              <DetailRow label="Issuer" value={probeResult.issuer ?? "—"} mono />
              <DetailRow
                label="Authorization"
                value={probeResult.authorizationEndpoint ?? "—"}
                mono
              />
              <DetailRow label="Token" value={probeResult.tokenEndpoint ?? "—"} mono />
              <DetailRow label="JWKS" value={probeResult.jwksUri ?? "—"} mono />
              <DetailRow
                label="Token auth"
                value={(probeResult.tokenEndpointAuthMethods ?? []).join(", ") || "—"}
              />
              {!probeResult.issuerMatches ? (
                probeResult.issuerTemplate ? (
                  <InlineAlert tone="info" compact title="Multi-tenant Microsoft issuer">
                    Discovery reports a tenant template. Configure a common/organizations issuer
                    with allowed tenant GUIDs; the gateway validates the token tenant id.
                  </InlineAlert>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={applyDiscoveredIssuer}>
                    Use discovered issuer
                  </Button>
                )
              ) : probeResult.issuerTemplate ? (
                <InlineAlert tone="success" compact title="Multi-tenant issuer">
                  Tokens are accepted only for the tenant GUIDs in the allowlist.
                </InlineAlert>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="provider-callback">Redirect URI</Label>
          <div className="flex gap-2">
            <Input id="provider-callback" readOnly value={callbackUrl || "Unavailable"} />
            <CopyButton value={callbackUrl} label="Copy" />
          </div>
          {callbackNeedsHttps(callbackUrl, form.kind) ? (
            <InlineAlert tone="warning" compact title="This redirect URI is not HTTPS">
              Google and Microsoft normally require an HTTPS redirect URI. Use an HTTPS hostname or
              a localhost tunnel before registering this provider.
            </InlineAlert>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="provider-client">Client ID</Label>
            <Input
              id="provider-client"
              value={form.clientId}
              required
              onChange={(event) => patch({ clientId: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-scopes">Scopes</Label>
            <Input
              id="provider-scopes"
              value={form.scopes}
              onChange={(event) => patch({ scopes: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Username and claims
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider-username-claim">Username claim</Label>
              <Select
                id="provider-username-claim"
                value={form.usernameClaim}
                onChange={(event) => patch({ usernameClaim: event.target.value })}
              >
                {USERNAME_CLAIMS.map((claim) => (
                  <option key={claim.value} value={claim.value}>
                    {claim.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-username-prefix">Username prefix</Label>
              <Input
                id="provider-username-prefix"
                value={form.usernamePrefix}
                onChange={(event) => patch({ usernamePrefix: event.target.value })}
                placeholder={form.kind === "azuread" ? "ms-" : "google-"}
              />
            </div>
          </div>
          <CheckboxField
            checked={form.requireEmailVerified}
            onChange={(requireEmailVerified) => patch({ requireEmailVerified })}
            label="Require verified email usernames"
            description="Reject a login when the username comes from the email claim and email_verified is not true."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider-group-claim">Group claim path</Label>
              <Input
                id="provider-group-claim"
                value={form.groupClaim}
                onChange={(event) => patch({ groupClaim: event.target.value })}
                placeholder="groups"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-role-claim">Role claim path</Label>
              <Input
                id="provider-role-claim"
                value={form.roleClaim}
                onChange={(event) => patch({ roleClaim: event.target.value })}
                placeholder="roles"
              />
            </div>
          </div>
        </div>

        {form.kind === "azuread" ? (
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Microsoft group sync
            </h3>
            <CheckboxField
              checked={form.fetchGraphGroups}
              onChange={(fetchGraphGroups) => patch({ fetchGraphGroups })}
              label="Fetch overaged groups from Microsoft Graph"
              description="When Entra ID omits groups due to token overage, call /me/memberOf with the access token. Add a Graph scope and admin consent to the app registration."
            />
            <p className="text-meta text-zinc-400 dark:text-zinc-500">
              The access-rule group picker needs an app-only Graph{" "}
              <code className="font-mono">Group.Read.All</code> permission with admin consent.
              Overaged group lookup uses the delegated{" "}
              <code className="font-mono">GroupMember.Read.All</code> scope.
            </p>
            {form.fetchGraphGroups && !hasMicrosoftGraphScope(form.scopes) ? (
              <InlineAlert tone="warning" compact title="No Microsoft Graph scope">
                Add a Microsoft Graph scope such as{" "}
                <code className="font-mono">GroupMember.Read.All</code> so the gateway can request
                an access token for the overage lookup.
              </InlineAlert>
            ) : null}
          </div>
        ) : null}

        {form.kind === "google" ? (
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Google Workspace group sync
            </h3>
            <CheckboxField
              checked={form.fetchGoogleGroups}
              onChange={(fetchGoogleGroups) => patch({ fetchGoogleGroups })}
              label="Fetch Workspace groups with the Admin SDK"
              description="Requires a service account with domain-wide delegation and an admin who can read the Directory API."
            />
            {form.fetchGoogleGroups ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="provider-google-key">Service account file</Label>
                  <Select
                    id="provider-google-key"
                    value={form.googleServiceAccountFile}
                    onChange={(event) => patch({ googleServiceAccountFile: event.target.value })}
                  >
                    <option value="">Select a mounted secret…</option>
                    {secretFiles.map((file) => (
                      <option key={file} value={file}>
                        {file}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="provider-google-admin">Admin email</Label>
                  <Input
                    id="provider-google-admin"
                    value={form.googleAdminEmail}
                    onChange={(event) => patch({ googleAdminEmail: event.target.value })}
                    placeholder="admin@example.com"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {form.groupMappings.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
            <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Legacy group mappings
            </h3>
            <p className="text-meta text-amber-800 dark:text-amber-300">
              These predate access rules. Convert them to rules to manage group roles.
            </p>
            <ul className="space-y-1">
              {form.groupMappings.map((row, index) => (
                <li key={index} className="font-mono text-meta text-amber-900 dark:text-amber-200">
                  {row.source || "—"} → {row.target || "—"}
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="outline" onClick={convertGroupMappings}>
              Convert to access rules
            </Button>
          </div>
        ) : null}

        <AccessRulesEditor
          rows={form.accessRules}
          baselineGroup={form.baselineGroup}
          baselineRoles={form.baselineRoles}
          strictGroups={form.strictGroups}
          allowedEmailDomains={form.allowedEmailDomains}
          requireHostedDomain={form.requireHostedDomain}
          providerKind={form.kind}
          providerId={provider?.id}
          groupSuggestions={groupSuggestions}
          roleSuggestions={roleSuggestions}
          onChange={patch}
        />

        <MappingEditor
          label="Legacy role mappings"
          addLabel="Add legacy role mapping"
          help="Per-user roles from the IdP role claim. Access rules assign roles to groups; recreate this intent as an access rule where possible."
          rows={form.roleMappings}
          onChange={(roleMappings) => patch({ roleMappings })}
          suggestions={roleSuggestions}
          sourcePlaceholder="idp-role"
          targetPlaceholder="core.repository_admin//"
        />

        <CheckboxField
          checked={form.enabled}
          onChange={(enabled) => patch({ enabled })}
          label="Enabled"
          description="Disabled providers disappear from the login screen."
        />

        {error ? <FormError>{error}</FormError> : null}
      </form>
    </Modal>
  );
}

export function DeleteProviderModal({
  provider,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  provider: SsoProviderConfig;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <ConfirmDeleteModal
      open
      onClose={onClose}
      title={`Delete ${provider.label}?`}
      description="Active sessions for this provider stop working immediately. Their accounts and roles stay in place."
      itemName={provider.id}
      nameLabel="Provider identifier"
      confirmLabel="Delete provider"
      isDeleting={busy}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
