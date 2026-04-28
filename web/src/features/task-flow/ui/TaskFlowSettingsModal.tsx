import {
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_HUMAN_TYPE,
  resolveActorRefForType,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowSettingsDraft,
  TaskFlowSubagent,
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
  subagents: TaskFlowSubagent[];
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
  subagents,
}: TaskFlowSettingsModalProps) {
  const handleActorTypeChange = (actorType: string) => {
    onDraftChange({
      ...draft,
      task_flow_actor_ref: resolveActorRefForType({
        config,
        currentRef: draft.task_flow_actor_ref,
        previousType: draft.task_flow_actor_type,
        profileId,
        profiles,
        subagents,
        type: actorType,
      }),
      task_flow_actor_type: actorType,
    });
  };

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
            <select onChange={(event) => handleActorTypeChange(event.target.value)} value={draft.task_flow_actor_type}>
              <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
              <option value={TASK_FLOW_AI_PROFILE_TYPE}>AI Profile</option>
              <option value={TASK_FLOW_AI_SUBAGENT_TYPE}>Subagent</option>
            </select>
          </label>
          <ActorRefField
            config={config}
            label="Actor Ref"
            name="task_flow_actor_ref"
            onChange={(value) => onDraftChange({ ...draft, task_flow_actor_ref: value })}
            profileId={profileId}
            profiles={profiles}
            subagents={subagents}
            typeValue={draft.task_flow_actor_type}
            value={draft.task_flow_actor_ref}
          />
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
