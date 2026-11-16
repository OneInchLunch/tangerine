import { pluginNameForComponent } from "@/lib/plugins";

const EXACT_TASK_NAMES: Record<string, string> = {
  "pulpcore.app.tasks.base.general_create": "Create resource",
  "pulpcore.app.tasks.base.ageneral_create": "Create resource",
  "pulpcore.app.tasks.base.general_update": "Update resource",
  "pulpcore.app.tasks.base.ageneral_update": "Update resource",
  "pulpcore.app.tasks.base.general_delete": "Delete resource",
  "pulpcore.app.tasks.base.ageneral_delete": "Delete resource",
  "pulpcore.app.tasks.repository.repo_version_create": "Create repository version",
  "pulpcore.app.tasks.repository.repo_version_delete": "Delete repository version",
  "pulpcore.app.tasks.repository.add_and_remove": "Update repository content",
  "pulpcore.app.tasks.orphan.orphan_cleanup": "Clean up orphaned content",
  "pulpcore.app.tasks.orphan.orphan_delete": "Delete orphaned content",
  "pulpcore.app.tasks.artifact.repair": "Repair artifacts",
  "pulpcore.app.tasks.storage.reclaim_space": "Reclaim repository storage",
  "pulpcore.app.tasks.upload.upload": "Upload content",
  "pulpcore.app.tasks.upload.chunked": "Upload content",
  "pulpcore.app.tasks.upload.commit": "Commit upload",
  "pulpcore.app.tasks.importer.touch": "Refresh import",
  "pulpcore.app.tasks.signature.sign": "Sign content",
  "pulpcore.app.tasks.analytics.post_analytics": "Upload analytics",
  "pulp_container.app.tasks.download_image_data.aadd_and_remove": "Update container content",
  "pulp_ansible.app.tasks.collection.import_collection": "Import Ansible collection",
};

const EXTRA_PLUGIN_NAMES: Record<string, string> = {
  certguard: "Certguard",
  ostree: "OSTree",
};

interface SuffixRule {
  suffix: string;
  label: string;
  includePlugin?: boolean;
}

const SUFFIX_RULES: SuffixRule[] = [
  { suffix: "repo_version_create", label: "Create repository version" },
  { suffix: "repo_version_delete", label: "Delete repository version" },
  { suffix: "add_and_remove", label: "Update repository content" },
  { suffix: "orphan_cleanup", label: "Clean up orphaned content" },
  { suffix: "orphan_delete", label: "Delete orphaned content" },
  { suffix: "reclaim_space", label: "Reclaim repository storage" },
  { suffix: "post_analytics", label: "Upload analytics" },
  { suffix: "import_collection", label: "Import collection" },
  { suffix: "synchronize", label: "Sync repository", includePlugin: true },
  { suffix: "sync", label: "Sync repository", includePlugin: true },
  { suffix: "publish", label: "Publish repository", includePlugin: true },
  { suffix: "repair", label: "Repair artifacts" },
  { suffix: "commit", label: "Commit upload" },
  { suffix: "upload", label: "Upload content" },
  { suffix: "chunked", label: "Upload content" },
  { suffix: "touch", label: "Refresh import" },
  { suffix: "sign", label: "Sign content" },
  { suffix: "general_create", label: "Create resource" },
  { suffix: "general_update", label: "Update resource" },
  { suffix: "general_delete", label: "Delete resource" },
  { suffix: "create", label: "Create resource" },
  { suffix: "update", label: "Update resource" },
  { suffix: "delete", label: "Delete resource" },
  { suffix: "remove", label: "Remove content" },
  { suffix: "purge", label: "Purge content" },
  { suffix: "import", label: "Import content" },
  { suffix: "export", label: "Export content" },
];

function humanize(value: string): string {
  const words = value.split(/[._-]+/).filter(Boolean);
  if (!words.length) {
    return "Unknown task";
  }
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

function pluginName(taskName: string): string | null {
  const match = /^pulp_([a-z0-9]+(?:_[a-z0-9]+)*)\./.exec(taskName);
  if (!match) {
    return null;
  }
  return pluginNameForComponent(match[1]) ?? EXTRA_PLUGIN_NAMES[match[1]] ?? humanize(match[1]);
}

export function friendlyTaskName(taskName?: string | null): string {
  if (!taskName) {
    return "Unknown task";
  }

  const exact = EXACT_TASK_NAMES[taskName];
  if (exact) {
    return exact;
  }

  const leaf = taskName.split(".").pop() ?? taskName;
  const plugin = pluginName(taskName);
  const rule = SUFFIX_RULES.find((candidate) => leaf.endsWith(candidate.suffix));
  if (rule) {
    return rule.includePlugin && plugin ? `${rule.label} (${plugin})` : rule.label;
  }

  return humanize(leaf);
}
