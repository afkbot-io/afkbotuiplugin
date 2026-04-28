import type { TaskFlowConfig, TaskFlowProfile } from "@/features/task-flow/model/task-flow.types";
import {
  getProfileIdFallback,
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_HUMAN_TYPE,
} from "@/features/task-flow/model/task-flow.api";

type ActorRefFieldProps = {
  allowBlank?: boolean;
  config: TaskFlowConfig;
  label: string;
  name: string;
  profiles: TaskFlowProfile[];
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
  profiles,
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
    return (
      <label className="field field--compact">
        <span className="field__label">{label}</span>
        <input
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`${getProfileIdFallback(profiles)}:researcher`}
          value={value}
        />
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
