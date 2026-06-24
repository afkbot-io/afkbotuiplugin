import { describe, expect, it } from "vitest";

import {
  ALL_TOOLS_TOKEN,
  defaultEmployeeDraft,
  employeeToDraft,
  normalizeToolList,
  updateSubagentToolGrant,
} from "@/features/employees/employee-tools";

describe("employee tool policy helpers", () => {
  it("keeps all-access employees represented by the wildcard token", () => {
    expect(normalizeToolList(["task.*", ALL_TOOLS_TOKEN, "file.read"])).toEqual([ALL_TOOLS_TOKEN]);
    expect(updateSubagentToolGrant([ALL_TOOLS_TOKEN], false)).toEqual([ALL_TOOLS_TOKEN]);
  });

  it("deduplicates explicit grants and toggles subagent runtime access", () => {
    expect(normalizeToolList([" task.* ", "", "task.*", "file.read"])).toEqual(["task.*", "file.read"]);
    expect(updateSubagentToolGrant(["task.*", "subagent.*", "subagent.run"], false)).toEqual(["task.*"]);
    expect(updateSubagentToolGrant(["task.*"], true)).toEqual(["task.*", "subagent.run"]);
  });

  it("creates a constrained root CTO draft for empty profiles", () => {
    expect(defaultEmployeeDraft("", 0)).toMatchObject({
      allowed_tools: ["task.*", "memory.*", "file.read", "file.list", "file.search", "web.*", "http.request", "browser.*"],
      can_use_subagents: false,
      id: "cto",
      manager_id: null,
      role: "executive_orchestrator",
      title: "Technical Director",
    });
  });

  it("round-trips employee descriptors into editable drafts", () => {
    expect(
      employeeToDraft({
        allowed_tools: ["task.*"],
        body: "Review docs.",
        can_delegate_to: ["developer", "qa"],
        can_use_subagents: true,
        derived_reports: [],
        id: "reviewer",
        manager_id: "cto",
        name: "Reviewer",
        role: "qa",
        status: "disabled",
        subagent_allowlist: ["qa"],
        title: "QA",
      }),
    ).toMatchObject({
      allowed_tools: ["task.*"],
      can_delegate_to: ["developer", "qa"],
      can_use_subagents: true,
      manager_id: "cto",
      status: "disabled",
      subagent_allowlist: ["qa"],
    });
  });
});
