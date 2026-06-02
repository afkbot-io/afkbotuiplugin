import { formatDateTime } from "@/shared/lib/time";

import type {
  TaskFlowProject,
  TaskFlowSession,
  TaskFlowTask,
  TaskSessionInsights,
  TaskSessionProgressEvent,
} from "@/features/task-flow/model/task-flow.types";
import {
  TASK_FLOW_EMPLOYEE_TYPE,
  TASK_FLOW_HUMAN_TYPE,
  normalizeActorType,
} from "@/features/task-flow/model/task-flow.forms";

const TONE_STATUS_OPTIONS = new Set(["plan", "todo", "blocked", "claimed", "running", "review", "completed", "failed", "cancelled"]);

export function isActiveRuntimeStatus(status: string | null | undefined) {
  return ["claimed", "running"].includes(String(status || "").trim());
}

export function isOverdue(task: TaskFlowTask) {
  return Boolean(task.due_at) && new Date(String(task.due_at)) < new Date() && !["completed", "failed", "cancelled"].includes(task.status);
}

export function formatStatusLabel(status: string | null | undefined) {
  const normalized = String(status || "").trim();
  if (!normalized) {
    return "Unknown";
  }
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function taskStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status || "").trim();
  if (normalized === "running") {
    return "badge--running";
  }
  if (normalized === "plan") {
    return "badge--accent";
  }
  if (normalized === "blocked") {
    return "badge--warning";
  }
  if (normalized === "review") {
    return "badge--review";
  }
  if (normalized === "completed") {
    return "badge--success";
  }
  if (normalized === "failed") {
    return "badge--failed";
  }
  return "badge--muted";
}

export function statusToneClass(prefix: string, status: string | null | undefined) {
  const normalized = String(status || "").trim();
  return TONE_STATUS_OPTIONS.has(normalized) ? `${prefix}--${normalized}` : "";
}

export function formatTaskOwnerSummary(task: TaskFlowTask) {
  const ownerType = normalizeActorType(task.owner_type);
  const ownerRef = String(task.owner_ref || "").trim();
  const reviewerType = normalizeActorType(task.reviewer_type);
  const reviewerRef = String(task.reviewer_ref || "").trim();
  const reviewerSummary = formatReviewerSummary(reviewerType, reviewerRef);
  if (String(task.status || "").trim() === "review" && reviewerSummary) {
    return reviewerSummary;
  }
  if (ownerType === TASK_FLOW_EMPLOYEE_TYPE) {
    return ownerRef ? `Owner: Employee ${ownerRef}` : "Owner: Employee";
  }
  if (ownerType === TASK_FLOW_HUMAN_TYPE) {
    return ownerRef ? `Owner: ${ownerRef}` : "Owner: Human";
  }
  return reviewerSummary || "Owner: Unassigned";
}

function formatReviewerSummary(reviewerType: string, reviewerRef: string) {
  if (reviewerType === TASK_FLOW_EMPLOYEE_TYPE) {
    return reviewerRef ? `Reviewer: Employee ${reviewerRef}` : "Reviewer: Employee";
  }
  if (reviewerType === TASK_FLOW_HUMAN_TYPE) {
    return reviewerRef ? `Reviewer: ${reviewerRef}` : "Reviewer: Human";
  }
  return "";
}

const TASK_PRIORITY_LABELS = [
  "Lowest <<",
  "Very Low <",
  "Low <",
  "Below <=",
  "Normal =",
  "Steady =",
  "Raised >=",
  "High >",
  "Very High >>",
  "Critical >>",
] as const;

export function formatTaskPriorityLabel(priority: unknown) {
  const value = normalizePriorityScore(priority);
  const index = Math.min(TASK_PRIORITY_LABELS.length - 1, Math.floor(value / 10));
  return TASK_PRIORITY_LABELS[index];
}

export function formatTaskPriorityTitle(priority: unknown) {
  return `Priority score: ${normalizePriorityScore(priority)}/100`;
}

