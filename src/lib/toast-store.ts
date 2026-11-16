/**
 * A tiny external store for toast messages.
 *
 * Writes happen from mutation callbacks as well as components, so the store
 * lives outside React and components subscribe with `useSyncExternalStore`.
 * Keeping it here also means a toast survives a route change or a dialog
 * closing, which an in-dialog banner cannot do.
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  /** Pulp task href; the toast renders it as a link to the task detail route. */
  taskHref?: string;
  /** Plain destination for non-task actions. */
  to?: string;
}

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
  action?: ToastAction;
}

export interface ToastInput {
  title: string;
  detail?: string;
  action?: ToastAction;
  /** Override the tone-based lifetime. `0` keeps the toast until dismissed. */
  durationMs?: number;
}

const SUCCESS_DURATION_MS = 5_000;
const MAX_VISIBLE = 3;

let messages: ToastMessage[] = [];
let snapshot: ToastMessage[] = messages;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let nextId = 0;

function emit() {
  snapshot = messages;
  for (const listener of listeners) {
    listener();
  }
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function push(tone: ToastTone, input: ToastInput): string {
  const id = `toast-${++nextId}`;
  const message: ToastMessage = {
    id,
    tone,
    title: input.title,
    detail: input.detail,
    action: input.action,
  };
  messages = [...messages, message].slice(-MAX_VISIBLE);
  emit();

  const duration = input.durationMs ?? (tone === "error" ? 0 : SUCCESS_DURATION_MS);
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  }
  return id;
}

export function dismiss(id: string) {
  clearTimer(id);
  if (!messages.some((message) => message.id === id)) {
    return;
  }
  messages = messages.filter((message) => message.id !== id);
  emit();
}

export function dismissAll() {
  for (const id of timers.keys()) {
    clearTimer(id);
  }
  if (messages.length === 0) {
    return;
  }
  messages = [];
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastMessage[] {
  return snapshot;
}

export const toast = {
  success(title: string, input: Omit<ToastInput, "title"> = {}) {
    return push("success", { ...input, title });
  },
  error(title: string, input: Omit<ToastInput, "title"> = {}) {
    return push("error", { ...input, title });
  },
  info(title: string, input: Omit<ToastInput, "title"> = {}) {
    return push("info", { ...input, title });
  },
};
