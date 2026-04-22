import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMethods, routeRenderSpies, scheduleWindowRedirect } = vi.hoisted(() => {
  const apiMethods = {
    getAuthSession: vi.fn(async () => ({
      auth: {
        configured: true,
        protected_plugin_ids: ["afkbotui"],
      },
      authenticated: true,
      session: {
        username: "tester",
      },
    })),
    getConfig: vi.fn(async () => ({
      config: {
        default_profile_id: "default",
        poll_interval_sec: 5,
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
      },
    })),
    listProfiles: vi.fn(async () => ({
      profiles: [
        { id: "default", title: "Default" },
        { id: "blue", title: "Blue" },
      ],
    })),
    logout: vi.fn(async () => ({ ok: true })),
    updateConfig: vi.fn(async (patch) => ({
      config: {
        default_profile_id: "default",
        poll_interval_sec: 5,
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
        ...patch,
      },
    })),
  };

  return {
    apiMethods,
    routeRenderSpies: {
      automations: vi.fn(),
      skills: vi.fn(),
    },
    scheduleWindowRedirect: vi.fn(),
  };
});

vi.mock("@/app/routes", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function createRouteComponent(
    label: string,
    renderSpy: typeof routeRenderSpies.automations,
  ) {
    return React.forwardRef<{ refresh: () => Promise<void> }, { active: boolean; profileId: string }>(
      function MockRoute({ active, profileId }, _ref) {
        renderSpy({ active, profileId });
        return React.createElement("div", null, `${label} ${profileId}`);
      },
    );
  }

  return {
    routeConfigs: [
      {
        component: createRouteComponent("Automations panel", routeRenderSpies.automations),
        id: "automations",
        label: "Automations",
      },
      {
        component: createRouteComponent("Skills panel", routeRenderSpies.skills),
        id: "skills",
        label: "Skills",
      },
    ],
  };
});

vi.mock("@/shared/api/client", () => ({
  ApiClient: vi.fn().mockImplementation(() => apiMethods),
}));

vi.mock("@/shared/lib/url-state", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/url-state")>("@/shared/lib/url-state");
  return {
    ...actual,
    scheduleWindowRedirect,
  };
});

import { App } from "./App";
import { AppProviders } from "./AppProviders";

describe("App route shell", () => {
  beforeEach(() => {
    document.body.dataset.apiBase = "/v1/plugins/afkbotui";
    document.body.dataset.webBase = "/plugins/afkbotui";
    window.history.replaceState({}, "", "/plugins/afkbotui?tab=skills&profile=blue");
    Object.values(routeRenderSpies).forEach((spy) => spy.mockClear());
    scheduleWindowRedirect.mockReset();
  });

  it("marks the previous route inactive after switching", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("Skills panel blue")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Automations" }));
    expect(await screen.findByText("Automations panel blue")).toBeInTheDocument();

    await waitFor(() => {
      expect(routeRenderSpies.automations).toHaveBeenLastCalledWith({ active: true, profileId: "blue" });
      expect(
        routeRenderSpies.skills.mock.calls.some(([props]) => props.active === false && props.profileId === "blue"),
      ).toBe(true);
    });
  });
});
