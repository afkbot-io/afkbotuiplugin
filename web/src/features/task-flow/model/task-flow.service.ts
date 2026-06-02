import { normalizeError } from "@/shared/lib/workspace";

import {
  normalizeActorRef,
  normalizeActorType,
  normalizeNumberField,
  parseCsv,
  TASK_FLOW_STATUS_OPTIONS,
  isEmployeeActorType,
} from "@/features/task-flow/model/task-flow.forms";
import type {
  TaskFlowBoard,
  TaskFlowComment,
  TaskFlowConfig,
  TaskFlowEmployeeFeed,
  TaskFlowEmployeeDraft,
  TaskFlowContextBundle,
  TaskFlowDependency,
  TaskFlowDocument,
  TaskFlowDocumentDraft,
  TaskFlowEvent,
  TaskFlowProject,
  TaskFlowProjectDraft,
  TaskFlowReviewDraft,
  TaskFlowReviewTask,
  TaskFlowRun,
  TaskFlowEmployee,
  TaskFlowEmployeeOption,
  TaskFlowOrgChart,
  TaskFlowTask,
  TaskFlowTaskDetail,
  TaskFlowTaskDraft,
  TaskSessionInsights,
} from "@/features/task-flow/model/task-flow.types";

type TaskFlowApi = {
  addTaskComment: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<unknown>;
  approveReviewTask: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<unknown>;
  bulkDeleteTasks: (profileId: string, payload: Record<string, unknown>) => Promise<{
    deleted_count?: number;
    deleted_task_ids?: string[];
    error_count?: number;
    errors?: Array<{ reason?: string }>;
  }>;
  bulkUpdateTasks: (profileId: string, payload: Record<string, unknown>) => Promise<unknown>;
  createTask: (profileId: string, payload: Record<string, unknown>) => Promise<{ task?: TaskFlowTask }>;
  createTaskFlow: (profileId: string, payload: Record<string, unknown>) => Promise<{ task_flow?: TaskFlowProject }>;
  deleteTask: (profileId: string, taskId: string) => Promise<unknown>;
  deleteTaskFlow: (profileId: string, flowId: string) => Promise<unknown>;
  getTask: (profileId: string, taskId: string) => Promise<{ task?: TaskFlowTask }>;
  getTaskBoard: (profileId: string, params?: Record<string, unknown>) => Promise<{ board?: TaskFlowBoard }>;
  getTaskContext: (profileId: string, taskId: string) => Promise<{ context?: TaskFlowContextBundle }>;
  getTaskFeed: (profileId: string, params?: Record<string, unknown>) => Promise<{ feed?: TaskFlowEmployeeFeed }>;
  getTaskSessionInsights: (
    profileId: string,
    taskId: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    progress?: { cursor?: { last_event_id?: number; run_id?: number | null }; events?: Array<Record<string, unknown>> };
    session?: TaskSessionInsights["session"];
    turns?: TaskSessionInsights["turns"];
  }>;
  listReviewTasks: (profileId: string, params?: Record<string, unknown>) => Promise<{ review_tasks?: TaskFlowReviewTask[] }>;
  listTaskFlowEmployees: (
    profileId: string,
    params?: Record<string, unknown>,
  ) => Promise<{ employees?: Array<Record<string, unknown>> }>;
  createTaskFlowEmployee: (
    profileId: string,
    payload: TaskFlowEmployeeDraft,
  ) => Promise<{ employee?: TaskFlowEmployee }>;
  updateTaskFlowEmployee: (
    profileId: string,
    employeeId: string,
    payload: TaskFlowEmployeeDraft,
  ) => Promise<{ employee?: TaskFlowEmployee }>;
  deleteTaskFlowEmployee: (profileId: string, employeeId: string) => Promise<unknown>;
  getTaskFlowOrgChart: (profileId: string) => Promise<{ org_chart?: TaskFlowOrgChart }>;
  listTaskFlowDocuments: (
    profileId: string,
    scopeType: string,
    scopeId: string,
  ) => Promise<{ task_documents?: TaskFlowDocument[] }>;
  listTaskComments: (profileId: string, taskId: string) => Promise<{ task_comments?: TaskFlowComment[] }>;
  listTaskDependencies: (profileId: string, taskId: string) => Promise<{ task_dependencies?: TaskFlowDependency[] }>;
  listTaskEvents: (profileId: string, taskId: string, params?: Record<string, unknown>) => Promise<{ task_events?: TaskFlowEvent[] }>;
  listTaskFlows: (profileId: string) => Promise<{ task_flows?: TaskFlowProject[] }>;
  listTaskRuns: (profileId: string, taskId: string, params?: Record<string, unknown>) => Promise<{ task_runs?: TaskFlowRun[] }>;
  putTaskFlowDocument: (profileId: string, payload: Record<string, unknown>) => Promise<{ task_document?: TaskFlowDocument }>;
  confirmTaskFlowDocument: (
    profileId: string,
    documentId: string,
    payload: Record<string, unknown>,
  ) => Promise<{ task_document?: TaskFlowDocument }>;
  requestReviewChanges: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<unknown>;
  updateTask: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<{ task?: TaskFlowTask }>;
  updateTaskFlow: (profileId: string, flowId: string, payload: Record<string, unknown>) => Promise<{ task_flow?: TaskFlowProject }>;
};

