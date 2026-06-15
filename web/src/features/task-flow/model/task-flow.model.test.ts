import { describe, expect, it, vi } from "vitest";

import {
  buildSettingsPatch,
  bulkMoveTaskItems,
  createTaskItem,
  createTaskProject,
  defaultProjectDraft,
  defaultTaskDraft,
  getEmployeeOwnerRefOptions,
  getRootEmployeeOwnerError,
  getRootEmployeeOwnerOption,
  isCanonicalEmployeeOwnerRef,
  getTaskFlowBoard,
  normalizeActorRef,
  normalizeActorType,
  normalizeNumberField,
  normalizeTaskFlowConfig,
  parseCsv,
  requestTaskReviewChanges,
  resolveActorRefForType,
  taskDraftFromTask,
  toDateTimeLocal,
  updateTaskItem,
  updateTaskProject,
  validateProjectDraft,
  validateSettingsDraft,
  validateTaskDraft,
  withRootEmployeeOwner,
} from "@/features/task-flow/model/task-flow.api";
import {
  compareFlowProjects,
  formatFlowCreatorSummary,
  formatFlowOwnerSummary,
  formatFlowStatusSummary,
  formatProjectResultsLabel,
  formatProjectResultsNote,
  formatSessionEventCopy,
  formatSessionEventTitle,
  formatTaskRunningElapsed,
  formatTaskOwnerSummary,
  formatTaskPriorityLabel,
  formatTaskPriorityTitle,
  formatTaskSessionCounts,
  formatStatusLabel,
  getRenderedTaskSessionInsights,
  getRenderedTaskSession,
  getTaskSessionKey,
  getVisibleProjects,
  isOverdue,
  isSameSessionKey,
  normalizeInlineText,
  scoreFlowSearchMatch,
  shouldAutoRefreshTaskSession,
  taskStatusBadgeClass,
  truncate,
} from "@/features/task-flow/model/task-flow.presentation";

