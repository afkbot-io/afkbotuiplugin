import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ActorRefField } from "@/features/task-flow/ui/ActorRefField";
import { TaskAttachmentPicker, formatBytes } from "@/features/task-flow/ui/TaskAttachmentPicker";
import { TaskSessionSummaryCard } from "@/features/task-flow/ui/TaskSessionSummaryCard";
import { TaskFormFields } from "@/features/task-flow/ui/TaskFormFields";
import {
  getRenderedTaskSession,
  normalizeInlineText,
  truncate,
} from "@/features/task-flow/model/task-flow.presentation";
import {
  TASK_FLOW_EMPLOYEE_TYPE,
  resolveActorRefForType,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowAttachmentInput,
  TaskFlowProfile,
  TaskFlowEmployeeOption,
  TaskFlowDocument,
  TaskFlowTaskDetail,
  TaskFlowTaskDraft,
  TaskSessionInsights,
} from "@/features/task-flow/model/task-flow.types";
import { formatDateTime } from "@/shared/lib/time";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type TaskInspectorProps = {
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
  onSubmitComment: (message: string, attachments: TaskFlowAttachmentInput[], documentRefs: TaskFlowDocument[]) => Promise<boolean> | boolean;
  commenting?: boolean;
  getAttachmentHref: (attachmentId: string) => string;
  knowledgePanel?: ReactNode;
  referenceDocuments?: TaskFlowDocument[];
  profileId: string;
  profiles: TaskFlowProfile[];
  saving: boolean;
  sessionError: string;
  sessionRefreshing?: boolean;
  sessionInsights: TaskSessionInsights | null;
  employees: TaskFlowEmployeeOption[];
};

