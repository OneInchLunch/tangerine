import { cn } from "@/lib/utils";
import { useId, type ReactNode } from "react";

export const checkboxClassName =
  "mt-0.5 size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500";

interface CheckboxFieldProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Labelled checkbox card used by repository, distribution, and user forms. */
export function CheckboxField({
  id,
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: CheckboxFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
        className,
      )}
    >
      <input
        id={fieldId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={checkboxClassName}
      />
      <span>
        <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        {description ? (
          <span className="block text-meta text-zinc-500 dark:text-zinc-400">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
