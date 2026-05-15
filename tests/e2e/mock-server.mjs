import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distRoot = path.resolve(repoRoot, "web/dist");
const pluginBase = "/plugins/afkbotui";
const port = Number(process.env.PLAYWRIGHT_PORT || 4181);

let nextAutomationId = 100;
let automations = [
  {
    id: 11,
    profile_id: "default",
    name: "Nightly Sync",
    prompt: "Sync task digests across the workspace.",
    trigger_type: "cron",
    status: "active",
    execution_mode: "prompt",
    graph_fallback_mode: "disabled",
    cron: {
      cron_expr: "0 2 * * *",
      timezone: "Europe/Moscow",
      next_run_at: "2026-04-22T23:00:00.000Z",
      last_run_at: "2026-04-21T23:00:00.000Z",
    },
    webhook: null,
    derived: {
      has_graph: false,
      last_activity_at: "2026-04-21T09:45:00.000Z",
      needs_attention: false,
    },
    updated_at: "2026-04-21T09:45:00.000Z",
  },
];
const automationWebhookEndpoints = new Map();

let taskFlows = [
  {
    id: "flow-alpha",
    title: "Alpha Project",
    description: "Primary migration stream for workspace shell improvements.",
    default_owner_type: "ai_profile",
    default_owner_ref: "default",
    created_by_type: "human",
    created_by_ref: "web-user",
    labels: ["migration", "workspace"],
    status: "active",
    updated_at: "2026-04-21T09:40:00.000Z",
  },
  {
    id: "flow-beta",
    title: "Ops Follow-up",
    description: "Backlog for rollout, QA, and release tasks.",
    default_owner_type: "human",
    default_owner_ref: "web-user",
    created_by_type: "human",
    created_by_ref: "web-user",
    labels: ["ops"],
    status: "active",
    updated_at: "2026-04-21T08:10:00.000Z",
  },
];

const boardTasks = [
  {
    id: "task-rollout",
    title: "Prepare rollout checklist",
    description: "Collect the final rollout checklist for the React migration.",
    status: "todo",
    priority: 60,
    profile_id: "default",
    flow_id: "flow-alpha",
    due_at: "2026-04-22T10:00:00.000Z",
    owner_type: "ai_profile",
    owner_ref: "default",
    reviewer_type: "",
    reviewer_ref: "",
    requires_review: false,
    labels: ["migration"],
    active_session: {
      dialog_active: true,
      latest_activity_at: "2026-04-21T09:48:00.000Z",
      queued_turn_count: 1,
      running_turn_count: 1,
      session_id: "session-rollout",
      session_profile_id: "default",
    },
    last_session_id: "session-rollout",
    last_session_profile_id: "default",
  },
  {
    id: "task-review",
    title: "Approve migration smoke suite",
    description: "Review the new dist smoke suite before release.",
    status: "review",
    priority: 70,
    profile_id: "default",
    flow_id: "flow-alpha",
    due_at: "2026-04-22T12:00:00.000Z",
    owner_type: "human",
    owner_ref: "web-user",
    reviewer_type: "human",
    reviewer_ref: "web-user",
    requires_review: true,
    labels: ["qa"],
  },
];

const taskComments = {
  "task-review": [],
  "task-rollout": [
    {
      id: 1,
      message: "Need the final owner checklist before release.",
      created_at: "2026-04-21T09:35:00.000Z",
    },
  ],
};

const taskEvents = {
  "task-review": [],
  "task-rollout": [
    {
      id: 11,
      event_type: "session.bound",
      created_at: "2026-04-21T09:40:00.000Z",
    },
  ],
};

const taskRuns = {
  "task-review": [],
  "task-rollout": [
    {
      id: 21,
      status: "running",
      created_at: "2026-04-21T09:41:00.000Z",
      started_at: "2026-04-21T09:41:00.000Z",
    },
  ],
};

const taskDependencies = {
  "task-review": [],
  "task-rollout": [],
};

