import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DistributionMetadataFieldsProps {
  idPrefix: string;
  name: string;
  onNameChange: (value: string) => void;
  basePath: string;
  onBasePathChange: (value: string) => void;
  hidden: boolean;
  onHiddenChange: (value: boolean) => void;
  autoFocusName?: boolean;
}

/** Shared name/base-path/hidden fields for distribution create and edit. */
export function DistributionMetadataFields({
  idPrefix,
  name,
  onNameChange,
  basePath,
  onBasePathChange,
  hidden,
  onHiddenChange,
  autoFocusName = true,
}: DistributionMetadataFieldsProps) {
  const basePathHelpId = `${idPrefix}-base-path-help`;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          autoFocus={autoFocusName}
          required
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-base-path`}>Base path</Label>
        <Input
          id={`${idPrefix}-base-path`}
          required
          value={basePath}
          onChange={(event) => onBasePathChange(event.target.value)}
          className="font-mono"
          aria-describedby={basePathHelpId}
        />
        <p id={basePathHelpId} className="text-meta text-zinc-400 dark:text-zinc-500">
          Relative path under the content app. Do not include a leading slash.
        </p>
      </div>
      <CheckboxField
        checked={hidden}
        onChange={onHiddenChange}
        label="Hide from the content app"
        description="Hidden distributions remain available by direct URL but are not listed."
      />
    </>
  );
}
