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
    owner_type: "employee",
    owner_ref: "cto",
    priority: 50,
    profile_id: "default",
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
  employeeItems,
  taskItems,
}: {
  flowItems?: TaskFlowProject[];
  sessionInsights?: ReturnType<typeof buildSessionInsights>;
  employeeItems?: Array<{
    id?: string;
    is_root?: boolean;
    manager_id?: string | null;
    name: string;
    owner_ref?: string;
    path?: string;
    profile_id?: string;
    role?: string;
    status?: string;
    summary?: string;
    title?: string;
  }>;
  taskItems?: Array<ReturnType<typeof buildTask>>;
} = {}) {
  let flows: TaskFlowProject[] = flowItems || [
    {
      id: "flow-alpha",
      title: "Alpha Project",
      description: "Primary delivery track.",
      default_owner_type: "employee",
      default_owner_ref: "cto",
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
      description: "Check the final reviewer copy.",
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
        {
          id: 2,
          created_at: "2026-04-21T10:00:00.000Z",
          message: "Latest note.",
        },
      ],
    ],
    ["task-review", []],
  ]);
  const documents = new Map<string, Array<Record<string, unknown>>>([
    [
      "flow:flow-alpha",
      [
        {
          body: "Ship a coordinated planner improvement.",
          confirmation_status: "draft",
          document_key: "plan",
          id: "doc-flow-plan",
          revision: 1,
          scope_id: "flow-alpha",
          scope_type: "flow",
          title: "Flow plan",
          updated_at: "2026-04-21T10:00:00.000Z",
        },
        {
          body: "Newer release context.",
          confirmation_status: "draft",
          document_key: "status",
          id: "doc-flow-status",
          revision: 1,
          scope_id: "flow-alpha",
          scope_type: "flow",
          title: "Latest flow status",
          updated_at: "2026-04-21T12:00:00.000Z",
        },
      ],
    ],
    ["task:task-1", []],
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
        description: String(payload.description || "New prompt"),
        flow_id: String(payload.flow_id || ""),
        owner_ref: String(payload.owner_ref || "cto"),
        owner_type: String(payload.owner_type || "employee"),
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
        default_owner_type: String(payload.default_owner_type || ""),
        default_owner_ref: String(payload.default_owner_ref || ""),
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
    updateTaskFlow: vi.fn(async (_profileId: string, flowId: string, payload: Record<string, unknown>) => {
      const currentFlow = flows.find((flow) => flow.id === flowId);
      const nextFlow = {
        ...(currentFlow || {
          created_by_ref: "web-user",
          created_by_type: "human",
          id: flowId,
          status: "active",
        }),
        default_owner_ref: String(payload.default_owner_ref || ""),
        default_owner_type: String(payload.default_owner_type || ""),
        description: String(payload.description || ""),
        labels: Array.isArray(payload.labels) ? payload.labels.map((label) => String(label)) : [],
        title: String(payload.title || currentFlow?.title || flowId),
        updated_at: "2026-04-21T12:10:00.000Z",
      } satisfies TaskFlowProject;
      flows = flows.map((flow) => (flow.id === flowId ? nextFlow : flow));
      return { task_flow: nextFlow };
    }),
    getTask: vi.fn(async (_profileId: string, taskId: string) => ({ task: tasks.get(taskId) || null })),
    getTaskContext: vi.fn(async (_profileId: string, taskId: string) => {
      const task = tasks.get(taskId) || null;
      const flow = task?.flow_id ? flows.find((flowItem) => flowItem.id === task.flow_id) || null : null;
      return {
        context: {
          delegated_tasks: [],
          dependencies: [],
          dependency_tasks: [],
          dependent_tasks: [],
          dependents: [],
          flow,
          flow_documents: flow ? documents.get(`flow:${flow.id}`) || [] : [],
          generated_at: "2026-04-21T12:00:00.000Z",
          recent_comments: commentsByTask.get(taskId) || [],
          recent_events: [
            {
              created_at: "2026-04-21T12:00:00.000Z",
              event_type: "wake_requested",
              id: 9,
              task_id: taskId,
            },
          ],
          task,
          task_documents: documents.get(`task:${taskId}`) || [],
        },
      };
    }),
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
        return (taskItem.status === "review" || taskItem.review_actionable) && (!flowId || taskItem.flow_id === flowId);
      }),
    })),
    listTaskFlowEmployees: vi.fn(async () => ({
      employees: employeeItems || [
        {
          id: "cto",
          is_root: true,
          name: "CTO",
          title: "Technical Director",
          role: "cto",
          status: "active",
          owner_ref: "cto",
          path: "default/employees/cto.md",
          profile_id: "default",
          summary: "Owns decomposition",
        },
        {
          id: "researcher",
          manager_id: "cto",
          name: "Researcher",
          title: "Researcher",
          role: "researcher",
          status: "active",
          owner_ref: "researcher",
          path: "default/employees/researcher.md",
          profile_id: "default",
          summary: "Research tasks",
        },
        {
          id: "reviewer",
          manager_id: "cto",
          name: "Reviewer",
          title: "Reviewer",
          role: "reviewer",
          status: "active",
          owner_ref: "reviewer",
          path: "default/employees/reviewer.md",
          profile_id: "default",
          summary: "Review tasks",
        },
      ],
    })),
    listTaskComments: vi.fn(async (_profileId: string, taskId: string) => ({ task_comments: commentsByTask.get(taskId) || [] })),
    listTaskDependencies: vi.fn(async () => ({ task_dependencies: [] })),
    listTaskEvents: vi.fn(async () => ({ task_events: [] })),
    listTaskFlows: vi.fn(async () => ({ task_flows: flows })),
    listTaskFlowDocuments: vi.fn(async (_profileId: string, scopeType: string, scopeId: string) => ({
      task_documents: documents.get(`${scopeType}:${scopeId}`) || [],
    })),
    listTaskRuns: vi.fn(async () => ({ task_runs: [] })),
    putTaskFlowDocument: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => {
      const scopeType = String(payload.scope_type || "task");
      const scopeId = String(payload.scope_id || "");
      const key = `${scopeType}:${scopeId}`;
      const currentDocuments = documents.get(key) || [];
      const existing = currentDocuments.find((document) => document.document_key === payload.document_key);
      const nextDocument = {
        body: String(payload.body || ""),
        confirmation_status: "draft",
        document_key: String(payload.document_key || "plan"),
        id: String(existing?.id || `doc-${scopeType}-${scopeId}-${payload.document_key}`),
        revision: Number(existing?.revision || 0) + 1,
        scope_id: scopeId,
        scope_type: scopeType,
        title: String(payload.title || payload.document_key || "Document"),
        updated_at: "2026-04-21T12:05:00.000Z",
      };
      documents.set(key, [...currentDocuments.filter((document) => document.id !== nextDocument.id), nextDocument]);
      return { task_document: nextDocument };
    }),
    confirmTaskFlowDocument: vi.fn(async (_profileId: string, documentId: string) => {
      for (const [key, currentDocuments] of documents.entries()) {
        const match = currentDocuments.find((document) => document.id === documentId);
        if (match) {
          const nextDocument = {
            ...match,
            confirmation_status: "confirmed",
            confirmed_revision: match.revision,
          };
          documents.set(key, currentDocuments.map((document) => (document.id === documentId ? nextDocument : document)));
          return { task_document: nextDocument };
        }
      }
      return { task_document: null };
    }),
    requestReviewChanges: vi.fn(async () => ({ ok: true })),
    updateTask: vi.fn(async (_profileId: string, taskId: string, payload: Record<string, unknown>) => {
      const currentTask = tasks.get(taskId) || buildTask({ id: taskId });
      const nextTask = buildTask({
        ...currentTask,
        description: String(payload.description || currentTask.description || ""),
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
  config = {},
  navigateToRoute = vi.fn(),
  profiles = [{ id: "default", title: "Default" }],
}: {
  active?: boolean;
  api?: ReturnType<typeof createApi>;
  config?: Record<string, unknown>;
  navigateToRoute?: (routeId: "automations" | "bootstrap" | "docs" | "employees" | "skills" | "subagents" | "task-flow") => void;
  profiles?: Array<{ id?: string | null; is_default?: boolean | null; title?: string | null }>;
} = {}) {
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
        ...config,
      }}
      navigateToRoute={navigateToRoute}
      notify={notify}
      profileId="default"
      profiles={profiles}
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

  it("marks manager escalation tasks with their source task", async () => {
    const escalationTask = buildTask({
      flow_id: "flow-alpha",
      id: "task-escalation",
      labels: ["manager-escalation", "autonomous-routing"],
      source_ref: "task-blocked",
      source_type: "manager_escalation",
      status: "todo",
      title: "Manager escalation for blocked work",
    });

    renderTaskFlowPage({
      api: createApi({
        taskItems: [escalationTask],
      }),
    });

    const card = (await screen.findByText("Manager escalation for blocked work")).closest(".task-card");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Alpha Project")).toHaveAttribute("title", "flow-alpha");
    expect(within(card as HTMLElement).getByText("manager escalation: task-blocked")).toHaveAttribute(
      "aria-label",
      "Manager escalation source task task-blocked",
    );
    expect(within(card as HTMLElement).getByText("autonomous-routing")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("manager-escalation")).not.toBeInTheDocument();
  });

  it("keeps board refresh controls stable during background polling", async () => {
    const api = createApi();

    renderTaskFlowPage({ api });

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.queryByText("Refreshing board…")).not.toBeInTheDocument();
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
    expect(screen.getByRole("navigation", { name: "Task sections" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Jump to Comments" }));
    const commentsSection = screen.getByText("Discussion").closest("section") as HTMLElement;
    expect(within(commentsSection).getAllByText(/note\./i).map((node) => node.textContent)).toEqual([
      "Latest note.",
      "Initial note.",
    ]);

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

  it("shows task context docs and lets an operator save and confirm document revisions", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Fix planner output")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix planner output/i }));

    const knowledgeSection = (await screen.findByText("Context & Docs")).closest("section") as HTMLElement;
    expect(knowledgeSection).not.toBeNull();
    expect(within(knowledgeSection).getByText("Flow plan")).toBeInTheDocument();
    const docsCopy = within(knowledgeSection).getByText("Latest flow status").compareDocumentPosition(within(knowledgeSection).getByText("Flow plan"));
    expect(docsCopy & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(knowledgeSection).getByText("wake_requested")).toBeInTheDocument();

    await user.selectOptions(within(knowledgeSection).getByLabelText("Document"), "handoff");
    await user.clear(within(knowledgeSection).getByLabelText("Title"));
    await user.type(within(knowledgeSection).getByLabelText("Title"), "Task handoff");
    await user.type(within(knowledgeSection).getByLabelText("Body"), "Use the confirmed plan before taking the next task.");
    await user.click(within(knowledgeSection).getByRole("button", { name: "Save Document" }));

    await waitFor(() => {
      expect(api.putTaskFlowDocument).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          document_key: "handoff",
          scope_id: "task-1",
          scope_type: "task",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Document saved.", "success");
    });

    await user.click(within(knowledgeSection).getAllByRole("button", { name: "Confirm" })[0]);

    await waitFor(() => {
      expect(api.confirmTaskFlowDocument).toHaveBeenCalledWith(
        "default",
        "doc-flow-status",
        expect.objectContaining({
          expected_revision: 1,
        }),
      );
      expect(notify).toHaveBeenCalledWith("Document confirmed.", "success");
    });
  });

  it("manages selected flow docs from the flow library", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Flows" }));
    const dialog = await screen.findByRole("dialog", { name: "Flow Library" });

    await user.click(within(dialog).getByRole("button", { name: "Show on Board" }));
    expect(await within(dialog).findByText("Flow plan")).toBeInTheDocument();

    const docsSection = within(dialog).getByText("Flow docs").closest(".flow-manager__docs") as HTMLElement;
    expect(docsSection).not.toBeNull();
    await user.selectOptions(within(docsSection).getByLabelText("Document"), "spec");
    await user.clear(within(docsSection).getByLabelText("Title"));
    await user.type(within(docsSection).getByLabelText("Title"), "Flow spec");
    await user.type(within(docsSection).getByLabelText("Body"), "Agents must use this project specification before delegation.");
    await user.click(within(docsSection).getByRole("button", { name: "Save Flow Doc" }));

    await waitFor(() => {
      expect(api.putTaskFlowDocument).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          document_key: "spec",
          scope_id: "flow-alpha",
          scope_type: "flow",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Flow document saved.", "success");
    });

    await user.click(within(docsSection).getAllByRole("button", { name: "Confirm" })[0]);

    await waitFor(() => {
      expect(api.confirmTaskFlowDocument).toHaveBeenCalledWith(
        "default",
        "doc-flow-plan",
        expect.objectContaining({
          expected_revision: 1,
        }),
      );
      expect(notify).toHaveBeenCalledWith("Flow document confirmed.", "success");
    });
  });

  it("does not expose the employee runtime feed in the public browser UI", async () => {
    renderTaskFlowPage({
      config: {
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
      },
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Employee Feed/i })).not.toBeInTheDocument();
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
            default_owner_type: "employee",
            default_owner_ref: "cto",
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
            default_owner_type: "employee",
            default_owner_ref: "cto",
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

  it("blocks new task creation until a project flow exists", async () => {
    const user = userEvent.setup();
    renderTaskFlowPage({
      api: createApi({
        flowItems: [],
        taskItems: [],
      }),
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    expect(await screen.findByText("Create one project flow before adding Task Flow work.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Task" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Open Flows" }));

    expect(await screen.findByRole("dialog", { name: "Flow Library" })).toBeInTheDocument();
  });

  it("blocks new task creation until the organization chart has one root employee", async () => {
    const user = userEvent.setup();
    const navigateToRoute = vi.fn();

    renderTaskFlowPage({
      api: createApi({
        employeeItems: [
          {
            id: "researcher",
            manager_id: "cto",
            name: "Researcher",
            title: "Researcher",
            role: "researcher",
            status: "active",
            owner_ref: "researcher",
            path: "default/employees/researcher.md",
            profile_id: "default",
            summary: "Research tasks",
          },
        ],
      }),
      navigateToRoute,
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    expect(await screen.findByText("Create one active root employee before adding Task Flow work.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Task" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Open Employees" }));

    expect(navigateToRoute).toHaveBeenCalledWith("employees");
  });

  it("edits an existing flow from the flow manager without changing the flow id", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Flows" }));
    const dialog = await screen.findByRole("dialog", { name: "Flow Library" });
    const flowItem = within(dialog).getByText("Alpha Project").closest(".flow-manager__item") as HTMLElement;

    await user.click(within(flowItem).getByRole("button", { name: "Edit" }));
    await user.clear(within(dialog).getByLabelText("Title"));
    await user.type(within(dialog).getByLabelText("Title"), "Renamed Alpha");
    await user.clear(within(dialog).getByLabelText("Description"));
    await user.type(within(dialog).getByLabelText("Description"), "Updated delivery scope.");
    await user.click(within(dialog).getByRole("button", { name: "Save Flow" }));

    await waitFor(() => {
      expect(api.updateTaskFlow).toHaveBeenCalledWith(
        "default",
        "flow-alpha",
        expect.objectContaining({
          description: "Updated delivery scope.",
          title: "Renamed Alpha",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Flow updated.", "success");
    });
  });

  it("routes new tasks through the root intake employee", async () => {
    const user = userEvent.setup();
    const { api, notify } = renderTaskFlowPage();

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.listTaskFlowEmployees).toHaveBeenCalledWith("default", { q: "" });
    });
    const newTaskButton = screen.getByRole("button", { name: "New Task" });
    await waitFor(() => expect(newTaskButton).toBeEnabled());

    await user.click(newTaskButton);
    const dialog = await screen.findByRole("dialog", { name: "New Backlog Item" });
    expect(within(dialog).getByLabelText("Owner Type")).toHaveValue("Employee");
    expect(within(dialog).getByLabelText("Intake Owner")).toHaveValue("CTO - Technical Director");

    await user.type(within(dialog).getByLabelText("Title"), "Assign employee task");
    await user.type(within(dialog).getByLabelText("Description"), "Route this task to a specialist.");
    await user.click(within(dialog).getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          flow_id: "flow-alpha",
          owner_ref: "cto",
          owner_type: "employee",
        }),
      );
      expect(notify).toHaveBeenCalledWith("Task created.", "success");
    });
  });

  it("uses the custom roster root as the intake employee", async () => {
    const user = userEvent.setup();
    const { api } = renderTaskFlowPage({
      api: createApi({
        employeeItems: [
          {
            id: "backend-engineer",
            is_root: true,
            name: "Backend Engineer",
            title: "Backend Engineer",
            role: "developer",
            status: "active",
            owner_ref: "backend-engineer",
            path: "default/employees/backend-engineer.md",
            profile_id: "default",
            summary: "Backend implementation",
          },
          {
            id: "reviewer",
            manager_id: "backend-engineer",
            name: "Reviewer",
            title: "Reviewer",
            role: "reviewer",
            status: "active",
            owner_ref: "reviewer",
            path: "default/employees/reviewer.md",
            profile_id: "default",
            summary: "Review",
          },
        ],
      }),
      profiles: [
        { id: "default", title: "Default" },
        { id: "analyst", title: "Analyst" },
      ],
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    const newTaskButton = screen.getByRole("button", { name: "New Task" });
    await waitFor(() => expect(newTaskButton).toBeEnabled());
    await user.click(newTaskButton);
    const dialog = await screen.findByRole("dialog", { name: "New Backlog Item" });
    expect(within(dialog).getByLabelText("Intake Owner")).toHaveValue("Backend Engineer - Backend Engineer");

    await user.type(within(dialog).getByLabelText("Title"), "Assign employee");
    await user.type(within(dialog).getByLabelText("Description"), "Route this task to reviewer.");
    await user.click(within(dialog).getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          flow_id: "flow-alpha",
          owner_ref: "backend-engineer",
          owner_type: "employee",
        }),
      );
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
      expect(api.deleteTaskFlow).toHaveBeenCalledWith(
        "default",
        "flow-alpha",
        expect.objectContaining({
          actor_ref: "web-user",
          actor_type: "human",
        }),
      );
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

  it("keeps review actions visible for claimed review tasks", async () => {
    const user = userEvent.setup();
    renderTaskFlowPage({
      api: createApi({
        taskItems: [
          buildTask({
            id: "task-claimed-review",
            review_actionable: true,
            status: "claimed",
            title: "Claimed review",
          }),
        ],
      }),
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Review 1/i }));
    const dialog = await screen.findByRole("dialog", { name: "Tasks Waiting on Review" });
    await user.click(within(dialog).getByRole("button", { name: /Claimed review/i }));

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Changes" })).toBeInTheDocument();
  });

  it("saves task-flow settings through the shared updateConfig contract", async () => {
    const user = userEvent.setup();
    const { notify, updateConfig } = renderTaskFlowPage({
      profiles: [
        { id: "default", title: "Default" },
        { id: "analyst", title: "Analyst" },
      ],
    });

    expect(await screen.findByText("Task Flow")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Task Flow Settings" });
    expect(within(dialog).getByText(/validated human operator/i)).toBeInTheDocument();

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
      expect(api.bulkDeleteTasks).toHaveBeenCalledWith(
        "default",
        expect.objectContaining({
          actor_ref: "web-user",
          actor_type: "human",
          task_ids: ["task-1"],
        }),
      );
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
          description: "Check the final reviewer copy.",
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
            description: "Check the final reviewer copy.",
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
          description: "Make sure the second session stays isolated.",
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
          description: "Check the final reviewer copy.",
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
          description: "Keep the second refresh isolated.",
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
          description: "Check the final reviewer copy.",
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
    expect(api.listTaskFlowEmployees).not.toHaveBeenCalled();
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
      expect(api.listTaskFlowEmployees).toHaveBeenCalled();
      expect(api.getTaskBoard).toHaveBeenCalled();
      expect(api.listReviewTasks).toHaveBeenCalled();
    });
  });
});
