import {
  formatSessionEventCopy,
  formatSessionEventTimestamp,
  formatSessionEventTitle,
  formatStatusLabel,
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
import { ModalDialog } from "@/shared/ui/ModalDialog";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type TaskSessionModalProps = {
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  open: boolean;
  refreshing: boolean;
  sessionInsights: TaskSessionInsights | null;
  task: TaskFlowTask | null;
};

export function TaskSessionModal({
  error,
  onClose,
  onRefresh,
  open,
  refreshing,
  sessionInsights,
  task,
}: TaskSessionModalProps) {
  if (!open || !task) {
    return null;
  }

  const visibleInsights = getRenderedTaskSessionInsights(task, sessionInsights);
  const session = getRenderedTaskSession(task, sessionInsights);

  if (!session?.session_id) {
    return null;
  }

  const isLive = Boolean(session.dialog_active);
  const turns = visibleInsights?.turns || [];
  const events = visibleInsights?.progress.events || [];

  return (
    <ModalDialog
      className="task-session-modal"
      closeLabel="Close live activity modal"
      description={isLive ? "Live chat transcript and runtime trace for the selected task." : "Recent session history for the selected task."}
      eyebrow="Agent Session"
      onClose={onClose}
      open={open}
      title="Live Activity"
      wide
    >
      <div className="task-session-modal__statusbar">
        <div className="task-session-modal__summary">
          <div className="task-session-card__status">
            <span
              aria-hidden="true"
              className={`task-session-indicator ${isLive ? "" : "task-session-indicator--idle"}`}
            />
            <span className={`badge ${isLive ? "badge--live" : "badge--muted"}`}>
              {isLive ? "dialog active" : "history only"}
            </span>
          </div>
          <p className="task-session-card__code">{session.session_id}</p>
          <div className="task-session-card__meta">
            <span>profile: {session.session_profile_id || task.profile_id || "default"}</span>
            <span>{isLive ? formatTaskSessionCounts(session) : "Auto-refresh is off until you refresh manually."}</span>
            {session.latest_activity_at ? <span>last activity: {formatDateTime(session.latest_activity_at)}</span> : null}
          </div>
        </div>
        <AsyncButton
          className="button button--ghost button--compact"
          idleLabel="Refresh Session"
          loading={refreshing}
          onClick={onRefresh}
          pendingLabel="Refreshing…"
          type="button"
        />
      </div>

      {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}

      {refreshing && !visibleInsights ? (
        <div className="task-session-modal__loader">
          <SurfaceLoader message="Loading live activity…" />
        </div>
      ) : (
        <div className="task-session-modal__layout">
          <section className="task-session-modal__panel">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Conversation</p>
                <h4 className="panel-head__title task-session-feed__title">Latest chat turns</h4>
              </div>
              <span className="badge badge--muted">{turns.length} turns</span>
            </div>
            <div className="task-session-stream task-session-stream--modal">
              {turns.length ? (
                turns.map((turn) => (
                  <article className="session-turn" key={String(turn.id || `${turn.user_message}-${turn.assistant_message}`)}>
                    {turn.user_message ? (
                      <div className="session-bubble session-bubble--user">
                        <span className="session-bubble__label">Prompt</span>
                        <p>{turn.user_message}</p>
                      </div>
                    ) : null}
                    {turn.assistant_message ? (
                      <div className="session-bubble session-bubble--assistant">
                        <span className="session-bubble__label">Assistant</span>
                        <p>{turn.assistant_message}</p>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="muted-copy">
                  {isLive ? "Waiting for the first persisted chat turn…" : "No persisted chat turns for this session."}
                </p>
              )}
            </div>
          </section>

          <section className="task-session-modal__panel">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Runtime</p>
                <h4 className="panel-head__title task-session-feed__title">Live activity</h4>
              </div>
              <span className={`badge ${isLive ? "badge--live" : "badge--muted"}`}>
                {isLive ? "streaming" : "snapshot"}
              </span>
            </div>
            <div className="timeline-list timeline-list--session">
              {events.length ? (
                events.map((event, index) => (
                  <article className="timeline-item timeline-item--session" key={String(event.event_id || `${event.run_id}-${event.event_type}-${index}`)}>
                    <div className="timeline-item__head">
                      <p>{formatSessionEventTitle(event)}</p>
                      {event.stage ? <span className="badge badge--muted">{formatStatusLabel(event.stage)}</span> : null}
                    </div>
                    <p className="timeline-item__copy">{formatSessionEventCopy(event)}</p>
                    <span>
                      {formatSessionEventTimestamp(event)
                        ? formatDateTime(formatSessionEventTimestamp(event))
                        : `run ${event.run_id || "?"} • ${event.event_type || "event"}`}
                    </span>
                  </article>
                ))
              ) : (
                <p className="muted-copy">{isLive ? "Waiting for the next runtime event…" : "No runtime events captured for this session."}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </ModalDialog>
  );
}
