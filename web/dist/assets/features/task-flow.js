import { formatDateTime } from "../core/time.js";

const STATUS_OPTIONS = ["todo", "blocked", "review", "completed", "failed", "cancelled"];
const TONE_STATUS_OPTIONS = new Set(["todo", "blocked", "running", "review", "completed", "failed", "cancelled"]);
const AI_PROFILE_TYPE = "ai_profile";
const HUMAN_ACTOR_TYPE = "human";

export function createTaskFlowView({ api, notify, commitConfig }) {
  let root = null;
  let refreshTimer = null;
  let sessionRefreshTimer = null;
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
    sessionInsights: null,
    sessionFeedOpen: false,
    selectedTaskIds: new Set(),
    loading: false,
    error: "",
    flowFilter: "",
    flowSearchQuery: "",
    dragTaskId: "",
    activeModal: "",
    modalBusy: false,
    modalError: "",
    pendingFlowDeleteId: "",
    refreshInFlight: false,
    sessionRefreshInFlight: false,
    boardPanActive: false,
    boardPanStartX: 0,
    boardPanScrollLeft: 0,
    signatures: {
      flows: "",
      board: "",
      review: "",
      selectedTask: "",
      sessionInsights: "",
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

  function commitSessionInsights(sessionInsights) {
    const nextSignature = sessionInsightsSignature(sessionInsights);
    const changed = state.signatures.sessionInsights !== nextSignature;
    state.sessionInsights = sessionInsights;
    state.signatures.sessionInsights = nextSignature;
    return changed;
  }

  function clearSessionInsights({ closeFeed = true } = {}) {
    const hadInsights = Boolean(state.sessionInsights) || Boolean(state.signatures.sessionInsights);
    state.sessionInsights = null;
    state.signatures.sessionInsights = "";
    if (closeFeed) {
      state.sessionFeedOpen = false;
    }
    return hadInsights;
  }

  function setModal(nextModal) {
    state.activeModal = nextModal;
    state.modalBusy = false;
    state.modalError = "";
    state.pendingFlowDeleteId = "";
    if (nextModal !== "manage-flows") {
      state.flowSearchQuery = "";
    }
  }

  function clearTaskSelection() {
    state.selectedTaskId = "";
    state.selectedTaskIds.clear();
    state.dragTaskId = "";
    commitSelectedTaskData(null);
    clearSessionInsights();
    stopSessionRefreshLoop();
  }

  async function applyFlowFilter(flowId, { closeModal = false } = {}) {
    state.flowFilter = String(flowId || "");
    clearTaskSelection();
    if (closeModal) {
      setModal("");
    } else {
      state.modalError = "";
      state.pendingFlowDeleteId = "";
    }
    await refreshAll({ force: true });
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
      if (action === "toggle-session-feed") {
        if (!state.sessionInsights?.session?.session_id) {
          return;
        }
        state.sessionFeedOpen = !state.sessionFeedOpen;
        patchSessionRegion();
        return;
      }
      if (action === "refresh-session-feed") {
        await refreshSelectedTaskSession({ forceRender: false, incremental: false });
        return;
      }
      if (action === "open-manage-flows") {
        setModal("manage-flows");
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
      if (action === "apply-flow-filter") {
        await applyFlowFilter(actionNode.dataset.flowId || "", {
          closeModal: state.activeModal === "manage-flows",
        });
        return;
      }
      if (action === "request-delete-flow") {
        const flowId = String(actionNode.dataset.flowId || "");
        if (!flowId || state.modalBusy) {
          return;
        }
        state.pendingFlowDeleteId = flowId;
        state.modalError = "";
        render();
        return;
      }
      if (action === "cancel-delete-flow") {
        state.pendingFlowDeleteId = "";
        state.modalBusy = false;
        state.modalError = "";
        render();
        return;
      }
      if (action === "confirm-delete-flow") {
        await deleteFlow(actionNode.dataset.flowId || "", { keepModalOpen: true });
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
        clearSessionInsights();
        stopSessionRefreshLoop();
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
      await applyFlowFilter(target.value);
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
      syncConditionalFields(target.closest("form, .task-inspector, .modal-card, .detail-section") || root);
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (target.name === "flow_search") {
      state.flowSearchQuery = target.value;
      state.pendingFlowDeleteId = "";
      patchManageFlowsRegion();
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    event.preventDefault();
    if (form.dataset.role === "taskflow-create-task") {
      await createTask(form);
      return;
    }
    if (form.dataset.role === "taskflow-manage-flows-create") {
      await createFlow(form, { keepModalOpen: true, selectCreatedFlow: true });
      return;
    }
    if (form.dataset.role === "taskflow-settings") {
      await saveSettings(form);
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

  function handleMouseDown(event) {
    if (!(event.target instanceof HTMLElement) || event.button !== 0 || !root) {
      return;
    }
    if (event.target.closest(".task-card, button, input, label, textarea, select, a")) {
      return;
    }
    if (!event.target.closest(".board-viewport, .task-column, .task-column__body, .task-column__head")) {
      return;
    }
    const viewport = root.querySelector(".board-viewport");
    if (!(viewport instanceof HTMLElement) || viewport.scrollWidth <= viewport.clientWidth + 8) {
      return;
    }
    state.boardPanActive = true;
    state.boardPanStartX = event.clientX;
    state.boardPanScrollLeft = viewport.scrollLeft;
    viewport.classList.add("board-viewport--panning");
    root.classList.add("taskflow-page--panning");
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (!state.boardPanActive || !root) {
      return;
    }
    const viewport = root.querySelector(".board-viewport");
    if (!(viewport instanceof HTMLElement)) {
      clearBoardPan();
      return;
    }
    const deltaX = event.clientX - state.boardPanStartX;
    viewport.scrollLeft = state.boardPanScrollLeft - deltaX;
  }

  function clearBoardPan() {
    state.boardPanActive = false;
    state.boardPanStartX = 0;
    state.boardPanScrollLeft = 0;
    if (!root) {
      return;
    }
    root.classList.remove("taskflow-page--panning");
    root.querySelector(".board-viewport")?.classList.remove("board-viewport--panning");
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

  function stopSessionRefreshLoop() {
    if (sessionRefreshTimer !== null) {
      window.clearInterval(sessionRefreshTimer);
      sessionRefreshTimer = null;
    }
  }

  function syncSessionRefreshLoop() {
    stopSessionRefreshLoop();
    if (!state.active || !state.selectedTaskData?.task) {
      return;
    }
    const sessionKey = getTaskSessionKey(state.selectedTaskData.task);
    if (!sessionKey) {
      return;
    }
    const activeSession = state.sessionInsights?.session?.dialog_active
      || Boolean(getTaskActiveSession(state.selectedTaskData.task));
    const intervalMs = activeSession ? 2000 : 4000;
    sessionRefreshTimer = window.setInterval(() => {
      if (document.hidden || state.activeModal || document.activeElement?.matches("input, textarea, select")) {
        return;
      }
      void refreshSelectedTaskSession({ incremental: true });
    }, intervalMs);
  }

  function captureRenderSnapshot() {
    if (!root) {
      return null;
    }
    const boardViewport = root.querySelector(".board-viewport");
    const inspectorBody = root.querySelector(".task-inspector__body");
    const modalCard = root.querySelector(".modal-card");
    const flowManagerList = root.querySelector("[data-flow-manager-list]");
    const workspaceShell = root.closest(".workspace-shell, .workspace-main, .app-main");
    const columnScrollTops = {};
    for (const columnBody of root.querySelectorAll(".task-column__body")) {
      if (!(columnBody instanceof HTMLElement)) {
        continue;
      }
      const columnId = columnBody.closest("[data-column-id]")?.dataset.columnId;
      if (!columnId) {
        continue;
      }
      columnScrollTops[columnId] = columnBody.scrollTop;
    }
    return {
      boardScrollLeft: boardViewport instanceof HTMLElement ? boardViewport.scrollLeft : 0,
      inspectorScrollTop: inspectorBody instanceof HTMLElement ? inspectorBody.scrollTop : 0,
      modalScrollTop: modalCard instanceof HTMLElement ? modalCard.scrollTop : 0,
      flowManagerListScrollTop: flowManagerList instanceof HTMLElement ? flowManagerList.scrollTop : 0,
      workspaceScrollTop: workspaceShell instanceof HTMLElement ? workspaceShell.scrollTop : 0,
      columnScrollTops,
    };
  }

  function restoreRenderSnapshot(snapshot) {
    if (!root || !snapshot) {
      return;
    }
    window.requestAnimationFrame(() => {
      const boardViewport = root.querySelector(".board-viewport");
      const inspectorBody = root.querySelector(".task-inspector__body");
      const modalCard = root.querySelector(".modal-card");
      const flowManagerList = root.querySelector("[data-flow-manager-list]");
      const workspaceShell = root.closest(".workspace-shell, .workspace-main, .app-main");
      if (boardViewport instanceof HTMLElement) {
        boardViewport.scrollLeft = snapshot.boardScrollLeft;
      }
      if (inspectorBody instanceof HTMLElement) {
        inspectorBody.scrollTop = snapshot.inspectorScrollTop;
      }
      if (modalCard instanceof HTMLElement) {
        modalCard.scrollTop = snapshot.modalScrollTop;
      }
      if (flowManagerList instanceof HTMLElement) {
        flowManagerList.scrollTop = snapshot.flowManagerListScrollTop;
      }
      if (workspaceShell instanceof HTMLElement) {
        workspaceShell.scrollTop = snapshot.workspaceScrollTop;
      }
      for (const columnBody of root.querySelectorAll(".task-column__body")) {
        if (!(columnBody instanceof HTMLElement)) {
          continue;
        }
        const columnId = columnBody.closest("[data-column-id]")?.dataset.columnId;
        if (!columnId) {
          continue;
        }
        columnBody.scrollTop = Number(snapshot.columnScrollTops?.[columnId] || 0);
      }
    });
  }

  function patchManageFlowsRegion() {
    if (!root || state.activeModal !== "manage-flows") {
      return;
    }
    const listRegion = root.querySelector("[data-flow-manager-list]");
    const countRegion = root.querySelector("[data-flow-manager-results-count]");
    const noteRegion = root.querySelector("[data-flow-manager-results-note]");
    if (!(listRegion instanceof HTMLElement) || !(countRegion instanceof HTMLElement) || !(noteRegion instanceof HTMLElement)) {
      return;
    }
    const visibleFlows = getVisibleFlows(state);
    countRegion.textContent = formatProjectResultsLabel(visibleFlows.length, state.flows.length);
    noteRegion.textContent = formatProjectResultsNote(state.flowFilter, state.flows, state.flowSearchQuery);
    listRegion.innerHTML = renderFlowManagerList(state, visibleFlows);
  }

  function patchSessionRegion() {
    if (!root || !state.selectedTaskData?.task) {
      return;
    }
    const region = root.querySelector("[data-task-session-region]");
    if (!(region instanceof HTMLElement)) {
      return;
    }
    const inspectorBody = root.querySelector(".task-inspector__body");
    const inspectorScrollTop = inspectorBody instanceof HTMLElement ? inspectorBody.scrollTop : 0;
    region.innerHTML = renderTaskSessionSection(
      state.selectedTaskData.task,
      state.sessionInsights,
      state.sessionFeedOpen,
    );
    if (inspectorBody instanceof HTMLElement) {
      inspectorBody.scrollTop = inspectorScrollTop;
    }
  }

  async function refreshSelectedTaskSession({ forceRender = false, incremental = false } = {}) {
    const profileId = currentProfileId();
    const task = state.selectedTaskData?.task;
    const sessionKey = getTaskSessionKey(task);
    if (!profileId || !task || state.sessionRefreshInFlight) {
      return false;
    }
    if (!sessionKey) {
      stopSessionRefreshLoop();
      const cleared = clearSessionInsights();
      if (cleared) {
        if (forceRender) {
          render();
        } else {
          patchSessionRegion();
        }
      }
      return cleared;
    }
    state.sessionRefreshInFlight = true;
    try {
      const sameSession = isSameSessionKey(state.sessionInsights, task.id, sessionKey);
      const response = await api.getTaskSessionInsights(profileId, task.id, {
        history_limit: 5,
        progress_limit: 18,
        ...(sameSession && incremental ? {
          run_id: state.sessionInsights?.progress?.cursor?.run_id || undefined,
          after_event_id: state.sessionInsights?.progress?.cursor?.last_event_id || 0,
        } : {}),
      });
      const nextInsights = buildTaskSessionInsights({
        taskId: task.id,
        task,
        payload: response,
        previous: sameSession ? state.sessionInsights : null,
        incremental,
      });
      const changed = commitSessionInsights(nextInsights);
      if (!sameSession) {
        state.sessionFeedOpen = Boolean(nextInsights?.session?.dialog_active || nextInsights?.turns?.length);
      }
      syncSessionRefreshLoop();
      if (changed && sameSession && incremental) {
        patchSessionRegion();
        return false;
      }
      if (changed && !forceRender) {
        patchSessionRegion();
      }
      if (!nextInsights?.session?.session_id) {
        stopSessionRefreshLoop();
      }
      return changed;
    } catch (error) {
      state.error = normalizeError(error);
      if (forceRender) {
        render();
      }
      return true;
    } finally {
      state.sessionRefreshInFlight = false;
    }
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
      const flowsPayload = await api.listTaskFlows(profileId);
      const nextFlows = flowsPayload.task_flows || [];
      const currentFlowFilter = String(state.flowFilter || "");
      const hasCurrentFlow = currentFlowFilter && nextFlows.some((flow) => flow.id === currentFlowFilter);
      const activeFlowFilter = hasCurrentFlow ? currentFlowFilter : "";
      const filterReset = Boolean(currentFlowFilter && !hasCurrentFlow);
      if (filterReset) {
        state.flowFilter = "";
        clearTaskSelection();
      }
      const [boardPayload, reviewPayload] = await Promise.all([
        api.getTaskBoard(profileId, {
          flow_id: activeFlowFilter || undefined,
          limit_per_column: currentConfig().task_flow_board_limit_per_column,
        }),
        api.listReviewTasks(profileId, {
          flow_id: activeFlowFilter || undefined,
          actor_type: currentConfig().task_flow_actor_type,
          actor_ref: currentConfig().task_flow_actor_ref,
        }),
      ]);
      const nextBoard = boardPayload.board || null;
      const nextReviewTasks = reviewPayload.review_tasks || [];
      const nextFlowsSignature = flowSignature(nextFlows);
      const nextBoardSignature = boardSignature(nextBoard);
      const nextReviewSignature = reviewSignature(nextReviewTasks);
      const structureChanged = (
        force
        || filterReset
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
        await loadSelectedTask({
          silent,
          forceRender: force || !silent || structureChanged,
        });
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
      const sessionChanged = await refreshSelectedTaskSession({
        forceRender: false,
        incremental: silent && !forceRender,
      });
      if (changed || sessionChanged || !silent || forceRender) {
        render();
      }
      return changed || sessionChanged;
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
    clearSessionInsights();
    render();
    await loadSelectedTask({ forceRender: true });
  }

  async function createFlow(form, { keepModalOpen = false, selectCreatedFlow = false } = {}) {
    const profileId = currentProfileId();
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!profileId) {
      return;
    }
    if (!title) {
      state.modalError = "Project title is required.";
      render();
      return;
    }
    if (title.length > 240) {
      state.modalError = "Project title must be 240 characters or less.";
      render();
      return;
    }
    if (description.length > 2000) {
      state.modalError = "Project description must be 2000 characters or less.";
      render();
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      const response = await api.createTaskFlow(profileId, {
        title,
        description: description || null,
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
      if (selectCreatedFlow && response?.task_flow?.id) {
        state.flowFilter = response.task_flow.id;
        clearTaskSelection();
      }
      state.flowSearchQuery = "";
      state.pendingFlowDeleteId = "";
      if (keepModalOpen) {
        state.modalBusy = false;
        state.modalError = "";
      } else {
        setModal("");
      }
      notify("Project created.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function createTask(form) {
    const profileId = currentProfileId();
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const prompt = String(formData.get("prompt") || "").trim();
    const dueAtValue = String(formData.get("due_at") || "").trim();
    const dueAt = dueAtValue ? new Date(dueAtValue) : null;
    const priority = normalizeNumberField(formData.get("priority"), {
      fallback: 50,
      min: 0,
      max: 100,
    });
    if (!title) {
      state.modalError = "Task title is required.";
      render();
      return;
    }
    if (!prompt) {
      state.modalError = "Task prompt is required.";
      render();
      return;
    }
    if (title.length > 240) {
      state.modalError = "Task title must be 240 characters or less.";
      render();
      return;
    }
    if (prompt.length > 12000) {
      state.modalError = "Task prompt must be 12000 characters or less.";
      render();
      return;
    }
    if (priority === null) {
      state.modalError = "Task priority must be between 0 and 100.";
      render();
      return;
    }
    if (dueAtValue && (!dueAt || Number.isNaN(dueAt.getTime()))) {
      state.modalError = "Due date must be a valid date and time.";
      render();
      return;
    }
    const payload = {
      title,
      prompt,
      created_by_type: currentConfig().task_flow_actor_type,
      created_by_ref: currentConfig().task_flow_actor_ref,
      flow_id: String(formData.get("flow_id") || "") || null,
      priority,
      due_at: dueAt ? dueAt.toISOString() : null,
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
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      const response = await api.createTask(profileId, payload);
      setModal("");
      state.selectedTaskId = response.task.id;
      notify("Task created.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function saveSettings(form) {
    const formData = new FormData(form);
    const pollInterval = normalizeNumberField(formData.get("task_flow_poll_interval_sec"), {
      fallback: 5,
      min: 1,
      max: 300,
    });
    const boardLimit = normalizeNumberField(formData.get("task_flow_board_limit_per_column"), {
      fallback: 20,
      min: 1,
      max: 200,
    });
    if (pollInterval === null) {
      state.modalError = "Poll interval must be between 1 and 300 seconds.";
      render();
      return;
    }
    if (boardLimit === null) {
      state.modalError = "Board limit must be between 1 and 200 tasks per column.";
      render();
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      state.config = await commitConfig({
        task_flow_poll_interval_sec: pollInterval,
        task_flow_board_limit_per_column: boardLimit,
        task_flow_actor_type: String(formData.get("task_flow_actor_type") || "human"),
        task_flow_actor_ref: String(formData.get("task_flow_actor_ref") || "web-user").trim() || "web-user",
      });
      setModal("");
      notify("Task Flow settings saved.", "success");
      syncRefreshLoop();
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function deleteFlow(flowId = state.flowFilter, { keepModalOpen = false } = {}) {
    const profileId = currentProfileId();
    if (!profileId || !flowId) {
      return;
    }
    state.modalBusy = true;
    state.modalError = "";
    render();
    try {
      await api.deleteTaskFlow(profileId, flowId);
      const deletedActiveFlow = state.flowFilter === flowId;
      const selectedTaskInDeletedFlow = state.selectedTaskData?.task?.flow_id === flowId;
      state.selectedTaskIds.clear();
      state.dragTaskId = "";
      state.pendingFlowDeleteId = "";
      if (deletedActiveFlow) {
        state.flowFilter = "";
      }
      if (deletedActiveFlow || selectedTaskInDeletedFlow) {
        state.selectedTaskId = "";
        commitSelectedTaskData(null);
        clearSessionInsights();
        stopSessionRefreshLoop();
      }
      if (keepModalOpen) {
        state.modalBusy = false;
        state.modalError = "";
      } else {
        setModal("");
      }
      notify("Project deleted.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      state.modalBusy = false;
      state.modalError = normalizeError(error);
      render();
    }
  }

  async function saveTask(form) {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const prompt = String(formData.get("prompt") || "").trim();
    const dueAtValue = String(formData.get("due_at") || "").trim();
    const dueAt = dueAtValue ? new Date(dueAtValue) : null;
    const priority = normalizeNumberField(formData.get("priority"), {
      fallback: 50,
      min: 0,
      max: 100,
    });
    if (!title) {
      notify("Task title is required.", "danger");
      return;
    }
    if (!prompt) {
      notify("Task prompt is required.", "danger");
      return;
    }
    if (title.length > 240) {
      notify("Task title must be 240 characters or less.", "danger");
      return;
    }
    if (prompt.length > 12000) {
      notify("Task prompt must be 12000 characters or less.", "danger");
      return;
    }
    if (priority === null) {
      notify("Task priority must be between 0 and 100.", "danger");
      return;
    }
    if (dueAtValue && (!dueAt || Number.isNaN(dueAt.getTime()))) {
      notify("Due date must be a valid date and time.", "danger");
      return;
    }
    try {
      await api.updateTask(profileId, state.selectedTaskId, {
        title,
        prompt,
        status: String(formData.get("status") || ""),
        priority,
        due_at: dueAt ? dueAt.toISOString() : null,
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
    } catch (error) {
      notify(normalizeError(error), "danger");
    }
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
      clearSessionInsights();
      stopSessionRefreshLoop();
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
        clearSessionInsights();
        stopSessionRefreshLoop();
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
    try {
      await api.addTaskComment(profileId, state.selectedTaskId, {
        actor_type: currentConfig().task_flow_actor_type,
        actor_ref: currentConfig().task_flow_actor_ref,
        message,
        comment_type: "note",
      });
      notify("Comment added.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      notify(normalizeError(error), "danger");
    }
  }

  async function approveReview() {
    const profileId = currentProfileId();
    if (!profileId || !state.selectedTaskId) {
      return;
    }
    try {
      await api.approveReviewTask(profileId, state.selectedTaskId, {
        actor_type: currentConfig().task_flow_actor_type,
        actor_ref: currentConfig().task_flow_actor_ref,
      });
      notify("Review approved.", "success");
      await refreshAll({ force: true });
    } catch (error) {
      notify(normalizeError(error), "danger");
    }
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
    try {
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
    } catch (error) {
      notify(normalizeError(error), "danger");
    }
  }

  function render() {
    if (!root) {
      return;
    }
    const snapshot = captureRenderSnapshot();
    const activeFlow = state.flows.find((flow) => flow.id === state.flowFilter) || null;
    root.innerHTML = `
      <section class="route-page route-page--taskflow taskflow-page">
        <div class="section-head">
          <div>
            <div class="task-pane__eyebrow">Workspace / Task Flow</div>
            <h2 class="section-title">Task Flow</h2>
            <p class="section-copy">Reactive kanban board for profile-scoped work, review loops, and live execution context in the same workspace shell.</p>
          </div>
          <div class="section-actions">
            <button class="button button--ghost" data-taskflow-action="refresh" type="button">Refresh</button>
            <button class="button button--ghost" data-taskflow-action="open-manage-flows" type="button">Manage Projects</button>
            <button class="button button--primary" data-taskflow-action="open-task" type="button">New Task</button>
          </div>
        </div>

        ${state.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.error)}</div>` : ""}

        <section class="board-toolbar board-toolbar--visible automation-filters taskflow-filters">
          <div class="board-toolbar__summary">
            <span class="badge">${escapeHtml(String(state.board?.total_count || 0))} tasks</span>
            <span class="badge">${escapeHtml(String(state.selectedTaskIds.size))} selected</span>
            ${activeFlow ? `<span class="badge">${escapeHtml(activeFlow.title)}</span>` : '<span class="board-toolbar__hint">All projects</span>'}
          </div>
          <div class="board-toolbar__controls">
            <div class="board-toolbar__fields board-toolbar__fields--single">
              <label class="field field--compact">
                <span class="field__label">Project</span>
                <select name="flow_filter">
                  <option value="">All Projects</option>
                  ${state.flows.map((flow) => `<option value="${escapeAttribute(flow.id)}" ${flow.id === state.flowFilter ? "selected" : ""}>${escapeHtml(flow.title)}</option>`).join("")}
                </select>
              </label>
            </div>
            <div class="board-toolbar__actions taskflow-filters__actions">
              <div class="taskflow-filters__action-group">
                <button class="button button--ghost" data-taskflow-action="open-review" type="button">Review <span class="button__count">${state.reviewTasks.length}</span></button>
                <button class="button button--ghost" data-taskflow-action="open-settings" type="button">Settings</button>
                <button class="button button--ghost" data-taskflow-action="select-visible" type="button">Visible</button>
                <button class="button button--ghost" data-taskflow-action="clear-selection" type="button">Clear</button>
              </div>
              <div class="taskflow-filters__action-group taskflow-filters__action-group--danger">
                <button class="button button--danger" data-taskflow-action="open-delete-selected" type="button" ${state.selectedTaskIds.size ? "" : "disabled"}>Delete</button>
              </div>
            </div>
          </div>
        </section>

        <div class="taskflow-layout ${state.selectedTaskData ? "taskflow-layout--open" : ""}">
          <section class="board-shell glass-panel">
            ${state.loading ? '<div class="empty-state empty-state--compact"><h3>Loading…</h3><p>Refreshing Task Flow data.</p></div>' : renderBoard(state.board, state.selectedTaskId, state.selectedTaskIds)}
          </section>
          ${renderTaskPanel(state.selectedTaskData, currentProfiles(), currentConfig(), state.sessionInsights, state.sessionFeedOpen)}
        </div>

        ${renderModal(state, currentConfig(), currentProfiles())}
      </section>
    `;
    syncConditionalFields(root);
    restoreRenderSnapshot(snapshot);
    syncSessionRefreshLoop();
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
      root.addEventListener("input", handleInput);
      root.addEventListener("submit", handleSubmit);
      root.addEventListener("mousedown", handleMouseDown);
      root.addEventListener("dragstart", handleDragStart);
      root.addEventListener("dragend", handleDragEnd);
      root.addEventListener("dragover", handleDragOver);
      root.addEventListener("drop", handleDrop);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", clearBoardPan);
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
      stopSessionRefreshLoop();
      clearBoardPan();
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
      state.flowFilter = "";
      state.flowSearchQuery = "";
      state.signatures = { flows: "", board: "", review: "", selectedTask: "", sessionInsights: "" };
      commitSelectedTaskData(null);
      clearSessionInsights();
      stopSessionRefreshLoop();
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
      stopSessionRefreshLoop();
      clearBoardPan();
      if (!mounted || !root) {
        return;
      }
      root.removeEventListener("click", handleClick);
      root.removeEventListener("change", handleChange);
      root.removeEventListener("input", handleInput);
      root.removeEventListener("submit", handleSubmit);
      root.removeEventListener("mousedown", handleMouseDown);
      root.removeEventListener("dragstart", handleDragStart);
      root.removeEventListener("dragend", handleDragEnd);
      root.removeEventListener("dragover", handleDragOver);
      root.removeEventListener("drop", handleDrop);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", clearBoardPan);
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
        <p>Create a project and add tasks. The board stays live inside the same UI instead of jumping to a separate page.</p>
      </div>
    `;
  }
  return `
    <div class="board-viewport">
      <div class="board-grid">
        ${board.columns.map((column) => `
          <section class="task-column ${statusToneClass("task-column", column.id)}" data-column-id="${escapeAttribute(column.id)}">
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
  const ownerSummary = formatTaskOwnerSummary(task);
  return `
    <article class="task-card ${statusToneClass("task-card", task.status)} ${isSelected ? "task-card--selected" : ""}" data-task-id="${escapeAttribute(task.id)}" draggable="${isActiveRuntimeStatus(task.status) ? "false" : "true"}">
      <div class="task-card__head">
        <button class="task-card__open task-card__open--title" type="button" data-task-open="${escapeAttribute(task.id)}">
          <div class="task-card__title-wrap">
            <h4 class="task-card__title">
              <span>${escapeHtml(task.title)}</span>
            </h4>
            <div class="task-card__meta-row">
              <p class="task-card__meta">${escapeHtml(ownerSummary)}</p>
              ${activeSession ? '<span class="badge badge--live">Active</span>' : ""}
            </div>
          </div>
        </button>
        <label class="checkbox checkbox--inline task-card__check">
          <input type="checkbox" data-task-checkbox="${escapeAttribute(task.id)}" ${selectedTaskIds.has(task.id) ? "checked" : ""} aria-label="Select ${escapeAttribute(task.title)}" ${isActiveRuntimeStatus(task.status) ? "disabled" : ""} />
        </label>
      </div>
      <button class="task-card__open task-card__open--body" type="button" data-task-open="${escapeAttribute(task.id)}">
        <p class="task-card__copy">${escapeHtml(truncate(previewCopy, 140))}</p>
        <div class="task-card__badges">
          <span class="badge ${taskStatusBadgeClass(task.status)}">${escapeHtml(formatStatusLabel(task.status))}</span>
          <span class="badge badge--violet">${escapeHtml(task.id)}</span>
          <span class="badge badge--accent">p${escapeHtml(String(task.priority ?? 50))}</span>
          ${task.flow_id ? `<span class="badge">${escapeHtml(task.flow_id)}</span>` : ""}
          ${task.requires_review ? '<span class="badge badge--warning">review</span>' : ""}
          ${task.last_comment_created_at ? `<span class="badge badge--muted">${escapeHtml(formatDateTime(task.last_comment_created_at))}</span>` : ""}
          ${task.due_at ? `<span class="badge ${isOverdue(task) ? "badge--danger" : ""}">${escapeHtml(formatDateTime(task.due_at))}</span>` : ""}
        </div>
      </button>
    </article>
  `;
}

function renderTaskPanel(data, profiles, config, sessionInsights, sessionFeedOpen) {
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
            <input name="title" value="${escapeAttribute(task.title || "")}" required maxlength="240" />
          </label>
          <label class="field">
            <span class="field__label">Prompt</span>
            <textarea name="prompt" rows="8" required maxlength="12000">${escapeHtml(task.prompt || "")}</textarea>
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

        <div data-task-session-region>
          ${renderTaskSessionSection(task, sessionInsights, sessionFeedOpen)}
        </div>

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

function renderTaskSessionSection(task, sessionInsights, sessionFeedOpen) {
  const session = getRenderedTaskSession(task, sessionInsights);
  const sessionId = session?.session_id || "";
  if (!sessionId) {
    return "";
  }
  const sessionProfileId = session?.session_profile_id || inferTaskSessionProfileId(task);
  const progressEvents = sessionInsights?.progress?.events || [];
  const turns = sessionInsights?.turns || [];
  return `
    <section class="detail-section task-session-section">
      <div class="panel-head panel-head--compact">
        <div>
          <p class="panel-head__eyebrow">Session</p>
          <h4 class="panel-head__title">Agent Session</h4>
        </div>
      </div>
      <article class="task-session-card ${session?.dialog_active ? "task-session-card--active" : ""}">
        <div class="task-session-card__status">
          <span class="task-session-indicator ${session?.dialog_active ? "" : "task-session-indicator--idle"}" aria-hidden="true"></span>
          <span class="badge ${session?.dialog_active ? "badge--live" : "badge--muted"}">${escapeHtml(session?.dialog_active ? "dialog active" : "last bound session")}</span>
        </div>
        <p class="task-session-card__code">${escapeHtml(sessionId)}</p>
        <div class="task-session-card__meta">
          <span>profile: ${escapeHtml(sessionProfileId)}</span>
          ${session?.dialog_active ? `<span>${escapeHtml(formatTaskSessionCounts(session))}</span>` : '<span>No live dialog detected.</span>'}
          ${session?.latest_activity_at ? `<span>last activity: ${escapeHtml(formatDateTime(session.latest_activity_at))}</span>` : ""}
        </div>
        <div class="task-session-card__actions">
          <button class="button button--ghost button--tiny" data-taskflow-action="toggle-session-feed" type="button">${sessionFeedOpen ? "Hide Session Feed" : "Open Session Feed"}</button>
          <button class="button button--ghost button--tiny" data-taskflow-action="refresh-session-feed" type="button">Refresh Feed</button>
        </div>
      </article>
      ${sessionFeedOpen ? `
        <section class="task-session-feed">
          <div class="task-session-feed__group">
            <div class="panel-head panel-head--compact">
              <div>
                <p class="panel-head__eyebrow">Live Feed</p>
                <h4 class="panel-head__title task-session-feed__title">What the agent is doing</h4>
              </div>
              <span class="badge ${session?.dialog_active ? "badge--live" : "badge--muted"}">${escapeHtml(session?.dialog_active ? "live" : "history")}</span>
            </div>
            <div class="task-session-stream">
              ${turns.length ? turns.map((turn) => renderSessionTurn(turn)).join("") : '<p class="muted-copy">No persisted chat turns yet.</p>'}
            </div>
          </div>
          <div class="task-session-feed__group">
            <div class="panel-head panel-head--compact">
              <div>
                <p class="panel-head__eyebrow">Runlog</p>
                <h4 class="panel-head__title task-session-feed__title">Live activity</h4>
              </div>
            </div>
            <div class="timeline-list timeline-list--session">
              ${progressEvents.length ? progressEvents.map((event) => renderSessionProgressEvent(event)).join("") : '<p class="muted-copy">No live activity yet.</p>'}
            </div>
          </div>
        </section>
      ` : ""}
    </section>
  `;
}

function renderModal(state, config, profiles) {
  if (!state.activeModal) {
    return "";
  }
  let content = "";
  if (state.activeModal === "manage-flows") {
    content = renderManageFlowsModal(state, config, profiles);
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
        ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
        <label class="field">
          <span class="field__label">Title</span>
          <input name="title" required maxlength="240" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field__label">Prompt</span>
          <textarea name="prompt" rows="8" required maxlength="12000"></textarea>
        </label>
        <div class="field-grid">
          <label class="field field--compact">
              <span class="field__label">Project</span>
              <select name="flow_id">
              <option value="" ${state.flowFilter ? "" : "selected"}>No project</option>
              ${state.flows.map((flow) => `<option value="${escapeAttribute(flow.id)}" ${flow.id === state.flowFilter ? "selected" : ""}>${escapeHtml(flow.title)}</option>`).join("")}
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
          <button class="button button--primary" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Creating…" : "Create Task"}</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button" ${state.modalBusy ? "disabled" : ""}>Cancel</button>
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
        ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
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
          <button class="button button--primary" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Saving…" : "Save Settings"}</button>
          <button class="button button--ghost" data-taskflow-action="close-modal" type="button" ${state.modalBusy ? "disabled" : ""}>Cancel</button>
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

function renderManageFlowsModal(state, config, profiles) {
  const activeFlow = state.flows.find((item) => item.id === state.flowFilter) || null;
  const visibleFlows = getVisibleFlows(state);
  return `
    <div class="modal-card modal-card--wide">
      <div class="modal-card__head">
        <div>
          <p class="surface-page__eyebrow">Manage Projects</p>
          <h3>Project Library</h3>
          <p class="muted">Projects are flow containers for related tasks. Search them quickly, open one on the board, and remove or add projects without leaving the workspace shell.</p>
        </div>
        <button class="icon-button" data-taskflow-action="close-modal" type="button" aria-label="Close project manager modal">×</button>
      </div>
      ${state.modalError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modalError)}</div>` : ""}
      <div class="flow-manager">
        <section class="flow-manager__section">
          <div class="flow-manager__summary">
            <div>
              <p class="surface-page__eyebrow">Existing Projects</p>
              <h4 class="flow-manager__title" data-flow-manager-results-count aria-live="polite">${escapeHtml(formatProjectResultsLabel(visibleFlows.length, state.flows.length))}</h4>
              <p class="muted" data-flow-manager-results-note aria-live="polite">${escapeHtml(formatProjectResultsNote(state.flowFilter, state.flows, state.flowSearchQuery))}</p>
            </div>
            <button
              class="button ${activeFlow ? "button--ghost" : "button--primary"} button--compact"
              data-taskflow-action="apply-flow-filter"
              data-flow-id=""
              type="button"
              ${state.modalBusy || !activeFlow ? "disabled" : ""}
            >${activeFlow ? "Show All Tasks" : "Showing All Tasks"}</button>
          </div>
          <label class="field flow-manager__search">
            <span class="field__label">Search Projects</span>
            <input
              type="search"
              name="flow_search"
              value="${escapeAttribute(state.flowSearchQuery)}"
              placeholder="Search by name, id, label, description, or owner…"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <div class="flow-manager__list" data-flow-manager-list>
            ${renderFlowManagerList(state, visibleFlows)}
          </div>
        </section>
        <form class="flow-manager__section flow-manager__section--form" data-role="taskflow-manage-flows-create">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-head__eyebrow">Add Project</p>
              <h4 class="flow-manager__title">Create a new project</h4>
            </div>
          </div>
          <label class="field">
            <span class="field__label">Title</span>
            <input name="title" required maxlength="240" autocomplete="off" />
          </label>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea name="description" rows="4" maxlength="2000" placeholder="What work belongs in this project?"></textarea>
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
            <button class="button button--primary" type="submit" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Working…" : "Add Project"}</button>
            <button class="button button--ghost" data-taskflow-action="close-modal" type="button" ${state.modalBusy ? "disabled" : ""}>Done</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderFlowManagerItem(flow, state) {
  const isActive = flow.id === state.flowFilter;
  const isDeletePending = flow.id === state.pendingFlowDeleteId;
  const description = String(flow.description || "").trim() || "No description yet.";
  const labels = Array.isArray(flow.labels) ? flow.labels : [];
  return `
    <article class="flow-manager__item ${isActive ? "flow-manager__item--active" : ""}">
      <div class="flow-manager__item-head">
        <div class="flow-manager__item-copy">
          <h4 class="flow-manager__item-title">${escapeHtml(flow.title || flow.id)}</h4>
          <p class="muted">${escapeHtml(description)}</p>
        </div>
        <div class="flow-manager__item-badges">
          <span class="badge ${isActive ? "badge--live" : "badge--muted"}">${escapeHtml(isActive ? "Current Project" : "Available")}</span>
          <span class="badge badge--violet">${escapeHtml(flow.id)}</span>
        </div>
      </div>
      <div class="flow-manager__item-meta">
        <span>${escapeHtml(formatFlowOwnerSummary(flow))}</span>
        <span>${escapeHtml(formatFlowCreatorSummary(flow))}</span>
        <span>${escapeHtml(formatFlowStatusSummary(flow))}</span>
        ${flow.updated_at ? `<span>Updated ${escapeHtml(formatDateTime(flow.updated_at))}</span>` : ""}
      </div>
      ${labels.length ? `<div class="flow-manager__item-badges">${labels.map((label) => `<span class="badge">${escapeHtml(label)}</span>`).join("")}</div>` : ""}
      <div class="flow-manager__item-actions">
        <button
          class="button ${isActive ? "button--primary" : "button--ghost"} button--tiny"
          data-taskflow-action="apply-flow-filter"
          data-flow-id="${escapeAttribute(flow.id)}"
          type="button"
          ${state.modalBusy ? "disabled" : ""}
        >${isActive ? "Filtered on Board" : "Show on Board"}</button>
        ${isDeletePending ? `
          <div class="flow-manager__danger">
            <p class="muted">Delete this project and every task inside it?</p>
            <div class="flow-manager__danger-actions">
              <button class="button button--danger button--tiny" data-taskflow-action="confirm-delete-flow" data-flow-id="${escapeAttribute(flow.id)}" type="button" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Deleting…" : "Confirm Delete"}</button>
              <button class="button button--ghost button--tiny" data-taskflow-action="cancel-delete-flow" type="button" ${state.modalBusy ? "disabled" : ""}>Cancel</button>
            </div>
          </div>
        ` : `
          <button class="button button--danger button--tiny" data-taskflow-action="request-delete-flow" data-flow-id="${escapeAttribute(flow.id)}" type="button" ${state.modalBusy ? "disabled" : ""}>Delete</button>
        `}
      </div>
    </article>
  `;
}

function renderFlowManagerList(state, visibleFlows) {
  if (!state.flows.length) {
    return `
      <div class="empty-state empty-state--compact">
        <h3>No projects yet</h3>
        <p>Create the first project from the form on the right and it will appear here immediately.</p>
      </div>
    `;
  }
  if (!visibleFlows.length) {
    return `
      <div class="empty-state empty-state--compact">
        <h3>No matching projects</h3>
        <p>Adjust the search or clear it to see every available project again.</p>
      </div>
    `;
  }
  return visibleFlows.map((flow) => renderFlowManagerItem(flow, state)).join("");
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
}

function normalizeNumberField(value, { fallback = null, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return fallback;
  }
  const nextValue = Number(normalized);
  if (!Number.isFinite(nextValue) || nextValue < min || nextValue > max) {
    return null;
  }
  return nextValue;
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
      ...container.querySelectorAll('[data-role="taskflow-manage-flows-create"]'),
      ...container.querySelectorAll('[data-role="taskflow-create-task"]'),
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
      description: flow.description,
      status: flow.status,
      updated_at: flow.updated_at,
      default_owner_type: flow.default_owner_type,
      default_owner_ref: flow.default_owner_ref,
      labels: flow.labels || [],
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
        active_session: normalizeSessionSignature(task.active_session),
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
    task: {
      ...data.task,
      active_session: normalizeSessionSignature(data.task.active_session),
    },
    task_comments: data.task_comments || [],
    task_events: data.task_events || [],
    task_runs: data.task_runs || [],
    task_dependencies: data.task_dependencies || [],
  });
}

function sessionInsightsSignature(insights) {
  if (!insights?.session?.session_id) {
    return "";
  }
  return JSON.stringify({
    task_id: insights.taskId,
    session: normalizeSessionSignature(insights.session),
    turns: (insights.turns || []).map((item) => ({
      id: item.id,
      user_message: item.user_message,
      assistant_message: item.assistant_message,
    })),
    progress: {
      cursor: insights.progress?.cursor || { run_id: null, last_event_id: 0 },
      events: (insights.progress?.events || []).map((item) => ({
        event_id: item.event_id,
        run_id: item.run_id,
        stage: item.stage,
        event_type: item.event_type,
        tool_name: item.tool_name,
        payload: item.payload || {},
      })),
    },
  });
}

function normalizeSessionSignature(session) {
  if (!session?.session_id) {
    return null;
  }
  return {
    session_id: String(session.session_id || "").trim(),
    session_profile_id: String(session.session_profile_id || "").trim(),
    dialog_active: Boolean(session.dialog_active),
  };
}

function buildFallbackSessionFromTask(task) {
  const sessionId = String(task?.last_session_id || "").trim();
  if (!sessionId) {
    return null;
  }
  return {
    session_id: sessionId,
    session_profile_id: inferTaskSessionProfileId(task),
    dialog_active: false,
    queued_turn_count: 0,
    running_turn_count: 0,
    latest_activity_at: null,
  };
}

function getTaskSessionKey(task) {
  const session = getTaskActiveSession(task) || buildFallbackSessionFromTask(task);
  if (!session?.session_id) {
    return null;
  }
  return {
    taskId: String(task?.id || "").trim(),
    sessionId: String(session.session_id || "").trim(),
    sessionProfileId: String(session.session_profile_id || "").trim() || inferTaskSessionProfileId(task),
  };
}

function isSameSessionKey(sessionInsights, taskId, sessionKey) {
  return Boolean(
    sessionInsights?.session?.session_id
    && sessionInsights.taskId === taskId
    && String(sessionInsights.session.session_id || "").trim() === sessionKey.sessionId
    && String(sessionInsights.session.session_profile_id || "").trim() === sessionKey.sessionProfileId
  );
}

function getRenderedTaskSession(task, sessionInsights) {
  const sessionKey = getTaskSessionKey(task);
  if (
    sessionKey
    && isSameSessionKey(sessionInsights, sessionKey.taskId, sessionKey)
    && sessionInsights?.session?.session_id
  ) {
    return sessionInsights.session;
  }
  return getTaskActiveSession(task) || buildFallbackSessionFromTask(task);
}

function buildTaskSessionInsights({ taskId, task, payload, previous, incremental }) {
  const session = payload?.session || getTaskActiveSession(task) || buildFallbackSessionFromTask(task);
  const turns = (payload?.turns || []).map((item) => ({
    id: Number(item?.id || 0),
    user_message: String(item?.user_message || ""),
    assistant_message: String(item?.assistant_message || ""),
  }));
  const nextEvents = incremental && previous
    ? mergeSessionProgressEvents(previous.progress?.events || [], payload?.progress?.events || [])
    : (payload?.progress?.events || []).map((item) => ({ ...item }));
  return {
    taskId,
    session,
    turns,
    progress: {
      cursor: payload?.progress?.cursor || previous?.progress?.cursor || { run_id: null, last_event_id: 0 },
      events: nextEvents.slice(-18),
    },
  };
}

function mergeSessionProgressEvents(existingEvents, incomingEvents) {
  const merged = [];
  const seen = new Set();
  for (const item of [...existingEvents, ...incomingEvents]) {
    const eventId = Number(item?.event_id || 0);
    const key = eventId > 0 ? `event:${eventId}` : `${item?.run_id || "run"}:${item?.event_type || "event"}:${JSON.stringify(item?.payload || {})}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ ...item });
  }
  return merged;
}

function renderSessionTurn(turn) {
  const userMessage = String(turn?.user_message || "").trim();
  const assistantMessage = String(turn?.assistant_message || "").trim();
  return `
    <article class="session-turn">
      ${userMessage ? `
        <div class="session-bubble session-bubble--user">
          <span class="session-bubble__label">Prompt</span>
          <p>${escapeHtml(userMessage)}</p>
        </div>
      ` : ""}
      ${assistantMessage ? `
        <div class="session-bubble session-bubble--assistant">
          <span class="session-bubble__label">Assistant</span>
          <p>${escapeHtml(assistantMessage)}</p>
        </div>
      ` : ""}
    </article>
  `;
}

function renderSessionProgressEvent(event) {
  const stage = String(event?.stage || "").trim();
  const timestamp = event?.payload?.created_at || event?.created_at || null;
  return `
    <article class="timeline-item timeline-item--session">
      <div class="timeline-item__head">
        <p>${escapeHtml(formatSessionEventTitle(event))}</p>
        ${stage ? `<span class="badge badge--muted">${escapeHtml(formatStatusLabel(stage))}</span>` : ""}
      </div>
      <p class="timeline-item__copy">${escapeHtml(formatSessionEventCopy(event))}</p>
      <span>${escapeHtml(timestamp ? formatDateTime(timestamp) : `run ${event?.run_id || "?"} • ${event?.event_type || "event"}`)}</span>
    </article>
  `;
}

function formatSessionEventTitle(event) {
  const eventType = String(event?.event_type || "").trim();
  if (eventType === "tool.call") {
    return event?.tool_name ? `Calling ${event.tool_name}` : "Calling tool";
  }
  if (eventType === "tool.progress") {
    return event?.tool_name ? `${event.tool_name} in progress` : "Tool in progress";
  }
  if (eventType === "tool.result") {
    return event?.tool_name ? `${event.tool_name} returned` : "Tool returned";
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

function formatSessionEventCopy(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
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
  if (event?.tool_name) {
    return `tool: ${event.tool_name}`;
  }
  return "Waiting for the next visible session event.";
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

function formatTaskOwnerSummary(task) {
  const ownerType = String(task?.owner_type || "").trim();
  const ownerRef = String(task?.owner_ref || "").trim();
  if (ownerType === AI_PROFILE_TYPE) {
    return ownerRef ? `Owner: AI ${ownerRef}` : "Owner: AI";
  }
  if (ownerType === HUMAN_ACTOR_TYPE) {
    return ownerRef ? `Owner: ${ownerRef}` : "Owner: Human";
  }
  return "Owner: Unassigned";
}

function formatFlowOwnerSummary(flow) {
  const ownerType = String(flow?.default_owner_type || "").trim();
  const ownerRef = String(flow?.default_owner_ref || "").trim();
  if (ownerType === AI_PROFILE_TYPE) {
    return ownerRef ? `Default owner: AI ${ownerRef}` : "Default owner: AI";
  }
  if (ownerType === HUMAN_ACTOR_TYPE) {
    return ownerRef ? `Default owner: ${ownerRef}` : "Default owner: Human";
  }
  return "Default owner: Manual assignment";
}

function formatFlowCreatorSummary(flow) {
  const creatorType = String(flow?.created_by_type || "").trim();
  const creatorRef = String(flow?.created_by_ref || "").trim();
  if (creatorType === AI_PROFILE_TYPE) {
    return creatorRef ? `Created by: AI ${creatorRef}` : "Created by: AI";
  }
  if (creatorType === HUMAN_ACTOR_TYPE) {
    return creatorRef ? `Created by: ${creatorRef}` : "Created by: Human";
  }
  return creatorRef ? `Created by: ${creatorRef}` : "Created by: Unknown";
}

function formatFlowStatusSummary(flow) {
  const status = String(flow?.status || "").trim();
  if (!status) {
    return "Status: Active";
  }
  return `Status: ${capitalizeWord(status)}`;
}

function getVisibleFlows(state) {
  const normalizedQuery = normalizeInlineText(state.flowSearchQuery || "").toLowerCase();
  const items = normalizedQuery
    ? state.flows.filter((flow) => buildFlowSearchText(flow).includes(normalizedQuery))
    : [...state.flows];
  return items.sort((left, right) => compareFlowProjects(left, right, state.flowFilter, normalizedQuery));
}

function buildFlowSearchText(flow) {
  return [
    flow?.title,
    flow?.id,
    flow?.description,
    flow?.status,
    ...(Array.isArray(flow?.labels) ? flow.labels : []),
    formatFlowOwnerSummary(flow),
    formatFlowCreatorSummary(flow),
  ]
    .map((value) => normalizeInlineText(value || "").toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function compareFlowProjects(left, right, activeFlowId, query = "") {
  if (query) {
    const leftScore = scoreFlowSearchMatch(left, query);
    const rightScore = scoreFlowSearchMatch(right, query);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
  }
  const leftActive = left?.id === activeFlowId ? 1 : 0;
  const rightActive = right?.id === activeFlowId ? 1 : 0;
  if (leftActive !== rightActive) {
    return rightActive - leftActive;
  }
  const leftUpdated = Date.parse(left?.updated_at || "") || 0;
  const rightUpdated = Date.parse(right?.updated_at || "") || 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }
  return String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""));
}

function scoreFlowSearchMatch(flow, query) {
  if (!query) {
    return 0;
  }
  const title = normalizeInlineText(flow?.title || "").toLowerCase();
  const id = normalizeInlineText(flow?.id || "").toLowerCase();
  const description = normalizeInlineText(flow?.description || "").toLowerCase();
  const status = normalizeInlineText(flow?.status || "").toLowerCase();
  const labels = Array.isArray(flow?.labels)
    ? flow.labels.map((label) => normalizeInlineText(label || "").toLowerCase())
    : [];
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

function formatProjectResultsLabel(visibleCount, totalCount) {
  if (!totalCount) {
    return "0 projects available";
  }
  if (visibleCount === totalCount) {
    return `${totalCount} project${totalCount === 1 ? "" : "s"} available`;
  }
  return `${visibleCount} of ${totalCount} projects`;
}

function formatProjectResultsNote(activeFlowId, flows, query) {
  const activeFlow = (flows || []).find((item) => item.id === activeFlowId) || null;
  const projectCopy = activeFlow
    ? `Board filtered by ${activeFlow.title}.`
    : "The board currently shows tasks from every project.";
  const normalizedQuery = normalizeInlineText(query || "");
  return normalizedQuery
    ? `${projectCopy} Search: ${normalizedQuery}.`
    : projectCopy;
}

function capitalizeWord(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusToneClass(prefix, status) {
  const normalized = String(status || "").trim();
  return TONE_STATUS_OPTIONS.has(normalized) ? `${prefix}--${normalized}` : "";
}

function taskStatusBadgeClass(status) {
  const normalized = String(status || "").trim();
  if (normalized === "running") {
    return "badge--running";
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

function formatStatusLabel(status) {
  const normalized = String(status || "").trim();
  if (!normalized) {
    return "Unknown";
  }
  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
