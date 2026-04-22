import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useRouteState } from "./use-route-state";

describe("useRouteState", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/plugins/afkbotui?tab=automations&profile=default");
  });

  it("syncs route and profile state with query params", () => {
    const { result } = renderHook(() => useRouteState());

    expect(result.current.route).toBe("automations");
    expect(result.current.profileId).toBe("default");

    act(() => {
      result.current.setRoute("skills");
    });

    expect(window.location.search).toContain("tab=skills");
    expect(result.current.route).toBe("skills");

    act(() => {
      result.current.setProfile("blue", { replace: true });
    });

    expect(window.location.search).toContain("profile=blue");
    expect(result.current.profileId).toBe("blue");

    window.history.replaceState({}, "", "/plugins/afkbotui?tab=bootstrap&profile=delta");

    act(() => {
      result.current.syncFromWindow();
    });

    expect(result.current.route).toBe("bootstrap");
    expect(result.current.profileId).toBe("delta");
  });
});
