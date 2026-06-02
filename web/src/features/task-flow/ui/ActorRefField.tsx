import type { TaskFlowConfig, TaskFlowProfile, TaskFlowEmployeeOption } from "@/features/task-flow/model/task-flow.types";
import {
  getProfileIdFallback,
  getEmployeeOwnerRefOptions,
  TASK_FLOW_EMPLOYEE_TYPE,
  TASK_FLOW_HUMAN_TYPE,
} from "@/features/task-flow/model/task-flow.api";

type ActorRefFieldProps = {
  allowBlank?: boolean;
  config: TaskFlowConfig;
  label: string;
  name: string;
  profileId: string;
  profiles: TaskFlowProfile[];
  employees: TaskFlowEmployeeOption[];
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
  employees,
  typeValue,
  value,
}: ActorRefFieldProps) {
  if (typeValue === TASK_FLOW_EMPLOYEE_TYPE) {
    const options = getEmployeeOwnerRefOptions(profileId || getProfileIdFallback(profiles), employees);
    const hasCurrentValue = Boolean(value && !options.some((option) => option.value === value));
    const emptyLabel = allowBlank ? "None" : options.length ? "Select employee" : "No employees available";
    return (
      <label className="field field--compact">
        <span className="field__label">{label}</span>
        <select disabled={!options.length && !value} name={name} onChange={(event) => onChange(event.target.value)} value={value}>
          {allowBlank || !value || !options.length ? <option disabled={!allowBlank} value="">{emptyLabel}</option> : null}
          {hasCurrentValue ? <option value={value}>{value}</option> : null}
          {options.map((option) => (
            <option
              disabled={option.status !== "active"}
              key={option.value}
              value={option.value}
            >
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
