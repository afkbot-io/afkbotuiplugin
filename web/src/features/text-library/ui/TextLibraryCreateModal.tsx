import type { TextLibraryDraft, TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";
import { TextLibraryEditorForm } from "@/features/text-library/ui/TextLibraryEditorForm";
import { ModalDialog } from "@/shared/ui/ModalDialog";

export function TextLibraryCreateModal({
  contentRows,
  draft,
  error,
  idFieldReadonly,
  onChangeDraft,
  onClose,
  onSubmit,
  saving,
  ui,
}: {
  contentRows: number;
  draft: TextLibraryDraft;
  error: string;
  idFieldReadonly: boolean;
  onChangeDraft: (nextDraft: TextLibraryDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  ui: TextLibraryUiDefinition;
}) {
  return (
    <ModalDialog
      busy={saving}
      className="tl-modal"
      closeLabel={ui.closeModalLabel}
      description={ui.createDescription}
      eyebrow={ui.createEyebrow}
      onClose={onClose}
      open
      title={ui.createTitle}
      wide
    >
        <TextLibraryEditorForm
          contentLabel={ui.contentLabel}
          contentRows={contentRows}
          draft={draft}
          error={error}
          idLabel={ui.idLabel}
          idPlaceholder={ui.idPlaceholder}
          idReadonly={idFieldReadonly}
          onCancel={onClose}
          onChange={onChangeDraft}
          onSubmit={onSubmit}
          saving={saving}
          submitLabel={ui.createSubmitLabel}
          submittingLabel={ui.createSubmittingLabel}
        />
    </ModalDialog>
  );
}