function coerceTaskFlowApi(api: unknown) {
  return api as TaskFlowApi;
}

export async function listTaskProjects(api: unknown, profileId: string) {
  const payload = await coerceTaskFlowApi(api).listTaskFlows(profileId);
  return Array.isArray(payload.task_flows) ? payload.task_flows : [];
}

export async function listTaskFlowEmployees(api: unknown, profileId: string) {
  const taskFlowApi = coerceTaskFlowApi(api);
  const employeesPayload = await taskFlowApi.listTaskFlowEmployees(profileId, { q: "" });
  const rows = (employeesPayload.employees || []).map((employee) => ({
    name: String(employee.id || ""),
    owner_ref: String(employee.id || ""),
    path: String(employee.path || ""),
    profile_id: String(employee.profile_id || profileId),
    status: String(employee.status || ""),
    summary: `${String(employee.name || employee.id || "")} - ${String(employee.title || employee.role || "")}`.trim(),
  }));
  return rows.flatMap(mapTaskFlowEmployeeOption);
}

export async function getTaskFlowOrgChart(api: unknown, profileId: string) {
  const payload = await coerceTaskFlowApi(api).getTaskFlowOrgChart(profileId);
  return normalizeTaskFlowOrgChart(payload.org_chart, profileId);
}

export async function createTaskFlowEmployee(api: unknown, profileId: string, draft: TaskFlowEmployeeDraft) {
  const payload = await coerceTaskFlowApi(api).createTaskFlowEmployee(profileId, draft);
  return payload.employee || null;
}

export async function updateTaskFlowEmployee(api: unknown, profileId: string, employeeId: string, draft: TaskFlowEmployeeDraft) {
  const payload = await coerceTaskFlowApi(api).updateTaskFlowEmployee(profileId, employeeId, draft);
  return payload.employee || null;
}

export async function deleteTaskFlowEmployee(api: unknown, profileId: string, employeeId: string) {
  await coerceTaskFlowApi(api).deleteTaskFlowEmployee(profileId, employeeId);
}

export async function getTaskFlowBoard(api: unknown, profileId: string, flowId: string, config: TaskFlowConfig) {
  const payload = await coerceTaskFlowApi(api).getTaskBoard(profileId, {
    flow_id: flowId || undefined,
    limit_per_column: config.task_flow_board_limit_per_column,
  });
  return normalizeTaskFlowBoard(payload.board);
}

export async function listTaskFlowReview(api: unknown, profileId: string, flowId: string, config: TaskFlowConfig) {
  const payload = await coerceTaskFlowApi(api).listReviewTasks(profileId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: config.task_flow_actor_type,
    flow_id: flowId || undefined,
  });
  return Array.isArray(payload.review_tasks) ? payload.review_tasks : [];
}

