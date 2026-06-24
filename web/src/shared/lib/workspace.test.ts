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
  it("normalizes config from runtime keys while forcing public Task Flow actor to server-managed human", () => {
    expect(
      normalizeConfig({
        poll_interval_sec: "7",
        task_flow_poll_interval_sec: "9",
        task_flow_board_limit_per_column: "25",
        task_flow_actor_type: "human",
        task_flow_actor_ref: "cli_user:local",
      }),
    ).toMatchObject({
      poll_interval_sec: 7,
      task_flow_poll_interval_sec: 9,
      task_flow_board_limit_per_column: 25,
      task_flow_actor_type: "human",
      task_flow_actor_ref: "web-user",
    });
  });

  it("ignores unknown runtime config aliases", () => {
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
    expect(normalizeError(Object.assign(new Error("expired"), { code: "ui_auth_required" }))).toBe(
      "Your AFKBOT UI session expired. Sign in again, then retry the action.",
    );
    expect(normalizeConfig(undefined)).toEqual(defaultConfig);
  });
});
