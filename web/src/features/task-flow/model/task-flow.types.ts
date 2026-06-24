export type TaskFlowActorType = "employee" | "human" | string;

export type TaskFlowSourceType = "manager_escalation" | string;

export type TaskFlowStatus =
  | "plan"
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

export type TaskFlowEmployeeOption = {
  is_root?: boolean | null;
  manager_id?: string | null;
  name: string;
  origin?: string | null;
  owner_ref?: string | null;
  path?: string | null;
  profile_id?: string | null;
  role?: string | null;
  summary?: string | null;
  status?: string | null;
  title?: string | null;
};

export type TaskFlowOrgChartIssue = {
  code?: string | null;
  employee_id?: string | null;
  message?: string | null;
  severity?: string | null;
  target_employee_id?: string | null;
};

export type TaskFlowEmployee = {
  allowed_tools?: string[];
  body?: string | null;
  can_delegate_to?: string[];
  can_use_subagents?: boolean | null;
  derived_reports?: string[];
  id: string;
  manager_id?: string | null;
  max_active_tasks?: number | null;
  name: string;
  profile_id?: string | null;
  reports?: string[];
  role: string;
  status: "active" | "disabled" | "archived" | string;
  subagent_allowlist?: string[];
  title: string;
};

export type TaskFlowEmployeeDraft = {
  allowed_tools?: string[];
  body?: string;
  can_delegate_to?: string[];
  can_use_subagents?: boolean;
  id: string;
  manager_id?: string | null;
  name: string;
  role: string;
  status?: "active" | "disabled" | "archived";
  subagent_allowlist?: string[];
  title: string;
};

export type TaskFlowOrgChart = {
  edges: Array<[string, string]>;
  employees: Record<string, TaskFlowEmployee>;
  profile_id: string;
  root_employee_ids: string[];
  validation: {
    issues: TaskFlowOrgChartIssue[];
    profile_id?: string | null;
    valid: boolean;
  };
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
  attachment_count?: number | null;
  blocked_reason_code?: string | null;
  blocked_reason_text?: string | null;
  description?: string | null;
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
  review_actionable?: boolean | null;
  requires_review?: boolean | null;
  reviewer_ref?: string | null;
  reviewer_type?: TaskFlowActorType | null;
  source_ref?: string | null;
  source_type?: TaskFlowSourceType | null;
  status: TaskFlowStatus;
  title: string;
};

export type TaskFlowAttachmentInput = {
  byte_size?: number;
  content_base64: string;
  content_type?: string | null;
  kind?: string;
  name: string;
};

export type TaskFlowAttachment = {
  byte_size?: number | null;
  content_type?: string | null;
  created_at?: string | null;
  created_by_ref?: string | null;
  created_by_type?: string | null;
  id: string;
  kind?: string | null;
  name: string;
  profile_id?: string | null;
  sha256?: string | null;
  task_id?: string | null;
  updated_at?: string | null;
};

export type TaskFlowKnowledgeMaintenanceFlow = {
  action?: string | null;
  flow_id: string;
  flow_title?: string | null;
  health_status?: string | null;
  missing_flow_document_keys?: string[];
  open_blocked_task_count?: number | null;
  open_review_task_count?: number | null;
  profile_id?: string | null;
  reasons?: string[];
  task?: TaskFlowTask | null;
  unconfirmed_flow_document_keys?: string[];
};

