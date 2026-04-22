import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type DeleteSelectedTasksModalProps = {
  busy: boolean;
  count: number;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
};

export function DeleteSelectedTasksModal({
  busy,
  count,
  error,
  onCancel,
  onConfirm,
  open,
}: DeleteSelectedTasksModalProps) {
  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close delete selected modal"
      description="This removes the selected tasks, including their runs, comments, events, and dependency edges."
      eyebrow="Delete Selected Tasks"
      onClose={onCancel}
      onSubmit={onConfirm}
      open={open}
      title={`Delete ${count} selected tasks`}
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <div className="button-row">
          <AsyncButton className="button button--danger" idleLabel="Delete Selected" loading={busy} pendingLabel="Deleting…" type="submit" />
          <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
