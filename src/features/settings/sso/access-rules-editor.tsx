import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useProviderGroups } from "@/hooks/queries";
import type { Repository } from "@/api/types";
import { useLoadMoreList } from "@/hooks/queries";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ProviderFormState, RuleRow } from "./presets";

export const REPOSITORY_ADMIN_ROLE = "tangerine-repository-admin";

function RepositoryScopePicker({
  id,
  repositories,
  onAdd,
}: {
  id: string;
  repositories: Repository[];
  onAdd: (spec: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Repository scope</Label>
      <Select
        id={id}
        value=""
        onChange={(event) => {
          const prn = event.target.value;
          if (prn) {
            onAdd(`${REPOSITORY_ADMIN_ROLE}//${prn}`);
          }
        }}
      >
        <option value="">Add a repository to this rule…</option>
        {repositories.flatMap((repository) =>
          repository.prn
            ? [
                <option key={repository.prn} value={repository.prn}>
                  {repository.name}
                </option>,
              ]
            : [],
        )}
      </Select>
    </div>
  );
}

export const TIER_ROLE_PRESETS = [
  { value: "tangerine-viewer//", label: "Viewer (tangerine-viewer)" },
  { value: "tangerine-maintainer//", label: "Maintainer (tangerine-maintainer)" },
  { value: "tangerine-admin-read//", label: "Admin read (tangerine-admin-read)" },
  { value: "tangerine-repository-admin//", label: "Repository admin (tangerine-repository-admin)" },
];

/** Legacy global admin role: managed for compatibility, never offered as a new rule. */
const RETIRED_ROLE_NAMES = new Set(["tangerine-admin"]);

function roleOptions(roleSuggestions: string[]) {
  const values = new Map<string, string>();
  for (const preset of TIER_ROLE_PRESETS) {
    values.set(preset.value, preset.label);
  }
  for (const name of roleSuggestions) {
    if (RETIRED_ROLE_NAMES.has(name)) {
      continue;
    }
    const value = name.endsWith("//") ? name : `${name}//`;
    if (!values.has(value)) {
      values.set(value, value);
    }
  }
  return Array.from(values, ([value, label]) => ({ value, label }));
}

function RolePicker({
  id,
  label,
  values,
  onChange,
  roleSuggestions,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  roleSuggestions: string[];
}) {
  const [custom, setCustom] = useState("");
  const options = roleOptions(roleSuggestions);
  const selectedOptions = values
    .filter((value) => !options.some((option) => option.value === value))
    .map((value) => ({ value, label: value }));

  function addCustom() {
    const text = custom.trim();
    if (!text) {
      return;
    }
    if (!values.includes(text)) {
      onChange([...values, text]);
    }
    setCustom("");
  }

  return (
    <div className="space-y-2">
      <MultiCombobox
        id={id}
        label={label}
        values={values}
        onChange={onChange}
        options={options}
        selectedOptions={selectedOptions}
        placeholder="Select roles"
        emptyLabel="No roles"
        emptyMessage="No matching roles."
      />
      <div className="flex gap-2">
        <Input
          aria-label={`${label} custom role spec`}
          value={custom}
          placeholder="role/domain/prn"
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={addCustom}>
          Add role
        </Button>
      </div>
    </div>
  );
}

export function AccessRulesEditor({
  rows,
  baselineGroup,
  baselineRoles,
  strictGroups,
  allowedEmailDomains,
  requireHostedDomain,
  providerKind,
  providerId,
  groupSuggestions,
  roleSuggestions,
  onChange,
}: {
  rows: RuleRow[];
  baselineGroup: string;
  baselineRoles: string[];
  strictGroups: boolean;
  allowedEmailDomains: string;
  requireHostedDomain: boolean;
  providerKind: string;
  providerId?: string;
  groupSuggestions: string[];
  roleSuggestions: string[];
  onChange: (patch: Partial<ProviderFormState>) => void;
}) {
  const groupOptions = groupSuggestions.map((name) => ({ value: name, label: name }));
  const providerGroups = useProviderGroups(providerId);
  const repositories = useLoadMoreList<Repository>(
    "repositories",
    { ordering: "name", fields: "name,prn" },
    { pageSize: 50 },
  );
  const idpOptions = (providerGroups.data?.groups ?? []).map((group) => ({
    value: group.id,
    label: group.label,
  }));
  const canSearchIdp =
    Boolean(providerId) && (providerKind === "google" || providerKind === "azuread");
  const idpPlaceholder =
    providerKind === "azuread" ? "Entra group GUID or app role" : "idp-group@example.com";

  function patchRule(index: number, changes: Partial<RuleRow>) {
    onChange({
      accessRules: rows.map((row, current) => (current === index ? { ...row, ...changes } : row)),
    });
  }

  function setBaselineGroup(value: string) {
    const patch: Partial<ProviderFormState> = { baselineGroup: value };
    if (!baselineGroup && value && baselineRoles.length === 0) {
      patch.baselineRoles = ["tangerine-viewer//"];
    }
    onChange(patch);
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Access rules</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              accessRules: [...rows, { claim: "groups", match: "", group: "", roles: [] }],
            })
          }
        >
          <Plus className="size-3.5" />
          Add rule
        </Button>
      </div>
      <p className="text-meta text-zinc-400 dark:text-zinc-500">
        Map an IdP claim value to a Pulp group, and attach roles to that group. Roles marked Viewer,
        Maintainer, or Admin use the managed tangerine roles.
      </p>

      {rows.length === 0 ? (
        <p className="text-meta text-zinc-400 dark:text-zinc-500">No access rules configured.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`rule-claim-${index}`}>Claim</Label>
                  <Select
                    id={`rule-claim-${index}`}
                    value={row.claim}
                    onChange={(event) =>
                      patchRule(index, {
                        claim: event.target.value === "roles" ? "roles" : "groups",
                      })
                    }
                  >
                    <option value="groups">Groups</option>
                    <option value="roles">Roles</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-match-${index}`}>IdP value</Label>
                  {canSearchIdp ? (
                    <Combobox
                      id={`rule-match-${index}`}
                      label="IdP value"
                      value={row.match}
                      onChange={(value) => patchRule(index, { match: value })}
                      options={idpOptions}
                      placeholder={idpPlaceholder}
                      pinnedLabel={row.match || idpPlaceholder}
                      allowCustom
                      customLabel={(query) => `Use “${query}”`}
                      isLoading={providerGroups.isLoading}
                      isError={providerGroups.isError}
                      onRetry={() => void providerGroups.refetch()}
                      helper={
                        providerGroups.isError
                          ? "Could not load IdP groups; type the value instead."
                          : undefined
                      }
                      hideLabel
                    />
                  ) : (
                    <Input
                      id={`rule-match-${index}`}
                      value={row.match}
                      placeholder={idpPlaceholder}
                      onChange={(event) => patchRule(index, { match: event.target.value })}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`rule-group-${index}`}>Pulp group</Label>
                  <Combobox
                    id={`rule-group-${index}`}
                    label="Pulp group"
                    value={row.group}
                    onChange={(value) => patchRule(index, { group: value })}
                    options={groupOptions}
                    placeholder="pulp-group"
                    pinnedLabel={row.group || "pulp-group"}
                    allowCustom
                    customLabel={(query) => `Use “${query}”`}
                    hideLabel
                  />
                </div>
                <div className="flex items-end">
                  <IconButton
                    label={`Remove access rule ${index + 1}`}
                    icon={Trash2}
                    tone="danger"
                    onClick={() =>
                      onChange({
                        accessRules: rows.filter((_, current) => current !== index),
                      })
                    }
                  />
                </div>
              </div>
              <RolePicker
                id={`rule-roles-${index}`}
                label={`Roles for ${row.group || `rule ${index + 1}`}`}
                values={row.roles}
                onChange={(roles) => patchRule(index, { roles })}
                roleSuggestions={roleSuggestions}
              />
              <RepositoryScopePicker
                id={`rule-repository-${index}`}
                repositories={repositories.data?.results ?? []}
                onAdd={(spec) =>
                  patchRule(index, {
                    roles: row.roles.includes(spec) ? row.roles : [...row.roles, spec],
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Baseline access</h4>
        <div className="space-y-1">
          <Label htmlFor="baseline-group">Baseline group</Label>
          <Combobox
            id="baseline-group"
            label="Baseline group"
            value={baselineGroup}
            onChange={setBaselineGroup}
            options={groupOptions}
            placeholder="sso-users"
            pinnedLabel={baselineGroup || "sso-users"}
            allowCustom
            customLabel={(query) => `Use “${query}”`}
            emptyLabel="No baseline group"
          />
        </div>
        <RolePicker
          id="baseline-roles"
          label="Baseline roles"
          values={baselineRoles}
          onChange={(roles) => onChange({ baselineRoles: roles })}
          roleSuggestions={roleSuggestions}
        />
        <CheckboxField
          checked={strictGroups}
          onChange={(value) => onChange({ strictGroups: value })}
          label="Strict group membership"
          description="Remove every group not declared by these rules, the baseline, or the marker group when the group claim is present. Groups listed in TANGERINE_PROTECTED_GROUPS are never removed."
        />
      </div>

      <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          Domain restriction
        </h4>
        <div className="space-y-1">
          <Label htmlFor="allowed-email-domains">Allowed email/UPN domains</Label>
          <Input
            id="allowed-email-domains"
            value={allowedEmailDomains}
            placeholder="example.com, example.org"
            onChange={(event) => onChange({ allowedEmailDomains: event.target.value })}
          />
        </div>
        {providerKind === "google" ? (
          <CheckboxField
            checked={requireHostedDomain}
            onChange={(value) => onChange({ requireHostedDomain: value })}
            label="Require a matching Google hosted domain (hd)"
            description="Rejects personal Google accounts. The hd request parameter is sent only when exactly one domain is configured."
          />
        ) : null}
        <p className="text-meta text-zinc-400 dark:text-zinc-500">
          Empty means no restriction. The check runs before any user, group, or role write, and the
          preview shows the rejection.
        </p>
      </div>
    </div>
  );
}
