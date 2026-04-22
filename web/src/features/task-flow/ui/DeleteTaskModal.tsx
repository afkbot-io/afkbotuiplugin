import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type DeleteTaskModalProps = {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function DeleteTaskModal({ busy, error, onCancel, onConfirm, open, title }: DeleteTaskModalProps) {
  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close delete task modal"
      description="This removes the task, its runs, comments, events, and dependency edges for the current profile."
      eyebrow="Delete Task"
      onClose={onCancel}
      onSubmit={onConfirm}
      open={open}
      title={`Delete ${title}`}
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <div className="button-row">
          <AsyncButton className="button button--danger" idleLabel="Delete Task" loading={busy} pendingLabel="Deleting…" type="submit" />
          <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