let taskDocuments = {
  "flow:flow-alpha": [
    {
      id: "doc-flow-alpha-plan",
      scope_type: "flow",
      scope_id: "flow-alpha",
      document_key: "plan",
      title: "Flow plan",
      body: "Coordinate rollout tasks through confirmed docs and task handoffs.",
      revision: 1,
      confirmation_status: "draft",
      updated_at: "2026-04-21T09:42:00.000Z",
    },
  ],
  "task:task-rollout": [
    {
      id: "doc-task-rollout-handoff",
      scope_type: "task",
      scope_id: "task-rollout",
      document_key: "handoff",
      title: "Rollout handoff",
      body: "Check the flow plan and update QA notes before completion.",
      revision: 1,
      confirmation_status: "confirmed",
      confirmed_revision: 1,
      updated_at: "2026-04-21T09:44:00.000Z",
    },
  ],
};

const taskSessionInsights = {
  "task-rollout": {
    session: {
      dialog_active: true,
      latest_activity_at: "2026-04-21T09:48:00.000Z",
      queued_turn_count: 1,
      running_turn_count: 1,
      session_id: "session-rollout",
      session_profile_id: "default",
    },
    turns: [
      {
        id: 1,
        session_id: "session-rollout",
        profile_id: "default",
        user_message: "Continue preparing the rollout checklist.",
        assistant_message: "I am collecting the latest release blockers and checklist gaps now.",
      },
    ],
    progress: {
      cursor: {
        last_event_id: 12,
        run_id: 44,
      },
      events: [
        {
          event_id: 12,
          event_type: "tool.call",
          tool_name: "planner",
          stage: "running",
          created_at: "2026-04-21T09:48:00.000Z",
          payload: {
            summary: "Planner is assembling the rollout sequence.",
          },
        },
      ],
    },
  },
};

const subagents = [
  {
    name: "planner",
    path: "profiles/default/subagents/planner.md",
    summary: "Project planning specialist.",
    content: "# planner\n\nPlan migration slices and execution steps.",
  },
];

let skills = [
  {
    name: "reviewer",
    path: "profiles/default/skills/reviewer/SKILL.md",
    summary: "Review workflow for runtime changes.",
    available: true,
    execution_mode: "advisory",
    content: "---\ndescription: Review runtime changes.\n---\n\n# Reviewer\n\nAudit runtime behavior and tests.",
  },
];

const bootstrapFiles = [
  {
    file_name: "AGENTS.md",
    path: "profiles/default/bootstrap/AGENTS.md",
    summary: "Workspace bootstrap rules.",
    content: "# AGENTS\n\nShared workspace bootstrap context.",
  },
];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendFile(response, filePath) {
  const extname = path.extname(filePath).toLowerCase();
  const body = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname] || "application/octet-stream",
    "Cache-Control": extname === ".html" ? "no-store" : "public, max-age=60",
  });
  response.end(body);
}

function normalizePathname(requestUrl) {
  return decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
}

