import type { TaskFlowEmployee, TaskFlowEmployeeDraft } from "@/features/task-flow/model/task-flow.types";

export const ROOT_CREATE_ID = "__root__";
export const ALL_TOOLS_TOKEN = "*";

export type EmployeeToolGroup = {
  description: string;
  id: string;
  label: string;
  tools: string[];
};

export type SubagentOption = {
  id: string;
  path: string;
  summary: string;
};

export const EMPLOYEE_TOOL_GROUPS: EmployeeToolGroup[] = [
  {
    description: "Create, update, comment, review, route, and inspect Task Flow work.",
    id: "task",
    label: "Task Flow",
    tools: ["task.*", "task.context.get", "task.create", "task.update", "task.comment.add", "task.delegate", "task.doc.put"],
  },
  {
    description: "Read and update project memory and reusable context.",
    id: "memory",
    label: "Memory / Docs",
    tools: ["memory.*", "memory.digest", "task.doc.list", "task.doc.put", "task.doc.confirm"],
  },
  {
    description: "Read workspace files and review generated diffs.",
    id: "files-read",
    label: "Files: read/review",
    tools: ["file.list", "file.search", "file.read", "diffs.render"],
  },
  {
    description: "Create or edit files in the allowed workspace scope.",
    id: "files-write",
    label: "Files: edit",
    tools: ["file.write", "file.apply_patch", "file.*"],
  },
  {
    description: "Run trusted shell commands for implementation and verification.",
    id: "shell",
    label: "Shell",
    tools: ["bash.exec"],
  },
  {
    description: "Open browser sessions and inspect web pages during QA.",
    id: "browser",
    label: "Browser",
    tools: ["browser.control", "browser.*"],
  },
  {
    description: "Fetch public web/API data needed for research or checks.",
    id: "web",
    label: "Web / HTTP",
    tools: ["web.search", "web.fetch", "web.*", "http.request"],
  },
  {
    description: "Create and manage recurring automations and webhook jobs.",
    id: "automations",
    label: "Automations",
    tools: ["automation.*"],
  },
  {
    description: "Inspect or request credential profiles needed for integrations.",
    id: "credentials",
    label: "Credentials",
    tools: ["credentials.*"],
  },
  {
    description: "List/run app surfaces exposed by AFKBOT or plugins.",
    id: "apps",
    label: "Apps",
    tools: ["app.*"],
  },
  {
    description: "Send channel replies or inspect channel history when allowed.",
    id: "channels",
    label: "Channels",
    tools: ["channel.history.list", "channel.send", "channel.*"],
  },
  {
    description: "List and call MCP tools exposed by approved profile/runtime connectors.",
    id: "mcp-runtime",
    label: "MCP runtime",
    tools: ["mcp.tools.list", "mcp.tools.call"],
  },
  {
    description: "Manage profile-local skills, subagents, and MCP profiles.",
    id: "profile-assets",
    label: "Profile assets",
    tools: ["skill.profile.*", "subagent.profile.*", "mcp.profile.*"],
  },
  {
    description: "Search and install reusable skills from configured marketplaces.",
    id: "skill-marketplace",
    label: "Skill marketplace",
    tools: ["skill.marketplace.*"],
  },
  {
    description: "Wake or continue trusted runtime sessions for Task Flow work.",
    id: "sessions",
    label: "Sessions",
    tools: ["session.job.run"],
  },
  {
    description: "Run CLI subagents from this employee's own session.",
    id: "subagents",
    label: "Subagents",
    tools: ["subagent.run", "subagent.*"],
  },
];

export const KNOWN_EMPLOYEE_TOOLS = new Set(EMPLOYEE_TOOL_GROUPS.flatMap((group) => group.tools));

export function defaultEmployeeDraft(parentId: string, employeeCount: number): TaskFlowEmployeeDraft {
  const isRoot = parentId === ROOT_CREATE_ID || (!parentId && employeeCount === 0);
  return {
    allowed_tools: isRoot
      ? ["task.*", "memory.*", "file.read", "file.list", "file.search", "web.*", "http.request", "browser.*"]
      : ["task.*", "memory.*", "file.read"],
    body: isRoot
      ? "Owns Task Flow intake, decomposition, routing, dependency control, review escalation, and delegation to the right leads."
      : "",
    can_use_subagents: false,
    id: isRoot ? "cto" : "",
    manager_id: parentId === ROOT_CREATE_ID ? null : parentId || null,
    name: isRoot ? "CTO" : "",
    role: isRoot ? "executive_orchestrator" : "specialist",
    status: "active",
    subagent_allowlist: [],
    title: isRoot ? "Technical Director" : "",
  };
}

export function employeeToDraft(employee: TaskFlowEmployee | null | undefined): TaskFlowEmployeeDraft | null {
  if (!employee) {
    return null;
  }
  return {
    allowed_tools: employee.allowed_tools || [],
    body: employee.body || "",
    can_use_subagents: Boolean(employee.can_use_subagents),
    id: employee.id,
    manager_id: employee.manager_id || null,
    name: employee.name,
    role: employee.role,
    status: employee.status === "disabled" || employee.status === "archived" ? employee.status : "active",
    subagent_allowlist: employee.subagent_allowlist || [],
    title: employee.title,
  };
}

export function allKnownEmployeeTools(): string[] {
  return normalizeToolList(EMPLOYEE_TOOL_GROUPS.flatMap((group) => group.tools));
}

export function updateSubagentToolGrant(tools: string[], enabled: boolean): string[] {
  if (tools.includes(ALL_TOOLS_TOKEN)) {
    return [ALL_TOOLS_TOKEN];
  }
  if (enabled) {
    return normalizeToolList([...tools, "subagent.run"]);
  }
  return normalizeToolList(tools.filter((tool) => tool !== "subagent.run" && tool !== "subagent.*"));
}

export async function listSubagentOptions(api: unknown, profileId: string): Promise<SubagentOption[]> {
  const client = api as {
    listSubagents?: (profileId: string, params: { q: string }) => Promise<{ subagents?: Array<Record<string, unknown>> }>;
  };
  if (typeof client.listSubagents !== "function") {
    return [];
  }
  const payload = await client.listSubagents(profileId, { q: "" });
  return (payload.subagents || [])
    .map((item) => ({
      id: String(item.name || item.id || "").trim(),
      path: String(item.path || ""),
      summary: String(item.summary || ""),
    }))
    .filter((item) => item.id)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function normalizeToolList(tools: string[]): string[] {
  if (tools.includes(ALL_TOOLS_TOKEN)) {
    return [ALL_TOOLS_TOKEN];
  }
  const seen = new Set<string>();
  return tools
    .map((tool) => tool.trim())
    .filter((tool) => {
      if (!tool || seen.has(tool)) {
        return false;
      }
      seen.add(tool);
      return true;
    });
}

export function slugifyEmployeeId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
