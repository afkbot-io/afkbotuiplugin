import { TaskFormFields } from "@/features/task-flow/ui/TaskFormFields";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProject,
  TaskFlowEmployeeOption,
  TaskFlowTaskDraft,
} from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { ModalDialog } from "@/shared/ui/ModalDialog";

type CreateTaskModalProps = {
  busy: boolean;
  config: TaskFlowConfig;
  draft: TaskFlowTaskDraft;
  error: string;
  flows: TaskFlowProject[];
  onCancel: () => void;
  onDraftChange: (draft: TaskFlowTaskDraft) => void;
  onSubmit: () => void;
  open: boolean;
  profileId: string;
  profiles: TaskFlowProfile[];
  employees: TaskFlowEmployeeOption[];
};

export function CreateTaskModal({
  busy,
  config,
  draft,
  error,
  flows,
  onCancel,
  onDraftChange,
  onSubmit,
  open,
  profileId,
  profiles,
  employees,
}: CreateTaskModalProps) {
  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close create task modal"
      eyebrow="Create Task"
      onClose={onCancel}
      onSubmit={onSubmit}
      open={open}
      title="New Backlog Item"
      wide
    >
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <TaskFormFields
          config={config}
          draft={draft}
          flows={flows}
          onChange={onDraftChange}
          profileId={profileId}
          profiles={profiles}
          showFlowField
          employees={employees}
        />
        <div className="button-row">
          <AsyncButton className="button button--primary" idleLabel="Create Task" loading={busy} pendingLabel="Creating…" type="submit" />
          <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
    </ModalDialog>
  );
}
