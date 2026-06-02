import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROUTES,
  buildLoginUrl,
  normalizeRoute,
  readCurrentUiUrl,
  readUrlState,
  scheduleWindowRedirect,
  updateUrlState,
} from "./url-state";

describe("url-state", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    window.history.replaceState({}, "", "/plugins/afkbotui?tab=task-flow&profile=primary#section");
  });

  it("keeps the route contract aligned with the shipped UI", () => {
    expect(ROUTES).toEqual(["automations", "task-flow", "docs", "employees", "subagents", "skills", "bootstrap"]);
    expect(normalizeRoute("invalid")).toBe("automations");
    expect(normalizeRoute("skills")).toBe("skills");
  });

  it("reads and updates query-driven UI state", () => {
    expect(readUrlState()).toEqual({
      route: "task-flow",
      profileId: "primary",
    });

    updateUrlState({ route: "skills", profileId: "secondary" });

    expect(readUrlState()).toEqual({
      route: "skills",
      profileId: "secondary",
    });
    expect(window.location.search).toContain("tab=skills");
    expect(window.location.search).toContain("profile=secondary");
  });

  it("builds auth redirects with the full current UI URL", () => {
    expect(readCurrentUiUrl()).toBe("/plugins/afkbotui?tab=task-flow&profile=primary#section");
    expect(buildLoginUrl()).toBe(
      "/auth/login?next=%2Fplugins%2Fafkbotui%3Ftab%3Dtask-flow%26profile%3Dprimary%23section",
    );
  });

  it("schedules redirects through window.setTimeout", () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(window, "setTimeout");

    scheduleWindowRedirect("/auth/login?next=%2Fplugins%2Fafkbotui");

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 40);

    timeoutSpy.mockRestore();
  });
});
