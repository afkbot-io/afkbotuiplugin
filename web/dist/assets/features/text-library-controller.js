import { captureSurfaceState, escapeAttribute, escapeHtml, restoreSurfaceState, truncateText } from "../core/dom.js";

export function createTextLibraryController({
  api,
  root,
  getProfileId,
  notify,
  config,
}) {
  const state = {
    initialized: false,
    loading: false,
    error: "",
    items: [],
    filters: {
      query: "",
    },
    modal: buildModalState(),
    panel: buildPanelState(),
  };
  let listRequestId = 0;
  let panelRequestId = 0;

  root.addEventListener("click", async (event) => {
    const actionNode = event.target.closest(`[${config.actionAttr}]`);
    if (actionNode) {
      const action = actionNode.getAttribute(config.actionAttr) || "";
      if (action === "refresh") {
        await refresh();
        return;
      }
      if (action === "new") {
        state.modal = {
          open: true,
          mode: "create",
          saving: false,
          error: "",
          draft: config.defaultDraft(),
          target: null,
        };
        render();
        return;
      }
      if (action === "close-modal") {
        closeModal();
        return;
      }
      if (action === "close-panel") {
        closePanel();
        return;
      }
      if (action === "panel-edit" && state.panel.item) {
        state.panel.mode = "edit";
        state.panel.draft = config.draftFromItem(state.panel.item);
        renderPanel();
        return;
      }
      if (action === "cancel-edit") {
        state.panel.mode = "view";
        state.panel.draft = null;
        renderPanel();
        return;
      }
      if (action === "delete" && state.panel.item) {
        state.modal = {
          open: true,
          mode: "delete",
          saving: false,
          error: "",
          draft: null,
          target: state.panel.item,
        };
        render();
        return;
      }
    }

    const openNode = event.target.closest(`[${config.openAttr}]`);
    if (openNode) {
      await openPanel(openNode.getAttribute(config.openAttr) || "", "view");
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const role = form.getAttribute(config.formAttr) || "";
    if (!role) {
      return;
    }
    event.preventDefault();
    if (role === "filters") {
      const formData = new FormData(form);
      state.filters.query = String(formData.get("query") || "").trim();
      await refresh();
      return;
    }
    if (role === "editor") {
      await savePanel(form);
      return;
    }
    if (role === "create") {
      await saveCreateModal(form);
      return;
    }
    if (role === "delete") {
      await confirmDelete();
    }
  });

  async function activate() {
    if (!state.initialized) {
      render();
      state.initialized = true;
    }
    await refresh();
  }

  async function onProfileChange() {
    closeModal({ renderView: false });
    closePanel({ renderView: false });
    await refresh();
  }

  function setActive(_active) {}

  function closeModal({ renderView = true } = {}) {
    state.modal = buildModalState();
    if (renderView) {
      render();
    }
  }

  function closePanel({ renderView = true } = {}) {
    panelRequestId += 1;
    state.panel = buildPanelState();
    if (renderView) {
      render();
    }
  }

  async function refresh() {
    const profileId = getProfileId();
    const query = state.filters.query;
    const requestId = ++listRequestId;
    if (!profileId) {
      state.items = [];
      state.loading = false;
      state.error = "";
      render();
      return;
    }
    state.loading = true;
    state.error = "";
    render();
    try {
      const items = await config.list(api, profileId, query);
      if (requestId !== listRequestId || profileId !== getProfileId() || query !== state.filters.query) {
        return;
      }
      state.items = items.map(config.mapItem);
      state.loading = false;
      render();
    } catch (error) {
      if (requestId !== listRequestId || profileId !== getProfileId() || query !== state.filters.query) {
        return;
      }
      state.loading = false;
      state.error = normalizeError(error);
      render();
    }
  }

  async function openPanel(itemId, mode) {
    if (!itemId) {
      return;
    }
    const profileId = getProfileId();
    const requestId = ++panelRequestId;
    state.panel = {
      open: true,
      mode,
      loading: true,
      saving: false,
      error: "",
      item: state.items.find((item) => item.id === itemId) || null,
      draft: null,
    };
    render();
    try {
      const rawItem = await config.get(api, profileId, itemId);
      if (requestId !== panelRequestId || profileId !== getProfileId() || !state.panel.open) {
        return;
      }
      const item = config.mapItem(rawItem);
      state.panel = {
        open: true,
        mode,
        loading: false,
        saving: false,
        error: "",
        item,
        draft: mode === "edit" ? config.draftFromItem(item) : null,
      };
      renderPanel();
    } catch (error) {
      if (requestId !== panelRequestId || profileId !== getProfileId() || !state.panel.open) {
        return;
      }
      state.panel.loading = false;
      state.panel.error = normalizeError(error);
      renderPanel();
    }
  }

  async function savePanel(form) {
    if (!state.panel.item) {
      return;
    }
    const profileId = getProfileId();
    if (!profileId) {
      return;
    }
    const draft = readDraft(new FormData(form), config.fields);
    const error = config.validateUpdate(draft, state.panel.item);
    if (error) {
      state.panel.error = error;
      renderPanel();
      return;
    }
    state.panel.saving = true;
    state.panel.error = "";
    renderPanel();
    try {
      const rawItem = await config.update(api, profileId, state.panel.item, draft);
      if (profileId !== getProfileId()) {
        return;
      }
      const item = config.mapItem(rawItem);
      notify(config.ui.updateSuccessLabel, "success");
      await refresh();
      if (profileId !== getProfileId()) {
        return;
      }
      state.panel = {
        open: true,
        mode: "view",
        loading: false,
        saving: false,
        error: "",
        item,
        draft: null,
      };
      render();
    } catch (error) {
      state.panel.saving = false;
      state.panel.error = normalizeError(error);
      renderPanel();
    }
  }

  async function saveCreateModal(form) {
    const profileId = getProfileId();
    if (!profileId) {
      return;
    }
    const draft = readDraft(new FormData(form), config.fields);
    const error = config.validateCreate(draft);
    if (error) {
      state.modal.error = error;
      state.modal.draft = draft;
      render();
      return;
    }
    state.modal.saving = true;
    state.modal.error = "";
    state.modal.draft = draft;
    render();
    try {
      const rawItem = await config.create(api, profileId, draft);
      if (profileId !== getProfileId()) {
        return;
      }
      const item = config.mapItem(rawItem);
      notify(config.ui.createSuccessLabel, "success");
      await refresh();
      if (profileId !== getProfileId()) {
        return;
      }
      closeModal({ renderView: false });
      state.panel = {
        open: true,
        mode: "view",
        loading: false,
        saving: false,
        error: "",
        item,
        draft: null,
      };
      render();
    } catch (error) {
      state.modal.saving = false;
      state.modal.error = normalizeError(error);
      render();
    }
  }

  async function confirmDelete() {
    if (!state.modal.target) {
      return;
    }
    const profileId = getProfileId();
    if (!profileId) {
      return;
    }
    const target = state.modal.target;
    state.modal.saving = true;
    state.modal.error = "";
    render();
    try {
      await config.remove(api, profileId, target);
      if (profileId !== getProfileId()) {
        return;
      }
      notify(config.ui.deleteSuccessLabel, "success");
      closeModal({ renderView: false });
      if (state.panel.item?.id === target.id) {
        closePanel({ renderView: false });
      }
      await refresh();
    } catch (error) {
      state.modal.saving = false;
      state.modal.error = normalizeError(error);
      render();
    }
  }

  function renderPanel() {
    const panelNode = root.querySelector(`[${config.panelAttr}]`);
    if (!panelNode) {
      render();
      return;
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
            <div class="task-pane__eyebrow">${escapeHtml(config.ui.surfaceEyebrow)}</div>
            <h2 class="section-title">${escapeHtml(config.ui.surfaceTitle)}</h2>
            <p class="section-copy">${escapeHtml(config.ui.surfaceDescription)}</p>
          </div>
          <div class="section-actions">
            <button class="button button--ghost" type="button" ${config.actionAttr}="refresh">${escapeHtml(config.ui.refreshLabel)}</button>
            <button class="button button--primary" type="button" ${config.actionAttr}="new">${escapeHtml(config.ui.newLabel)}</button>
          </div>
        </div>
        <form class="board-toolbar board-toolbar--visible automation-filters" ${config.formAttr}="filters">
          <div class="board-toolbar__summary">
            <span class="badge">${escapeHtml(config.ui.visibleLabel(state.items.length))}</span>
            <span class="board-toolbar__hint">${escapeHtml(config.ui.searchHint)}</span>
          </div>
          <div class="board-toolbar__controls">
            <div class="board-toolbar__fields board-toolbar__fields--single">
              <input class="input" type="search" name="query" placeholder="${escapeAttribute(config.ui.searchPlaceholder)}" value="${escapeAttribute(state.filters.query)}" aria-label="${escapeAttribute(config.ui.searchPlaceholder)}" />
            </div>
            <div class="board-toolbar__actions">
              <button class="button button--primary" type="submit">Apply Filters</button>
            </div>
          </div>
        </form>
        ${state.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.error)}</div>` : ""}
        <div class="workspace ${state.panel.open ? "workspace--inspecting" : ""}">
          <div class="board-stage">
            ${state.loading ? `<div class="status-line status-line--info">${escapeHtml(config.ui.loadingListLabel)}</div>` : ""}
            <div class="${escapeAttribute(config.gridClass)}">${renderCards()}</div>
          </div>
          <aside class="task-panel ${state.panel.open ? "task-panel--open" : ""}" ${config.panelAttr}>${renderSidePanel()}</aside>
        </div>
        ${renderModal()}
      </section>
    `;
  }

  function renderCards() {
    if (!state.items.length && !state.loading) {
      return `
        <div class="empty-surface">
          <div class="placeholder-card inspector-empty__card">
            <div class="panel-section__title">${escapeHtml(config.ui.emptyTitle)}</div>
            <p class="muted">${escapeHtml(config.ui.emptyDescription)}</p>
          </div>
        </div>
      `;
    }
    return state.items.map((item) => `
      <button class="card ${escapeAttribute(config.cardClass)} card--button ${state.panel.item?.id === item.id ? "card--selected" : ""}" type="button" ${config.openAttr}="${escapeAttribute(item.id)}">
        <div class="card__topline">
          <div class="card__title">${escapeHtml(item.id)}</div>
          <div class="chip-row">${renderBadges(item.cardBadges)}</div>
        </div>
        <div class="card__snippet">${escapeHtml(truncateText(item.summary || config.ui.emptySummaryLabel, 180))}</div>
        <div class="card__footer">
          <div class="card__badges">${item.path ? `<span class="badge">${escapeHtml(item.path)}</span>` : ""}</div>
        </div>
      </button>
    `).join("");
  }

  function renderSidePanel() {
    if (!state.panel.open) {
      return `
        <div class="inspector-empty">
          <div class="inspector-empty__card">
            <div class="panel-section__title">${escapeHtml(config.ui.inspectorEmptyTitle)}</div>
            <p class="muted">${escapeHtml(config.ui.inspectorEmptyDescription)}</p>
          </div>
        </div>
      `;
    }
    if (state.panel.loading) {
      return `<div class="task-pane"><div class="task-pane__shell"><div class="loading-panel"><div class="spinner"></div><p>${escapeHtml(config.ui.loadingItemLabel)}</p></div></div></div>`;
    }
    if (state.panel.mode === "edit") {
      const draft = state.panel.draft || config.defaultDraft();
      return `
        <div class="task-pane"><div class="task-pane__shell">
          <div class="task-pane__header">
            <div class="task-pane__heading">
              <div class="task-pane__eyebrow">${escapeHtml(config.ui.editEyebrow)}</div>
              <h2 class="task-pane__title">${escapeHtml(state.panel.item?.id || config.ui.surfaceTitle)}</h2>
            </div>
            <button class="icon-button" type="button" ${config.actionAttr}="close-panel" aria-label="${escapeAttribute(config.ui.closePanelLabel)}">×</button>
          </div>
          ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
          <form class="panel-form" ${config.formAttr}="editor">
            <div class="detail-grid">
              <label class="field field--full">
                <span class="field__label">${escapeHtml(config.ui.idLabel)}</span>
                <input class="input" name="${escapeAttribute(config.fields.id)}" type="text" value="${escapeAttribute(draft.id)}" ${config.idReadonlyOnEdit ? "readonly" : ""} />
              </label>
              <label class="field field--full">
                <span class="field__label">${escapeHtml(config.ui.contentLabel)}</span>
                <textarea class="textarea textarea--code" name="${escapeAttribute(config.fields.content)}" rows="${escapeAttribute(String(config.editContentRows))}" spellcheck="false">${escapeHtml(draft.content)}</textarea>
              </label>
            </div>
            <div class="button-row">
              <button class="button button--primary" type="submit" ${state.panel.saving ? "disabled" : ""}>${escapeHtml(state.panel.saving ? config.ui.editSubmittingLabel : config.ui.editSubmitLabel)}</button>
              <button class="button button--ghost" type="button" ${config.actionAttr}="cancel-edit">Cancel</button>
            </div>
          </form>
        </div></div>
      `;
    }
    return `
      <div class="task-pane"><div class="task-pane__shell">
        <div class="task-pane__header">
          <div class="task-pane__heading">
            <div class="task-pane__eyebrow">${escapeHtml(config.ui.detailsEyebrow)}</div>
            <h2 class="task-pane__title">${escapeHtml(state.panel.item?.id || config.ui.surfaceTitle)}</h2>
            <div class="chip-row">${renderBadges(state.panel.item?.detailBadges || [])}</div>
          </div>
          <button class="icon-button" type="button" ${config.actionAttr}="close-panel" aria-label="${escapeAttribute(config.ui.closePanelLabel)}">×</button>
        </div>
        ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
        <section class="panel-section">
          <div class="panel-section__header"><div class="panel-section__title">${escapeHtml(config.ui.summaryTitle)}</div></div>
          <div class="task-pane__description-copy">${escapeHtml(state.panel.item?.summary || config.ui.emptySummaryLabel)}</div>
        </section>
        <section class="panel-section">
          <div class="panel-section__header"><div class="panel-section__title">${escapeHtml(config.ui.contentTitle)}</div></div>
          <pre class="prompt-block">${escapeHtml(state.panel.item?.content || "")}</pre>
        </section>
        <div class="button-row">
          <button class="button button--primary" type="button" ${config.actionAttr}="panel-edit">Edit</button>
          <button class="button button--danger" type="button" ${config.actionAttr}="delete">Delete</button>
        </div>
      </div></div>
    `;
  }

  function renderModal() {
    if (!state.modal.open) {
      return "";
    }
    let content = "";
    if (state.modal.mode === "create") {
      const draft = state.modal.draft || config.defaultDraft();
      content = `
        <form class="modal-card modal-card--wide" ${config.formAttr}="create">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">${escapeHtml(config.ui.createEyebrow)}</p>
              <h3>${escapeHtml(config.ui.createTitle)}</h3>
              <p class="muted">${escapeHtml(config.ui.createDescription)}</p>
            </div>
            <button class="icon-button" type="button" ${config.actionAttr}="close-modal" aria-label="${escapeAttribute(config.ui.closeModalLabel)}">×</button>
          </div>
          ${state.modal.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modal.error)}</div>` : ""}
          <div class="detail-grid">
            <label class="field field--full">
              <span class="field__label">${escapeHtml(config.ui.idLabel)}</span>
              <input class="input" name="${escapeAttribute(config.fields.id)}" type="text" value="${escapeAttribute(draft.id)}" ${config.ui.idPlaceholder ? `placeholder="${escapeAttribute(config.ui.idPlaceholder)}"` : ""} />
            </label>
            <label class="field field--full">
              <span class="field__label">${escapeHtml(config.ui.contentLabel)}</span>
              <textarea class="textarea textarea--code" name="${escapeAttribute(config.fields.content)}" rows="${escapeAttribute(String(config.createContentRows))}" spellcheck="false">${escapeHtml(draft.content)}</textarea>
            </label>
          </div>
          <div class="button-row">
            <button class="button button--primary" type="submit" ${state.modal.saving ? "disabled" : ""}>${escapeHtml(state.modal.saving ? config.ui.createSubmittingLabel : config.ui.createSubmitLabel)}</button>
            <button class="button button--ghost" type="button" ${config.actionAttr}="close-modal">Cancel</button>
          </div>
        </form>
      `;
    }
    if (state.modal.mode === "delete" && state.modal.target) {
      content = `
        <form class="modal-card" ${config.formAttr}="delete">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">${escapeHtml(config.ui.deleteEyebrow)}</p>
              <h3>${escapeHtml(config.ui.deleteTitle(state.modal.target))}</h3>
            </div>
            <button class="icon-button" type="button" ${config.actionAttr}="close-modal" aria-label="${escapeAttribute(config.ui.closeDeleteLabel)}">×</button>
          </div>
          ${state.modal.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modal.error)}</div>` : ""}
          <p class="muted">${escapeHtml(config.ui.deleteDescription(state.modal.target))}</p>
          <div class="button-row">
            <button class="button button--danger" type="submit" ${state.modal.saving ? "disabled" : ""}>${escapeHtml(state.modal.saving ? config.ui.deleteSubmittingLabel : config.ui.deleteSubmitLabel)}</button>
            <button class="button button--ghost" type="button" ${config.actionAttr}="close-modal">Cancel</button>
          </div>
        </form>
      `;
    }
    return `
      <div class="modal-root modal-root--open">
        <div class="modal-overlay" ${config.actionAttr}="close-modal"></div>
        ${content}
      </div>
    `;
  }

  return {
    activate,
    onProfileChange,
    refresh,
    setActive,
    updateConfig() {},
  };
}

function buildModalState() {
  return {
    open: false,
    mode: "",
    saving: false,
    error: "",
    draft: null,
    target: null,
  };
}

function buildPanelState() {
  return {
    open: false,
    mode: "view",
    loading: false,
    saving: false,
    error: "",
    item: null,
    draft: null,
  };
}

function readDraft(formData, fields) {
  return {
    id: String(formData.get(fields.id) || "").trim(),
    content: String(formData.get(fields.content) || ""),
  };
}

function renderBadges(badges) {
  return badges
    .filter((badge) => badge && badge.text)
    .map((badge) => {
    const className = badge.className || "badge";
    return `<span class="${escapeAttribute(className)}">${escapeHtml(badge.text)}</span>`;
  })
    .join("");
}

function normalizeError(error) {
  return error instanceof Error && error.message ? error.message : "Unexpected error";
}
