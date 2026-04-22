import type { FormEvent } from "react";

import {
  automationStatusBadgeClass,
  describeRuntime,
  executionModeBadgeClass,
  formatDetailValue,
  formatTimestamp,
  hasWebhookRecoveryWarning,
  runtimeStatusBadgeClass,
  shouldHideMutationActions,
  shortSessionLabel,
} from "@/features/automations/model/automations.presentation";
import type { Automation, AutomationDraft, AutomationGraphPreview } from "@/features/automations/model/automations.types";
import { AutomationFormFields } from "@/features/automations/ui/AutomationFormFields";
import { AutomationGraphSection } from "@/features/automations/ui/AutomationGraphSection";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

type AutomationInspectorProps = {
  automation: Automation | null;
  detailLoading: boolean;
  draft: AutomationDraft;
  error: string;
  graphError: string;
  graphLoading: boolean;
  graphOpen: boolean;
  graphPreview: AutomationGraphPreview | null | undefined;
  mode: "view" | "edit";
  onClose: () => void;
  onCopy: (value: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onGraphRefresh: () => void;
  onGraphToggle: () => void;
  onRotateWebhookToken: () => void;
  onSave: () => void;
  onDraftChange: (draft: AutomationDraft) => void;
  onStartDelete: () => void;
  onStopEdit: () => void;
  rotatingToken: boolean;
  saving: boolean;
  webhookEndpointError: string;
  webhookEndpointLoading: boolean;
};

export function AutomationInspector({
  automation,
  detailLoading,
  draft,
  error,
  graphError,
  graphLoading,
  graphOpen,
  graphPreview,
  mode,
  onClose,
  onCopy,
  onDelete,
  onDraftChange,
  onEdit,
  onGraphRefresh,
  onGraphToggle,
  onRotateWebhookToken,
  onSave,
  onStartDelete,
  onStopEdit,
  rotatingToken,
  saving,
  webhookEndpointError,
  webhookEndpointLoading,
}: AutomationInspectorProps) {
  if (!automation && !detailLoading) {
    return (
      <div className="inspector-empty">
        <div className="inspector-empty__card">
          <div className="panel-section__title">Automation Inspector</div>
          <p className="muted">
            Select an automation to inspect details, graph runtime, webhook health, and session handoff without
            reloading the whole workspace.
          </p>
        </div>
      </div>
    );
  }

  if (detailLoading && !automation) {
    return (
      <div className="task-pane">
        <div className="task-pane__shell">
          <SurfaceLoader message="Loading automation…" />
        </div>
      </div>
    );
  }

  if (!automation) {
    return null;
  }

  if (mode === "edit") {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onSave();
    };

    return (
      <div className="task-pane">
        <form className="task-pane__shell" onSubmit={handleSubmit}>
          <div className="task-pane__header">
            <div className="task-pane__heading">
              <div className="task-pane__eyebrow">Edit automation</div>
              <h2 className="task-pane__title">{automation.name || "Automation"}</h2>
            </div>
            <button aria-label="Close automation panel" className="icon-button" onClick={onClose} type="button">
              ×
            </button>
          </div>
          {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
          <AutomationFormFields draft={draft} onDraftChange={onDraftChange} triggerDisabled />
          <div className="button-row">
            <AsyncButton className="button button--primary" idleLabel="Save Changes" loading={saving} pendingLabel="Saving…" type="submit" />
            <button className="button button--ghost" disabled={saving} onClick={onStopEdit} type="button">
              Cancel
            </button>
            <button className="button button--danger" disabled={saving} onClick={onDelete} type="button">
              Delete
            </button>
          </div>
        </form>
      </div>
    );
  }

  const runtime = describeRuntime(automation);
  const hideActions = shouldHideMutationActions(automation);
  const showWebhookRecovery = hasWebhookRecoveryWarning(automation);
  const webhookUrlValue = webhookEndpointLoading ? "Loading current endpoint…" : formatDetailValue(automation.webhook?.webhook_url);

  return (
    <div className="task-pane">
      <div className="task-pane__shell">
        <div className="task-pane__header">
          <div className="task-pane__heading">
            <div className="task-pane__eyebrow">Automation details</div>
            <h2 className="task-pane__title">{automation.name}</h2>
            <div className="chip-row">
              <span className={`badge${automation.trigger_type === "cron" ? " badge--ai" : ""}`}>{automation.trigger_type}</span>
              <span className={`badge ${automationStatusBadgeClass(automation.status)}`}>{automation.status}</span>
              <span className={`badge ${runtime.className}`}>{runtime.label}</span>
              {automation.execution_mode === "graph" ? (
                <span className={`badge ${executionModeBadgeClass(automation.execution_mode)}`}>{automation.execution_mode}</span>
              ) : null}
            </div>
          </div>
          <button aria-label="Close automation panel" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {error ? <div className="inline-alert inline-alert--danger" role="alert">{error}</div> : null}
        <AutomationGraphSection
          automation={automation}
          error={graphError}
          loading={graphLoading}
          onRefresh={onGraphRefresh}
          onToggle={onGraphToggle}
          open={graphOpen}
          preview={graphPreview}
        />
        <section className="panel-section">
          <div className="panel-section__header">
            <div className="panel-section__title">Prompt</div>
          </div>
          <div className="detail-copy">{automation.prompt}</div>
        </section>
        <section className="panel-section">
          <div className="panel-section__header">
            <div className="panel-section__title">{automation.trigger_type === "cron" ? "Schedule" : "Webhook"}</div>
          </div>
          {showWebhookRecovery ? (
            <p className="field__hint">
              This automation does not have a recoverable webhook URL in server storage yet. Rotate the URL only if
              you intentionally want a new endpoint.
            </p>
          ) : automation.trigger_type === "webhook" && webhookEndpointLoading ? (
            <p className="field__hint">Revealing the current operator webhook endpoint…</p>
          ) : null}
          <div className="detail-grid">
            {automation.trigger_type === "cron" ? (
              <>
                <DetailItem label="Cron" value={formatDetailValue(automation.cron?.cron_expr)} />
                <DetailItem label="Next run" value={formatTimestamp(automation.cron?.next_run_at)} />
                <DetailItem label="Last run" value={formatTimestamp(automation.cron?.last_run_at)} />
              </>
            ) : (
              <>
                <CopyDetail
                  full
                  label="Webhook URL"
                  mono
                  onCopy={onCopy}
                  stack
                  value={webhookUrlValue}
                />
                <StatusDetail
                  badgeClass={runtimeStatusBadgeClass(automation.webhook?.last_execution_status || "idle")}
                  label="Last status"
                  value={automation.webhook?.last_execution_status || "idle"}
                />
                <DetailItem label="Last activity" value={formatTimestamp(automation.derived?.last_activity_at)} />
                {automation.webhook?.last_received_at ? (
                  <DetailItem label="Last received" value={formatTimestamp(automation.webhook?.last_received_at)} />
                ) : null}
                {automation.webhook?.chat_resume_command ? (
                  <CopyDetail
                    full
                    label="Resume command"
                    mono
                    onCopy={onCopy}
                    stack
                    value={formatDetailValue(automation.webhook?.chat_resume_command)}
                  />
                ) : null}
              </>
            )}
          </div>
          {automation.trigger_type === "webhook" && webhookEndpointError ? (
            <div className="inline-alert inline-alert--danger" role="alert">{webhookEndpointError}</div>
          ) : null}
          {automation.trigger_type === "webhook" && automation.webhook?.last_error ? (
            <div className="inline-alert inline-alert--danger" role="alert">{automation.webhook.last_error}</div>
          ) : null}
        </section>
        {!hideActions ? (
          <div className="button-row">
            {automation.trigger_type === "webhook" ? (
              <AsyncButton
                className="button button--ghost"
                disabled={saving}
                idleLabel="Issue New URL"
                loading={rotatingToken}
                onClick={onRotateWebhookToken}
                pendingLabel="Issuing…"
              />
            ) : null}
            <button className="button button--primary" onClick={onEdit} type="button">
              Edit
            </button>
            <button className="button button--danger" onClick={onStartDelete} type="button">
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailItem({
  extraClass = "",
  full = false,
  label,
  value,
}: {
  extraClass?: string;
  full?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={`detail-item${full ? " detail-item--full" : ""}`}>
      <p className="detail-item__label">{label}</p>
      <p className={`detail-item__value ${extraClass}`.trim()}>{value}</p>
    </div>
  );
}

function StatusDetail({
  badgeClass,
  label,
  value,
}: {
  badgeClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="detail-item">
      <p className="detail-item__label">{label}</p>
      <div className="badge-row">
        <span className={`badge ${badgeClass}`}>{value}</span>
      </div>
    </div>
  );
}

function CopyDetail({
  full = false,
  label,
  mono = false,
  onCopy,
  stack = false,
  value,
}: {
  full?: boolean;
  label: string;
  mono?: boolean;
  onCopy: (value: string) => void;
  stack?: boolean;
  value: string;
}) {
  const normalizedValue = String(value || "").trim();
  const unavailable = normalizedValue === "Unavailable" || normalizedValue === "Loading current endpoint…";

  return (
    <div className={`detail-item${full ? " detail-item--full" : ""}`}>
      <p className="detail-item__label">{label}</p>
      <div className={`copy-row${stack ? " copy-row--stack" : ""}`}>
        <p className={`detail-item__value${mono ? " detail-item__value--mono" : ""}`}>{value}</p>
        <button
          className="button button--ghost button--compact"
          disabled={unavailable}
          onClick={() => onCopy(normalizedValue)}
          type="button"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
