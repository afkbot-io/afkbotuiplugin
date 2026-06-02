import {
  TASK_FLOW_EMPLOYEE_TYPE,
  TASK_FLOW_HUMAN_TYPE,
  resolveActorRefForType,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowSettingsDraft,
  TaskFlowEmployeeOption,
} from "@/features/task-flow/model/task-flow.types";
import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
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
  profileId,
  profiles,
  employees,
}: TaskFlowSettingsModalProps) {
  const handleActorRefChange = (value: string) => {
    onDraftChange({
      ...draft,
      task_flow_actor_ref: value,
    });
  };

  const handleActorTypeChange = (actorType: string) => {
    onDraftChange({
      ...draft,
      task_flow_actor_ref: resolveActorRefForType({
        config,
        currentRef: draft.task_flow_actor_ref,
        previousType: draft.task_flow_actor_type,
        profileId,
        profiles,
        employees,
        type: actorType,
      }),
      task_flow_actor_type: actorType,
    });
  };

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close settings modal"
      description="Choose which employee or operator the board acts as, then tune sync and board density."
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
            <span className="field__label">Team Role</span>
            <select onChange={(event) => handleActorTypeChange(event.target.value)} value={draft.task_flow_actor_type}>
              <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
              <option value={TASK_FLOW_EMPLOYEE_TYPE}>Employee</option>
            </select>
          </label>
          <ActorRefField
            config={config}
            label="Team Member"
            name="task_flow_actor_ref"
            onChange={handleActorRefChange}
            profileId={profileId}
            profiles={profiles}
            employees={employees}
            typeValue={draft.task_flow_actor_type}
            value={draft.task_flow_actor_ref}
          />
        </div>
        <div className="inline-alert inline-alert--info">
          Task Flow actions can be performed as a human operator or a profile-local employee.
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
