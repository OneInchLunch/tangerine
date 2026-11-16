import { cancelTask, resourceIdFromHref } from "@/api/resources";
import type { Task } from "@/api/types";
import { FormError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetailRow } from "@/components/ui/detail-row";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { formatApiError } from "@/lib/errors";
import { friendlyTaskName } from "@/lib/task-name";
import { queryKeys } from "@/lib/query-keys";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { Ban } from "lucide-react";
import { useState } from "react";

export function CancelTaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const cancel = useApiMutation<void, string>({
    mutationFn: (href) => cancelTask(href).then(() => undefined),
    invalidation: [queryKeys.tasks.detail(resourceIdFromHref(task.pulp_href)), queryKeys.tasks.all],
    successMessage: "Task canceled",
    errorMode: "inline",
    onSuccess: onClose,
    onError: (caught) => setError(formatApiError(caught, "The task could not be cancelled.")),
  });

  function handleCancel() {
    if (!task.pulp_href) {
      return;
    }
    setError(null);
    cancel.mutate(task.pulp_href);
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={cancel.isPending}
      title="Cancel task"
      description="Ask Pulp to stop this task. Work already committed by the task is not rolled back."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
            Keep running
          </Button>
          <Button variant="danger" onClick={handleCancel} disabled={cancel.isPending}>
            {cancel.isPending ? <Spinner /> : <Ban className="size-4" />}
            {cancel.isPending ? "Cancelling…" : "Cancel task"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <DetailRow label="Task" value={friendlyTaskName(task.name)} />
        <DetailRow label="State" value={task.state ?? "unknown"} />
        <DetailRow label="Task ID" value={task.logging_cid} mono />
        {error ? <FormError>{error}</FormError> : null}
      </div>
    </Modal>
  );
}
