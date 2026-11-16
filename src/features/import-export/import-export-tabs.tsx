import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Archive, FolderOutput, Upload } from "lucide-react";

const tabs = [
  { to: "/import-export/pulp-export", label: "Pulp export", icon: Archive },
  { to: "/import-export/filesystem-export", label: "Filesystem export", icon: FolderOutput },
  { to: "/import-export/pulp-import", label: "Pulp import", icon: Upload },
] as const;

export function ImportExportTabs({ active }: { active: (typeof tabs)[number]["to"] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active === tab.to
                ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