function normalizePriorityScore(priority: unknown) {
  const parsed = Number(priority ?? 50);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function formatFlowOwnerSummary(flow: TaskFlowProject) {
  const ownerType = normalizeActorType(flow.default_owner_type);
  const ownerRef = String(flow.default_owner_ref || "").trim();
  if (ownerType === TASK_FLOW_EMPLOYEE_TYPE) {
    return ownerRef ? `Default owner: Employee ${ownerRef}` : "Default owner: Employee";
  }
  if (ownerType === TASK_FLOW_HUMAN_TYPE) {
    return ownerRef ? `Default owner: ${ownerRef}` : "Default owner: Human";
  }
  return "Default owner: Manual assignment";
}

export function formatFlowCreatorSummary(flow: TaskFlowProject) {
  const creatorType = normalizeActorType(flow.created_by_type);
  const creatorRef = String(flow.created_by_ref || "").trim();
  if (creatorType === TASK_FLOW_EMPLOYEE_TYPE) {
    return creatorRef ? `Created by: Employee ${creatorRef}` : "Created by: Employee";
  }
  if (creatorType === TASK_FLOW_HUMAN_TYPE) {
    return creatorRef ? `Created by: ${creatorRef}` : "Created by: Human";
  }
  return creatorRef ? `Created by: ${creatorRef}` : "Created by: Unknown";
}

export function formatEmployeeOwnerRef(ownerRef: string) {
  const normalized = String(ownerRef || "").trim();
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex !== normalized.lastIndexOf(":") || separatorIndex === normalized.length - 1) {
    return normalized;
  }
  const profileId = normalized.slice(0, separatorIndex);
  const employeeName = normalized.slice(separatorIndex + 1);
  return `${employeeName} (${profileId})`;
}

export function formatFlowStatusSummary(flow: TaskFlowProject) {
  const status = String(flow.status || "").trim();
  return status ? `Status: ${capitalizeWord(status)}` : "Status: Active";
}

