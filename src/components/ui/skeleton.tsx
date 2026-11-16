import { cn } from "@/lib/utils";

export function TableSkeleton({
  rows = 5,
  rowClassName = "h-11",
  className,
}: {
  rows?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-5", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn("animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800", rowClassName)}
        />
      ))}
    </div>
  );
}
