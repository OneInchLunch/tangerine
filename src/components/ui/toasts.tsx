import { resourceIdFromHref } from "@/api/resources";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dismiss, getToasts, subscribe, type ToastMessage } from "@/lib/toast-store";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

const TONE_STYLES = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/70",
  },
  error: {
    icon: AlertTriangle,
    iconClass: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-900/70",
  },
  info: {
    icon: Info,
    iconClass: "text-zinc-500 dark:text-zinc-400",
    border: "border-zinc-200 dark:border-zinc-800",
  },
} as const;

function ToastItem({ message }: { message: ToastMessage }) {
  const tone = TONE_STYLES[message.tone];
  const Icon = tone.icon;

  return (
    <div
      role={message.tone === "error" ? "alert" : "status"}
      data-toast={message.tone}
      className={cn(
        "animate-in pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg dark:bg-zinc-900",
        tone.border,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{message.title}</p>
        {message.detail ? (
          <p className="mt-0.5 break-words text-meta text-zinc-500 dark:text-zinc-400">
            {message.detail}
          </p>
        ) : null}
        {message.action ? (
          <div className="mt-1.5">
            {message.action.taskHref ? (
              <Link
                to="/tasks/$taskId"
                params={{ taskId: resourceIdFromHref(message.action.taskHref) }}
                className="text-meta font-medium text-orange-600 underline decoration-orange-300 underline-offset-2 hover:text-orange-700 dark:text-orange-400 dark:decoration-orange-700 dark:hover:text-orange-300"
              >
                {message.action.label}
              </Link>
            ) : message.action.to ? (
              <Link
                to={message.action.to}
                className="text-meta font-medium text-orange-600 underline decoration-orange-300 underline-offset-2 hover:text-orange-700 dark:text-orange-400 dark:decoration-orange-700 dark:hover:text-orange-300"
              >
                {message.action.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-mr-1 -mt-1 size-7 shrink-0"
        onClick={() => dismiss(message.id)}
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/** Toast viewport. Mounted once, next to the router, so messages survive route changes. */
export function Toasts() {
  const messages = useSyncExternalStore(subscribe, getToasts, getToasts);

  if (messages.length === 0) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-full sm:max-w-sm">
      {messages.map((message) => (
        <ToastItem key={message.id} message={message} />
      ))}
    </div>,
    document.body,
  );
}