export async function getTaskDetail(api: unknown, profileId: string, taskId: string): Promise<TaskFlowTaskDetail> {
  const taskApi = coerceTaskFlowApi(api);
  const [taskPayload, commentsPayload, eventsPayload, runsPayload, dependenciesPayload] = await Promise.all([
    taskApi.getTask(profileId, taskId),
    taskApi.listTaskComments(profileId, taskId),
    taskApi.listTaskEvents(profileId, taskId),
    taskApi.listTaskRuns(profileId, taskId),
    taskApi.listTaskDependencies(profileId, taskId),
  ]);
  return {
    task: taskPayload.task || null,
    task_comments: Array.isArray(commentsPayload.task_comments) ? commentsPayload.task_comments : [],
    task_dependencies: Array.isArray(dependenciesPayload.task_dependencies) ? dependenciesPayload.task_dependencies : [],
    task_events: Array.isArray(eventsPayload.task_events) ? eventsPayload.task_events : [],
    task_runs: Array.isArray(runsPayload.task_runs) ? runsPayload.task_runs : [],
  };
}

export async function getTaskContext(api: unknown, profileId: string, taskId: string) {
  const payload = await coerceTaskFlowApi(api).getTaskContext(profileId, taskId);
  return normalizeTaskContext(payload.context);
}

export async function getEmployeeFeed(api: unknown, profileId: string, config: TaskFlowConfig) {
  const ownerType = normalizeActorType(config.task_flow_actor_type) || "human";
  if (!isEmployeeActorType(ownerType)) {
    return normalizeEmployeeFeed(null, ownerType, config.task_flow_actor_ref);
  }
  const payload = await coerceTaskFlowApi(api).getTaskFeed(profileId, {
    event_limit: 20,
    limit: 30,
    owner_ref: config.task_flow_actor_ref,
    owner_type: ownerType,
  });
  return normalizeEmployeeFeed(payload.feed, ownerType, config.task_flow_actor_ref);
}

export async function listTaskDocuments(api: unknown, profileId: string, scopeType: string, scopeId: string) {
  if (!scopeType || !scopeId) {
    return [];
  }
  const payload = await coerceTaskFlowApi(api).listTaskFlowDocuments(profileId, scopeType, scopeId);
  return Array.isArray(payload.task_documents) ? payload.task_documents : [];
}

export async function putTaskDocument(
  api: unknown,
  profileId: string,
  draft: TaskFlowDocumentDraft,
  scopeId: string,
  config: TaskFlowConfig,
  baseRevision?: number | null,
) {
  const payload = await coerceTaskFlowApi(api).putTaskFlowDocument(profileId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    base_revision: baseRevision || undefined,
    body: draft.body.trim(),
    document_key: draft.document_key.trim(),
    scope_id: scopeId,
    scope_type: draft.scope_type,
    title: draft.title.trim(),
  });
  return payload.task_document || null;
}

export async function confirmTaskDocument(
  api: unknown,
  profileId: string,
  document: TaskFlowDocument,
  config: TaskFlowConfig,
) {
  const payload = await coerceTaskFlowApi(api).confirmTaskFlowDocument(profileId, document.id, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    expected_revision: document.revision,
  });
  return payload.task_document || null;
}

