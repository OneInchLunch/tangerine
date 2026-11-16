import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LIST_PAGE_SIZES } from "@/lib/list-url-state";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  hasNext?: boolean;
  onPageChange: (page: number) => void;
  /** Show a page-size picker when the caller can vary the URL-backed size. */
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  hasNext,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);

  return (
    <div
      className={
        className ??
        "flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
      }
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <div className="flex items-center gap-1.5 text-meta text-zinc-500 dark:text-zinc-400">
            <span className="whitespace-nowrap">Rows per page</span>
            <Select
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 w-auto py-0 text-meta"
              aria-label="Rows per page"
            >
              {LIST_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
