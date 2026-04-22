import { useId } from "react";

import {
  formatAutomationGraphError,
  getGraphOutgoingTargets,
  graphNodeStatusBadgeClass,
  graphRunStatusBadgeClass,
  hasGraphPreview,
  renderGraphEdgeLabel,
  renderGraphRunCompleted,
  renderGraphRunTimestamp,
  renderNodeTargets,
  shortSessionLabel,
} from "@/features/automations/model/automations.presentation";
import type { Automation, AutomationGraphPreview } from "@/features/automations/model/automations.types";

type AutomationGraphSectionProps = {
  automation: Automation;
  error: string;
  loading: boolean;
  onRefresh: () => void;
  onToggle: () => void;
  open: boolean;
  preview: AutomationGraphPreview | null | undefined;
};

export function AutomationGraphSection({
  automation,
  error,
  loading,
  onRefresh,
  onToggle,
  open,
  preview,
}: AutomationGraphSectionProps) {
  const regionId = useId();

  if (automation.execution_mode !== "graph") {
    return (
      <section className="panel-section">
        <div className="panel-section__header">
          <div className="panel-section__title">Runtime path</div>
        </div>
        <p className="detail-copy">
          Incoming {automation.trigger_type} data goes straight into the automation prompt and the AI session runtime.
        </p>
      </section>
    );
  }

  const previewError = formatAutomationGraphError(preview, error);
  const aiHandoffBadge = preview?.ai_handoff_present ? (
    <span className="badge badge--success">AI handoff present</span>
  ) : (
    <span className="badge badge--warning">Deterministic only</span>
  );

  return (
    <section className="panel-section">
      <div className="panel-section__header panel-section__header--stack">
        <div>
          <div className="panel-section__title">Runtime path</div>
          <p className="muted">
            Incoming {automation.trigger_type} data runs through graph nodes first, then hands off to the AI runtime only
            when needed.
          </p>
        </div>
        <div className="button-row">
          <span className="badge badge--accent">graph enabled</span>
          <span className="badge badge--muted">{automation.graph_fallback_mode || "disabled"}</span>
          {aiHandoffBadge}
          <button
            aria-controls={regionId}
            aria-expanded={open}
            className="button button--ghost button--compact"
            onClick={onToggle}
            type="button"
          >
            {open ? "Hide Graph" : "View Graph"}
          </button>
          {open ? (
            <button className="button button--ghost button--compact" onClick={onRefresh} type="button">
              Refresh Graph
            </button>
          ) : null}
        </div>
      </div>
      {open ? <AutomationGraphPreviewBody error={previewError} loading={loading} preview={preview} regionId={regionId} /> : null}
    </section>
  );
}

