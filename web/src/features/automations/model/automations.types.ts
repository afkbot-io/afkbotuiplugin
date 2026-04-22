export type AutomationTriggerType = "cron" | "webhook";

export type AutomationStatus = "active" | "paused" | "deleted" | string;

export type AutomationExecutionMode = "graph" | string;

export type AutomationFilters = {
  includeDeleted: boolean;
  query: string;
  status: string;
  triggerType: string;
};

export type AutomationSummary = {
  active: number;
  attention: number;
  cron: number;
  deleted: number;
  paused: number;
  total: number;
  webhook: number;
};

export type AutomationCron = {
  cron_expr?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
  timezone?: string | null;
};

export type AutomationWebhook = {
  chat_resume_command?: string | null;
  last_error?: string | null;
  last_execution_status?: string | null;
  last_failed_at?: string | null;
  last_received_at?: string | null;
  last_session_id?: string | null;
  last_started_at?: string | null;
  last_succeeded_at?: string | null;
  webhook_endpoint_recoverable?: boolean | null;
  webhook_path?: string | null;
  webhook_token_masked?: string | null;
  webhook_url?: string | null;
};

export type AutomationDerived = {
  has_graph?: boolean | null;
  last_activity_at?: string | null;
  needs_attention?: boolean | null;
};

export type Automation = {
  cron?: AutomationCron | null;
  derived?: AutomationDerived | null;
  execution_mode: AutomationExecutionMode;
  graph_fallback_mode?: string | null;
  id: number;
  name: string;
  profile_id: string;
  prompt: string;
  status: AutomationStatus;
  trigger_type: AutomationTriggerType | string;
  updated_at?: string | null;
  webhook?: AutomationWebhook | null;
};

export type AutomationGraphNode = {
  id?: number | null;
  key?: string | null;
  name?: string | null;
  node_kind?: string | null;
  node_type?: string | null;
  node_version_id?: number | null;
};

export type AutomationGraphEdge = {
  id?: number | null;
  source_key?: string | null;
  source_port?: string | null;
  target_key?: string | null;
  target_port?: string | null;
};

export type AutomationGraph = {
  automation_id?: number | null;
  edges?: AutomationGraphEdge[];
  execution_mode?: string | null;
  flow_id?: number | null;
  graph_fallback_mode?: string | null;
  name?: string | null;
  nodes?: AutomationGraphNode[];
  status?: string | null;
  version?: number | null;
};

export type AutomationGraphValidation = {
  errors?: string[];
  valid?: boolean;
};

export type AutomationGraphRun = {
  automation_id?: number | null;
  completed_at?: string | null;
  error_code?: string | null;
  fallback_status?: string | null;
  id?: number | null;
  parent_session_id?: string | null;
  reason?: string | null;
  started_at?: string | null;
  status?: string | null;
  trigger_type?: string | null;
};

export type AutomationGraphTraceNode = {
  child_session_id?: string | null;
  error_code?: string | null;
  execution_index?: number | null;
  id?: number | null;
  node_id?: number | null;
  node_key?: string | null;
  reason?: string | null;
  selected_ports?: string[];
  status?: string | null;
};

export type AutomationGraphTraceFallback = {
  error_code?: string | null;
  execution_index?: number | null;
  reason?: string | null;
  status?: string | null;
};

export type AutomationGraphTrace = {
  fallback?: AutomationGraphTraceFallback | null;
  nodes?: AutomationGraphTraceNode[];
  run?: AutomationGraphRun | null;
};

export type AutomationGraphPreview = {
  ai_handoff_present?: boolean;
  automation_id?: number | null;
  graph?: AutomationGraph | null;
  graph_available?: boolean;
  graph_error?: {
    reason?: string | null;
  } | null;
  latest_trace?: AutomationGraphTrace | null;
  recent_runs?: AutomationGraphRun[];
  validation?: AutomationGraphValidation | null;
};

export type AutomationDraft = {
  cron_expr: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  timezone_name: string;
  trigger_type: AutomationTriggerType;
};

export type AutomationsListResult = {
  automations: Automation[];
  filteredCount: number;
  summary: AutomationSummary;
};
