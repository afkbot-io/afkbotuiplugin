import { useEffect, useMemo, useState } from "react";

import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
import {
  formatFlowCreatorSummary,
  formatFlowOwnerSummary,
  formatFlowStatusSummary,
  formatFlowUpdatedAt,
  formatProjectResultsLabel,
  formatProjectResultsNote,
  formatStatusLabel,
  getVisibleProjects,
  truncate,
} from "@/features/task-flow/model/task-flow.presentation";
import {
  TASK_FLOW_EMPLOYEE_TYPE,
  resolveActorRefForType,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowDocument,
  TaskFlowDocumentDraft,
  TaskFlowProfile,
  TaskFlowProject,
  TaskFlowProjectDraft,
  TaskFlowEmployeeOption,
} from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type ManageProjectsModalProps = {
  activeFlowId: string;
  busy: boolean;
  draft: TaskFlowProjectDraft;
  editingFlowId: string;
  error: string;
  flowDocuments: TaskFlowDocument[];
  flowDocumentsError: string;
  flowDocumentsLoading: boolean;
  flowSearchQuery: string;
  flows: TaskFlowProject[];
  busyDocumentId: string;
  onCancel: () => void;
  onCancelDelete: () => void;
  onCancelEdit: () => void;
  onConfirmFlowDocument: (document: TaskFlowDocument) => void;
  onConfirmDelete: (flowId: string) => void;
  onDraftChange: (draft: TaskFlowProjectDraft) => void;
  onEdit: (flowId: string) => void;
  onFilter: (flowId: string) => void;
  onRequestDelete: (flowId: string) => void;
  onSaveFlowDocument: (draft: TaskFlowDocumentDraft, flowId: string, baseRevision?: number | null) => void;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  open: boolean;
  pendingDeleteId: string;
  profileId: string;
  profiles: TaskFlowProfile[];
  employees: TaskFlowEmployeeOption[];
};

export function ManageProjectsModal({
  activeFlowId,
  busy,
  draft,
  editingFlowId,
  error,
  flowDocuments,
  flowDocumentsError,
  flowDocumentsLoading,
  flowSearchQuery,
  flows,
  busyDocumentId,
  onCancel,
  onCancelDelete,
  onCancelEdit,
  onConfirmFlowDocument,
  onConfirmDelete,
  onDraftChange,
  onEdit,
  onFilter,
  onRequestDelete,
  onSaveFlowDocument,
  onSearchChange,
  onSubmit,
  open,
  pendingDeleteId,
  profileId,
  profiles,
  employees,
}: ManageProjectsModalProps) {
  const visibleFlows = getVisibleProjects(flows, activeFlowId, flowSearchQuery);
  const activeFlow = flows.find((item) => item.id === activeFlowId) || null;
  const editingFlow = flows.find((item) => item.id === editingFlowId) || null;
  const handleDefaultOwnerTypeChange = (defaultOwnerType: string) => {
    onDraftChange({
      ...draft,
      default_owner_ref: resolveActorRefForType({
        currentRef: draft.default_owner_ref,
        previousType: draft.default_owner_type,
        profileId,
        employees,
        type: defaultOwnerType,
      }),
      default_owner_type: defaultOwnerType,
    });
  };

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close flow manager modal"
      eyebrow="Manage Flows"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="Project Flows"
      wide
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <div className="flow-manager">
          <section className="flow-manager__section">
            <div className="flow-manager__summary">
              <div>
                <p className="surface-page__eyebrow">Project flows</p>
                <h4 className="flow-manager__title">{formatProjectResultsLabel(visibleFlows.length, flows.length)}</h4>
                <p className="muted">{formatProjectResultsNote(activeFlowId, flows, flowSearchQuery)}</p>
              </div>
            </div>
            <label className="field flow-manager__search">
              <span className="field__label">Search Flows</span>
              <input
                autoComplete="off"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search by name, label, description, owner, or id..."
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
                          <button className="button button--ghost button--tiny" disabled={busy} onClick={() => onEdit(flow.id)} type="button">
                            Edit
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
                <p className="panel-head__eyebrow">{editingFlow ? "Edit project flow" : "Add project flow"}</p>
                <h4 className="flow-manager__title">{editingFlow ? editingFlow.title || editingFlow.id : "Create a project flow"}</h4>
              </div>
            </div>
            <label className="field">
              <span className="field__label">Flow name</span>
              <input
                maxLength={240}
                onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
                required
                value={draft.title}
              />
            </label>
            <label className="field">
              <span className="field__label">Purpose</span>
              <textarea
                maxLength={2000}
                onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                placeholder="What work belongs in this project flow?"
                rows={4}
                value={draft.description}
              />
            </label>
            <div className="field-grid">
              <label className="field field--compact">
                <span className="field__label">Default assignee type</span>
                <select
                  onChange={(event) => handleDefaultOwnerTypeChange(event.target.value)}
                  value={draft.default_owner_type}
                >
                  <option value="">None</option>
                  <option value={TASK_FLOW_EMPLOYEE_TYPE}>Employee</option>
                </select>
              </label>
              <ActorRefField
                label="Default assignee"
                name="default_owner_ref"
                onChange={(value) => onDraftChange({ ...draft, default_owner_ref: value })}
                profileId={profileId}
                profiles={profiles}
                employees={employees}
                typeValue={draft.default_owner_type}
                value={draft.default_owner_ref}
              />
            </div>
            <label className="field">
              <span className="field__label">Labels</span>
              <input
                onChange={(event) => onDraftChange({ ...draft, labels: event.target.value })}
                placeholder="ops, review, sprint-1"
                value={draft.labels}
              />
              <span className="field__hint">Use labels for filtering and release grouping. The flow id remains technical metadata.</span>
            </label>
            <div className="button-row">
              <AsyncButton
                className="button button--primary"
                idleLabel={editingFlow ? "Save Flow" : "Add Flow"}
                loading={busy}
                pendingLabel="Working…"
                type="submit"
              />
              {editingFlow ? (
                <button className="button button--ghost" disabled={busy} onClick={onCancelEdit} type="button">
                  Cancel Edit
                </button>
              ) : null}
              <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
                Done
              </button>
            </div>
            <FlowDocumentSection
              activeFlow={activeFlow}
              busyDocumentId={busyDocumentId}
              documents={flowDocuments}
              error={flowDocumentsError}
              loading={flowDocumentsLoading}
              onConfirm={onConfirmFlowDocument}
              onSave={onSaveFlowDocument}
              saving={busyDocumentId === "new-flow-doc"}
            />
          </section>
        </div>
    </ModalDialog>
  );
}

