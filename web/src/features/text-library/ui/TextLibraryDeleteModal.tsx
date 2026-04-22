import type { TextLibraryItem, TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

export function TextLibraryDeleteModal({
  error,
  item,
  onClose,
  onConfirm,
  saving,
  ui,
}: {
  error: string;
  item: TextLibraryItem;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  ui: TextLibraryUiDefinition;
}) {
  return (
    <ModalDialog
      busy={saving}
      className="tl-modal"
      closeLabel={ui.closeDeleteLabel}
      eyebrow={ui.deleteEyebrow}
      onClose={onClose}
      onSubmit={onConfirm}
      open
      title={ui.deleteTitle(item)}
    >
        {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
        <p className="muted">{ui.deleteDescription(item)}</p>
        <div className="button-row">
          <AsyncButton
            className="button button--danger"
            idleLabel={ui.deleteSubmitLabel}
            loading={saving}
            pendingLabel={ui.deleteSubmittingLabel}
            type="submit"
          />
          <button className="button button--ghost" disabled={saving} onClick={onClose} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
