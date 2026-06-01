import type { RouteId } from "./url-state";

export const AUTH_SESSION_REFRESH_MS = 30_000;

export const defaultConfig = {
  poll_interval_sec: 5,
  default_profile_id: "default",
  task_flow_poll_interval_sec: 5,
  task_flow_board_limit_per_column: 20,
  task_flow_actor_type: "human",
  task_flow_actor_ref: "web-user",
};

export const defaultAuthState = {
  mode: "disabled",
  configured: false,
  username: "",
  protected_plugin_ids: [] as string[],
};

export function normalizeConfig(config: Record<string, unknown> | null | undefined) {
  return {
    ...defaultConfig,
    ...(config || {}),
    poll_interval_sec: Number(config?.poll_interval_sec || defaultConfig.poll_interval_sec),
    task_flow_poll_interval_sec: Number(config?.task_flow_poll_interval_sec || defaultConfig.task_flow_poll_interval_sec),
    task_flow_board_limit_per_column: Number(
      config?.task_flow_board_limit_per_column || defaultConfig.task_flow_board_limit_per_column,
    ),
    task_flow_actor_type: String(config?.task_flow_actor_type || defaultConfig.task_flow_actor_type),
    task_flow_actor_ref: String(config?.task_flow_actor_ref || defaultConfig.task_flow_actor_ref),
  };
}

export function normalizeAuthState(auth: Record<string, unknown> | null | undefined) {
  return {
    ...defaultAuthState,
    ...(auth || {}),
    configured: Boolean(auth?.configured),
    protected_plugin_ids: Array.isArray(auth?.protected_plugin_ids) ? auth?.protected_plugin_ids : [],
  };
}

export function resolveProfileId(
  profiles: Array<{ id?: string | null; is_default?: boolean | null }> = [],
  preferredProfileId: string | null | undefined,
) {
  const preferred = String(preferredProfileId || "").trim();
  if (preferred && profiles.some((profile) => profile.id === preferred)) {
    return preferred;
  }
  const defaultProfile = profiles.find((profile) => profile.is_default);
  if (defaultProfile?.id) {
    return defaultProfile.id;
  }
  return profiles[0]?.id || "";
}

export function normalizeError(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Unexpected error.";
}

export function routeLabel(route: RouteId) {
  switch (route) {
    case "task-flow":
      return "Task Flow";
    case "employees":
      return "Employees";
    case "subagents":
      return "Subagents";
    case "skills":
      return "Skills";
    case "bootstrap":
      return "Bootstrap";
    default:
      return "Automations";
  }
}
