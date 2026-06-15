import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  TaskFlowContextBundle,
  TaskFlowDocument,
  TaskFlowDocumentDraft,
} from "@/features/task-flow/model/task-flow.types";
import { formatStatusLabel, truncate } from "@/features/task-flow/model/task-flow.presentation";
import { formatDateTime } from "@/shared/lib/time";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type TaskKnowledgePanelProps = {
  busyDocumentId?: string;
  context: TaskFlowContextBundle | null;
  error: string;
  loading: boolean;
  onConfirmDocument: (document: TaskFlowDocument) => void;
  onSaveDocument: (draft: TaskFlowDocumentDraft, scopeId: string, baseRevision?: number | null) => void;
  savingDocument: boolean;
};

const FLOW_DOCUMENT_KEY_OPTIONS = ["brief", "plan", "spec", "decisions", "status"] as const;
const TASK_DOCUMENT_KEY_OPTIONS = ["handoff", "notes", "review", "evidence"] as const;

export function TaskKnowledgePanel({
  busyDocumentId = "",
  context,
  error,
  loading,
  onConfirmDocument,
  onSaveDocument,
  savingDocument,
}: TaskKnowledgePanelProps) {
  const [draft, setDraft] = useState<TaskFlowDocumentDraft>({
    body: "",
    document_key: "handoff",
    scope_type: "task",
    title: "Task handoff",
  });

  useEffect(() => {
    setDraft({
      body: "",
      document_key: "handoff",
      scope_type: "task",
      title: "Task handoff",
    });
  }, [context?.task?.id]);

  const documents = useMemo(
    () => sortByNewest([...(context?.flow_documents || []), ...(context?.task_documents || [])], "updated_at"),
    [context?.flow_documents, context?.task_documents],
  );
  const selectedScopeId = draft.scope_type === "flow" ? context?.flow?.id || "" : context?.task?.id || "";
  const documentKeyOptions = draft.scope_type === "flow" ? FLOW_DOCUMENT_KEY_OPTIONS : TASK_DOCUMENT_KEY_OPTIONS;
  const matchingDocument = documents.find(
    (document) => document.scope_type === draft.scope_type && document.scope_id === selectedScopeId && document.document_key === draft.document_key,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedScopeId || !draft.document_key.trim() || !draft.title.trim()) {
      return;
    }
    onSaveDocument(draft, selectedScopeId, matchingDocument?.revision || null);
  };

  if (loading && !context) {
    return (
      <section className="detail-section task-knowledge">
        <SurfaceLoader message="Loading context…" />
      </section>
    );
  }

  return (
    <section className="detail-section task-knowledge">
      <div className="panel-head panel-head--compact">
        <div>
          <p className="panel-head__eyebrow">Knowledge</p>
          <h4 className="panel-head__title">Context & Docs</h4>
        </div>
      </div>
      {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
      {context ? (
        <>
          <div className="knowledge-grid">
            <ContextMetric label="Packet docs" value={context.knowledge_packet?.documents?.length || 0} />
            <ContextMetric label="Flow docs" value={context.flow_documents?.length || 0} />
            <ContextMetric label="Task docs" value={context.task_documents?.length || 0} />
            <ContextMetric label="Dependencies" value={context.dependencies?.length || 0} />
          </div>

          <KnowledgePacketSummary context={context} />

          <DocumentList
            busyDocumentId={busyDocumentId}
            documents={sortByNewest(context.flow_documents || [], "updated_at")}
            emptyLabel="No flow docs yet."
            onConfirmDocument={onConfirmDocument}
            onEdit={(document) => setDraft(documentToDraft(document))}
            title="Flow docs"
          />
          <DocumentList
            busyDocumentId={busyDocumentId}
            documents={sortByNewest(context.task_documents || [], "updated_at")}
            emptyLabel="No task docs yet."
            onConfirmDocument={onConfirmDocument}
            onEdit={(document) => setDraft(documentToDraft(document))}
            title="Task docs"
          />

          <form className="editor-form editor-form--compact knowledge-editor" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label className="field field--compact">
                <span className="field__label">Scope</span>
                <select
                  onChange={(event) => {
                    const scopeType = event.target.value === "flow" ? "flow" : "task";
                    setDraft((current) => ({
                      ...current,
                      document_key: scopeType === "flow" ? "brief" : "handoff",
                      scope_type: scopeType,
                      title: scopeType === "flow" ? "Project Brief" : "Task handoff",
                    }));
                  }}
                  value={draft.scope_type}
                >
                  <option value="task">Task</option>
                  <option disabled={!context.flow?.id} value="flow">
                    Flow
                  </option>
                </select>
              </label>
              <label className="field field--compact">
                <span className="field__label">Document</span>
                <select
                  onChange={(event) => setDraft((current) => ({ ...current, document_key: event.target.value }))}
                  value={draft.document_key}
                >
                  {documentKeyOptions.map((key) => (
                    <option key={key} value={key}>
                      {formatStatusLabel(key)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field__label">Title</span>
              <input
                maxLength={240}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                value={draft.title}
              />
            </label>
            <label className="field">
              <span className="field__label">Body</span>
              <textarea
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Persist a compact project decision, task handoff, review note, or evidence entry."
                rows={6}
                value={draft.body}
              />
            </label>
            <AsyncButton
              className="button button--primary"
              disabled={!selectedScopeId || !draft.title.trim()}
              idleLabel={matchingDocument ? "Update Document" : "Save Document"}
              loading={savingDocument}
              pendingLabel="Saving…"
              type="submit"
            />
          </form>

          <ContextTimeline context={context} />
        </>
      ) : (
        <p className="muted-copy">Select a task to load its working context.</p>
      )}
    </section>
  );
}

function KnowledgePacketSummary({ context }: { context: TaskFlowContextBundle }) {
  const packet = context.knowledge_packet;
  if (!packet) {
    return null;
  }
  const documents = packet.documents || [];
  const missing = packet.missing_flow_document_keys || [];
  const unconfirmed = packet.unconfirmed_flow_document_keys || [];
  const blockers = packet.blocking_reasons || [];
  const healthStatus = String(packet.health_status || "needs_attention");
  const readyForDelegation = packet.ready_for_delegation === true;
  const readyForExecution = packet.ready_for_execution === true;
  const healthBadgeClass = healthStatus === "ready" ? "badge--success" : "badge--warning";
  return (
    <div className="knowledge-doc-list">
      <div className="knowledge-doc-list__head">
        <h5>Runtime packet</h5>
        <div className="knowledge-doc-list__actions">
          <span className={`badge ${healthBadgeClass}`}>{healthStatus}</span>
          <span className="badge badge--muted">{packet.context_budget_chars || 0} chars</span>
        </div>
      </div>
      <div className="knowledge-gates">
        <span className={`badge ${readyForDelegation ? "badge--success" : "badge--warning"}`}>
          Delegation {readyForDelegation ? "ready" : "blocked"}
        </span>
        <span className={`badge ${readyForExecution ? "badge--success" : "badge--warning"}`}>
          Execution {readyForExecution ? "ready" : "blocked"}
        </span>
      </div>
      {blockers.length ? (
        <p className="muted-copy">Knowledge blockers: {blockers.join("; ")}</p>
      ) : null}
      {missing.length ? (
        <p className="muted-copy">Missing spine docs: {missing.join(", ")}</p>
      ) : null}
      {unconfirmed.length ? (
        <p className="muted-copy">Unconfirmed spine docs: {unconfirmed.join(", ")}</p>
      ) : null}
      {documents.length ? (
        documents.slice(0, 8).map((document, index) => (
          <article className="knowledge-doc" key={`${document.scope_type}-${document.scope_id}-${document.document_key}-${index}`}>
            <div className="knowledge-doc__head">
              <div>
                <h5>{document.title || document.document_key}</h5>
                <p className="muted">
                  {document.scope_type}.{document.document_key} · r{document.revision || 1}
                </p>
              </div>
              <span className={`badge ${document.confirmation_status === "confirmed" ? "badge--success" : "badge--warning"}`}>
                {document.confirmation_status || "draft"}
              </span>
            </div>
            <p className="knowledge-doc__body">{truncate(document.excerpt || "", 220) || "No excerpt."}</p>
          </article>
        ))
      ) : (
        <p className="muted-copy">No runtime packet docs yet.</p>
      )}
    </div>
  );
}

function ContextMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="knowledge-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DocumentList({
  busyDocumentId,
  documents,
  emptyLabel,
  onConfirmDocument,
  onEdit,
  title,
}: {
  busyDocumentId: string;
  documents: TaskFlowDocument[];
  emptyLabel: string;
  onConfirmDocument: (document: TaskFlowDocument) => void;
  onEdit: (document: TaskFlowDocument) => void;
  title: string;
}) {
  return (
    <div className="knowledge-doc-list">
      <div className="knowledge-doc-list__head">
        <h5>{title}</h5>
        <span className="badge badge--muted">{documents.length}</span>
      </div>
      {documents.length ? (
        documents.map((document) => {
          const confirmed = document.confirmed_revision === document.revision || document.confirmation_status === "confirmed";
          return (
            <article className="knowledge-doc" key={document.id}>
              <div className="knowledge-doc__head">
                <div>
                  <h5>{document.title || document.document_key}</h5>
                  <p className="muted">
                    {document.document_key} · r{document.revision} · {formatDateTime(document.updated_at)}
                  </p>
                </div>
                <span className={`badge ${confirmed ? "badge--success" : "badge--warning"}`}>
                  {confirmed ? "confirmed" : "draft"}
                </span>
              </div>
              <p className="knowledge-doc__body">{truncate(document.body, 260) || "No body yet."}</p>
              <div className="button-row">
                <button className="button button--ghost button--tiny" onClick={() => onEdit(document)} type="button">
                  Edit
                </button>
                <AsyncButton
                  className="button button--ghost button--tiny"
                  disabled={confirmed}
                  idleLabel="Confirm"
                  loading={busyDocumentId === document.id}
                  onClick={() => onConfirmDocument(document)}
                  pendingLabel="Confirming…"
                />
              </div>
            </article>
          );
        })
      ) : (
        <p className="muted-copy">{emptyLabel}</p>
      )}
    </div>
  );
}

function ContextTimeline({ context }: { context: TaskFlowContextBundle }) {
  const tasks = [...(context.dependency_tasks || []), ...(context.dependent_tasks || []), ...(context.delegated_tasks || [])];
  const recentEvents = sortByNewest(context.recent_events || [], "created_at");
  return (
    <div className="knowledge-context">
      {tasks.length ? (
        <div className="knowledge-context__group">
          <h5>Related tasks</h5>
          {tasks.slice(0, 6).map((task) => (
            <p key={task.id}>
              <span className="badge badge--muted">{formatStatusLabel(task.status)}</span> {task.title}
            </p>
          ))}
        </div>
      ) : null}
      {(context.recent_events || []).length ? (
        <div className="knowledge-context__group">
          <h5>Recent context events</h5>
          {recentEvents.slice(0, 5).map((event) => (
            <p key={String(event.id || `${event.task_id}-${event.event_type}`)}>
              <span className="badge badge--muted">{event.event_type || "event"}</span> {formatDateTime(event.created_at)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function documentToDraft(document: TaskFlowDocument): TaskFlowDocumentDraft {
  return {
    body: String(document.body || ""),
    document_key: document.document_key,
    scope_type: document.scope_type === "flow" ? "flow" : "task",
    title: document.title || document.document_key,
  };
}

function sortByNewest<T extends object>(items: T[], primaryKey: keyof T, fallbackKey?: keyof T) {
  return [...items].sort((left, right) => {
    const leftTime = parseSortTime(left[primaryKey]) || (fallbackKey ? parseSortTime(left[fallbackKey]) : 0);
    const rightTime = parseSortTime(right[primaryKey]) || (fallbackKey ? parseSortTime(right[fallbackKey]) : 0);
    return rightTime - leftTime;
  });
}

function parseSortTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