function normalizeTaskFlowBoard(board: TaskFlowBoard | null | undefined): TaskFlowBoard {
  const rawColumns = Array.isArray(board?.columns) ? board.columns : [];
  const columnMap = new Map(
    rawColumns.map((column) => [
      String(column.id || "").trim(),
      {
        ...column,
        count: Number(column.count ?? (Array.isArray(column.tasks) ? column.tasks.length : 0)),
        tasks: Array.isArray(column.tasks) ? column.tasks : [],
        title: String(column.title || "").trim(),
      },
    ]),
  );

  const normalizedColumns: TaskFlowBoard["columns"] = TASK_FLOW_STATUS_OPTIONS.map((status) => {
    const existingColumn = columnMap.get(status);
    if (existingColumn) {
      columnMap.delete(status);
      return {
        ...existingColumn,
        id: status,
        title: existingColumn.title || formatBoardColumnTitle(status),
      };
    }
    return {
      count: 0,
      id: status,
      tasks: [],
      title: formatBoardColumnTitle(status),
    };
  });

  for (const column of rawColumns) {
    const columnId = String(column.id || "").trim();
    if (!columnId || TASK_FLOW_STATUS_OPTIONS.includes(columnId as (typeof TASK_FLOW_STATUS_OPTIONS)[number])) {
      continue;
    }
    normalizedColumns.push({
      count: Number(column.count ?? (Array.isArray(column.tasks) ? column.tasks.length : 0)),
      id: columnId,
      tasks: Array.isArray(column.tasks) ? column.tasks : [],
      title: String(column.title || "").trim() || formatBoardColumnTitle(columnId),
    });
  }

  return {
    columns: normalizedColumns,
    total_count: Number(
      board?.total_count ??
        rawColumns.reduce((total, column) => total + Number(column.count ?? (Array.isArray(column.tasks) ? column.tasks.length : 0)), 0),
    ),
  };
}

function normalizeTaskContext(context: TaskFlowContextBundle | null | undefined): TaskFlowContextBundle | null {
  if (!context?.task) {
    return context || null;
  }
  return {
    ...context,
    delegated_tasks: Array.isArray(context.delegated_tasks) ? context.delegated_tasks : [],
    dependencies: Array.isArray(context.dependencies) ? context.dependencies : [],
    dependency_tasks: Array.isArray(context.dependency_tasks) ? context.dependency_tasks : [],
    dependent_tasks: Array.isArray(context.dependent_tasks) ? context.dependent_tasks : [],
    dependents: Array.isArray(context.dependents) ? context.dependents : [],
    flow_documents: Array.isArray(context.flow_documents) ? context.flow_documents : [],
    recent_comments: Array.isArray(context.recent_comments) ? context.recent_comments : [],
    recent_events: Array.isArray(context.recent_events) ? context.recent_events : [],
    task_documents: Array.isArray(context.task_documents) ? context.task_documents : [],
  };
}

function normalizeEmployeeFeed(feed: TaskFlowEmployeeFeed | null | undefined, ownerType: string, ownerRef: string): TaskFlowEmployeeFeed {
  return {
    blocked_count: Number(feed?.blocked_count || 0),
    mention_event_count: Number(feed?.mention_event_count || 0),
    owner_ref: String(feed?.owner_ref || ownerRef || ""),
    owner_type: String(feed?.owner_type || ownerType || ""),
    recent_events: Array.isArray(feed?.recent_events) ? feed.recent_events : [],
    review_count: Number(feed?.review_count || 0),
    running_count: Number(feed?.running_count || 0),
    tasks: Array.isArray(feed?.tasks) ? feed.tasks : [],
    todo_count: Number(feed?.todo_count || 0),
    total_count: Number(feed?.total_count || 0),
  };
}

