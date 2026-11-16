import { cn } from "@/lib/utils";
import { decodeListReturn } from "@/lib/list-url-state";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export type BackLinkTarget =
  | "/"
  | "/repositories"
  | "/remotes"
  | "/distributions"
  | "/publications"
  | "/content"
  | "/tasks";

interface BackLinkProps {
  to: BackLinkTarget;
  label: string;
  className?: string;
  /** Override the list search carried by the detail URL. */
  search?: Record<string, unknown>;
}

/**
 * Return to a list view. Detail links carry their origin list state in a
 * `from` parameter, so pagination, search, and filters survive the round trip;
 * direct links without it fall back to the plain list route.
 */
export function BackLink({ to, label, className, search }: BackLinkProps) {
  const location = useLocation();
  const locationSearch = location.search as Record<string, unknown>;
  const listSearch = search ?? decodeListReturn(locationSearch.from);

  return (
    <Link
      to={to}
      search={listSearch as never}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
        className,
      )}
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </Link>
  );
}
