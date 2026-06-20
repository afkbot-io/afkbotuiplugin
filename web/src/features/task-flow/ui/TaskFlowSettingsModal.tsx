import {
  TASK_FLOW_HUMAN_TYPE,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowSettingsDraft,
  TaskFlowEmployeeOption,
} from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type TaskFlowSettingsModalProps = {
  busy: boolean;
  config: TaskFlowConfig;
  draft: TaskFlowSettingsDraft;
  error: string;
  onCancel: () => void;
  onDraftChange: (draft: TaskFlowSettingsDraft) => void;
  onSubmit: () => void;
  open: boolean;
  profileId: string;
  profiles: TaskFlowProfile[];
  employees: TaskFlowEmployeeOption[];
};

export function TaskFlowSettingsModal({
  busy,
  config,
  draft,
  error,
  onCancel,
  onDraftChange,
  onSubmit,
  open,
}: TaskFlowSettingsModalProps) {
  const handleActorTypeChange = (actorType: string) => {
    onDraftChange({
      ...draft,
      task_flow_actor_ref: config.task_flow_actor_ref || "web-user",
      task_flow_actor_type: actorType,
    });
  };

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close settings modal"
      description="Choose the public operator identity, then tune sync and board density."
      eyebrow="Task Flow Settings"
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
            <span className="field__label">Operator Role</span>
            <select onChange={(event) => handleActorTypeChange(event.target.value)} value={draft.task_flow_actor_type}>
              <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
            </select>
          </label>
          <label className="field field--compact">
            <span className="field__label">Operator</span>
            <input
              aria-readonly="true"
              disabled
              name="task_flow_actor_ref"
              value={config.task_flow_actor_ref || "web-user"}
            />
          </label>
        </div>
        <div className="inline-alert inline-alert--info">
          Public UI actions are attributed to a validated human operator. Employees act only from trusted Task Flow runtime sessions.
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
