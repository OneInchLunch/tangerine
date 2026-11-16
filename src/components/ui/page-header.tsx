import { useRegisterPageHeader } from "@/components/page-header-context";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  useRegisterPageHeader(title, description);

  if (!actions) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{actions}</div>
  );
}
