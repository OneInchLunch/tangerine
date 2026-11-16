import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  isFetching?: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function RefreshButton({
  isFetching,
  onClick,
  label = "Refresh",
  disabled,
  size = "sm",
}: RefreshButtonProps) {
  return (
    <Button variant="outline" size={size} onClick={onClick} disabled={disabled}>
      <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
      {label}
    </Button>
  );
}
