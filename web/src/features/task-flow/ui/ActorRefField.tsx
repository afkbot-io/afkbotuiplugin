import type { TaskFlowConfig, TaskFlowProfile, TaskFlowSubagent } from "@/features/task-flow/model/task-flow.types";
import {
  getProfileIdFallback,
  getSubagentOwnerRefOptions,
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_HUMAN_TYPE,
} from "@/features/task-flow/model/task-flow.api";

type ActorRefFieldProps = {
  allowBlank?: boolean;
  config: TaskFlowConfig;
  label: string;
  name: string;
  profileId: string;
  profiles: TaskFlowProfile[];
  subagents: TaskFlowSubagent[];
  typeValue: string;
  value: string;
  onChange: (value: string) => void;
};

export function ActorRefField({
  allowBlank = false,
  config,
  label,
  name,
  onChange,
  profileId,
  profiles,
  subagents,
  typeValue,
  value,
}: ActorRefFieldProps) {
  if (typeValue === TASK_FLOW_AI_PROFILE_TYPE) {
    return (
      <label className="field field--compact">
        <span className="field__label">{label}</span>
        <select name={name} onChange={(event) => onChange(event.target.value)} value={value}>
          {allowBlank ? <option value="">None</option> : null}
          {profiles.map((profile) => (
            <option key={profile.id || "unknown"} value={profile.id || ""}>
              {profile.title || profile.id || "profile"}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (typeValue === TASK_FLOW_AI_SUBAGENT_TYPE) {
    const options = getSubagentOwnerRefOptions(profileId || getProfileIdFallback(profiles), subagents);
    const hasCurrentValue = Boolean(value && !options.some((option) => option.value === value));
    const emptyLabel = allowBlank ? "None" : options.length ? "Select subagent" : "No subagents available";
    return (
      <label className="field field--compact">
        <span className="field__label">{label}</span>
        <select
          disabled={!options.length && !value}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {allowBlank || !value || !options.length ? <option disabled={!allowBlank} value="">{emptyLabel}</option> : null}
          {hasCurrentValue ? <option value={value}>{formatSubagentRefLabel(value)}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.summary ? `${option.label} (${option.summary})` : option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (typeValue === TASK_FLOW_HUMAN_TYPE) {
    return (
      <label className="field field--compact">
        <span className="field__label">{label}</span>
        <input
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={config.task_flow_actor_ref || "web-user"}
          value={value}
        />
      </label>
    );
  }

  return (
    <label className="field field--compact">
      <span className="field__label">{label}</span>
      <input disabled name={name} value={value} />
    </label>
  );
}

function formatSubagentRefLabel(value: string) {
  const normalized = String(value || "").trim();
  const [, subagentName] = normalized.split(":");
  return subagentName || normalized || "Subagent";
}
