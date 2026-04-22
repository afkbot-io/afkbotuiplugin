import type { ChangeEvent, FormEvent } from "react";

import type { TextLibraryDraft } from "@/features/text-library/model/text-library.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";

export function TextLibraryEditorForm({
  cancelLabel = "Cancel",
  contentLabel,
  contentRows,
  draft,
  error,
  idLabel,
  idPlaceholder,
  idReadonly = false,
  onCancel,
  onChange,
  onSubmit,
  saving = false,
  submitLabel,
  submittingLabel,
}: {
  cancelLabel?: string;
  contentLabel: string;
  contentRows: number;
  draft: TextLibraryDraft;
  error: string;
  idLabel: string;
  idPlaceholder?: string;
  idReadonly?: boolean;
  onCancel: () => void;
  onChange: (nextDraft: TextLibraryDraft) => void;
  onSubmit: () => void;
  saving?: boolean;
  submitLabel: string;
  submittingLabel: string;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...draft,
      id: event.target.value,
    });
  };

  const handleContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({
      ...draft,
      content: event.target.value,
    });
  };

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
      <div className="detail-grid">
        <label className="field field--full">
          <span className="field__label">{idLabel}</span>
          <input
            className="input"
            name="name"
            onChange={handleIdChange}
            placeholder={idPlaceholder}
            readOnly={idReadonly}
            type="text"
            value={draft.id}
          />
        </label>
        <label className="field field--full">
          <span className="field__label">{contentLabel}</span>
          <textarea
            className="textarea textarea--code"
            name="content"
            onChange={handleContentChange}
            rows={contentRows}
            spellCheck={false}
            value={draft.content}
          />
        </label>
      </div>
      <div className="button-row">
        <AsyncButton className="button button--primary" idleLabel={submitLabel} loading={saving} pendingLabel={submittingLabel} type="submit" />
        <button className="button button--ghost" disabled={saving} onClick={onCancel} type="button">
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}
