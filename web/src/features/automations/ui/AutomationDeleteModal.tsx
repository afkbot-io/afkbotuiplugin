import type { Automation } from "@/features/automations/model/automations.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type AutomationDeleteModalProps = {
  automation: Automation | null;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  saving: boolean;
};

export function AutomationDeleteModal({
  automation,
  error,
  onCancel,
  onConfirm,
  open,
  saving,
}: AutomationDeleteModalProps) {
  if (!open || !automation) {
    return null;
  }

  return (
    <ModalDialog
      busy={saving}
      closeLabel="Close delete automation modal"
      description="This removes the automation from active use for the current profile. The action stays inside the same workspace instead of using a browser confirm."
      eyebrow="Delete Automation"
      onClose={onCancel}
      onSubmit={onConfirm}
      open={open}
      title={`Delete ${automation.name}`}
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <div className="button-row">
          <AsyncButton className="button button--danger" idleLabel="Delete Automation" loading={saving} pendingLabel="Deleting…" type="submit" />
          <button className="button button--ghost" disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
