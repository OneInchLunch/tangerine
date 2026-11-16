import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DetailRowProps {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}

/**
 * Label/value row shared by detail pages. Rows are separated by a bottom border
 * and keep long monospace values wrapping on the right.
 */
export function DetailRow({ label, value, mono, className }: DetailRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-zinc-100 pb-2 text-xs last:border-0 dark:border-zinc-800",
        className,
      )}
    >
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span
        className={cn(
          "break-all text-right text-zinc-700 dark:text-zinc-300",
          mono && "font-mono text-meta",
        )}
      >
        {value}
      </span>
    </div>
  );
}
