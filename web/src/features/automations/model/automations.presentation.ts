import { exactAndRelative, formatDateTime } from "@/shared/lib/time";

import type {
  Automation,
  AutomationGraph,
  AutomationGraphEdge,
  AutomationGraphPreview,
  AutomationGraphRun,
  AutomationGraphTrace,
} from "./automations.types";

export function hasVisibleWebhookEndpoint(automation: Automation) {
  return Boolean(automation.webhook?.webhook_url || automation.webhook?.webhook_path);
}

export function describeRuntime(automation: Automation) {
  if (automation.execution_mode === "graph") {
    if (automation.status === "deleted") {
      return { className: "badge--failed", label: "deleted" };
    }
    if (automation.status === "paused") {
      return { className: "badge--review", label: "paused" };
    }
    return {
      className: automation.webhook?.last_execution_status === "failed" ? "badge--failed" : "badge--accent",
      label: automation.webhook?.last_execution_status === "failed" ? "graph failed" : "graph ready",
    };
  }

  if (automation.trigger_type === "cron") {
    return {
      className: automation.status === "paused" ? "badge--review" : "badge--success",
      label: automation.status === "paused" ? "paused" : "scheduled",
    };
  }

  return {
    className: runtimeStatusBadgeClass(automation.webhook?.last_execution_status || "idle"),
    label: automation.webhook?.last_execution_status || "idle",
  };
}

export function describeActivity(automation: Automation) {
  const activityAt = automation.derived?.last_activity_at || automation.updated_at;
  if (!activityAt) {
    return "No activity recorded yet";
  }
  return exactAndRelative(activityAt).relative;
}

export function describeCardDelivery(automation: Automation) {
  if (automation.trigger_type === "cron" && automation.cron) {
    return `${automation.cron.cron_expr} · ${automation.cron.timezone}`;
  }
  if (automation.webhook?.webhook_url) {
    return "Webhook URL ready";
  }
  if (automation.webhook?.last_execution_status === "failed") {
    return "Webhook endpoint";
  }
  return "Webhook trigger";
}

export function shortSessionLabel(sessionId: string | null | undefined) {
  const normalized = String(sessionId || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 24) {
    return normalized;
  }
  return `${normalized.slice(0, 22)}…`;
}

export function automationStatusBadgeClass(status: string | null | undefined) {
  if (status === "active") {
    return "badge--success";
  }
  if (status === "paused") {
    return "badge--review";
  }
  return "badge--failed";
}

export function executionModeBadgeClass(mode: string | null | undefined) {
  return mode === "graph" ? "badge--accent" : "badge--muted";
}

export function runtimeStatusBadgeClass(status: string | null | undefined) {
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

export function graphRunStatusBadgeClass(status: string | null | undefined) {
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

export function graphNodeStatusBadgeClass(status: string | null | undefined) {
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

export function renderNodeTargets(edges: string[]) {
  if (!edges.length) {
    return "Terminal node";
  }
  return `Routes to ${edges.join(", ")}`;
}

export function getGraphOutgoingTargets(graph: AutomationGraph) {
  const outgoing = new Map<string, string[]>();
  (graph.edges || []).forEach((edge) => {
    const source = String(edge.source_key || "").trim();
    if (!source) {
      return;
    }
    const targetLabel = `${String(edge.target_key || "").trim() || "?"}${
      edge.source_port && edge.source_port !== "default" ? ` (${edge.source_port})` : ""
    }`;
    outgoing.set(source, [...(outgoing.get(source) || []), targetLabel]);
  });
  return outgoing;
}

export function formatDetailValue(value: string | null | undefined) {
  return value || "Unavailable";
}

export function formatTimestamp(value: string | null | undefined) {
  return formatDateTime(value);
}

export function formatAutomationGraphError(preview: AutomationGraphPreview | null | undefined, localError: string) {
  return localError || preview?.graph_error?.reason || "";
}

export function renderGraphEdgeLabel(edge: AutomationGraphEdge) {
  return `${String(edge.source_port || "default")} → ${String(edge.target_port || "default")}`;
}

export function renderGraphRunTimestamp(run: AutomationGraphRun) {
  return formatDateTime(run.started_at);
}

export function renderGraphRunCompleted(run: AutomationGraphRun) {
  return formatDateTime(run.completed_at);
}

export function hasGraphPreview(preview: AutomationGraphPreview | null | undefined) {
  return Boolean(preview?.graph_available && preview.graph);
}

export function hasWebhookRecoveryWarning(automation: Automation) {
  return (
    automation.trigger_type === "webhook" &&
    !hasVisibleWebhookEndpoint(automation) &&
    automation.webhook?.webhook_endpoint_recoverable === false
  );
}

export function shouldHideMutationActions(automation: Automation) {
  return automation.status === "deleted";
}

export function formatGraphTraceRunStatus(trace: AutomationGraphTrace | null | undefined) {
  return trace?.run?.status || "running";
}
