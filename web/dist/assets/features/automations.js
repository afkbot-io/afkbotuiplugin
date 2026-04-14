import { browserTimeZone, exactAndRelative, formatDateTime } from "../core/time.js";
import { captureSurfaceState, escapeAttribute, escapeHtml, restoreSurfaceState, truncateText } from "../core/dom.js";

const DEFAULT_FILTERS = {
  triggerType: "",
  status: "",
  query: "",
  includeDeleted: false,
};

const WEBHOOK_SECRET_STORAGE_KEY = "afkbotui.webhook-secrets.v1";
const WEBHOOK_SECRET_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;

function getWebhookSecretStorage() {
  try {
    return window.localStorage;
  } catch (_error) {
    return window.sessionStorage;
  }
}

function isFreshWebhookSecret(entry) {
  const savedAt = Date.parse(entry?.saved_at || "");
  if (Number.isNaN(savedAt)) {
    return true;
  }
  return Date.now() - savedAt <= WEBHOOK_SECRET_RETENTION_MS;
}

function readWebhookSecretStore() {
  try {
    const storage = getWebhookSecretStorage();
    const raw = storage.getItem(WEBHOOK_SECRET_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const filtered = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isFreshWebhookSecret(value))
    );
    if (Object.keys(filtered).length !== Object.keys(parsed).length) {
      storage.setItem(WEBHOOK_SECRET_STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch (_error) {
    return {};
  }
}

function writeWebhookSecretStore(store) {
  try {
    getWebhookSecretStorage().setItem(WEBHOOK_SECRET_STORAGE_KEY, JSON.stringify(store));
  } catch (_error) {
    // Ignore storage failures and keep the UI functional.
  }
}

function webhookSecretKey(profileId, automationId) {
  return `${String(profileId || "").trim()}:${String(automationId || "").trim()}`;
}

function rememberWebhookSecret(automation) {
  if (
    !automation
    || automation.trigger_type !== "webhook"
    || !automation.profile_id
    || !automation.id
    || !automation.webhook?.webhook_token
  ) {
    return automation;
  }
  const store = readWebhookSecretStore();
  store[webhookSecretKey(automation.profile_id, automation.id)] = {
    webhook_token: automation.webhook.webhook_token,
    webhook_path: automation.webhook.webhook_path || "",
    webhook_url: automation.webhook.webhook_url || "",
    webhook_token_masked: automation.webhook.webhook_token_masked || "",
    saved_at: new Date().toISOString(),
  };
  writeWebhookSecretStore(store);
  return automation;
}

function forgetWebhookSecret(profileId, automationId) {
  if (!profileId || !automationId) {
    return;
  }
  const key = webhookSecretKey(profileId, automationId);
  const store = readWebhookSecretStore();
  if (!(key in store)) {
    return;
  }
  delete store[key];
  writeWebhookSecretStore(store);
}

function mergeWebhookSecret(automation) {
  if (!automation || automation.trigger_type !== "webhook" || !automation.webhook) {
    return automation;
  }
  const store = readWebhookSecretStore();
  const cached = store[webhookSecretKey(automation.profile_id, automation.id)];
  if (!cached?.webhook_token) {
    return automation;
  }
  return {
    ...automation,
    webhook: {
      ...automation.webhook,
      webhook_token: automation.webhook.webhook_token || cached.webhook_token,
      webhook_path: automation.webhook.webhook_path || cached.webhook_path || null,
      webhook_url: automation.webhook.webhook_url || cached.webhook_url || null,
      webhook_token_masked: automation.webhook.webhook_token_masked || cached.webhook_token_masked || "",
    },
  };
}

function hasVisibleWebhookSecret(webhook) {
  return Boolean(webhook?.webhook_token || webhook?.webhook_path || webhook?.webhook_url);
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
      state.items = (payload.automations || []).map(mergeWebhookSecret);
      state.summary = payload.summary || state.summary;
      state.filteredCount = payload.filtered_count || 0;
      state.loading = false;
      state.error = "";
      if (state.panel.automation) {
        const refreshed = state.items.find((item) => item.id === state.panel.automation.id);
        if (refreshed) {
          state.panel.automation = refreshed;
        }
      }
      render();
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
      const automation = mergeWebhookSecret(payload.automation);
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
          } : {})
        });
        automation = rememberWebhookSecret(created.automation);
        if (draft.status === "paused") {
          const paused = await api.updateAutomation(getProfileId(), automation.id, { status: "paused" });
          automation = mergeWebhookSecret(paused.automation);
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
          } : {})
        });
        automation = mergeWebhookSecret(updated.automation);
        notify("Automation updated.", "success");
      }
      await refresh({ silent: true });
      state.panel = buildPanelState({
        open: true,
        mode: "view",
        automation: mergeWebhookSecret(automation),
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
    const { id, profile_id: profileId } = state.panel.automation;
    state.panel.saving = true;
    state.panel.error = "";
    render();
    try {
      await api.deleteAutomation(getProfileId(), id);
      forgetWebhookSecret(profileId, id);
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
      const automation = rememberWebhookSecret(updated.automation);
      state.panel = buildPanelState({
        open: true,
        mode: "view",
        automation: mergeWebhookSecret(automation),
      });
      await refresh({ silent: true });
      render();
      notify("Webhook token rotated. Copy the new URL and token now.", "success");
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

  function render() {
    root.innerHTML = `
      <section class="route-page">
        <div class="section-head">
          <div>
            <div class="task-pane__eyebrow">Workspace / Automations</div>
            <h2 class="section-title">Automations</h2>
            <p class="section-copy">Reactive control center for cron jobs, webhooks, and profile-scoped automation prompts.</p>
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
            <span class="board-toolbar__hint">Search by name, prompt, cron, webhook status, or profile scope.</span>
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
  }

  function renderMetric(label, value, copy) {
    return `<article class="metric"><p class="metric__label">${escapeHtml(label)}</p><p class="metric__value">${escapeHtml(String(value))}</p><p class="metric__copy">${escapeHtml(copy)}</p></article>`;
  }

  function renderCards() {
    if (!state.items.length && !state.loading) {
      return `<div class="empty-surface"><div class="modal-card"><div class="panel-section__title">No Automations</div><p class="muted">Adjust the filters or create a new cron or webhook automation for this profile.</p></div></div>`;
    }
    return state.items.map((item) => {
      const runtime = describeRuntime(item);
      const schedule = describeSchedule(item);
      const selected = state.panel.automation?.id === item.id;
      return `
        <article class="card automation-card ${selected ? "card--selected" : ""}" data-automation-id="${item.id}">
          <div class="card__topline">
            <div class="card__title">${escapeHtml(item.name)}</div>
            <div class="chip-row">
              <span class="badge ${item.trigger_type === "cron" ? "badge--ai" : ""}">${escapeHtml(item.trigger_type)}</span>
              <span class="badge ${item.status === "active" ? "badge--success" : item.status === "paused" ? "badge--review" : "badge--failed"}">${escapeHtml(item.status)}</span>
            </div>
          </div>
          <div class="card__snippet">${escapeHtml(truncateText(item.prompt || "No prompt yet.", 160))}</div>
          <div class="card__footer">
            <div class="card__badges"><span class="badge">${escapeHtml(schedule.primary)}</span><span class="badge">${escapeHtml(runtime.label)}</span><span class="badge">${escapeHtml(`#${item.id}`)}</span></div>
            <div class="tiny">${escapeHtml(exactAndRelative(item.updated_at).exact)}</div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSidePanel() {
    if (!state.panel.open) {
      return `<div class="inspector-empty"><div class="inspector-empty__card"><div class="panel-section__title">Automation Inspector</div><p class="muted">Select an automation to inspect details, adjust scheduling, and manage webhook diagnostics without reloading the whole workspace.</p></div></div>`;
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
            ` : '<div class="field field--full"><span class="field__label">Webhook</span><div class="support-note">Webhook trigger stays fixed. URL, path, and token are revealed after create or token rotation and cached in this browser for later viewing.</div></div>'}
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
            ` : '<div class="field field--full"><span class="field__label">Webhook</span><div class="support-note">After creation the UI opens the issued webhook URL, path, and token in the inspector and keeps them cached in this browser.</div></div>'}
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
    const showWebhookSecretNotice = automation.trigger_type === "webhook" && !hasVisibleWebhookSecret(webhook);
    return `
      <div class="task-pane"><div class="task-pane__shell">
        <div class="task-pane__header">
          <div class="task-pane__heading"><div class="task-pane__eyebrow">Automation details</div><h2 class="task-pane__title">${escapeHtml(automation.name)}</h2><div class="chip-row"><span class="badge">${escapeHtml(automation.trigger_type)}</span><span class="badge">${escapeHtml(automation.status)}</span><span class="badge">${escapeHtml(runtime.label)}</span><span class="badge">${escapeHtml(automation.profile_id)}</span></div></div>
          <button class="icon-button" type="button" data-automation-action="close-panel" aria-label="Close automation panel">×</button>
        </div>
        ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
        <section class="panel-section"><div class="panel-section__header"><div class="panel-section__title">Prompt</div></div><div class="task-pane__description-copy">${escapeHtml(automation.prompt)}</div></section>
        <section class="panel-section"><div class="panel-section__header"><div class="panel-section__title">${automation.trigger_type === "cron" ? "Schedule" : "Webhook diagnostics"}</div></div>${showWebhookSecretNotice ? '<div class="support-note">Current plaintext webhook token is hidden. Issue a new token to reveal a fresh URL, path, and token here.</div>' : ""}<div class="detail-grid">${automation.trigger_type === "cron" ? `
          ${renderDetail("Cron", automation.cron?.cron_expr || "Unavailable")}
          ${renderDetail("Timezone", automation.cron?.timezone || "Unavailable")}
          ${renderDetail("Next run", formatDateTime(automation.cron?.next_run_at))}
          ${renderDetail("Last run", formatDateTime(automation.cron?.last_run_at))}
        ` : `
          ${renderCopyDetail("Webhook token", webhook?.webhook_token || "Unavailable", webhook?.webhook_token || "")}
          ${renderCopyDetail("Masked token", webhook?.webhook_token_masked || "Unavailable", webhook?.webhook_token_masked || "")}
          ${renderCopyDetail("Webhook path", webhook?.webhook_path || "Unavailable", webhook?.webhook_path || "")}
          ${renderCopyDetail("Webhook URL", webhook?.webhook_url || "Unavailable", webhook?.webhook_url || "")}
          ${renderDetail("Last status", webhook?.last_execution_status || "idle")}
          ${renderDetail("Last received", formatDateTime(webhook?.last_received_at))}
          ${renderDetail("Last started", formatDateTime(webhook?.last_started_at))}
          ${renderDetail("Last succeeded", formatDateTime(webhook?.last_succeeded_at))}
          ${renderDetail("Last failed", formatDateTime(webhook?.last_failed_at))}
          ${renderDetail("Last session", webhook?.last_session_id || "Unavailable")}
          ${renderCopyDetail("Resume command", webhook?.chat_resume_command || "Unavailable", webhook?.chat_resume_command || "")}
          ${renderDetail("Last error", webhook?.last_error || "No errors")}
        `}</div></section>
        <div class="button-row">${automation.status !== "deleted" ? `${automation.trigger_type === "webhook" ? `<button class="button button--ghost" type="button" data-automation-action="rotate-webhook-token" ${state.panel.saving ? "disabled" : ""}>${state.panel.rotatingToken ? "Issuing…" : "Issue New Token"}</button>` : ""}<button class="button button--primary" type="button" data-automation-action="panel-edit">Edit</button><button class="button button--danger" type="button" data-automation-action="delete">Delete</button>` : ""}</div>
      </div></div>
    `;
  }

  function renderDetail(label, value) {
    return `<div class="detail-item"><p class="detail-item__label">${escapeHtml(label)}</p><p class="detail-item__value">${escapeHtml(value)}</p></div>`;
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
  if (item.trigger_type === "cron") {
    return { label: item.status === "paused" ? "Paused" : "Scheduled" };
  }
  return { label: item.webhook?.last_execution_status || "idle" };
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
