import { normalizeError } from "@/shared/lib/workspace";

import type {
  Automation,
  AutomationDraft,
  AutomationFilters,
  AutomationGraphPreview,
  AutomationSummary,
  AutomationWebhook,
  AutomationsListResult,
} from "./automations.types";

type AutomationsApi = {
  createAutomation: (profileId: string, payload: Record<string, unknown>) => Promise<{ automation?: Automation }>;
  deleteAutomation: (profileId: string, automationId: number) => Promise<unknown>;
  getAutomation: (automationId: number, profileId: string) => Promise<{ automation?: Automation }>;
  getAutomationWebhookEndpoint: (
    automationId: number,
    profileId: string,
  ) => Promise<{ webhook?: Record<string, unknown> }>;
  getAutomationGraphPreview: (
    automationId: number,
    profileId: string,
    limit?: number,
  ) => Promise<AutomationGraphPreview>;
  listAutomations: (params: Record<string, unknown>) => Promise<{
    automations?: Automation[];
    filtered_count?: number;
    summary?: Partial<AutomationSummary>;
  }>;
  updateAutomation: (
    profileId: string,
    automationId: number,
    payload: Record<string, unknown>,
  ) => Promise<{ automation?: Automation }>;
};

export const defaultAutomationFilters: AutomationFilters = {
  includeDeleted: false,
  query: "",
  status: "",
  triggerType: "",
};

export const defaultAutomationSummary: AutomationSummary = {
  active: 0,
  attention: 0,
  cron: 0,
  deleted: 0,
  paused: 0,
  total: 0,
  webhook: 0,
};

export function buildAutomationDraft(timezoneName: string): AutomationDraft {
  return {
    cron_expr: "0 9 * * *",
    name: "",
    prompt: "",
    status: "active",
    timezone_name: timezoneName,
    trigger_type: "cron",
  };
}

export function draftFromAutomation(automation: Automation, timezoneName: string): AutomationDraft {
  return {
    cron_expr: automation.cron?.cron_expr || "",
    name: automation.name || "",
    prompt: automation.prompt || "",
    status: automation.status === "paused" ? "paused" : "active",
    timezone_name: automation.cron?.timezone || timezoneName,
    trigger_type: automation.trigger_type === "webhook" ? "webhook" : "cron",
  };
}

export function validateAutomationDraft(draft: AutomationDraft) {
  if (!draft.name.trim()) {
    return "Automation name is required.";
  }
  if (!draft.prompt.trim()) {
    return "Automation prompt is required.";
  }
  if (draft.trigger_type === "cron" && !draft.cron_expr.trim()) {
    return "Cron expression is required.";
  }
  if (draft.trigger_type === "cron" && !draft.timezone_name.trim()) {
    return "Timezone is required.";
  }
  return "";
}

function coerceAutomationsApi(api: unknown) {
  return api as AutomationsApi;
}

export async function listAutomations(api: unknown, profileId: string, filters: AutomationFilters): Promise<AutomationsListResult> {
  const payload = await coerceAutomationsApi(api).listAutomations({
    include_deleted: filters.includeDeleted,
    profile_id: profileId,
    q: filters.query,
    status: filters.status,
    trigger_type: filters.triggerType,
  });
  const automations = Array.isArray(payload.automations) ? payload.automations : [];
  return {
    automations,
    filteredCount: Number(payload.filtered_count ?? automations.length),
    summary: {
      ...defaultAutomationSummary,
      ...(payload.summary || {}),
    },
  };
}

export async function getAutomation(api: unknown, profileId: string, automationId: number) {
  const payload = await coerceAutomationsApi(api).getAutomation(automationId, profileId);
  return payload.automation as Automation;
}

export async function getAutomationWebhookEndpoint(api: unknown, profileId: string, automationId: number) {
  const payload = await coerceAutomationsApi(api).getAutomationWebhookEndpoint(automationId, profileId);
  const webhook = payload.webhook || {};
  return {
    webhook_endpoint_recoverable:
      typeof webhook.recoverable === "boolean"
        ? webhook.recoverable
        : (webhook.webhook_endpoint_recoverable as boolean | null | undefined) ?? null,
    webhook_path: (webhook.webhook_path as string | null | undefined) ?? null,
    webhook_token_masked: (webhook.webhook_token_masked as string | null | undefined) ?? null,
    webhook_url: (webhook.webhook_url as string | null | undefined) ?? null,
  } satisfies Partial<AutomationWebhook>;
}

export async function getAutomationGraphPreview(api: unknown, profileId: string, automationId: number) {
  return coerceAutomationsApi(api).getAutomationGraphPreview(automationId, profileId, 6);
}

export async function createAutomation(api: unknown, profileId: string, draft: AutomationDraft) {
  const created = await coerceAutomationsApi(api).createAutomation(profileId, {
    ...(draft.trigger_type === "cron"
      ? {
          cron_expr: draft.cron_expr.trim(),
          timezone_name: draft.timezone_name.trim(),
        }
      : {}),
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    trigger_type: draft.trigger_type,
  });

  let automation = created.automation as Automation;
  if (draft.status === "paused" && automation?.id) {
    const paused = await coerceAutomationsApi(api).updateAutomation(profileId, automation.id, {
      status: "paused",
    });
    automation = paused.automation as Automation;
  }
  return automation;
}

export async function updateAutomation(api: unknown, profileId: string, automationId: number, draft: AutomationDraft) {
  const payload = await coerceAutomationsApi(api).updateAutomation(profileId, automationId, {
    ...(draft.trigger_type === "cron"
      ? {
          cron_expr: draft.cron_expr.trim(),
          timezone_name: draft.timezone_name.trim(),
        }
      : {}),
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    status: draft.status,
  });
  return payload.automation as Automation;
}

export async function rotateAutomationWebhook(api: unknown, profileId: string, automationId: number) {
  const payload = await coerceAutomationsApi(api).updateAutomation(profileId, automationId, {
    rotate_webhook_token: true,
  });
  return payload.automation as Automation;
}

export async function deleteAutomation(api: unknown, profileId: string, automationId: number) {
  await coerceAutomationsApi(api).deleteAutomation(profileId, automationId);
}

export function resolveAutomationError(error: unknown) {
  return normalizeError(error);
}
