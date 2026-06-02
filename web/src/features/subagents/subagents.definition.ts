import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";
import { summarizeTextLibraryItem } from "@/features/text-library/model/text-library.summary";

export const subagentsDefinition: TextLibraryDefinition = {
  entity: "subagents",
  cardClass: "subagent-card",
  contentFieldName: "content",
  contentRows: {
    create: 18,
    edit: 20,
  },
  gridClass: "subagent-grid",
  defaultDraft() {
    return {
      content: defaultSubagentTemplate(),
      id: "",
    };
  },
  draftFromItem(item) {
    return {
      content: item.content || "",
      id: item.id,
    };
  },
  idFieldName: "name",
  idReadonlyOnEdit: true,
  async list(api, profileId, query) {
    const payload = await (api as {
      listSubagents: (profileId: string, params: { q: string }) => Promise<{ subagents?: Array<Record<string, unknown>> }>;
    }).listSubagents(profileId, { q: query });
    return (payload.subagents || []).map(mapSubagentItem);
  },
  async get(api, profileId, itemId) {
    const payload = await (api as {
      getSubagent: (profileId: string, itemId: string) => Promise<{ subagent: Record<string, unknown> }>;
    }).getSubagent(profileId, itemId);
    return mapSubagentItem(payload.subagent);
  },
  async create(api, profileId, draft) {
    const payload = await (api as {
      createSubagent: (
        profileId: string,
        payload: { markdown: string; name: string },
      ) => Promise<{ subagent: Record<string, unknown> }>;
    }).createSubagent(profileId, {
      markdown: draft.content,
      name: draft.id,
    });
    return mapSubagentItem(payload.subagent);
  },
  async update(api, profileId, item, draft) {
    const payload = await (api as {
      updateSubagent: (
        profileId: string,
        itemId: string,
        payload: { markdown: string },
      ) => Promise<{ subagent: Record<string, unknown> }>;
    }).updateSubagent(profileId, item.id, {
      markdown: draft.content,
    });
    return mapSubagentItem(payload.subagent);
  },
  async remove(api, profileId, item) {
    await (api as {
      deleteSubagent: (profileId: string, itemId: string) => Promise<void>;
    }).deleteSubagent(profileId, item.id);
  },
  validateCreate(draft) {
    if (!draft.id) {
      return "Subagent name is required.";
    }
    if (!draft.content.trim()) {
      return "Subagent markdown is required.";
    }
    return "";
  },
  validateUpdate(draft) {
    if (!draft.id) {
      return "Subagent name is required.";
    }
    if (!draft.content.trim()) {
      return "Subagent markdown is required.";
    }
    return "";
  },
  ui: {
    closeDeleteLabel: "Close delete modal",
    closeModalLabel: "Close subagent modal",
    closePanelLabel: "Close subagent panel",
    contentLabel: "Markdown",
    contentTitle: "Markdown",
    createDescription:
      "Keep specialist setup in the same modal language as automations and tasks, with no separate panel-only flow.",
    createEyebrow: "Create Subagent",
    createSubmitLabel: "Create Subagent",
    createSubmittingLabel: "Creating…",
    createSuccessLabel: "Subagent created.",
    createTitle: "New Subagent",
    deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local markdown definition.`,
    deleteEyebrow: "Delete Subagent",
    deleteSubmitLabel: "Delete Subagent",
    deleteSubmittingLabel: "Deleting…",
    deleteSuccessLabel: "Subagent deleted.",
    deleteTitle: (item) => `Remove ${item.id}`,
    detailsEyebrow: "Subagent details",
    editEyebrow: "Edit subagent",
    editSubmitLabel: "Save Changes",
    editSubmittingLabel: "Saving…",
    emptyDescription: "Create profile-local subagents to standardize reusable specialist behavior.",
    emptySummaryLabel: "No summary available.",
    emptyTitle: "No Custom Subagents",
    idLabel: "Name",
    inspectorEmptyDescription:
      "Open a subagent to inspect its markdown, update the template, and keep profile-local specialist roles consistent.",
    inspectorEmptyTitle: "Subagent Inspector",
    loadingItemLabel: "Loading subagent…",
    loadingListLabel: "Loading subagents…",
    newLabel: "New Subagent",
    refreshLabel: "Refresh",
    searchHint: "Search subagents by name, path, or summary to reach the right specialist faster.",
    searchPlaceholder: "Search subagents…",
    summaryTitle: "Summary",
    surfaceDescription:
      "Profile-scoped subagents live in the same workspace, with search, inspect, edit, and delete flows aligned to the automation card pattern.",
    surfaceEyebrow: "Workspace / Subagents",
    surfaceTitle: "Subagents",
    updateSuccessLabel: "Subagent updated.",
    visibleLabel: (count) => `${count} visible`,
  },
};

function mapSubagentItem(rawItem: Record<string, unknown>) {
  const content = String(rawItem.content || "");
  const id = String(rawItem.name || "");
  return {
    cardBadges: [
      { text: "profile", className: "badge badge--ai" },
      { text: "subagent", className: "badge" },
    ],
    content,
    detailBadges: [
      { text: "profile", className: "badge badge--ai" },
      { text: String(rawItem.path || ""), className: "badge" },
    ],
    id,
    path: String(rawItem.path || ""),
    summary: summarizeTextLibraryItem({
      content,
      fallback: id,
      summary: rawItem.summary,
    }),
  };
}

function defaultSubagentTemplate() {
  return `# backend-engineer

You are the \`backend-engineer\` subagent for Task Flow projects.

## Role
- Own one focused implementation or review task at a time.
- Read the Task Flow Context Bundle before acting.
- Use durable flow/task docs as project memory.

## Task Flow Operating Loop
1. Call \`task.context.get\` when docs, dependencies, blockers, comments, or delegated work could matter.
2. Read \`brief\`, \`plan\`, \`spec\`, \`roadmap\`, \`decisions\`, and \`handoff\` docs before editing.
3. Persist non-trivial plans or durable findings with \`task.doc.put\`.
4. Use \`task.comment.add\` for progress, blockers, validation evidence, and handoff notes.
5. If another specialist is required, ask the orchestrator through comments or use \`task.delegate\` when the task explicitly allows delegation.

## Rules
- Do not take unrelated backlog work.
- Do not overwrite coworker output without reading current context.
- Block explicitly when required context, approval, credentials, or access is missing.
`;
}
