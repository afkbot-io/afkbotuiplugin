import { truncate } from "@/features/task-flow/model/task-flow.presentation";
import type { TaskFlowReviewTask } from "@/features/task-flow/model/task-flow.types";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type ReviewQueueModalProps = {
  onCancel: () => void;
  onSelectTask: (taskId: string) => void;
  open: boolean;
  tasks: TaskFlowReviewTask[];
};

export function ReviewQueueModal({ onCancel, onSelectTask, open, tasks }: ReviewQueueModalProps) {
  return (
    <ModalDialog
      closeLabel="Close review queue modal"
      description="Jump into a task from the queue and keep the inspection flow inside the same shell."
      eyebrow="Review Queue"
      onClose={onCancel}
      open={open}
      title="Tasks Waiting on Review"
    >
        <div className="review-list">
          {tasks.length ? (
            tasks.map((task) => (
              <button
                className="review-card review-card--button"
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                type="button"
              >
                <h4>{task.title}</h4>
                <p>{truncate(task.last_comment_message || task.description || "", 120)}</p>
                <span className="badge badge--warning">{task.id}</span>
              </button>
            ))
          ) : (
            <div className="empty-state empty-state--compact">
              <h3>Queue clear</h3>
              <p>No tasks waiting for review.</p>
            </div>
          )}
        </div>
    </ModalDialog>
  );
}
