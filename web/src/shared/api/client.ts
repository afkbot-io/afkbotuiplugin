type ApiBody = Record<string, unknown> | unknown[] | string | number | boolean | null;
type ApiError = Error & {
  code?: string;
  detail?: unknown;
  status?: number;
};
type AuthSessionResponse = {
  auth?: Record<string, unknown>;
  authenticated?: boolean;
  session?: {
    username?: string;
  } | null;
};
type ConfigResponse = Record<string, unknown> & {
  config?: Record<string, unknown>;
};
type ProfilesResponse = {
  profiles?: Array<{
    id?: string | null;
    is_default?: boolean | null;
    title?: string | null;
  }>;
};

type RequestOptions = {
  body?: ApiBody;
  method?: string;
  params?: Record<string, unknown>;
};

function appendQuery(url: URL, params: Record<string, unknown> = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

async function safeJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

function toApiError(response: Response, payload: unknown) {
  const detail = (payload && typeof payload === "object" ? payload : null) as
    | {
        detail?: { error_code?: string; message?: string; reason?: string } | string;
        error_code?: string;
        message?: string;
        reason?: string;
      }
    | null;
  const errorDetail =
    detail?.detail && typeof detail.detail === "object"
      ? detail.detail
      : {
          error_code: detail?.error_code,
          message: typeof detail?.detail === "string" ? detail.detail : detail?.message || "",
          reason: detail?.reason,
        };
  const fallbackMessage =
    response.status >= 500
      ? `Server error (${response.status}). Check AFKBOT API logs for details.`
      : `Request failed with status ${response.status}`;
  const error = new Error(
    errorDetail.reason || errorDetail.message || fallbackMessage,
  ) as ApiError;
  error.code = errorDetail.error_code || "request_failed";
  error.status = response.status;
  error.detail = detail?.detail ?? payload;
  return error;
}

export class ApiClient {
  private readonly basePath: string;
  private readonly onUnauthorized: ((error: ApiError) => void) | null;
  private unauthorizedHandled = false;

  constructor(basePath: string, { onUnauthorized }: { onUnauthorized?: (error: ApiError) => void } = {}) {
    this.basePath = basePath.replace(/\/$/, "");
    this.onUnauthorized = typeof onUnauthorized === "function" ? onUnauthorized : null;
  }

  private handleUnauthorized(error: ApiError) {
    if (this.unauthorizedHandled) {
      return;
    }
    this.unauthorizedHandled = true;
    this.onUnauthorized?.(error);
  }

  async request<T>(path: string, { body, method = "GET", params }: RequestOptions = {}) {
    const url = new URL(`${this.basePath}${path}`, window.location.origin);
    appendQuery(url, params);
    const response = await fetch(url.toString(), {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method,
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      const error = toApiError(response, payload);
      if (response.status === 401 && error.code === "ui_auth_required") {
        this.handleUnauthorized(error);
      }
      throw error;
    }
    this.unauthorizedHandled = false;
    return payload as T;
  }

  async getAuthSession() {
    const url = new URL("/v1/auth/session", window.location.origin);
    const response = await fetch(url.toString(), {
      credentials: "same-origin",
      method: "GET",
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      const error = toApiError(response, payload);
      if (response.status === 401 && error.code === "ui_auth_required") {
        this.handleUnauthorized(error);
      }
      throw error;
    }
    this.unauthorizedHandled = false;
    return payload as AuthSessionResponse;
  }

  async logout() {
    const url = new URL("/v1/auth/logout", window.location.origin);
    const response = await fetch(url.toString(), {
      credentials: "same-origin",
      method: "POST",
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw toApiError(response, payload);
    }
    this.unauthorizedHandled = false;
    return payload as Record<string, unknown> & { ok?: boolean };
  }

  async getConfig() {
    return this.request<ConfigResponse>("/config");
  }

  async getPluginConfig() {
    return this.getConfig();
  }

  async updateConfig(payload: Record<string, unknown>) {
    return this.request<ConfigResponse>("/config", {
      body: payload,
      method: "PATCH",
    });
  }

  async updatePluginConfig(payload: Record<string, unknown>) {
    return this.updateConfig(payload);
  }

  async resetConfig() {
    return this.request<Record<string, unknown>>("/config", {
      method: "DELETE",
    });
  }

  async listProfiles() {
    return this.request<ProfilesResponse>("/profiles");
  }

  async getChatHistory(profileId: string, sessionId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/chat/history", {
      params: { profile_id: profileId, session_id: sessionId, ...params },
    });
  }

  async getChatProgress(profileId: string, sessionId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/chat/progress", {
      params: { profile_id: profileId, session_id: sessionId, ...params },
    });
  }

  async sendChatTurn(payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/chat/turn", {
      body: payload,
      method: "POST",
    });
  }

  async answerChatQuestion(payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/chat/answer", {
      body: payload,
      method: "POST",
    });
  }

  async submitChatSecureField(payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/chat/secure-field", {
      body: payload,
      method: "POST",
    });
  }

  async listAutomations(params: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/automations", { params });
  }

  async getAutomation(automationId: number, profileId: string) {
    return this.request<Record<string, unknown>>(`/automations/${automationId}`, {
      params: { profile_id: profileId },
    });
  }

  async getAutomationWebhookEndpoint(automationId: number, profileId: string) {
    return this.request<Record<string, unknown>>(`/automations/${automationId}/webhook-endpoint`, {
      params: { profile_id: profileId },
    });
  }

  async getAutomationGraphPreview(automationId: number, profileId: string, limit = 6) {
    return this.request<Record<string, unknown>>(`/automations/${automationId}/graph-preview`, {
      params: { limit, profile_id: profileId },
    });
  }

  async createAutomation(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/automations", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateAutomation(profileId: string, automationId: number, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/automations/${automationId}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteAutomation(profileId: string, automationId: number) {
    return this.request<Record<string, unknown>>(`/automations/${automationId}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listSubagents(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/subagents", {
      params: { profile_id: profileId, ...params },
    });
  }

  async listTaskFlowEmployees(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/task-flow/employees", {
      params: { profile_id: profileId, ...params },
    });
  }

  async createTaskFlowEmployee(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/employees", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateTaskFlowEmployee(profileId: string, employeeId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/employees/${encodeURIComponent(employeeId)}`, {
      body: payload,
      method: "PUT",
      params: { profile_id: profileId },
    });
  }

  async deleteTaskFlowEmployee(profileId: string, employeeId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/employees/${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async getTaskFlowOrgChart(profileId: string) {
    return this.request<Record<string, unknown>>("/task-flow/org-chart", {
      params: { profile_id: profileId },
    });
  }

  async getSubagent(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/subagents/${encodeURIComponent(itemId)}`, {
      params: { profile_id: profileId },
    });
  }

  async createSubagent(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/subagents", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateSubagent(profileId: string, itemId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/subagents/${encodeURIComponent(itemId)}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteSubagent(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/subagents/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listSkills(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/skills", {
      params: { profile_id: profileId, ...params },
    });
  }

  async getSkill(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/skills/${encodeURIComponent(itemId)}`, {
      params: { profile_id: profileId },
    });
  }

  async createSkill(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/skills", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateSkill(profileId: string, itemId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/skills/${encodeURIComponent(itemId)}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteSkill(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/skills/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listBootstrapFiles(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/bootstrap-files", {
      params: { profile_id: profileId, ...params },
    });
  }

  async getBootstrapFile(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/bootstrap-files/${encodeURIComponent(itemId)}`, {
      params: { profile_id: profileId },
    });
  }

  async createBootstrapFile(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/bootstrap-files", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateBootstrapFile(profileId: string, itemId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/bootstrap-files/${encodeURIComponent(itemId)}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteBootstrapFile(profileId: string, itemId: string) {
    return this.request<Record<string, unknown>>(`/bootstrap-files/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listTaskFlows(profileId: string) {
    return this.request<Record<string, unknown>>("/task-flow/flows", {
      params: { profile_id: profileId },
    });
  }

  async createTaskFlow(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/flows", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async updateTaskFlow(profileId: string, flowId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/flows/${encodeURIComponent(flowId)}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteTaskFlow(profileId: string, flowId: string, payload: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(`/task-flow/flows/${encodeURIComponent(flowId)}`, {
      body: payload,
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listTaskFlowDocuments(profileId: string, scopeType: string, scopeId: string) {
    return this.request<Record<string, unknown>>("/task-flow/docs", {
      params: { profile_id: profileId, scope_id: scopeId, scope_type: scopeType },
    });
  }

  async listTaskFlowDocumentWorkspace(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/task-flow/documents", {
      params: { profile_id: profileId, ...params },
    });
  }

  async runTaskFlowKnowledgeMaintenance(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/knowledge-maintenance", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async putTaskFlowDocument(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/docs", {
      body: payload,
      method: "PUT",
      params: { profile_id: profileId },
    });
  }

  async confirmTaskFlowDocument(profileId: string, documentId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/docs/${encodeURIComponent(documentId)}/confirm`, {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async deleteTaskFlowDocument(profileId: string, documentId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/docs/${encodeURIComponent(documentId)}`, {
      body: payload,
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async getTaskBoard(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/task-flow/board", {
      params: { profile_id: profileId, ...params },
    });
  }

  async listTaskSessionActivity(profileId: string, taskIds: string[] = []) {
    const ids = Array.isArray(taskIds) ? taskIds.join(",") : taskIds;
    return this.request<Record<string, unknown>>("/task-flow/sessions/activity", {
      params: { profile_id: profileId, task_ids: ids },
    });
  }

  async getTaskSessionInsights(profileId: string, taskId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/session`, {
      params: { profile_id: profileId, ...params },
    });
  }

  async listReviewTasks(profileId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>("/task-flow/review", {
      params: { profile_id: profileId, ...params },
    });
  }

  async createTask(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/tasks", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async getTask(profileId: string, taskId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      params: { profile_id: profileId },
    });
  }

  async getTaskContext(profileId: string, taskId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/context`, {
      params: { profile_id: profileId },
    });
  }

  async listTaskAttachments(profileId: string, taskId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/attachments`, {
      params: { profile_id: profileId },
    });
  }

  async addTaskAttachments(profileId: string, taskId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/attachments`, {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async deleteTaskAttachment(profileId: string, taskId: string, attachmentId: string, payload: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(
      `/task-flow/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        body: payload,
        method: "DELETE",
        params: { profile_id: profileId },
      },
    );
  }

  getTaskAttachmentDownloadUrl(profileId: string, taskId: string, attachmentId: string) {
    const url = new URL(
      `${this.basePath}/task-flow/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
      window.location.origin,
    );
    appendQuery(url, { profile_id: profileId });
    return url.pathname + url.search;
  }

  async updateTask(profileId: string, taskId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      body: payload,
      method: "PATCH",
      params: { profile_id: profileId },
    });
  }

  async deleteTask(profileId: string, taskId: string, payload: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      body: payload,
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async bulkUpdateTasks(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/tasks/bulk-update", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async bulkDeleteTasks(profileId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/task-flow/tasks/bulk-delete", {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async listTaskComments(profileId: string, taskId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/comments`, {
      params: { profile_id: profileId },
    });
  }

  async addTaskComment(profileId: string, taskId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/comments`, {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async listTaskDependencies(profileId: string, taskId: string) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/dependencies`, {
      params: { profile_id: profileId },
    });
  }

  async listTaskEvents(profileId: string, taskId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/events`, {
      params: { profile_id: profileId, ...params },
    });
  }

  async listTaskRuns(profileId: string, taskId: string, params: Record<string, unknown> = {}) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/runs`, {
      params: { profile_id: profileId, ...params },
    });
  }

  async approveReviewTask(profileId: string, taskId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/task-flow/tasks/${encodeURIComponent(taskId)}/review/approve`, {
      body: payload,
      method: "POST",
      params: { profile_id: profileId },
    });
  }

  async requestReviewChanges(profileId: string, taskId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(
      `/task-flow/tasks/${encodeURIComponent(taskId)}/review/request-changes`,
      {
        body: payload,
        method: "POST",
        params: { profile_id: profileId },
      },
    );
  }
}
