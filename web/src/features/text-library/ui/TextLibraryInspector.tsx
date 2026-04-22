import type { TextLibraryDraft, TextLibraryItem, TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";
import { TextLibraryEditorForm } from "@/features/text-library/ui/TextLibraryEditorForm";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

function renderBadges(badges: TextLibraryItem["detailBadges"]) {
  return badges
    .filter((badge) => badge.text)
    .map((badge) => (
      <span className={badge.className || "badge"} key={`${badge.className || "badge"}-${badge.text}`}>
        {badge.text}
      </span>
    ));
}

export function TextLibraryInspector({
  closeLabel,
  contentRows,
  draft,
  error,
  idReadonly,
  item,
  loading,
  mode,
  onCancelEdit,
  onChangeDraft,
  onClose,
  onDelete,
  onEdit,
  onSubmit,
  saving,
  ui,
}: {
  closeLabel: string;
  contentRows: number;
  draft: TextLibraryDraft;
  error: string;
  idReadonly: boolean;
  item: TextLibraryItem | null;
  loading: boolean;
  mode: "view" | "edit";
  onCancelEdit: () => void;
  onChangeDraft: (nextDraft: TextLibraryDraft) => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSubmit: () => void;
  saving: boolean;
  ui: TextLibraryUiDefinition;
}) {
  if (!item && !loading) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty__card">
          <div className="panel-section__title">{ui.inspectorEmptyTitle}</div>
          <p className="muted">{ui.inspectorEmptyDescription}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="task-pane">
        <div className="task-pane__shell">
          <SurfaceLoader message={ui.loadingItemLabel} />
        </div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  if (mode === "edit") {
    return (
      <div className="task-pane">
        <div className="task-pane__shell">
          <div className="task-pane__header">
            <div className="task-pane__heading">
              <div className="task-pane__eyebrow">{ui.editEyebrow}</div>
              <h2 className="task-pane__title">{item.id}</h2>
            </div>
            <button aria-label={closeLabel} className="icon-button" onClick={onClose} type="button">
              ×
            </button>
          </div>
          <TextLibraryEditorForm
            contentLabel={ui.contentLabel}
            contentRows={contentRows}
            draft={draft}
            error={error}
            idLabel={ui.idLabel}
            idReadonly={idReadonly}
            onCancel={onCancelEdit}
            onChange={onChangeDraft}
            onSubmit={onSubmit}
            saving={saving}
            submitLabel={ui.editSubmitLabel}
            submittingLabel={ui.editSubmittingLabel}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="task-pane">
      <div className="task-pane__shell">
        <div className="task-pane__header">
          <div className="task-pane__heading">
            <div className="task-pane__eyebrow">{ui.detailsEyebrow}</div>
            <h2 className="task-pane__title">{item.id}</h2>
            <div className="chip-row">{renderBadges(item.detailBadges)}</div>
          </div>
          <button aria-label={closeLabel} className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <section className="panel-section">
          <div className="panel-section__header">
            <div className="panel-section__title">{ui.summaryTitle}</div>
          </div>
          <div className="task-pane__description-copy">{item.summary || ui.emptySummaryLabel}</div>
        </section>
        <section className="panel-section">
          <div className="panel-section__header">
            <div className="panel-section__title">{ui.contentTitle}</div>
          </div>
          <pre className="prompt-block">{item.content || ""}</pre>
        </section>
        <div className="button-row">
          <button className="button button--primary" onClick={onEdit} type="button">
            Edit
          </button>
          <button className="button button--danger" onClick={onDelete} type="button">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