describe("task-flow api helpers", () => {
  it("validates project, task, and settings drafts", () => {
    expect(validateProjectDraft(defaultProjectDraft())).toBe("Flow title is required.");
    expect(
      validateProjectDraft({
        ...defaultProjectDraft(),
        title: "x".repeat(241),
      }),
    ).toBe("Flow title must be 240 characters or less.");
    expect(
      validateProjectDraft({
        ...defaultProjectDraft(),
        title: "Alpha",
        description: "ok",
      }),
    ).toBe("");
    expect(
      validateProjectDraft({
        ...defaultProjectDraft(),
        default_owner_ref: "web-user",
        default_owner_type: "human",
        title: "Alpha",
      }),
    ).toBe("Task Flow default owner must be an employee.");
    expect(
      validateProjectDraft({
        ...defaultProjectDraft(),
        default_owner_ref: "",
        default_owner_type: "employee",
        title: "Alpha",
      }),
    ).toBe("Employee default owner is required.");
    expect(
      validateProjectDraft(
        {
          ...defaultProjectDraft(),
          default_owner_ref: "missing",
          default_owner_type: "employee",
          title: "Alpha",
        },
        { profileId: "default", employees: [{ name: "researcher" }] },
      ),
    ).toBe("Select a valid employee default owner.");

    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
      }),
    ).toBe("Task title is required.");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        title: "Task",
        description: "Prompt",
        flow_id: "flow-alpha",
        priority: "999",
      }),
    ).toBe("Task priority must be between 0 and 100.");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        title: "Task",
        description: "Prompt",
      }),
    ).toBe("Project flow is required.");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        title: "Task",
        description: "Prompt",
        flow_id: "flow-alpha",
        due_at: "not-a-date",
      }),
    ).toBe("Due date must be a valid date and time.");
    expect(
      validateTaskDraft(
        {
          ...defaultTaskDraft(
            {
              task_flow_actor_ref: "web-user",
              task_flow_actor_type: "human",
              task_flow_board_limit_per_column: 20,
              task_flow_poll_interval_sec: 5,
            },
            [],
          ),
          title: "Task",
          description: "Prompt",
          flow_id: "flow-alpha",
          priority: "40",
          owner_ref: "researcher",
        },
        { profileId: "default", employees: [{ name: "researcher" }] },
      ),
    ).toBe("");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        description: "Prompt",
        flow_id: "flow-alpha",
        owner_ref: "web-user",
        owner_type: "human",
        title: "Task",
      }),
    ).toBe("Task Flow owner must be an employee.");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        description: "Prompt",
        flow_id: "flow-alpha",
        owner_ref: "default",
        reviewer_ref: "web-user",
        reviewer_type: "human",
        title: "Task",
      }),
    ).toBe("Task Flow reviewer must be an employee.");
    expect(
      validateTaskDraft(
        {
          ...defaultTaskDraft(
            {
              task_flow_actor_ref: "web-user",
              task_flow_actor_type: "human",
              task_flow_board_limit_per_column: 20,
              task_flow_poll_interval_sec: 5,
            },
            [],
          ),
          title: "Existing task",
          description: "Prompt",
          owner_ref: "default",
        },
        undefined,
        { requireFlow: false },
      ),
    ).toBe("");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        description: "Prompt",
        flow_id: "flow-alpha",
        owner_ref: "",
        owner_type: "employee",
        title: "Task",
      }),
    ).toBe("Employee owner is required.");
    expect(
      validateTaskDraft({
        ...defaultTaskDraft(
          {
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          },
          [],
        ),
        description: "Prompt",
        flow_id: "flow-alpha",
        owner_ref: "missing",
        owner_type: "employee",
        title: "Task",
      }, { profileId: "default", employees: [{ name: "researcher" }] }),
    ).toBe("Select a valid employee owner.");

    expect(
      validateSettingsDraft({
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: "0",
        task_flow_poll_interval_sec: "5",
      }),
    ).toBe("Board limit must be between 1 and 200 tasks per column.");
    expect(
      validateSettingsDraft({
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: "20",
        task_flow_poll_interval_sec: "0",
      }),
    ).toBe("Poll interval must be between 1 and 300 seconds.");
  });

  it("normalizes the board to include every flow column even when the backend omits empties", async () => {
    const board = await getTaskFlowBoard(
      {
        getTaskBoard: async () => ({
          board: {
            columns: [
              {
                id: "todo",
                title: "To Do",
                count: 1,
                tasks: [{ description: "Prompt", id: "task-1", status: "todo", title: "Task" }],
              },
              {
                id: "review",
                title: "Review",
                count: 0,
                tasks: [],
              },
            ],
            total_count: 1,
          },
        }),
      },
      "default",
      "",
      {
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
      },
    );

    expect(board.columns.map((column) => column.id)).toEqual([
      "plan",
      "todo",
      "blocked",
      "running",
      "review",
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(board.columns.find((column) => column.id === "blocked")).toMatchObject({
      count: 0,
      tasks: [],
      title: "Blocked",
    });
  });

  it("normalizes config, actor refs, numeric fields, and drafts", () => {
    expect(
      normalizeTaskFlowConfig({
        poll_interval_sec: 9,
      }),
    ).toEqual({
      task_flow_actor_ref: "web-user",
      task_flow_actor_type: "human",
      task_flow_board_limit_per_column: 20,
      task_flow_poll_interval_sec: 5,
    });

    expect(
      normalizeTaskFlowConfig({
        task_flow_poll_interval_sec: 9,
      }),
    ).toEqual({
      task_flow_actor_ref: "web-user",
      task_flow_actor_type: "human",
      task_flow_board_limit_per_column: 20,
      task_flow_poll_interval_sec: 9,
    });

    expect(defaultProjectDraft([{ id: "alpha", is_default: true }])).toMatchObject({
      default_owner_ref: "",
      default_owner_type: "",
    });
    expect(
      defaultTaskDraft(
        {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
        [{ id: "alpha" }],
        "flow-alpha",
      ),
    ).toMatchObject({
      flow_id: "flow-alpha",
      owner_ref: "",
      requires_review: true,
    });

    expect(parseCsv("a, b ,, c")).toEqual(["a", "b", "c"]);
    expect(normalizeNumberField("", { fallback: 7 })).toBe(7);
    expect(normalizeNumberField("200", { min: 0, max: 100 })).toBeNull();
    expect(normalizeNumberField("50", { min: 0, max: 100 })).toBe(50);
    expect(
      normalizeActorRef(
        "human",
        "",
        {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
      ),
    ).toBe("web-user");
    expect(
      normalizeActorRef(
        "employee",
        "alpha",
        {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
      ),
    ).toBe("alpha");
    expect(
      normalizeActorRef(
        "employee",
        "default:researcher",
        {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
      ),
    ).toBe("default:researcher");
    expect(normalizeActorType("employee")).toBe("employee");
    expect(getEmployeeOwnerRefOptions("default", [{ name: "researcher", summary: "Research tasks" }, { name: "orchestrator" }])).toEqual([
      {
        label: "researcher",
        profileId: "default",
        status: "active",
        summary: "Research tasks",
        value: "researcher",
      },
      {
        label: "orchestrator",
        profileId: "default",
        status: "active",
        summary: "",
        value: "orchestrator",
      },
    ]);
    expect(
      getEmployeeOwnerRefOptions("default", [{ name: "reviewer", profile_id: "analyst", summary: "Review tasks" }]),
    ).toEqual([
      {
        label: "analyst:reviewer",
        profileId: "analyst",
        status: "active",
        summary: "Review tasks",
        value: "reviewer",
      },
    ]);
    const rootEmployee = getRootEmployeeOwnerOption("default", [
      { manager_id: "cto", name: "Developer", owner_ref: "developer", profile_id: "default", status: "active" },
      { is_root: true, name: "CTO", owner_ref: "cto", profile_id: "default", status: "active" },
    ]);
    expect(rootEmployee?.owner_ref).toBe("cto");
    const multipleRoots = [
      { is_root: true, name: "CTO", owner_ref: "cto", profile_id: "default", status: "active" },
      { is_root: true, name: "COO", owner_ref: "coo", profile_id: "default", status: "active" },
    ];
    expect(getRootEmployeeOwnerOption("default", multipleRoots)).toBeNull();
    expect(getRootEmployeeOwnerError("default", multipleRoots)).toMatch(/exactly one active root employee/i);
    expect(
      withRootEmployeeOwner(
        {
          ...defaultTaskDraft({
            task_flow_actor_ref: "web-user",
            task_flow_actor_type: "human",
            task_flow_board_limit_per_column: 20,
            task_flow_poll_interval_sec: 5,
          }),
          owner_ref: "developer",
        },
        rootEmployee,
      ),
    ).toMatchObject({
      owner_ref: "cto",
      owner_type: "employee",
    });
    expect(isCanonicalEmployeeOwnerRef("default:researcher")).toBe(true);
    expect(isCanonicalEmployeeOwnerRef("default")).toBe(false);
    expect(
      resolveActorRefForType({
        config: {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
        currentRef: "",
        profileId: "default",
        profiles: [{ id: "default" }],
        employees: [{ name: "researcher" }],
        type: "employee",
      }),
    ).toBe("researcher");
    expect(
      resolveActorRefForType({
        config: {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
        currentRef: "cli_user:alice",
        previousType: "human",
        profileId: "default",
        profiles: [{ id: "default" }],
        employees: [{ name: "researcher" }],
        type: "employee",
      }),
    ).toBe("researcher");
    expect(
      resolveActorRefForType({
        config: {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
        currentRef: "researcher",
        previousType: "employee",
        profileId: "default",
        profiles: [{ id: "default" }],
        employees: [{ name: "researcher", owner_ref: "researcher", profile_id: "default" }],
        type: "employee",
      }),
    ).toBe("researcher");
    expect(toDateTimeLocal("2026-04-21T10:00:00.000Z")).toContain("2026-04-21T");
    expect(
      taskDraftFromTask({
        id: "task-1",
        title: "Task",
        description: "Prompt",
        status: "todo",
        labels: ["ops"],
        priority: 60,
        requires_review: true,
      }),
    ).toMatchObject({
      description: "Prompt",
      labels: "ops",
      priority: "60",
      title: "Task",
    });
    expect(
      buildSettingsPatch({
        task_flow_actor_ref: "  ",
        task_flow_actor_type: "",
        task_flow_board_limit_per_column: "25",
        task_flow_poll_interval_sec: "9",
      }),
    ).toEqual({
      task_flow_actor_ref: "web-user",
      task_flow_actor_type: "human",
      task_flow_board_limit_per_column: 25,
      task_flow_poll_interval_sec: 9,
    });
  });

  it("sends canonical task descriptions for create and update mutations", async () => {
    const config = {
      task_flow_actor_ref: "web-user",
      task_flow_actor_type: "human",
      task_flow_board_limit_per_column: 20,
      task_flow_poll_interval_sec: 5,
    };
    const draft = {
      ...defaultTaskDraft(config),
      description: "Write the task contract.",
      flow_id: "flow-alpha",
      title: "Route task",
    };
    const payloads: Record<string, unknown>[] = [];
    const api = {
      createTask: async (_profileId: string, payload: Record<string, unknown>) => {
        payloads.push(payload);
        return {
          task: {
            description: "Write the task contract.",
            id: "task-1",
            status: "todo",
            title: "Route task",
          },
        };
      },
      createTaskFlow: async (_profileId: string, payload: Record<string, unknown>) => {
        payloads.push(payload);
        return {
          task_flow: {
            id: "flow-1",
            title: "Flow",
          },
        };
      },
      requestReviewChanges: async (_profileId: string, _taskId: string, payload: Record<string, unknown>) => {
        payloads.push(payload);
        return { ok: true };
      },
      updateTask: async (_profileId: string, _taskId: string, payload: Record<string, unknown>) => {
        payloads.push(payload);
        return {
          task: {
            description: "Update the task contract.",
            id: "task-1",
            status: "todo",
            title: "Route task",
          },
        };
      },
      updateTaskFlow: async (_profileId: string, _flowId: string, payload: Record<string, unknown>) => {
        payloads.push(payload);
        return {
          task_flow: {
            id: "flow-1",
            title: "Flow",
          },
        };
      },
    };

    await createTaskItem(api, "default", draft, config);
    await updateTaskItem(api, "default", "task-1", { ...draft, description: "Update the task contract." }, config);
    await createTaskItem(
      api,
      "default",
      {
        ...draft,
        owner_ref: "researcher",
        owner_type: "employee",
        reviewer_ref: "reviewer",
        reviewer_type: "employee",
      },
      config,
    );
    await createTaskProject(
      api,
      "default",
      {
        ...defaultProjectDraft(),
        default_owner_ref: "researcher",
        default_owner_type: "employee",
        title: "Flow",
      },
      config,
    );
    await requestTaskReviewChanges(
      api,
      "default",
      "task-1",
      {
        owner_ref: "reviewer",
        owner_type: "employee",
        reason_text: "Please revise.",
      },
      config,
    );
    await updateTaskProject(
      api,
      "default",
      "flow-1",
      {
        ...defaultProjectDraft(),
        default_owner_ref: "researcher",
        default_owner_type: "employee",
        title: "Flow",
      },
      config,
    );

    expect(payloads[0]).toMatchObject({
      description: "Write the task contract.",
      flow_id: "flow-alpha",
      title: "Route task",
    });
    expect(payloads[0]).not.toHaveProperty("prompt");
    expect(payloads[1]).toMatchObject({
      description: "Update the task contract.",
      title: "Route task",
    });
    expect(payloads[1]).not.toHaveProperty("prompt");
    expect(payloads[2]).toMatchObject({
      owner_ref: "researcher",
      owner_type: "employee",
      reviewer_ref: "reviewer",
      reviewer_type: "employee",
    });
    expect(payloads[3]).toMatchObject({
      default_owner_ref: "researcher",
      default_owner_type: "employee",
    });
    expect(payloads[4]).toMatchObject({
      owner_ref: "reviewer",
      owner_type: "employee",
    });
    expect(payloads[5]).toMatchObject({
      actor_ref: "web-user",
      actor_type: "human",
      default_owner_ref: "researcher",
      default_owner_type: "employee",
    });
  });

  it("clears blocked metadata when bulk moving tasks out of blocked", async () => {
    const api = {
      bulkUpdateTasks: vi.fn(async () => ({ ok: true })),
    };
    const config = {
      task_flow_actor_ref: "web-user",
      task_flow_actor_type: "human",
      task_flow_board_limit_per_column: 20,
      task_flow_poll_interval_sec: 5,
    };

    await bulkMoveTaskItems(api, "default", ["task-1"], "todo", config);

    expect(api.bulkUpdateTasks).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({
        blocked_reason_code: null,
        blocked_reason_text: null,
        status: "todo",
        task_ids: ["task-1"],
      }),
    );
  });
});

describe("task-flow presentation helpers", () => {
  const flows = [
    {
      id: "flow-alpha",
      title: "Alpha",
      description: "Primary work",
      labels: ["ops"],
      default_owner_type: "employee",
      default_owner_ref: "cto",
      created_by_type: "human",
      created_by_ref: "web-user",
      status: "active",
      updated_at: "2026-04-20T10:00:00.000Z",
    },
    {
      id: "flow-beta",
      title: "Beta",
      description: "Review backlog",
      labels: ["review"],
      default_owner_type: "employee",
      default_owner_ref: "teamlead",
      created_by_type: "employee",
      created_by_ref: "teamlead",
      status: "paused",
      updated_at: "2026-04-21T10:00:00.000Z",
    },
  ];

  it("formats project and task summaries plus search ranking", () => {
    expect(formatTaskOwnerSummary({ id: "1", owner_type: "employee", owner_ref: "cto", status: "todo", title: "Task" })).toBe(
      "Owner: Employee cto",
    );
    expect(formatTaskOwnerSummary({ id: "1", owner_type: "human", owner_ref: "alice", status: "todo", title: "Task" })).toBe(
      "Owner: Unassigned",
    );
    expect(
      formatTaskOwnerSummary({ id: "1", owner_type: "employee", owner_ref: "developer", status: "todo", title: "Task" }),
    ).toBe("Owner: Employee developer");
    expect(
      formatTaskOwnerSummary({
        id: "1",
        owner_type: "employee",
        owner_ref: "cto",
        reviewer_type: "employee",
        reviewer_ref: "qa",
        status: "review",
        title: "Task",
      }),
    ).toBe("Reviewer: Employee qa");
    expect(
      formatTaskOwnerSummary({
        id: "1",
        reviewer_type: "employee",
        reviewer_ref: "qa",
        status: "review",
        title: "Task",
      }),
    ).toBe("Reviewer: Employee qa");
    expect(formatTaskOwnerSummary({ id: "1", status: "todo", title: "Task" })).toBe("Owner: Unassigned");
    expect(formatTaskPriorityLabel(99)).toBe("Critical >>");
    expect(formatTaskPriorityLabel(84)).toBe("Very High >>");
    expect(formatTaskPriorityTitle(84)).toBe("Priority score: 84/100");
    expect(formatFlowOwnerSummary(flows[0])).toBe("Default owner: Employee cto");
    expect(
      formatFlowOwnerSummary({
        id: "flow-gamma",
        title: "Gamma",
        default_owner_type: "employee",
        default_owner_ref: "developer",
      }),
    ).toBe("Default owner: Employee developer");
    expect(formatFlowCreatorSummary(flows[1])).toBe("Created by: Employee teamlead");
    expect(formatFlowStatusSummary(flows[1])).toBe("Status: Paused");
    expect(formatProjectResultsLabel(1, 2)).toBe("1 of 2 flows");
    expect(formatProjectResultsNote("flow-alpha", flows, "alpha")).toContain("Board filtered by Alpha.");
    expect(scoreFlowSearchMatch(flows[0], "flow-alpha")).toBeGreaterThan(scoreFlowSearchMatch(flows[1], "flow-alpha"));
    expect(compareFlowProjects(flows[0], flows[1], "flow-alpha")).toBeLessThan(0);
    expect(getVisibleProjects(flows, "flow-alpha", "review")[0].id).toBe("flow-beta");
  });

  it("formats status and text helpers", () => {
    expect(taskStatusBadgeClass("review")).toBe("badge--review");
    expect(formatStatusLabel("review_changes_requested")).toBe("Review Changes Requested");
    expect(normalizeInlineText("  hello \n world\t")).toBe("hello world");
    expect(truncate("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghi…");
    expect(
      isOverdue({
        id: "task-1",
        title: "Task",
        status: "todo",
        due_at: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("handles task sessions and session feed formatting", () => {
    const task = {
      active_session: {
        dialog_active: true,
        latest_activity_at: "2026-04-21T11:00:00.000Z",
        queued_turn_count: 2,
        running_turn_count: 1,
        session_id: "session-1",
        session_profile_id: "default",
      },
      id: "task-1",
      last_session_id: "session-1",
      owner_ref: "cto",
      owner_type: "employee",
      profile_id: "default",
      status: "running",
      title: "Task",
    };
    const sessionKey = getTaskSessionKey(task);
    expect(sessionKey?.sessionId).toBe("session-1");
    expect(
      getTaskSessionKey({
        ...task,
        active_session: null,
        last_session_id: "stale-session",
      }),
    ).toBeNull();
    const insights = {
      taskId: "task-1",
      session: {
        session_id: "session-1",
        session_profile_id: "default",
        dialog_active: true,
        queued_turn_count: 2,
        running_turn_count: 1,
      },
      turns: [],
      progress: {
        cursor: { last_event_id: 7, run_id: 3 },
        events: [],
      },
    };
    expect(isSameSessionKey(insights, "task-1", sessionKey)).toBe(true);
    expect(getRenderedTaskSession(task, insights)?.dialog_active).toBe(true);
    expect(getRenderedTaskSessionInsights(task, insights)).toBe(insights);
    expect(shouldAutoRefreshTaskSession(task, insights)).toBe(true);
    expect(formatTaskSessionCounts(insights.session)).toBe("1 running • 2 queued");
    expect(
      formatTaskRunningElapsed(
        {
          ...task,
          active_session: {
            dialog_active: true,
            started_at: "2026-04-21T10:45:00.000Z",
          },
        },
        Date.parse("2026-04-21T11:00:00.000Z"),
      ),
    ).toBe("15m");
    expect(
      formatTaskRunningElapsed(
        {
          ...task,
          active_session: {
            dialog_active: true,
            latest_activity_at: "2026-04-21T10:55:00.000Z",
          },
        },
        Date.parse("2026-04-21T11:00:00.000Z"),
      ),
    ).toBe("5m");
    expect(
      formatTaskRunningElapsed(
        {
          ...task,
          active_session: {
            dialog_active: true,
          },
        },
        Date.parse("2026-04-21T11:00:00.000Z"),
      ),
    ).toBe("");
    expect(formatSessionEventTitle({ event_type: "tool.call", tool_name: "planner" })).toBe("Calling planner");
    expect(
      formatSessionEventCopy({
        event_type: "tool.call",
        payload: {
          summary: "Working",
        },
      }),
    ).toBe("Working");
    expect(
      shouldAutoRefreshTaskSession(
        {
          ...task,
          active_session: null,
        },
        {
          ...insights,
          session: {
            ...insights.session,
            dialog_active: false,
          },
        },
      ),
    ).toBe(false);
  });
});
