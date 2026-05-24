import {
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
} from "@/features/task-flow/model/task-flow.api";
import type { TaskFlowAgentFeed, TaskFlowSubagent } from "@/features/task-flow/model/task-flow.types";
import { formatStatusLabel, truncate } from "@/features/task-flow/model/task-flow.presentation";
import { formatDateTime } from "@/shared/lib/time";
import { ModalDialog } from "@/shared/ui/ModalDialog";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type AgentFeedModalProps = {
  actorRef: string;
  actorType: string;
  error: string;
  feed: TaskFlowAgentFeed | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelectTask: (taskId: string) => void;
  open: boolean;
  profileId: string;
  subagents: TaskFlowSubagent[];
};

export function AgentFeedModal({
  actorRef,
  actorType,
  error,
  feed,
  loading,
  onClose,
  onRefresh,
  onSelectTask,
  open,
  profileId,
  subagents,
}: AgentFeedModalProps) {
  const teamRole = actorType === TASK_FLOW_AI_PROFILE_TYPE ? "Team Orchestrator" : "Employee";
  const actorLabel = actorType === TASK_FLOW_AI_SUBAGENT_TYPE ? formatSubagentActor(actorRef) : actorRef || profileId;
  const workerPreview = subagents.slice(0, 8);
  const hiddenWorkerCount = Math.max(0, subagents.length - workerPreview.length);

  return (
    <ModalDialog closeLabel="Close agent feed modal" eyebrow="AI Team Queue" onClose={onClose} open={open} title="Team Feed" wide>
      <div className="agent-feed-modal">
        <div className="agent-feed-modal__statusbar">
          <div>
            <p className="panel-head__eyebrow">Selected Actor</p>
            <h4 className="flow-manager__title">{teamRole}: {actorLabel}</h4>
            <p className="muted">
              {feed?.owner_type || "owner"} · {feed?.owner_ref || "unassigned"}
            </p>
            <div className="flow-manager__item-badges">
              <span className="badge badge--muted">{feed?.total_count || 0} tasks</span>
              <span className="badge badge--accent">{feed?.todo_count || 0} todo</span>
              <span className="badge badge--warning">{feed?.blocked_count || 0} blocked</span>
              <span className="badge badge--review">{feed?.review_count || 0} review</span>
              <span className="badge badge--live">{feed?.mention_event_count || 0} mentions</span>
            </div>
          </div>
          <button className="button button--ghost button--compact" onClick={onRefresh} type="button">
            Refresh
          </button>
        </div>
        {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
        {loading && !feed ? (
          <SurfaceLoader message="Loading feed…" />
        ) : (
          <div className="agent-feed-modal__layout">
            <section className="agent-feed-modal__panel">
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="panel-head__eyebrow">Team</p>
                  <h4 className="flow-manager__title">Orchestrator & Employees</h4>
                </div>
              </div>
              <div className="timeline-list timeline-list--session">
                <article className="timeline-item timeline-item--session">
                  <div className="timeline-item__head">
                    <p>{profileId}</p>
                    <span className="badge badge--ai">orchestrator</span>
                  </div>
                  <p className="timeline-item__copy">Owns project docs, decomposition, dependencies, review routing, and flow completion.</p>
                </article>
                {workerPreview.length ? (
                  workerPreview.map((worker) => (
                    <article className="timeline-item timeline-item--session" key={worker.name}>
                      <div className="timeline-item__head">
                        <p>{worker.name}</p>
                        <span className="badge badge--muted">employee</span>
                      </div>
                      <p className="timeline-item__copy">{truncate(worker.summary || worker.path || "Task Flow worker", 140)}</p>
                    </article>
                  ))
                ) : (
                  <p className="muted-copy">No employees configured for this profile.</p>
                )}
                {hiddenWorkerCount ? <p className="muted-copy">+{hiddenWorkerCount} more employees available in owner and reviewer selects.</p> : null}
              </div>
            </section>
            <section className="agent-feed-modal__panel">
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="panel-head__eyebrow">Work Queue</p>
                  <h4 className="flow-manager__title">Assigned tasks</h4>
                </div>
              </div>
              <div className="timeline-list timeline-list--session">
                {(feed?.tasks || []).length ? (
                  (feed?.tasks || []).map((task) => (
                    <button className="agent-feed-task" key={task.id} onClick={() => onSelectTask(task.id)} type="button">
                      <span className="agent-feed-task__head">
                        <strong>{task.title}</strong>
                        <span className="badge badge--muted">{formatStatusLabel(task.status)}</span>
                      </span>
                      <span>{truncate(task.description, 180)}</span>
                      <span className="muted">{task.flow_id || "No flow"} · {task.id}</span>
                    </button>
                  ))
                ) : (
                  <p className="muted-copy">No assigned tasks in the current feed.</p>
                )}
              </div>
            </section>
            <section className="agent-feed-modal__panel">
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="panel-head__eyebrow">Signals</p>
                  <h4 className="flow-manager__title">Mentions & wake events</h4>
                </div>
              </div>
              <div className="timeline-list timeline-list--session">
                {(feed?.recent_events || []).length ? (
                  (feed?.recent_events || []).map((event) => (
                    <article className="timeline-item timeline-item--session" key={String(event.id || `${event.task_id}-${event.event_type}`)}>
                      <div className="timeline-item__head">
                        <p>{event.task_title || event.task_id || "Task event"}</p>
                        <span className="badge badge--muted">{event.event_type || "event"}</span>
                      </div>
                      {event.message ? <p className="timeline-item__copy">{truncate(event.message, 260)}</p> : null}
                      <span>{formatDateTime(event.created_at)}</span>
                    </article>
                  ))
                ) : (
                  <p className="muted-copy">No feed events yet.</p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}

function formatSubagentActor(actorRef: string) {
  const normalized = String(actorRef || "").trim();
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex !== normalized.lastIndexOf(":")) {
    return normalized || "unassigned";
  }
  return `${normalized.slice(separatorIndex + 1)} (${normalized.slice(0, separatorIndex)})`;
}