function formatBoardColumnTitle(status: string) {
  const normalized = String(status || "").trim();
  if (!normalized) {
    return "Unknown";
  }
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function getTaskSessionInsights(
  api: unknown,
  profileId: string,
  taskId: string,
  previous: TaskSessionInsights | null,
  incremental = false,
): Promise<TaskSessionInsights> {
  const payload = await coerceTaskFlowApi(api).getTaskSessionInsights(profileId, taskId, {
    ...(incremental && previous
      ? {
          after_event_id: previous.progress.cursor.last_event_id || 0,
          run_id: previous.progress.cursor.run_id || undefined,
        }
      : {}),
    history_limit: 5,
    progress_limit: 18,
  });
  return {
    progress: {
      cursor: payload.progress?.cursor || previous?.progress.cursor || { last_event_id: 0, run_id: null },
      events:
        incremental && previous
          ? mergeSessionProgressEvents(previous.progress.events, payload.progress?.events || [])
          : ((payload.progress?.events || []) as TaskSessionInsights["progress"]["events"]),
    },
    session: payload.session || null,
    taskId,
    turns: Array.isArray(payload.turns) ? payload.turns : [],
  };
}

export async function createTaskProject(
  api: unknown,
  profileId: string,
  draft: TaskFlowProjectDraft,
  config: TaskFlowConfig,
) {
  const defaultOwnerType = normalizeActorType(draft.default_owner_type);
  const payload = await coerceTaskFlowApi(api).createTaskFlow(profileId, {
    created_by_ref: config.task_flow_actor_ref,
    created_by_type: normalizeActorType(config.task_flow_actor_type),
    default_owner_ref: normalizeActorRef(draft.default_owner_type, draft.default_owner_ref, config),
    default_owner_type: defaultOwnerType || null,
    description: draft.description.trim() || null,
    labels: parseCsv(draft.labels),
    title: draft.title.trim(),
  });
  return payload.task_flow || null;
}

export async function updateTaskProject(
  api: unknown,
  profileId: string,
  flowId: string,
  draft: TaskFlowProjectDraft,
  config: TaskFlowConfig,
) {
  const defaultOwnerType = normalizeActorType(draft.default_owner_type);
  const payload = await coerceTaskFlowApi(api).updateTaskFlow(profileId, flowId, {
    default_owner_ref: normalizeActorRef(draft.default_owner_type, draft.default_owner_ref, config),
    default_owner_type: defaultOwnerType || null,
    description: draft.description.trim() || null,
    labels: parseCsv(draft.labels),
    title: draft.title.trim(),
  });
  return payload.task_flow || null;
}

export async function createTaskItem(
  api: unknown,
  profileId: string,
  draft: TaskFlowTaskDraft,
  config: TaskFlowConfig,
) {
  const dueAt = draft.due_at.trim() ? new Date(draft.due_at) : null;
  const ownerType = normalizeActorType(draft.owner_type);
  const reviewerType = normalizeActorType(draft.reviewer_type);
  const payload = await coerceTaskFlowApi(api).createTask(profileId, {
    created_by_ref: config.task_flow_actor_ref,
    created_by_type: normalizeActorType(config.task_flow_actor_type),
    depends_on_task_ids: parseCsv(draft.depends_on_task_ids),
    due_at: dueAt ? dueAt.toISOString() : null,
    flow_id: draft.flow_id.trim() || null,
    labels: parseCsv(draft.labels),
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: ownerType || null,
    priority: normalizeNumberField(draft.priority, { fallback: 50, min: 0, max: 100 }) ?? 50,
    description: draft.description.trim(),
    requires_review: draft.requires_review,
    reviewer_ref: normalizeActorRef(draft.reviewer_type, draft.reviewer_ref, config),
    reviewer_type: reviewerType || null,
    title: draft.title.trim(),
  });
  return payload.task || null;
}

export async function updateTaskItem(
  api: unknown,
  profileId: string,
  taskId: string,
  draft: TaskFlowTaskDraft,
  config: TaskFlowConfig,
) {
  const dueAt = draft.due_at.trim() ? new Date(draft.due_at) : null;
  const ownerType = normalizeActorType(draft.owner_type);
  const reviewerType = normalizeActorType(draft.reviewer_type);
  const payload = await coerceTaskFlowApi(api).updateTask(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    blocked_reason_text: draft.blocked_reason_text.trim() || null,
    due_at: dueAt ? dueAt.toISOString() : null,
    labels: parseCsv(draft.labels),
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: ownerType || null,
    priority: normalizeNumberField(draft.priority, { fallback: 50, min: 0, max: 100 }) ?? 50,
    description: draft.description.trim(),
    requires_review: draft.requires_review,
    reviewer_ref: normalizeActorRef(draft.reviewer_type, draft.reviewer_ref, config),
    reviewer_type: reviewerType || null,
    status: draft.status.trim(),
    title: draft.title.trim(),
  });
  return payload.task || null;
}

export async function deleteTaskItem(api: unknown, profileId: string, taskId: string) {
  await coerceTaskFlowApi(api).deleteTask(profileId, taskId);
}

