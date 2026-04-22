import type { TaskFlowSettingsDraft } from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type TaskFlowSettingsModalProps = {
  busy: boolean;
  draft: TaskFlowSettingsDraft;
  error: string;
  onCancel: () => void;
  onDraftChange: (draft: TaskFlowSettingsDraft) => void;
  onSubmit: () => void;
  open: boolean;
};

export function TaskFlowSettingsModal({
  busy,
  draft,
  error,
  onCancel,
  onDraftChange,
  onSubmit,
  open,
}: TaskFlowSettingsModalProps) {
  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close settings modal"
      description="Tune background sync and board density without forcing a hard refresh of the whole page."
      eyebrow="Workspace Settings"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="Task Flow Settings"
    >
        {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
        <div className="field-grid">
          <label className="field field--compact">
            <span className="field__label">Poll Interval</span>
            <input
              max="300"
              min="1"
              onChange={(event) => onDraftChange({ ...draft, task_flow_poll_interval_sec: event.target.value })}
              type="number"
              value={draft.task_flow_poll_interval_sec}
            />
          </label>
          <label className="field field--compact">
            <span className="field__label">Board Limit</span>
            <input
              max="200"
              min="1"
              onChange={(event) => onDraftChange({ ...draft, task_flow_board_limit_per_column: event.target.value })}
              type="number"
              value={draft.task_flow_board_limit_per_column}
            />
          </label>
        </div>
        <div className="field-grid">
          <label className="field field--compact">
            <span className="field__label">Actor Type</span>
            <select onChange={(event) => onDraftChange({ ...draft, task_flow_actor_type: event.target.value })} value={draft.task_flow_actor_type}>
              <option value="human">human</option>
              <option value="ai_profile">ai_profile</option>
            </select>
          </label>
          <label className="field field--compact">
            <span className="field__label">Actor Ref</span>
            <input
              onChange={(event) => onDraftChange({ ...draft, task_flow_actor_ref: event.target.value })}
              value={draft.task_flow_actor_ref}
            />
          </label>
        </div>
        <div className="button-row">
          <AsyncButton className="button button--primary" idleLabel="Save Settings" loading={busy} pendingLabel="Saving…" type="submit" />
          <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
