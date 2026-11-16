import { PLUGINS } from "@/lib/plugins";

export interface PluginCatalogEntry {
  component: string;
  name: string;
  package: string;
  description: string;
}

/** Plugins that are not repository-content plugins but still appear in status. */
const EXTRA_PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    component: "certguard",
    name: "Certguard",
    package: "pulpcore",
    description: "X.509 certificate-based content guards (bundled with pulpcore)",
  },
  {
    component: "2to3_migration",
    name: "Pulp 2 to Pulp 3 migration",
    package: "pulp-2to3-migration",
    description: "Migration tooling for moving content from Pulp 2 to Pulp 3",
  },
  {
    component: "ostree",
    name: "OSTree",
    package: "pulp-ostree",
    description: "OSTree commits and refs",
  },
];

/**
 * Known Pulp plugin components. Enabled components come from `/status/`; this
 * catalog explains known plugins that are not installed in the running image.
 */
export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  ...PLUGINS.map((plugin) => ({
    component: plugin.component,
    name: plugin.label,
    package: plugin.package,
    description: plugin.description,
  })),
  ...EXTRA_PLUGIN_CATALOG,
];
