export type TaskTone = "success" | "danger" | "warning" | "info" | "neutral";

export interface TaskStateMeta {
  label: string;
  tone: TaskTone;
  terminal: boolean;
}

export const TASK_STATE_META: Record<string, TaskStateMeta> = {
  waiting: { label: "Waiting", tone: "warning", terminal: false },
  skipped: { label: "Skipped", tone: "neutral", terminal: true },
  running: { label: "Running", tone: "info", terminal: false },
  completed: { label: "Completed", tone: "success", terminal: true },
  failed: { label: "Failed", tone: "danger", terminal: true },
  canceled: { label: "Canceled", tone: "neutral", terminal: true },
  canceling: { label: "Canceling", tone: "warning", terminal: false },
};

/** Options for task-state filter selects. */
export const TASK_STATE_FILTERS = [
  { value: "", label: "All states" },
  ...Object.entries(TASK_STATE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

/**
 * States Pulp still considers active. Used by the top-bar indicator, which
 * links to the filtered Tasks page.
 */
export const ACTIVE_TASK_STATES = ["waiting", "running", "canceling"] as const;

export const ACTIVE_TASK_STATE_FILTER = ACTIVE_TASK_STATES.join(",");

export function taskStateMeta(state?: string): TaskStateMeta {
  return (
    (state ? TASK_STATE_META[state] : undefined) ?? {
      label: state ?? "Unknown",
      tone: "neutral",
      terminal: false,
    }
  );
}

export function taskStateLabel(state?: string): string {
  return taskStateMeta(state).label;
}

export function taskStateTone(state?: string): TaskTone {
  return taskStateMeta(state).tone;
}

export function isTerminalTask(state?: string): boolean {
  return Boolean(state && TASK_STATE_META[state]?.terminal);
}
