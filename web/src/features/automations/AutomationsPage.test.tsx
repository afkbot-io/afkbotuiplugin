import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutomationsPage } from "@/features/automations/AutomationsPage";

function buildAutomation(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    profile_id: "default",
    name: "Daily Digest",
    prompt: "Send the daily digest.",
    trigger_type: "cron",
    status: "active",
    execution_mode: "prompt",
    graph_fallback_mode: "disabled",
    cron: {
      cron_expr: "0 9 * * *",
      timezone: "Europe/Moscow",
      next_run_at: "2026-04-22T06:00:00.000Z",
      last_run_at: "2026-04-21T06:00:00.000Z",
    },
    webhook: null,
    derived: {
      last_activity_at: "2026-04-21T10:00:00.000Z",
      has_graph: false,
      needs_attention: false,
    },
    updated_at: "2026-04-21T10:00:00.000Z",
    ...overrides,
  };
}

function buildWebhookEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    recoverable: true,
    webhook_path: "/hooks/digest",
    webhook_token_masked: "hook...gest",
    webhook_url: "https://example.test/hooks/digest",
    ...overrides,
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

function createApi(overrides: Record<string, unknown> = {}) {
  const listAutomation = buildAutomation();
  let detailAutomation = buildAutomation({
    prompt: "Send the full daily digest.",
  });
  let webhookEndpoint = buildWebhookEndpoint();

  return {
    createAutomation: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => {
      const automation = buildAutomation({
        id: 98,
        name: payload.name,
        prompt: payload.prompt,
        trigger_type: payload.trigger_type || "cron",
        cron:
          payload.trigger_type === "cron"
            ? {
                cron_expr: payload.cron_expr,
                timezone: payload.timezone_name,
                next_run_at: "2026-04-22T06:00:00.000Z",
                last_run_at: null,
              }
            : null,
        webhook:
          payload.trigger_type === "webhook"
            ? {
                webhook_endpoint_recoverable: true,
                last_execution_status: "idle",
                webhook_path: null,
                webhook_token_masked: "hook.../new",
                webhook_url: null,
              }
            : null,
      });
      detailAutomation = buildAutomation({
        id: 98,
        name: String(payload.name || ""),
        prompt: String(payload.prompt || ""),
        trigger_type: (payload.trigger_type as string) || "cron",
        cron:
          payload.trigger_type === "cron"
            ? {
                cron_expr: String(payload.cron_expr || ""),
                timezone: String(payload.timezone_name || ""),
                next_run_at: "2026-04-22T06:00:00.000Z",
                last_run_at: null,
              }
            : null,
        webhook:
          payload.trigger_type === "webhook"
            ? {
                webhook_endpoint_recoverable: true,
                last_execution_status: "idle",
                webhook_path: null,
                webhook_token_masked: "hook.../new",
                webhook_url: null,
              }
            : null,
      });
      if (payload.trigger_type === "webhook") {
        webhookEndpoint = buildWebhookEndpoint({
          webhook_path: "/hooks/new",
          webhook_token_masked: "hook.../new",
          webhook_url: "https://example.test/hooks/new",
        });
      }
      return { automation };
    }),
    deleteAutomation: vi.fn(async () => ({ ok: true })),
    getAutomation: vi.fn(async () => ({
      automation: detailAutomation,
    })),
    getAutomationWebhookEndpoint: vi.fn(async () => {
      const detailWebhook = (detailAutomation.webhook || null) as Record<string, unknown> | null;
      return {
        webhook:
          detailAutomation.trigger_type === "webhook"
            ? buildWebhookEndpoint({
                recoverable: (detailWebhook?.webhook_endpoint_recoverable as boolean | null | undefined) ?? webhookEndpoint.recoverable,
                webhook_path: (detailWebhook?.webhook_path as string | null | undefined) || webhookEndpoint.webhook_path,
                webhook_token_masked:
                  (detailWebhook?.webhook_token_masked as string | null | undefined) || webhookEndpoint.webhook_token_masked,
                webhook_url: (detailWebhook?.webhook_url as string | null | undefined) || webhookEndpoint.webhook_url,
              })
            : null,
      };
    }),
    getAutomationGraphPreview: vi.fn(async () => ({
      ai_handoff_present: true,
      automation_id: 11,
      graph: {
        automation_id: 11,
        edges: [
          {
            id: 202,
            source_key: "input",
            source_port: "default",
            target_key: "agent",
            target_port: "default",
          },
        ],
        execution_mode: "graph",
        flow_id: 77,
        graph_fallback_mode: "continue",
        name: "Digest Graph",
        nodes: [
          {
            id: 101,
            key: "input",
            name: "Input",
            node_kind: "deterministic",
            node_type: "input",
            node_version_id: null,
          },
          {
            id: 102,
            key: "agent",
            name: "Agent",
            node_kind: "agent",
            node_type: "subagent",
            node_version_id: 901,
          },
        ],
        status: "published",
        version: 4,
      },
      graph_available: true,
      latest_trace: null,
      recent_runs: [],
      validation: {
        errors: [],
        valid: true,
      },
    })),
    listAutomations: vi.fn(async () => ({
      automations: [listAutomation],
      filtered_count: 1,
      summary: {
        active: 1,
        attention: 0,
        cron: 1,
        deleted: 0,
        paused: 0,
        total: 1,
        webhook: 0,
      },
    })),
    updateAutomation: vi.fn(async (_profileId: string, automationId: number, payload: Record<string, unknown>) => {
      detailAutomation = buildAutomation({
        id: automationId,
        name: payload.name || detailAutomation.name,
        prompt: payload.prompt || detailAutomation.prompt,
        status: payload.status || detailAutomation.status,
        cron:
          payload.cron_expr || payload.timezone_name
            ? {
                cron_expr: payload.cron_expr || detailAutomation.cron.cron_expr,
                timezone: payload.timezone_name || detailAutomation.cron.timezone,
                next_run_at: detailAutomation.cron.next_run_at,
                last_run_at: detailAutomation.cron.last_run_at,
              }
            : detailAutomation.cron,
        webhook: payload.rotate_webhook_token
          ? {
              webhook_endpoint_recoverable: true,
              last_execution_status: "idle",
              webhook_path: null,
              webhook_token_masked: "hook...ated",
              webhook_url: null,
            }
          : detailAutomation.webhook,
      });
      if (payload.rotate_webhook_token) {
        webhookEndpoint = buildWebhookEndpoint({
          webhook_path: "/hooks/rotated",
          webhook_token_masked: "hook...ated",
          webhook_url: "https://example.test/hooks/rotated",
        });
      }
      return { automation: detailAutomation };
    }),
    ...overrides,
  };
}

