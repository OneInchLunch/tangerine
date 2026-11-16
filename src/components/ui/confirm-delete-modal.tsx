import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  itemName: string;
  confirmLabel: string;
  busyLabel?: string;
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  /** Repository and remote deletion require typing the exact name. */
  requireName?: boolean;
  nameLabel?: string;
  children?: ReactNode;
}

/**
 * Shared destructive confirmation dialog. It supports both the typed-name
 * confirmation used for repositories/remotes and the simpler publication flow.
 */
export function ConfirmDeleteModal({
  open,
  onClose,
  title,
  description,
  itemName,
  confirmLabel,
  busyLabel = "Deleting…",
  isDeleting,
  error,
  onConfirm,
  requireName = true,
  nameLabel = "Name",
  children,
}: ConfirmDeleteModalProps) {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmation("");
    }
  }, [open]);

  const confirmed = !requireName || confirmation.trim() === itemName;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isDeleting) {
          onClose();
        }
      }}
      busy={isDeleting}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting || !confirmed}>
            {isDeleting ? <Spinner /> : <Trash2 className="size-4" />}
            {isDeleting ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {requireName ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Type <span className="font-mono font-semibold">{itemName}</span> to confirm deletion.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={inputId}>{nameLabel}</Label>
              <Input
                id={inputId}
                autoFocus
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={itemName}
              />
            </div>
          </>
        ) : null}
        {error ? <FormError>{error}</FormError> : null}
      </div>
    </Modal>
  );
}
