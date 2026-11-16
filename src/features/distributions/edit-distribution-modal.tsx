import type { Distribution } from "@/api/types";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useDistribution } from "@/hooks/queries";
import { EditDistributionMetadataDialog } from "./edit-distribution-metadata-dialog";
import { EditDistributionSourceDialog } from "./edit-distribution-source-dialog";
import { dialogCopy, type DistributionEditMode } from "./edit-distribution-shared";

export type { DistributionEditMode } from "./edit-distribution-shared";

export function EditDistributionModal({
  distribution,
  mode,
  onSwitchMode,
  onClose,
}: {
  distribution: Distribution;
  mode: DistributionEditMode;
  onSwitchMode: (mode: DistributionEditMode) => void;
  onClose: () => void;
}) {
  const href = distribution.pulp_href;
  const detail = useDistribution(href);
  const copy = dialogCopy(distribution.name, mode);

  if (detail.isError) {
    return (
      <Modal
        open
        onClose={onClose}
        title={copy.title}
        description={copy.description}
        className="max-w-2xl"
        footer={
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        <ErrorPanel
          title="Could not load distribution details"
          message={detail.error instanceof Error ? detail.error.message : String(detail.error)}
          onRetry={() => void detail.refetch()}
        />
      </Modal>
    );
  }

  if (detail.isLoading || !detail.data) {
    return (
      <Modal
        open
        onClose={onClose}
        title={copy.title}
        description="Loading the latest distribution configuration."
        className="max-w-2xl"
        footer={
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        }
      >
        <div className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
          <Spinner />
          Loading distribution…
        </div>
      </Modal>
    );
  }

  if (mode === "metadata") {
    return (
      <EditDistributionMetadataDialog
        key={`${detail.data.pulp_href}:metadata`}
        distribution={detail.data}
        onSwitchMode={() => onSwitchMode("source")}
        onClose={onClose}
      />
    );
  }

  return (
    <EditDistributionSourceDialog
      key={`${detail.data.pulp_href}:source`}
      distribution={detail.data}
      onClose={onClose}
    />
  );
}
