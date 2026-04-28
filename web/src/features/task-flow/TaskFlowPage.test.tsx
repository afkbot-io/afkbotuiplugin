import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskFlowPage } from "@/features/task-flow/TaskFlowPage";
import type { TaskFlowProject, TaskFlowTask } from "@/features/task-flow/model/task-flow.types";

function buildTask(overrides: Partial<TaskFlowTask> = {}): TaskFlowTask {
  return {
    description: "Improve the planner response quality.",
    due_at: "2026-04-22T10:00:00.000Z",
    flow_id: "flow-alpha",
    id: "task-1",
    labels: ["ops"],
    owner_type: "ai_profile",
    owner_ref: "default",
    priority: 50,
    profile_id: "default",
    prompt: "Improve the planner response quality.",
    requires_review: true,
    reviewer_ref: "",
    reviewer_type: "",
    status: "todo",
    title: "Fix planner output",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

function buildSessionInsights(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task-1",
    session: {
      dialog_active: true,
      latest_activity_at: "2026-04-21T11:00:00.000Z",
      queued_turn_count: 1,
      running_turn_count: 1,
      session_id: "session-1",
      session_profile_id: "default",
      ...(typeof overrides.session === "object" && overrides.session ? (overrides.session as Record<string, unknown>) : {}),
    },
    turns: [
      {
        id: 11,
        profile_id: "default",
        session_id: "session-1",
        user_message: "Please continue the planner cleanup.",
        assistant_message: "I am checking the latest planner output and preparing the next patch.",
      },
    ],
    progress: {
      cursor: {
        last_event_id: 1,
        run_id: 91,
        ...(typeof overrides.progress === "object" &&
        overrides.progress &&
        typeof (overrides.progress as Record<string, unknown>).cursor === "object"
          ? (((overrides.progress as Record<string, unknown>).cursor as Record<string, unknown>) || {})
          : {}),
      },
      events: [
        {
          event_id: 1,
          event_type: "tool.call",
          tool_name: "planner",
          created_at: "2026-04-21T11:00:00.000Z",
          stage: "running",
          payload: {
            summary: "Planner is collecting the current task context.",
          },
        },
        ...(((typeof overrides.progress === "object" &&
          overrides.progress &&
          Array.isArray((overrides.progress as Record<string, unknown>).events)
          ? (overrides.progress as Record<string, unknown>).events
          : []) as Array<Record<string, unknown>>)),
      ],
    },
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

function createApi({
  flowItems,
  sessionInsights,
  taskItems,
}: {
  flowItems?: TaskFlowProject[];
  sessionInsights?: ReturnType<typeof buildSessionInsights>;
  taskItems?: Array<ReturnType<typeof buildTask>>;
} = {}) {
  let flows: TaskFlowProject[] = flowItems || [
    {
      id: "flow-alpha",
      title: "Alpha Project",
      description: "Primary delivery track.",
      default_owner_type: "ai_profile",
      default_owner_ref: "default",
      created_by_type: "human",
      created_by_ref: "web-user",
      labels: ["ops"],
      status: "active",
      updated_at: "2026-04-21T10:00:00.000Z",
    },
  ];
  const initialTasks = taskItems || [
    buildTask(),
    buildTask({
      id: "task-review",
      status: "review",
      title: "Review copy",
      prompt: "Check the final reviewer copy.",
    }),
  ];
  const tasks = new Map<string, ReturnType<typeof buildTask>>(initialTasks.map((taskItem) => [taskItem.id, taskItem]));
  const commentsByTask = new Map<string, Array<{ id: number; created_at: string; message: string }>>([
    [
      "task-1",
      [
        {
          id: 1,
          created_at: "2026-04-21T09:00:00.000Z",
          message: "Initial note.",
        },
      ],
    ],
    ["task-review", []],
  ]);

  return {
    addTaskComment: vi.fn(async (_profileId: string, _taskId: string, payload: Record<string, unknown>) => {
      const currentComments = commentsByTask.get(_taskId) || [];
      commentsByTask.set(_taskId, [
        ...currentComments,
        {
          id: currentComments.length + 1,
          created_at: "2026-04-21T11:00:00.000Z",
          message: String(payload.message || ""),
        },
      ]);
      return { ok: true };
    }),
    approveReviewTask: vi.fn(async (_profileId: string, taskId: string) => {
      const currentTask = tasks.get(taskId);
      if (currentTask) {
        tasks.set(taskId, buildTask({ ...currentTask, status: "completed" }));
      }
      return { ok: true };
    }),
    bulkDeleteTasks: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => ({
      deleted_count: Array.isArray(payload.task_ids) ? payload.task_ids.length : 0,
      deleted_task_ids: Array.isArray(payload.task_ids) ? payload.task_ids.map((item) => String(item)) : [],
      error_count: 0,
      errors: [],
    })),
    bulkUpdateTasks: vi.fn(async () => ({ ok: true })),
    createTask: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => {
      const nextTask = buildTask({
        id: "task-2",
        title: String(payload.title || "New task"),
        description: String(payload.description || payload.prompt || "New prompt"),
        flow_id: String(payload.flow_id || ""),
      });
      tasks.set(nextTask.id, nextTask);
      commentsByTask.set(nextTask.id, []);
      return { task: nextTask };
    }),
    createTaskFlow: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => {
      const nextFlow = {
        id: "flow-beta",
        title: String(payload.title || ""),
        description: String(payload.description || ""),
        default_owner_type: String(payload.default_owner_type || "ai_profile"),
        default_owner_ref: String(payload.default_owner_ref || "default"),
        created_by_type: String(payload.created_by_type || "human"),
        created_by_ref: String(payload.created_by_ref || "web-user"),
        labels: Array.isArray(payload.labels) ? payload.labels.map((label) => String(label)) : [],
        status: "active",
        updated_at: "2026-04-21T12:00:00.000Z",
      } satisfies TaskFlowProject;
      flows = [...flows, nextFlow];
      return { task_flow: nextFlow };
    }),
    deleteTask: vi.fn(async (_profileId: string, taskId: string) => {
      tasks.delete(taskId);
      commentsByTask.delete(taskId);
      return { ok: true };
    }),
    deleteTaskFlow: vi.fn(async (_profileId: string, flowId: string) => {
      flows = flows.filter((flow) => flow.id !== flowId);
      for (const [taskId, taskItem] of tasks.entries()) {
        if (taskItem.flow_id === flowId) {
          tasks.delete(taskId);
          commentsByTask.delete(taskId);
        }
      }
      return { ok: true };
    }),
    getTask: vi.fn(async (_profileId: string, taskId: string) => ({ task: tasks.get(taskId) || null })),
    getTaskBoard: vi.fn(async (_profileId: string, params: Record<string, unknown> = {}) => ({
      board: (() => {
        const flowId = String(params.flow_id || "");
        const filteredTasks = Array.from(tasks.values()).filter((taskItem) => !flowId || taskItem.flow_id === flowId);

        return {
          columns: [
            {
              id: "todo",
              title: "To Do",
              count: filteredTasks.filter((taskItem) => taskItem.status === "todo").length,
              tasks: filteredTasks.filter((taskItem) => taskItem.status === "todo"),
            },
            {
              id: "review",
              title: "Review",
              count: filteredTasks.filter((taskItem) => taskItem.status === "review").length,
              tasks: filteredTasks.filter((taskItem) => taskItem.status === "review"),
            },
          ],
          total_count: filteredTasks.length,
        };
      })(),
    })),
    getTaskSessionInsights: vi.fn(async () => sessionInsights || {
      progress: { cursor: { last_event_id: 0, run_id: null }, events: [] },
      session: null,
      turns: [],
    }),
    listReviewTasks: vi.fn(async (_profileId: string, params: Record<string, unknown> = {}) => ({
      review_tasks: Array.from(tasks.values()).filter((taskItem) => {
        const flowId = String(params.flow_id || "");
        return taskItem.status === "review" && (!flowId || taskItem.flow_id === flowId);
      }),
    })),
    listTaskComments: vi.fn(async (_profileId: string, taskId: string) => ({ task_comments: commentsByTask.get(taskId) || [] })),
    listTaskDependencies: vi.fn(async () => ({ task_dependencies: [] })),
    listTaskEvents: vi.fn(async () => ({ task_events: [] })),
    listTaskFlows: vi.fn(async () => ({ task_flows: flows })),
    listTaskRuns: vi.fn(async () => ({ task_runs: [] })),
    requestReviewChanges: vi.fn(async () => ({ ok: true })),
    updateTask: vi.fn(async (_profileId: string, taskId: string, payload: Record<string, unknown>) => {
      const currentTask = tasks.get(taskId) || buildTask({ id: taskId });
      const nextTask = buildTask({
        ...currentTask,
        description: String(payload.description || payload.prompt || currentTask.description || ""),
        title: String(payload.title || currentTask.title),
      });
      tasks.set(taskId, nextTask);
      return { task: nextTask };
    }),
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

function renderTaskFlowPage({
  active = true,
  api = createApi(),
}: { active?: boolean; api?: ReturnType<typeof createApi> } = {}) {
  const notify = vi.fn();
  const updateConfig = vi.fn(async (patch: Record<string, unknown>) => patch);

  const view = renderWithClient(
    <TaskFlowPage
      active={active}
      api={api}
      config={{
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
      }}
      notify={notify}
      profileId="default"
      profiles={[{ id: "default", title: "Default" }]}
      updateConfig={updateConfig}
    />,
  );

  return { ...view, api, notify, updateConfig };
}

describe("TaskFlowPage", () => {
  it("shows elapsed runtime badges for running tasks with an active session", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-21T11:20:00.000Z").getTime());
    const runningTask = buildTask({
      active_session: {
        dialog_active: true,
        latest_activity_at: "2026-04-21T11:18:00.000Z",
        queued_turn_count: 0,
        running_turn_count: 1,
        session_id: "session-running",
        session_profile_id: "default",
        started_at: "2026-04-21T11:05:00.000Z",
      },
      id: "task-running",
      requires_review: false,
      status: "running",
      title: "Ship runtime fix",
    });
    const api = createApi({
      taskItems: [runningTask],
    });
    api.getTaskBoard = vi.fn(async (_profileId: string) => ({
      board: {
        columns: [
          {
            id: "running",
            title: "Running",
            count: 1,
            tasks: [runningTask],
          },
        ],
        total_count: 1,
      },
    }));

    renderTaskFlowPage({ api });

    const card = (await screen.findByText("Ship runtime fix")).closest(".task-card");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Active")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("15m")).toBeInTheDocument();
    dateNowSpy.mockRestore();
  });

  it("renders the board, opens the inspector, saves the task, and posts a comment", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /fix planner output/i }));
    expect(await screen.findByText("Inspector")).toBeInTheDocument();

    const titleInput = screen.getByDisplayValue("Fix planner output");
    await user.clear(titleInput);
    await user.type(titleInput, "Refine planner output");
    await user.click(screen.getByRole("button", { name: "Save Task" }));

    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Task updated.", "success");
    });

    const commentField = screen.getByPlaceholderText("Add context or operator note…");
    await user.type(commentField, "Follow-up note");
    await user.click(screen.getByRole("button", { name: "Send Comment" }));

    await waitFor(() => {
      expect(api.addTaskComment).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Comment added.", "success");
    });
  });

  it("allows clearing an existing due date from the inspector", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));

    const dueInput = screen.getByLabelText("Due At");
    await user.clear(dueInput);
    await user.click(screen.getByRole("button", { name: "Save Task" }));

    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledWith(
        "default",
        "task-1",
        expect.objectContaining({
          due_at: null,
        }),
      );
      expect(notify).toHaveBeenCalledWith("Task updated.", "success");
    });
  });

  it("filters the board by flow from the header select", async () => {
    const user = userEvent.setup();
    renderTaskFlowPage({
      api: createApi({
        flowItems: [
          {
            id: "flow-alpha",
            title: "Alpha Project",
            description: "Primary delivery track.",
            default_owner_type: "ai_profile",
            default_owner_ref: "default",
            created_by_type: "human",
            created_by_ref: "web-user",
            labels: ["ops"],
            status: "active",
            updated_at: "2026-04-21T10:00:00.000Z",
          },
          {
            id: "flow-beta",
            title: "Beta Project",
            description: "Secondary delivery track.",
            default_owner_type: "human",
            default_owner_ref: "web-user",
            created_by_type: "human",
            created_by_ref: "web-user",
            labels: ["ops"],
            status: "active",
            updated_at: "2026-04-21T10:10:00.000Z",
          },
        ],
      }),
    });

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    expect(screen.getByText("Review copy")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter task board by flow"), "flow-beta");

    await waitFor(() => {
      expect(screen.queryByText("Fix planner output")).not.toBeInTheDocument();
      expect(screen.queryByText("Review copy")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("No tasks").length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText("Filter task board by flow"), "");

    await waitFor(() => {
      expect(screen.getByText("Fix planner output")).toBeInTheDocument();
      expect(screen.getByText("Review copy")).toBeInTheDocument();
    });
  });

  it("opens the flow manager and creates a new flow", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Flows" }));
    expect(await screen.findByText("Flow Library")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Beta Project");
    await user.type(screen.getByLabelText("Description"), "Secondary scope.");
    await user.click(screen.getByRole("button", { name: "Add Flow" }));

    await waitFor(() => {
      expect(api.createTaskFlow).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Flow created.", "success");
    });
  });

  it("keeps flow management open when canceling a delete confirmation", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Flows" }));
    const dialog = await screen.findByRole("dialog", { name: "Flow Library" });

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(within(dialog).getByText("Delete this flow and every task inside it?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("dialog", { name: "Flow Library" })).toBeInTheDocument();
    expect(screen.queryByText("Delete this flow and every task inside it?")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => {
      expect(api.deleteTaskFlow).toHaveBeenCalledWith("default", "flow-alpha");
      expect(notify).toHaveBeenCalledWith("Flow deleted.", "success");
    });
  });

  it("shows pending labels while saving tasks and sending comments", async () => {
    const user = userEvent.setup();
    const saveRequest = deferred<{ task: ReturnType<typeof buildTask> }>();
    const commentRequest = deferred<{ ok: boolean }>();
    const { api } = renderTaskFlowPage();

    api.updateTask.mockImplementationOnce(() => saveRequest.promise);
    api.addTaskComment.mockImplementationOnce(() => commentRequest.promise);

    await screen.findByText("Fix planner output");
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));
    await user.click(screen.getByRole("button", { name: "Save Task" }));

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Task" })).toBeDisabled();

    saveRequest.resolve({
      task: buildTask({
        title: "Fix planner output",
      }),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Task" })).toBeEnabled();
    });

    await user.type(screen.getByPlaceholderText("Add context or operator note…"), "Pending comment");
    await user.click(screen.getByRole("button", { name: "Send Comment" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();

    commentRequest.resolve({ ok: true });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send Comment" })).toBeEnabled();
    });
  });

  it("exposes review queue items as buttons and lets an operator approve a queued task", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Review/i }));

    const dialog = await screen.findByRole("dialog", { name: "Tasks Waiting on Review" });
    const reviewTaskButton = within(dialog).getByRole("button", { name: /Review copy/i });
    await user.click(reviewTaskButton);

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(api.approveReviewTask).toHaveBeenCalledWith(
        "default",
        "task-review",
        expect.objectContaining({
          actor_ref: "web-user",
          actor_type: "human",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Review approved.", "success");
    });
  });

  it("saves task-flow settings through the shared updateConfig contract", async () => {
    const user = userEvent.setup();
    const { notify, updateConfig } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("Task Flow Settings")).toBeInTheDocument();

    const pollInput = screen.getByDisplayValue("5");
    await user.clear(pollInput);
    await user.type(pollInput, "9");
    await user.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() => {
      expect(updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          task_flow_poll_interval_sec: 9,
        }),
      );
      expect(notify).toHaveBeenCalledWith("Task Flow settings saved.", "success");
    });
  });

  it("deletes the visible selection through the bulk delete modal", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /select fix planner output/i }));
    await user.click(screen.getByRole("button", { name: /Delete 1/i }));
    expect(await screen.findByText("Delete 1 selected tasks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Selected" }));

    await waitFor(() => {
      expect(api.bulkDeleteTasks).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith("Deleted 1 tasks.", "success");
    });
  });

  it("opens live activity in a modal chat view instead of rendering the full feed inline", async () => {
    const user = userEvent.setup();
    const api = createApi({
      sessionInsights: buildSessionInsights(),
      taskItems: [
        buildTask({
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T11:00:00.000Z",
            queued_turn_count: 1,
            running_turn_count: 1,
            session_id: "session-1",
            session_profile_id: "default",
          },
          last_session_id: "session-1",
          last_session_profile_id: "default",
        }),
        buildTask({
          id: "task-review",
          status: "review",
          title: "Review copy",
          prompt: "Check the final reviewer copy.",
        }),
      ],
    });

    renderTaskFlowPage({ api });

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));

    expect(screen.getByRole("button", { name: "Open Live Activity" })).toBeInTheDocument();
    expect(screen.queryByText("What the agent is doing")).not.toBeInTheDocument();
    expect(screen.queryByText("Planner is collecting the current task context.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Live Activity" }));

    const dialog = await screen.findByRole("dialog", { name: "Live Activity" });
    expect(within(dialog).getByText("Please continue the planner cleanup.")).toBeInTheDocument();
    expect(within(dialog).getByText("I am checking the latest planner output and preparing the next patch.")).toBeInTheDocument();
    expect(within(dialog).getByText("Calling planner")).toBeInTheDocument();
    expect(within(dialog).getByText("Planner is collecting the current task context.")).toBeInTheDocument();
  });

  it("stops auto-refreshing a task session once the dialog is no longer active", async () => {
    vi.useFakeTimers();

    try {
      const sessionResponses = [
        buildSessionInsights(),
        buildSessionInsights({
          progress: {
            cursor: { last_event_id: 2, run_id: 91 },
            events: [
              {
                event_id: 2,
                event_type: "turn.finalize",
                created_at: "2026-04-21T11:00:04.000Z",
                payload: {
                  summary: "Run finished.",
                },
              },
            ],
          },
          session: {
            dialog_active: false,
            latest_activity_at: "2026-04-21T11:00:04.000Z",
            queued_turn_count: 0,
            running_turn_count: 0,
            session_id: "session-1",
            session_profile_id: "default",
          },
        }),
      ];
      let sessionIndex = 0;
      const api = createApi({
        taskItems: [
          buildTask({
            active_session: {
              dialog_active: true,
              latest_activity_at: "2026-04-21T11:00:00.000Z",
              queued_turn_count: 1,
              running_turn_count: 1,
              session_id: "session-1",
              session_profile_id: "default",
            },
            last_session_id: "session-1",
            last_session_profile_id: "default",
          }),
          buildTask({
            id: "task-review",
            status: "review",
            title: "Review copy",
            prompt: "Check the final reviewer copy.",
          }),
        ],
      });
      api.getTaskSessionInsights.mockImplementation(async () => sessionResponses[Math.min(sessionIndex++, sessionResponses.length - 1)]);

      renderTaskFlowPage({ api });

      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText("Fix planner output")).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /fix planner output/i }));
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByRole("button", { name: "Open Live Activity" })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Open Live Activity" }));
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(api.getTaskSessionInsights).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(api.getTaskSessionInsights).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000);
      });

      expect(api.getTaskSessionInsights).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("keeps live activity isolated when switching tasks during an in-flight session refresh", async () => {
    const user = userEvent.setup();
    const taskOneSession = deferred<ReturnType<typeof buildSessionInsights>>();
    const taskTwoSession = deferred<ReturnType<typeof buildSessionInsights>>();
    const api = createApi({
      taskItems: [
        buildTask({
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T11:00:00.000Z",
            queued_turn_count: 1,
            running_turn_count: 1,
            session_id: "session-1",
            session_profile_id: "default",
          },
          last_session_id: "session-1",
          last_session_profile_id: "default",
        }),
        buildTask({
          id: "task-2",
          title: "Resolve modal race",
          prompt: "Make sure the second session stays isolated.",
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T11:02:00.000Z",
            queued_turn_count: 1,
            running_turn_count: 0,
            session_id: "session-2",
            session_profile_id: "default",
          },
          last_session_id: "session-2",
          last_session_profile_id: "default",
        }),
        buildTask({
          id: "task-review",
          status: "review",
          title: "Review copy",
          prompt: "Check the final reviewer copy.",
        }),
      ],
    });
    api.getTaskSessionInsights.mockImplementation(async (...args: unknown[]) => {
      const taskId = String(args[1] || "");
      if (taskId === "task-1") {
        return taskOneSession.promise;
      }
      if (taskId === "task-2") {
        return taskTwoSession.promise;
      }
      return buildSessionInsights({
        progress: { cursor: { last_event_id: 0, run_id: null }, events: [] },
        session: null,
        turns: [],
      });
    });

    renderTaskFlowPage({ api });

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));
    await user.click(screen.getByRole("button", { name: "Open Live Activity" }));

    expect(await screen.findByRole("dialog", { name: "Live Activity" })).toBeInTheDocument();
    await waitFor(() => {
      expect(api.getTaskSessionInsights).toHaveBeenCalledWith(
        "default",
        "task-1",
        expect.objectContaining({
          history_limit: 5,
          progress_limit: 18,
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Close live activity modal" }));
    await user.click(screen.getByRole("button", { name: "Close task panel" }));

    await user.click(screen.getByRole("button", { name: /resolve modal race/i }));
    await user.click(screen.getByRole("button", { name: "Open Live Activity" }));

    await waitFor(() => {
      expect(api.getTaskSessionInsights).toHaveBeenCalledWith(
        "default",
        "task-2",
        expect.objectContaining({
          history_limit: 5,
          progress_limit: 18,
        }),
      );
    });

    await act(async () => {
      taskTwoSession.resolve(buildSessionInsights({
        progress: {
          cursor: { last_event_id: 3, run_id: 92 },
          events: [
            {
              event_id: 3,
              event_type: "turn.start",
              created_at: "2026-04-21T11:02:01.000Z",
              payload: {
                summary: "Task 2 session is rendering the latest status.",
              },
            },
          ],
        },
        session: {
          dialog_active: true,
          latest_activity_at: "2026-04-21T11:02:01.000Z",
          queued_turn_count: 0,
          running_turn_count: 1,
          session_id: "session-2",
          session_profile_id: "default",
        },
        taskId: "task-2",
        turns: [
          {
            assistant_message: "Task 2 assistant response.",
            id: 21,
            profile_id: "default",
            session_id: "session-2",
            user_message: "Task 2 prompt.",
          },
        ],
      }));
      await Promise.resolve();
    });

    const dialog = await screen.findByRole("dialog", { name: "Live Activity" });
    expect(within(dialog).getByText("Task 2 prompt.")).toBeInTheDocument();
    expect(within(dialog).getByText("Task 2 assistant response.")).toBeInTheDocument();

    await act(async () => {
      taskOneSession.resolve(buildSessionInsights({
        progress: {
          cursor: { last_event_id: 4, run_id: 91 },
          events: [
            {
              event_id: 4,
              event_type: "turn.start",
              created_at: "2026-04-21T11:00:01.000Z",
              payload: {
                summary: "Task 1 should never overwrite the new modal.",
              },
            },
          ],
        },
        taskId: "task-1",
        turns: [
          {
            assistant_message: "Task 1 assistant response.",
            id: 11,
            profile_id: "default",
            session_id: "session-1",
            user_message: "Task 1 prompt.",
          },
        ],
      }));
      await Promise.resolve();
    });

    expect(within(dialog).queryByText("Task 1 prompt.")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Task 1 assistant response.")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Task 2 prompt.")).toBeInTheDocument();
  });

  it("keeps the current live activity loader visible until the current session refresh finishes", async () => {
    const user = userEvent.setup();
    const taskOneSession = deferred<ReturnType<typeof buildSessionInsights>>();
    const taskTwoSession = deferred<ReturnType<typeof buildSessionInsights>>();
    const api = createApi({
      taskItems: [
        buildTask({
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T11:00:00.000Z",
            queued_turn_count: 1,
            running_turn_count: 1,
            session_id: "session-1",
            session_profile_id: "default",
          },
          last_session_id: "session-1",
          last_session_profile_id: "default",
        }),
        buildTask({
          id: "task-2",
          title: "Resolve modal race",
          prompt: "Keep the second refresh isolated.",
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T11:02:00.000Z",
            queued_turn_count: 1,
            running_turn_count: 0,
            session_id: "session-2",
            session_profile_id: "default",
          },
          last_session_id: "session-2",
          last_session_profile_id: "default",
        }),
        buildTask({
          id: "task-review",
          status: "review",
          title: "Review copy",
          prompt: "Check the final reviewer copy.",
        }),
      ],
    });
    api.getTaskSessionInsights.mockImplementation(async (...args: unknown[]) => {
      const taskId = String(args[1] || "");
      if (taskId === "task-1") {
        return taskOneSession.promise;
      }
      if (taskId === "task-2") {
        return taskTwoSession.promise;
      }
      return buildSessionInsights({
        progress: { cursor: { last_event_id: 0, run_id: null }, events: [] },
        session: null,
        turns: [],
      });
    });

    renderTaskFlowPage({ api });

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));
    await user.click(screen.getByRole("button", { name: "Refresh Session" }));

    await waitFor(() => {
      expect(api.getTaskSessionInsights).toHaveBeenCalledWith(
        "default",
        "task-1",
        expect.objectContaining({
          history_limit: 5,
          progress_limit: 18,
        }),
      );
    });

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resolve modal race/i }));
    await user.click(screen.getByRole("button", { name: "Open Live Activity" }));

    const dialog = await screen.findByRole("dialog", { name: "Live Activity" });
    await waitFor(() => {
      expect(api.getTaskSessionInsights).toHaveBeenCalledWith(
        "default",
        "task-2",
        expect.objectContaining({
          history_limit: 5,
          progress_limit: 18,
        }),
      );
    });

    expect(within(dialog).getByText("Loading live activity…")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Refreshing…" })).toBeInTheDocument();

    await act(async () => {
      taskOneSession.resolve(buildSessionInsights({
        progress: {
          cursor: { last_event_id: 7, run_id: 91 },
          events: [
            {
              event_id: 7,
              event_type: "turn.finalize",
              created_at: "2026-04-21T11:00:04.000Z",
              payload: {
                summary: "Task 1 finished first.",
              },
            },
          ],
        },
        taskId: "task-1",
        turns: [
          {
            assistant_message: "Task 1 assistant response.",
            id: 11,
            profile_id: "default",
            session_id: "session-1",
            user_message: "Task 1 prompt.",
          },
        ],
      }));
      await Promise.resolve();
    });

    expect(within(dialog).getByText("Loading live activity…")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Refreshing…" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Task 1 prompt.")).not.toBeInTheDocument();

    await act(async () => {
      taskTwoSession.resolve(buildSessionInsights({
        progress: {
          cursor: { last_event_id: 8, run_id: 92 },
          events: [
            {
              event_id: 8,
              event_type: "turn.start",
              created_at: "2026-04-21T11:02:02.000Z",
              payload: {
                summary: "Task 2 is still refreshing.",
              },
            },
          ],
        },
        session: {
          dialog_active: true,
          latest_activity_at: "2026-04-21T11:02:02.000Z",
          queued_turn_count: 0,
          running_turn_count: 1,
          session_id: "session-2",
          session_profile_id: "default",
        },
        taskId: "task-2",
        turns: [
          {
            assistant_message: "Task 2 assistant response.",
            id: 22,
            profile_id: "default",
            session_id: "session-2",
            user_message: "Task 2 prompt.",
          },
        ],
      }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(within(dialog).queryByText("Loading live activity…")).not.toBeInTheDocument();
    });
    expect(within(dialog).getByText("Task 2 prompt.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Refresh Session" })).toBeInTheDocument();
  });

  it("stays idle while the route is hidden and fetches only after activation", async () => {
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
        <TaskFlowPage
          active={false}
          api={api}
          config={{
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          }}
          notify={notify}
          profileId="default"
          profiles={[{ id: "default", title: "Default" }]}
          updateConfig={updateConfig}
        />
      </QueryClientProvider>,
    );

    expect(api.listTaskFlows).not.toHaveBeenCalled();
    expect(api.getTaskBoard).not.toHaveBeenCalled();
    expect(api.listReviewTasks).not.toHaveBeenCalled();

    view.rerender(
      <QueryClientProvider client={client}>
        <TaskFlowPage
          active
          api={api}
          config={{
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          }}
          notify={notify}
          profileId="default"
          profiles={[{ id: "default", title: "Default" }]}
          updateConfig={updateConfig}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(api.listTaskFlows).toHaveBeenCalled();
      expect(api.getTaskBoard).toHaveBeenCalled();
      expect(api.listReviewTasks).toHaveBeenCalled();
    });
  });
});
