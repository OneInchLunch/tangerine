import { useAuth } from "@/auth/auth-context";
import { useActiveTaskCount } from "@/hooks/queries";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

/**
 * Top-bar chip for asynchronous work. Hidden when nothing is queued, and links
 * to the Tasks page already filtered to running work. Scoped admins cannot read
 * tasks, so the chip is omitted instead of polling a denied endpoint.
 */
export function TaskIndicator() {
  const { session } = useAuth();
  const tasksRead = session?.capabilities?.tasksRead !== false;
  const { data } = useActiveTaskCount({ enabled: tasksRead });
  const count = data?.count ?? 0;

  if (!tasksRead || count === 0) {
    return null;
  }

  const label = count === 1 ? "1 task running" : `${count} tasks running`;

  return (
    <Link
      to="/tasks"
      search={{ filter: "running" } as never}
      aria-label={`${label}. Open the filtered task list.`}
      title={label}
      className="hidden items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-meta font-medium text-orange-700 transition-colors hover:bg-orange-100 sm:flex dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/70"
    >
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      {count} running
    </Link>
  );
}
