import { useEffect, useState, type FormEvent } from "react";

import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
import { TaskSessionSummaryCard } from "@/features/task-flow/ui/TaskSessionSummaryCard";
import { TaskFormFields } from "@/features/task-flow/ui/TaskFormFields";
import {
  getRenderedTaskSession,
} from "@/features/task-flow/model/task-flow.presentation";
import {
  TASK_FLOW_AI_PROFILE_TYPE,
  TASK_FLOW_AI_SUBAGENT_TYPE,
  TASK_FLOW_HUMAN_TYPE,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowTaskDetail,
  TaskFlowTaskDraft,
  TaskSessionInsights,
} from "@/features/task-flow/model/task-flow.types";
import { formatDateTime } from "@/shared/lib/time";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type TaskInspectorProps = {
  config: TaskFlowConfig;
  detail: TaskFlowTaskDetail | null;
  detailLoading: boolean;
  draft: TaskFlowTaskDraft;
  error: string;
  onApproveReview: () => void;
  onClose: () => void;
  onDelete: () => void;
  onDraftChange: (draft: TaskFlowTaskDraft) => void;
  onOpenSessionFeed: () => void;
  onRefreshSession: () => void;
  onRequestChanges: (draft: { owner_ref: string; owner_type: string; reason_text: string }) => void;
  onSave: () => void;
  onSubmitComment: (message: string) => void;
  commenting?: boolean;
  profiles: TaskFlowProfile[];
  saving: boolean;
  sessionError: string;
  sessionRefreshing?: boolean;
  sessionInsights: TaskSessionInsights | null;
};

