export type TaskFlowActorType = "ai_profile" | "human" | string;

export type TaskFlowStatus =
  | "todo"
  | "blocked"
  | "claimed"
  | "running"
  | "review"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

export type TaskFlowConfig = {
  task_flow_actor_ref: string;
  task_flow_actor_type: TaskFlowActorType;
  task_flow_board_limit_per_column: number;
  task_flow_poll_interval_sec: number;
};

export type TaskFlowProfile = {
  id?: string | null;
  is_default?: boolean | null;
  title?: string | null;
};

export type TaskFlowSession = {
  dialog_active?: boolean | null;
  latest_activity_at?: string | null;
  queued_turn_count?: number | null;
  running_turn_count?: number | null;
  session_id?: string | null;
  session_profile_id?: string | null;
  started_at?: string | null;
};

export type TaskFlowTask = {
  active_session?: TaskFlowSession | null;
  blocked_reason_code?: string | null;
  blocked_reason_text?: string | null;
  due_at?: string | null;
  flow_id?: string | null;
  id: string;
  labels?: string[];
  last_comment_created_at?: string | null;
  last_comment_message?: string | null;
  last_session_id?: string | null;
  last_session_profile_id?: string | null;
  owner_ref?: string | null;
  owner_type?: TaskFlowActorType | null;
  priority?: number | null;
  profile_id?: string | null;
  prompt?: string | null;
  requires_review?: boolean | null;
  reviewer_ref?: string | null;
  reviewer_type?: TaskFlowActorType | null;
  status: TaskFlowStatus;
  title: string;
};

export type TaskFlowBoardColumn = {
  count: number;
  id: TaskFlowStatus;
  tasks: TaskFlowTask[];
  title: string;
};

export type TaskFlowBoard = {
  columns: TaskFlowBoardColumn[];
  total_count: number;
};

export type TaskFlowProject = {
  created_by_ref?: string | null;
  created_by_type?: TaskFlowActorType | null;
  default_owner_ref?: string | null;
  default_owner_type?: TaskFlowActorType | null;
  description?: string | null;
  id: string;
  labels?: string[];
  status?: string | null;
  title: string;
  updated_at?: string | null;
};

export type TaskFlowComment = {
  actor_ref?: string | null;
  actor_type?: string | null;
  comment_type?: string | null;
  created_at?: string | null;
  id?: number | null;
  message?: string | null;
  task_run_id?: number | null;
};

export type TaskFlowEvent = {
  created_at?: string | null;
  event_type?: string | null;
  id?: number | null;
  reason?: string | null;
  status?: string | null;
};

export type TaskFlowRun = {
  created_at?: string | null;
  error_code?: string | null;
  id?: number | null;
  started_at?: string | null;
  status?: string | null;
};

export type TaskFlowDependency = {
  depends_on_task_id?: string | null;
  id?: number | null;
  task_id?: string | null;
};

export type TaskFlowTaskDetail = {
  task: TaskFlowTask | null;
  task_comments: TaskFlowComment[];
  task_dependencies: TaskFlowDependency[];
  task_events: TaskFlowEvent[];
  task_runs: TaskFlowRun[];
};

export type TaskFlowReviewTask = TaskFlowTask;

export type TaskSessionTurn = {
  assistant_message?: string | null;
  id?: number | null;
  profile_id?: string | null;
  session_id?: string | null;
  user_message?: string | null;
};

export type TaskSessionProgressCursor = {
  last_event_id?: number | null;
  run_id?: number | null;
};

export type TaskSessionProgressEvent = {
  created_at?: string | null;
  event_id?: number | null;
  event_type?: string | null;
  payload?: Record<string, unknown>;
  run_id?: number | null;
  stage?: string | null;
  tool_name?: string | null;
};

export type TaskSessionInsights = {
  progress: {
    cursor: TaskSessionProgressCursor;
    events: TaskSessionProgressEvent[];
  };
  session: TaskFlowSession | null;
  taskId: string;
  turns: TaskSessionTurn[];
};

export type TaskFlowProjectDraft = {
  default_owner_ref: string;
  default_owner_type: string;
  description: string;
  labels: string;
  title: string;
};

export type TaskFlowTaskDraft = {
  blocked_reason_text: string;
  depends_on_task_ids: string;
  due_at: string;
  flow_id: string;
  labels: string;
  owner_ref: string;
  owner_type: string;
  priority: string;
  prompt: string;
  requires_review: boolean;
  reviewer_ref: string;
  reviewer_type: string;
  status: string;
  title: string;
};

export type TaskFlowReviewDraft = {
  owner_ref: string;
  owner_type: string;
  reason_text: string;
};

export type TaskFlowSettingsDraft = {
  task_flow_actor_ref: string;
  task_flow_actor_type: string;
  task_flow_board_limit_per_column: string;
  task_flow_poll_interval_sec: string;
};
