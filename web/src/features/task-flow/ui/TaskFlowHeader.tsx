import type { TaskFlowProject } from "@/features/task-flow/model/task-flow.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { PageHeader } from "@/shared/ui/PageHeader";

type TaskFlowHeaderProps = {
  flowFilter: string;
  flows: TaskFlowProject[];
  onClearSelection: () => void;
  onCreateTask: () => void;
  onDeleteSelected: () => void;
  onOpenEmployees: () => void;
  onFilterChange: (flowId: string) => void;
  onManageFlows: () => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  createTaskDisabled?: boolean;
  createTaskDisabledReason?: string;
  refreshing: boolean;
  reviewCount: number;
  selectedCount: number;
};

export function TaskFlowHeader({
  flowFilter,
  flows,
  onClearSelection,
  onCreateTask,
  onDeleteSelected,
  onOpenEmployees,
  onFilterChange,
  onManageFlows,
  onOpenReview,
  onOpenSettings,
  onRefresh,
  createTaskDisabled = false,
  createTaskDisabledReason = "",
  refreshing,
  reviewCount,
  selectedCount,
}: TaskFlowHeaderProps) {
  return (
    <PageHeader
      actions={
        <>
          <div className="section-head__filter">
            <select
              aria-label="Filter task board by flow"
              className="select"
              onChange={(event) => onFilterChange(event.target.value)}
              value={flowFilter}
            >
              <option value="">All Flows</option>
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.title}
                </option>
              ))}
            </select>
          </div>
          <AsyncButton
            className="button button--ghost button--compact"
            idleLabel="Refresh"
            loading={refreshing}
            onClick={onRefresh}
            pendingLabel="Refreshing…"
          />
          <button className="button button--ghost button--compact" onClick={onOpenReview} type="button">
            Review <span className="button__count">{reviewCount}</span>
          </button>
          <button className="button button--ghost button--compact" onClick={onOpenEmployees} type="button">
            Employees
          </button>
          <button className="button button--ghost button--compact" onClick={onOpenSettings} type="button">
            Settings
          </button>
          <button className="button button--ghost button--compact" onClick={onManageFlows} type="button">
            Flows
          </button>
          {selectedCount ? (
            <>
              <button className="button button--ghost button--compact" onClick={onClearSelection} type="button">
                Clear
              </button>
              <button className="button button--danger button--compact" onClick={onDeleteSelected} type="button">
                Delete <span className="button__count">{selectedCount}</span>
              </button>
            </>
          ) : null}
          <button
            className="button button--primary"
            disabled={createTaskDisabled}
            onClick={onCreateTask}
            title={createTaskDisabledReason}
            type="button"
          >
            New Task
          </button>
        </>
      }
      actionsClassName="section-actions--dense"
      eyebrow="Workspace / Task Flow"
      title="Task Flow"
    />
  );
}
