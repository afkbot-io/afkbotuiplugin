import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import type { TaskFlowDocument } from "@/features/task-flow/model/task-flow.types";
import { formatStatusLabel, truncate } from "@/features/task-flow/model/task-flow.presentation";
import { formatDateTime } from "@/shared/lib/time";
import { normalizeError } from "@/shared/lib/workspace";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type DocumentWorkspaceApi = {
  confirmTaskFlowDocument: (
    profileId: string,
    documentId: string,
    payload: Record<string, unknown>,
  ) => Promise<{ task_document?: TaskFlowDocument }>;
  deleteTaskFlowDocument: (
    profileId: string,
    documentId: string,
    payload: Record<string, unknown>,
  ) => Promise<{ deleted?: boolean; task_document?: TaskFlowDocument }>;
  listTaskFlowDocumentWorkspace: (
    profileId: string,
    params?: Record<string, unknown>,
  ) => Promise<{ task_documents?: TaskFlowDocument[] }>;
};

const SCOPE_OPTIONS = [
  { label: "All Scopes", value: "" },
  { label: "Flows", value: "flow" },
  { label: "Tasks", value: "task" },
] as const;

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Confirmed", value: "confirmed" },
] as const;

function coerceDocumentApi(api: unknown) {
  return api as DocumentWorkspaceApi;
}

