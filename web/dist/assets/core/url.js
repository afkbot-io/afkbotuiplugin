export const ROUTES = ["automations", "task-flow", "subagents"];

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
