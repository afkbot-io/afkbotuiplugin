import {
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_TEAM_TEMPLATES,
  applyTaskFlowTeamTemplate,
  getTeamScopedProfiles,
  getTeamScopedSubagents,
  reconcileSettingsActorForTeam,
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
  teamProfiles: TaskFlowProfile[];
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
  teamProfiles,
}: TaskFlowSettingsModalProps) {
  const selectedTeamProfiles = new Set(draft.taskflow_team_profile_ids);
  const teammateOptions = teamProfiles.filter((profile) => String(profile.id || "").trim() && profile.id !== profileId);
  const actorProfiles = getTeamScopedProfiles(profileId, draft.taskflow_team_profile_ids, teamProfiles);
  const actorSubagents = getTeamScopedSubagents(profileId, draft.taskflow_team_profile_ids, subagents);
  const handleTeamProfileToggle = (teamProfileId: string, checked: boolean) => {
    const next = new Set(draft.taskflow_team_profile_ids);
    if (checked) {
      next.add(teamProfileId);
    } else {
      next.delete(teamProfileId);
    }
    onDraftChange(reconcileSettingsActorForTeam({
      config,
      draft: {
        ...draft,
        taskflow_team_profile_ids: [...next],
        taskflow_team_template: "custom",
      },
      profileId,
      profiles: teamProfiles,
      subagents,
    }));
  };
  const handleTeamTemplate = (templateId: string) => {
    const nextProfileIds = applyTaskFlowTeamTemplate(templateId, profileId, teamProfiles);
    onDraftChange(reconcileSettingsActorForTeam({
      config,
      draft: {
        ...draft,
        taskflow_team_profile_ids: nextProfileIds,
        taskflow_team_template: templateId,
      },
      profileId,
      profiles: teamProfiles,
      subagents,
    }));
  };

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
        profiles: actorProfiles.length ? actorProfiles : profiles,
        subagents: actorSubagents,
        type: actorType,
      }),
      task_flow_actor_type: actorType,
    });
  };

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close settings modal"
      description="Choose which AI team member the board acts as, then tune sync and board density."
      eyebrow="AI Team Settings"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="AI Team Settings"
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
              <option value={TASK_FLOW_AI_PROFILE_TYPE}>Team Orchestrator</option>
              <option value={TASK_FLOW_AI_SUBAGENT_TYPE}>Employee Subagent</option>
            </select>
          </label>
          <ActorRefField
            config={config}
            label="Team Member"
            name="task_flow_actor_ref"
            onChange={handleActorRefChange}
            profileId={profileId}
            profiles={actorProfiles.length ? actorProfiles : profiles}
            subagents={actorSubagents}
            typeValue={draft.task_flow_actor_type}
            value={draft.task_flow_actor_ref}
          />
        </div>
        <div className="inline-alert inline-alert--info">
          The AI profile is the orchestrator for this backlog. Subagents are employees that take one focused task at a time.
        </div>
        <div className="field">
          <span className="field__label">Team Profiles</span>
          <div className="timeline-list timeline-list--session">
            <div className="button-row button-row--wrap">
              {TASK_FLOW_TEAM_TEMPLATES.map((template) => (
                <button
                  className={`button button--ghost button--compact${draft.taskflow_team_template === template.id ? " is-active" : ""}`}
                  key={template.id}
                  onClick={() => handleTeamTemplate(template.id)}
                  title={template.description}
                  type="button"
                >
                  {template.label}
                </button>
              ))}
            </div>
            <article className="timeline-item timeline-item--session">
              <div className="timeline-item__head">
                <p>{profileId}</p>
                <span className="badge badge--ai">orchestrator</span>
              </div>
              <p className="timeline-item__copy">This profile owns planning, assignment, review routing, and flow completion.</p>
            </article>
            {teammateOptions.length ? (
              teammateOptions.map((profile) => {
                const teamProfileId = String(profile.id || "").trim();
                return (
                  <label className="checkbox-row checkbox-row--compact" key={teamProfileId}>
                    <input
                      checked={selectedTeamProfiles.has(teamProfileId)}
                      onChange={(event) => handleTeamProfileToggle(teamProfileId, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{profile.title || teamProfileId}</span>
                  </label>
                );
              })
            ) : (
              <p className="muted-copy">No additional AI profiles are available for this backlog.</p>
            )}
          </div>
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
