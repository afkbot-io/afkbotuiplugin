import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
import {
  resolveActorRefForType,
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_HUMAN_TYPE,
  TASK_FLOW_STATUS_OPTIONS,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProject,
  TaskFlowSubagent,
  TaskFlowTaskDraft,
} from "@/features/task-flow/model/task-flow.types";

type TaskFormFieldsProps = {
  config: TaskFlowConfig;
  draft: TaskFlowTaskDraft;
  flows?: TaskFlowProject[];
  onChange: (draft: TaskFlowTaskDraft) => void;
  profileId: string;
  profiles: TaskFlowProfile[];
  showBlockedReason?: boolean;
  showFlowField?: boolean;
  showStatus?: boolean;
  subagents: TaskFlowSubagent[];
};

export function TaskFormFields({
  config,
  draft,
  flows = [],
  onChange,
  profileId,
  profiles,
  showBlockedReason = false,
  showFlowField = false,
  showStatus = false,
  subagents,
}: TaskFormFieldsProps) {
  const handleFieldChange = <K extends keyof TaskFlowTaskDraft>(key: K, value: TaskFlowTaskDraft[K]) => {
    onChange({
      ...draft,
      [key]: value,
    });
  };

  const handleOwnerTypeChange = (ownerType: string) => {
    onChange({
      ...draft,
      owner_ref: resolveActorRefForType({
        config,
        currentRef: draft.owner_ref,
        previousType: draft.owner_type,
        profileId,
        profiles,
        subagents,
        type: ownerType,
      }),
      owner_type: ownerType,
    });
  };

  const handleReviewerTypeChange = (reviewerType: string) => {
    onChange({
      ...draft,
      reviewer_ref: resolveActorRefForType({
        allowBlank: true,
        config,
        currentRef: draft.reviewer_ref,
        previousType: draft.reviewer_type,
        profileId,
        profiles,
        subagents,
        type: reviewerType,
      }),
      reviewer_type: reviewerType,
    });
  };

  return (
    <>
      <label className="field">
        <span className="field__label">Title</span>
        <input maxLength={240} onChange={(event) => handleFieldChange("title", event.target.value)} required value={draft.title} />
      </label>
      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          maxLength={12000}
          onChange={(event) => handleFieldChange("description", event.target.value)}
          required
          rows={8}
          value={draft.description}
        />
      </label>
      <div className="field-grid">
        {showStatus ? (
          <label className="field field--compact">
            <span className="field__label">Status</span>
            <select onChange={(event) => handleFieldChange("status", event.target.value)} value={draft.status}>
              {TASK_FLOW_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showFlowField ? (
          <label className="field field--compact">
            <span className="field__label">Flow</span>
            <select onChange={(event) => handleFieldChange("flow_id", event.target.value)} value={draft.flow_id}>
              <option value="">All Flows</option>
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field field--compact">
          <span className="field__label">Priority</span>
          <input
            max="100"
            min="0"
            onChange={(event) => handleFieldChange("priority", event.target.value)}
            type="number"
            value={draft.priority}
          />
        </label>
      </div>
      <div className="field-grid">
        <label className="field field--compact">
          <span className="field__label">Owner Type</span>
          <select onChange={(event) => handleOwnerTypeChange(event.target.value)} value={draft.owner_type}>
            <option value="">None</option>
            <option value={TASK_FLOW_AI_PROFILE_TYPE}>AI Profile</option>
            <option value={TASK_FLOW_AI_SUBAGENT_TYPE}>Subagent</option>
            <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
          </select>
        </label>
        <ActorRefField
          config={config}
          label="Owner Ref"
          name="owner_ref"
          onChange={(value) => handleFieldChange("owner_ref", value)}
          profileId={profileId}
          profiles={profiles}
          subagents={subagents}
          typeValue={draft.owner_type}
          value={draft.owner_ref}
        />
      </div>
      <div className="field-grid">
        <label className="field field--compact">
          <span className="field__label">Reviewer Type</span>
          <select onChange={(event) => handleReviewerTypeChange(event.target.value)} value={draft.reviewer_type}>
            <option value="">None</option>
            <option value={TASK_FLOW_AI_PROFILE_TYPE}>AI Profile</option>
            <option value={TASK_FLOW_AI_SUBAGENT_TYPE}>Subagent</option>
            <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
          </select>
        </label>
        <ActorRefField
          allowBlank
          config={config}
          label="Reviewer Ref"
          name="reviewer_ref"
          onChange={(value) => handleFieldChange("reviewer_ref", value)}
          profileId={profileId}
          profiles={profiles}
          subagents={subagents}
          typeValue={draft.reviewer_type}
          value={draft.reviewer_ref}
        />
      </div>
      <div className="field-grid">
        <label className="field field--compact">
          <span className="field__label">Due At</span>
          <input onChange={(event) => handleFieldChange("due_at", event.target.value)} type="datetime-local" value={draft.due_at} />
        </label>
        <label className="field field--compact field--checkbox">
          <span className="field__label">Review</span>
          <span className="checkbox-row checkbox-row--compact">
            <input
              checked={draft.requires_review}
              onChange={(event) => handleFieldChange("requires_review", event.target.checked)}
              type="checkbox"
            />
            <span>Require review</span>
          </span>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Labels</span>
        <input onChange={(event) => handleFieldChange("labels", event.target.value)} value={draft.labels} />
      </label>
      {showFlowField ? (
        <label className="field">
          <span className="field__label">Depends On</span>
          <input
            onChange={(event) => handleFieldChange("depends_on_task_ids", event.target.value)}
            placeholder="task-id-1, task-id-2…"
            value={draft.depends_on_task_ids}
          />
        </label>
      ) : null}
      {showBlockedReason ? (
        <label className="field">
          <span className="field__label">Blocked Reason</span>
          <textarea
            onChange={(event) => handleFieldChange("blocked_reason_text", event.target.value)}
            rows={3}
            value={draft.blocked_reason_text}
          />
        </label>
      ) : null}
    </>
  );
}
