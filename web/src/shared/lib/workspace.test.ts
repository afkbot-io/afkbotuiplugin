import { describe, expect, it } from "vitest";

import {
  defaultConfig,
  normalizeAuthState,
  normalizeConfig,
  normalizeError,
  resolveProfileId,
  routeLabel,
} from "./workspace";

describe("workspace helpers", () => {
  it("normalizes config from runtime keys only", () => {
    expect(
      normalizeConfig({
        poll_interval_sec: "7",
        task_flow_poll_interval_sec: "9",
        task_flow_board_limit_per_column: "25",
        task_flow_actor_type: "ai_profile",
        task_flow_actor_ref: "runner",
      }),
    ).toMatchObject({
      poll_interval_sec: 7,
      task_flow_poll_interval_sec: 9,
      task_flow_board_limit_per_column: 25,
      task_flow_actor_type: "ai_profile",
      task_flow_actor_ref: "runner",
    });
  });

  it("ignores removed compatibility aliases from the pre-react runtime", () => {
    expect(
      normalizeConfig({
        poll_interval_sec: "7",
        board_limit_per_column: "30",
        actor_type: "agent",
        actor_ref: "runner",
      }),
    ).toMatchObject({
      poll_interval_sec: 7,
      task_flow_poll_interval_sec: 5,
      task_flow_board_limit_per_column: 20,
      task_flow_actor_type: "human",
      task_flow_actor_ref: "web-user",
    });
  });

  it("normalizes auth state and profile resolution", () => {
    expect(
      normalizeAuthState({
        configured: 1,
        protected_plugin_ids: ["afkbotui"],
      }),
    ).toEqual({
      configured: true,
      mode: "disabled",
      protected_plugin_ids: ["afkbotui"],
      username: "",
    });

    expect(
      resolveProfileId(
        [
          { id: "default" },
          { id: "blue" },
        ],
        "blue",
      ),
    ).toBe("blue");
    expect(
      resolveProfileId(
        [
          { id: "secondary" },
          { id: "default", is_default: true },
        ],
        "missing",
      ),
    ).toBe("default");
    expect(resolveProfileId([{ id: "default" }], "missing")).toBe("default");
  });

  it("keeps user-facing helpers stable", () => {
    expect(routeLabel("task-flow")).toBe("Task Flow");
    expect(routeLabel("docs")).toBe("Docs");
    expect(routeLabel("automations")).toBe("Automations");
    expect(normalizeError(new Error("boom"))).toBe("boom");
    expect(normalizeConfig(undefined)).toEqual(defaultConfig);
  });
});