const FLOW_DOCUMENT_KEYS = ["brief", "plan", "spec", "decisions", "status"] as const;

function FlowDocumentSection({
  activeFlow,
  busyDocumentId,
  documents,
  error,
  loading,
  onConfirm,
  onSave,
  saving,
}: {
  activeFlow: TaskFlowProject | null;
  busyDocumentId: string;
  documents: TaskFlowDocument[];
  error: string;
  loading: boolean;
  onConfirm: (document: TaskFlowDocument) => void;
  onSave: (draft: TaskFlowDocumentDraft, flowId: string, baseRevision?: number | null) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<TaskFlowDocumentDraft>({
    body: "",
    document_key: "plan",
    scope_type: "flow",
    title: "Flow plan",
  });

  useEffect(() => {
    setDraft({
      body: "",
      document_key: "plan",
      scope_type: "flow",
      title: "Flow plan",
    });
  }, [activeFlow?.id]);

  const matchingDocument = useMemo(
    () => documents.find((document) => document.document_key === draft.document_key) || null,
    [documents, draft.document_key],
  );

  const handleSave = () => {
    if (!activeFlow?.id || !draft.title.trim() || !draft.document_key.trim()) {
      return;
    }
    onSave(draft, activeFlow.id, matchingDocument?.revision || null);
  };

  return (
    <div className="flow-manager__docs">
      <div className="panel-head panel-head--compact">
        <div>
          <p className="panel-head__eyebrow">Project Knowledge</p>
          <h4 className="flow-manager__title">Flow docs</h4>
        </div>
      </div>
      {!activeFlow ? (
        <p className="muted-copy">Select a flow on the board to manage its brief, plan, spec, decisions, and status.</p>
      ) : (
        <>
          <p className="muted">{activeFlow.title || activeFlow.id}</p>
          {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
          {loading ? <p className="muted-copy">Loading flow docs…</p> : null}
          <div className="knowledge-doc-list">
            <div className="knowledge-doc-list__head">
              <h5>Documents</h5>
              <span className="badge badge--muted">{documents.length}</span>
            </div>
            {documents.length ? (
              documents.map((document) => {
                const confirmed = document.confirmed_revision === document.revision || document.confirmation_status === "confirmed";
                return (
                  <article className="knowledge-doc" key={document.id}>
                    <div className="knowledge-doc__head">
                      <div>
                        <h5>{document.title || formatStatusLabel(document.document_key)}</h5>
                        <p className="muted">
                          {document.document_key} · r{document.revision}
                        </p>
                      </div>
                      <span className={`badge ${confirmed ? "badge--success" : "badge--warning"}`}>
                        {confirmed ? "confirmed" : "draft"}
                      </span>
                    </div>
                    <p className="knowledge-doc__body">{truncate(document.body, 220) || "No body yet."}</p>
                    <div className="button-row">
                      <button className="button button--ghost button--tiny" onClick={() => setDraft(documentToFlowDraft(document))} type="button">
                        Edit
                      </button>
                      <AsyncButton
                        className="button button--ghost button--tiny"
                        disabled={confirmed}
                        idleLabel="Confirm"
                        loading={busyDocumentId === document.id}
                        onClick={() => onConfirm(document)}
                        pendingLabel="Confirming…"
                      />
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="muted-copy">No flow docs yet.</p>
            )}
          </div>
          <div className="editor-form editor-form--compact knowledge-editor">
            <label className="field field--compact">
              <span className="field__label">Document</span>
              <select onChange={(event) => setDraft((current) => ({ ...current, document_key: event.target.value }))} value={draft.document_key}>
                {FLOW_DOCUMENT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {formatStatusLabel(key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Title</span>
              <input maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} />
            </label>
            <label className="field">
              <span className="field__label">Body</span>
              <textarea
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Persist the compact project brief, plan, spec, decision log, or current status."
                rows={5}
                value={draft.body}
              />
            </label>
            <AsyncButton
              className="button button--primary"
              disabled={!activeFlow.id || !draft.title.trim()}
              idleLabel={matchingDocument ? "Update Flow Doc" : "Save Flow Doc"}
              loading={saving}
              onClick={handleSave}
              pendingLabel="Saving…"
            />
          </div>
        </>
      )}
    </div>
  );
}

function documentToFlowDraft(document: TaskFlowDocument): TaskFlowDocumentDraft {
  return {
    body: String(document.body || ""),
    document_key: String(document.document_key || "plan"),
    scope_type: "flow",
    title: String(document.title || document.document_key || "Flow document"),
  };
}
