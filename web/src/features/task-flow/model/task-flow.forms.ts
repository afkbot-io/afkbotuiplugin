import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProjectDraft,
  TaskFlowReviewDraft,
  TaskFlowSettingsDraft,
  TaskFlowSubagent,
  TaskFlowTeam,
  TaskFlowTask,
  TaskFlowTaskDraft,
} from "@/features/task-flow/model/task-flow.types";

export const TASK_FLOW_AI_PROFILE_TYPE = "ai_profile";
export const TASK_FLOW_AI_SUBAGENT_TYPE = "ai_subagent";
export const TASK_FLOW_SUBAGENT_ALIAS_TYPE = "subagent";
export const TASK_FLOW_HUMAN_TYPE = "human";
export const TASK_FLOW_RESERVED_SUBAGENTS = new Set(["orchestrator"]);
export const TASK_FLOW_TEAM_TEMPLATES = [
  {
    description: "Keep this backlog scoped to the current profile orchestrator.",
    id: "solo",
    label: "Solo",
  },
  {
    description: "Enable every available profile as a teammate.",
    id: "all",
    label: "All Profiles",
  },
  {
    description: "Prefer engineering, QA, review, docs, DevOps, architecture, and analysis profiles.",
    id: "delivery",
    label: "Delivery Team",
  },
] as const;

export const TASK_FLOW_STATUS_OPTIONS = ["plan", "todo", "blocked", "running", "review", "completed", "failed", "cancelled"] as const;

type ActorRefValidationContext = {
  profileId: string;
  profiles?: TaskFlowProfile[];
  subagents: TaskFlowSubagent[];
};
type ActorRefValidationLabel = "actor" | "default owner" | "owner" | "reviewer";

export function normalizeTaskFlowConfig(config: Record<string, unknown>): TaskFlowConfig {
  return {
    task_flow_actor_ref: String(config.task_flow_actor_ref || "web-user"),
    task_flow_actor_type: normalizeActorType(config.task_flow_actor_type || "human"),
    task_flow_board_limit_per_column: Number(config.task_flow_board_limit_per_column || 20),
    task_flow_poll_interval_sec: Number(config.task_flow_poll_interval_sec || 5),
  };
}

