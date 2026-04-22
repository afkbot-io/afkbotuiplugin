import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMethods, authSessionState, routeReadySignals, routeRenderSpies, scheduleWindowRedirect } = vi.hoisted(() => {
  const authSessionState = {
    auth: {
      configured: true,
      protected_plugin_ids: ["afkbotui"],
    },
    authenticated: true,
    session: {
      username: "tester",
    },
  };

  const apiMethods = {
    getAuthSession: vi.fn(async () => authSessionState),
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
    authSessionState,
    routeReadySignals: {
      automations: null as null | { promise: Promise<void>; resolve: () => void },
      skills: null as null | { promise: Promise<void>; resolve: () => void },
    },
    routeRenderSpies: {
      automations: vi.fn(),
      skills: vi.fn(),
    },
    scheduleWindowRedirect: vi.fn(),
  };
});

function createAuthenticatedSession() {
  return {
    auth: {
      configured: true,
      protected_plugin_ids: ["afkbotui"],
    },
    authenticated: true,
    session: {
      username: "tester",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

vi.mock("@/app/routes", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function createRouteComponent(
    routeId: "automations" | "skills",
    label: string,
    renderSpy: typeof routeRenderSpies.automations,
  ) {
    return React.forwardRef<{ refresh: () => Promise<void> }, { active: boolean; onReadyChange?: (ready: boolean) => void; profileId: string }>(
      function MockRoute({ active, onReadyChange, profileId }, _ref) {
        renderSpy({ active, profileId });
        const wasActiveRef = React.useRef(false);
        React.useEffect(() => {
          if (!active) {
            wasActiveRef.current = false;
            return;
          }
          if (wasActiveRef.current) {
            return;
          }
          wasActiveRef.current = true;
          onReadyChange?.(false);
          const readySignal = routeReadySignals[routeId];
          if (readySignal) {
            void readySignal.promise.then(() => {
              onReadyChange?.(true);
            });
            return;
          }
          onReadyChange?.(true);
        }, [active, onReadyChange]);
        return React.createElement("div", null, `${label} ${profileId}`);
      },
    );
  }

  return {
    routeConfigs: [
      {
        component: createRouteComponent("automations", "Automations route", routeRenderSpies.automations),
        id: "automations",
        label: "Automations",
      },
      {
        component: createRouteComponent("skills", "Skills route", routeRenderSpies.skills),
        id: "skills",
        label: "Skills",
      },
    ],
  };
});

vi.mock("@/shared/api/client", () => ({
  ApiClient: vi.fn().mockImplementation((_basePath, { onUnauthorized }) => ({
    ...apiMethods,
    onUnauthorized,
  })),
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

describe("App", () => {
  beforeEach(() => {
    document.body.dataset.apiBase = "/v1/plugins/afkbotui";
    document.body.dataset.webBase = "/plugins/afkbotui";
    window.history.replaceState({}, "", "/plugins/afkbotui?tab=skills&profile=blue");
    Object.values(routeRenderSpies).forEach((spy) => spy.mockClear());
    apiMethods.getAuthSession.mockReset();
    apiMethods.getAuthSession.mockImplementation(async () => authSessionState);
    apiMethods.getConfig.mockReset();
    apiMethods.getConfig.mockImplementation(async () => ({
      config: {
        default_profile_id: "default",
        poll_interval_sec: 5,
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
      },
    }));
    apiMethods.listProfiles.mockReset();
    apiMethods.listProfiles.mockImplementation(async () => ({
      profiles: [
        { id: "default", title: "Default" },
        { id: "blue", title: "Blue" },
      ],
    }));
    apiMethods.updateConfig.mockReset();
    apiMethods.updateConfig.mockImplementation(async (patch) => ({
      config: {
        default_profile_id: "default",
        poll_interval_sec: 5,
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
        ...patch,
      },
    }));
    apiMethods.logout.mockReset();
    apiMethods.logout.mockImplementation(async () => ({ ok: true }));
    scheduleWindowRedirect.mockReset();
    routeReadySignals.automations = null;
    routeReadySignals.skills = null;
    authSessionState.authenticated = true;
    authSessionState.session = createAuthenticatedSession().session;
  });

  it("boots the shell and propagates route/profile changes", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await screen.findByText("Signed in as tester", { selector: "#workspace-auth-status" });
    await waitFor(() => {
      expect(apiMethods.getAuthSession).toHaveBeenCalledTimes(1);
      expect(apiMethods.getConfig).toHaveBeenCalledTimes(1);
      expect(apiMethods.listProfiles).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Signed in as tester", { selector: "#workspace-auth-status" })).toBeInTheDocument();
    expect(await screen.findByText("Skills route blue")).toBeInTheDocument();
    await waitFor(() => {
      expect(routeRenderSpies.skills).toHaveBeenCalledWith({ active: true, profileId: "blue" });
    });
    expect(routeRenderSpies.automations).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Select profile"), "default");
    await waitFor(() => {
      expect(routeRenderSpies.skills).toHaveBeenLastCalledWith({ active: true, profileId: "default" });
    });
    expect(window.location.search).toContain("profile=default");

    await user.click(screen.getByRole("link", { name: "Automations" }));
    expect(await screen.findByText("Automations route default")).toBeInTheDocument();
    await waitFor(() => {
      expect(routeRenderSpies.automations).toHaveBeenLastCalledWith({ active: true, profileId: "default" });
      expect(
        routeRenderSpies.skills.mock.calls.some(
          ([props]) => props.active === false && props.profileId === "default",
        ),
      ).toBe(true);
    });
    expect(window.location.search).toContain("tab=automations");
  });

  it("shows the route transition loader immediately when opening another section", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await screen.findByText("Signed in as tester", { selector: "#workspace-auth-status" });
    await user.click(screen.getByRole("link", { name: "Automations" }));

    expect(await screen.findByText("Opening Automations. Holding the current workspace shell while the next section settles.")).toBeInTheDocument();
  });

  it("keeps the route transition loader visible for the minimum route timing window", async () => {
    const user = userEvent.setup();
    let resolveReady!: () => void;
    routeReadySignals.automations = {
      promise: new Promise<void>((resolve) => {
        resolveReady = resolve;
      }),
      resolve: () => resolveReady(),
    };

    const { container } = render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await screen.findByText("Signed in as tester", { selector: "#workspace-auth-status" });
    await user.click(screen.getByRole("link", { name: "Automations" }));

    await waitFor(() => {
      expect(container.querySelector(".route-transition--visible")).not.toBeNull();
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 720));
    });
    expect(container.querySelector(".route-transition--visible")).not.toBeNull();

    await act(async () => {
      routeReadySignals.automations?.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.querySelector(".route-transition--visible")).toBeNull();
    }, { timeout: 2_000 });
  });

  it("shows a danger flash on logout failure and still enters redirect state", async () => {
    const user = userEvent.setup();
    apiMethods.logout.mockRejectedValueOnce(new Error("logout failed"));

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await screen.findByText("Signed in as tester", { selector: "#workspace-auth-status" });
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("logout failed")).toBeInTheDocument();
    expect(screen.getByText("Authentication required. Redirecting to login…")).toBeInTheDocument();
    expect(apiMethods.logout).toHaveBeenCalledTimes(1);
    expect(scheduleWindowRedirect).toHaveBeenCalledTimes(1);
  });

  it("blocks route changes when auth refetch reports an expired session", async () => {
    const user = userEvent.setup();

    apiMethods.getAuthSession
      .mockResolvedValueOnce(createAuthenticatedSession())
      .mockResolvedValueOnce({
        auth: {
          configured: true,
          protected_plugin_ids: ["afkbotui"],
        },
        authenticated: false,
        session: null as unknown as { username: string },
      });

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await screen.findByText("Signed in as tester", { selector: "#workspace-auth-status" });
    await user.click(screen.getByRole("link", { name: "Automations" }));

    await waitFor(() => {
      expect(scheduleWindowRedirect).toHaveBeenCalledTimes(1);
    });
    expect(routeRenderSpies.automations).not.toHaveBeenCalled();
    expect(await screen.findByText("Authentication required. Redirecting to login…")).toBeInTheDocument();
  });

  it("keeps the workspace loader visible until config and profiles resolve", async () => {
    const configRequest = deferred<{
      config: {
        default_profile_id: string;
        poll_interval_sec: number;
        task_flow_actor_ref: string;
        task_flow_actor_type: string;
        task_flow_board_limit_per_column: number;
        task_flow_poll_interval_sec: number;
      };
    }>();
    const profilesRequest = deferred<{ profiles: Array<{ id: string; title: string }> }>();
    apiMethods.getConfig.mockImplementationOnce(() => configRequest.promise);
    apiMethods.listProfiles.mockImplementationOnce(() => profilesRequest.promise);

    const { container } = render(
      <AppProviders>
        <App />
      </AppProviders>,
    );
    const bootPanel = container.querySelector("#workspace-boot");

    expect(screen.getByText("Preparing workspace shell")).toBeInTheDocument();
    expect(screen.queryByText("Skills route blue")).not.toBeInTheDocument();
    expect(container.querySelector(".workspace-loader__mascot")).not.toBeNull();
    expect(bootPanel).not.toHaveAttribute("hidden");

    await act(async () => {
      configRequest.resolve({
        config: {
          default_profile_id: "default",
          poll_interval_sec: 5,
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
      });
      profilesRequest.resolve({
        profiles: [
          { id: "default", title: "Default" },
          { id: "blue", title: "Blue" },
        ],
      });
      await Promise.resolve();
    });
    expect(screen.getByText("Preparing workspace shell")).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });
    expect(bootPanel).not.toHaveAttribute("hidden");

    await waitFor(() => {
      expect(bootPanel).toHaveAttribute("hidden");
    }, { timeout: 2_000 });
    expect(await screen.findByText("Skills route blue")).toBeInTheDocument();
  });
});