export function TaskInspector({
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
  getAttachmentHref,
  knowledgePanel,
  referenceDocuments = [],
  profileId,
  profiles,
  saving,
  sessionError,
  sessionRefreshing = false,
  sessionInsights,
  employees,
}: TaskInspectorProps) {
  const [comment, setComment] = useState("");
  const [commentAttachments, setCommentAttachments] = useState<TaskFlowAttachmentInput[]>([]);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(() => new Set());
  const [reviewDraft, setReviewDraft] = useState({
    owner_ref: "",
    owner_type: "",
    reason_text: "",
  });
  const editSectionRef = useRef<HTMLFormElement | null>(null);
  const sessionSectionRef = useRef<HTMLElement | null>(null);
  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const attachmentsSectionRef = useRef<HTMLElement | null>(null);
  const docsSectionRef = useRef<HTMLDivElement | null>(null);
  const commentsSectionRef = useRef<HTMLElement | null>(null);
  const activitySectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setComment("");
    setCommentAttachments([]);
    setExpandedCommentIds(new Set());
    setSelectedDocumentIds(new Set());
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
  const reviewActionable = Boolean(task.review_actionable || task.status === "review");
  const selectedDocumentRefs = referenceDocuments.filter((document) => selectedDocumentIds.has(document.id));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comment.trim() && !commentAttachments.length && !selectedDocumentRefs.length) {
      return;
    }
    const submitted = await onSubmitComment(comment, commentAttachments, selectedDocumentRefs);
    if (submitted) {
      setComment("");
      setCommentAttachments([]);
      setSelectedDocumentIds(new Set());
    }
  };

  const handleRequestChanges = () => {
    if (!reviewDraft.reason_text.trim()) {
      return;
    }
    onRequestChanges(reviewDraft);
  };

  const scrollToSection = (sectionRef: { current: HTMLElement | null }) => {
    if (typeof sectionRef.current?.scrollIntoView !== "function") {
      return;
    }
    sectionRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const handleReviewOwnerTypeChange = (ownerType: string) => {
    setReviewDraft((current) => ({
      ...current,
      owner_ref: resolveActorRefForType({
        allowBlank: true,
        currentRef: current.owner_ref,
        previousType: current.owner_type,
        profileId,
        employees,
        type: ownerType,
      }),
      owner_type: ownerType,
    }));
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
        <nav aria-label="Task sections" className="task-inspector__nav">
          <TaskSectionNavButton label="Edit" shortLabel="E" onClick={() => scrollToSection(editSectionRef)} />
          <TaskSectionNavButton disabled={!session?.session_id} label="Session" shortLabel="S" onClick={() => scrollToSection(sessionSectionRef)} />
          <TaskSectionNavButton disabled={!reviewActionable} label="Review" shortLabel="R" onClick={() => scrollToSection(reviewSectionRef)} />
          <TaskSectionNavButton label="Files" shortLabel="F" onClick={() => scrollToSection(attachmentsSectionRef)} />
          <TaskSectionNavButton disabled={!knowledgePanel} label="Docs" shortLabel="D" onClick={() => scrollToSection(docsSectionRef)} />
          <TaskSectionNavButton label="Comments" shortLabel="C" onClick={() => scrollToSection(commentsSectionRef)} />
          <TaskSectionNavButton label="Activity" shortLabel="A" onClick={() => scrollToSection(activitySectionRef)} />
        </nav>
        <div className="task-inspector__sections">
          <form className="editor-form" onSubmit={handleSubmit} ref={editSectionRef}>
            <TaskFormFields
              attachmentLabel="Add files on save"
              draft={draft}
              onChange={onDraftChange}
              profileId={profileId}
              profiles={profiles}
              showBlockedReason
              showStatus
              employees={employees}
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
            <section className="detail-section task-session-section" ref={sessionSectionRef}>
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="panel-head__eyebrow">Session</p>
                  <h4 className="panel-head__title">Employee Session</h4>
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

          {reviewActionable ? (
            <section className="detail-section" ref={reviewSectionRef}>
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
                  onChange={(event) => handleReviewOwnerTypeChange(event.target.value)}
                  value={reviewDraft.owner_type}
                >
                  <option value="">Keep current</option>
                  <option value={TASK_FLOW_EMPLOYEE_TYPE}>Employee</option>
                </select>
              </label>
              <ActorRefField
                allowBlank
                label="Owner Ref"
                name="review_owner_ref"
                onChange={(value) => setReviewDraft((current) => ({ ...current, owner_ref: value }))}
                profileId={profileId}
                profiles={profiles}
                employees={employees}
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

          <section className="detail-section" ref={attachmentsSectionRef}>
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Files</p>
                <h4 className="panel-head__title">Task attachments</h4>
              </div>
            </div>
            {(detail.task_attachments || []).length ? (
              <div className="attachment-list attachment-list--persisted">
                {sortByNewest(detail.task_attachments || [], "created_at").map((attachment) => (
                  <a
                    className="attachment-list__item attachment-list__item--link"
                    href={getAttachmentHref(attachment.id)}
                    key={attachment.id}
                  >
                    <div>
                      <strong>{attachment.name}</strong>
                      <span>{formatBytes(attachment.byte_size || 0)} / {attachment.content_type || attachment.kind || "file"}</span>
                    </div>
                    <span className="badge badge--muted">Download</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted-copy">No files attached yet.</p>
            )}
          </section>

          <div className="task-inspector__anchor" ref={docsSectionRef}>
            {knowledgePanel}
          </div>

          <section className="detail-section" ref={commentsSectionRef}>
          <div className="panel-head panel-head--compact">
            <div>
              <p className="panel-head__eyebrow">Comments</p>
              <h4 className="panel-head__title">Discussion</h4>
            </div>
          </div>
          <div className="timeline-list">
            {sortByNewest(detail.task_comments || [], "created_at").length ? (
              sortByNewest(detail.task_comments || [], "created_at").map((item) => {
                const key = String(item.id || `${item.created_at}-${item.message}`);
                const rawMessage = String(item.message || "");
                const collapsedMessage = truncate(rawMessage, 320);
                const isLong = normalizeInlineText(rawMessage).length > 320 || rawMessage.split(/\r?\n/).length > 8;
                const expanded = expandedCommentIds.has(key);
                return (
                  <article className="timeline-item" key={key}>
                    <p className={expanded ? "timeline-item__copy" : "timeline-item__copy timeline-item__copy--clamped"}>
                      {renderCommentText(expanded || !isLong ? rawMessage : collapsedMessage)}
                    </p>
                    {isLong ? (
                      <button
                        className="button button--ghost button--tiny timeline-item__toggle"
                        onClick={() => {
                          setExpandedCommentIds((current) => {
                            const next = new Set(current);
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          });
                        }}
                        type="button"
                      >
                        {expanded ? "Show less" : "Show full"}
                      </button>
                    ) : null}
                    <span>{formatDateTime(item.created_at)}</span>
                  </article>
                );
              })
            ) : (
              <p className="muted-copy">No comments yet.</p>
            )}
          </div>
          <form className="editor-form editor-form--compact discussion-composer" onSubmit={handleCommentSubmit}>
            <label className="field">
              <span className="field__label">Add comment</span>
              <textarea onChange={(event) => setComment(event.target.value)} placeholder="Add context or operator note…" rows={3} value={comment} />
            </label>
            <TaskAttachmentPicker
              disabled={commenting}
              label="Attach files to comment"
              onChange={setCommentAttachments}
              value={commentAttachments}
            />
            {referenceDocuments.length ? (
              <div className="field reference-picker">
                <span className="field__label">Reference docs</span>
                <div className="reference-picker__grid">
                  {referenceDocuments.map((document) => (
                    <label className="checkbox-row checkbox-row--compact" key={document.id}>
                      <input
                        checked={selectedDocumentIds.has(document.id)}
                        disabled={commenting}
                        onChange={(event) => {
                          setSelectedDocumentIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) {
                              next.add(document.id);
                            } else {
                              next.delete(document.id);
                            }
                            return next;
                          });
                        }}
                        type="checkbox"
                      />
                      <span>{document.title || document.document_key}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <AsyncButton
              className="button button--primary"
              disabled={!comment.trim() && !commentAttachments.length && !selectedDocumentRefs.length}
              idleLabel="Send Comment"
              loading={commenting}
              pendingLabel="Sending…"
              type="submit"
            />
          </form>
          </section>

          <section className="detail-section" ref={activitySectionRef}>
          <div className="panel-head panel-head--compact">
            <div>
              <p className="panel-head__eyebrow">Runs & Events</p>
              <h4 className="panel-head__title">Recent activity</h4>
            </div>
          </div>
          <div className="timeline-list">
            {sortByNewest(detail.task_events || [], "created_at").slice(0, 6).length ? (
              sortByNewest(detail.task_events || [], "created_at").slice(0, 6).map((item) => (
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
            {sortByNewest(detail.task_runs || [], "created_at", "started_at").slice(0, 4).length ? (
              sortByNewest(detail.task_runs || [], "created_at", "started_at").slice(0, 4).map((item) => (
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
      </div>
    </aside>
  );
}

type TaskSectionNavButtonProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  shortLabel: string;
};

function TaskSectionNavButton({ disabled = false, label, onClick, shortLabel }: TaskSectionNavButtonProps) {
  return (
    <button
      aria-label={`Jump to ${label}`}
      className="task-inspector__nav-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {shortLabel}
    </button>
  );
}

function renderCommentText(message: string) {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]\n]{1,160})\]\((#[^)]+|\/v1\/plugins\/afkbotui\/[^)\s]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    const [raw, label, href] = match;
    if (match.index > cursor) {
      nodes.push(message.slice(cursor, match.index));
    }
    nodes.push(
      <a href={href} key={`${href}-${match.index}`}>
        {label}
      </a>,
    );
    cursor = match.index + raw.length;
  }
  if (cursor < message.length) {
    nodes.push(message.slice(cursor));
  }
  return nodes.length ? nodes : message;
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
