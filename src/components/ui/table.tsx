import { cn } from "@/lib/utils";
import { nextListSort } from "@/lib/list-url-state";
import { ChevronUp } from "lucide-react";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("border-b border-zinc-200 dark:border-zinc-800", className)} {...props} />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("divide-y divide-zinc-100 dark:divide-zinc-800/70", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-4 text-left text-meta font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 align-middle text-zinc-700 dark:text-zinc-300", className)}
      {...props}
    />
  );
}

/**
 * Table header with a sort toggle. Follows Pulp's `ordering` convention:
 * unsorted -> ascending -> descending -> unsorted.
 */
export function SortableTableHead({
  label,
  sortKey,
  ordering,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  ordering: string;
  onSort: (next: string) => void;
  className?: string;
}) {
  const active = ordering.replace(/^-/, "") === sortKey;
  const ascending = active && !ordering.startsWith("-");

  return (
    <TableHead
      className={className}
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(nextListSort(ordering, sortKey))}
        className="inline-flex items-center gap-1 rounded-sm uppercase tracking-wide transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
        title={active ? (ascending ? "Sort descending" : "Clear sorting") : "Sort ascending"}
      >
        {label}
        <ChevronUp
          className={cn(
            "size-3",
            active && !ascending && "rotate-180",
            active ? "opacity-100" : "opacity-30",
          )}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}
