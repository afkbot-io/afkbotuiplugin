import type { AutomationDraft } from "@/features/automations/model/automations.types";
import { AutomationFormFields } from "@/features/automations/ui/AutomationFormFields";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type AutomationCreateModalProps = {
  draft: AutomationDraft;
  error: string;
  onCancel: () => void;
  onDraftChange: (draft: AutomationDraft) => void;
  onSubmit: () => void;
  open: boolean;
  saving: boolean;
};

export function AutomationCreateModal({
  draft,
  error,
  onCancel,
  onDraftChange,
  onSubmit,
  open,
  saving,
}: AutomationCreateModalProps) {
  return (
    <ModalDialog
      busy={saving}
      closeLabel="Close automation modal"
      description="Keep automation setup in the same workspace shell, with the same fields, radii, and spacing used across Task Flow."
      eyebrow="Create Automation"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="New Automation"
      wide
    >
        {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
        <AutomationFormFields draft={draft} onDraftChange={onDraftChange} />
        <div className="button-row">
          <AsyncButton className="button button--primary" idleLabel="Create Automation" loading={saving} pendingLabel="Saving…" type="submit" />
          <button className="button button--ghost" disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
