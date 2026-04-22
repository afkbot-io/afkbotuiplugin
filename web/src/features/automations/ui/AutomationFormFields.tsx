import type { AutomationDraft } from "@/features/automations/model/automations.types";

type AutomationFormFieldsProps = {
  draft: AutomationDraft;
  onDraftChange: (draft: AutomationDraft) => void;
  triggerDisabled?: boolean;
};

export function AutomationFormFields({
  draft,
  onDraftChange,
  triggerDisabled = false,
}: AutomationFormFieldsProps) {
  return (
    <div className="detail-grid">
      <label className="field field--full">
        <span className="field__label">Name</span>
        <input
          aria-label="Name"
          className="input"
          maxLength={255}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              name: event.target.value,
            })
          }
          type="text"
          value={draft.name}
        />
      </label>
      <label className="field field--full">
        <span className="field__label">Prompt</span>
        <textarea
          aria-label="Prompt"
          className="textarea"
          maxLength={12000}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              prompt: event.target.value,
            })
          }
          placeholder="Describe what this automation should do…"
          rows={8}
          value={draft.prompt}
        />
      </label>
      <label className="field">
        <span className="field__label">Trigger</span>
        <select
          aria-label="Trigger"
          className="select"
          disabled={triggerDisabled}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              cron_expr: event.target.value === "webhook" ? "" : draft.cron_expr || "0 9 * * *",
              timezone_name: event.target.value === "webhook" ? "" : draft.timezone_name,
              trigger_type: event.target.value === "webhook" ? "webhook" : "cron",
            })
          }
          value={draft.trigger_type}
        >
          <option value="cron">Cron</option>
          <option value="webhook">Webhook</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Status</span>
        <select
          aria-label="Status"
          className="select"
          onChange={(event) =>
            onDraftChange({
              ...draft,
              status: event.target.value === "paused" ? "paused" : "active",
            })
          }
          value={draft.status}
        >
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </label>
      {draft.trigger_type === "cron" ? (
        <>
          <label className="field">
            <span className="field__label">Cron</span>
            <input
              aria-label="Cron"
              className="input"
              maxLength={64}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  cron_expr: event.target.value,
                })
              }
              placeholder="0 9 * * *"
              type="text"
              value={draft.cron_expr}
            />
          </label>
          <label className="field">
            <span className="field__label">Timezone</span>
            <input
              aria-label="Timezone"
              className="input"
              maxLength={64}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  timezone_name: event.target.value,
                })
              }
              placeholder="Europe/Moscow…"
              type="text"
              value={draft.timezone_name}
            />
          </label>
        </>
      ) : (
        <div className="field field--full">
          <span className="field__label">Webhook</span>
          <p className="field__hint">The live webhook URL appears in the inspector right after creation.</p>
        </div>
      )}
    </div>
  );
}
