import { captureSurfaceState, escapeAttribute, escapeHtml, restoreSurfaceState, truncateText } from "../core/dom.js";

export function createSubagentsController({
  api,
  root,
  getProfileId,
  notify,
}) {
  const state = {
    initialized: false,
    loading: false,
    error: "",
    items: [],
    modal: {
      open: false,
      mode: "",
      saving: false,
      error: "",
      draft: null,
      target: null,
    },
    panel: {
      open: false,
      mode: "view",
      loading: false,
      saving: false,
      error: "",
      item: null,
      draft: null,
    }
  };

  root.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-subagent-action]");
    if (!target) {
      const card = event.target.closest("[data-subagent-name]");
      if (card && !event.target.closest("button")) {
        await openPanel(card.dataset.subagentName, "view");
      }
      return;
    }
    const action = target.dataset.subagentAction;
    if (action === "refresh") return void refresh();
    if (action === "new") {
      state.modal = {
        open: true,
        mode: "create",
        saving: false,
        error: "",
        draft: { name: "", content: defaultSubagentTemplate() },
        target: null,
      };
      return render();
    }
    if (action === "close-modal") return closeModal();
    if (action === "close-panel") return closePanel();
    if (action === "panel-edit" && state.panel.item) {
      state.panel.mode = "edit";
      state.panel.draft = { name: state.panel.item.name, content: state.panel.item.content || "" };
      return renderPanel();
    }
    if (action === "cancel-edit") {
      state.panel.mode = "view";
      state.panel.draft = null;
      return renderPanel();
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
      return render();
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    if (form.dataset.subagentForm === "editor") {
      event.preventDefault();
      await savePanel(form);
      return;
    }
    if (form.dataset.subagentForm === "create") {
      event.preventDefault();
      await saveCreateModal(form);
      return;
    }
    if (form.dataset.subagentForm === "delete") {
      event.preventDefault();
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
    closeModal();
    closePanel();
    await refresh();
  }

  function setActive(_active) {}

  function closeModal({ renderView = true } = {}) {
    state.modal = {
      open: false,
      mode: "",
      saving: false,
      error: "",
      draft: null,
      target: null,
    };
    if (renderView) {
      render();
    }
  }

  function closePanel() {
    state.panel = {
      open: false,
      mode: "view",
      loading: false,
      saving: false,
      error: "",
      item: null,
      draft: null,
    };
    render();
  }

  async function refresh() {
    if (!getProfileId()) {
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
      const payload = await api.listSubagents(getProfileId());
      state.items = payload.subagents || [];
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      state.error = normalizeError(error);
      render();
    }
  }

  async function openPanel(name, mode) {
    state.panel = {
      open: true,
      mode,
      loading: true,
      saving: false,
      error: "",
      item: state.items.find((item) => item.name === name) || null,
      draft: null,
    };
    render();
    try {
      const payload = await api.getSubagent(getProfileId(), name);
      state.panel = {
        open: true,
        mode,
        loading: false,
        saving: false,
        error: "",
        item: payload.subagent,
        draft: mode === "edit" ? { name: payload.subagent.name, content: payload.subagent.content || "" } : null,
      };
      renderPanel();
    } catch (error) {
      state.panel.loading = false;
      state.panel.error = normalizeError(error);
      renderPanel();
    }
  }

  async function savePanel(form) {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const content = String(formData.get("content") || "").trim();
    if (!name) {
      state.panel.error = "Subagent name is required.";
      return renderPanel();
    }
    if (!content) {
      state.panel.error = "Subagent markdown is required.";
      return renderPanel();
    }
    state.panel.saving = true;
    state.panel.error = "";
    renderPanel();
    try {
      const payload = await api.updateSubagent(getProfileId(), state.panel.item.name, { markdown: content });
      notify("Subagent updated.", "success");
      await refresh();
      state.panel = {
        open: true,
        mode: "view",
        loading: false,
        saving: false,
        error: "",
        item: payload.subagent,
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
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const content = String(formData.get("content") || "").trim();
    if (!name || !content) {
      state.modal.error = !name ? "Subagent name is required." : "Subagent markdown is required.";
      state.modal.draft = { name, content };
      render();
      return;
    }
    state.modal.saving = true;
    state.modal.error = "";
    state.modal.draft = { name, content };
    render();
    try {
      const payload = await api.createSubagent(getProfileId(), { name, markdown: content });
      notify("Subagent created.", "success");
      await refresh();
      closeModal({ renderView: false });
      state.panel = {
        open: true,
        mode: "view",
        loading: false,
        saving: false,
        error: "",
        item: payload.subagent,
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
    const targetName = state.modal.target.name;
    state.modal.saving = true;
    state.modal.error = "";
    render();
    try {
      await api.deleteSubagent(getProfileId(), targetName);
      notify("Subagent deleted.", "success");
      closeModal({ renderView: false });
      if (state.panel.item?.name === targetName) {
        closePanel();
      }
      await refresh();
    } catch (error) {
      state.modal.saving = false;
      state.modal.error = normalizeError(error);
      render();
    }
  }

  function renderPanel() {
    const panelNode = root.querySelector("[data-subagent-panel]");
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
            <div class="task-pane__eyebrow">Workspace / Subagents</div>
            <h2 class="section-title">Subagents</h2>
            <p class="section-copy">Profile-scoped subagents now live in the same workspace, with create, inspect, edit, and delete flows that mirror the automation experience.</p>
          </div>
          <div class="section-actions">
            <button class="button button--ghost" type="button" data-subagent-action="refresh">Refresh</button>
            <button class="button button--primary" type="button" data-subagent-action="new">New Subagent</button>
          </div>
        </div>
        ${state.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.error)}</div>` : ""}
        <div class="workspace ${state.panel.open ? "workspace--inspecting" : ""}">
          <div class="board-stage">
            ${state.loading ? '<div class="status-line status-line--info">Loading subagents…</div>' : ""}
            <div class="subagent-grid">${renderCards()}</div>
          </div>
          <aside class="task-panel ${state.panel.open ? "task-panel--open" : ""}" data-subagent-panel>${renderSidePanel()}</aside>
        </div>
        ${renderModal()}
      </section>
    `;
  }

  function renderCards() {
    if (!state.items.length && !state.loading) {
      return `<div class="empty-surface"><div class="modal-card"><div class="panel-section__title">No Custom Subagents</div><p class="muted">Create profile-local subagents to standardize reusable specialist behavior.</p></div></div>`;
    }
    return state.items.map((item) => `
      <article class="card subagent-card ${state.panel.item?.name === item.name ? "card--selected" : ""}" data-subagent-name="${escapeAttribute(item.name)}">
        <div class="card__topline"><div class="card__title">${escapeHtml(item.name)}</div><span class="badge badge--ai">profile</span></div>
        <div class="card__snippet">${escapeHtml(truncateText(item.summary || "No summary yet.", 180))}</div>
        <div class="card__footer"><div class="card__badges"><span class="badge">${escapeHtml(item.path)}</span></div></div>
      </article>
    `).join("");
  }

  function renderSidePanel() {
    if (!state.panel.open) {
      return `<div class="inspector-empty"><div class="inspector-empty__card"><div class="panel-section__title">Subagent Inspector</div><p class="muted">Open a subagent to inspect its markdown, update the template, and keep profile-local specialist roles consistent.</p></div></div>`;
    }
    if (state.panel.loading) {
      return '<div class="task-pane"><div class="task-pane__shell"><div class="loading-panel"><div class="spinner"></div><p>Loading subagent…</p></div></div></div>';
    }
    if (state.panel.mode === "edit") {
      const draft = state.panel.draft || { name: "", content: defaultSubagentTemplate() };
      return `
        <div class="task-pane"><div class="task-pane__shell">
          <div class="task-pane__header">
            <div class="task-pane__heading"><div class="task-pane__eyebrow">Edit subagent</div><h2 class="task-pane__title">${escapeHtml(state.panel.item?.name || "Subagent")}</h2></div>
            <button class="icon-button" type="button" data-subagent-action="close-panel" aria-label="Close subagent panel">×</button>
          </div>
          ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
          <form class="panel-form" data-subagent-form="editor">
            <div class="detail-grid">
              <label class="field field--full"><span class="field__label">Name</span><input class="input" name="name" type="text" value="${escapeAttribute(draft.name)}" readonly /></label>
              <label class="field field--full"><span class="field__label">Markdown</span><textarea class="textarea textarea--code" name="content" rows="20" spellcheck="false">${escapeHtml(draft.content)}</textarea></label>
            </div>
            <div class="button-row"><button class="button button--primary" type="submit" ${state.panel.saving ? "disabled" : ""}>${state.panel.saving ? "Saving…" : "Save Changes"}</button><button class="button button--ghost" type="button" data-subagent-action="cancel-edit">Cancel</button></div>
          </form>
        </div></div>
      `;
    }
    return `
      <div class="task-pane"><div class="task-pane__shell">
        <div class="task-pane__header">
          <div class="task-pane__heading"><div class="task-pane__eyebrow">Subagent details</div><h2 class="task-pane__title">${escapeHtml(state.panel.item?.name || "Subagent")}</h2><div class="chip-row"><span class="badge badge--ai">profile</span><span class="badge">${escapeHtml(state.panel.item?.path || "")}</span></div></div>
          <button class="icon-button" type="button" data-subagent-action="close-panel" aria-label="Close subagent panel">×</button>
        </div>
        ${state.panel.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.panel.error)}</div>` : ""}
        <section class="panel-section"><div class="panel-section__header"><div class="panel-section__title">Summary</div></div><div class="task-pane__description-copy">${escapeHtml(state.panel.item?.summary || "No summary available.")}</div></section>
        <section class="panel-section"><div class="panel-section__header"><div class="panel-section__title">Markdown</div></div><pre class="prompt-block">${escapeHtml(state.panel.item?.content || "")}</pre></section>
        <div class="button-row"><button class="button button--primary" type="button" data-subagent-action="panel-edit">Edit</button><button class="button button--danger" type="button" data-subagent-action="delete">Delete</button></div>
      </div></div>
    `;
  }

  function renderModal() {
    if (!state.modal.open) {
      return "";
    }
    let content = "";
    if (state.modal.mode === "create") {
      const draft = state.modal.draft || { name: "", content: defaultSubagentTemplate() };
      content = `
        <form class="modal-card modal-card--wide" data-subagent-form="create">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">Create Subagent</p>
              <h3>New Subagent</h3>
              <p class="muted">Keep specialist setup in the same modal language as automations and tasks, with no separate panel-only flow.</p>
            </div>
            <button class="icon-button" type="button" data-subagent-action="close-modal" aria-label="Close subagent modal">×</button>
          </div>
          ${state.modal.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modal.error)}</div>` : ""}
          <div class="detail-grid">
            <label class="field field--full">
              <span class="field__label">Name</span>
              <input class="input" name="name" type="text" value="${escapeAttribute(draft.name)}" />
            </label>
            <label class="field field--full">
              <span class="field__label">Markdown</span>
              <textarea class="textarea textarea--code" name="content" rows="18" spellcheck="false">${escapeHtml(draft.content)}</textarea>
            </label>
          </div>
          <div class="button-row">
            <button class="button button--primary" type="submit" ${state.modal.saving ? "disabled" : ""}>${state.modal.saving ? "Creating…" : "Create Subagent"}</button>
            <button class="button button--ghost" type="button" data-subagent-action="close-modal">Cancel</button>
          </div>
        </form>
      `;
    }
    if (state.modal.mode === "delete" && state.modal.target) {
      content = `
        <form class="modal-card" data-subagent-form="delete">
          <div class="modal-card__head">
            <div>
              <p class="surface-page__eyebrow">Delete Subagent</p>
              <h3>Remove ${escapeHtml(state.modal.target.name)}</h3>
            </div>
            <button class="icon-button" type="button" data-subagent-action="close-modal" aria-label="Close delete modal">×</button>
          </div>
          ${state.modal.error ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.modal.error)}</div>` : ""}
          <p class="muted">Delete <span class="mono-inline">${escapeHtml(state.modal.target.name)}</span>? This removes the profile-local markdown definition.</p>
          <div class="button-row">
            <button class="button button--danger" type="submit" ${state.modal.saving ? "disabled" : ""}>${state.modal.saving ? "Deleting…" : "Delete Subagent"}</button>
            <button class="button button--ghost" type="button" data-subagent-action="close-modal">Cancel</button>
          </div>
        </form>
      `;
    }
    return `
      <div class="modal-root modal-root--open">
        <div class="modal-overlay" data-subagent-action="close-modal"></div>
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

function defaultSubagentTemplate() {
  return `# specialist

You are the \`specialist\` subagent.

## Focus
- Define the narrow responsibility of this subagent.
- Explain what evidence or outputs it should prioritize.
- Keep scope bounded and reusable.

## Rules
- Do not start other subagents.
- Return concise, actionable findings.
`;
}

function normalizeError(error) {
  return error instanceof Error && error.message ? error.message : "Unexpected error";
}
