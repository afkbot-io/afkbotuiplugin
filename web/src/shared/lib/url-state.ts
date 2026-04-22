export const ROUTES = ["automations", "task-flow", "subagents", "skills", "bootstrap"] as const;

export type RouteId = (typeof ROUTES)[number];

export function normalizeRoute(route: string | null | undefined): RouteId {
  if (!route) {
    return "automations";
  }
  return ROUTES.includes(route as RouteId) ? (route as RouteId) : "automations";
}

export function readUrlState() {
  const url = new URL(window.location.href);
  return {
    route: normalizeRoute(url.searchParams.get("tab")),
    profileId: (url.searchParams.get("profile") || "").trim(),
  };
}

export function updateUrlState(
  patch: {
    route?: string | null;
    profileId?: string | null;
  },
  options: { replace?: boolean } = {},
) {
  const url = new URL(window.location.href);

  if (patch.route !== undefined) {
    url.searchParams.set("tab", normalizeRoute(patch.route));
  }

  if (patch.profileId !== undefined) {
    const normalized = String(patch.profileId || "").trim();
    if (normalized) {
      url.searchParams.set("profile", normalized);
    } else {
      url.searchParams.delete("profile");
    }
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (options.replace) {
    window.history.replaceState({}, "", nextUrl);
    return;
  }
  window.history.pushState({}, "", nextUrl);
}

export function readCurrentUiUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildLoginUrl(nextPath = readCurrentUiUrl()) {
  const url = new URL("/auth/login", window.location.origin);
  const normalized = String(nextPath || "").trim();
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    url.searchParams.set("next", normalized);
  }
  return `${url.pathname}${url.search}`;
}

export function scheduleWindowRedirect(targetUrl: string, delayMs = 40) {
  window.setTimeout(() => {
    window.location.assign(targetUrl);
  }, delayMs);
}