function matchApiRoute(pathname, requestUrl = "/") {
  const requestUrlObject = new URL(requestUrl, "http://127.0.0.1");
  const flowFilter = String(requestUrlObject.searchParams.get("flow_id") || "").trim();
  const filteredBoardTasks = flowFilter
    ? boardTasks.filter((task) => String(task.flow_id || "") === flowFilter)
    : boardTasks;

  if (pathname === "/v1/auth/session") {
    return {
      authenticated: false,
      auth: {
        configured: false,
        protected_plugin_ids: [],
      },
      session: null,
    };
  }

  if (pathname === "/v1/plugins/afkbotui/config") {
    return {
      config: {
        default_profile_id: "default",
        poll_interval_sec: 5,
        task_flow_actor_ref: "web-user",
        task_flow_actor_type: "human",
        task_flow_board_limit_per_column: 20,
        task_flow_poll_interval_sec: 5,
      },
    };
  }

  if (pathname === "/v1/plugins/afkbotui/profiles") {
    return {
      profiles: [
        {
          id: "default",
          is_default: true,
          title: "Default",
        },
      ],
    };
  }

  if (pathname === "/v1/plugins/afkbotui/automations") {
    return {
      automations: automations.map(maskAutomationWebhook),
      filtered_count: automations.length,
      summary: {
        active: 1,
        attention: 0,
        cron: 1,
        deleted: 0,
        paused: 0,
        total: 1,
        webhook: 0,
      },
    };
  }

  if (pathname === "/v1/plugins/afkbotui/automations/11") {
    const automation = automations.find((item) => item.id === 11) || null;
    return { automation: automation ? maskAutomationWebhook(automation) : null };
  }

  if (/^\/v1\/plugins\/afkbotui\/automations\/\d+$/u.test(pathname)) {
    const automationId = Number(pathname.split("/").at(-1));
    const automation = automations.find((item) => item.id === automationId);
    if (!automation) {
      return null;
    }
    return { automation: maskAutomationWebhook(automation) };
  }

  if (/^\/v1\/plugins\/afkbotui\/automations\/\d+\/webhook-endpoint$/u.test(pathname)) {
    const automationId = Number(pathname.split("/").at(-2));
    const automation = automations.find((item) => item.id === automationId);
    if (!automation || automation.trigger_type !== "webhook") {
      return null;
    }
    return {
      webhook: automationWebhookEndpoints.get(automationId) || {
        recoverable: false,
        webhook_path: null,
        webhook_token_masked: automation.webhook?.webhook_token_masked || null,
        webhook_url: null,
      },
    };
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/flows") {
    return { task_flows: taskFlows };
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/board") {
    return {
      board: {
        columns: [
          {
            id: "todo",
            title: "To Do",
            count: filteredBoardTasks.filter((task) => task.status === "todo").length,
            tasks: filteredBoardTasks.filter((task) => task.status === "todo"),
          },
          {
            id: "review",
            title: "Review",
            count: filteredBoardTasks.filter((task) => task.status === "review").length,
            tasks: filteredBoardTasks.filter((task) => task.status === "review"),
          },
        ],
        total_count: filteredBoardTasks.length,
      },
    };
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/feed") {
    return {
      feed: {
        blocked_count: 0,
        mention_event_count: 1,
        owner_ref: "default",
        owner_type: "ai_profile",
        recent_events: [
          {
            id: 31,
            task_id: "task-rollout",
            task_title: "Prepare rollout checklist",
            event_type: "wake_requested",
            created_at: "2026-04-21T09:47:00.000Z",
          },
        ],
        review_count: 0,
        running_count: 0,
        tasks: boardTasks.filter((task) => task.owner_type === "ai_profile"),
        todo_count: 1,
        total_count: 1,
      },
    };
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/docs") {
    const scopeType = requestUrlObject.searchParams.get("scope_type") || "";
    const scopeId = requestUrlObject.searchParams.get("scope_id") || "";
    return {
      task_documents: taskDocuments[`${scopeType}:${scopeId}`] || [],
    };
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/review") {
    return {
      review_tasks: filteredBoardTasks.filter((task) => task.status === "review"),
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-1) || "");
    return {
      task: boardTasks.find((item) => item.id === taskId) || null,
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/context$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    const task = boardTasks.find((item) => item.id === taskId) || null;
    const flow = task?.flow_id ? taskFlows.find((item) => item.id === task.flow_id) || null : null;
    return {
      context: {
        delegated_tasks: [],
        dependencies: taskDependencies[taskId] || [],
        dependency_tasks: [],
        dependent_tasks: [],
        dependents: [],
        flow,
        flow_documents: flow ? taskDocuments[`flow:${flow.id}`] || [] : [],
        generated_at: "2026-04-21T09:50:00.000Z",
        recent_comments: taskComments[taskId] || [],
        recent_events: taskEvents[taskId] || [],
        task,
        task_documents: taskDocuments[`task:${taskId}`] || [],
      },
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/comments$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    return {
      task_comments: taskComments[taskId] || [],
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/dependencies$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    return {
      task_dependencies: taskDependencies[taskId] || [],
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/events$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    return {
      task_events: taskEvents[taskId] || [],
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/runs$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    return {
      task_runs: taskRuns[taskId] || [],
    };
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/tasks\/[^/]+\/session$/u.test(pathname)) {
    const taskId = decodeURIComponent(pathname.split("/").at(-2) || "");
    return taskSessionInsights[taskId] || {
      progress: {
        cursor: {
          last_event_id: 0,
          run_id: null,
        },
        events: [],
      },
      session: null,
      turns: [],
    };
  }

  if (pathname === "/v1/plugins/afkbotui/subagents") {
    return { subagents };
  }

  if (pathname === "/v1/plugins/afkbotui/subagents/planner") {
    return { subagent: subagents.find((item) => item.name === "planner") || null };
  }

  if (pathname === "/v1/plugins/afkbotui/skills") {
    return { skills };
  }

  if (pathname === "/v1/plugins/afkbotui/skills/reviewer") {
    return { skill: skills.find((item) => item.name === "reviewer") || null };
  }

  if (pathname.startsWith("/v1/plugins/afkbotui/skills/")) {
    const itemId = decodeURIComponent(pathname.split("/").at(-1) || "");
    const skill = skills.find((item) => item.name === itemId);
    if (!skill) {
      return null;
    }
    return { skill };
  }

  if (pathname === "/v1/plugins/afkbotui/bootstrap-files") {
    return { bootstrap_files: bootstrapFiles };
  }

  if (pathname === "/v1/plugins/afkbotui/bootstrap-files/AGENTS.md") {
    return { bootstrap_file: bootstrapFiles.find((item) => item.file_name === "AGENTS.md") || null };
  }

  return null;
}

async function serveStatic(pathname, response) {
  if (!pathname.startsWith(pluginBase)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const relativePath = pathname === pluginBase || pathname === `${pluginBase}/`
    ? "index.html"
    : pathname.slice(`${pluginBase}/`.length);
  const candidate = path.resolve(distRoot, relativePath);

  if (!candidate.startsWith(distRoot)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden.");
    return;
  }

  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile()) {
      await sendFile(response, candidate);
      return;
    }
  } catch {
    // Fall through to SPA shell.
  }

  await sendFile(response, path.resolve(distRoot, "index.html"));
}

function maskAutomationWebhook(automation) {
  if (automation.trigger_type !== "webhook" || !automation.webhook) {
    return automation;
  }
  return {
    ...automation,
    webhook: {
      ...automation.webhook,
      webhook_path: null,
      webhook_url: null,
    },
  };
}

async function handleMutation(request, response, pathname) {
  const method = (request.method || "GET").toUpperCase();

  if (pathname === "/v1/plugins/afkbotui/automations" && method === "POST") {
    const payload = await readJsonBody(request);
    const nextAutomation = {
      id: nextAutomationId++,
      profile_id: "default",
      name: String(payload?.name || "Untitled automation"),
      prompt: String(payload?.prompt || ""),
      trigger_type: payload?.trigger_type === "webhook" ? "webhook" : "cron",
      status: payload?.status === "paused" ? "paused" : "active",
      execution_mode: "prompt",
      graph_fallback_mode: "disabled",
      cron: payload?.trigger_type === "webhook"
        ? null
        : {
            cron_expr: String(payload?.cron_expr || "0 9 * * *"),
            timezone: String(payload?.timezone_name || "Europe/Moscow"),
            next_run_at: "2026-04-22T23:00:00.000Z",
            last_run_at: null,
          },
      webhook: payload?.trigger_type === "webhook"
        ? {
            webhook_endpoint_recoverable: true,
            last_execution_status: "idle",
            last_error: "",
            last_received_at: null,
            last_session_id: null,
            chat_resume_command: null,
            webhook_path: null,
            webhook_token_masked: "mock...hook",
            webhook_url: null,
          }
        : null,
      derived: {
        has_graph: false,
        last_activity_at: null,
        needs_attention: false,
      },
      updated_at: "2026-04-21T12:00:00.000Z",
    };
    if (nextAutomation.trigger_type === "webhook") {
      automationWebhookEndpoints.set(nextAutomation.id, {
        recoverable: true,
        webhook_path: "/hooks/mock",
        webhook_token_masked: "mock...hook",
        webhook_url: "https://example.test/hooks/mock",
      });
    }
    automations = [nextAutomation, ...automations];
    sendJson(response, 200, { automation: maskAutomationWebhook(nextAutomation) });
    return true;
  }

  if (/^\/v1\/plugins\/afkbotui\/automations\/\d+$/u.test(pathname) && method === "PATCH") {
    const payload = await readJsonBody(request);
    const automationId = Number(pathname.split("/").at(-1));
    if (payload?.rotate_webhook_token) {
      automationWebhookEndpoints.set(automationId, {
        recoverable: true,
        webhook_path: "/hooks/rotated",
        webhook_token_masked: "hook...ated",
        webhook_url: "https://example.test/hooks/rotated",
      });
    }
    automations = automations.map((item) =>
      item.id === automationId
        ? {
            ...item,
            name: payload?.name ? String(payload.name) : item.name,
            prompt: payload?.prompt ? String(payload.prompt) : item.prompt,
            status: payload?.status === "paused" ? "paused" : item.status,
            cron: item.cron
              ? {
                  ...item.cron,
                  cron_expr: payload?.cron_expr ? String(payload.cron_expr) : item.cron.cron_expr,
                  timezone: payload?.timezone_name ? String(payload.timezone_name) : item.cron.timezone,
                }
              : item.cron,
            webhook: item.webhook
              ? {
                  ...item.webhook,
                  webhook_endpoint_recoverable: true,
                  webhook_path: null,
                  webhook_token_masked: payload?.rotate_webhook_token
                    ? "hook...ated"
                    : item.webhook.webhook_token_masked,
                  webhook_url: null,
                }
              : item.webhook,
            updated_at: "2026-04-21T12:05:00.000Z",
          }
        : item,
    );
    const automation = automations.find((item) => item.id === automationId);
    sendJson(response, 200, { automation: automation ? maskAutomationWebhook(automation) : null });
    return true;
  }

  if (/^\/v1\/plugins\/afkbotui\/automations\/\d+$/u.test(pathname) && method === "DELETE") {
    const automationId = Number(pathname.split("/").at(-1));
    automations = automations.filter((item) => item.id !== automationId);
    automationWebhookEndpoints.delete(automationId);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/flows" && method === "POST") {
    const payload = await readJsonBody(request);
    const flowId = `flow-${String(payload?.title || "new-flow").trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
    const nextFlow = {
      id: flowId,
      title: String(payload?.title || "New Flow"),
      description: String(payload?.description || ""),
      default_owner_type: String(payload?.default_owner_type || ""),
      default_owner_ref: String(payload?.default_owner_ref || ""),
      created_by_type: String(payload?.created_by_type || "human"),
      created_by_ref: String(payload?.created_by_ref || "web-user"),
      labels: Array.isArray(payload?.labels) ? payload.labels.map((label) => String(label)) : [],
      status: "active",
      updated_at: "2026-04-21T12:10:00.000Z",
    };
    taskFlows = [nextFlow, ...taskFlows];
    sendJson(response, 200, { task_flow: nextFlow });
    return true;
  }

  if (pathname.startsWith("/v1/plugins/afkbotui/task-flow/flows/") && method === "DELETE") {
    const flowId = decodeURIComponent(pathname.split("/").at(-1) || "");
    taskFlows = taskFlows.filter((item) => item.id !== flowId);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/v1/plugins/afkbotui/task-flow/docs" && method === "PUT") {
    const payload = await readJsonBody(request);
    const scopeType = String(payload?.scope_type || "task");
    const scopeId = String(payload?.scope_id || "");
    const documentKey = String(payload?.document_key || "plan");
    const mapKey = `${scopeType}:${scopeId}`;
    const currentDocuments = taskDocuments[mapKey] || [];
    const existing = currentDocuments.find((document) => document.document_key === documentKey);
    const nextDocument = {
      id: existing?.id || `doc-${scopeType}-${scopeId}-${documentKey}`,
      scope_type: scopeType,
      scope_id: scopeId,
      document_key: documentKey,
      title: String(payload?.title || documentKey),
      body: String(payload?.body || ""),
      revision: Number(existing?.revision || 0) + 1,
      confirmation_status: "draft",
      updated_at: "2026-04-21T12:15:00.000Z",
    };
    taskDocuments = {
      ...taskDocuments,
      [mapKey]: [...currentDocuments.filter((document) => document.id !== nextDocument.id), nextDocument],
    };
    sendJson(response, 200, { task_document: nextDocument });
    return true;
  }

  if (/^\/v1\/plugins\/afkbotui\/task-flow\/docs\/[^/]+\/confirm$/u.test(pathname) && method === "POST") {
    const documentId = decodeURIComponent(pathname.split("/").at(-2) || "");
    let confirmedDocument = null;
    taskDocuments = Object.fromEntries(
      Object.entries(taskDocuments).map(([key, documents]) => [
        key,
        documents.map((document) => {
          if (document.id !== documentId) {
            return document;
          }
          confirmedDocument = {
            ...document,
            confirmation_status: "confirmed",
            confirmed_revision: document.revision,
          };
          return confirmedDocument;
        }),
      ]),
    );
    sendJson(response, 200, { task_document: confirmedDocument });
    return true;
  }

  if (pathname === "/v1/plugins/afkbotui/skills" && method === "POST") {
    const payload = await readJsonBody(request);
    const nextSkill = {
      name: String(payload?.name || "new-skill"),
      path: `profiles/default/skills/${String(payload?.name || "new-skill")}/SKILL.md`,
      summary: "Freshly created profile skill.",
      available: true,
      execution_mode: "advisory",
      content: String(payload?.markdown || ""),
    };
    skills = [nextSkill, ...skills];
    sendJson(response, 200, { skill: nextSkill });
    return true;
  }

  if (pathname.startsWith("/v1/plugins/afkbotui/skills/") && method === "PATCH") {
    const payload = await readJsonBody(request);
    const itemId = decodeURIComponent(pathname.split("/").at(-1) || "");
    skills = skills.map((item) =>
      item.name === itemId
        ? {
            ...item,
            content: String(payload?.markdown || item.content),
            summary: "Updated profile skill.",
          }
        : item,
    );
    const skill = skills.find((item) => item.name === itemId);
    sendJson(response, 200, { skill });
    return true;
  }

  if (pathname.startsWith("/v1/plugins/afkbotui/skills/") && method === "DELETE") {
    const itemId = decodeURIComponent(pathname.split("/").at(-1) || "");
    skills = skills.filter((item) => item.name !== itemId);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

await fs.stat(path.resolve(distRoot, "index.html"));

const server = http.createServer(async (request, response) => {
  const pathname = normalizePathname(request.url || "/");

  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname.startsWith("/v1/")) {
    if ((request.method || "GET").toUpperCase() !== "GET") {
      if (await handleMutation(request, response, pathname)) {
        return;
      }
      sendJson(response, 405, {
        detail: {
          error_code: "method_not_allowed",
          message: `Mock route does not support ${request.method} ${pathname}.`,
        },
      });
      return;
    }
    const payload = matchApiRoute(pathname, request.url || pathname);
    if (payload) {
      sendJson(response, 200, payload);
      return;
    }
    sendJson(response, 500, {
      detail: {
        error_code: "mock_route_missing",
        message: `Unmatched mock route: ${pathname}`,
      },
    });
    return;
  }

  try {
    await serveStatic(pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      detail: {
        error_code: "mock_server_error",
        message: error instanceof Error ? error.message : "Unknown mock server error.",
      },
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mock AFKBOT UI server listening on http://127.0.0.1:${port}${pluginBase}/\n`);
});
