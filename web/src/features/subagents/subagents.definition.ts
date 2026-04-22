import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";

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
  return {
    cardBadges: [
      { text: "profile", className: "badge badge--ai" },
      { text: "subagent", className: "badge" },
    ],
    content: String(rawItem.content || ""),
    detailBadges: [
      { text: "profile", className: "badge badge--ai" },
      { text: String(rawItem.path || ""), className: "badge" },
    ],
    id: String(rawItem.name || ""),
    path: String(rawItem.path || ""),
    summary: String(rawItem.summary || ""),
  };
}

function defaultSubagentTemplate() {
  return `# specialist

You are the \`specialist\` subagent.

## Focus
- Define the narrow responsibility of this subagent.
- Explain what evidence or outputs it should prioritize.
- Keep scope bounded and reusable.

## Rules
- Do not start other subagents.
- Return concise, actionable findings.
`;
}