export function normalizeInlineText(value: unknown) {
  return String(value || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\n", "\n")
    .replaceAll("\t", " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function truncate(value: unknown, maxLength: number) {
  const normalized = normalizeInlineText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildFlowSearchText(flow: TaskFlowProject) {
  return [
    flow.title,
    flow.id,
    flow.description,
    flow.status,
    ...(Array.isArray(flow.labels) ? flow.labels : []),
    formatFlowOwnerSummary(flow),
    formatFlowCreatorSummary(flow),
  ]
    .map((value) => normalizeInlineText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function scoreFlowSearchMatch(flow: TaskFlowProject, query: string) {
  if (!query) {
    return 0;
  }
  const title = normalizeInlineText(flow.title).toLowerCase();
  const id = normalizeInlineText(flow.id).toLowerCase();
  const description = normalizeInlineText(flow.description).toLowerCase();
  const status = normalizeInlineText(flow.status).toLowerCase();
  const labels = Array.isArray(flow.labels) ? flow.labels.map((label) => normalizeInlineText(label).toLowerCase()) : [];
  const owner = normalizeInlineText(formatFlowOwnerSummary(flow)).toLowerCase();
  const creator = normalizeInlineText(formatFlowCreatorSummary(flow)).toLowerCase();

  if (title === query || id === query) {
    return 120;
  }
  if (labels.includes(query)) {
    return 110;
  }
  if (title.startsWith(query) || id.startsWith(query)) {
    return 100;
  }
  if (labels.some((label) => label.startsWith(query))) {
    return 90;
  }
  if (title.includes(query) || id.includes(query)) {
    return 80;
  }
  if (labels.some((label) => label.includes(query))) {
    return 70;
  }
  if (description.includes(query)) {
    return 60;
  }
  if (owner.includes(query) || creator.includes(query) || status.includes(query)) {
    return 50;
  }
  return 0;
}

export function compareFlowProjects(left: TaskFlowProject, right: TaskFlowProject, activeFlowId: string, query = "") {
  if (query) {
    const leftScore = scoreFlowSearchMatch(left, query);
    const rightScore = scoreFlowSearchMatch(right, query);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
  }
  const leftActive = left.id === activeFlowId ? 1 : 0;
  const rightActive = right.id === activeFlowId ? 1 : 0;
  if (leftActive !== rightActive) {
    return rightActive - leftActive;
  }
  const leftUpdated = Date.parse(String(left.updated_at || "")) || 0;
  const rightUpdated = Date.parse(String(right.updated_at || "")) || 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }
  return String(left.title || left.id || "").localeCompare(String(right.title || right.id || ""));
}

export function getVisibleProjects(flows: TaskFlowProject[], activeFlowId: string, query: string) {
  const normalizedQuery = normalizeInlineText(query).toLowerCase();
  const items = normalizedQuery ? flows.filter((flow) => buildFlowSearchText(flow).includes(normalizedQuery)) : [...flows];
  return items.sort((left, right) => compareFlowProjects(left, right, activeFlowId, normalizedQuery));
}

export function formatProjectResultsLabel(visibleCount: number, totalCount: number) {
  if (!totalCount) {
    return "0 flows available";
  }
  if (visibleCount === totalCount) {
    return `${totalCount} flow${totalCount === 1 ? "" : "s"} available`;
  }
  return `${visibleCount} of ${totalCount} flows`;
}

export function formatProjectResultsNote(activeFlowId: string, flows: TaskFlowProject[], query: string) {
  const activeFlow = flows.find((item) => item.id === activeFlowId) || null;
  const projectCopy = activeFlow ? `Board filtered by ${activeFlow.title}.` : "The board currently shows tasks from every flow.";
  const normalizedQuery = normalizeInlineText(query);
  return normalizedQuery ? `${projectCopy} Search: ${normalizedQuery}.` : projectCopy;
}

export function getTaskActiveSession(task: TaskFlowTask) {
  const activity = task.active_session;
  if (!activity || activity.dialog_active !== true) {
    return null;
  }
  return activity;
}

export function inferTaskSessionProfileId(task: TaskFlowTask) {
  const boundProfileId = String(task.last_session_profile_id || "").trim();
  if (boundProfileId) {
    return boundProfileId;
  }
  return String(task.profile_id || "").trim() || "default";
}

export function buildFallbackSessionFromTask(task: TaskFlowTask) {
  const sessionId = String(task.last_session_id || "").trim();
  if (!sessionId) {
    return null;
  }
  return {
    dialog_active: false,
    latest_activity_at: null,
    queued_turn_count: 0,
    running_turn_count: 0,
    session_id: sessionId,
    session_profile_id: inferTaskSessionProfileId(task),
  } satisfies TaskFlowSession;
}

export function getTaskSessionKey(task: TaskFlowTask | null | undefined) {
  if (!task) {
    return null;
  }
  const session = getTaskActiveSession(task) || buildFallbackSessionFromTask(task);
  if (!session?.session_id) {
    return null;
  }
  return {
    sessionId: String(session.session_id || "").trim(),
    sessionProfileId: String(session.session_profile_id || "").trim() || inferTaskSessionProfileId(task),
    taskId: String(task.id || "").trim(),
  };
}

export function isSameSessionKey(sessionInsights: TaskSessionInsights | null, taskId: string, sessionKey: ReturnType<typeof getTaskSessionKey>) {
  return Boolean(
    sessionKey &&
      sessionInsights?.session?.session_id &&
      sessionInsights.taskId === taskId &&
      String(sessionInsights.session.session_id || "").trim() === sessionKey.sessionId &&
      String(sessionInsights.session.session_profile_id || "").trim() === sessionKey.sessionProfileId,
  );
}

export function getRenderedTaskSession(task: TaskFlowTask | null, sessionInsights: TaskSessionInsights | null) {
  if (!task) {
    return null;
  }
  const sessionKey = getTaskSessionKey(task);
  if (sessionKey && isSameSessionKey(sessionInsights, sessionKey.taskId, sessionKey) && sessionInsights?.session?.session_id) {
    return sessionInsights.session;
  }
  return getTaskActiveSession(task) || buildFallbackSessionFromTask(task);
}

export function getRenderedTaskSessionInsights(task: TaskFlowTask | null, sessionInsights: TaskSessionInsights | null) {
  const sessionKey = getTaskSessionKey(task);
  if (!task || !sessionKey || !isSameSessionKey(sessionInsights, task.id, sessionKey)) {
    return null;
  }
  return sessionInsights;
}

export function shouldAutoRefreshTaskSession(task: TaskFlowTask | null, sessionInsights: TaskSessionInsights | null) {
  if (!task) {
    return false;
  }
  const visibleInsights = getRenderedTaskSessionInsights(task, sessionInsights);
  if (visibleInsights?.session) {
    return Boolean(visibleInsights.session.dialog_active);
  }
  return Boolean(getTaskActiveSession(task)?.session_id);
}

export function formatTaskSessionCounts(activity: TaskFlowSession | null | undefined) {
  const runningTurns = Number(activity?.running_turn_count || 0);
  const queuedTurns = Number(activity?.queued_turn_count || 0);
  const parts: string[] = [];
  if (runningTurns > 0) {
    parts.push(`${runningTurns} running`);
  }
  if (queuedTurns > 0) {
    parts.push(`${queuedTurns} queued`);
  }
  return parts.join(" • ") || "Idle";
}

export function formatTaskRunningElapsed(task: TaskFlowTask, now = Date.now()) {
  if (String(task.status || "").trim() !== "running") {
    return "";
  }
  const session = getTaskActiveSession(task);
  // Prefer an explicit runtime start when present; fall back to latest activity until the
  // task-session contract exposes a dedicated running-since timestamp everywhere.
  const anchor = String(session?.started_at || session?.latest_activity_at || "").trim();
  if (!anchor) {
    return "";
  }
  const startedAt = Date.parse(anchor);
  if (Number.isNaN(startedAt)) {
    return "";
  }
  const diffMs = Math.max(0, now - startedAt);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export function formatSessionEventTitle(event: TaskSessionProgressEvent) {
  const eventType = String(event.event_type || "").trim();
  if (eventType === "tool.call") {
    return event.tool_name ? `Calling ${event.tool_name}` : "Calling tool";
  }
  if (eventType === "tool.progress") {
    return event.tool_name ? `${event.tool_name} in progress` : "Tool in progress";
  }
  if (eventType === "tool.result") {
    return event.tool_name ? `${event.tool_name} returned` : "Tool returned";
  }
  if (eventType === "turn.think") {
    return "Thinking";
  }
  if (eventType === "turn.plan") {
    return "Planning";
  }
  if (eventType === "turn.finalize") {
    return "Turn finished";
  }
  if (eventType === "turn.cancel") {
    return "Turn cancelled";
  }
  if (eventType === "llm.call.start") {
    return "LLM call started";
  }
  if (eventType === "llm.call.done") {
    return "LLM call finished";
  }
  if (eventType === "llm.call.error") {
    return "LLM call failed";
  }
  if (eventType === "llm.call.timeout") {
    return "LLM call timed out";
  }
  return eventType || "Session event";
}

export function formatSessionEventCopy(event: TaskSessionProgressEvent) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const candidates = [
    payload.message,
    payload.summary,
    payload.status,
    payload.reason,
    payload.error,
    payload.error_text,
    payload.result,
    payload.stage,
  ];
  const textCandidate = candidates.find((item) => typeof item === "string" && item.trim());
  if (typeof textCandidate === "string" && textCandidate.trim()) {
    return textCandidate.trim();
  }
  if (event.tool_name) {
    return `tool: ${event.tool_name}`;
  }
  return "Waiting for the next visible session event.";
}

export function formatSessionEventTimestamp(event: TaskSessionProgressEvent) {
  const payloadCreatedAt = event.payload && typeof event.payload.created_at === "string" ? event.payload.created_at : "";
  return payloadCreatedAt || String(event.created_at || "");
}

export function formatFlowUpdatedAt(flow: TaskFlowProject) {
  return flow.updated_at ? `Updated ${formatDateTime(flow.updated_at)}` : "";
}

function capitalizeWord(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