function AutomationGraphPreviewBody({
  error,
  loading,
  preview,
  regionId,
}: {
  error: string;
  loading: boolean;
  preview: AutomationGraphPreview | null | undefined;
  regionId: string;
}) {
  if (loading && !preview) {
    return <div className="status-line status-line--info">Loading graph snapshot…</div>;
  }

  if (error) {
    return <div className="inline-alert inline-alert--danger">{error}</div>;
  }

  if (!hasGraphPreview(preview)) {
    return <p className="field__hint">Graph mode is enabled, but no published graph snapshot is available yet.</p>;
  }

  const graph = preview?.graph;
  if (!graph) {
    return null;
  }

  const outgoing = getGraphOutgoingTargets(graph);

  return (
    <div className="graph-stack" id={regionId}>
      <div className="badge-row">
        <span className="badge badge--accent">{graph.name || "graph"}</span>
        <span className="badge badge--muted">v{String(graph.version || 0)}</span>
        <span className="badge badge--muted">{graph.status || "draft"}</span>
        <span className="badge badge--muted">{String(graph.nodes?.length || 0)} nodes</span>
        <span className="badge badge--muted">{String(graph.edges?.length || 0)} edges</span>
        <span className={`badge ${preview?.validation?.valid ? "badge--success" : "badge--failed"}`}>
          {preview?.validation?.valid ? "graph valid" : "graph needs review"}
        </span>
      </div>
      {preview?.validation?.errors?.length ? (
        <div className="inline-alert inline-alert--danger">{preview.validation.errors.join(" • ")}</div>
      ) : null}
      <div className="graph-grid">
        <section className="graph-card">
          <div className="panel-section__title">Nodes</div>
          <div className="graph-node-grid">
            {(graph.nodes || []).map((node, index) => (
              <article className="graph-node-card" key={String(node.id || node.key || index)}>
                <div className="graph-node-card__head">
                  <div>
                    <h4 className="graph-node-card__title">{node.name || node.key || "node"}</h4>
                    <p className="tiny mono-inline">{node.key || ""}</p>
                  </div>
                  <span
                    className={`badge ${
                      node.node_kind === "ai" || node.node_kind === "agent" ? "badge--success" : "badge--muted"
                    }`}
                  >
                    {node.node_kind || "node"}
                  </span>
                </div>
                <div className="badge-row">
                  <span className="badge badge--muted">{node.node_type || "unknown"}</span>
                  {node.node_version_id ? (
                    <span className="badge badge--muted">artifact #{String(node.node_version_id)}</span>
                  ) : null}
                </div>
                <p className="graph-node-card__copy">{renderNodeTargets(outgoing.get(node.key || "") || [])}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="graph-card">
          <div className="panel-section__title">Edges</div>
          <div className="graph-edge-list">
            {(graph.edges || []).length ? (
              (graph.edges || []).map((edge) => (
                <div className="graph-edge" key={edge.id || `${edge.source_key}-${edge.target_key}`}>
                  <span className="mono-inline">{String(edge.source_key || "")}</span>
                  <span className="graph-edge__arrow">→</span>
                  <span className="mono-inline">{String(edge.target_key || "")}</span>
                  <span className="badge badge--muted">{renderGraphEdgeLabel(edge)}</span>
                </div>
              ))
            ) : (
              <p className="muted">No graph edges published.</p>
            )}
          </div>
        </section>
      </div>
      <section className="graph-card">
        <div className="panel-section__title">Recent graph runs</div>
        {(preview?.recent_runs || []).length ? (
          (preview?.recent_runs || []).map((run, index) => (
            <article className="graph-run-card" key={String(run.id || `${run.started_at}-${run.status}-${index}`)}>
              <div className="graph-run-card__head">
                <div className="badge-row">
                  <span className={`badge ${graphRunStatusBadgeClass(run.status)}`}>{run.status || "unknown"}</span>
                  <span className="badge badge--muted">{run.trigger_type || "trigger"}</span>
                  {run.parent_session_id ? (
                    <span className="badge badge--muted">{shortSessionLabel(run.parent_session_id)}</span>
                  ) : null}
                </div>
                <div className="tiny">{renderGraphRunTimestamp(run)}</div>
              </div>
              <div className="graph-run-card__meta">
                <span>completed: {renderGraphRunCompleted(run)}</span>
                {run.reason ? <span>{run.reason}</span> : null}
                {run.error_code ? <span className="mono-inline">{run.error_code}</span> : null}
              </div>
            </article>
          ))
        ) : (
          <p className="muted">No graph runs recorded yet.</p>
        )}
      </section>
      {preview?.latest_trace ? <AutomationGraphTraceBlock trace={preview.latest_trace} /> : null}
    </div>
  );
}

function AutomationGraphTraceBlock({ trace }: { trace: NonNullable<AutomationGraphPreview["latest_trace"]> }) {
  return (
    <section className="graph-card">
      <div className="panel-section__title">Latest trace</div>
      <div className="graph-trace-stack">
        <div className="badge-row">
          <span className={`badge ${graphRunStatusBadgeClass(trace.run?.status)}`}>{trace.run?.status || "running"}</span>
          {trace.run?.error_code ? <span className="badge badge--failed">{trace.run.error_code}</span> : null}
          {trace.run?.parent_session_id ? (
            <span className="badge badge--muted">{shortSessionLabel(trace.run.parent_session_id)}</span>
          ) : null}
        </div>
        {trace.fallback ? (
          <div className="graph-trace-fallback">
            <span className={`badge ${graphRunStatusBadgeClass(trace.fallback.status)}`}>{trace.fallback.status}</span>
            <span>{trace.fallback.reason || trace.fallback.error_code || "fallback"}</span>
          </div>
        ) : null}
        <div className="graph-trace-list">
          {(trace.nodes || []).map((node, index) => (
            <div className="graph-trace-node" key={String(node.id || `${node.node_key}-${node.execution_index}-${index}`)}>
              <div className="graph-trace-node__head">
                <span className="mono-inline">{node.node_key || ""}</span>
                <span className={`badge ${graphNodeStatusBadgeClass(node.status)}`}>{node.status || "pending"}</span>
              </div>
              <div className="graph-trace-node__meta">
                {node.execution_index !== null && node.execution_index !== undefined ? <span>#{node.execution_index}</span> : null}
                {node.selected_ports?.length ? <span>ports: {node.selected_ports.join(", ")}</span> : null}
                {node.child_session_id ? <span>{shortSessionLabel(node.child_session_id)}</span> : null}
                {node.reason ? <span>{node.reason}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
