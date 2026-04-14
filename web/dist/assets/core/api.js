function appendQuery(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

async function safeJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

function toApiError(response, payload) {
  const detail = payload?.detail ?? payload ?? {};
  const error = new Error(detail.reason || detail.message || `Request failed with status ${response.status}`);
  error.code = detail.error_code || "request_failed";
  error.status = response.status;
  error.detail = detail;
  return error;
}

export class ApiClient {
  constructor(basePath) {
    this.basePath = basePath.replace(/\/$/, "");
  }

  async request(path, { method = "GET", params, body } = {}) {
    const url = new URL(`${this.basePath}${path}`, window.location.origin);
    appendQuery(url, params);
    const response = await fetch(url.toString(), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw toApiError(response, payload);
    }
    return payload;
  }

  async getConfig() {
    return this.request("/config");
  }

  async getPluginConfig() {
    return this.getConfig();
  }

  async updateConfig(payload) {
    return this.request("/config", {
      method: "PATCH",
      body: payload,
    });
  }

  async updatePluginConfig(payload) {
    return this.updateConfig(payload);
  }

  async resetConfig() {
    return this.request("/config", {
      method: "DELETE",
    });
  }

  async listProfiles() {
    return this.request("/profiles");
  }

  async listAutomations(params) {
    return this.request("/automations", { params });
  }

  async getAutomation(automationId, profileId) {
    return this.request(`/automations/${automationId}`, {
      params: { profile_id: profileId },
    });
  }

  async createAutomation(profileId, payload) {
    return this.request("/automations", {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async updateAutomation(profileId, automationId, payload) {
    return this.request(`/automations/${automationId}`, {
      method: "PATCH",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async deleteAutomation(profileId, automationId) {
    return this.request(`/automations/${automationId}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listTaskFlows(profileId) {
    return this.request("/task-flow/flows", {
      params: { profile_id: profileId },
    });
  }

  async createTaskFlow(profileId, payload) {
    return this.request("/task-flow/flows", {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async deleteTaskFlow(profileId, flowId) {
    return this.request(`/task-flow/flows/${encodeURIComponent(flowId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async getTaskBoard(profileId, params = {}) {
    return this.request("/task-flow/board", {
      params: { profile_id: profileId, ...params },
    });
  }

  async listReviewTasks(profileId, params = {}) {
    return this.request("/task-flow/review", {
      params: { profile_id: profileId, ...params },
    });
  }

  async createTask(profileId, payload) {
    return this.request("/task-flow/tasks", {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async getTask(profileId, taskId) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      params: { profile_id: profileId },
    });
  }

  async updateTask(profileId, taskId, payload) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async deleteTask(profileId, taskId) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async bulkUpdateTasks(profileId, payload) {
    return this.request("/task-flow/tasks/bulk-update", {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async bulkDeleteTasks(profileId, payload) {
    return this.request("/task-flow/tasks/bulk-delete", {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async listTaskComments(profileId, taskId) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/comments`, {
      params: { profile_id: profileId },
    });
  }

  async addTaskComment(profileId, taskId, payload) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async listTaskDependencies(profileId, taskId) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/dependencies`, {
      params: { profile_id: profileId },
    });
  }

  async listTaskEvents(profileId, taskId, params = {}) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/events`, {
      params: { profile_id: profileId, ...params },
    });
  }

  async listTaskRuns(profileId, taskId, params = {}) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/runs`, {
      params: { profile_id: profileId, ...params },
    });
  }

  async approveReviewTask(profileId, taskId, payload) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/review/approve`, {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async requestTaskChanges(profileId, taskId, payload) {
    return this.request(`/task-flow/tasks/${encodeURIComponent(taskId)}/review/request-changes`, {
      method: "POST",
      params: { profile_id: profileId },
      body: payload,
    });
  }

  async requestReviewChanges(profileId, taskId, payload) {
    return this.requestTaskChanges(profileId, taskId, payload);
  }

  async listSubagents(profileId, params = {}) {
    return this.request("/subagents", {
      params: { profile_id: profileId, ...params },
    });
  }

  async getSubagent(profileId, name) {
    return this.request(`/subagents/${encodeURIComponent(name)}`, {
      params: { profile_id: profileId },
    });
  }

  async createSubagent(profileId, payload) {
    return this.request("/subagents", {
      method: "POST",
      params: { profile_id: profileId },
      body: {
        name: payload.name,
        markdown: payload.markdown ?? payload.content ?? "",
      },
    });
  }

  async updateSubagent(profileId, name, payload) {
    return this.request(`/subagents/${encodeURIComponent(name)}`, {
      method: "PATCH",
      params: { profile_id: profileId },
      body: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.markdown || payload.content ? { markdown: payload.markdown ?? payload.content } : {}),
      },
    });
  }

  async deleteSubagent(profileId, name) {
    return this.request(`/subagents/${encodeURIComponent(name)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listSkills(profileId, params = {}) {
    return this.request("/skills", {
      params: { profile_id: profileId, ...params },
    });
  }

  async getSkill(profileId, name) {
    return this.request(`/skills/${encodeURIComponent(name)}`, {
      params: { profile_id: profileId },
    });
  }

  async createSkill(profileId, payload) {
    return this.request("/skills", {
      method: "POST",
      params: { profile_id: profileId },
      body: {
        name: payload.name,
        markdown: payload.markdown ?? payload.content ?? "",
      },
    });
  }

  async updateSkill(profileId, name, payload) {
    return this.request(`/skills/${encodeURIComponent(name)}`, {
      method: "PATCH",
      params: { profile_id: profileId },
      body: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.markdown || payload.content ? { markdown: payload.markdown ?? payload.content } : {}),
      },
    });
  }

  async deleteSkill(profileId, name) {
    return this.request(`/skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }

  async listBootstrapFiles(profileId, params = {}) {
    return this.request("/bootstrap-files", {
      params: { profile_id: profileId, ...params },
    });
  }

  async getBootstrapFile(profileId, fileName) {
    return this.request(`/bootstrap-files/${encodeURIComponent(fileName)}`, {
      params: { profile_id: profileId },
    });
  }

  async createBootstrapFile(profileId, payload) {
    return this.request("/bootstrap-files", {
      method: "POST",
      params: { profile_id: profileId },
      body: {
        file_name: payload.file_name ?? payload.name ?? "",
        content: payload.content ?? "",
      },
    });
  }

  async updateBootstrapFile(profileId, fileName, payload) {
    return this.request(`/bootstrap-files/${encodeURIComponent(fileName)}`, {
      method: "PATCH",
      params: { profile_id: profileId },
      body: {
        ...(payload.file_name || payload.name ? { file_name: payload.file_name ?? payload.name } : {}),
        ...(payload.content !== undefined ? { content: payload.content } : {}),
      },
    });
  }

  async deleteBootstrapFile(profileId, fileName) {
    return this.request(`/bootstrap-files/${encodeURIComponent(fileName)}`, {
      method: "DELETE",
      params: { profile_id: profileId },
    });
  }
}
