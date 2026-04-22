import { normalizeError } from "@/shared/lib/workspace";

import {
  normalizeActorRef,
  normalizeNumberField,
  parseCsv,
  TASK_FLOW_STATUS_OPTIONS,
} from "@/features/task-flow/model/task-flow.forms";
import type {
  TaskFlowBoard,
  TaskFlowComment,
  TaskFlowConfig,
  TaskFlowDependency,
  TaskFlowEvent,
  TaskFlowProject,
  TaskFlowProjectDraft,
  TaskFlowReviewDraft,
  TaskFlowReviewTask,
  TaskFlowRun,
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
  listTaskComments: (profileId: string, taskId: string) => Promise<{ task_comments?: TaskFlowComment[] }>;
  listTaskDependencies: (profileId: string, taskId: string) => Promise<{ task_dependencies?: TaskFlowDependency[] }>;
  listTaskEvents: (profileId: string, taskId: string, params?: Record<string, unknown>) => Promise<{ task_events?: TaskFlowEvent[] }>;
  listTaskFlows: (profileId: string) => Promise<{ task_flows?: TaskFlowProject[] }>;
  listTaskRuns: (profileId: string, taskId: string, params?: Record<string, unknown>) => Promise<{ task_runs?: TaskFlowRun[] }>;
  requestReviewChanges: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<unknown>;
  updateTask: (profileId: string, taskId: string, payload: Record<string, unknown>) => Promise<{ task?: TaskFlowTask }>;
};

function coerceTaskFlowApi(api: unknown) {
  return api as TaskFlowApi;
}

export async function listTaskProjects(api: unknown, profileId: string) {
  const payload = await coerceTaskFlowApi(api).listTaskFlows(profileId);
  return Array.isArray(payload.task_flows) ? payload.task_flows : [];
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
  const payload = await coerceTaskFlowApi(api).createTaskFlow(profileId, {
    created_by_ref: config.task_flow_actor_ref,
    created_by_type: config.task_flow_actor_type,
    default_owner_ref: normalizeActorRef(draft.default_owner_type, draft.default_owner_ref, config),
    default_owner_type: draft.default_owner_type.trim() || null,
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
  const payload = await coerceTaskFlowApi(api).createTask(profileId, {
    created_by_ref: config.task_flow_actor_ref,
    created_by_type: config.task_flow_actor_type,
    depends_on_task_ids: parseCsv(draft.depends_on_task_ids),
    due_at: dueAt ? dueAt.toISOString() : null,
    flow_id: draft.flow_id.trim() || null,
    labels: parseCsv(draft.labels),
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: draft.owner_type.trim() || null,
    priority: normalizeNumberField(draft.priority, { fallback: 50, min: 0, max: 100 }) ?? 50,
    prompt: draft.prompt.trim(),
    requires_review: draft.requires_review,
    reviewer_ref: normalizeActorRef(draft.reviewer_type, draft.reviewer_ref, config),
    reviewer_type: draft.reviewer_type.trim() || null,
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
  const payload = await coerceTaskFlowApi(api).updateTask(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: config.task_flow_actor_type,
    blocked_reason_text: draft.blocked_reason_text.trim() || null,
    due_at: dueAt ? dueAt.toISOString() : null,
    labels: parseCsv(draft.labels),
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: draft.owner_type.trim() || null,
    priority: normalizeNumberField(draft.priority, { fallback: 50, min: 0, max: 100 }) ?? 50,
    prompt: draft.prompt.trim(),
    requires_review: draft.requires_review,
    reviewer_ref: normalizeActorRef(draft.reviewer_type, draft.reviewer_ref, config),
    reviewer_type: draft.reviewer_type.trim() || null,
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

const MAX_TASK_FLOW_COLUMN_FETCH = 200;

export async function listSelectableTaskIdsForBoardColumn(
  api: unknown,
  profileId: string,
  flowId: string,
  columnId: string,
  config: TaskFlowConfig,
  loadedColumn: TaskFlowBoard["columns"][number],
) {
  const loadedTasks = Array.isArray(loadedColumn.tasks) ? loadedColumn.tasks : [];
  const needsExpandedFetch = Number(loadedColumn.count ?? loadedTasks.length) > loadedTasks.length;

  let resolvedColumn = loadedColumn;

  if (needsExpandedFetch) {
    const requestedLimit = Math.min(
      MAX_TASK_FLOW_COLUMN_FETCH,
      Math.max(Number(loadedColumn.count ?? 0), loadedTasks.length, config.task_flow_board_limit_per_column),
    );
    const payload = await coerceTaskFlowApi(api).getTaskBoard(profileId, {
      flow_id: flowId || undefined,
      limit_per_column: requestedLimit,
    });
    const expandedBoard = normalizeTaskFlowBoard(payload.board);
    resolvedColumn = expandedBoard.columns.find((column) => column.id === columnId) || loadedColumn;
  }

  const taskIds = (resolvedColumn.tasks || [])
    .filter((task) => !["claimed", "running"].includes(String(task.status || "").trim()))
    .map((task) => ({ ...task }));

  return {
    fully_loaded: Number(resolvedColumn.count ?? taskIds.length) <= (resolvedColumn.tasks || []).length,
    task_ids: taskIds.map((task) => task.id),
    tasks: taskIds,
  };
}

export async function bulkDeleteTaskProjects(api: unknown, profileId: string, flowIds: string[]) {
  const uniqueFlowIds = [...new Set(flowIds.map((flowId) => String(flowId || "").trim()).filter(Boolean))];
  const results = await Promise.all(
    uniqueFlowIds.map(async (flowId) => {
      try {
        await deleteTaskProject(api, profileId, flowId);
        return {
          flowId,
          ok: true,
          reason: "",
        };
      } catch (error) {
        return {
          flowId,
          ok: false,
          reason: resolveTaskFlowError(error),
        };
      }
    }),
  );

  const deletedFlowIds = results.filter((result) => result.ok).map((result) => result.flowId);
  const errors = results.filter((result) => !result.ok);

  return {
    deleted_count: deletedFlowIds.length,
    deleted_flow_ids: deletedFlowIds,
    error_count: errors.length,
    errors: errors.map((result) => ({
      flow_id: result.flowId,
      reason: result.reason,
    })),
  };
}

export async function bulkMoveTaskItems(
  api: unknown,
  profileId: string,
  taskIds: string[],
  status: string,
  config: TaskFlowConfig,
) {
  await coerceTaskFlowApi(api).bulkUpdateTasks(profileId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: config.task_flow_actor_type,
    status,
    task_ids: taskIds,
  });
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
    actor_type: config.task_flow_actor_type,
    comment_type: "note",
    message: message.trim(),
  });
}

export async function approveTaskReview(api: unknown, profileId: string, taskId: string, config: TaskFlowConfig) {
  await coerceTaskFlowApi(api).approveReviewTask(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: config.task_flow_actor_type,
  });
}

export async function requestTaskReviewChanges(
  api: unknown,
  profileId: string,
  taskId: string,
  draft: TaskFlowReviewDraft,
  config: TaskFlowConfig,
) {
  await coerceTaskFlowApi(api).requestReviewChanges(profileId, taskId, {
    actor_ref: config.task_flow_actor_ref,
    actor_type: config.task_flow_actor_type,
    owner_ref: normalizeActorRef(draft.owner_type, draft.owner_ref, config),
    owner_type: draft.owner_type.trim() || null,
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