export async function deleteTaskProject(api: unknown, profileId: string, flowId: string) {
  await coerceTaskFlowApi(api).deleteTaskFlow(profileId, flowId);
}

export async function bulkMoveTaskItems(
  api: unknown,
  profileId: string,
  taskIds: string[],
  status: string,
  config: TaskFlowConfig,
) {
  const payload: Record<string, unknown> = {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    status,
    task_ids: taskIds,
  };
  if (status !== "blocked") {
    payload.blocked_reason_code = null;
    payload.blocked_reason_text = null;
  }
  await coerceTaskFlowApi(api).bulkUpdateTasks(profileId, payload);
}

export async function bulkDeleteTaskItems(api: unknown, profileId: string, taskIds: string[]) {
  return coerceTaskFlowApi(api).bulkDeleteTasks(profileId, { task_ids: taskIds });
}

export async function createTaskComment(
  api: unknown,
  profileId: string,
  taskId: string,
  message: string,
  config: TaskFlowConfig,
) {
  await coerceTaskFlowApi(api).addTaskComment(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    comment_type: "note",
    message: message.trim(),
  });
}

export async function approveTaskReview(api: unknown, profileId: string, taskId: string, config: TaskFlowConfig) {
  await coerceTaskFlowApi(api).approveReviewTask(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
  });
}

export async function requestTaskReviewChanges(
  api: unknown,
  profileId: string,
  taskId: string,
  draft: TaskFlowReviewDraft,
  config: TaskFlowConfig,
) {
  const ownerType = normalizeActorType(draft.owner_type);
  await coerceTaskFlowApi(api).requestReviewChanges(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: normalizeActorType(config.task_flow_actor_type),
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: ownerType || null,
    reason_text: draft.reason_text.trim(),
  });
}

export function resolveTaskFlowError(error: unknown) {
  return normalizeError(error);
}

function mergeSessionProgressEvents(existingEvents: TaskSessionInsights["progress"]["events"], incomingEvents: Array<Record<string, unknown>>) {
  const merged: TaskSessionInsights["progress"]["events"] = [];
  const seen = new Set<string>();
  for (const item of [...existingEvents, ...(incomingEvents as TaskSessionInsights["progress"]["events"])]) {
    const eventId = Number(item?.event_id || 0);
    const key =
      eventId > 0
        ? `event:${eventId}`
        : `${item?.run_id || "run"}:${item?.event_type || "event"}:${JSON.stringify(item?.payload || {})}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...item });
  }
  return merged.slice(-18);
}

function mapTaskFlowEmployeeOption(item: Record<string, unknown>): TaskFlowEmployeeOption[] {
  const name = String(item.name || "").trim();
  if (!name) {
    return [];
  }
  return [
    {
      name,
      origin: String(item.origin || "").trim(),
      owner_ref: String(item.owner_ref || "").trim(),
      path: String(item.path || "").trim(),
      profile_id: String(item.profile_id || "").trim(),
      summary: String(item.summary || "").trim(),
      status: String(item.status || "").trim(),
    },
  ];
}

function normalizeTaskFlowOrgChart(payload: TaskFlowOrgChart | null | undefined, profileId: string): TaskFlowOrgChart {
  const employees = payload?.employees && typeof payload.employees === "object" ? payload.employees : {};
  return {
    edges: Array.isArray(payload?.edges)
      ? payload.edges
          .map((edge) => [String(edge?.[0] || "").trim(), String(edge?.[1] || "").trim()] as [string, string])
          .filter(([source, target]) => source && target)
      : [],
    employees,
    profile_id: String(payload?.profile_id || profileId),
    root_employee_ids: Array.isArray(payload?.root_employee_ids)
      ? payload.root_employee_ids.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    validation: {
      issues: Array.isArray(payload?.validation?.issues) ? payload.validation.issues : [],
      profile_id: String(payload?.validation?.profile_id || payload?.profile_id || profileId),
      valid: Boolean(payload?.validation?.valid ?? true),
    },
  };
}
