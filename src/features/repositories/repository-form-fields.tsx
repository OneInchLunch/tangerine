import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RepositoryAutopublishSupport } from "@/lib/repositories";
import { RepositoryRemoteSelect } from "./repository-remote-select";
import { RepositorySigningField } from "./repository-signing-field";

export interface RepositoryFormValue {
  name: string;
  description: string;
  remote: string;
  autopublish: boolean;
  metadataSigningService: string;
}

interface RepositoryFormFieldsProps {
  idPrefix: string;
  value: RepositoryFormValue;
  onChange: (changes: Partial<RepositoryFormValue>) => void;
  repositoryType: string;
  autopublishSupport?: RepositoryAutopublishSupport;
  disabled?: boolean;
  nameHint?: string;
  namePattern?: string;
}

/**
 * Shared name/description/remote/auto-publish fields used by both the create
 * repository dialog and the repository edit dialog.
 */
export function RepositoryFormFields({
  idPrefix,
  value,
  onChange,
  repositoryType,
  autopublishSupport,
  disabled,
  nameHint,
  namePattern,
}: RepositoryFormFieldsProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          autoFocus
          required
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="e.g. production-rpms"
          pattern={namePattern}
        />
        {nameHint ? <p className="text-meta text-zinc-400 dark:text-zinc-500">{nameHint}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={3}
          placeholder="Optional description"
        />
      </div>

      <RepositoryRemoteSelect
        id={`${idPrefix}-remote`}
        repositoryType={repositoryType}
        value={value.remote}
        onChange={(remote) => onChange({ remote })}
        disabled={disabled}
      />

      {autopublishSupport ? (
        <CheckboxField
          checked={value.autopublish}
          onChange={(autopublish) => onChange({ autopublish })}
          label="Publish new versions automatically"
          description={
            <>
              Pulp creates a publication for every new repository version and updates distributions
              that serve this repository. It applies to versions created after the setting is
              enabled
              {autopublishSupport.deprecated
                ? "; Pulp marks this option deprecated for Python repositories."
                : "."}
            </>
          }
        />
      ) : null}

      {repositoryType === "rpm" ? (
        <RepositorySigningField
          idPrefix={idPrefix}
          value={value.metadataSigningService}
          onChange={(metadataSigningService) => onChange({ metadataSigningService })}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}
