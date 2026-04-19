export const ROUTES = ["automations", "task-flow", "subagents", "skills", "bootstrap"];

function normalizeRoute(route) {
  return ROUTES.includes(route) ? route : "automations";
}

export function readUrlState() {
  const url = new URL(window.location.href);
  return {
    route: normalizeRoute(url.searchParams.get("tab") || "automations"),
    profileId: (url.searchParams.get("profile") || "").trim(),
  };
}

export function updateUrlState(patch, { replace = false } = {}) {
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
  if (replace) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
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