export type TaskFlowKnowledgeMaintenanceSweep = {
  actor_ref?: string | null;
  actor_type?: string | null;
  checked_flow_count?: number | null;
  created_task_count?: number | null;
  flows?: TaskFlowKnowledgeMaintenanceFlow[];
  generated_at?: string | null;
  profile_id?: string | null;
  skipped_flow_count?: number | null;
  woken_task_count?: number | null;
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
  actor_ref?: string | null;
  actor_type?: string | null;
  created_at?: string | null;
  details?: Record<string, unknown>;
  event_type?: string | null;
  from_status?: string | null;
  id?: number | null;
  message?: string | null;
  reason?: string | null;
  status?: string | null;
  task_id?: string | null;
  task_title?: string | null;
  to_status?: string | null;
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

export type TaskFlowRelation = {
  created_at?: string | null;
  created_by_ref?: string | null;
  created_by_type?: string | null;
  details?: Record<string, unknown>;
  flow_id?: string | null;
  id: string;
  is_blocking?: boolean | null;
  profile_id?: string | null;
  relation_type: string;
  satisfied_on_status?: string | null;
  source_task_id: string;
  target_task_id: string;
};

export type TaskFlowWake = {
  claimed_at?: string | null;
  claimed_by?: string | null;
  coalesced_count?: number | null;
  created_at?: string | null;
  finished_at?: string | null;
  flow_id?: string | null;
  id: string;
  last_coalesced_at?: string | null;
  owner_ref?: string | null;
  owner_type?: string | null;
  payload?: Record<string, unknown>;
  priority?: number | null;
  profile_id?: string | null;
  reason_code?: string | null;
  run_after?: string | null;
  source_event_id?: number | null;
  status?: string | null;
  task_id: string;
  task_run_id?: number | null;
  updated_at?: string | null;
};

export type TaskFlowTaskDetail = {
  task: TaskFlowTask | null;
  task_attachments: TaskFlowAttachment[];
  task_comments: TaskFlowComment[];
  task_dependencies: TaskFlowDependency[];
  task_events: TaskFlowEvent[];
  task_runs: TaskFlowRun[];
};

export type TaskFlowDocument = {
  body?: string | null;
  confirmation_status?: string | null;
  confirmed_at?: string | null;
  confirmed_by_ref?: string | null;
  confirmed_by_type?: string | null;
  confirmed_revision?: number | null;
  content_hash?: string | null;
  created_at?: string | null;
  document_key: string;
  id: string;
  latest_revision_id?: number | null;
  profile_id?: string | null;
  revision: number;
  scope_id: string;
  scope_type: "flow" | "task" | string;
  title: string;
  updated_at?: string | null;
  updated_by_ref?: string | null;
  updated_by_type?: string | null;
};

export type TaskFlowContextBundle = {
  delegated_tasks?: TaskFlowTask[];
  dependencies?: TaskFlowDependency[];
  relations?: TaskFlowRelation[];
  dependency_tasks?: TaskFlowTask[];
  dependent_tasks?: TaskFlowTask[];
  dependents?: TaskFlowDependency[];
  flow?: TaskFlowProject | null;
  flow_documents?: TaskFlowDocument[];
  generated_at?: string | null;
  knowledge_packet?: {
    blocking_reasons?: string[];
    context_budget_chars?: number | null;
    documents?: Array<{
      confirmation_status?: string | null;
      document_key?: string | null;
      excerpt?: string | null;
      revision?: number | null;
      scope_id?: string | null;
      scope_type?: string | null;
      title?: string | null;
    }>;
    health_status?: string | null;
    missing_flow_document_keys?: string[];
    ready_for_delegation?: boolean | null;
    ready_for_execution?: boolean | null;
    required_flow_document_keys?: string[];
    unconfirmed_flow_document_keys?: string[];
  } | null;
  recent_comments?: TaskFlowComment[];
  recent_events?: TaskFlowEvent[];
  recent_wakes?: TaskFlowWake[];
  task?: TaskFlowTask | null;
  task_documents?: TaskFlowDocument[];
};

export type TaskFlowDocumentDraft = {
  body: string;
  document_key: string;
  scope_type: "flow" | "task";
  title: string;
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
  attachments?: TaskFlowAttachmentInput[];
  blocked_reason_text: string;
  depends_on_task_ids: string;
  due_at: string;
  flow_id: string;
  labels: string;
  owner_ref: string;
  owner_type: string;
  priority: string;
  description: string;
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
