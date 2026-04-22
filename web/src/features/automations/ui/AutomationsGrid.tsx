import { automationStatusBadgeClass, describeActivity, describeRuntime, executionModeBadgeClass, shortSessionLabel } from "@/features/automations/model/automations.presentation";
import type { Automation } from "@/features/automations/model/automations.types";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

function truncateText(value: string, length: number) {
  const normalized = value.trim();
  if (normalized.length <= length) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

type AutomationsGridProps = {
  items: Automation[];
  loading: boolean;
  onOpen: (automationId: number) => void;
  selectedId: number | null;
};

function AutomationCard({
  automation,
  onOpen,
  selected,
}: {
  automation: Automation;
  onOpen: (automationId: number) => void;
  selected: boolean;
}) {
  const runtime = describeRuntime(automation);
  const activity = describeActivity(automation);
  const sessionLabel = automation.webhook?.last_session_id ? shortSessionLabel(automation.webhook.last_session_id) : "";
  const lastError = automation.webhook?.last_error ? truncateText(automation.webhook.last_error, 120) : "";
  const cronExpression = automation.cron?.cron_expr || "Unavailable";

  return (
    <button
      aria-pressed={selected}
      className={`card card--button automation-card${selected ? " card--selected" : ""}`}
      onClick={() => onOpen(automation.id)}
      type="button"
    >
      <div className="automation-card__header">
        <div className="card__title">{automation.name}</div>
        <div className="chip-row">
          <span className={`badge${automation.trigger_type === "cron" ? " badge--ai" : ""}`}>{automation.trigger_type}</span>
          <span className={`badge ${automationStatusBadgeClass(automation.status)}`}>{automation.status}</span>
          <span className={`badge ${executionModeBadgeClass(automation.execution_mode)}`}>{automation.execution_mode}</span>
        </div>
      </div>
      <div className="card__snippet">{truncateText(automation.prompt || "No prompt yet.", 160)}</div>
      {lastError ? <div className="automation-card__error">{lastError}</div> : null}
      <div className="automation-card__insights">
        {automation.trigger_type === "cron" ? (
          <div className="automation-card__meta-stack">
            <p className="automation-card__meta-label">Schedule</p>
            <p className="automation-card__meta-value automation-card__meta-value--mono">{cronExpression}</p>
          </div>
        ) : null}
        <div className="automation-card__activity">
          <p className="automation-card__activity-label">Last activity</p>
          <p className="automation-card__activity-value">{activity}</p>
        </div>
      </div>
      <div className="card__footer automation-card__footer">
        <div className="card__badges">
          <span className={`badge ${runtime.className}`}>{runtime.label}</span>
          {sessionLabel ? <span className="badge badge--muted">{sessionLabel}</span> : null}
          <span className="badge badge--muted">#{automation.id}</span>
        </div>
        {automation.execution_mode === "graph" ? <div className="automation-card__footer-copy">Graph runtime</div> : null}
      </div>
    </button>
  );
}

export function AutomationsGrid({ items, loading, onOpen, selectedId }: AutomationsGridProps) {
  if (!items.length && !loading) {
    return (
      <div className="empty-surface">
        <div className="modal-card">
          <div className="panel-section__title">No Automations</div>
          <p className="muted">Adjust the filters or create a new cron or webhook automation for this profile.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {loading ? <SurfaceLoader message="Loading automations…" title="Loading…" /> : null}
      <div className="automation-grid">
        {items.map((automation) => (
          <AutomationCard
            automation={automation}
            key={automation.id}
            onOpen={onOpen}
            selected={selectedId === automation.id}
          />
        ))}
      </div>
    </>
  );
}
