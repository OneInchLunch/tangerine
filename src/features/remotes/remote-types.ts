export type RemoteFieldKind =
  | "text"
  | "password"
  | "number"
  | "boolean"
  | "select"
  | "textarea"
  | "stringList"
  | "json"
  | "keyValue";

export interface RemoteFieldOption {
  value: string;
  label: string;
}

export interface RemoteField {
  key: string;
  label: string;
  kind: RemoteFieldKind;
  description?: string;
  placeholder?: string;
  required?: boolean;
  writeOnly?: boolean;
  secret?: boolean;
  mono?: boolean;
  min?: number;
  step?: number;
  rows?: number;
  options?: RemoteFieldOption[];
  defaultValue?: string | number | boolean;
}

export interface RemoteFieldGroup {
  id: string;
  title: string;
  description?: string;
  fields: RemoteField[];
}

export type RemoteTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

export interface RemoteTypeDefinition {
  id: string;
  /**
   * Pulp API `pulp_type` value when it differs from the URL-derived id.
   * Most remote types use the same value, but deb apt remotes are exposed
   * as `deb.apt-remote` by list filters.
   */
  pulpType?: string;
  label: string;
  plugin: string;
  apiPath: string;
  description: string;
  tone: RemoteTone;
  groups: RemoteFieldGroup[];
}

const STANDARD_POLICY_OPTIONS: RemoteFieldOption[] = [
  { value: "immediate", label: "Immediate — download metadata and content" },
  { value: "on_demand", label: "On demand — download content when requested" },
  { value: "streamed", label: "Streamed — proxy content without storing it" },
];

const IMMEDIATE_POLICY_OPTIONS: RemoteFieldOption[] = [
  { value: "immediate", label: "Immediate — download metadata and content" },
];

const ON_DEMAND_POLICY_OPTIONS: RemoteFieldOption[] = [
  { value: "on_demand", label: "On demand — download content when requested" },
];

function policyField(
  options: RemoteFieldOption[] = STANDARD_POLICY_OPTIONS,
  defaultValue = "immediate",
): RemoteField {
  return {
    key: "policy",
    label: "Download policy",
    kind: "select",
    options,
    defaultValue,
    description: "Controls whether content is downloaded eagerly, on demand, or proxied.",
  };
}

const NAME_FIELD: RemoteField = {
  key: "name",
  label: "Name",
  kind: "text",
  required: true,
  placeholder: "e.g. upstream-rpms",
  description: "A unique name for this remote.",
};

const URL_FIELD: RemoteField = {
  key: "url",
  label: "Remote URL",
  kind: "text",
  required: true,
  mono: true,
  placeholder: "https://upstream.example.com/repository/",
  description: "The URL of the external content source.",
};

const TLS_VALIDATION_FIELD: RemoteField = {
  key: "tls_validation",
  label: "TLS certificate validation",
  kind: "boolean",
  defaultValue: true,
  description: "Validate the certificate presented by the upstream server.",
};

const NETWORK_FIELDS: RemoteField[] = [
  {
    key: "proxy_url",
    label: "Proxy URL",
    kind: "text",
    mono: true,
    placeholder: "http://proxy.example.com:3128",
    description: "Proxy used for outgoing download connections.",
  },
  {
    key: "proxy_username",
    label: "Proxy username",
    kind: "text",
    writeOnly: true,
    description: "Username for proxy authentication.",
  },
  {
    key: "proxy_password",
    label: "Proxy password",
    kind: "password",
    writeOnly: true,
    secret: true,
    description: "Password for proxy authentication.",
  },
  {
    key: "max_retries",
    label: "Maximum retries",
    kind: "number",
    min: 0,
    placeholder: "3",
    description: "Retry attempts after a download failure. Pulp defaults to 3.",
  },
  {
    key: "total_timeout",
    label: "Total timeout (seconds)",
    kind: "number",
    min: 0,
    step: 0.1,
    description: "Overall aiohttp client timeout for downloads.",
  },
  {
    key: "connect_timeout",
    label: "Connect timeout (seconds)",
    kind: "number",
    min: 0,
    step: 0.1,
    description: "Timeout for establishing a download connection.",
  },
  {
    key: "sock_connect_timeout",
    label: "Socket connect timeout (seconds)",
    kind: "number",
    min: 0,
    step: 0.1,
    description: "Timeout for connecting the underlying socket.",
  },
  {
    key: "sock_read_timeout",
    label: "Socket read timeout (seconds)",
    kind: "number",
    min: 0,
    step: 0.1,
    description: "Timeout for reading from the underlying socket.",
  },
  {
    key: "download_concurrency",
    label: "Download concurrency",
    kind: "number",
    min: 1,
    description: "Number of simultaneous download connections.",
  },
  {
    key: "rate_limit",
    label: "Rate limit",
    kind: "number",
    min: 0,
    description: "Maximum requests per second for each downloader.",
  },
  {
    key: "headers",
    label: "Extra headers",
    kind: "json",
    rows: 4,
    mono: true,
    placeholder: '[{"name": "Authorization", "value": "Bearer …"}]',
    description: "JSON array of headers added to aiohttp client sessions.",
  },
];

