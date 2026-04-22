import { describe, expect, it } from "vitest";

import {
  buildSettingsPatch,
  defaultProjectDraft,
  defaultTaskDraft,
  getTaskFlowBoard,
  normalizeActorRef,
  normalizeNumberField,
  normalizeTaskFlowConfig,
  parseCsv,
  taskDraftFromTask,
  toDateTimeLocal,
  validateProjectDraft,
  validateSettingsDraft,
  validateTaskDraft,
} from "@/features/task-flow/model/task-flow.api";
import {
  buildFallbackSessionFromTask,
  compareFlowProjects,
  formatFlowCreatorSummary,
  formatFlowOwnerSummary,
  formatFlowStatusSummary,
  formatProjectResultsLabel,
  formatProjectResultsNote,
  formatSessionEventCopy,
  formatSessionEventTitle,
  formatTaskOwnerSummary,
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
        prompt: "Prompt",
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
        prompt: "Prompt",
        due_at: "not-a-date",
      }),
    ).toBe("Due date must be a valid date and time.");
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
        prompt: "Prompt",
        priority: "40",
      }),
    ).toBe("");

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
                tasks: [{ id: "task-1", prompt: "Prompt", status: "todo", title: "Task" }],
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

    expect(board.columns.map((column) => column.id)).toEqual(["todo", "blocked", "review", "completed", "failed", "cancelled"]);
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
      default_owner_ref: "alpha",
      default_owner_type: "ai_profile",
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
      owner_ref: "alpha",
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
        "ai_profile",
        "alpha",
        {
          task_flow_actor_ref: "web-user",
          task_flow_actor_type: "human",
          task_flow_board_limit_per_column: 20,
          task_flow_poll_interval_sec: 5,
        },
      ),
    ).toBe("alpha");
    expect(toDateTimeLocal("2026-04-21T10:00:00.000Z")).toContain("2026-04-21T");
    expect(
      taskDraftFromTask({
        id: "task-1",
        title: "Task",
        prompt: "Prompt",
        status: "todo",
        labels: ["ops"],
        priority: 60,
        requires_review: true,
      }),
    ).toMatchObject({
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
});

describe("task-flow presentation helpers", () => {
  const flows = [
    {
      id: "flow-alpha",
      title: "Alpha",
      description: "Primary work",
      labels: ["ops"],
      default_owner_type: "ai_profile",
      default_owner_ref: "alpha",
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
      default_owner_type: "human",
      default_owner_ref: "alice",
      created_by_type: "ai_profile",
      created_by_ref: "beta",
      status: "paused",
      updated_at: "2026-04-21T10:00:00.000Z",
    },
  ];

  it("formats project and task summaries plus search ranking", () => {
    expect(formatTaskOwnerSummary({ id: "1", owner_type: "ai_profile", owner_ref: "alpha", status: "todo", title: "Task" })).toBe(
      "Owner: AI alpha",
    );
    expect(formatTaskOwnerSummary({ id: "1", owner_type: "human", owner_ref: "alice", status: "todo", title: "Task" })).toBe(
      "Owner: alice",
    );
    expect(formatTaskOwnerSummary({ id: "1", status: "todo", title: "Task" })).toBe("Owner: Unassigned");
    expect(formatFlowOwnerSummary(flows[0])).toBe("Default owner: AI alpha");
    expect(formatFlowCreatorSummary(flows[1])).toBe("Created by: AI beta");
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
      id: "task-1",
      title: "Task",
      status: "running",
      last_session_id: "session-1",
      owner_type: "ai_profile",
      owner_ref: "alpha",
      profile_id: "default",
    };
    const fallbackSession = buildFallbackSessionFromTask(task);
    expect(fallbackSession?.session_profile_id).toBe("alpha");
    const sessionKey = getTaskSessionKey(task);
    expect(sessionKey?.sessionId).toBe("session-1");
    const insights = {
      taskId: "task-1",
      session: {
        session_id: "session-1",
        session_profile_id: "alpha",
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