export function TaskInspector({
  config,
  detail,
  detailLoading,
  draft,
  error,
  onApproveReview,
  onClose,
  onDelete,
  onDraftChange,
  onOpenSessionFeed,
  onRefreshSession,
  onRequestChanges,
  onSave,
  onSubmitComment,
  commenting = false,
  profiles,
  saving,
  sessionError,
  sessionRefreshing = false,
  sessionInsights,
}: TaskInspectorProps) {
  const [comment, setComment] = useState("");
  const [reviewDraft, setReviewDraft] = useState({
    owner_ref: "",
    owner_type: "",
    reason_text: "",
  });

  useEffect(() => {
    setComment("");
    setReviewDraft({
      owner_ref: "",
      owner_type: "",
      reason_text: "",
    });
  }, [detail?.task?.id]);

  if (!detail?.task && !detailLoading) {
    return null;
  }

  if (detailLoading && !detail?.task) {
    return (
      <aside className="task-inspector glass-panel">
        <SurfaceLoader message="Loading task…" />
      </aside>
    );
  }

  const task = detail?.task;
  if (!task) {
    return null;
  }

  const session = getRenderedTaskSession(task, sessionInsights);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comment.trim()) {
      return;
    }
    onSubmitComment(comment);
    setComment("");
  };

  const handleRequestChanges = () => {
    if (!reviewDraft.reason_text.trim()) {
      return;
    }
    onRequestChanges(reviewDraft);
  };

  return (
    <aside className="task-inspector glass-panel">
      <div className="task-inspector__head">
        <div>
          <p className="panel-head__eyebrow">Inspector</p>
          <h3 className="panel-head__title">{task.title}</h3>
        </div>
        <button aria-label="Close task panel" className="icon-button" onClick={onClose} type="button">
          ×
        </button>
      </div>
      <div className="task-inspector__body">
        <form className="editor-form" onSubmit={handleSubmit}>
          <TaskFormFields
            config={config}
            draft={draft}
            onChange={onDraftChange}
            profiles={profiles}
            showBlockedReason
            showStatus
          />
          {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
          <div className="button-row">
            <AsyncButton className="button button--primary" idleLabel="Save Task" loading={saving} pendingLabel="Saving…" type="submit" />
            <button className="button button--danger" disabled={saving} onClick={onDelete} type="button">
              Delete Task
            </button>
          </div>
        </form>

        {session?.session_id ? (
          <section className="detail-section task-session-section">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Session</p>
                <h4 className="panel-head__title">Agent Session</h4>
              </div>
            </div>
            <TaskSessionSummaryCard
              error={sessionError}
              onOpen={onOpenSessionFeed}
              onRefresh={onRefreshSession}
              refreshing={sessionRefreshing}
              sessionInsights={sessionInsights}
              task={task}
            />
          </section>
        ) : null}

        {task.status === "review" ? (
          <section className="detail-section">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Review</p>
                <h4 className="panel-head__title">Review Actions</h4>
              </div>
            </div>
            <label className="field">
              <span className="field__label">Reason</span>
              <textarea
                onChange={(event) => setReviewDraft((current) => ({ ...current, reason_text: event.target.value }))}
                placeholder="Explain what should change…"
                rows={3}
                value={reviewDraft.reason_text}
              />
            </label>
            <div className="field-grid">
              <label className="field field--compact">
                <span className="field__label">Owner Type</span>
                <select
                  onChange={(event) => setReviewDraft((current) => ({ ...current, owner_type: event.target.value }))}
                  value={reviewDraft.owner_type}
                >
                  <option value="">Keep current</option>
                  <option value={TASK_FLOW_AI_PROFILE_TYPE}>AI Profile</option>
                  <option value={TASK_FLOW_AI_SUBAGENT_TYPE}>Subagent</option>
                  <option value={TASK_FLOW_HUMAN_TYPE}>Human</option>
                </select>
              </label>
              <ActorRefField
                allowBlank
                config={config}
                label="Owner Ref"
                name="review_owner_ref"
                onChange={(value) => setReviewDraft((current) => ({ ...current, owner_ref: value }))}
                profiles={profiles}
                typeValue={reviewDraft.owner_type}
                value={reviewDraft.owner_ref}
              />
            </div>
            <div className="button-row">
              <button className="button button--primary" onClick={onApproveReview} type="button">
                Approve
              </button>
              <button className="button button--ghost" onClick={handleRequestChanges} type="button">
                Request Changes
              </button>
            </div>
          </section>
        ) : null}

        <section className="detail-section">
          <div className="panel-head panel-head--compact">
            <div>
              <p className="panel-head__eyebrow">Comments</p>
              <h4 className="panel-head__title">Discussion</h4>
            </div>
          </div>
          <form className="editor-form editor-form--compact" onSubmit={handleCommentSubmit}>
            <label className="field">
              <span className="field__label">Add comment</span>
              <textarea onChange={(event) => setComment(event.target.value)} placeholder="Add context or operator note…" rows={3} value={comment} />
            </label>
            <AsyncButton className="button button--primary" idleLabel="Send Comment" loading={commenting} pendingLabel="Sending…" type="submit" />
          </form>
          <div className="timeline-list">
            {(detail.task_comments || []).length ? (
              detail.task_comments.map((item) => (
                <article className="timeline-item" key={String(item.id || `${item.created_at}-${item.message}`)}>
                  <p>{item.message || ""}</p>
                  <span>{formatDateTime(item.created_at)}</span>
                </article>
              ))
            ) : (
              <p className="muted-copy">No comments yet.</p>
            )}
          </div>
        </section>

        <section className="detail-section">
          <div className="panel-head panel-head--compact">
            <div>
              <p className="panel-head__eyebrow">Runs & Events</p>
              <h4 className="panel-head__title">Recent activity</h4>
            </div>
          </div>
          <div className="timeline-list">
            {(detail.task_events || []).slice(0, 6).length ? (
              detail.task_events.slice(0, 6).map((item) => (
                <article className="timeline-item" key={String(item.id || `${item.created_at}-${item.event_type}`)}>
                  <p>{item.event_type || item.reason || "event"}</p>
                  <span>{formatDateTime(item.created_at)}</span>
                </article>
              ))
            ) : (
              <p className="muted-copy">No events yet.</p>
            )}
          </div>
          <div className="timeline-list">
            {(detail.task_runs || []).slice(0, 4).length ? (
              detail.task_runs.slice(0, 4).map((item) => (
                <article className="timeline-item" key={String(item.id || `${item.created_at}-${item.status}`)}>
                  <p>{item.status || "run"}</p>
                  <span>{formatDateTime(item.created_at || item.started_at)}</span>
                </article>
              ))
            ) : (
              <p className="muted-copy">No runs yet.</p>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
