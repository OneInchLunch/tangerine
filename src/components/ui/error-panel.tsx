import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorPanelProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorPanel({ title = "Something went wrong", message, onRetry }: ErrorPanelProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">{title}</h3>
          <p className="mt-1 break-words text-sm text-red-700 dark:text-red-400">{message}</p>
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
