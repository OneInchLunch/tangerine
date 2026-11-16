import type { FieldDescriptor } from "@/lib/field-descriptors";

export type PluginTone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

export interface DistributionDefinition {
  apiPath: string;
  /** User-facing distribution label, which can differ from the repository label. */
  label: string;
  publicationTypes: string[];
  /** Curated plugin-specific settings exposed by the distribution forms. */
  fields?: FieldDescriptor[];
}

export interface PublicationDefinition {
  apiPath: string;
  types: string[];
  labels: Record<string, string>;
  /** Curated custom settings exposed when creating a publication. */
  fields?: FieldDescriptor[];
}

export interface PluginDefinition {
  /** Repository type id, also used by the plugin catalog. */
  id: string;
  component: string;
  label: string;
  package: string;
  description: string;
  tone: PluginTone;
  repository: { apiPath: string };
  distribution?: DistributionDefinition;
  publication?: PublicationDefinition;
  autopublish?: { deprecated: boolean };
  /** `pulp_type` values used by the combined repositories list filter. */
  repositoryFilterTypes: string[];
  /** `pulp_type` values used by the combined remotes list filter. */
  remoteFilterTypes: string[];
}

/**
 * Single source of truth for plugin capabilities. Repository, distribution,
 * publication, remote, badge, and catalog metadata all derive from this table.
 */