function authFields(usernameRequired = false, passwordRequired = false): RemoteField[] {
  return [
    {
      key: "username",
      label: "Upstream username",
      kind: "text",
      writeOnly: true,
      required: usernameRequired,
      description: "Username used when synchronizing from the upstream source.",
    },
    {
      key: "password",
      label: "Upstream password",
      kind: "password",
      writeOnly: true,
      secret: true,
      required: passwordRequired,
      description: "Password used when synchronizing from the upstream source.",
    },
    {
      key: "ca_cert",
      label: "CA certificate",
      kind: "textarea",
      rows: 5,
      mono: true,
      placeholder: "-----BEGIN CERTIFICATE-----",
      description: "PEM CA certificate used to validate the upstream server.",
    },
    {
      key: "client_cert",
      label: "Client certificate",
      kind: "textarea",
      rows: 5,
      mono: true,
      placeholder: "-----BEGIN CERTIFICATE-----",
      description: "PEM client certificate presented to the upstream server.",
    },
    {
      key: "client_key",
      label: "Client private key",
      kind: "textarea",
      rows: 5,
      mono: true,
      writeOnly: true,
      secret: true,
      placeholder: "-----BEGIN PRIVATE KEY-----",
      description: "PEM private key matching the client certificate.",
    },
  ];
}

function pluginGroup(
  id: string,
  title: string,
  fields: RemoteField[],
  description?: string,
): RemoteFieldGroup {
  return { id, title, description, fields };
}

function buildGroups(
  policy: RemoteField | undefined,
  plugin?: RemoteFieldGroup,
  auth: RemoteField[] = authFields(),
): RemoteFieldGroup[] {
  const groups: RemoteFieldGroup[] = [
    {
      id: "basics",
      title: "Basics",
      description: "Identity and upstream location.",
      fields: [NAME_FIELD, URL_FIELD],
    },
  ];

  if (plugin) {
    groups.push(plugin);
  }

  groups.push({
    id: "policy",
    title: "Sync policy",
    description: "How Pulp retrieves content from this remote.",
    fields: policy ? [policy, TLS_VALIDATION_FIELD] : [TLS_VALIDATION_FIELD],
  });

  groups.push({
    id: "authentication",
    title: "Authentication",
    description: "Optional upstream credentials and TLS client configuration.",
    fields: auth,
  });

  groups.push({
    id: "network",
    title: "Network and retries",
    description: "Proxy, timeout, concurrency, and custom header settings.",
    fields: NETWORK_FIELDS,
  });

  groups.push({
    id: "labels",
    title: "Labels",
    description: "Optional key/value metadata stored on the remote.",
    fields: [
      {
        key: "pulp_labels",
        label: "Remote labels",
        kind: "keyValue",
        rows: 4,
        mono: true,
        placeholder: "environment=production\nteam=platform",
        description: "One key=value pair per line. Values may be empty.",
      },
    ],
  });

  return groups;
}

const gitRefField: RemoteField = {
  key: "git_ref",
  label: "Git ref",
  kind: "text",
  mono: true,
  placeholder: "HEAD",
  description: "Branch, tag, or commit hash to sync from.",
};

const metadataOnlyField: RemoteField = {
  key: "metadata_only",
  label: "Metadata only",
  kind: "boolean",
  description: "Only store metadata and leave clients to retrieve content from the remote.",
};

const fileGitFields: RemoteField[] = [gitRefField];
const ansibleGitFields: RemoteField[] = [metadataOnlyField, gitRefField];

