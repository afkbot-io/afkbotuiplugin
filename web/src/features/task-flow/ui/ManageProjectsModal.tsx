import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
import {
  formatFlowCreatorSummary,
  formatFlowOwnerSummary,
  formatFlowStatusSummary,
  formatFlowUpdatedAt,
  formatProjectResultsLabel,
  formatProjectResultsNote,
  getVisibleProjects,
} from "@/features/task-flow/model/task-flow.presentation";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProject,
  TaskFlowProjectDraft,
} from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type ManageProjectsModalProps = {
  activeFlowId: string;
  busy: boolean;
  draft: TaskFlowProjectDraft;
  error: string;
  flowSearchQuery: string;
  flows: TaskFlowProject[];
  onCancel: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: (flowId: string) => void;
  onDraftChange: (draft: TaskFlowProjectDraft) => void;
  onFilter: (flowId: string) => void;
  onRequestDelete: (flowId: string) => void;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  pendingDeleteId: string;
  profiles: TaskFlowProfile[];
  config: TaskFlowConfig;
};

export function ManageProjectsModal({
  activeFlowId,
  busy,
  config,
  draft,
  error,
  flowSearchQuery,
  flows,
  onCancel,
  onCancelDelete,
  onConfirmDelete,
  onDraftChange,
  onFilter,
  onRequestDelete,
  onSearchChange,
  onSubmit,
  open,
  pendingDeleteId,
  profiles,
}: ManageProjectsModalProps) {
  const visibleFlows = getVisibleProjects(flows, activeFlowId, flowSearchQuery);
  const activeFlow = flows.find((item) => item.id === activeFlowId) || null;

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close flow manager modal"
      eyebrow="Manage Flows"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="Flow Library"
      wide
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <div className="flow-manager">
          <section className="flow-manager__section">
            <div className="flow-manager__summary">
              <div>
                <p className="surface-page__eyebrow">Existing Flows</p>
                <h4 className="flow-manager__title">{formatProjectResultsLabel(visibleFlows.length, flows.length)}</h4>
                <p className="muted">{formatProjectResultsNote(activeFlowId, flows, flowSearchQuery)}</p>
              </div>
              <button
                className={`button ${activeFlow ? "button--ghost" : "button--primary"} button--compact`}
                disabled={busy || !activeFlow}
                onClick={() => onFilter("")}
                type="button"
              >
                {activeFlow ? "Show All Tasks" : "Showing All Tasks"}
              </button>
            </div>
            <label className="field flow-manager__search">
              <span className="field__label">Search Flows</span>
              <input
                autoComplete="off"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by name, id, label, description, or owner…"
                spellCheck={false}
                type="search"
                value={flowSearchQuery}
              />
            </label>
            <div className="flow-manager__list">
              {flows.length ? (
                visibleFlows.length ? (
                  visibleFlows.map((flow) => {
                    const isActive = flow.id === activeFlowId;
                    const isDeletePending = flow.id === pendingDeleteId;

                    return (
                      <article className={`flow-manager__item ${isActive ? "flow-manager__item--active" : ""}`} key={flow.id}>
                        <div className="flow-manager__item-head">
                          <div className="flow-manager__item-copy">
                            <h4 className="flow-manager__item-title">{flow.title || flow.id}</h4>
                            <p className="muted">{flow.description || "No description yet."}</p>
                          </div>
                          <div className="flow-manager__item-badges">
                            <span className={`badge ${isActive ? "badge--live" : "badge--muted"}`}>
                              {isActive ? "Current Flow" : "Available"}
                            </span>
                            <span className="badge badge--violet">{flow.id}</span>
                          </div>
                        </div>
                        <div className="flow-manager__item-meta">
                          <span>{formatFlowOwnerSummary(flow)}</span>
                          <span>{formatFlowCreatorSummary(flow)}</span>
                          <span>{formatFlowStatusSummary(flow)}</span>
                          {formatFlowUpdatedAt(flow) ? <span>{formatFlowUpdatedAt(flow)}</span> : null}
                        </div>
                        {flow.labels?.length ? (
                          <div className="flow-manager__item-badges">
                            {flow.labels.map((label) => (
                              <span className="badge" key={label}>
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="flow-manager__item-actions">
                          <button
                            className={`button ${isActive ? "button--primary" : "button--ghost"} button--tiny`}
                            disabled={busy}
                            onClick={() => onFilter(flow.id)}
                            type="button"
                          >
                            {isActive ? "Filtered on Board" : "Show on Board"}
                          </button>
                          {isDeletePending ? (
                            <div className="flow-manager__danger">
                              <p className="muted">Delete this flow and every task inside it?</p>
                              <div className="flow-manager__danger-actions">
                                <AsyncButton
                                  className="button button--danger button--tiny"
                                  idleLabel="Confirm Delete"
                                  loading={busy}
                                  onClick={() => onConfirmDelete(flow.id)}
                                  pendingLabel="Deleting…"
                                />
                                <button className="button button--ghost button--tiny" disabled={busy} onClick={onCancelDelete} type="button">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button className="button button--danger button--tiny" disabled={busy} onClick={() => onRequestDelete(flow.id)} type="button">
                              Delete
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state empty-state--compact">
                    <h3>No matching flows</h3>
                    <p>Adjust the search or clear it to see every available flow again.</p>
                  </div>
                )
              ) : (
                <div className="empty-state empty-state--compact">
                  <h3>No flows yet</h3>
                  <p>Create the first flow from the form on the right and it will appear here immediately.</p>
                </div>
              )}
            </div>
          </section>
          <section className="flow-manager__section flow-manager__section--form">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Add Flow</p>
                <h4 className="flow-manager__title">Create a new flow</h4>
              </div>
            </div>
            <label className="field">
              <span className="field__label">Title</span>
              <input
                maxLength={240}
                onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
                required
                value={draft.title}
              />
            </label>
            <label className="field">
              <span className="field__label">Description</span>
              <textarea
                maxLength={2000}
                onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                placeholder="What work belongs in this flow?"
                rows={4}
                value={draft.description}
              />
            </label>
            <div className="field-grid">
              <label className="field field--compact">
                <span className="field__label">Default Owner Type</span>
                <select
                  onChange={(event) => onDraftChange({ ...draft, default_owner_type: event.target.value })}
                  value={draft.default_owner_type}
                >
                  <option value="">None</option>
                  <option value="ai_profile">ai_profile</option>
                  <option value="human">human</option>
                </select>
              </label>
              <ActorRefField
                config={config}
                label="Default Owner Ref"
                name="default_owner_ref"
                onChange={(value) => onDraftChange({ ...draft, default_owner_ref: value })}
                profiles={profiles}
                typeValue={draft.default_owner_type}
                value={draft.default_owner_ref}
              />
            </div>
            <label className="field">
              <span className="field__label">Labels</span>
              <input
                onChange={(event) => onDraftChange({ ...draft, labels: event.target.value })}
                placeholder="ops, review, sprint-1…"
                value={draft.labels}
              />
            </label>
            <div className="button-row">
              <AsyncButton className="button button--primary" idleLabel="Add Flow" loading={busy} pendingLabel="Working…" type="submit" />
              <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
                Done
              </button>
            </div>
          </section>
        </div>
    </ModalDialog>
  );
}
