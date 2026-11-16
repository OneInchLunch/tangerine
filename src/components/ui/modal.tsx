import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Prevent Escape, backdrop, and close-button dismissal while a write runs. */
  busy?: boolean;
  /**
   * Ask for confirmation before Escape, the backdrop, the close button, or a
   * `ModalCancelButton` discards the dialog. Set this from the form's dirty
   * state.
   */
  dirty?: boolean;
}

const ModalCloseContext = createContext<() => void>(() => {});

/** Close the surrounding modal through its dirty guard. */
export function useModalClose(): () => void {
  return useContext(ModalCloseContext);
}

/** Cancel button that respects the surrounding modal's unsaved-changes guard. */
export function ModalCancelButton({
  children = "Cancel",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick">) {
  const requestClose = useModalClose();
  return (
    <Button variant="outline" onClick={requestClose} {...props}>
      {children}
    </Button>
  );
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let openModalCount = 0;
let backgroundSnapshot: {
  inert: string | null;
  ariaHidden: string | null;
  overflow: string;
} | null = null;

/**
 * Mark the application root inert while any modal is open. Modal content is
 * portaled to `document.body`, so the root remains the page behind the dialog.
 */
function lockBackground(): () => void {
  if (openModalCount === 0) {
    const root = document.getElementById("root");
    backgroundSnapshot = {
      inert: root?.getAttribute("inert") ?? null,
      ariaHidden: root?.getAttribute("aria-hidden") ?? null,
      overflow: document.body.style.overflow,
    };
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
  }
  openModalCount += 1;

  return () => {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount > 0 || !backgroundSnapshot) {
      return;
    }
    const root = document.getElementById("root");
    if (backgroundSnapshot.inert === null) {
      root?.removeAttribute("inert");
    } else {
      root?.setAttribute("inert", backgroundSnapshot.inert);
    }
    if (backgroundSnapshot.ariaHidden === null) {
      root?.removeAttribute("aria-hidden");
    } else {
      root?.setAttribute("aria-hidden", backgroundSnapshot.ariaHidden);
    }
    document.body.style.overflow = backgroundSnapshot.overflow;
    backgroundSnapshot = null;
  };
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  busy = false,
  dirty = false,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const dirtyRef = useRef(dirty);
  const [confirming, setConfirming] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture the opener during render, before autoFocus moves focus into the
  // dialog. A layout effect would already see the focused input.
  if (!open) {
    openerRef.current = null;
  } else if (openerRef.current === null && document.activeElement instanceof HTMLElement) {
    openerRef.current = document.activeElement;
  }
  onCloseRef.current = onClose;
  busyRef.current = busy;
  dirtyRef.current = dirty;

  function requestClose() {
    if (busyRef.current) {
      return;
    }
    if (dirtyRef.current) {
      setConfirming(true);
      return;
    }
    onCloseRef.current();
  }
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open || !dirty) {
      setConfirming(false);
    }
  }, [open, dirty]);

  useEffect(() => {
    if (confirming) {
      keepEditingRef.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const unlockBackground = lockBackground();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockBackground();
      openerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm"
        onClick={requestClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "animate-in relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>
        <ModalCloseContext.Provider value={requestClose}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
          {confirming ? (
            <div className="flex shrink-0 flex-col gap-2 border-t border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
              <p role="alert" className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Discard unsaved changes?
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button ref={keepEditingRef} variant="outline" onClick={() => setConfirming(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false);
                    onCloseRef.current();
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          ) : footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
              {footer}
            </div>
          ) : null}
        </ModalCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
