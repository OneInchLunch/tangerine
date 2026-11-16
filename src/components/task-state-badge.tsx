import { Badge } from "@/components/ui/badge";
import type { Task } from "@/api/types";
import { taskStateLabel, taskStateTone } from "@/lib/task-state";
import { CheckCircle2, Clock, Loader2, MinusCircle, XCircle } from "lucide-react";

export function TaskStateBadge({ state }: { state: Task["state"] }) {
  const label = taskStateLabel(state);
  const tone = taskStateTone(state);

  return (
    <Badge tone={tone}>
      {state === "running" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : state === "completed" ? (
        <CheckCircle2 className="size-3" />
      ) : state === "failed" ? (
        <XCircle className="size-3" />
      ) : state === "canceled" || state === "skipped" ? (
        <MinusCircle className="size-3" />
      ) : (
        <Clock className="size-3" />
      )}
      {label}
    </Badge>
  );
}
