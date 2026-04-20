import { browserTimeZone, exactAndRelative, formatDateTime } from "../core/time.js";
import { captureSurfaceState, escapeAttribute, escapeHtml, restoreSurfaceState, truncateText } from "../core/dom.js";

const DEFAULT_FILTERS = {
  triggerType: "",
  status: "",
  query: "",
  includeDeleted: false,
};

const LEGACY_WEBHOOK_SECRET_STORAGE_KEY = "afkbotui.webhook-secrets.v1";

function clearLegacyWebhookSecretCache() {
  try {
    window.localStorage.removeItem(LEGACY_WEBHOOK_SECRET_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures and keep the UI functional.
  }
  try {
    window.sessionStorage.removeItem(LEGACY_WEBHOOK_SECRET_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures and keep the UI functional.
  }
}

function hasVisibleWebhookEndpoint(webhook) {
  return Boolean(webhook?.webhook_url || webhook?.webhook_path);
}

export function createAutomationsController({
  api,
  root,
  getProfileId,
  getConfig,
  notify,
}) {
  let pollTimer = null;
  let listRequestId = 0;
  let detailRequestId = 0;
  let graphRequestId = 0;

  function buildPanelState(overrides = {}) {
    return {
      open: false,
      mode: "view",
      loading: false,
      saving: false,
      rotatingToken: false,
      confirmDelete: false,
      error: "",
      automation: null,
      draft: null,
      createOpen: false,
      createSaving: false,
      createError: "",
      createDraft: null,
      graphOpen: false,
      graphLoading: false,
      graphError: "",
      graphPreview: null,
      graphPreviewVersion: null,
      ...overrides,
    };
  }

  const state = {
    ready: false,
    loading: false,
    error: "",
    summary: { total: 0, active: 0, paused: 0, deleted: 0, cron: 0, webhook: 0, attention: 0 },
    filteredCount: 0,
    items: [],
    filters: { ...DEFAULT_FILTERS },
    panel: buildPanelState(),
  };

  root.addEventListener("click", async (event) => {
    const actionNode = event.target.closest("[data-automation-action]");
    if (!actionNode) {
      const card = event.target.closest("[data-automation-id]");
      if (card && !event.target.closest("button")) {
        await openPanel(Number(card.dataset.automationId), "view");
      }
      return;
    }

    const action = actionNode.dataset.automationAction;
    if (action === "refresh") return void refresh();
    if (action === "new") {
      state.panel.createOpen = true;
      state.panel.createSaving = false;
      state.panel.createError = "";
      state.panel.createDraft = buildEmptyDraft();
      return render();
    }
    if (action === "close-panel") return closePanel();
    if (action === "close-create-modal") {
      state.panel.createOpen = false;
      state.panel.createSaving = false;
      state.panel.createError = "";
      state.panel.createDraft = null;
      return render();
    }
    if (action === "panel-edit" && state.panel.automation) {
      state.panel.mode = "edit";
      state.panel.draft = buildDraftFromItem(state.panel.automation);
      state.panel.confirmDelete = false;
      state.panel.error = "";
      return renderPanel();
    }
    if (action === "cancel-edit") {
      if (state.panel.automation) {
        state.panel.mode = "view";
        state.panel.draft = null;
        state.panel.error = "";
        return renderPanel();
      }
    }
    if (action === "delete" && state.panel.automation) {
      state.panel.error = "";
      state.panel.confirmDelete = true;
      return render();
    }
    if (action === "rotate-webhook-token" && state.panel.automation?.trigger_type === "webhook") {
      await rotateWebhookToken();
      return;
    }
    if (action === "toggle-graph" && state.panel.automation?.execution_mode === "graph") {
      const nextOpen = !state.panel.graphOpen;
      state.panel.graphOpen = nextOpen;
      if (nextOpen && !state.panel.graphPreview && !state.panel.graphLoading) {
        await loadGraphPreview(state.panel.automation.id);
        return;
      }
      renderPanel();
      return;
    }
    if (action === "refresh-graph" && state.panel.automation?.execution_mode === "graph") {
      await loadGraphPreview(state.panel.automation.id, { force: true });
      return;
    }
    if (action === "close-delete-modal") {
      state.panel.confirmDelete = false;
      state.panel.saving = false;
      state.panel.error = "";
      return render();
    }
    if (action === "copy" && actionNode.dataset.copyValue) return void copyText(actionNode.dataset.copyValue);
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    if (form.dataset.automationForm === "filters") {
      event.preventDefault();
      const formData = new FormData(form);
      state.filters = {
        query: String(formData.get("query") || "").trim(),
        triggerType: String(formData.get("trigger_type") || ""),
        status: String(formData.get("status") || ""),
        includeDeleted: formData.get("include_deleted") === "on",
      };
      await refresh();
      return;
    }
    if (form.dataset.automationForm === "editor") {
      event.preventDefault();
      await saveDraft(form);
      return;
    }
    if (form.dataset.automationForm === "delete") {
      event.preventDefault();
      await deleteAutomation();
    }
  });

  root.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const form = target.closest("form");
    if (form?.dataset.automationForm === "filters" && target.name !== "query") {
      const formData = new FormData(form);
      state.filters = {
        query: String(formData.get("query") || "").trim(),
        triggerType: String(formData.get("trigger_type") || ""),
        status: String(formData.get("status") || ""),
        includeDeleted: formData.get("include_deleted") === "on",
      };
      await refresh();
      return;
    }
    if (form?.dataset.automationForm === "editor" && target.name === "trigger_type") {
      if (state.panel.createOpen) {
        state.panel.createDraft = readDraft(form, { automationId: null });
        render();
        return;
      }
      state.panel.draft = readDraft(form);
      renderPanel();
    }
  });

  async function activate() {
    if (!state.ready) {
      clearLegacyWebhookSecretCache();
      render();
      state.ready = true;
    }
    await refresh();
  }

  async function onProfileChange() {
    state.panel = buildPanelState();
    render();
    await refresh();
  }

  function setActive(active) {
    if (!active && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (active) {
      syncPoller();
    }
  }

  function closePanel() {
    state.panel = buildPanelState({
      createOpen: state.panel.createOpen,
      createSaving: state.panel.createSaving,
      createError: state.panel.createError,
      createDraft: state.panel.createDraft,
    });
    render();
  }

  function buildEmptyDraft() {
    return {
      id: null,
      profile_id: getProfileId(),
      name: "",
      prompt: "",
      trigger_type: "cron",
      status: "active",
      cron_expr: "0 9 * * *",
      timezone_name: browserTimeZone(),
    };
  }

  function buildDraftFromItem(item) {
    return {
      id: item.id,
      profile_id: item.profile_id,
      name: item.name || "",
      prompt: item.prompt || "",
      trigger_type: item.trigger_type,
      status: item.status === "paused" ? "paused" : "active",
      cron_expr: item.cron?.cron_expr || "",
      timezone_name: item.cron?.timezone || "UTC",
    };
  }

  async function refresh(options = {}) {
    const silent = Boolean(options.silent);
    const profileId = getProfileId();
    if (!profileId) {
      state.items = [];
      state.filteredCount = 0;
      state.summary = { total: 0, active: 0, paused: 0, deleted: 0, cron: 0, webhook: 0, attention: 0 };
      return render();
    }
    const requestId = ++listRequestId;
    if (!silent) {
      state.loading = true;
      state.error = "";
      render();
    }
    try {
      const payload = await api.listAutomations({
        profile_id: profileId,
        include_deleted: state.filters.includeDeleted,
        trigger_type: state.filters.triggerType,
        status: state.filters.status,
        q: state.filters.query,
      });
      if (requestId !== listRequestId) {
        return;
      }
      state.items = payload.automations || [];
      state.summary = payload.summary || state.summary;
      state.filteredCount = payload.filtered_count || 0;
      state.loading = false;
      state.error = "";
      let graphRefreshAutomationId = null;
      if (state.panel.automation) {
        const refreshed = state.items.find((item) => item.id === state.panel.automation.id);
        if (refreshed) {
          const previousPreviewVersion = state.panel.graphPreviewVersion;
          state.panel.automation = refreshed;
          if (refreshed.execution_mode !== "graph") {
            state.panel.graphOpen = false;
            state.panel.graphLoading = false;
            state.panel.graphError = "";
            state.panel.graphPreview = null;
            state.panel.graphPreviewVersion = null;
          } else {
            const nextPreviewVersion = graphPreviewVersion(refreshed);
            if (previousPreviewVersion !== nextPreviewVersion) {
              state.panel.graphError = "";
              state.panel.graphPreview = null;
              state.panel.graphPreviewVersion = null;
              if (state.panel.graphOpen) {
                graphRefreshAutomationId = refreshed.id;
              }
            }
          }
        }
      }
      render();
      if (graphRefreshAutomationId !== null) {
        void loadGraphPreview(graphRefreshAutomationId, { force: true, silent: true });
      }
      syncPoller();
    } catch (error) {
      if (requestId !== listRequestId) {
        return;
      }
      state.loading = false;
      state.error = normalizeError(error);
      render();
    }
  }

  async function openPanel(automationId, mode) {
    const existing = state.items.find((item) => item.id === automationId) || null;
    if (mode === "edit" && existing?.status === "deleted") {
      notify("Deleted automations are view-only.", "info");
      return;
    }
    const requestId = ++detailRequestId;
    state.panel = buildPanelState({
      open: true,
      mode,
      loading: true,
      automation: existing,
      draft: mode === "edit" && existing ? buildDraftFromItem(existing) : null,
      createOpen: state.panel.createOpen,
      createSaving: state.panel.createSaving,
      createError: state.panel.createError,
      createDraft: state.panel.createDraft,
    });
    render();
    try {
      const payload = await api.getAutomation(automationId, getProfileId());
      if (requestId !== detailRequestId) {
        return;
      }
      const automation = payload.automation;
      state.panel = buildPanelState({
        open: true,
        mode,
        automation,
        draft: mode === "edit" ? buildDraftFromItem(automation) : null,
        createOpen: state.panel.createOpen,
        createSaving: state.panel.createSaving,
        createError: state.panel.createError,
        createDraft: state.panel.createDraft,
      });
      renderPanel();
    } catch (error) {
      if (requestId !== detailRequestId) {
        return;
      }
      state.panel.loading = false;
      state.panel.error = normalizeError(error);
      renderPanel();
    }
  }

  async function loadGraphPreview(automationId, options = {}) {
    if (!state.panel.automation || state.panel.automation.id !== automationId) {
      return;
    }
    const force = Boolean(options.force);
    const silent = Boolean(options.silent);
    const previewVersion = graphPreviewVersion(state.panel.automation);
    if (state.panel.graphLoading && !force) {
      return;
    }
    if (!force && state.panel.graphPreview?.automation_id === automationId && state.panel.graphPreviewVersion === previewVersion) {
      return;
    }
    const requestId = ++graphRequestId;
    state.panel.graphLoading = true;
    state.panel.graphError = "";
    if (!silent || !state.panel.graphPreview) {
      renderPanel();
    }
    try {
      const payload = await api.getAutomationGraphPreview(automationId, getProfileId(), 6);
      if (requestId !== graphRequestId || state.panel.automation?.id !== automationId) {
        return;
      }
      state.panel.graphLoading = false;
      state.panel.graphError = "";
      state.panel.graphPreview = payload;
      state.panel.graphPreviewVersion = previewVersion;
      if (force) {
        state.panel.graphOpen = true;
      }
      renderPanel();
    } catch (error) {
      if (requestId !== graphRequestId || state.panel.automation?.id !== automationId) {
        return;
      }
      state.panel.graphLoading = false;
      state.panel.graphError = normalizeError(error);
      renderPanel();
    }
  }

  function readDraft(form, options = {}) {
    const automationId = options.automationId ?? state.panel.automation?.id ?? null;
    const formData = new FormData(form);
    const fallbackTriggerType = options.triggerType
      ?? state.panel.automation?.trigger_type
      ?? state.panel.draft?.trigger_type
      ?? state.panel.createDraft?.trigger_type
      ?? "cron";
    const triggerType = String(formData.get("trigger_type") || fallbackTriggerType);
    return {
      id: automationId,
      profile_id: getProfileId(),
      name: String(formData.get("name") || "").trim(),
      prompt: String(formData.get("prompt") || "").trim(),
      trigger_type: triggerType === "webhook" ? "webhook" : "cron",
      status: String(formData.get("status") || "active") === "paused" ? "paused" : "active",
      cron_expr: triggerType === "cron" ? String(formData.get("cron_expr") || "").trim() : "",
      timezone_name: triggerType === "cron" ? String(formData.get("timezone_name") || "").trim() : "",
    };
  }

  function validateDraft(draft) {
    if (!draft.name) return "Automation name is required.";
    if (!draft.prompt) return "Automation prompt is required.";
    if (draft.trigger_type === "cron" && !draft.cron_expr) return "Cron expression is required.";
    if (draft.trigger_type === "cron" && !draft.timezone_name) return "Timezone is required.";
    return "";
  }

  async function saveDraft(form) {
    const isCreate = state.panel.createOpen;
    const draft = readDraft(form, { automationId: isCreate ? null : state.panel.automation?.id ?? null });
    const validationError = validateDraft(draft);
    if (validationError) {
      if (isCreate) {
        state.panel.createDraft = draft;
        state.panel.createError = validationError;
        return render();
      }
      state.panel.draft = draft;
      state.panel.error = validationError;
      return renderPanel();
    }
    if (isCreate) {
      state.panel.createDraft = draft;
      state.panel.createSaving = true;
      state.panel.createError = "";
      render();
    } else {
      state.panel.draft = draft;
      state.panel.saving = true;
      state.panel.error = "";
      renderPanel();
    }
    try {
      let automation = null;
      if (isCreate) {
        const created = await api.createAutomation(getProfileId(), {
          name: draft.name,
          prompt: draft.prompt,
          trigger_type: draft.trigger_type,
          ...(draft.trigger_type === "cron" ? {
            cron_expr: draft.cron_expr,
            timezone_name: draft.timezone_name,
          } : {}),
        });
        automation = created.automation;
        if (draft.status === "paused") {
          const paused = await api.updateAutomation(getProfileId(), automation.id, { status: "paused" });
          automation = paused.automation;
        }
        notify("Automation created.", "success");
      } else {
        const updated = await api.updateAutomation(getProfileId(), state.panel.automation.id, {
          name: draft.name,
          prompt: draft.prompt,
          status: draft.status,
          ...(draft.trigger_type === "cron" ? {
            cron_expr: draft.cron_expr,
            timezone_name: draft.timezone_name,
          } : {}),
        });
        automation = updated.automation;
        notify("Automation updated.", "success");
      }
      await refresh({ silent: true });
      state.panel = buildPanelState({
        open: true,
        mode: "view",
        automation,
      });
      render();
    } catch (error) {
      if (isCreate) {
        state.panel.createSaving = false;
        state.panel.createError = normalizeError(error);
        render();
      } else {
        state.panel.saving = false;
        state.panel.error = normalizeError(error);
        renderPanel();
      }
    }
  }

  async function deleteAutomation() {
    if (!state.panel.automation) {
      return;
    }
    const { id } = state.panel.automation;
    state.panel.saving = true;
    state.panel.error = "";
    render();
    try {
      await api.deleteAutomation(getProfileId(), id);
      notify("Automation deleted.", "success");
      closePanel();
      await refresh({ silent: true });
    } catch (error) {
      state.panel.saving = false;
      state.panel.error = normalizeError(error);
      render();
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.", "success");
    } catch (_error) {
      notify("Clipboard write failed.", "danger");
    }
  }

  async function rotateWebhookToken() {
    if (!state.panel.automation || state.panel.automation.trigger_type !== "webhook") {
      return;
    }
    state.panel.saving = true;
    state.panel.rotatingToken = true;
    state.panel.error = "";
    renderPanel();
    try {
      const updated = await api.updateAutomation(getProfileId(), state.panel.automation.id, {
        rotate_webhook_token: true,
      });
      const automation = updated.automation;
      state.panel = buildPanelState({
        open: true,
        mode: "view",
        automation,
      });
      await refresh({ silent: true });
      render();
      notify("Webhook URL rotated. Copy the refreshed endpoint now.", "success");
    } catch (error) {
      state.panel.saving = false;
      state.panel.rotatingToken = false;
      state.panel.error = normalizeError(error);
      renderPanel();
    }
  }

  function syncPoller() {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (
      !getConfig()?.poll_interval_sec
      || state.panel.saving
      || state.panel.createSaving
      || state.panel.mode === "edit"
      || state.panel.createOpen
      || state.panel.confirmDelete
    ) {
      return;
    }
    pollTimer = window.setInterval(() => {
      if (document.activeElement?.matches("input, textarea, select")) {
        return;
      }
      void refresh({ silent: true });
    }, getConfig().poll_interval_sec * 1000);
  }

  function renderPanel() {
    const panelNode = root.querySelector("[data-automation-panel]");
    if (!panelNode) {
      return render();
    }
    const snapshot = captureSurfaceState(panelNode, ".task-pane");
    panelNode.innerHTML = renderSidePanel();
    restoreSurfaceState(panelNode, snapshot);
  }

  function captureRenderState() {
    return {
      viewportTop: window.scrollY,
      viewportLeft: window.scrollX,
      board: captureSurfaceState(root, ".board-stage"),
      panel: captureSurfaceState(root, ".task-panel"),
    };
  }

  function restoreRenderState(snapshot) {
    if (!snapshot) {
      return;
    }
    restoreSurfaceState(root, snapshot.board);
    restoreSurfaceState(root, snapshot.panel);
    window.scrollTo(snapshot.viewportLeft, snapshot.viewportTop);
  }

  function render() {
    const snapshot = captureRenderState();
    root.innerHTML = `
      <section class="route-page">
        <div class="section-head">
          <div>
            <div class="task-pane__eyebrow">Workspace / Automations</div>
            <h2 class="section-title">Automations</h2>
            <p class="section-copy">Reactive control center for cron jobs, webhooks, graph pipelines, and profile-scoped automation prompts.</p>
          </div>
          <div class="section-actions">
            <button class="button button--ghost" type="button" data-automation-action="refresh">Refresh</button>
            <button class="button button--primary" type="button" data-automation-action="new">New Automation</button>
          </div>
        </div>

        <section class="summary-strip">
          ${renderMetric("Total", state.summary.total, "All automations")}
          ${renderMetric("Active", state.summary.active, "Ready to execute")}
          ${renderMetric("Paused", state.summary.paused, "Stored but idle")}
          ${renderMetric("Cron", state.summary.cron, "Scheduled jobs")}
          ${renderMetric("Webhook", state.summary.webhook, "Inbound triggers")}
        </section>

        <form class="board-toolbar board-toolbar--visible automation-filters" data-automation-form="filters">
          <div class="board-toolbar__summary">
            <span class="badge">${escapeHtml(state.filteredCount || state.items.length)} visible</span>
            <span class="board-toolbar__hint">Search by name, prompt, execution mode, cron, webhook status, or profile scope.</span>
          </div>
          <div class="board-toolbar__controls">
            <div class="board-toolbar__fields">
              <input class="input" type="search" name="query" placeholder="Search automations…" value="${escapeAttribute(state.filters.query)}" aria-label="Search automations" />
              <select class="select" name="trigger_type" aria-label="Filter trigger">${renderOptions([["", "All Triggers"], ["cron", "Cron"], ["webhook", "Webhook"]], state.filters.triggerType)}</select>
              <select class="select" name="status" aria-label="Filter status">${renderOptions([["", "All Statuses"], ["active", "Active"], ["paused", "Paused"], ["deleted", "Deleted"]], state.filters.status)}</select>
              <label class="checkbox checkbox--inline"><input type="checkbox" name="include_deleted" ${state.filters.includeDeleted ? "checked" : ""} /><span class="checkbox__copy"><span class="checkbox__title">Include deleted</span></span></label>
            </div>
            <div class="board-toolbar__actions"><button class="button button--primary" type="submit">Apply Filters</button></div>
          </div>
        </form>

        ${state.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.error)}</div>` : ""}

        <div class="workspace ${state.panel.open ? "workspace--inspecting" : ""}">
          <div class="board-stage">
            ${state.loading ? '<div class="status-line status-line--info">Refreshing workspace…</div>' : ""}
            <div class="automation-grid">${renderCards()}</div>
          </div>
          <aside class="task-panel ${state.panel.open ? "task-panel--open" : ""}" data-automation-panel>${renderSidePanel()}</aside>
        </div>
        ${renderCreateModal()}
        ${renderDeleteModal()}
      </section>
    `;
    restoreRenderState(snapshot);
  }

  function renderMetric(label, value, copy) {
    return `<article class="metric"><p class="metric__label">${escapeHtml(label)}</p><p class="metric__value">${escapeHtml(String(value))}</p><p class="metric__copy">${escapeHtml(copy)}</p></article>`;
  }

  function renderCards() {
    if (!state.items.length && !state.loading) {
      return `<div class="empty-surface"><div class="modal-card"><div class="panel-section__title">No Automations</div><p class="muted">Adjust the filters or create a new cron or webhook automation for this profile.</p></div></div>`;
    }
    return state.items.map((item) => {
      const selected = state.panel.automation?.id === item.id;
      const runtime = describeRuntime(item);
      const activity = describeActivity(item);
      const lastError = item.webhook?.last_error ? `<div class="automation-card__error">${escapeHtml(truncateText(item.webhook.last_error, 120))}</div>` : "";
      return `
        <article class="card automation-card ${selected ? "card--selected" : ""}" data-automation-id="${item.id}">
          <div class="card__topline">
            <div class="card__title">${escapeHtml(item.name)}</div>
            <div class="chip-row">
              <span class="badge ${item.trigger_type === "cron" ? "badge--ai" : ""}">${escapeHtml(item.trigger_type)}</span>
              <span class="badge ${automationStatusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
              <span class="badge ${executionModeBadgeClass(item.execution_mode)}">${escapeHtml(item.execution_mode)}</span>
            </div>
          </div>
          <div class="card__snippet">${escapeHtml(truncateText(item.prompt || "No prompt yet.", 160))}</div>
          ${lastError}
          <div class="card__footer">
            <div class="card__badges">
              <span class="badge">${escapeHtml(describeSchedule(item).primary)}</span>
              <span class="badge ${runtime.className}">${escapeHtml(runtime.label)}</span>
              ${item.webhook?.last_session_id ? `<span class="badge badge--muted">${escapeHtml(shortSessionLabel(item.webhook.last_session_id))}</span>` : ""}
              <span class="badge badge--muted">${escapeHtml(`#${item.id}`)}</span>
            </div>
            <div class="tiny">${escapeHtml(activity)}</div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSidePanel() {
    if (!state.panel.open) {
      return `<div class="inspector-empty"><div class="inspector-empty__card"><div class="panel-section__title">Automation Inspector</div><p class="muted">Select an automation to inspect details, graph runtime, webhook health, and session handoff without reloading the whole workspace.</p></div></div>`;
    }
    if (state.panel.loading) {
      return '<div class="task-pane"><div class="task-pane__shell"><div class="loading-panel"><div class="spinner"></div><p>Loading automation…</p></div></div></div>';
    }
    if (state.panel.mode === "edit") {
      return renderEditor();
    }
    return renderDetails();
  }

  function renderEditor() {
    const draft = state.panel.draft || buildDraftFromItem(state.panel.automation || buildEmptyDraft());
    const isCron = draft.trigger_type === "cron";
    return `
      <div class="task-pane"><div class="task-pane__shell">
        <div class="task-pane__header">
          <div class="task-pane__heading"><div class="task-pane__eyebrow">Edit automation</div><h2 class="task-pane__title">${escapeHtml(state.panel.automation?.name || "Automation")}</h2></div>
          <button class="icon-button" type="button" data-automation-action="close-panel" aria-label="Close automation panel">×</button>
        </div>
        ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
        <form class="panel-form" data-automation-form="editor">
          <div class="detail-grid">
            <label class="field field--full"><span class="field__label">Name</span><input class="input" name="name" type="text" maxlength="255" value="${escapeAttribute(draft.name)}" /></label>
            <label class="field field--full"><span class="field__label">Prompt</span><textarea class="textarea" name="prompt" rows="8" maxlength="12000" placeholder="Describe what this automation should do…">${escapeHtml(draft.prompt)}</textarea></label>
            <label class="field"><span class="field__label">Trigger</span><select class="select" name="trigger_type" disabled>${renderOptions([["cron", "Cron"], ["webhook", "Webhook"]], draft.trigger_type)}</select></label>
            <label class="field"><span class="field__label">Status</span><select class="select" name="status">${renderOptions([["active", "Active"], ["paused", "Paused"]], draft.status)}</select></label>
            ${isCron ? `
              <label class="field"><span class="field__label">Cron</span><input class="input" name="cron_expr" type="text" maxlength="64" value="${escapeAttribute(draft.cron_expr)}" placeholder="0 9 * * *" /></label>
              <label class="field"><span class="field__label">Timezone</span><input class="input" name="timezone_name" type="text" maxlength="64" value="${escapeAttribute(draft.timezone_name)}" placeholder="Europe/Moscow…" /></label>
            ` : '<div class="field field--full"><span class="field__label">Webhook</span><div class="support-note">Webhook trigger stays fixed. The issued URL is only shown when the backend returns a fresh endpoint for this inspector session.</div></div>'}
          </div>
          <div class="button-row">
            <button class="button button--primary" type="submit" ${state.panel.saving ? "disabled" : ""}>${state.panel.saving ? "Saving…" : "Save Changes"}</button>
            <button class="button button--ghost" type="button" data-automation-action="cancel-edit">Cancel</button>
            <button class="button button--danger" type="button" data-automation-action="delete">Delete</button>
          </div>
        </form>
      </div></div>
    `;
  }

  function renderCreateModal() {
    if (!state.panel.createOpen) {
      return "";
    }
    const draft = state.panel.createDraft || buildEmptyDraft();
    const isCron = draft.trigger_type === "cron";
    return `
      <div class="modal-root modal-root--open">
        <div class="modal-overlay" data-automation-action="close-create-modal"></div>
        <form class="modal-card modal-card--wide" data-automation-form="editor">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">Create Automation</p>
              <h3>New Automation</h3>
              <p class="muted">Keep automation setup in the same workspace shell, with the same fields, radii, and spacing used across Task Flow.</p>
            </div>
            <button class="icon-button" type="button" data-automation-action="close-create-modal" aria-label="Close automation modal">×</button>
          </div>
          ${state.panel.createError ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.createError)}</div>` : ""}
          <div class="detail-grid">
            <label class="field field--full"><span class="field__label">Name</span><input class="input" name="name" type="text" maxlength="255" value="${escapeAttribute(draft.name)}" /></label>
            <label class="field field--full"><span class="field__label">Prompt</span><textarea class="textarea" name="prompt" rows="8" maxlength="12000" placeholder="Describe what this automation should do…">${escapeHtml(draft.prompt)}</textarea></label>
            <label class="field"><span class="field__label">Trigger</span><select class="select" name="trigger_type">${renderOptions([["cron", "Cron"], ["webhook", "Webhook"]], draft.trigger_type)}</select></label>
            <label class="field"><span class="field__label">Status</span><select class="select" name="status">${renderOptions([["active", "Active"], ["paused", "Paused"]], draft.status)}</select></label>
            ${isCron ? `
              <label class="field"><span class="field__label">Cron</span><input class="input" name="cron_expr" type="text" maxlength="64" value="${escapeAttribute(draft.cron_expr)}" placeholder="0 9 * * *" /></label>
              <label class="field"><span class="field__label">Timezone</span><input class="input" name="timezone_name" type="text" maxlength="64" value="${escapeAttribute(draft.timezone_name)}" placeholder="Europe/Moscow…" /></label>
            ` : '<div class="field field--full"><span class="field__label">Webhook</span><div class="support-note">After creation the inspector shows the freshly issued webhook URL for immediate copy.</div></div>'}
          </div>
          <div class="button-row">
            <button class="button button--primary" type="submit" ${state.panel.createSaving ? "disabled" : ""}>${state.panel.createSaving ? "Saving…" : "Create Automation"}</button>
            <button class="button button--ghost" type="button" data-automation-action="close-create-modal">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderDeleteModal() {
    if (!state.panel.confirmDelete || !state.panel.automation) {
      return "";
    }
    return `
      <div class="modal-root modal-root--open">
        <div class="modal-overlay" data-automation-action="close-delete-modal"></div>
        <form class="modal-card" data-automation-form="delete">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">Delete Automation</p>
              <h3>Delete ${escapeHtml(state.panel.automation.name)}</h3>
              <p class="muted">This removes the automation from active use for the current profile. The action stays inside the same workspace instead of using a browser confirm.</p>
            </div>
            <button class="icon-button" type="button" data-automation-action="close-delete-modal" aria-label="Close delete automation modal">×</button>
          </div>
          ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
          <div class="button-row">
            <button class="button button--danger" type="submit" ${state.panel.saving ? "disabled" : ""}>${state.panel.saving ? "Deleting…" : "Delete Automation"}</button>
            <button class="button button--ghost" type="button" data-automation-action="close-delete-modal">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderDetails() {
    const automation = state.panel.automation;
    if (!automation) {
      return "";
    }
    const runtime = describeRuntime(automation);
    const webhook = automation.webhook;
    const showWebhookSecretNotice = automation.trigger_type === "webhook" && !hasVisibleWebhookEndpoint(webhook);
    const webhookErrorAlert = automation.trigger_type === "webhook" && webhook?.last_error
      ? `<div class="inline-alert inline-alert--danger">${escapeHtml(webhook.last_error)}</div>`
      : "";
    return `
      <div class="task-pane"><div class="task-pane__shell">
        <div class="task-pane__header">
          <div class="task-pane__heading">
            <div class="task-pane__eyebrow">Automation details</div>
            <h2 class="task-pane__title">${escapeHtml(automation.name)}</h2>
            <div class="chip-row">
              <span class="badge ${automation.trigger_type === "cron" ? "badge--ai" : ""}">${escapeHtml(automation.trigger_type)}</span>
              <span class="badge ${automationStatusBadgeClass(automation.status)}">${escapeHtml(automation.status)}</span>
              <span class="badge ${executionModeBadgeClass(automation.execution_mode)}">${escapeHtml(automation.execution_mode)}</span>
              <span class="badge ${runtime.className}">${escapeHtml(runtime.label)}</span>
              <span class="badge badge--muted">${escapeHtml(automation.profile_id)}</span>
            </div>
          </div>
          <button class="icon-button" type="button" data-automation-action="close-panel" aria-label="Close automation panel">×</button>
        </div>
        ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
        ${renderRuntimePathSection(automation)}
        <section class="panel-section">
          <div class="panel-section__header"><div class="panel-section__title">Prompt</div></div>
          <div class="prompt-block">${escapeHtml(automation.prompt)}</div>
        </section>
        <section class="panel-section">
          <div class="panel-section__header"><div class="panel-section__title">${automation.trigger_type === "cron" ? "Schedule" : "Webhook diagnostics"}</div></div>
          ${showWebhookSecretNotice ? '<div class="support-note">Current webhook URL is hidden because the plaintext token is not stored server-side. Issue a new URL to reveal a fresh endpoint in this inspector.</div>' : ""}
          <div class="detail-grid">${automation.trigger_type === "cron" ? `
            ${renderDetail("Cron", automation.cron?.cron_expr || "Unavailable")}
            ${renderDetail("Timezone", automation.cron?.timezone || "Unavailable")}
            ${renderDetail("Next run", formatDateTime(automation.cron?.next_run_at))}
            ${renderDetail("Last run", formatDateTime(automation.cron?.last_run_at))}
          ` : `
            ${renderCopyDetail("Webhook URL", webhook?.webhook_url || "Unavailable", webhook?.webhook_url || "")}
            ${renderStatusDetail("Last status", webhook?.last_execution_status || "idle", runtimeStatusBadgeClass(webhook?.last_execution_status || "idle"))}
            ${renderDetail("Last received", formatDateTime(webhook?.last_received_at))}
            ${renderDetail("Last started", formatDateTime(webhook?.last_started_at))}
            ${renderDetail("Last succeeded", formatDateTime(webhook?.last_succeeded_at))}
            ${renderDetail("Last failed", formatDateTime(webhook?.last_failed_at))}
            ${renderDetail("Last activity", formatDateTime(automation.derived?.last_activity_at))}
            ${renderDetail("Last session", webhook?.last_session_id || "Unavailable", "mono-inline")}
            ${renderCopyDetail("Resume command", webhook?.chat_resume_command || "Unavailable", webhook?.chat_resume_command || "")}
          `}</div>
          ${webhookErrorAlert}
        </section>
        <div class="button-row">${automation.status !== "deleted" ? `${automation.trigger_type === "webhook" ? `<button class="button button--ghost" type="button" data-automation-action="rotate-webhook-token" ${state.panel.saving ? "disabled" : ""}>${state.panel.rotatingToken ? "Issuing…" : "Issue New URL"}</button>` : ""}<button class="button button--primary" type="button" data-automation-action="panel-edit">Edit</button><button class="button button--danger" type="button" data-automation-action="delete">Delete</button>` : ""}</div>
      </div></div>
    `;
  }

  function renderRuntimePathSection(automation) {
    if (automation.execution_mode !== "graph") {
      return `
        <section class="panel-section">
          <div class="panel-section__header"><div class="panel-section__title">Runtime path</div></div>
          <div class="support-note">Incoming ${escapeHtml(automation.trigger_type)} data goes straight into the automation prompt and the AI session runtime.</div>
        </section>
      `;
    }
    const preview = state.panel.graphPreview;
    const previewError = state.panel.graphError || preview?.graph_error?.reason || "";
    const aiHandoffBadge = preview?.ai_handoff_present
      ? '<span class="badge badge--success">AI handoff present</span>'
      : '<span class="badge badge--warning">Deterministic only</span>';
    return `
      <section class="panel-section">
        <div class="panel-section__header panel-section__header--stack">
          <div>
            <div class="panel-section__title">Runtime path</div>
            <p class="muted">Incoming ${escapeHtml(automation.trigger_type)} data runs through the graph first. Deterministic nodes can validate, route, and normalize payloads before an <span class="mono-inline">ai</span> or <span class="mono-inline">agent</span> node continues the automation chat.</p>
          </div>
          <div class="button-row">
            <span class="badge badge--accent">graph enabled</span>
            <span class="badge badge--muted">${escapeHtml(automation.graph_fallback_mode)}</span>
            ${aiHandoffBadge}
            <button class="button button--ghost button--compact" type="button" data-automation-action="toggle-graph">${state.panel.graphOpen ? "Hide Graph" : "View Graph"}</button>
            ${state.panel.graphOpen ? '<button class="button button--ghost button--compact" type="button" data-automation-action="refresh-graph">Refresh Graph</button>' : ""}
          </div>
        </div>
        ${state.panel.graphOpen ? renderGraphSection(preview, previewError) : ""}
      </section>
    `;
  }

  function renderGraphSection(preview, previewError) {
    if (state.panel.graphLoading && !preview) {
      return '<div class="status-line status-line--info">Loading graph snapshot…</div>';
    }
    if (previewError) {
      return `<div class="inline-alert inline-alert--danger">${escapeHtml(previewError)}</div>`;
    }
    if (!preview?.graph_available || !preview.graph) {
      return '<div class="support-note">Graph mode is enabled, but no published graph snapshot is available yet.</div>';
    }

    const graph = preview.graph;
    const validationBadge = preview.validation?.valid
      ? '<span class="badge badge--success">graph valid</span>'
      : '<span class="badge badge--failed">graph needs review</span>';
    return `
      <div class="graph-stack">
        <div class="badge-row">
          <span class="badge badge--accent">${escapeHtml(graph.name || "graph")}</span>
          <span class="badge badge--muted">v${escapeHtml(String(graph.version || 0))}</span>
          <span class="badge badge--muted">${escapeHtml(graph.status || "draft")}</span>
          <span class="badge badge--muted">${escapeHtml(String(graph.nodes?.length || 0))} nodes</span>
          <span class="badge badge--muted">${escapeHtml(String(graph.edges?.length || 0))} edges</span>
          ${validationBadge}
        </div>
        ${preview.validation?.errors?.length ? `<div class="inline-alert inline-alert--danger">${escapeHtml(preview.validation.errors.join(" • "))}</div>` : ""}
        <div class="graph-grid">
          <section class="graph-card">
            <div class="panel-section__title">Nodes</div>
            <div class="graph-node-grid">${renderGraphNodes(graph)}</div>
          </section>
          <section class="graph-card">
            <div class="panel-section__title">Edges</div>
            <div class="graph-edge-list">${renderGraphEdges(graph.edges || [])}</div>
          </section>
        </div>
        <section class="graph-card">
          <div class="panel-section__title">Recent graph runs</div>
          ${renderGraphRuns(preview.recent_runs || [])}
        </section>
        ${preview.latest_trace ? `
          <section class="graph-card">
            <div class="panel-section__title">Latest trace</div>
            ${renderGraphTrace(preview.latest_trace)}
          </section>
        ` : ""}
      </div>
    `;
  }

  function renderGraphNodes(graph) {
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const outgoing = new Map();
    edges.forEach((edge) => {
      const source = String(edge.source_key || "").trim();
      if (!source) {
        return;
      }
      const targetLabel = `${String(edge.target_key || "").trim() || "?"}${edge.source_port && edge.source_port !== "default" ? ` (${edge.source_port})` : ""}`;
      outgoing.set(source, [...(outgoing.get(source) || []), targetLabel]);
    });
    return (graph.nodes || []).map((node) => `
      <article class="graph-node-card">
        <div class="graph-node-card__head">
          <div>
            <h4 class="graph-node-card__title">${escapeHtml(node.name || node.key || "node")}</h4>
            <p class="tiny mono-inline">${escapeHtml(node.key || "")}</p>
          </div>
          <span class="badge ${node.node_kind === "ai" || node.node_kind === "agent" ? "badge--success" : "badge--muted"}">${escapeHtml(node.node_kind || "node")}</span>
        </div>
        <div class="badge-row">
          <span class="badge badge--muted">${escapeHtml(node.node_type || "unknown")}</span>
          ${node.node_version_id ? `<span class="badge badge--muted">artifact #${escapeHtml(String(node.node_version_id))}</span>` : ""}
        </div>
        <p class="graph-node-card__copy">${escapeHtml(renderNodeTargets(outgoing.get(node.key) || []))}</p>
      </article>
    `).join("");
  }

  function renderGraphEdges(edges) {
    if (!edges.length) {
      return '<p class="muted">No graph edges published.</p>';
    }
    return edges.map((edge) => `
      <div class="graph-edge">
        <span class="mono-inline">${escapeHtml(String(edge.source_key || ""))}</span>
        <span class="graph-edge__arrow">→</span>
        <span class="mono-inline">${escapeHtml(String(edge.target_key || ""))}</span>
        <span class="badge badge--muted">${escapeHtml(String(edge.source_port || "default"))} → ${escapeHtml(String(edge.target_port || "default"))}</span>
      </div>
    `).join("");
  }

  function renderGraphRuns(runs) {
    if (!runs.length) {
      return '<p class="muted">No graph runs recorded yet.</p>';
    }
    return runs.map((run) => `
      <article class="graph-run-card">
        <div class="graph-run-card__head">
          <div class="badge-row">
            <span class="badge ${graphRunStatusBadgeClass(run.status)}">${escapeHtml(run.status || "unknown")}</span>
            <span class="badge badge--muted">${escapeHtml(run.trigger_type || "trigger")}</span>
            ${run.parent_session_id ? `<span class="badge badge--muted">${escapeHtml(shortSessionLabel(run.parent_session_id))}</span>` : ""}
          </div>
          <div class="tiny">${escapeHtml(formatDateTime(run.started_at))}</div>
        </div>
        <div class="graph-run-card__meta">
          <span>completed: ${escapeHtml(formatDateTime(run.completed_at))}</span>
          ${run.reason ? `<span>${escapeHtml(truncateText(run.reason, 160))}</span>` : ""}
          ${run.error_code ? `<span class="mono-inline">${escapeHtml(run.error_code)}</span>` : ""}
        </div>
      </article>
    `).join("");
  }

  function renderGraphTrace(trace) {
    const fallback = trace.fallback
      ? `<div class="graph-trace-fallback"><span class="badge ${graphRunStatusBadgeClass(trace.fallback.status)}">${escapeHtml(trace.fallback.status)}</span><span>${escapeHtml(trace.fallback.reason || trace.fallback.error_code || "fallback")}</span></div>`
      : "";
    const nodes = Array.isArray(trace.nodes) ? trace.nodes : [];
    return `
      <div class="graph-trace-stack">
        <div class="badge-row">
          <span class="badge ${graphRunStatusBadgeClass(trace.run?.status || "running")}">${escapeHtml(trace.run?.status || "running")}</span>
          ${trace.run?.error_code ? `<span class="badge badge--failed">${escapeHtml(trace.run.error_code)}</span>` : ""}
          ${trace.run?.parent_session_id ? `<span class="badge badge--muted">${escapeHtml(shortSessionLabel(trace.run.parent_session_id))}</span>` : ""}
        </div>
        ${fallback}
        <div class="graph-trace-list">
          ${nodes.map((node) => `
            <div class="graph-trace-node">
              <div class="graph-trace-node__head">
                <span class="mono-inline">${escapeHtml(node.node_key || "")}</span>
                <span class="badge ${graphNodeStatusBadgeClass(node.status)}">${escapeHtml(node.status || "pending")}</span>
              </div>
              <div class="graph-trace-node__meta">
                ${node.execution_index !== null && node.execution_index !== undefined ? `<span>#${escapeHtml(String(node.execution_index))}</span>` : ""}
                ${node.selected_ports?.length ? `<span>ports: ${escapeHtml(node.selected_ports.join(", "))}</span>` : ""}
                ${node.child_session_id ? `<span>${escapeHtml(shortSessionLabel(node.child_session_id))}</span>` : ""}
                ${node.reason ? `<span>${escapeHtml(truncateText(node.reason, 140))}</span>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderDetail(label, value, extraClass = "") {
    return `<div class="detail-item"><p class="detail-item__label">${escapeHtml(label)}</p><p class="detail-item__value ${escapeAttribute(extraClass)}">${escapeHtml(value)}</p></div>`;
  }

  function renderStatusDetail(label, value, className) {
    return `<div class="detail-item"><p class="detail-item__label">${escapeHtml(label)}</p><div class="badge-row"><span class="badge ${escapeAttribute(className)}">${escapeHtml(value)}</span></div></div>`;
  }

  function renderCopyDetail(label, displayValue, rawValue) {
    const normalizedValue = String(rawValue || "").trim();
    return `<div class="detail-item"><p class="detail-item__label">${escapeHtml(label)}</p><div class="copy-row"><p class="detail-item__value">${escapeHtml(displayValue)}</p><button class="button button--ghost button--compact" type="button" data-automation-action="copy" data-copy-value="${escapeAttribute(normalizedValue)}" ${normalizedValue ? "" : "disabled"}>Copy</button></div></div>`;
  }

  return {
    activate,
    onProfileChange,
    refresh,
    setActive,
  };
}

function renderOptions(options, currentValue) {
  return options.map(([value, label]) => `<option value="${escapeAttribute(value)}" ${value === currentValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function describeSchedule(item) {
  if (item.trigger_type === "cron" && item.cron) {
    return { primary: `${item.cron.cron_expr} · ${item.cron.timezone}` };
  }
  return { primary: "Webhook endpoint" };
}

function describeRuntime(item) {
  if (item.execution_mode === "graph") {
    if (item.status === "deleted") {
      return { label: "deleted", className: "badge--failed" };
    }
    if (item.status === "paused") {
      return { label: "paused", className: "badge--review" };
    }
    return {
      label: item.webhook?.last_execution_status === "failed" ? "graph failed" : "graph ready",
      className: item.webhook?.last_execution_status === "failed" ? "badge--failed" : "badge--accent",
    };
  }
  if (item.trigger_type === "cron") {
    return { label: item.status === "paused" ? "paused" : "scheduled", className: item.status === "paused" ? "badge--review" : "badge--success" };
  }
  return {
    label: item.webhook?.last_execution_status || "idle",
    className: runtimeStatusBadgeClass(item.webhook?.last_execution_status || "idle"),
  };
}

function describeActivity(item) {
  const activityAt = item.derived?.last_activity_at || item.updated_at;
  if (!activityAt) {
    return "No activity recorded yet";
  }
  const formatted = exactAndRelative(activityAt);
  if (item.webhook?.last_session_id) {
    return `${formatted.relative} · ${shortSessionLabel(item.webhook.last_session_id)}`;
  }
  return formatted.relative;
}

function graphPreviewVersion(item) {
  if (!item || item.execution_mode !== "graph") {
    return "";
  }
  return [
    item.updated_at || "",
    item.status || "",
    item.derived?.last_activity_at || "",
    item.webhook?.last_execution_status || "",
    item.webhook?.last_received_at || "",
    item.webhook?.last_started_at || "",
    item.webhook?.last_succeeded_at || "",
    item.webhook?.last_failed_at || "",
    item.webhook?.last_session_id || "",
    item.cron?.last_run_at || "",
  ].join("|");
}

function renderNodeTargets(targets) {
  if (!targets.length) {
    return "Terminal node";
  }
  return `Routes to ${targets.join(", ")}`;
}

function shortSessionLabel(sessionId) {
  const normalized = String(sessionId || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 24) {
    return normalized;
  }
  return `${normalized.slice(0, 22)}…`;
}

function automationStatusBadgeClass(status) {
  if (status === "active") {
    return "badge--success";
  }
  if (status === "paused") {
    return "badge--review";
  }
  return "badge--failed";
}

function executionModeBadgeClass(mode) {
  return mode === "graph" ? "badge--accent" : "badge--muted";
}

function runtimeStatusBadgeClass(status) {
  if (status === "failed") {
    return "badge--failed";
  }
  if (status === "succeeded") {
    return "badge--success";
  }
  if (status === "running" || status === "received") {
    return "badge--running";
  }
  return "badge--muted";
}

function graphRunStatusBadgeClass(status) {
  if (status === "failed" || status === "fallback_failed") {
    return "badge--failed";
  }
  if (status === "succeeded" || status === "fallback_succeeded") {
    return "badge--success";
  }
  if (status === "running") {
    return "badge--running";
  }
  return "badge--muted";
}

function graphNodeStatusBadgeClass(status) {
  if (status === "failed") {
    return "badge--failed";
  }
  if (status === "succeeded") {
    return "badge--success";
  }
  if (status === "running") {
    return "badge--running";
  }
  if (status === "skipped") {
    return "badge--review";
  }
  return "badge--muted";
}

function normalizeError(error) {
  return error instanceof Error && error.message ? error.message : "Unexpected error";
}

export function createAutomationsView({ api, getProfileId, getConfig, showToast }) {
  let controller = null;

  return {
    mount(root) {
      controller = createAutomationsController({
        api,
        root,
        getProfileId,
        getConfig,
        notify: showToast,
      });
    },
    async activate() {
      controller?.setActive?.(true);
      await controller?.activate?.();
    },
    deactivate() {
      controller?.setActive?.(false);
    },
    async setProfile() {
      await controller?.onProfileChange?.();
    },
    setConfig() {},
    destroy() {
      controller?.setActive?.(false);
    },
  };
}
