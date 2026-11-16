import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
}

/** Small table/list action button with an accessible name. */
export function IconButton({
  label,
  icon: Icon,
  onClick,
  title,
  disabled,
  tone = "default",
  className,
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-zinc-400 disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          : "hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
        className,
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