function renderWithClient(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function renderAutomationsPage(overrides: Record<string, unknown> = {}) {
  const api = createApi(overrides.api as Record<string, unknown> | undefined);
  const notify = vi.fn();
  const updateConfig = vi.fn(async (patch: Record<string, unknown>) => patch);

  const result = renderWithClient(
    <AutomationsPage
      active={Boolean(overrides.active ?? true)}
      api={api}
      config={{
        poll_interval_sec: 2,
      }}
      notify={notify}
      profileId={String(overrides.profileId || "default")}
      profiles={[]}
      updateConfig={updateConfig}
    />,
  );

  return {
    api,
    notify,
    updateConfig,
    ...result,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("AutomationsPage", () => {
  it("renders the grid, applies filters, and resets the inspector on profile change", async () => {
    const api = createApi();
    const notify = vi.fn();
    const updateConfig = vi.fn(async (patch: Record<string, unknown>) => patch);
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <AutomationsPage
          active
          api={api}
          config={{ poll_interval_sec: 2 }}
          notify={notify}
          profileId="default"
          profiles={[]}
          updateConfig={updateConfig}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Automations")).toBeInTheDocument();
    expect(await screen.findByText("Daily Digest")).toBeInTheDocument();
    expect(api.listAutomations).toHaveBeenCalledWith({
      include_deleted: false,
      profile_id: "default",
      q: "",
      status: "",
      trigger_type: "",
    });

    await userEvent.selectOptions(screen.getByLabelText("Filter trigger"), "webhook");
    await waitFor(() => {
      expect(api.listAutomations).toHaveBeenLastCalledWith({
        include_deleted: false,
        profile_id: "default",
        q: "",
        status: "",
        trigger_type: "webhook",
      });
    });

    await userEvent.type(screen.getByLabelText("Search automations"), "digest");
    await userEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    await waitFor(() => {
      expect(api.listAutomations).toHaveBeenLastCalledWith({
        include_deleted: false,
        profile_id: "default",
        q: "digest",
        status: "",
        trigger_type: "webhook",
      });
    });

    await userEvent.click(screen.getByText("Daily Digest"));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={client}>
        <AutomationsPage
          active
          api={api}
          config={{ poll_interval_sec: 2 }}
          notify={notify}
          profileId="blue"
          profiles={[]}
          updateConfig={updateConfig}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(api.listAutomations).toHaveBeenLastCalledWith({
        include_deleted: false,
        profile_id: "blue",
        q: "digest",
        status: "",
        trigger_type: "webhook",
      });
    });
    expect(screen.getByText("Automation Inspector")).toBeInTheDocument();
  });

  it("validates the create modal and pauses a new automation with a follow-up patch", async () => {
    const api = createApi({
      listAutomations: vi.fn(async () => ({
        automations: [],
        filtered_count: 0,
        summary: {
          active: 0,
          attention: 0,
          cron: 0,
          deleted: 0,
          paused: 0,
          total: 0,
          webhook: 0,
        },
      })),
    });
    const notify = vi.fn();

    renderWithClient(
      <AutomationsPage
        active
        api={api}
        config={{ poll_interval_sec: 2 }}
        notify={notify}
        profileId="default"
        profiles={[]}
        updateConfig={vi.fn(async (patch: Record<string, unknown>) => patch)}
      />,
    );

    await screen.findByText("No Automations");
    await userEvent.click(screen.getByRole("button", { name: "New Automation" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Automation" }));
    expect(await screen.findByText("Automation name is required.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name"), "Nightly Digest");
    await userEvent.type(screen.getByLabelText("Prompt"), "Summarize the nightly changes.");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "paused");
    await userEvent.click(screen.getByRole("button", { name: "Create Automation" }));

    await waitFor(() => {
      expect(api.createAutomation).toHaveBeenCalledWith("default", {
        cron_expr: "0 9 * * *",
        name: "Nightly Digest",
        prompt: "Summarize the nightly changes.",
        timezone_name: expect.any(String),
        trigger_type: "cron",
      });
      expect(api.updateAutomation).toHaveBeenCalledWith("default", 98, {
        status: "paused",
      });
    });

    expect(await screen.findByText("Nightly Digest")).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("Automation created.", "success");
  });

  it("keeps deleted automations view-only inside the inspector", async () => {
    const deletedAutomation = buildAutomation({
      execution_mode: "graph",
      status: "deleted",
      trigger_type: "webhook",
      webhook: {
        chat_resume_command: "/resume",
        last_execution_status: "failed",
        webhook_endpoint_recoverable: false,
        webhook_path: "",
        webhook_url: "",
      },
    });
    const api = createApi({
      getAutomation: vi.fn(async () => ({
        automation: deletedAutomation,
      })),
      getAutomationWebhookEndpoint: vi.fn(async () => ({
        webhook: {
          recoverable: false,
          webhook_path: null,
          webhook_token_masked: "[HIDDEN]",
          webhook_url: null,
        },
      })),
      listAutomations: vi.fn(async () => ({
        automations: [deletedAutomation],
        filtered_count: 1,
        summary: {
          active: 0,
          attention: 1,
          cron: 0,
          deleted: 1,
          paused: 0,
          total: 1,
          webhook: 1,
        },
      })),
    });

    renderAutomationsPage({ api });

    await userEvent.click(await screen.findByText("Daily Digest"));
    expect(await screen.findByText(/does not have a recoverable webhook url/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("lazy-loads graph previews and supports manual graph refresh", async () => {
    const graphAutomation = buildAutomation({
      execution_mode: "graph",
      graph_fallback_mode: "continue",
    });
    const api = createApi({
      getAutomation: vi.fn(async () => ({
        automation: graphAutomation,
      })),
      listAutomations: vi.fn(async () => ({
        automations: [graphAutomation],
        filtered_count: 1,
        summary: {
          active: 1,
          attention: 0,
          cron: 1,
          deleted: 0,
          paused: 0,
          total: 1,
          webhook: 0,
        },
      })),
    });

    renderAutomationsPage({ api });

    await userEvent.click(await screen.findByText("Daily Digest"));
    expect(api.getAutomationGraphPreview).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: "View Graph" }));
    await waitFor(() => {
      expect(api.getAutomationGraphPreview).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Digest Graph")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Refresh Graph" }));
    await waitFor(() => {
      expect(api.getAutomationGraphPreview).toHaveBeenCalledTimes(2);
    });
  });

  it("edits an automation and deletes it from the inspector flow", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderAutomationsPage();

    await user.click(await screen.findByText("Daily Digest"));
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const promptField = screen.getByLabelText("Prompt");
    await user.clear(promptField);
    await user.type(promptField, "Send the full digest with rollout notes.");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(api.updateAutomation).toHaveBeenCalledWith(
        "default",
        11,
        expect.objectContaining({
          prompt: "Send the full digest with rollout notes.",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Automation updated.", "success");
    });

    await expect(screen.getByText("Send the full digest with rollout notes.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete Automation" }));

    await waitFor(() => {
      expect(api.deleteAutomation).toHaveBeenCalledWith("default", 11);
      expect(notify).toHaveBeenCalledWith("Automation deleted.", "success");
    });

    expect(screen.getByText("Automation Inspector")).toBeInTheDocument();
  });

  it("rotates webhook urls for webhook automations", async () => {
    const user = userEvent.setup();
    const webhookAutomation = buildAutomation({
      trigger_type: "webhook",
      webhook: {
        chat_resume_command: "/resume",
        last_execution_status: "idle",
        webhook_endpoint_recoverable: true,
        webhook_path: null,
        webhook_token_masked: "hook...gest",
        webhook_url: null,
      },
    });
    let endpointCalls = 0;
    const getAutomationWebhookEndpoint = vi.fn(async () => {
      endpointCalls += 1;
      if (endpointCalls === 1) {
        return { webhook: buildWebhookEndpoint() };
      }
      return {
        webhook: buildWebhookEndpoint({
          webhook_path: "/hooks/rotated",
          webhook_token_masked: "hook...ated",
          webhook_url: "https://example.test/hooks/rotated",
        }),
      };
    });
    const api = createApi({
      getAutomation: vi.fn(async () => ({
        automation: webhookAutomation,
      })),
      getAutomationWebhookEndpoint,
      listAutomations: vi.fn(async () => ({
        automations: [webhookAutomation],
        filtered_count: 1,
        summary: {
          active: 1,
          attention: 0,
          cron: 0,
          deleted: 0,
          paused: 0,
          total: 1,
          webhook: 1,
        },
      })),
    });

    renderAutomationsPage({ api });

    await user.click(await screen.findByText("Daily Digest"));
    expect(await screen.findByText("https://example.test/hooks/digest")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Issue New URL" }));

    await waitFor(() => {
      expect(api.updateAutomation).toHaveBeenCalledWith("default", 11, {
        rotate_webhook_token: true,
      });
    });
    expect(await screen.findByText("https://example.test/hooks/rotated")).toBeInTheDocument();
    expect(getAutomationWebhookEndpoint.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the revealed webhook endpoint stable after first reveal", async () => {
    const user = userEvent.setup();
    const webhookAutomation = buildAutomation({
      trigger_type: "webhook",
      webhook: {
        chat_resume_command: "/resume",
        last_execution_status: "idle",
        webhook_endpoint_recoverable: true,
        webhook_path: null,
        webhook_token_masked: "hook...gest",
        webhook_url: null,
      },
    });
    const getAutomationWebhookEndpoint = vi.fn(async () => ({ webhook: buildWebhookEndpoint() }));
    const api = createApi({
      getAutomation: vi.fn(async () => ({
        automation: webhookAutomation,
      })),
      getAutomationWebhookEndpoint,
      listAutomations: vi.fn(async () => ({
        automations: [webhookAutomation],
        filtered_count: 1,
        summary: {
          active: 1,
          attention: 0,
          cron: 0,
          deleted: 0,
          paused: 0,
          total: 1,
          webhook: 1,
        },
      })),
    });

    renderAutomationsPage({ api });

    await user.click(await screen.findByText("Daily Digest"));
    expect(await screen.findByText("https://example.test/hooks/digest")).toBeInTheDocument();
    expect(getAutomationWebhookEndpoint).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Loading current endpoint...")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })[0]).toBeEnabled();

    await user.click(screen.getAllByLabelText("Close automation panel")[0]);
    await waitFor(() => {
      expect(screen.queryByText("https://example.test/hooks/digest")).not.toBeInTheDocument();
    });
    await user.click(await screen.findByText("Daily Digest"));
    expect(await screen.findByText("https://example.test/hooks/digest")).toBeInTheDocument();
    expect(getAutomationWebhookEndpoint).toHaveBeenCalledTimes(1);
  });

  it("shows pending state while creating an automation and blocks closing actions", async () => {
    const user = userEvent.setup();
    const createRequest = deferred<{ automation: ReturnType<typeof buildAutomation> }>();
    const api = createApi({
      createAutomation: vi.fn(() => createRequest.promise),
      listAutomations: vi.fn(async () => ({
        automations: [],
        filtered_count: 0,
        summary: {
          active: 0,
          attention: 0,
          cron: 0,
          deleted: 0,
          paused: 0,
          total: 0,
          webhook: 0,
        },
      })),
    });

    renderAutomationsPage({ api });

    await screen.findByText("No Automations");
    await user.click(screen.getByRole("button", { name: "New Automation" }));
    await user.type(screen.getByLabelText("Name"), "Pending Run");
    await user.type(screen.getByLabelText("Prompt"), "Hold the request open.");
    await user.click(screen.getByRole("button", { name: "Create Automation" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "New Automation" })).toBeInTheDocument();

    createRequest.resolve({
      automation: buildAutomation({
        id: 501,
        name: "Pending Run",
        prompt: "Hold the request open.",
      }),
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New Automation" })).not.toBeInTheDocument();
    });
  });

  it("pauses polling while inactive, editing, or focusing form fields", async () => {
    vi.useFakeTimers();
    const api = createApi();

    renderAutomationsPage({ api });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getByText("Daily Digest")).toBeInTheDocument();
    expect(api.listAutomations).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(api.listAutomations).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.click(screen.getByText("Daily Digest"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(api.listAutomations).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    const searchInput = screen.getByLabelText("Search automations");
    await act(async () => {
      searchInput.focus();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(api.listAutomations).toHaveBeenCalledTimes(2);

    await act(async () => {
      searchInput.blur();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(api.listAutomations).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("does not poll while inactive or while create/delete modals are open", async () => {
    vi.useFakeTimers();
    const inactiveApi = createApi();

    renderAutomationsPage({
      active: false,
      api: inactiveApi,
    });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(inactiveApi.listAutomations).toHaveBeenCalledTimes(0);

    const activeApi = createApi();
    renderAutomationsPage({ api: activeApi });

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.getAllByText("Daily Digest").length).toBeGreaterThan(0);
    expect(activeApi.listAutomations).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "New Automation" })[1]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(activeApi.listAutomations).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    await act(async () => {
      fireEvent.click(screen.getAllByText("Daily Digest")[0]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(activeApi.listAutomations).toHaveBeenCalledTimes(1);
  }, 10_000);
});