const pythonFields: RemoteField[] = [
  {
    key: "includes",
    label: "Include project specs",
    kind: "stringList",
    rows: 4,
    mono: true,
    placeholder: "django>=4.2\nrequests",
    description: "Python project specifiers to include. One per line.",
  },
  {
    key: "excludes",
    label: "Exclude project specs",
    kind: "stringList",
    rows: 4,
    mono: true,
    placeholder: "django<4",
    description: "Python project specifiers to exclude. One per line.",
  },
  {
    key: "prereleases",
    label: "Include prereleases",
    kind: "boolean",
    description: "Include pre-release Python packages during sync.",
  },
  {
    key: "package_types",
    label: "Package types",
    kind: "stringList",
    rows: 3,
    mono: true,
    placeholder: "sdist\nbdist_wheel",
    description: "Package types to sync. Leave blank for every type.",
  },
  {
    key: "keep_latest_packages",
    label: "Keep latest packages",
    kind: "number",
    min: 0,
    defaultValue: 0,
    description: "Number of latest versions to keep per package. 0 keeps all versions.",
  },
  {
    key: "exclude_platforms",
    label: "Excluded platforms",
    kind: "stringList",
    rows: 3,
    mono: true,
    placeholder: "windows\nmacos",
    description: "Platforms to exclude: windows, macos, freebsd, or linux.",
  },
  {
    key: "provenance",
    label: "Sync provenance",
    kind: "boolean",
    description: "Sync available provenance data for Python packages.",
  },
  {
    key: "vulnerabilities",
    label: "Scan vulnerabilities",
    kind: "boolean",
    description: "Scan new repository versions for vulnerabilities after sync.",
  },
];

const ansibleCollectionFields: RemoteField[] = [
  {
    key: "requirements_file",
    label: "Collection requirements",
    kind: "textarea",
    rows: 6,
    mono: true,
    placeholder: "collections:\n  - name: community.general",
    description: "YAML requirements file content for collection syncs.",
  },
  {
    key: "auth_url",
    label: "Token endpoint URL",
    kind: "text",
    mono: true,
    placeholder: "https://automation-hub.example.com/v1/auth/token/",
    description: "URL used to obtain an authentication token.",
  },
  {
    key: "token",
    label: "API token",
    kind: "password",
    writeOnly: true,
    secret: true,
    description: "Token used to authenticate to the upstream collection source.",
  },
  {
    key: "sync_dependencies",
    label: "Sync dependencies",
    kind: "boolean",
    description: "Sync dependencies for collections listed in the requirements file.",
  },
  {
    key: "signed_only",
    label: "Signed collections only",
    kind: "boolean",
    description: "Only sync collections that have a valid signature.",
  },
  {
    key: "sync_highest_versions",
    label: "Highest versions to sync",
    kind: "number",
    min: 1,
    description: "Number of highest versions per collection. Leave blank to sync all.",
  },
];

const containerFields: RemoteField[] = [
  {
    key: "upstream_name",
    label: "Upstream repository name",
    kind: "text",
    required: true,
    placeholder: "library",
    description: "Name of the upstream container repository.",
  },
  {
    key: "includes",
    label: "Include tags",
    kind: "stringList",
    rows: 3,
    mono: true,
    placeholder: "latest\nv1.*",
    description: "Tags or digests to include. One per line.",
  },
  {
    key: "excludes",
    label: "Exclude tags",
    kind: "stringList",
    rows: 3,
    mono: true,
    placeholder: "*-nightly",
    description: "Tag patterns to exclude. One per line.",
  },
  {
    key: "sigstore",
    label: "Sigstore URL",
    kind: "text",
    mono: true,
    placeholder: "https://sigstore.example.com",
    description: "Sigstore used to download image signatures.",
  },
  {
    key: "include_tags",
    label: "Legacy include tags (deprecated)",
    kind: "stringList",
    rows: 3,
    mono: true,
    description: "Deprecated alias for include tags. Use includes instead.",
  },
  {
    key: "exclude_tags",
    label: "Legacy exclude tags (deprecated)",
    kind: "stringList",
    rows: 3,
    mono: true,
    description: "Deprecated alias for exclude tags. Use excludes instead.",
  },
];

