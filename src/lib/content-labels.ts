export interface ContentTypeRef {
  plugin: string;
  type: string;
}

type ContentRow = Record<string, unknown>;

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const PLUGIN_LABELS: Record<string, string> = {
  ansible: "Ansible",
  container: "Container",
  core: "Core",
  deb: "Debian",
  file: "File",
  gem: "Gem",
  hugging_face: "Hugging Face",
  maven: "Maven",
  npm: "NPM",
  python: "Python",
  rpm: "RPM",
};

export function contentPluginLabel(plugin: string): string {
  return PLUGIN_LABELS[plugin] ?? titleCase(plugin);
}

const TYPE_LABELS: Record<string, string> = {
  advisories: "Advisories",
  artifact: "Artifacts",
  blobs: "Blobs",
  collection_deprecations: "Collection deprecations",
  collection_marks: "Collection marks",
  collection_signatures: "Collection signatures",
  collection_versions: "Collection versions",
  distribution_trees: "Distribution trees",
  files: "Files",
  gem: "Gems",
  generic_contents: "Generic contents",
  "hugging-face": "Hugging Face",
  "index-page": "Index pages",
  installer_file_indices: "Installer file indices",
  installer_packages: "Installer packages",
  manifests: "Manifests",
  metadata: "Metadata",
  modulemd_defaults: "Module defaults",
  modulemd_obsoletes: "Module obsoletes",
  modulemds: "Modules",
  namespaces: "Namespaces",
  openpgp_publickey: "OpenPGP public keys",
  openpgp_publicsubkey: "OpenPGP public subkeys",
  openpgp_signature: "OpenPGP signatures",
  openpgp_userattribute: "OpenPGP user attributes",
  openpgp_userid: "OpenPGP user IDs",
  packagecategories: "Package categories",
  packageenvironments: "Package environments",
  packagegroups: "Package groups",
  packagelangpacks: "Package langpacks",
  packages: "Packages",
  package_indices: "Package indices",
  package_release_components: "Package release components",
  provenance: "Provenance",
  release_architectures: "Release architectures",
  release_components: "Release components",
  release_files: "Release files",
  releases: "Releases",
  repo_metadata_files: "Repo metadata",
  roles: "Roles",
  signatures: "Signatures",
  source_indices: "Source indices",
  source_packages: "Source packages",
  source_release_components: "Source release components",
  tags: "Tags",
  yanks: "Yanks",
};

export function contentTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? titleCase(type);
}

const MATCH_KEYS = [
  "title",
  "id",
  "name",
  "package",
  "module",
  "module_name",
  "artifact_id",
  "group_id",
  "relative_path",
  "filename",
  "severity",
  "type",
  "stream",
  "release",
  "arch",
  "version",
  "namespace",
];

/** Case-insensitive filter over the labels and common identifying fields. */
export function contentMatchesQuery(row: ContentRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const values = [contentPrimaryLabel(row), contentSecondaryLabel(row)];
  for (const key of MATCH_KEYS) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") {
      values.push(String(value));
    }
  }
  return values.join(" ").toLowerCase().includes(needle);
}

function readString(row: ContentRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

/**
 * Labels that work across plugins. Pulp content serializers disagree about
 * where the human-readable name lives, so read the common fields in order of
 * usefulness instead of defaulting to the href.
 */
const GENERIC_PRIMARY_KEYS = [
  "relative_path",
  "filename",
  "name",
  "title",
  "package",
  "module",
  "module_name",
  "namespace",
  "display_name",
  "release_name",
  "artifact_id",
  "group_id",
  "id",
  "digest",
  "sha256",
  "sha1",
  "md5",
  "path",
];

const GENERIC_SECONDARY_KEYS = [
  "version",
  "release",
  "stream",
  "severity",
  "release_version",
  "arch",
  "distribution",
  "variant",
  "platform",
  "type",
  "group_id",
  "module_stream",
  "id",
];

interface LabelOverrides {
  primary?: string[];
  secondary?: string[];
}

/** Fields that are more useful than the generic order for a specific type. */
const TYPE_OVERRIDES: Record<string, LabelOverrides> = {
  "rpm/advisories": {
    primary: ["title", "id"],
    secondary: ["severity", "id"],
  },
  "rpm/modulemd_defaults": {
    primary: ["module", "name"],
    secondary: ["stream"],
  },
  "rpm/modulemds": {
    primary: ["name"],
    secondary: ["stream", "version", "arch"],
  },
  "rpm/modulemd_obsoletes": {
    primary: ["module_name"],
    secondary: ["module_stream"],
  },
  "rpm/distribution_trees": {
    secondary: ["arch"],
  },
  "maven/artifact": {
    primary: ["artifact_id", "filename"],
    secondary: ["version", "group_id"],
  },
  "maven/metadata": {
    primary: ["artifact_id", "filename"],
    secondary: ["version", "group_id"],
  },
};

function typeKey(contentType?: ContentTypeRef): string {
  return contentType ? `${contentType.plugin}/${contentType.type}` : "";
}

export function contentPrimaryLabel(row: ContentRow, contentType?: ContentTypeRef): string {
  const key = typeKey(contentType);

  if (key === "rpm/distribution_trees") {
    const name = readString(row, ["release_name", "release_short"]);
    const version = readString(row, ["release_version"]);
    if (name && version) {
      return `${name} ${version}`;
    }
    if (name) {
      return name;
    }
  }

  const keys = TYPE_OVERRIDES[key]?.primary ?? GENERIC_PRIMARY_KEYS;
  return readString(row, keys) ?? "Untitled content";
}

export function contentSecondaryLabel(row: ContentRow, contentType?: ContentTypeRef): string {
  const keys = TYPE_OVERRIDES[typeKey(contentType)]?.secondary ?? GENERIC_SECONDARY_KEYS;
  return readString(row, keys) ?? "—";
}