export const TaskDocumentsPage = forwardRef<RouteHandle, AppRouteProps>(function TaskDocumentsPage(
  {
    active,
    api,
    config,
    notify,
    profileId,
  },
  ref,
) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [scopeType, setScopeType] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const trimmedQuery = query.trim();
  const queryKey = ["task-flow-documents", profileId, trimmedQuery, scopeType, confirmationStatus];

  const documentsQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey,
    queryFn: async () => {
      const payload = await coerceDocumentApi(api).listTaskFlowDocumentWorkspace(profileId, {
        confirmation_status: confirmationStatus || undefined,
        limit: 100,
        offset: 0,
        query: trimmedQuery || undefined,
        scope_type: scopeType || undefined,
      });
      return Array.isArray(payload.task_documents) ? payload.task_documents : [];
    },
  });

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await documentsQuery.refetch();
    },
  }));

  const documents = documentsQuery.data || [];
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || documents[0] || null,
    [documents, selectedDocumentId],
  );

  useEffect(() => {
    if (!documents.length) {
      setSelectedDocumentId("");
      setPendingDeleteId("");
      return;
    }
    if (!documents.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(documents[0].id);
    }
    if (pendingDeleteId && !documents.some((document) => document.id === pendingDeleteId)) {
      setPendingDeleteId("");
    }
  }, [documents, pendingDeleteId, selectedDocumentId]);

  const confirmedCount = documents.filter(isConfirmed).length;
  const draftCount = documents.length - confirmedCount;

  const confirmMutation = useMutation({
    mutationFn: async (document: TaskFlowDocument) => {
      return coerceDocumentApi(api).confirmTaskFlowDocument(profileId, document.id, {
        actor_ref: String(config.task_flow_actor_ref || "web-user"),
        actor_type: String(config.task_flow_actor_type || "human"),
        expected_revision: document.revision,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["task-flow-documents", profileId] });
      notify("Document confirmed.", "success");
    },
    onError(error) {
      notify(normalizeError(error), "danger");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (document: TaskFlowDocument) => {
      return coerceDocumentApi(api).deleteTaskFlowDocument(profileId, document.id, {
        actor_ref: String(config.task_flow_actor_ref || "web-user"),
        actor_type: String(config.task_flow_actor_type || "human"),
        expected_revision: document.revision,
      });
    },
    onSuccess: async () => {
      setPendingDeleteId("");
      setSelectedDocumentId("");
      await queryClient.invalidateQueries({ queryKey: ["task-flow-documents", profileId] });
      notify("Document deleted.", "success");
    },
    onError(error) {
      notify(normalizeError(error), "danger");
    },
  });

  return (
    <div className="route-page route-page--documents">
      <header className="surface-header">
        <div>
          <p className="surface-header__eyebrow">Workspace / Docs</p>
          <h1 className="surface-header__title">Docs</h1>
        </div>
        <div className="surface-header__actions">
          <button className="button button--ghost" disabled={documentsQuery.isFetching} onClick={() => void documentsQuery.refetch()} type="button">
            Refresh
          </button>
        </div>
      </header>

      <section className="summary-strip docs-summary" aria-label="Document summary">
        <Metric label="Total" value={documents.length} />
        <Metric label="Draft" value={draftCount} />
        <Metric label="Confirmed" value={confirmedCount} />
      </section>

      <section className="board-toolbar automation-filters docs-filters" aria-label="Document filters">
        <div className="board-toolbar__controls">
          <div className="board-toolbar__fields">
            <label className="field">
              <span className="field__label">Search</span>
              <input
                className="board-toolbar__search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, key, scope, or body"
                value={query}
              />
            </label>
            <label className="field">
              <span className="field__label">Scope</span>
              <select onChange={(event) => setScopeType(event.target.value)} value={scopeType}>
                {SCOPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Status</span>
              <select onChange={(event) => setConfirmationStatus(event.target.value)} value={confirmationStatus}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {documentsQuery.error ? <div className="inline-alert inline-alert--danger" role="alert">{normalizeError(documentsQuery.error)}</div> : null}

      <section className="surface-shell surface-shell--split docs-workspace">
        <div className="docs-list-pane">
          {documentsQuery.isLoading ? (
            <SurfaceLoader message="Loading documents…" />
          ) : documents.length ? (
            <div className="docs-list" aria-label="Documents">
              {documents.map((document) => (
                <button
                  className={`docs-list__item${selectedDocument?.id === document.id ? " docs-list__item--active" : ""}`}
                  key={document.id}
                  onClick={() => setSelectedDocumentId(document.id)}
                  type="button"
                >
                  <span className="docs-list__item-head">
                    <span className="docs-list__item-title">{document.title || document.document_key}</span>
                    <span className={`badge ${isConfirmed(document) ? "badge--success" : "badge--warning"}`}>
                      {isConfirmed(document) ? "confirmed" : "draft"}
                    </span>
                  </span>
                  <span className="docs-list__item-meta">
                    {formatStatusLabel(document.scope_type)} · {document.document_key} · r{document.revision}
                  </span>
                  <span className="docs-list__item-body">{truncate(document.body, 190) || "No body yet."}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>No documents</h2>
              <p>Task Flow documents will appear here after agents or operators save them.</p>
            </div>
          )}
        </div>

        <aside className="docs-detail-pane" aria-label="Document preview">
          {selectedDocument ? (
            <DocumentPreview
              busy={confirmMutation.isPending && confirmMutation.variables?.id === selectedDocument.id}
              deleting={deleteMutation.isPending && deleteMutation.variables?.id === selectedDocument.id}
              document={selectedDocument}
              onCancelDelete={() => setPendingDeleteId("")}
              onConfirm={() => confirmMutation.mutate(selectedDocument)}
              onConfirmDelete={() => deleteMutation.mutate(selectedDocument)}
              onRequestDelete={() => setPendingDeleteId(selectedDocument.id)}
              pendingDelete={pendingDeleteId === selectedDocument.id}
            />
          ) : (
            <div className="inspector-empty">
              <h3>Select a document</h3>
              <p>Preview opens here.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
});

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <p className="metric__copy">{label}</p>
      <p className="metric__value">{value}</p>
    </div>
  );
}

function DocumentPreview({
  busy,
  deleting,
  document,
  onCancelDelete,
  onConfirm,
  onConfirmDelete,
  onRequestDelete,
  pendingDelete,
}: {
  busy: boolean;
  deleting: boolean;
  document: TaskFlowDocument;
  onCancelDelete: () => void;
  onConfirm: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  pendingDelete: boolean;
}) {
  const confirmed = isConfirmed(document);

  return (
    <article className="docs-preview">
      <div className="docs-preview__head">
        <div>
          <p className="docs-preview__eyebrow">
            {formatStatusLabel(document.scope_type)} / {document.document_key}
          </p>
          <h2>{document.title || document.document_key}</h2>
        </div>
        <span className={`badge ${confirmed ? "badge--success" : "badge--warning"}`}>{confirmed ? "confirmed" : "draft"}</span>
      </div>

      <dl className="kv-grid docs-preview__meta">
        <div>
          <dt>Scope ID</dt>
          <dd>{document.scope_id}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{document.revision}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDateTime(document.updated_at)}</dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>{document.confirmed_revision ? `r${document.confirmed_revision}` : "No"}</dd>
        </div>
      </dl>

      <div className="docs-preview__body">
        <pre>{document.body || "No body yet."}</pre>
      </div>

      {pendingDelete ? (
        <div className="inline-alert inline-alert--warning docs-preview__delete" role="alert">
          <p>Delete this document and every revision?</p>
          <div className="button-row">
            <button className="button button--ghost button--tiny" disabled={deleting} onClick={onCancelDelete} type="button">
              Cancel
            </button>
            <AsyncButton
              className="button button--danger button--tiny"
              idleLabel="Delete Document"
              loading={deleting}
              onClick={onConfirmDelete}
              pendingLabel="Deleting…"
            />
          </div>
        </div>
      ) : null}

      <div className="button-row">
        <AsyncButton
          className="button button--primary"
          disabled={confirmed || deleting}
          idleLabel="Confirm"
          loading={busy}
          onClick={onConfirm}
          pendingLabel="Confirming…"
        />
        <button className="button button--danger" disabled={busy || deleting} onClick={onRequestDelete} type="button">
          Delete
        </button>
      </div>
    </article>
  );
}

function isConfirmed(document: TaskFlowDocument) {
  return document.confirmed_revision === document.revision || document.confirmation_status === "confirmed";
}
