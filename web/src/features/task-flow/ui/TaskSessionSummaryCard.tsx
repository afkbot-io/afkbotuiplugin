import {
  formatTaskSessionCounts,
  getRenderedTaskSessionInsights,
  getRenderedTaskSession,
} from "@/features/task-flow/model/task-flow.presentation";
import type {
  TaskFlowTask,
  TaskSessionInsights,
} from "@/features/task-flow/model/task-flow.types";
import { formatDateTime } from "@/shared/lib/time";
import { AsyncButton } from "@/shared/ui/AsyncButton";

type TaskSessionSummaryCardProps = {
  error: string;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  sessionInsights: TaskSessionInsights | null;
  task: TaskFlowTask;
};

export function TaskSessionSummaryCard({
  error,
  onOpen,
  onRefresh,
  refreshing,
  sessionInsights,
  task,
}: TaskSessionSummaryCardProps) {
  const renderedInsights = getRenderedTaskSessionInsights(task, sessionInsights);
  const renderedSession = getRenderedTaskSession(task, sessionInsights);

  if (!renderedSession?.session_id) {
    return null;
  }

  const isLive = Boolean(renderedSession.dialog_active);
  const latestTurn = renderedInsights?.turns.find(
    (item) => String(item.assistant_message || item.user_message || "").trim(),
  );
  const previewText = String(latestTurn?.assistant_message || latestTurn?.user_message || "").trim();

  return (
    <article className={`task-session-card ${isLive ? "task-session-card--active" : ""}`}>
      <div className="task-session-card__status">
        <span
          aria-hidden="true"
          className={`task-session-indicator ${isLive ? "" : "task-session-indicator--idle"}`}
        />
        <span className={`badge ${isLive ? "badge--live" : "badge--muted"}`}>
          {isLive ? "dialog active" : "session history"}
        </span>
      </div>
      <p className="task-session-card__code">{renderedSession.session_id}</p>
      <div className="task-session-card__meta">
        <span>profile: {renderedSession.session_profile_id || task.profile_id || "default"}</span>
        <span>{isLive ? formatTaskSessionCounts(renderedSession) : "Auto-refresh is paused for history-only sessions."}</span>
        {renderedSession.latest_activity_at ? <span>last activity: {formatDateTime(renderedSession.latest_activity_at)}</span> : null}
      </div>
      {previewText ? <p className="task-session-card__preview">{previewText}</p> : null}
      {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
      <div className="task-session-card__actions">
        <button className="button button--ghost button--tiny" onClick={onOpen} type="button">
          Open Live Activity
        </button>
        <AsyncButton
          className="button button--ghost button--tiny"
          idleLabel="Refresh Session"
          loading={refreshing}
          onClick={onRefresh}
          pendingLabel="Refreshing…"
          type="button"
        />
      </div>
    </article>
  );
}
