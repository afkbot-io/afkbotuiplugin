import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMethods, authSessionState, routeRenderSpies, scheduleWindowRedirect } = vi.hoisted(() => {
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
        component: createRouteComponent("Automations route", routeRenderSpies.automations),
        id: "automations",
        label: "Automations",
      },
      {
        component: createRouteComponent("Skills route", routeRenderSpies.skills),
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
    window.localStorage.clear();
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

  it("restores the last selected profile when the URL has no profile parameter", async () => {
    window.localStorage.setItem("afkbotui:last-profile-id", "blue");
    window.history.replaceState({}, "", "/plugins/afkbotui?tab=skills");

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("Skills route blue")).toBeInTheDocument();
    await waitFor(() => {
      expect(routeRenderSpies.skills).toHaveBeenCalledWith({ active: true, profileId: "blue" });
    });
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

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("Preparing workspace shell")).toBeInTheDocument();
    expect(screen.queryByText("Skills route blue")).not.toBeInTheDocument();

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

    await screen.findByText("Skills route blue");
  });
});
