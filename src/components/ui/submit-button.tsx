import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { LucideIcon } from "lucide-react";

interface SubmitButtonProps {
  form?: string;
  isSubmitting: boolean;
  label: string;
  busyLabel: string;
  icon: LucideIcon;
  variant?: ButtonProps["variant"];
  disabled?: boolean;
}

export function SubmitButton({
  form,
  isSubmitting,
  label,
  busyLabel,
  icon: Icon,
  variant,
  disabled,
}: SubmitButtonProps) {
  return (
    <Button type="submit" form={form} variant={variant} disabled={disabled || isSubmitting}>
      {isSubmitting ? <Spinner /> : <Icon className="size-4" />}
      {isSubmitting ? busyLabel : label}
    </Button>
  );
}
