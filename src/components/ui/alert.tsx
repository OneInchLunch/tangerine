import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AlertTone = "info" | "warning" | "success" | "danger";

const toneClasses: Record<AlertTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
};

const defaultIcons: Record<AlertTone, LucideIcon | null> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  danger: XCircle,
};

interface InlineAlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  icon?: LucideIcon | null;
  compact?: boolean;
  className?: string;
}

/**
 * Shared inline notice for capability explanations, warnings, and success
 * messages. Use `FormError` for form validation failures.
 */
export function InlineAlert({
  tone = "info",
  title,
  children,
  icon,
  compact = false,
  className,
}: InlineAlertProps) {
  const Icon = icon === undefined ? defaultIcons[tone] : icon;

  return (
    <div
      className={cn(
        "rounded-xl border",
        compact ? "px-3 py-2 text-xs" : "flex gap-3 p-4",
        toneClasses[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "shrink-0",
            compact ? "mr-1.5 inline size-3.5 align-[-2px]" : "mt-0.5 size-5",
          )}
        />
      ) : null}
      <div className={cn(!compact && "min-w-0")}>
        {title ? (
          <p className={cn("font-medium", compact ? "inline" : "text-sm")}>
            {title}
            {compact ? " " : null}
          </p>
        ) : null}
        <div
          className={cn(
            compact ? "inline" : "mt-1 text-xs leading-relaxed",
            title && !compact && "mt-1",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
        className,
      )}
    >
      {children}
    </p>
  );
}
