import { formatDateTime } from "../core/time.js";

const STATUS_OPTIONS = ["todo", "blocked", "review", "completed", "failed", "cancelled"];
const AI_PROFILE_TYPE = "ai_profile";
const HUMAN_ACTOR_TYPE = "human";

export function createTaskFlowView({ api, notify, commitConfig }) {
  let root = null;
  let refreshTimer = null;
  let mounted = false;

  const state = {
    active: false,
    profileId: "",
    profiles: [],
    config: {
      task_flow_poll_interval_sec: 5,
      task_flow_board_limit_per_column: 20,
      task_flow_actor_type: "human",
      task_flow_actor_ref: "web-user",
    },
    board: null,
    flows: [],
    reviewTasks: [],
    selectedTaskId: "",
    selectedTaskData: null,
    selectedTaskIds: new Set(),
    loading: false,
    error: "",
    flowFilter: "",
    dragTaskId: "",
    activeModal: "",
    modalBusy: false,
    modalError: "",
    refreshInFlight: false,
    signatures: {
      flows: "",
      board: "",
      review: "",
      selectedTask: "",
    },
  };

  function currentProfileId() {
    return state.profileId;
  }

  function currentProfiles() {
    return state.profiles;
  }

  function currentConfig() {
    return state.config;
  }

  function commitSelectedTaskData(taskData) {
    const nextSignature = taskDataSignature(taskData);
    const changed = state.signatures.selectedTask !== nextSignature;
    state.selectedTaskData = taskData;
    state.signatures.selectedTask = nextSignature;
    return changed;
  }

  function setModal(nextModal) {
    state.activeModal = nextModal;
    state.modalBusy = false;
    state.modalError = "";
  }

  async function handleClick(event) {
    if (!root) {
      return;
    }
    const actionNode = event.target.closest("[data-taskflow-action]");
    if (actionNode) {
      const action = actionNode.dataset.taskflowAction;
      if (action === "refresh") {
        await refreshAll({ force: true });
        return;
      }
      if (action === "open-flow") {
        setModal("flow");
        render();
        return;
      }
      if (action === "open-task") {
        setModal("task");
        render();
        return;
      }
      if (action === "open-review") {
        setModal("review");
        render();
        return;
      }
      if (action === "open-settings") {
        setModal("settings");
        render();
        return;
      }
      if (action === "open-delete-flow") {
        if (!state.flowFilter) {
          return;
        }
        setModal("delete-flow");
        render();
        return;
      }
      if (action === "open-delete-task") {
        if (!state.selectedTaskId) {
          return;
        }
        setModal("delete-task");
        render();
        return;
      }
      if (action === "close-modal") {
        setModal("");
        render();
        return;
      }
      if (action === "clear-selection") {
        state.selectedTaskIds.clear();
        render();
        return;
      }
      if (action === "open-delete-selected") {
        if (!state.selectedTaskIds.size) {
          return;
        }
        setModal("delete-selected");
        render();
        return;
      }
      if (action === "select-visible") {
        const visibleIds = getVisibleBoardTaskIds(root);
        for (const taskId of visibleIds) {
          state.selectedTaskIds.add(taskId);
        }
        if (!visibleIds.length) {
          notify("No visible tasks in the current board viewport.", "info");
        }
        render();
        return;
      }
      if (action === "close-task-panel") {
        state.selectedTaskId = "";
        commitSelectedTaskData(null);
        render();
        return;
      }
      if (action === "approve-review") {
        await approveReview();
        return;
      }
      if (action === "request-changes") {
        await requestChanges();
        return;
      }
    }

    const taskOpen = event.target.closest("[data-task-open]");
    if (taskOpen) {
      await selectTask(taskOpen.dataset.taskOpen || "");
      return;
    }

    const taskCard = event.target.closest("[data-task-id]");
    if (taskCard && !event.target.closest("input, label, button, textarea, select, a")) {
      await selectTask(taskCard.dataset.taskId || "");
      return;
    }

    const reviewSelect = event.target.closest("[data-review-select]");
    if (reviewSelect) {
      setModal("");
      await selectTask(reviewSelect.dataset.reviewSelect || "");
    }
  }

  async function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    const form = target.closest("form");
    if (target.matches('[name="flow_filter"]')) {
      state.flowFilter = target.value;
      state.selectedTaskId = "";
      state.selectedTaskIds.clear();
      state.dragTaskId = "";
      setModal("");
      commitSelectedTaskData(null);
      await refreshAll();
      return;
    }
    if (target.matches('[data-task-checkbox]')) {
      const taskId = target.dataset.taskCheckbox;
      if (!taskId) {
        return;
      }
      if (target.checked) {
        state.selectedTaskIds.add(taskId);
      } else {
        state.selectedTaskIds.delete(taskId);
      }
      render();
      return;
    }
    if (
      target instanceof HTMLSelectElement
      && ["default_owner_type", "owner_type", "reviewer_type", "review_owner_type"].includes(target.name)
    ) {
      syncConditionalFields(target.closest("form, .task-inspector, .modal-card, .bulk-panel, .detail-section") || root);
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    event.preventDefault();
    if (form.dataset.role === "taskflow-create-flow") {
      await createFlow(form);
      return;
    }
    if (form.dataset.role === "taskflow-create-task") {
      await createTask(form);
      return;
    }
    if (form.dataset.role === "taskflow-settings") {
      await saveSettings(form);
      return;
    }
    if (form.dataset.role === "taskflow-delete-flow") {
      await deleteFlow();
      return;
    }
    if (form.dataset.role === "taskflow-delete-task") {
      await deleteTask();
      return;
    }
    if (form.dataset.role === "taskflow-delete-selected") {
      await deleteSelectedTasks();
      return;
    }
    if (form.dataset.role === "taskflow-bulk") {
      await applyBulk(form);
      return;
    }
    if (form.dataset.role === "taskflow-task-edit") {
      await saveTask(form);
      return;
    }
    if (form.dataset.role === "taskflow-comment") {
      await submitComment(form);
    }
  }

  function handleDragStart(event) {
    const cardNode = event.target.closest("[data-task-id]");
    if (!cardNode) {
      return;
    }
    state.dragTaskId = cardNode.dataset.taskId || "";
  }

  function handleDragEnd() {
    state.dragTaskId = "";
  }

  function handleDragOver(event) {
    const columnNode = event.target.closest("[data-column-id]");
    if (!columnNode || !state.dragTaskId) {
      return;
    }
    if (!STATUS_OPTIONS.includes(columnNode.dataset.columnId || "")) {
      return;
    }
    event.preventDefault();
  }

  async function handleDrop(event) {
    const columnNode = event.target.closest("[data-column-id]");
    if (!columnNode || !state.dragTaskId) {
      return;
    }
    if (!STATUS_OPTIONS.includes(columnNode.dataset.columnId || "")) {
      return;
    }
    event.preventDefault();
    const ids = state.selectedTaskIds.has(state.dragTaskId) ? [...state.selectedTaskIds] : [state.dragTaskId];
    const nextStatus = columnNode.dataset.columnId;
    const changedIds = ids.filter((taskId) => {
      const task = findBoardTask(state.board, taskId);
      return task && task.status !== nextStatus;
    });
    if (!changedIds.length) {
      state.dragTaskId = "";
      return;
    }
    await api.bulkUpdateTasks(currentProfileId(), {
      task_ids: changedIds,
      status: columnNode.dataset.columnId,
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
    });
    notify("Tasks moved.", "success");
    await refreshAll({ force: true });
  }

  async function refreshAll({ silent = false, force = false } = {}) {
    const profileId = currentProfileId();
    if (!profileId || state.refreshInFlight) {
      return;
    }
    state.refreshInFlight = true;
    state.loading = !silent && !state.board;
    const hadError = Boolean(state.error);
    state.error = "";
    if (state.loading) {
      render();
    }
    try {
      const [flowsPayload, boardPayload, reviewPayload] = await Promise.all([
        api.listTaskFlows(profileId),
        api.getTaskBoard(profileId, {
          flow_id: state.flowFilter || undefined,
          limit_per_column: currentConfig().task_flow_board_limit_per_column,
        }),
        api.listReviewTasks(profileId, {
          flow_id: state.flowFilter || undefined,
          actor_type: currentConfig().task_flow_actor_type,
          actor_ref: currentConfig().task_flow_actor_ref,
        }),
      ]);
      const nextFlows = flowsPayload.task_flows || [];
      const nextBoard = boardPayload.board || null;
      const nextReviewTasks = reviewPayload.review_tasks || [];
      const nextFlowsSignature = flowSignature(nextFlows);
      const nextBoardSignature = boardSignature(nextBoard);
      const nextReviewSignature = reviewSignature(nextReviewTasks);
      const structureChanged = (
        force
        || !state.board
        || hadError
        || state.signatures.flows !== nextFlowsSignature
        || state.signatures.board !== nextBoardSignature
        || state.signatures.review !== nextReviewSignature
      );

      state.flows = nextFlows;
      state.board = nextBoard;
      state.reviewTasks = nextReviewTasks;
      state.loading = false;
      state.error = "";
      state.signatures.flows = nextFlowsSignature;
      state.signatures.board = nextBoardSignature;
      state.signatures.review = nextReviewSignature;

      if (state.selectedTaskId) {
        const selectedTaskChanged = await loadSelectedTask({
          silent,
          forceRender: force || !silent || structureChanged,
        });
        if (!selectedTaskChanged && (force || !silent || structureChanged)) {
          render();
        }
      } else if (force || !silent || structureChanged) {
        render();
      }
    } catch (error) {
      state.loading = false;
      state.error = normalizeError(error);
      render();
    } finally {
      state.refreshInFlight = false;
    }
  }

  async function loadSelectedTask({ silent = false, forceRender = false } = {}) {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      commitSelectedTaskData(null);
      if (!silent || forceRender) {
        render();
      }
      return true;
    }
    try {
      const [taskPayload, commentsPayload, eventsPayload, runsPayload, dependenciesPayload] = await Promise.all([
        api.getTask(profileId, state.selectedTaskId),
        api.listTaskComments(profileId, state.selectedTaskId),
        api.listTaskEvents(profileId, state.selectedTaskId),
        api.listTaskRuns(profileId, state.selectedTaskId),
        api.listTaskDependencies(profileId, state.selectedTaskId),
      ]);
      const nextTaskData = {
        task: taskPayload.task,
        task_comments: commentsPayload.task_comments || [],
        task_events: eventsPayload.task_events || [],
        task_runs: runsPayload.task_runs || [],
        task_dependencies: dependenciesPayload.task_dependencies || [],
      };
      const changed = commitSelectedTaskData(nextTaskData);
      if (changed || !silent || forceRender) {
        render();
      }
      return changed;
    } catch (error) {
      state.error = normalizeError(error);
      render();
      return true;
    }
  }

  async function selectTask(taskId) {
    if (!taskId) {
      return;
    }
    state.selectedTaskId = taskId;
    state.signatures.selectedTask = "";
    render();
    await loadSelectedTask({ forceRender: true });
  }

  async function createFlow(form) {
    const profileId = currentProfileId();
    const formData = new FormData(form);
    await api.createTaskFlow(profileId, {
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      created_by_type: currentConfig().task_flow_actor_type,
      created_by_ref: currentConfig().task_flow_actor_ref,
      default_owner_type: String(formData.get("default_owner_type") || "") || null,
      default_owner_ref: normalizeActorRef(
        String(formData.get("default_owner_type") || "") || null,
        String(formData.get("default_owner_ref") || ""),
        currentConfig(),
      ),
      labels: parseCsv(formData.get("labels")),
    });
    setModal("");
    notify("Task Flow created.", "success");
    await refreshAll({ force: true });
  }

  async function createTask(form) {
    const profileId = currentProfileId();
    const formData = new FormData(form);
    const payload = {
      title: String(formData.get("title") || "").trim(),
      prompt: String(formData.get("prompt") || "").trim(),
      created_by_type: currentConfig().task_flow_actor_type,
      created_by_ref: currentConfig().task_flow_actor_ref,
      flow_id: String(formData.get("flow_id") || "") || null,
      priority: Number(formData.get("priority") || 50),
      due_at: formData.get("due_at") ? new Date(String(formData.get("due_at"))).toISOString() : null,
      owner_type: String(formData.get("owner_type") || "") || null,
      owner_ref: normalizeActorRef(
        String(formData.get("owner_type") || "") || null,
        String(formData.get("owner_ref") || ""),
        currentConfig(),
      ),
      reviewer_type: String(formData.get("reviewer_type") || "") || null,
      reviewer_ref: normalizeActorRef(
        String(formData.get("reviewer_type") || "") || null,
        String(formData.get("reviewer_ref") || ""),
        currentConfig(),
      ),
      labels: parseCsv(formData.get("labels")),
      requires_review: formData.get("requires_review") === "on",
      depends_on_task_ids: parseCsv(formData.get("depends_on_task_ids")),
    };
    const response = await api.createTask(profileId, payload);
    setModal("");
    state.selectedTaskId = response.task.id;
    notify("Task created.", "success");
    await refreshAll({ force: true });
  }

  async function saveSettings(form) {
    const formData = new FormData(form);
    state.config = await commitConfig({
      task_flow_poll_interval_sec: Number(formData.get("task_flow_poll_interval_sec") || 5),
      task_flow_board_limit_per_column: Number(formData.get("task_flow_board_limit_per_column") || 20),
      task_flow_actor_type: String(formData.get("task_flow_actor_type") || "human"),
      task_flow_actor_ref: String(formData.get("task_flow_actor_ref") || "web-user").trim() || "web-user",
    });
    setModal("");
    notify("Task Flow settings saved.", "success");
    syncRefreshLoop();
    await refreshAll({ force: true });
  }

  async function deleteFlow() {
    const profileId = currentProfileId();
    const flowId = state.flowFilter;
    if (!profileId || !flowId) {
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      await api.deleteTaskFlow(profileId, flowId);
      state.flowFilter = "";
      state.selectedTaskId = "";
      state.selectedTaskIds.clear();
      commitSelectedTaskData(null);
      setModal("");
      notify("Task Flow deleted.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function applyBulk(form) {
    const profileId = currentProfileId();
    const ids = [...state.selectedTaskIds];
    if (!ids.length) {
      notify("Select at least one task first.", "danger");
      return;
    }
    const formData = new FormData(form);
    const response = await api.bulkUpdateTasks(profileId, {
      task_ids: ids,
      status: String(formData.get("status") || "") || null,
      owner_type: String(formData.get("owner_type") || "") || null,
      owner_ref: normalizeActorRef(
        String(formData.get("owner_type") || "") || null,
        String(formData.get("owner_ref") || ""),
        currentConfig(),
      ),
      comment_message: String(formData.get("comment_message") || "").trim() || null,
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
    });
    state.selectedTaskIds.clear();
    if (response.error_count) {
      const kind = response.updated_count ? "info" : "danger";
      notify(
        response.updated_count
          ? `Updated ${response.updated_count} tasks. ${response.error_count} skipped.`
          : (response.errors?.[0]?.reason || "Bulk update failed."),
        kind,
      );
    } else {
      notify(`Updated ${response.updated_count} tasks.`, "success");
    }
    await refreshAll({ force: true });
  }

  async function saveTask(form) {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    await api.updateTask(profileId, state.selectedTaskId, {
      title: String(formData.get("title") || "").trim(),
      prompt: String(formData.get("prompt") || "").trim(),
      status: String(formData.get("status") || ""),
      priority: Number(formData.get("priority") || 50),
      due_at: formData.get("due_at") ? new Date(String(formData.get("due_at"))).toISOString() : null,
      owner_type: String(formData.get("owner_type") || "") || null,
      owner_ref: normalizeActorRef(
        String(formData.get("owner_type") || "") || null,
        String(formData.get("owner_ref") || ""),
        currentConfig(),
      ),
      reviewer_type: String(formData.get("reviewer_type") || "") || null,
      reviewer_ref: normalizeActorRef(
        String(formData.get("reviewer_type") || "") || null,
        String(formData.get("reviewer_ref") || ""),
        currentConfig(),
      ),
      requires_review: formData.get("requires_review") === "on",
      labels: parseCsv(formData.get("labels")),
      blocked_reason_text: String(formData.get("blocked_reason_text") || "").trim() || null,
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
    });
    notify("Task updated.", "success");
    await refreshAll({ force: true });
  }

  async function deleteTask() {
    const profileId = currentProfileId();
    const taskId = state.selectedTaskId;
    if (!profileId || !taskId) {
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      await api.deleteTask(profileId, taskId);
      state.selectedTaskIds.delete(taskId);
      state.selectedTaskId = "";
      commitSelectedTaskData(null);
      setModal("");
      notify("Task deleted.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function deleteSelectedTasks() {
    const profileId = currentProfileId();
    const taskIds = [...state.selectedTaskIds];
    if (!profileId || !taskIds.length) {
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      const response = await api.bulkDeleteTasks(profileId, { task_ids: taskIds });
      for (const taskId of response.deleted_task_ids || []) {
        state.selectedTaskIds.delete(taskId);
      }
      if (state.selectedTaskId && (response.deleted_task_ids || []).includes(state.selectedTaskId)) {
        state.selectedTaskId = "";
        commitSelectedTaskData(null);
      }
      if (response.error_count) {
        state.modalBusy = false;
        state.modalError = response.errors?.[0]?.reason || "Some tasks could not be deleted.";
        render();
        await refreshAll({ force: true });
        return;
      }
      setModal("");
      notify(`Deleted ${response.deleted_count} tasks.`, "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function submitComment(form) {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    const message = String(formData.get("message") || "").trim();
    if (!message) {
      notify("Comment message is required.", "danger");
      return;
    }
    await api.addTaskComment(profileId, state.selectedTaskId, {
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
      message,
      comment_type: "note",
    });
    notify("Comment added.", "success");
    await refreshAll({ force: true });
  }

  async function approveReview() {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    await api.approveReviewTask(profileId, state.selectedTaskId, {
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
    });
    notify("Review approved.", "success");
    await refreshAll({ force: true });
  }

  async function requestChanges() {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    const reasonField = root.querySelector('[name="review_reason_text"]');
    const ownerTypeField = root.querySelector('[name="review_owner_type"]');
    const ownerRefField = root.querySelector('[name="review_owner_ref"]');
    const reasonText = String(reasonField?.value || "").trim();
    if (!reasonText) {
      notify("Change request reason is required.", "danger");
      return;
    }
    await api.requestReviewChanges(profileId, state.selectedTaskId, {
      reason_text: reasonText,
      actor_type: currentConfig().task_flow_actor_type,
      actor_ref: currentConfig().task_flow_actor_ref,
      owner_type: String(ownerTypeField?.value || "") || null,
      owner_ref: normalizeActorRef(
        String(ownerTypeField?.value || "") || null,
        String(ownerRefField?.value || ""),
        currentConfig(),
      ),
    });
    notify("Changes requested.", "success");
    await refreshAll({ force: true });
  }

  function render() {
    if (!root) {
      return;
    }
    const activeFlow = state.flows.find((flow) => flow.id === state.flowFilter) || null;
    root.innerHTML = `
      <section class="taskflow-page">
        <header class="taskflow-toolbar glass-panel">
          <div class="taskflow-toolbar__left">
            <div>
              <p class="surface-page__eyebrow">Task Flow</p>
              <h2 class="surface-page__title">Task Flow Board</h2>
            </div>
            <label class="field field--compact">
              <span class="field__label">Flow</span>
              <select name="flow_filter">
                <option value="">All Flows</option>
                ${state.flows.map((flow) => `<option value="${escapeAttribute(flow.id)}" ${flow.id === state.flowFilter ? "selected" : ""}>${escapeHtml(flow.title)}</option>`).join("")}
              </select>
            </label>
          </div>
          <div class="taskflow-toolbar__actions">
            <button class="button button--ghost" data-taskflow-action="open-review" type="button">Review <span class="button__count">${state.reviewTasks.length}</span></button>
            <button class="button button--ghost" data-taskflow-action="open-flow" type="button">New Flow</button>
            ${activeFlow ? '<button class="button button--danger" data-taskflow-action="open-delete-flow" type="button">Delete Flow</button>' : ""}
            <button class="button button--primary" data-taskflow-action="open-task" type="button">New Task</button>
            <button class="button button--ghost" data-taskflow-action="open-settings" type="button">Settings</button>
            <button class="button" data-taskflow-action="refresh" type="button">Refresh</button>
          </div>
        </header>

        ${state.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.error)}</div>` : ""}

        <section class="glass-panel bulk-panel">
          <div class="bulk-panel__meta">
            <div class="bulk-panel__summary">
              <span class="pill">${state.selectedTaskIds.size} selected</span>
              <span class="muted-copy">Quick select only adds cards that are visible in the current board viewport.</span>
            </div>
            <div class="bulk-panel__actions">
              <div class="bulk-panel__action-group">
                <button class="button button--ghost" data-taskflow-action="select-visible" type="button">Visible</button>
                <button class="button button--ghost" data-taskflow-action="clear-selection" type="button">Clear</button>
              </div>
              <div class="bulk-panel__action-group bulk-panel__action-group--danger">
                <button class="button button--danger" data-taskflow-action="open-delete-selected" type="button" ${state.selectedTaskIds.size ? "" : "disabled"}>Delete Selected</button>
              </div>
            </div>
          </div>
          <form class="bulk-form" data-role="taskflow-bulk">
            <label class="field field--compact">
              <span class="field__label">Status</span>
              <select name="status">
                <option value="">No change</option>
                ${STATUS_OPTIONS.map((status) => `<option value="${status}">${status}</option>`).join("")}
              </select>
            </label>
            <label class="field field--compact">
              <span class="field__label">Owner Type</span>
              <select name="owner_type">
                <option value="">No change</option>
                <option value="ai_profile">ai_profile</option>
                <option value="human">human</option>
              </select>
            </label>
            ${renderProfileRefField({
              label: "Owner Ref",
              fieldName: "owner_ref",
              typeValue: "",
              value: "",
              profiles: currentProfiles(),
              allowBlank: true,
              config: currentConfig(),
            })}
            <label class="field field--compact bulk-form__comment">
              <span class="field__label">Comment</span>
              <input name="comment_message" placeholder="Optional note for the selected tasks…" />
            </label>
            <button class="button button--primary" type="submit" ${state.selectedTaskIds.size ? "" : "disabled"}>Apply Changes</button>
          </form>
        </section>

        <div class="taskflow-layout ${state.selectedTaskData ? "taskflow-layout--open" : ""}">
          <section class="board-shell glass-panel">
            ${state.loading ? '<div class="empty-state empty-state--compact"><h3>Loading…</h3><p>Refreshing Task Flow data.</p></div>' : renderBoard(state.board, state.selectedTaskId, state.selectedTaskIds)}
          </section>
          ${renderTaskPanel(state.selectedTaskData, currentProfiles(), currentConfig())}
        </div>

        ${renderModal(state, currentConfig(), currentProfiles())}
      </section>
    `;
    syncConditionalFields(root);
  }

  function stopRefreshLoop() {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function syncRefreshLoop() {
    stopRefreshLoop();
    if (!state.active) {
      return;
    }
    const intervalSeconds = Number(state.config.task_flow_poll_interval_sec || 5);
    refreshTimer = window.setInterval(() => {
      if (document.hidden || state.activeModal || document.activeElement?.matches("input, textarea, select")) {
        return;
      }
      void refreshAll({ silent: true });
    }, Math.max(1, intervalSeconds) * 1000);
  }

  return {
    async mount(container) {
      root = container;
      mounted = true;
      root.classList.add("route-view", "view-surface", "view-surface--taskflow");
      root.addEventListener("click", handleClick);
      root.addEventListener("change", handleChange);
      root.addEventListener("submit", handleSubmit);
      root.addEventListener("dragstart", handleDragStart);
      root.addEventListener("dragend", handleDragEnd);
      root.addEventListener("dragover", handleDragOver);
      root.addEventListener("drop", handleDrop);
      render();
    },
    async activate(context = {}) {
      state.active = true;
      state.profileId = context.profileId || state.profileId;
      state.profiles = context.profiles || state.profiles;
      state.config = context.config || state.config;
      if (!state.board && !state.loading) {
        render();
      }
      syncRefreshLoop();
      await refreshAll({ silent: Boolean(state.board) && !state.error });
    },
    deactivate() {
      state.active = false;
      stopRefreshLoop();
    },
    async setProfile(profileId) {
      if (!profileId || state.profileId === profileId) {
        return;
      }
      state.profileId = profileId;
      state.board = null;
      state.flows = [];
      state.reviewTasks = [];
      state.selectedTaskId = "";
      state.selectedTaskIds.clear();
      state.signatures = { flows: "", board: "", review: "", selectedTask: "" };
      commitSelectedTaskData(null);
      if (state.active) {
        await refreshAll({ force: true });
      }
    },
    updateConfig(config) {
      state.config = config || state.config;
      syncRefreshLoop();
      if (state.active) {
        void refreshAll({ force: true });
      }
    },
    destroy() {
      stopRefreshLoop();
      if (!mounted || !root) {
        return;
      }
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", handleChange);
      root.removeEventListener("submit", handleSubmit);
      root.removeEventListener("dragstart", handleDragStart);
      root.removeEventListener("dragend", handleDragEnd);
      root.removeEventListener("dragover", handleDragOver);
      root.removeEventListener("drop", handleDrop);
      root.innerHTML = "";
      mounted = false;
    },
  };
}

export function createTaskFlowController({
  api,
  root,
  getProfileId,
  getProfiles,
  getConfig,
  updateConfig,
  notify,
}) {
  const view = createTaskFlowView({
    api,
    notify,
    commitConfig: async (patch) => updateConfig(remapOutgoingConfig(patch, getConfig())),
  });
  let mounted = false;
  let active = false;

  function buildContext() {
    return {
      profileId: getProfileId(),
      profiles: getProfiles(),
      config: remapIncomingConfig(getConfig()),
    };
  }

  return {
    async activate() {
      if (!mounted) {
        await view.mount(root);
        mounted = true;
      }
      active = true;
      await view.activate(buildContext());
    },
    deactivate() {
      active = false;
      view.deactivate();
    },
    setActive(nextActive) {
      if (!nextActive) {
        this.deactivate();
      }
    },
    async onProfileChange() {
      if (!mounted) {
        return;
      }
      await view.setProfile(getProfileId());
      if (active) {
        await view.activate(buildContext());
      }
    },
    async refresh() {
      if (!mounted) {
        return;
      }
      await view.activate(buildContext());
    },
    updateConfig(config) {
      if (!mounted) {
        return;
      }
      view.updateConfig(remapIncomingConfig(config));
    },
  };
}

function remapIncomingConfig(config) {
  return {
    task_flow_poll_interval_sec: Number(config?.task_flow_poll_interval_sec || config?.poll_interval_sec || 5),
    task_flow_board_limit_per_column: Number(
      config?.task_flow_board_limit_per_column || config?.board_limit_per_column || 20
    ),
    task_flow_actor_type: String(config?.task_flow_actor_type || config?.actor_type || "human"),
    task_flow_actor_ref: String(config?.task_flow_actor_ref || config?.actor_ref || "web-user"),
  };
}

function remapOutgoingConfig(patch, currentConfig) {
  return {
    task_flow_poll_interval_sec: Number(
      patch.task_flow_poll_interval_sec || currentConfig?.task_flow_poll_interval_sec || currentConfig?.poll_interval_sec || 5
    ),
    task_flow_board_limit_per_column: Number(
      patch.task_flow_board_limit_per_column || currentConfig?.task_flow_board_limit_per_column || currentConfig?.board_limit_per_column || 20
    ),
    task_flow_actor_type: String(
      patch.task_flow_actor_type || currentConfig?.task_flow_actor_type || currentConfig?.actor_type || "human"
    ),
    task_flow_actor_ref: String(
      patch.task_flow_actor_ref || currentConfig?.task_flow_actor_ref || currentConfig?.actor_ref || "web-user"
    ),
  };
}

function renderBoard(board, selectedTaskId, selectedTaskIds) {
  if (!board?.columns?.length) {
    return `
      <div class="empty-state">
        <h3>No tasks yet</h3>
        <p>Create a flow and add tasks. The board stays live inside the same UI instead of jumping to a separate page.</p>
      </div>
    `;
  }
  return `
    <div class="board-viewport">
      <div class="board-grid">
        ${board.columns.map((column) => `
          <section class="task-column" data-column-id="${escapeAttribute(column.id)}">
            <header class="task-column__head">
              <h3 class="task-column__title">${escapeHtml(column.title)}</h3>
              <span class="task-column__count">${escapeHtml(String(column.count))}</span>
            </header>
            <div class="task-column__body">
              ${(column.tasks || []).length ? column.tasks.map((task) => renderCard(task, selectedTaskId, selectedTaskIds)).join("") : '<div class="empty-state empty-state--compact"><h3>No tasks</h3></div>'}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCard(task, selectedTaskId, selectedTaskIds) {
  const isSelected = task.id === selectedTaskId || selectedTaskIds.has(task.id);
  const activeSession = getTaskActiveSession(task);
  const previewCopy = task.last_comment_message || task.prompt || "No prompt yet.";
  const previewLabel = task.last_comment_message ? "Latest comment" : "Prompt";
  return `
    <article class="task-card ${isSelected ? "task-card--selected" : ""}" data-task-id="${escapeAttribute(task.id)}" draggable="${isActiveRuntimeStatus(task.status) ? "false" : "true"}">
      <div class="task-card__head">
        <button class="task-card__open task-card__open--title" type="button" data-task-open="${escapeAttribute(task.id)}">
          <div class="task-card__title-wrap">
            <h4 class="task-card__title">
              <span>${escapeHtml(task.title)}</span>
              ${activeSession ? '<span class="task-session-indicator task-session-indicator--card" aria-hidden="true"></span>' : ""}
            </h4>
            <p class="surface-page__eyebrow task-card__eyebrow">${escapeHtml(previewLabel)}</p>
          </div>
        </button>
        <label class="checkbox checkbox--inline task-card__check">
          <input type="checkbox" data-task-checkbox="${escapeAttribute(task.id)}" ${selectedTaskIds.has(task.id) ? "checked" : ""} aria-label="Select ${escapeAttribute(task.title)}" ${isActiveRuntimeStatus(task.status) ? "disabled" : ""} />
        </label>
      </div>
      <button class="task-card__open task-card__open--body" type="button" data-task-open="${escapeAttribute(task.id)}">
        <p class="task-card__copy">${escapeHtml(truncate(previewCopy, 140))}</p>
        <div class="task-card__badges">
          <span class="badge badge--violet">${escapeHtml(task.id)}</span>
          <span class="badge badge--accent">p${escapeHtml(String(task.priority ?? 50))}</span>
          ${activeSession ? `<span class="badge badge--live" title="${escapeAttribute(formatTaskSessionTooltip(activeSession))}">${escapeHtml(formatTaskSessionBadge(activeSession))}</span>` : ""}
          ${task.flow_id ? `<span class="badge">${escapeHtml(task.flow_id)}</span>` : ""}
          ${task.requires_review ? '<span class="badge badge--warning">review</span>' : ""}
          ${task.last_comment_created_at ? `<span class="badge badge--muted">${escapeHtml(formatDateTime(task.last_comment_created_at))}</span>` : ""}
          ${task.due_at ? `<span class="badge ${isOverdue(task) ? "badge--danger" : ""}">${escapeHtml(formatDateTime(task.due_at))}</span>` : ""}
        </div>
      </button>
    </article>
  `;
}

function renderTaskPanel(data, profiles, config) {
  if (!data?.task) {
    return "";
  }
  const task = data.task;
  return `
    <aside class="task-inspector glass-panel">
      <div class="task-inspector__head">
        <div>
          <p class="panel-head__eyebrow">Inspector</p>
          <h3 class="panel-head__title">${escapeHtml(task.title)}</h3>
        </div>
        <button class="icon-button" data-taskflow-action="close-task-panel" type="button" aria-label="Close task panel">×</button>
      </div>
      <div class="task-inspector__body">
        <form class="editor-form" data-role="taskflow-task-edit">
          <label class="field">
            <span class="field__label">Title</span>
            <input name="title" value="${escapeAttribute(task.title || "")}" required />
          </label>
          <label class="field">
            <span class="field__label">Prompt</span>
            <textarea name="prompt" rows="8" required>${escapeHtml(task.prompt || "")}</textarea>
          </label>
          <div class="field-grid">
            <label class="field field--compact">
              <span class="field__label">Status</span>
              <select name="status">${STATUS_OPTIONS.map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${status}</option>`).join("")}</select>
            </label>
            <label class="field field--compact">
              <span class="field__label">Priority</span>
              <input type="number" name="priority" min="0" max="100" value="${escapeAttribute(String(task.priority ?? 50))}" />
            </label>
          </div>
          <div class="field-grid">
            <label class="field field--compact">
              <span class="field__label">Owner Type</span>
              <select name="owner_type">
                <option value="">None</option>
                <option value="ai_profile" ${task.owner_type === "ai_profile" ? "selected" : ""}>ai_profile</option>
                <option value="human" ${task.owner_type === "human" ? "selected" : ""}>human</option>
              </select>
            </label>
            ${renderProfileRefField({
              label: "Owner Ref",
              fieldName: "owner_ref",
              typeValue: task.owner_type || "",
              value: task.owner_ref || "",
              profiles,
              config,
            })}
          </div>
          <div class="field-grid">
            <label class="field field--compact">
              <span class="field__label">Reviewer Type</span>
              <select name="reviewer_type">
                <option value="">None</option>
                <option value="ai_profile" ${task.reviewer_type === "ai_profile" ? "selected" : ""}>ai_profile</option>
                <option value="human" ${task.reviewer_type === "human" ? "selected" : ""}>human</option>
              </select>
            </label>
            ${renderProfileRefField({
              label: "Reviewer Ref",
              fieldName: "reviewer_ref",
              typeValue: task.reviewer_type || "",
              value: task.reviewer_ref || "",
              profiles,
              allowBlank: true,
              config,
            })}
          </div>
          <div class="field-grid">
            <label class="field field--compact">
              <span class="field__label">Due At</span>
              <input type="datetime-local" name="due_at" value="${toDateTimeLocal(task.due_at)}" />
            </label>
            <label class="checkbox-row checkbox-row--compact">
              <input type="checkbox" name="requires_review" ${task.requires_review ? "checked" : ""} />
              <span>Require review</span>
            </label>
          </div>
          <label class="field">
            <span class="field__label">Labels</span>
            <input name="labels" value="${escapeAttribute((task.labels || []).join(", "))}" />
          </label>
          <label class="field">
            <span class="field__label">Blocked Reason</span>
            <textarea name="blocked_reason_text" rows="3">${escapeHtml(task.blocked_reason_text || "")}</textarea>
          </label>
          <div class="button-row">
            <button class="button button--primary" type="submit">Save Task</button>
            <button class="button button--danger" data-taskflow-action="open-delete-task" type="button">Delete Task</button>
          </div>
        </form>

        ${renderTaskSessionPanel(task)}

        ${task.status === "review" ? `
          <section class="detail-section">
            <div class="panel-head panel-head--compact">
              <div>
                <p class="panel-head__eyebrow">Review</p>
                <h4 class="panel-head__title">Review Actions</h4>
              </div>
            </div>
            <label class="field">
              <span class="field__label">Reason</span>
              <textarea name="review_reason_text" rows="3" placeholder="Explain what should change…"></textarea>
            </label>
            <div class="field-grid">
              <label class="field field--compact">
                <span class="field__label">Owner Type</span>
                <select name="review_owner_type">
                  <option value="">Keep current</option>
                  <option value="ai_profile">ai_profile</option>
                  <option value="human">human</option>
                </select>
              </label>
              ${renderProfileRefField({
                label: "Owner Ref",
                fieldName: "review_owner_ref",
                typeValue: "",
                value: "",
                profiles,
                allowBlank: true,
                config,
              })}
            </div>
            <div class="button-row">
              <button class="button button--primary" data-taskflow-action="approve-review" type="button">Approve</button>
              <button class="button button--ghost" data-taskflow-action="request-changes" type="button">Request Changes</button>
            </div>
          </section>
        ` : ""}

        <section class="detail-section">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-head__eyebrow">Comments</p>
              <h4 class="panel-head__title">Discussion</h4>
            </div>
          </div>
          <form class="editor-form editor-form--compact" data-role="taskflow-comment">
            <label class="field">
              <span class="field__label">Add comment</span>
              <textarea name="message" rows="3" placeholder="Add context or operator note…"></textarea>
            </label>
            <button class="button button--primary" type="submit">Send Comment</button>
          </form>
          <div class="timeline-list">
            ${(data.task_comments || []).map((item) => `<article class="timeline-item"><p>${escapeHtml(item.message || "")}</p><span>${escapeHtml(formatDateTime(item.created_at))}</span></article>`).join("") || '<p class="muted-copy">No comments yet.</p>'}
          </div>
        </section>

        <section class="detail-section">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-head__eyebrow">Runs & Events</p>
              <h4 class="panel-head__title">Recent activity</h4>
            </div>
          </div>
          <div class="timeline-list">
            ${(data.task_events || []).slice(0, 6).map((item) => `<article class="timeline-item"><p>${escapeHtml(item.event_type || item.reason || "event")}</p><span>${escapeHtml(formatDateTime(item.created_at))}</span></article>`).join("") || '<p class="muted-copy">No events yet.</p>'}
          </div>
          <div class="timeline-list">
            ${(data.task_runs || []).slice(0, 4).map((item) => `<article class="timeline-item"><p>${escapeHtml(item.status || "run")}</p><span>${escapeHtml(formatDateTime(item.created_at || item.started_at))}</span></article>`).join("") || '<p class="muted-copy">No runs yet.</p>'}
          </div>
        </section>
      </div>
    </aside>
  `;
}

function renderTaskSessionPanel(task) {
  const activeSession = getTaskActiveSession(task);
  const sessionId = activeSession?.session_id || task.last_session_id;
  if (!sessionId) {
    return "";
  }
  const sessionProfileId = activeSession?.session_profile_id || inferTaskSessionProfileId(task);
  return `
    <section class="detail-section">
      <div class="panel-head panel-head--compact">
        <div>
          <p class="panel-head__eyebrow">Session</p>
          <h4 class="panel-head__title">Task Session</h4>
        </div>
      </div>
      <article class="task-session-card ${activeSession ? "task-session-card--active" : ""}">
        <div class="task-session-card__status">
          <span class="task-session-indicator ${activeSession ? "" : "task-session-indicator--idle"}" aria-hidden="true"></span>
          <span class="badge ${activeSession ? "badge--live" : "badge--muted"}">${escapeHtml(activeSession ? "dialog active" : "last bound session")}</span>
        </div>
        <p class="task-session-card__code">${escapeHtml(sessionId)}</p>
        <div class="task-session-card__meta">
          <span>profile: ${escapeHtml(sessionProfileId)}</span>
          ${activeSession ? `<span>${escapeHtml(formatTaskSessionCounts(activeSession))}</span>` : '<span>No live dialog detected.</span>'}
          ${activeSession?.latest_activity_at ? `<span>last activity: ${escapeHtml(formatDateTime(activeSession.latest_activity_at))}</span>` : ""}
        </div>
      </article>
    </section>
  `;
}

function renderModal(state, config, profiles) {
  if (!state.activeModal) {
    return "";
  }
  let content = "";
  if (state.activeModal === "flow") {
    content = `
      <form class="modal-card" data-role="taskflow-create-flow">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Create Flow</p>
            <h3>New Task Flow</h3>
            <p class="muted">Group related work, keep the default AI owner consistent, and reuse the same workspace styling as the board.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close create flow modal">×</button>
        </div>
        <label class="field">
          <span class="field__label">Title</span>
          <input name="title" required />
        </label>
        <label class="field">
          <span class="field__label">Description</span>
          <textarea name="description" rows="4"></textarea>
        </label>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Default Owner Type</span>
            <select name="default_owner_type">
              <option value="">None</option>
              <option value="ai_profile" selected>ai_profile</option>
              <option value="human">human</option>
            </select>
          </label>
          ${renderProfileRefField({
            label: "Default Owner Ref",
            fieldName: "default_owner_ref",
            typeValue: AI_PROFILE_TYPE,
            value: getProfileIdFallback(profiles),
            profiles,
            config,
          })}
        </div>
        <label class="field">
          <span class="field__label">Labels</span>
          <input name="labels" placeholder="ops, review, sprint-1…" />
        </label>
        <div class="button-row">
          <button class="button button--primary" type="submit">Create Flow</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  if (state.activeModal === "task") {
    content = `
      <form class="modal-card modal-card--wide" data-role="taskflow-create-task">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Create Task</p>
            <h3>New Backlog Item</h3>
            <p class="muted">Define the work, assign the AI owner when needed, and keep review expectations explicit without leaving the board.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close create task modal">×</button>
        </div>
        <label class="field">
          <span class="field__label">Title</span>
          <input name="title" required />
        </label>
        <label class="field">
          <span class="field__label">Prompt</span>
          <textarea name="prompt" rows="8" required></textarea>
        </label>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Flow</span>
            <select name="flow_id">
              <option value="">No flow</option>
              ${state.flows.map((flow) => `<option value="${escapeAttribute(flow.id)}">${escapeHtml(flow.title)}</option>`).join("")}
            </select>
          </label>
          <label class="field field--compact">
            <span class="field__label">Priority</span>
            <input type="number" name="priority" min="0" max="100" value="50" />
          </label>
        </div>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Owner Type</span>
            <select name="owner_type">
              <option value="">None</option>
              <option value="ai_profile" selected>ai_profile</option>
              <option value="human">human</option>
            </select>
          </label>
          ${renderProfileRefField({
            label: "Owner Ref",
            fieldName: "owner_ref",
            typeValue: AI_PROFILE_TYPE,
            value: getProfileIdFallback(profiles),
            profiles,
            config,
          })}
        </div>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Reviewer Type</span>
            <select name="reviewer_type">
              <option value="">None</option>
              <option value="ai_profile">ai_profile</option>
              <option value="human">human</option>
            </select>
          </label>
          ${renderProfileRefField({
            label: "Reviewer Ref",
            fieldName: "reviewer_ref",
            typeValue: "",
            value: "",
            profiles,
            allowBlank: true,
            config,
          })}
        </div>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Due At</span>
            <input type="datetime-local" name="due_at" />
          </label>
          <label class="checkbox-row checkbox-row--compact">
            <input type="checkbox" name="requires_review" checked />
            <span>Require review</span>
          </label>
        </div>
        <label class="field">
          <span class="field__label">Labels</span>
          <input name="labels" />
        </label>
        <label class="field">
          <span class="field__label">Depends On</span>
          <input name="depends_on_task_ids" placeholder="task-id-1, task-id-2…" />
        </label>
        <div class="button-row">
          <button class="button button--primary" type="submit">Create Task</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  if (state.activeModal === "settings") {
    content = `
      <form class="modal-card" data-role="taskflow-settings">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Workspace Settings</p>
            <h3>Task Flow Settings</h3>
            <p class="muted">Tune background sync and board density without forcing a hard refresh of the whole page.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close settings modal">×</button>
        </div>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Poll Interval</span>
            <input type="number" name="task_flow_poll_interval_sec" min="1" max="300" value="${escapeAttribute(String(config.task_flow_poll_interval_sec || 5))}" />
          </label>
          <label class="field field--compact">
            <span class="field__label">Board Limit</span>
            <input type="number" name="task_flow_board_limit_per_column" min="1" max="200" value="${escapeAttribute(String(config.task_flow_board_limit_per_column || 20))}" />
          </label>
        </div>
        <div class="field-grid">
          <label class="field field--compact">
            <span class="field__label">Actor Type</span>
            <select name="task_flow_actor_type">
              <option value="human" ${config.task_flow_actor_type === "human" ? "selected" : ""}>human</option>
              <option value="ai_profile" ${config.task_flow_actor_type === "ai_profile" ? "selected" : ""}>ai_profile</option>
            </select>
          </label>
          <label class="field field--compact">
            <span class="field__label">Actor Ref</span>
            <input name="task_flow_actor_ref" value="${escapeAttribute(config.task_flow_actor_ref || "web-user")}" />
          </label>
        </div>
        <div class="button-row">
          <button class="button button--primary" type="submit">Save Settings</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  if (state.activeModal === "review") {
    content = `
      <div class="modal-card">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Review Queue</p>
            <h3>Tasks Waiting on Review</h3>
            <p class="muted">Jump into a task from the queue and keep the inspection flow inside the same shell.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close review queue modal">×</button>
        </div>
        <div class="review-list">
          ${state.reviewTasks.length ? state.reviewTasks.map((task) => `
            <article class="review-card" data-review-select="${escapeAttribute(task.id)}">
              <h4>${escapeHtml(task.title)}</h4>
              <p>${escapeHtml(truncate(task.last_comment_message || task.prompt || "", 120))}</p>
              <span class="badge badge--warning">${escapeHtml(task.id)}</span>
            </article>
          `).join("") : '<div class="empty-state empty-state--compact"><h3>Queue clear</h3><p>No tasks waiting for review.</p></div>'}
        </div>
      </div>
    `;
  }
  if (state.activeModal === "delete-task") {
    content = `
      <form class="modal-card" data-role="taskflow-delete-task">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Delete Task</p>
            <h3>Delete ${escapeHtml(state.selectedTaskData?.task?.title || state.selectedTaskId)}</h3>
            <p class="muted">This removes the task, its runs, comments, events, and dependency edges for the current profile.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close delete task modal">×</button>
        </div>
        ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
        <div class="button-row">
          <button class="button button--danger" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Deleting…" : "Delete Task"}</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  if (state.activeModal === "delete-flow") {
    const flow = state.flows.find((item) => item.id === state.flowFilter);
    content = `
      <form class="modal-card" data-role="taskflow-delete-flow">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Delete Flow</p>
            <h3>Delete ${escapeHtml(flow?.title || state.flowFilter)}</h3>
            <p class="muted">This removes the flow and every task currently inside it for the selected profile.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close delete flow modal">×</button>
        </div>
        ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
        <div class="button-row">
          <button class="button button--danger" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Deleting…" : "Delete Flow"}</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  if (state.activeModal === "delete-selected") {
    content = `
      <form class="modal-card" data-role="taskflow-delete-selected">
        <div class="modal-card__head">
          <div>
            <p class="surface-page__eyebrow">Delete Selected Tasks</p>
            <h3>Delete ${escapeHtml(String(state.selectedTaskIds.size))} selected tasks</h3>
            <p class="muted">This removes the selected tasks, including their runs, comments, events, and dependency edges.</p>
          </div>
          <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close delete selected modal">×</button>
        </div>
        ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
        <div class="button-row">
          <button class="button button--danger" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Deleting…" : "Delete Selected"}</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button">Cancel</button>
        </div>
      </form>
    `;
  }
  return `
    <div class="modal-root modal-root--open">
      <div class="modal-overlay" data-taskflow-action="close-modal"></div>
      ${content}
    </div>
  `;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeActorRef(type, value, config) {
  const normalizedType = String(type || "").trim();
  if (!normalizedType) {
    return null;
  }
  if (normalizedType === HUMAN_ACTOR_TYPE) {
    return String(config?.task_flow_actor_ref || config?.actor_ref || "web-user").trim() || "web-user";
  }
  return String(value || "").trim() || null;
}

function syncConditionalFields(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const profiles = Array.from(document.querySelectorAll("#workspace-profile-switch option")).map((option) => ({
    id: option.value,
    name: option.textContent || option.value,
  }));
  const scopes = container.matches("form, .task-inspector, .detail-section, .modal-card")
    ? [container]
    : [
      ...container.querySelectorAll('[data-role="taskflow-create-flow"]'),
      ...container.querySelectorAll('[data-role="taskflow-create-task"]'),
      ...container.querySelectorAll('[data-role="taskflow-bulk"]'),
      ...container.querySelectorAll('[data-role="taskflow-task-edit"]'),
      ...container.querySelectorAll(".task-inspector"),
      ...container.querySelectorAll(".detail-section"),
    ];

  [
    ["default_owner_type", "default_owner_ref", "Default Owner Ref", false],
    ["owner_type", "owner_ref", "Owner Ref", false],
    ["reviewer_type", "reviewer_ref", "Reviewer Ref", true],
    ["review_owner_type", "review_owner_ref", "Owner Ref", true],
  ].forEach(([typeName, fieldName, fallbackLabel, allowBlankFallback]) => {
    scopes.forEach((scope) => {
      const typeField = scope.querySelector(`[name="${typeName}"]`);
      const wrapper = scope.querySelector(`[data-conditional-field="${fieldName}"]`);
      if (!(typeField instanceof HTMLSelectElement) || !(wrapper instanceof HTMLElement)) {
        return;
      }
      const currentControl = wrapper.querySelector(`[name="${fieldName}"]`);
      const currentValue = currentControl instanceof HTMLInputElement || currentControl instanceof HTMLSelectElement
        ? currentControl.value
        : (wrapper.dataset.value || "");
      wrapper.dataset.value = currentValue;
      if (typeField.value !== AI_PROFILE_TYPE) {
        wrapper.hidden = true;
        wrapper.classList.add("field--hidden");
        wrapper.innerHTML = "";
        return;
      }
      const defaultValue = currentValue || (wrapper.dataset.allowBlank === "true" || allowBlankFallback ? "" : getProfileIdFallback(profiles));
      wrapper.hidden = false;
      wrapper.classList.remove("field--hidden");
      wrapper.innerHTML = `
        <span class="field__label">${escapeHtml(wrapper.dataset.label || fallbackLabel)}</span>
        ${renderProfileSelect({
          name: fieldName,
          value: defaultValue,
          profiles,
          allowBlank: wrapper.dataset.allowBlank === "true",
          blankLabel: wrapper.dataset.blankLabel || "Select profile",
        })}
      `;
    });
  });
}

function renderProfileRefField({
  label,
  fieldName,
  typeValue,
  value,
  profiles,
  allowBlank = false,
  blankLabel = "Select profile",
}) {
  const isVisible = typeValue === AI_PROFILE_TYPE;
  return `
    <label
      class="field field--compact ${isVisible ? "" : "field--hidden"}"
      data-conditional-field="${escapeAttribute(fieldName)}"
      data-label="${escapeAttribute(label)}"
      data-allow-blank="${allowBlank ? "true" : "false"}"
      data-blank-label="${escapeAttribute(blankLabel)}"
      ${isVisible ? "" : "hidden"}
    >
      ${isVisible ? `<span class="field__label">${escapeHtml(label)}</span>${renderProfileSelect({
        name: fieldName,
        value: value || (allowBlank ? "" : getProfileIdFallback(profiles)),
        profiles,
        allowBlank,
        blankLabel,
      })}` : ""}
    </label>
  `;
}

function renderProfileSelect({ name, value, profiles, allowBlank = false, blankLabel = "Select profile" }) {
  const options = profiles.map((item) => ({
    value: String(item.id || item.name || "default"),
    label: String(item.name || item.id || "default"),
  }));
  const selectedValue = String(value || "");
  if (selectedValue && !options.some((item) => item.value === selectedValue)) {
    options.push({ value: selectedValue, label: selectedValue });
  }
  return `
    <select name="${escapeAttribute(name)}" autocomplete="off">
      ${allowBlank ? `<option value="">${escapeHtml(blankLabel)}</option>` : ""}
      ${options.map((item) => `<option value="${escapeAttribute(item.value)}" ${item.value === selectedValue ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
    </select>
  `;
}

function flowSignature(flows) {
  return JSON.stringify(
    (flows || []).map((flow) => ({
      id: flow.id,
      title: flow.title,
      status: flow.status,
      updated_at: flow.updated_at,
      default_owner_type: flow.default_owner_type,
      default_owner_ref: flow.default_owner_ref,
    })),
  );
}

function boardSignature(board) {
  if (!board?.columns) {
    return "";
  }
  return JSON.stringify(
    board.columns.map((column) => ({
      id: column.id,
      count: column.count,
      tasks: (column.tasks || []).map((task) => ({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        last_comment_message: task.last_comment_message,
        last_comment_created_at: task.last_comment_created_at,
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        owner_type: task.owner_type,
        owner_ref: task.owner_ref,
        reviewer_type: task.reviewer_type,
        reviewer_ref: task.reviewer_ref,
        requires_review: Boolean(task.requires_review),
        flow_id: task.flow_id,
        active_session: task.active_session ? {
          session_id: task.active_session.session_id,
          session_profile_id: task.active_session.session_profile_id,
          queued_turn_count: task.active_session.queued_turn_count,
          running_turn_count: task.active_session.running_turn_count,
          latest_activity_at: task.active_session.latest_activity_at,
        } : null,
      })),
    })),
  );
}

function reviewSignature(tasks) {
  return JSON.stringify(
    (tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      owner_type: task.owner_type,
      owner_ref: task.owner_ref,
      reviewer_type: task.reviewer_type,
      reviewer_ref: task.reviewer_ref,
      updated_at: task.updated_at,
    })),
  );
}

function taskDataSignature(data) {
  if (!data?.task) {
    return "";
  }
  return JSON.stringify({
    task: data.task,
    task_comments: data.task_comments || [],
    task_events: data.task_events || [],
    task_runs: data.task_runs || [],
    task_dependencies: data.task_dependencies || [],
  });
}

function normalizeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unexpected error";
}

function findBoardTask(board, taskId) {
  for (const column of board?.columns || []) {
    const match = (column.tasks || []).find((task) => task.id === taskId);
    if (match) {
      return match;
    }
  }
  return null;
}

function getVisibleBoardTaskIds(container) {
  if (!(container instanceof HTMLElement)) {
    return [];
  }
  const viewport = container.querySelector(".board-viewport");
  if (!(viewport instanceof HTMLElement)) {
    return [];
  }
  const viewportRect = viewport.getBoundingClientRect();
  const visibleIds = new Set();
  for (const card of container.querySelectorAll(".task-column__body [data-task-id]")) {
    if (!(card instanceof HTMLElement)) {
      continue;
    }
    const checkbox = card.querySelector("[data-task-checkbox]");
    if (checkbox instanceof HTMLInputElement && checkbox.disabled) {
      continue;
    }
    const columnBody = card.closest(".task-column__body");
    if (!(columnBody instanceof HTMLElement)) {
      continue;
    }
    const cardRect = card.getBoundingClientRect();
    const bodyRect = columnBody.getBoundingClientRect();
    const isVisible = (
      cardRect.bottom > bodyRect.top
      && cardRect.top < bodyRect.bottom
      && cardRect.right > viewportRect.left
      && cardRect.left < viewportRect.right
    );
    if (isVisible) {
      visibleIds.add(card.dataset.taskId || "");
    }
  }
  return [...visibleIds].filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function truncate(value, maxLength) {
  const normalized = normalizeInlineText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeInlineText(value) {
  return String(value || "")
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isActiveRuntimeStatus(status) {
  return ["claimed", "running"].includes(status);
}

function isOverdue(task) {
  return Boolean(task.due_at) && new Date(task.due_at) < new Date() && !["completed", "failed", "cancelled"].includes(task.status);
}

function getProfileIdFallback(profiles) {
  return profiles.find((item) => item.is_default)?.id || profiles[0]?.id || "default";
}

function getTaskActiveSession(task) {
  const activity = task?.active_session;
  if (!activity || activity.dialog_active !== true) {
    return null;
  }
  return activity;
}

function inferTaskSessionProfileId(task) {
  const boundProfileId = String(task?.last_session_profile_id || "").trim();
  if (boundProfileId) {
    return boundProfileId;
  }
  if (String(task?.owner_type || "").trim() === AI_PROFILE_TYPE && String(task?.owner_ref || "").trim()) {
    return String(task.owner_ref).trim();
  }
  return String(task?.profile_id || "").trim() || "default";
}

function formatTaskSessionBadge(activity) {
  if (Number(activity?.running_turn_count || 0) > 0) {
    return "active";
  }
  const queuedTurns = Number(activity?.queued_turn_count || 0);
  return queuedTurns > 1 ? `queued x${queuedTurns}` : "queued";
}

function formatTaskSessionCounts(activity) {
  const runningTurns = Number(activity?.running_turn_count || 0);
  const queuedTurns = Number(activity?.queued_turn_count || 0);
  const parts = [];
  if (runningTurns > 0) {
    parts.push(`${runningTurns} running`);
  }
  if (queuedTurns > 0) {
    parts.push(`${queuedTurns} queued`);
  }
  return parts.join(", ") || "idle";
}

function formatTaskSessionTooltip(activity) {
  const sessionId = String(activity?.session_id || "").trim();
  const profileId = String(activity?.session_profile_id || "").trim();
  const counts = formatTaskSessionCounts(activity);
  return `Session ${sessionId} (${profileId}) ${counts}`;
}
