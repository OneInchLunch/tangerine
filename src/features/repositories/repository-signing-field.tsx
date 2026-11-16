import type { SigningService } from "@/api/types";
import { useCanConfigureSigning } from "@/hooks/use-can-configure-signing";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLoadMoreList } from "@/hooks/queries";

interface RepositorySigningFieldProps {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * RPM repository-metadata signing.
 *
 * Only superusers may attach a signing service: the key is an instance-level
 * trust anchor, and selecting a service is effectively granting the ability to
 * have metadata signed. Package signing is deliberately not exposed.
 */
export function RepositorySigningField({
  idPrefix,
  value,
  onChange,
  disabled,
}: RepositorySigningFieldProps) {
  const canConfigure = useCanConfigureSigning();
  const services = useLoadMoreList<SigningService>(
    "signing-services",
    { ordering: "name" },
    { enabled: canConfigure, pageSize: 100 },
  );

  if (!canConfigure) {
    return null;
  }

  const options = services.data?.results ?? [];
  const selected = options.find((service) => service.pulp_href === value);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-metadata-signing-service`}>Metadata signing service</Label>
      <Select
        id={`${idPrefix}-metadata-signing-service`}
        value={value}
        disabled={disabled || services.isLoading}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No signing service</option>
        {options.flatMap((service) =>
          service.pulp_href ? (
            <option key={service.pulp_href} value={service.pulp_href}>
              {service.name}
            </option>
          ) : (
            []
          ),
        )}
      </Select>
      <p className="text-meta text-zinc-400 dark:text-zinc-500">
        Signs <code className="font-mono">repomd.xml</code> when this repository is published.
        Package signing is not offered: it would sign any uploaded RPM with the instance key.
      </p>
      {selected?.pubkey_fingerprint ? (
        <p className="font-mono text-micro text-zinc-400 dark:text-zinc-500">
          {selected.pubkey_fingerprint}
        </p>
      ) : null}
      {!services.isLoading && options.length === 0 ? (
        <p className="text-meta text-amber-600 dark:text-amber-400">
          No signing service is registered on the Pulp host.
        </p>
      ) : null}
    </div>
  );
}
