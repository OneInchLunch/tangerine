import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers provide htmlFor or wrap a form control.
    <label
      className={cn("text-xs font-medium text-zinc-700 dark:text-zinc-300", className)}
      {...props}
    />
  );
}