export const PLUGINS: PluginDefinition[] = [
  {
    id: "ansible",
    component: "ansible",
    label: "Ansible",
    package: "pulp-ansible",
    description: "Ansible collections, roles, and execution environments",
    tone: "warning",
    repository: { apiPath: "repositories/ansible/ansible/" },
    repositoryFilterTypes: ["ansible.ansible"],
    distribution: {
      apiPath: "distributions/ansible/ansible/",
      label: "Ansible",
      publicationTypes: [],
    },
    remoteFilterTypes: ["ansible.collection", "ansible.git", "ansible.role"],
  },
  {
    id: "container",
    component: "container",
    label: "Container",
    package: "pulp-container",
    description: "OCI container images, manifests, and tags",
    tone: "info",
    repository: { apiPath: "repositories/container/container/" },
    repositoryFilterTypes: ["container.container"],
    distribution: {
      apiPath: "distributions/container/container/",
      label: "Container",
      publicationTypes: [],
      fields: [
        {
          key: "private",
          label: "Private distribution",
          type: "boolean",
          help: "Restrict pull access to explicitly authorized users.",
        },
        {
          key: "description",
          label: "Description",
          type: "text",
          help: "Optional description shown in the distribution settings.",
        },
      ],
    },
    // container.pull-through is a valid remote but cannot be attached to a
    // container repository.
    remoteFilterTypes: ["container.container"],
  },
  {
    id: "deb",
    component: "deb",
    label: "Debian",
    package: "pulp-deb",
    description: "Debian and Ubuntu packages and repository metadata",
    tone: "neutral",
    repository: { apiPath: "repositories/deb/apt/" },
    repositoryFilterTypes: ["deb.deb"],
    distribution: {
      apiPath: "distributions/deb/apt/",
      label: "Debian APT",
      publicationTypes: ["deb.apt", "deb.verbatim"],
      fields: [{ key: "checkpoint", label: "Checkpoint publication", type: "boolean" }],
    },
    publication: {
      apiPath: "publications/deb/apt/",
      types: ["deb.apt", "deb.verbatim"],
      labels: { "deb.apt": "Debian APT", "deb.verbatim": "Debian verbatim" },
      fields: [
        {
          key: "simple",
          label: "Simple publishing",
          type: "boolean",
          help: "Publish all packages in one release component.",
        },
        {
          key: "structured",
          label: "Structured publishing",
          type: "boolean",
          help: "Publish packages with structured metadata.",
        },
        {
          key: "signing_service",
          label: "Signing service",
          type: "signing-service",
          help: "Sign Release files with the selected signing service.",
        },
        {
          key: "publish_upstream_release_fields",
          label: "Publish upstream Release fields",
          type: "boolean",
        },
        {
          key: "publish_legacy_release_files",
          label: "Publish legacy Release files",
          type: "boolean",
        },
        {
          key: "excluded_package_metadata_fields",
          label: "Excluded package metadata fields",
          type: "string-list",
          placeholder: "Phased-Update-Percentage",
          help: "Comma- or newline-separated field names to omit from Packages indices.",
        },
        {
          key: "layout",
          label: "Layout",
          type: "select",
          options: [
            { value: "nested_alphabetically", label: "Nested alphabetically" },
            { value: "nested_by_digest", label: "Nested by digest" },
            { value: "nested_by_both", label: "Nested by both" },
          ],
        },
        { key: "checkpoint", label: "Checkpoint publication", type: "boolean" },
      ],
    },
    autopublish: { deprecated: false },
    remoteFilterTypes: ["deb.apt-remote"],
  },
  {
    id: "file",
    component: "file",
    label: "File",
    package: "pulpcore",
    description: "Generic file content (bundled with pulpcore)",
    tone: "brand",
    repository: { apiPath: "repositories/file/file/" },
    repositoryFilterTypes: ["file.file"],
    distribution: {
      apiPath: "distributions/file/file/",
      label: "File",
      publicationTypes: ["file.file"],
      fields: [{ key: "checkpoint", label: "Checkpoint publication", type: "boolean" }],
    },
    publication: {
      apiPath: "publications/file/file/",
      types: ["file.file"],
      labels: { "file.file": "File" },
      fields: [
        {
          key: "manifest",
          label: "Manifest filename",
          type: "text",
          placeholder: "PULP_MANIFEST",
          help: "Filename for the manifest that lists all files.",
        },
        { key: "checkpoint", label: "Checkpoint publication", type: "boolean" },
      ],
    },
    autopublish: { deprecated: false },
    remoteFilterTypes: ["file.file", "file.git"],
  },
  {
    id: "gem",
    component: "gem",
    label: "Gem",
    package: "pulp-gem",
    description: "Ruby gems and gem repository metadata",
    tone: "warning",
    repository: { apiPath: "repositories/gem/gem/" },
    repositoryFilterTypes: ["gem.gem"],
    distribution: {
      apiPath: "distributions/gem/gem/",
      label: "Gem",
      publicationTypes: ["gem.gem"],
    },
    publication: {
      apiPath: "publications/gem/gem/",
      types: ["gem.gem"],
      labels: { "gem.gem": "Gem" },
    },
    remoteFilterTypes: ["gem.gem"],
  },
  {
    id: "hugging_face",
    component: "hugging_face",
    label: "Hugging Face",
    package: "pulp-hugging-face",
    description: "Hugging Face models and datasets",
    tone: "success",
    repository: { apiPath: "repositories/hugging_face/hugging-face/" },
    repositoryFilterTypes: ["hugging_face.hugging-face"],
    distribution: {
      apiPath: "distributions/hugging_face/hugging-face/",
      label: "Hugging Face",
      publicationTypes: [],
    },
    remoteFilterTypes: ["hugging_face.hugging-face"],
  },
  {
    id: "maven",
    component: "maven",
    label: "Maven",
    package: "pulp-maven",
    description: "Maven artifacts and repository metadata",
    tone: "info",
    repository: { apiPath: "repositories/maven/maven/" },
    repositoryFilterTypes: ["maven.maven"],
    distribution: {
      apiPath: "distributions/maven/maven/",
      label: "Maven",
      publicationTypes: [],
    },
    remoteFilterTypes: ["maven.maven"],
  },
  {
    id: "npm",
    component: "npm",
    label: "NPM",
    package: "pulp-npm",
    description: "npm packages and registry metadata",
    tone: "danger",
    repository: { apiPath: "repositories/npm/npm/" },
    repositoryFilterTypes: ["npm.npm"],
    distribution: {
      apiPath: "distributions/npm/npm/",
      label: "NPM",
      publicationTypes: [],
    },
    remoteFilterTypes: ["npm.npm"],
  },
  {
    id: "python",
    component: "python",
    label: "Python",
    package: "pulp-python",
    description: "Python packages, wheels, and distribution metadata",
    tone: "success",
    repository: { apiPath: "repositories/python/python/" },
    repositoryFilterTypes: ["python.python"],
    distribution: {
      apiPath: "distributions/python/pypi/",
      label: "Python",
      publicationTypes: ["python.pypi"],
      fields: [
        {
          key: "allow_uploads",
          label: "Allow uploads",
          type: "boolean",
          help: "Allow packages to be uploaded through this index.",
        },
      ],
    },
    publication: {
      apiPath: "publications/python/pypi/",
      types: ["python.pypi"],
      labels: { "python.pypi": "Python" },
    },
    autopublish: { deprecated: true },
    remoteFilterTypes: ["python.python"],
  },
  {
    id: "rpm",
    component: "rpm",
    label: "RPM",
    package: "pulp-rpm",
    description: "RPM packages, advisories, and repository metadata",
    tone: "danger",
    repository: { apiPath: "repositories/rpm/rpm/" },
    repositoryFilterTypes: ["rpm.rpm"],
    distribution: {
      apiPath: "distributions/rpm/rpm/",
      label: "RPM",
      publicationTypes: ["rpm.rpm"],
      fields: [
        {
          key: "generate_repo_config",
          label: "Generate .repo files",
          type: "boolean",
          help: "Ask Pulp to generate client repository configuration files.",
        },
        { key: "checkpoint", label: "Checkpoint publication", type: "boolean" },
      ],
    },
    publication: {
      apiPath: "publications/rpm/rpm/",
      types: ["rpm.rpm"],
      labels: { "rpm.rpm": "RPM" },
      fields: [
        {
          key: "checksum_type",
          label: "Package checksum",
          type: "select",
          options: [
            { value: "sha256", label: "SHA-256" },
            { value: "sha512", label: "SHA-512" },
            { value: "sha1", label: "SHA-1" },
            { value: "sha224", label: "SHA-224" },
            { value: "sha384", label: "SHA-384" },
            { value: "md5", label: "MD5" },
          ],
        },
        {
          key: "compression_type",
          label: "Metadata compression",
          type: "select",
          options: [
            { value: "zstd", label: "zstd" },
            { value: "gz", label: "gzip" },
            { value: "none", label: "None" },
          ],
        },
        {
          key: "layout",
          label: "Layout",
          type: "select",
          options: [
            { value: "nested_alphabetically", label: "Nested alphabetically" },
            { value: "flat", label: "Flat" },
            { value: "nested_by_digest", label: "Nested by digest" },
          ],
        },
        {
          key: "repo_config",
          label: "Repository config JSON",
          type: "json",
          placeholder: '{"repo": {"name": "..."}}',
          help: "Optional config.repo template for generated repository files.",
        },
        { key: "checkpoint", label: "Checkpoint publication", type: "boolean" },
      ],
    },
    autopublish: { deprecated: false },
    remoteFilterTypes: ["rpm.rpm", "rpm.uln"],
  },
];