const debFields: RemoteField[] = [
  {
    key: "distributions",
    label: "Distributions",
    kind: "text",
    required: true,
    mono: true,
    placeholder: "bookworm",
    description: "Whitespace-separated distribution paths to sync.",
  },
  {
    key: "components",
    label: "Components",
    kind: "text",
    mono: true,
    placeholder: "main contrib",
    description: "Whitespace-separated components to sync.",
  },
  {
    key: "architectures",
    label: "Architectures",
    kind: "text",
    mono: true,
    placeholder: "amd64 arm64",
    description: "Whitespace-separated architectures to sync.",
  },
  {
    key: "sync_sources",
    label: "Sync source packages",
    kind: "boolean",
    description: "Include source packages during sync.",
  },
  {
    key: "sync_udebs",
    label: "Sync installer packages",
    kind: "boolean",
    description: "Include udeb installer packages during sync.",
  },
  {
    key: "sync_installer",
    label: "Sync installer files",
    kind: "boolean",
    description: "Include installer files during sync.",
  },
  {
    key: "gpgkey",
    label: "GPG public key",
    kind: "textarea",
    rows: 5,
    mono: true,
    placeholder: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    description: "GPG key used to verify upstream release signatures.",
  },
  {
    key: "ignore_missing_package_indices",
    label: "Ignore missing package indices",
    kind: "boolean",
    description: "Continue syncing when declared package indices are missing upstream.",
  },
  {
    key: "excluded_package_metadata_fields",
    label: "Excluded metadata fields",
    kind: "stringList",
    rows: 3,
    mono: true,
    placeholder: "Phased-Update-Percentage",
    description: "Package metadata fields to drop. One per line.",
  },
];

const gemFields: RemoteField[] = [
  {
    key: "prereleases",
    label: "Include prereleases",
    kind: "boolean",
    description: "Include pre-release gems during sync.",
  },
  {
    key: "includes",
    label: "Include map",
    kind: "keyValue",
    rows: 3,
    mono: true,
    placeholder: "gem-name=pattern",
    description: "Gem include configuration as key=value pairs.",
  },
  {
    key: "excludes",
    label: "Exclude map",
    kind: "keyValue",
    rows: 3,
    mono: true,
    placeholder: "gem-name=pattern",
    description: "Gem exclude configuration as key=value pairs.",
  },
];

const huggingFaceFields: RemoteField[] = [
  {
    key: "hf_hub_url",
    label: "Hugging Face Hub URL",
    kind: "text",
    mono: true,
    defaultValue: "https://huggingface.co",
    placeholder: "https://huggingface.co",
    description: "Base URL for the Hugging Face Hub.",
  },
  {
    key: "hf_token",
    label: "Hugging Face token",
    kind: "password",
    writeOnly: true,
    secret: true,
    description: "Authentication token for private Hugging Face repositories.",
  },
];

