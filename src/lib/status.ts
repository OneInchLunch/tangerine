import type { Status } from "@/api/types";

/**
 * Pulp reports the platform component as `core`. Older documentation and
 * deployments sometimes call it `pulpcore`, so accept both spellings.
 */
export function coreComponent(
  status?: Pick<Status, "versions">,
): Status["versions"][number] | undefined {
  const versions = status?.versions ?? [];
  return (
    versions.find((item) => item.component === "core") ??
    versions.find((item) => item.component === "pulpcore")
  );
}

export function coreVersion(status?: Pick<Status, "versions">): string | undefined {
  return coreComponent(status)?.version;
}
