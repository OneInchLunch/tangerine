import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: string;
  tone?: "brand" | "neutral" | "success" | "info";
  className?: string;
}

const toneClasses = {
  brand: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  info: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "brand",
  className,
}: StatCardProps) {
  return (
    <Card className={cn("flex items-center gap-4 p-4", className)}>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          toneClasses[tone],
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-meta text-zinc-400 dark:text-zinc-500">{hint}</p> : null}
      </div>
    </Card>
  );
}