export const REMOTE_TYPES: RemoteTypeDefinition[] = [
  {
    id: "file.file",
    label: "File",
    plugin: "file",
    apiPath: "remotes/file/file/",
    description: "Generic files served from a remote web or file source.",
    tone: "brand",
    groups: buildGroups(policyField()),
  },
  {
    id: "file.git",
    label: "File (Git)",
    plugin: "file",
    apiPath: "remotes/file/git/",
    description: "Files synchronized from a Git repository.",
    tone: "brand",
    groups: buildGroups(undefined, pluginGroup("git", "Git configuration", fileGitFields)),
  },
  {
    id: "rpm.rpm",
    label: "RPM",
    plugin: "rpm",
    apiPath: "remotes/rpm/rpm/",
    description: "Yum/DNF package repository content.",
    tone: "danger",
    groups: buildGroups(
      policyField(),
      pluginGroup("rpm", "RPM options", [
        {
          key: "sles_auth_token",
          label: "SLES authentication token",
          kind: "password",
          secret: true,
          description: "Authentication token for SLES repositories.",
        },
      ]),
    ),
  },
  {
    id: "rpm.uln",
    label: "RPM (ULN)",
    plugin: "rpm",
    apiPath: "remotes/rpm/uln/",
    description: "Oracle ULN channel content, addressed with a uln:// URL.",
    tone: "danger",
    groups: buildGroups(
      policyField(),
      pluginGroup("uln", "ULN options", [
        {
          key: "uln_server_base_url",
          label: "ULN server base URL",
          kind: "text",
          mono: true,
          placeholder: "https://linux-update.oracle.com",
          description: "Base URL of the ULN server. Leave blank to use the Pulp default.",
        },
      ]),
      authFields(true, true),
    ),
  },
  {
    id: "container.container",
    label: "Container",
    plugin: "container",
    apiPath: "remotes/container/container/",
    description: "OCI/Docker container image content.",
    tone: "info",
    groups: buildGroups(
      policyField(),
      pluginGroup(
        "container",
        "Container configuration",
        containerFields,
        "Upstream repository name, tag filters, and signature source.",
      ),
    ),
  },
  {
    id: "container.pull-through",
    label: "Container pull-through",
    plugin: "container",
    apiPath: "remotes/container/pull-through/",
    description: "Pull-through container cache that always uses on-demand content.",
    tone: "info",
    groups: buildGroups(
      policyField(ON_DEMAND_POLICY_OPTIONS, "on_demand"),
      pluginGroup("pull-through", "Pull-through configuration", [
        {
          key: "includes",
          label: "Include tags",
          kind: "stringList",
          rows: 3,
          mono: true,
          placeholder: "latest\nv1.*",
          description: "Tags or digests to include. One per line.",
        },
        {
          key: "excludes",
          label: "Exclude tags",
          kind: "stringList",
          rows: 3,
          mono: true,
          placeholder: "*-nightly",
          description: "Tag patterns to exclude. One per line.",
        },
      ]),
    ),
  },
  {
    id: "python.python",
    label: "Python",
    plugin: "python",
    apiPath: "remotes/python/python/",
    description: "PyPI-compatible Python package content.",
    tone: "success",
    groups: buildGroups(
      policyField(),
      pluginGroup(
        "python",
        "Python configuration",
        pythonFields,
        "Package filters, prereleases, platform exclusions, and scanning.",
      ),
    ),
  },
  {
    id: "ansible.collection",
    label: "Ansible collection",
    plugin: "ansible",
    apiPath: "remotes/ansible/collection/",
    description: "Ansible collection content from Galaxy or Automation Hub.",
    tone: "warning",
    groups: buildGroups(
      policyField(IMMEDIATE_POLICY_OPTIONS),
      pluginGroup("ansible-collection", "Collection configuration", ansibleCollectionFields),
    ),
  },
  {
    id: "ansible.git",
    label: "Ansible Git",
    plugin: "ansible",
    apiPath: "remotes/ansible/git/",
    description: "Ansible collection content synchronized from Git.",
    tone: "warning",
    groups: buildGroups(
      undefined,
      pluginGroup("ansible-git", "Git configuration", ansibleGitFields),
    ),
  },
  {
    id: "ansible.role",
    label: "Ansible role",
    plugin: "ansible",
    apiPath: "remotes/ansible/role/",
    description: "Ansible role content from Galaxy or Automation Hub.",
    tone: "warning",
    groups: buildGroups(policyField(IMMEDIATE_POLICY_OPTIONS)),
  },
  {
    id: "deb.apt",
    pulpType: "deb.apt-remote",
    label: "Debian",
    plugin: "deb",
    apiPath: "remotes/deb/apt/",
    description: "APT package repository content.",
    tone: "neutral",
    groups: buildGroups(
      policyField(),
      pluginGroup(
        "deb",
        "Debian configuration",
        debFields,
        "Distributions, components, architectures, and signature verification.",
      ),
    ),
  },
  {
    id: "npm.npm",
    label: "npm",
    plugin: "npm",
    apiPath: "remotes/npm/npm/",
    description: "npm package registry content.",
    tone: "danger",
    groups: buildGroups(policyField()),
  },
  {
    id: "maven.maven",
    label: "Maven",
    plugin: "maven",
    apiPath: "remotes/maven/maven/",
    description: "Maven repository content.",
    tone: "info",
    groups: buildGroups(policyField()),
  },
  {
    id: "gem.gem",
    label: "Gem",
    plugin: "gem",
    apiPath: "remotes/gem/gem/",
    description: "RubyGems package content.",
    tone: "warning",
    groups: buildGroups(policyField(), pluginGroup("gem", "Gem configuration", gemFields)),
  },
  {
    id: "hugging_face.hugging-face",
    label: "Hugging Face",
    plugin: "hugging_face",
    apiPath: "remotes/hugging_face/hugging-face/",
    description: "Hugging Face model and dataset repository content.",
    tone: "success",
    groups: buildGroups(
      policyField(IMMEDIATE_POLICY_OPTIONS),
      pluginGroup("hugging-face", "Hugging Face configuration", huggingFaceFields),
    ),
  },
];

const REMOTE_TYPE_MAP = new Map(REMOTE_TYPES.map((type) => [type.id, type]));

export function getRemoteType(id: string | undefined | null): RemoteTypeDefinition | undefined {
  return id ? REMOTE_TYPE_MAP.get(id) : undefined;
}

export function remoteTypeLabel(id: string | undefined | null): string {
  return getRemoteType(id)?.label ?? (id ? id.replace(/[._-]+/g, " ") : "Unknown");
}

export function allRemoteFields(type: RemoteTypeDefinition): RemoteField[] {
  return type.groups.flatMap((group) => group.fields);
}

/** API-root key for this remote endpoint (`remotes/file/file`). */
export function remoteRootKey(type: RemoteTypeDefinition): string {
  return type.apiPath.replace(/\/$/, "");
}
