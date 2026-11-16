import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const MIN_PANE_HEIGHT = 200;

function getMaxPaneHeight(): number {
  if (typeof window === "undefined") {
    return MIN_PANE_HEIGHT;
  }
  return Math.max(MIN_PANE_HEIGHT, Math.round(window.innerHeight * 0.9));
}

function clampPaneHeight(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_PANE_HEIGHT), getMaxPaneHeight());
}

interface BottomPaneProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Bottom-anchored detail pane with a resizable height, fixed header,
 * scrollable body, and close action. Rendered in a portal so views can use it
 * without layout constraints.
 */
export function BottomPane({
  open = true,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  className,
  bodyClassName,
}: BottomPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [height, setHeight] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDrag(null);
    }
  }, [open]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [drag]);

  useEffect(() => {
    const onWindowResize = () => {
      setHeight((current) => (current === null ? null : Math.min(current, getMaxPaneHeight())));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  if (!open) {
    return null;
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    const measured = paneRef.current?.getBoundingClientRect().height;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      startY: event.clientY,
      startHeight: measured ? Math.round(measured) : (height ?? MIN_PANE_HEIGHT),
    });
    event.preventDefault();
  }

  function resize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) {
      return;
    }
    setHeight(clampPaneHeight(drag.startHeight + drag.startY - event.clientY));
  }

  function stopResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      setHeight(MIN_PANE_HEIGHT);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setHeight(getMaxPaneHeight());
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const current = height ?? paneRef.current?.getBoundingClientRect().height ?? MIN_PANE_HEIGHT;
    setHeight(clampPaneHeight(current + (event.key === "ArrowUp" ? 32 : -32)));
  }

  return createPortal(
    <aside
      aria-label={title}
      className={cn(
        "animate-in fixed inset-x-0 bottom-0 z-30 overflow-hidden rounded-t-xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.18)] dark:border-zinc-800 dark:bg-zinc-900 lg:left-[var(--app-sidebar-width,16rem)]",
        className,
      )}
    >
      <div
        ref={paneRef}
        className="flex max-h-[90vh] flex-col"
        style={height === null ? undefined : { height }}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: the resize handle needs pointer and keyboard handlers, so it remains a div. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize pane height"
          aria-valuemin={MIN_PANE_HEIGHT}
          aria-valuemax={getMaxPaneHeight()}
          aria-valuenow={height ?? undefined}
          tabIndex={0}
          title="Drag to resize"
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onLostPointerCapture={() => setDrag(null)}
          onKeyDown={resizeWithKeyboard}
          className="group flex h-3 shrink-0 touch-none cursor-ns-resize items-center justify-center bg-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 dark:bg-zinc-900"
        >
          <span className="h-1 w-10 rounded-full bg-zinc-300 transition-colors group-hover:bg-zinc-400 dark:bg-zinc-600 dark:group-hover:bg-zinc-500" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3">
            {icon ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                {icon}
              </span>
            ) : null}
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
              {description ? (
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</div>
              ) : null}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close pane">
            <X className="size-3.5" />
            Close
          </Button>
        </header>

        <div
          className={cn(
            "min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6 lg:px-8">
            {footer}
          </div>
        ) : null}
      </div>
    </aside>,
    document.body,
  );
}
