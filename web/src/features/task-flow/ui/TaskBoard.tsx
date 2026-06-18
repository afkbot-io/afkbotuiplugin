import type { DragEvent, MouseEvent, RefObject } from "react";

import {
  formatTaskRunningElapsed,
  formatStatusLabel,
  formatTaskOwnerSummary,
  formatTaskPriorityLabel,
  formatTaskPriorityTitle,
  isActiveRuntimeStatus,
  isOverdue,
  statusToneClass,
  taskStatusBadgeClass,
  truncate,
} from "@/features/task-flow/model/task-flow.presentation";
import type { TaskFlowBoard, TaskFlowTask } from "@/features/task-flow/model/task-flow.types";
import { formatDateTime } from "@/shared/lib/time";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type TaskBoardProps = {
  board: TaskFlowBoard | null;
  boardRef: RefObject<HTMLDivElement | null>;
  flowTitleById?: Map<string, string>;
  loading: boolean;
  onBoardMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragStart: (taskId: string) => void;
  onDropStatus: (status: string) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string, checked: boolean) => void;
  selectedTaskId: string;
  selectedTaskIds: Set<string>;
};

const MANAGER_ESCALATION_LABEL = "manager-escalation";
const MANAGER_ESCALATION_SOURCE_TYPE = "manager_escalation";

