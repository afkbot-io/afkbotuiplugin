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

const DOCUMENT_KEY_OPTIONS = ["plan", "spec", "roadmap", "decisions", "handoff", "qa", "notes"] as const;

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
    document_key: "plan",
    scope_type: "task",
    title: "Task plan",
  });

  useEffect(() => {
    setDraft({
      body: "",
      document_key: "plan",
      scope_type: "task",
      title: "Task plan",
    });
  }, [context?.task?.id]);

  const documents = useMemo(
    () => [...(context?.flow_documents || []), ...(context?.task_documents || [])],
    [context?.flow_documents, context?.task_documents],
  );
  const selectedScopeId = draft.scope_type === "flow" ? context?.flow?.id || "" : context?.task?.id || "";
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
            <ContextMetric label="Flow docs" value={context.flow_documents?.length || 0} />
            <ContextMetric label="Task docs" value={context.task_documents?.length || 0} />
            <ContextMetric label="Dependencies" value={context.dependencies?.length || 0} />
            <ContextMetric label="Delegated" value={context.delegated_tasks?.length || 0} />
          </div>

          <DocumentList
            busyDocumentId={busyDocumentId}
            documents={context.flow_documents || []}
            emptyLabel="No flow docs yet."
            onConfirmDocument={onConfirmDocument}
            onEdit={(document) => setDraft(documentToDraft(document))}
            title="Flow docs"
          />
          <DocumentList
            busyDocumentId={busyDocumentId}
            documents={context.task_documents || []}
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
                      scope_type: scopeType,
                      title: scopeType === "flow" ? "Flow plan" : "Task plan",
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
                  {DOCUMENT_KEY_OPTIONS.map((key) => (
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
                placeholder="Persist plan, spec, handoff, QA notes, or decisions for every employee working this flow."
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
          {(context.recent_events || []).slice(0, 5).map((event) => (
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
