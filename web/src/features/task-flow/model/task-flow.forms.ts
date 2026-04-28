import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProjectDraft,
  TaskFlowReviewDraft,
  TaskFlowSettingsDraft,
  TaskFlowTask,
  TaskFlowTaskDraft,
} from "@/features/task-flow/model/task-flow.types";

export const TASK_FLOW_STATUS_OPTIONS = ["plan", "todo", "blocked", "running", "review", "completed", "failed", "cancelled"] as const;

export function normalizeTaskFlowConfig(config: Record<string, unknown>): TaskFlowConfig {
  return {
    task_flow_actor_ref: String(config.task_flow_actor_ref || "web-user"),
    task_flow_actor_type: String(config.task_flow_actor_type || "human"),
    task_flow_board_limit_per_column: Number(config.task_flow_board_limit_per_column || 20),
    task_flow_poll_interval_sec: Number(config.task_flow_poll_interval_sec || 5),
  };
}

export function defaultProjectDraft(profiles: TaskFlowProfile[] = []): TaskFlowProjectDraft {
  return {
    default_owner_ref: getProfileIdFallback(profiles),
    default_owner_type: "ai_profile",
    description: "",
    labels: "",
    title: "",
  };
}

export function defaultTaskDraft(config: TaskFlowConfig, profiles: TaskFlowProfile[] = [], flowId = ""): TaskFlowTaskDraft {
  void config;
  return {
    blocked_reason_text: "",
    depends_on_task_ids: "",
    due_at: "",
    flow_id: flowId,
    labels: "",
    owner_ref: getProfileIdFallback(profiles),
    owner_type: "ai_profile",
    priority: "50",
    description: "",
    requires_review: true,
    reviewer_ref: "",
    reviewer_type: "",
    status: "todo",
    title: "",
  };
}

export function taskDraftFromTask(task: TaskFlowTask): TaskFlowTaskDraft {
  return {
    blocked_reason_text: String(task.blocked_reason_text || ""),
    depends_on_task_ids: "",
    due_at: toDateTimeLocal(task.due_at),
    flow_id: String(task.flow_id || ""),
    labels: (task.labels || []).join(", "),
    owner_ref: String(task.owner_ref || ""),
    owner_type: String(task.owner_type || ""),
    priority: String(task.priority ?? 50),
    description: String(task.description || task.prompt || ""),
    requires_review: Boolean(task.requires_review),
    reviewer_ref: String(task.reviewer_ref || ""),
    reviewer_type: String(task.reviewer_type || ""),
    status: String(task.status || "todo"),
    title: String(task.title || ""),
  };
}

export function defaultReviewDraft(): TaskFlowReviewDraft {
  return {
    owner_ref: "",
    owner_type: "",
    reason_text: "",
  };
}

export function settingsDraftFromConfig(config: TaskFlowConfig): TaskFlowSettingsDraft {
  return {
    task_flow_actor_ref: config.task_flow_actor_ref,
    task_flow_actor_type: config.task_flow_actor_type,
    task_flow_board_limit_per_column: String(config.task_flow_board_limit_per_column),
    task_flow_poll_interval_sec: String(config.task_flow_poll_interval_sec),
  };
}

export function validateProjectDraft(draft: TaskFlowProjectDraft) {
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (!title) {
    return "Flow title is required.";
  }
  if (title.length > 240) {
    return "Flow title must be 240 characters or less.";
  }
  if (description.length > 2000) {
    return "Flow description must be 2000 characters or less.";
  }
  return "";
}

export function validateTaskDraft(draft: TaskFlowTaskDraft) {
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (!title) {
    return "Task title is required.";
  }
  if (!description) {
    return "Task description is required.";
  }
  if (title.length > 240) {
    return "Task title must be 240 characters or less.";
  }
  if (description.length > 12000) {
    return "Task description must be 12000 characters or less.";
  }
  if (normalizeNumberField(draft.priority, { fallback: null, min: 0, max: 100 }) === null) {
    return "Task priority must be between 0 and 100.";
  }
  if (draft.due_at.trim()) {
    const date = new Date(draft.due_at);
    if (Number.isNaN(date.getTime())) {
      return "Due date must be a valid date and time.";
    }
  }
  return "";
}

export function validateSettingsDraft(draft: TaskFlowSettingsDraft) {
  if (normalizeNumberField(draft.task_flow_poll_interval_sec, { fallback: null, min: 1, max: 300 }) === null) {
    return "Poll interval must be between 1 and 300 seconds.";
  }
  if (normalizeNumberField(draft.task_flow_board_limit_per_column, { fallback: null, min: 1, max: 200 }) === null) {
    return "Board limit must be between 1 and 200 tasks per column.";
  }
  return "";
}

export function buildSettingsPatch(draft: TaskFlowSettingsDraft) {
  return {
    task_flow_actor_ref: draft.task_flow_actor_ref.trim() || "web-user",
    task_flow_actor_type: draft.task_flow_actor_type.trim() || "human",
    task_flow_board_limit_per_column: normalizeNumberField(draft.task_flow_board_limit_per_column, {
      fallback: 20,
      max: 200,
      min: 1,
    }) ?? 20,
    task_flow_poll_interval_sec: normalizeNumberField(draft.task_flow_poll_interval_sec, {
      fallback: 5,
      max: 300,
      min: 1,
    }) ?? 5,
  };
}

export function parseCsv(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeNumberField(
  value: unknown,
  {
    fallback = null,
    max = Number.POSITIVE_INFINITY,
    min = Number.NEGATIVE_INFINITY,
  }: {
    fallback?: number | null;
    max?: number;
    min?: number;
  } = {},
) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return null;
  }
  return numeric;
}

export function getProfileIdFallback(profiles: TaskFlowProfile[]) {
  return profiles.find((item) => item.is_default)?.id || profiles[0]?.id || "default";
}

export function normalizeActorRef(type: unknown, value: unknown, config: TaskFlowConfig) {
  const normalizedType = String(type || "").trim();
  const normalizedValue = String(value || "").trim();
  if (!normalizedType) {
    return null;
  }
  if (normalizedType === "human") {
    return normalizedValue || config.task_flow_actor_ref;
  }
  return normalizedValue || null;
}

export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