export function TaskBoard({
  board,
  boardRef,
  flowTitleById = new Map(),
  loading,
  onBoardMouseDown,
  onDragEnd,
  onDragStart,
  onDropStatus,
  onOpenTask,
  onToggleTask,
  selectedTaskId,
  selectedTaskIds,
}: TaskBoardProps) {
  if (loading) {
    return <SurfaceLoader center message="Refreshing Task Flow data." title="Loading…" />;
  }

  if (!board?.columns?.length) {
    return (
      <div className="empty-state">
        <h3>No tasks yet</h3>
        <p>Create a flow and add tasks.</p>
      </div>
    );
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  };

  return (
    <div className="board-viewport" onMouseDown={onBoardMouseDown} ref={boardRef}>
      {board.columns.length > 4 ? (
        <>
          <div aria-hidden="true" className="board-viewport__edge board-viewport__edge--left" />
          <div aria-hidden="true" className="board-viewport__edge board-viewport__edge--right" />
          <div className="board-viewport__hint" role="note">
            Drag or scroll to see all columns
          </div>
        </>
      ) : null}
      <div className="board-grid">
        {board.columns.map((column) => (
          <section
            className={`task-column ${statusToneClass("task-column", column.id)}`}
            data-column-id={column.id}
            key={column.id}
            onDragOver={handleDragOver}
            onDrop={() => onDropStatus(column.id)}
          >
            <header className="task-column__head">
              <h3 className="task-column__title">{column.title}</h3>
              <span className="task-column__count">{column.count}</span>
            </header>
            <div className="task-column__body">
              {(column.tasks || []).length ? (
                column.tasks.map((task) => (
                  <TaskCard
                    flowTitleById={flowTitleById}
                    key={task.id}
                    onDragEnd={onDragEnd}
                    onDragStart={onDragStart}
                    onOpen={onOpenTask}
                    onToggle={onToggleTask}
                    selectedTaskId={selectedTaskId}
                    selectedTaskIds={selectedTaskIds}
                    task={task}
                  />
                ))
              ) : (
                <div className="empty-state empty-state--compact">
                  <h3>No tasks</h3>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TaskCard({
  flowTitleById,
  onDragEnd,
  onDragStart,
  onOpen,
  onToggle,
  selectedTaskId,
  selectedTaskIds,
  task,
}: {
  flowTitleById: Map<string, string>;
  onDragEnd: () => void;
  onDragStart: (taskId: string) => void;
  onOpen: (taskId: string) => void;
  onToggle: (taskId: string, checked: boolean) => void;
  selectedTaskId: string;
  selectedTaskIds: Set<string>;
  task: TaskFlowTask;
}) {
  const isSelected = task.id === selectedTaskId || selectedTaskIds.has(task.id);
  const previewCopy = task.last_comment_message || task.description || "No description yet.";
  const ownerSummary = formatTaskOwnerSummary(task);
  const flowTitle = task.flow_id ? flowTitleById.get(task.flow_id) || task.flow_id : "";
  const activeSession = task.active_session?.dialog_active;
  const runningElapsed = formatTaskRunningElapsed(task);
  const disabled = isActiveRuntimeStatus(task.status);
  const sourceLabel = formatTaskSourceLabel(task.source_type);
  const taskLabels = (task.labels || [])
    .filter((label) => label && (!sourceLabel || label.toLowerCase() !== MANAGER_ESCALATION_LABEL))
    .slice(0, 3);
  const sourceBadgeText = task.source_ref ? `${sourceLabel}: ${task.source_ref}` : sourceLabel;

  return (
    <article
      className={`task-card ${statusToneClass("task-card", task.status)}${isSelected ? " task-card--selected" : ""}`}
      data-task-id={task.id}
      draggable={!disabled}
      onDragEnd={onDragEnd}
      onDragStart={() => onDragStart(task.id)}
    >
      <div className="task-card__head">
        <button className="task-card__open task-card__open--title" onClick={() => onOpen(task.id)} type="button">
          <div className="task-card__title-wrap">
            <h4 className="task-card__title">
              <span>{task.title}</span>
            </h4>
            <div className="task-card__meta-row">
              <p className="task-card__meta">{ownerSummary}</p>
              {activeSession ? <span className="badge badge--live">Active</span> : null}
              {runningElapsed ? <span className="badge badge--running">{runningElapsed}</span> : null}
            </div>
          </div>
        </button>
        <label className="checkbox checkbox--inline task-card__check">
          <input
            aria-label={`Select ${task.title}`}
            checked={selectedTaskIds.has(task.id)}
            disabled={disabled}
            onChange={(event) => onToggle(task.id, event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>
      <button className="task-card__open task-card__open--body" onClick={() => onOpen(task.id)} type="button">
        <p className="task-card__copy">{truncate(previewCopy, 140)}</p>
        <div className="task-card__badges">
          <span className={`badge ${taskStatusBadgeClass(task.status)}`}>{formatStatusLabel(task.status)}</span>
          <span className="badge badge--violet">{task.id}</span>
          <span className="badge badge--accent" title={formatTaskPriorityTitle(task.priority)}>
            {formatTaskPriorityLabel(task.priority)}
          </span>
          {flowTitle ? <span className="badge" title={task.flow_id || undefined}>{flowTitle}</span> : null}
          {sourceLabel ? (
            <span
              aria-label={task.source_ref ? `Manager escalation source task ${task.source_ref}` : sourceLabel}
              className="badge badge--review"
              title={task.source_ref ? `Source task ${task.source_ref}` : undefined}
            >
              {sourceBadgeText}
            </span>
          ) : null}
          {taskLabels.map((label) => (
            <span className="badge badge--muted" key={label}>
              {label}
            </span>
          ))}
          {task.attachment_count ? <span className="badge badge--muted">files {task.attachment_count}</span> : null}
          {task.requires_review ? <span className="badge badge--warning">review</span> : null}
          {task.last_comment_created_at ? <span className="badge badge--muted">{formatDateTime(task.last_comment_created_at)}</span> : null}
          {task.due_at ? (
            <span className={`badge ${isOverdue(task) ? "badge--danger" : ""}`}>{formatDateTime(task.due_at)}</span>
          ) : null}
        </div>
      </button>
    </article>
  );
}

function formatTaskSourceLabel(sourceType?: string | null) {
  if (sourceType === MANAGER_ESCALATION_SOURCE_TYPE) {
    return "manager escalation";
  }
  return "";
}