export function defaultProjectDraft(profiles: TaskFlowProfile[] = []): TaskFlowProjectDraft {
  return {
    default_owner_ref: getProfileIdFallback(profiles),
    default_owner_type: TASK_FLOW_AI_PROFILE_TYPE,
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
    owner_type: TASK_FLOW_AI_PROFILE_TYPE,
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
    owner_type: normalizeActorType(task.owner_type),
    priority: String(task.priority ?? 50),
    description: String(task.description || task.prompt || ""),
    requires_review: Boolean(task.requires_review),
    reviewer_ref: String(task.reviewer_ref || ""),
    reviewer_type: normalizeActorType(task.reviewer_type),
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

export function settingsDraftFromConfig(config: TaskFlowConfig, teamProfileIds: string[] = []): TaskFlowSettingsDraft {
  return {
    task_flow_actor_ref: config.task_flow_actor_ref,
    task_flow_actor_type: config.task_flow_actor_type,
    task_flow_board_limit_per_column: String(config.task_flow_board_limit_per_column),
    task_flow_poll_interval_sec: String(config.task_flow_poll_interval_sec),
    taskflow_team_template: "custom",
    taskflow_team_profile_ids: normalizeTeamProfileIds(teamProfileIds),
  };
}

export function validateProjectDraft(draft: TaskFlowProjectDraft, context?: ActorRefValidationContext) {
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
  const defaultOwnerError = validateAiActorRef(draft.default_owner_type, draft.default_owner_ref, "default owner", context);
  if (defaultOwnerError) {
    return defaultOwnerError;
  }
  return "";
}

export function validateTaskDraft(draft: TaskFlowTaskDraft, context?: ActorRefValidationContext) {
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
  const ownerError = validateAiActorRef(draft.owner_type, draft.owner_ref, "owner", context);
  if (ownerError) {
    return ownerError;
  }
  const reviewerError = validateAiActorRef(draft.reviewer_type, draft.reviewer_ref, "reviewer", context);
  if (reviewerError) {
    return reviewerError;
  }
  return "";
}

export function validateReviewDraft(draft: TaskFlowReviewDraft, context?: ActorRefValidationContext) {
  if (!draft.reason_text.trim()) {
    return "Change request reason is required.";
  }
  return validateAiActorRef(draft.owner_type, draft.owner_ref, "owner", context);
}

export function validateSettingsDraft(draft: TaskFlowSettingsDraft, context?: ActorRefValidationContext) {
  if (normalizeNumberField(draft.task_flow_poll_interval_sec, { fallback: null, min: 1, max: 300 }) === null) {
    return "Poll interval must be between 1 and 300 seconds.";
  }
  if (normalizeNumberField(draft.task_flow_board_limit_per_column, { fallback: null, min: 1, max: 200 }) === null) {
    return "Board limit must be between 1 and 200 tasks per column.";
  }
  const actorError = validateAiActorRef(draft.task_flow_actor_type, draft.task_flow_actor_ref, "actor", context);
  if (actorError) {
    return actorError;
  }
  return "";
}

export function buildSettingsPatch(draft: TaskFlowSettingsDraft) {
  return {
    task_flow_actor_ref: draft.task_flow_actor_ref.trim() || "web-user",
    task_flow_actor_type: normalizeActorType(draft.task_flow_actor_type) || "human",
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

export function buildTaskFlowTeamPatch(draft: TaskFlowSettingsDraft) {
  return {
    taskflow_team_profile_ids: normalizeTeamProfileIds(draft.taskflow_team_profile_ids),
  };
}

export function applyTaskFlowTeamTemplate(
  templateId: string,
  profileId: string,
  profiles: TaskFlowProfile[],
) {
  const normalizedProfileId = String(profileId || "").trim();
  const teammates = profiles.filter((profile) => {
    const candidateId = String(profile.id || "").trim();
    return candidateId && candidateId !== normalizedProfileId;
  });
  if (templateId === "solo") {
    return [];
  }
  if (templateId === "all") {
    return teammates.map((profile) => String(profile.id || "").trim());
  }
  if (templateId === "delivery") {
    const deliveryPattern = /(architect|backend|frontend|engineer|devops|ops|qa|quality|review|docs|writer|analyst|analysis|product|design)/i;
    const matched = teammates
      .filter((profile) => deliveryPattern.test(`${profile.id || ""} ${profile.title || ""}`))
      .map((profile) => String(profile.id || "").trim());
    return matched.length ? matched : teammates.map((profile) => String(profile.id || "").trim());
  }
  return normalizeTeamProfileIds([]);
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

export function getTaskFlowAllowedProfiles(profileId: string, profiles: TaskFlowProfile[], team: TaskFlowTeam | null | undefined) {
  const allowed = new Set(
    (team?.allowed_profile_ids?.length ? team.allowed_profile_ids : [profileId])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
  const result = profiles.filter((profile) => allowed.has(String(profile.id || "").trim()));
  if (result.length) {
    return result;
  }
  return profiles.filter((profile) => String(profile.id || "").trim() === profileId);
}

export function normalizeTeamProfileIds(value: unknown) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set<string>();
  return values.flatMap((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

export function normalizeActorRef(type: unknown, value: unknown, config: TaskFlowConfig) {
  const normalizedType = normalizeActorType(type);
  const normalizedValue = String(value || "").trim();
  if (!normalizedType) {
    return null;
  }
  if (normalizedType === TASK_FLOW_HUMAN_TYPE) {
    return normalizedValue || config.task_flow_actor_ref;
  }
  return normalizedValue || null;
}

export function normalizeActorType(value: unknown) {
  const normalized = String(value || "").trim();
  if (normalized === TASK_FLOW_SUBAGENT_ALIAS_TYPE) {
    return TASK_FLOW_AI_SUBAGENT_TYPE;
  }
  return normalized;
}

export function isAiExecutorActorType(value: unknown) {
  const normalized = normalizeActorType(value);
  return normalized === TASK_FLOW_AI_PROFILE_TYPE || normalized === TASK_FLOW_AI_SUBAGENT_TYPE;
}

export function getSubagentOwnerRefOptions(profileId: string, subagents: TaskFlowSubagent[]) {
  const normalizedProfileId = String(profileId || "").trim() || "default";
  const seen = new Set<string>();
  return subagents.flatMap((subagent) => {
    const name = String(subagent.name || "").trim();
    if (!name || TASK_FLOW_RESERVED_SUBAGENTS.has(name)) {
      return [];
    }
    const ownerProfileId = String(subagent.profile_id || "").trim() || normalizedProfileId;
    const value = String(subagent.owner_ref || "").trim() || `${ownerProfileId}:${name}`;
    if (seen.has(value)) {
      return [];
    }
    seen.add(value);
    return [
      {
        label: ownerProfileId === normalizedProfileId ? name : `${ownerProfileId}:${name}`,
        profileId: ownerProfileId,
        summary: String(subagent.summary || "").trim(),
        value,
      },
    ];
  });
}

export function getTeamScopedSubagents(
  profileId: string,
  teamProfileIds: string[],
  subagents: TaskFlowSubagent[],
) {
  const allowedProfileIds = new Set([String(profileId || "").trim() || "default", ...normalizeTeamProfileIds(teamProfileIds)]);
  return subagents.filter((subagent) => {
    const ownerProfileId = String(subagent.profile_id || "").trim() || profileId || "default";
    return allowedProfileIds.has(ownerProfileId);
  });
}

export function getTeamScopedProfiles(
  profileId: string,
  teamProfileIds: string[],
  profiles: TaskFlowProfile[],
) {
  const allowedProfileIds = new Set([String(profileId || "").trim() || "default", ...normalizeTeamProfileIds(teamProfileIds)]);
  const scopedProfiles = profiles.filter((profile) => allowedProfileIds.has(String(profile.id || "").trim()));
  return scopedProfiles.length ? scopedProfiles : profiles.filter((profile) => String(profile.id || "").trim() === profileId);
}

export function reconcileSettingsActorForTeam({
  config,
  draft,
  profileId,
  profiles,
  subagents,
}: {
  config: TaskFlowConfig;
  draft: TaskFlowSettingsDraft;
  profileId: string;
  profiles: TaskFlowProfile[];
  subagents: TaskFlowSubagent[];
}) {
  const teamProfileIds = normalizeTeamProfileIds(draft.taskflow_team_profile_ids);
  const scopedProfiles = getTeamScopedProfiles(profileId, teamProfileIds, profiles);
  const scopedSubagents = getTeamScopedSubagents(profileId, teamProfileIds, subagents);
  return {
    ...draft,
    task_flow_actor_ref: resolveActorRefForType({
      config,
      currentRef: draft.task_flow_actor_ref,
      previousType: draft.task_flow_actor_type,
      profileId,
      profiles: scopedProfiles,
      subagents: scopedSubagents,
      type: draft.task_flow_actor_type,
    }),
    taskflow_team_profile_ids: teamProfileIds,
  };
}

export function resolveActorRefForType({
  allowBlank = false,
  config,
  currentRef,
  profiles,
  profileId,
  previousType,
  subagents,
  type,
}: {
  allowBlank?: boolean;
  config: TaskFlowConfig;
  currentRef: unknown;
  previousType?: unknown;
  profiles: TaskFlowProfile[];
  profileId: string;
  subagents: TaskFlowSubagent[];
  type: unknown;
}) {
  const normalizedType = normalizeActorType(type);
  const normalizedPreviousType = normalizeActorType(previousType);
  const normalizedRef = String(currentRef || "").trim();
  if (!normalizedType) {
    return "";
  }
  if (normalizedType === TASK_FLOW_AI_PROFILE_TYPE) {
    const profileIds = new Set(profiles.map((profile) => String(profile.id || "").trim()).filter(Boolean));
    return profileIds.has(normalizedRef) ? normalizedRef : getProfileIdFallback(profiles);
  }
  if (normalizedType === TASK_FLOW_AI_SUBAGENT_TYPE) {
    const options = getSubagentOwnerRefOptions(profileId, subagents);
    const currentRefIsValid = options.some((option) => option.value === normalizedRef);
    if (normalizedPreviousType === normalizedType && isCanonicalSubagentOwnerRef(normalizedRef) && currentRefIsValid) {
      return normalizedRef;
    }
    return options[0]?.value || (allowBlank ? "" : "");
  }
  if (normalizedType === TASK_FLOW_HUMAN_TYPE) {
    if (normalizedPreviousType === normalizedType && normalizedRef) {
      return normalizedRef;
    }
    return config.task_flow_actor_ref || "web-user";
  }
  return normalizedRef;
}

export function isCanonicalSubagentOwnerRef(value: unknown) {
  const normalized = String(value || "").trim();
  const parts = normalized.split(":");
  return parts.length === 2 && Boolean(parts[0]?.trim()) && Boolean(parts[1]?.trim());
}

function validateAiActorRef(
  type: unknown,
  ref: unknown,
  label: ActorRefValidationLabel,
  context?: ActorRefValidationContext,
) {
  const normalizedType = normalizeActorType(type);
  if (normalizedType === TASK_FLOW_AI_PROFILE_TYPE) {
    return validateAiProfileActorRef(ref, label, context);
  }
  if (normalizedType === TASK_FLOW_AI_SUBAGENT_TYPE) {
    return validateSubagentActorRef(ref, label, context);
  }
  return "";
}

function validateAiProfileActorRef(ref: unknown, label: ActorRefValidationLabel, context?: ActorRefValidationContext) {
  const normalizedRef = String(ref || "").trim();
  if (!normalizedRef) {
    return `AI profile ${label} is required.`;
  }
  if (!context?.profiles?.length) {
    return "";
  }
  const validRefs = new Set(context.profiles.map((profile) => String(profile.id || "").trim()).filter(Boolean));
  if (!validRefs.has(normalizedRef)) {
    return `Select a Task Flow team profile for ${label}.`;
  }
  return "";
}

function validateSubagentActorRef(ref: unknown, label: ActorRefValidationLabel, context?: ActorRefValidationContext) {
  const normalizedRef = String(ref || "").trim();
  if (!normalizedRef) {
    return `Subagent ${label} is required.`;
  }
  if (!isCanonicalSubagentOwnerRef(normalizedRef)) {
    return `Subagent ${label} must use <profile_id>:<subagent_name>.`;
  }
  if (!context) {
    return "";
  }
  const validRefs = new Set(getSubagentOwnerRefOptions(context.profileId, context.subagents).map((option) => option.value));
  if (validRefs.size && !validRefs.has(normalizedRef)) {
    return `Select a valid subagent ${label}.`;
  }
  return "";
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