const PLUGIN_BY_ID = new Map(PLUGINS.map((plugin) => [plugin.id, plugin]));
const PLUGIN_BY_COMPONENT = new Map(PLUGINS.map((plugin) => [plugin.component, plugin]));

const EXTRA_REPOSITORY_LABELS: Record<string, string> = {
  core: "OpenPGP keyring",
};

export function pluginForRepositoryType(type?: string | null): PluginDefinition | undefined {
  return type ? PLUGIN_BY_ID.get(type) : undefined;
}

function pluginForComponent(component?: string | null): PluginDefinition | undefined {
  return component ? PLUGIN_BY_COMPONENT.get(component) : undefined;
}

export function repositoryTypeLabel(type?: string | null): string {
  return (
    pluginForRepositoryType(type)?.label ??
    (type ? EXTRA_REPOSITORY_LABELS[type] : undefined) ??
    type ??
    "repository"
  );
}

export function repositorySupportsAutopublish(type?: string | null): boolean {
  return Boolean(pluginForRepositoryType(type)?.autopublish);
}

export function repositorySupportsPublications(type?: string | null): boolean {
  return Boolean(pluginForRepositoryType(type)?.publication);
}

export function publicationResourceForRepositoryType(type?: string | null): string | undefined {
  return pluginForRepositoryType(type)?.publication?.apiPath;
}

export function publicationFieldsForRepositoryType(type?: string | null): FieldDescriptor[] {
  return pluginForRepositoryType(type)?.publication?.fields ?? [];
}

/** Resolve the plugin that owns a publication type such as `deb.verbatim`. */
export function pluginForPublicationType(
  publicationType?: string | null,
): PluginDefinition | undefined {
  return publicationType
    ? PLUGINS.find((plugin) => plugin.publication?.types.includes(publicationType))
    : undefined;
}

/** Repository `pulp_type` values that can produce publications. */
export function publicationRepositoryPulpTypes(): string[] {
  return PLUGINS.flatMap((plugin) => (plugin.publication ? plugin.repositoryFilterTypes : []));
}

export function repositoryRemoteFilterTypes(type?: string | null): string[] {
  return pluginForRepositoryType(type)?.remoteFilterTypes ?? [];
}

/** Pulp `pulp_type` values for repository filters. */
export function repositoryFilterTypes(type?: string | null): string[] {
  return pluginForRepositoryType(type)?.repositoryFilterTypes ?? [];
}

export function repositoryTypeOptions(): Array<{
  id: string;
  label: string;
  path: string;
}> {
  return PLUGINS.map((plugin) => ({
    id: plugin.id,
    label: plugin.label,
    path: plugin.repository.apiPath,
  }));
}

export function publicationTypeLabels(): Record<string, string> {
  return Object.assign({}, ...PLUGINS.map((plugin) => plugin.publication?.labels ?? {}));
}

/** Plugin labels used to prefix task names such as `Sync repository (RPM)`. */
export function pluginNameForComponent(component: string): string | undefined {
  return pluginForComponent(component)?.label;
}
