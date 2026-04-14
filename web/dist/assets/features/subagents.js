import { createTextLibraryController } from "./text-library-controller.js";

export function createSubagentsController({
  api,
  root,
  getProfileId,
  notify,
}) {
  return createTextLibraryController({
    api,
    root,
    getProfileId,
    notify,
    config: {
      actionAttr: "data-subagent-action",
      openAttr: "data-subagent-open",
      formAttr: "data-subagent-form",
      panelAttr: "data-subagent-panel",
      gridClass: "subagent-grid",
      cardClass: "subagent-card",
      fields: {
        id: "name",
        content: "content",
      },
      idReadonlyOnEdit: true,
      createContentRows: 18,
      editContentRows: 20,
      defaultDraft() {
        return {
          id: "",
          content: defaultSubagentTemplate(),
        };
      },
      mapItem(rawItem) {
        return {
          id: rawItem.name,
          content: rawItem.content || "",
          summary: rawItem.summary || "",
          path: rawItem.path || "",
          cardBadges: [
            { text: "profile", className: "badge badge--ai" },
            { text: "subagent", className: "badge" },
          ],
          detailBadges: [
            { text: "profile", className: "badge badge--ai" },
            { text: rawItem.path || "", className: "badge" },
          ],
        };
      },
      draftFromItem(item) {
        return {
          id: item.id,
          content: item.content || "",
        };
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
      async list(client, profileId, query) {
        const payload = await client.listSubagents(profileId, { q: query });
        return payload.subagents || [];
      },
      async get(client, profileId, itemId) {
        const payload = await client.getSubagent(profileId, itemId);
        return payload.subagent;
      },
      async create(client, profileId, draft) {
        const payload = await client.createSubagent(profileId, {
          name: draft.id,
          markdown: draft.content,
        });
        return payload.subagent;
      },
      async update(client, profileId, item, draft) {
        const payload = await client.updateSubagent(profileId, item.id, {
          markdown: draft.content,
        });
        return payload.subagent;
      },
      async remove(client, profileId, item) {
        await client.deleteSubagent(profileId, item.id);
      },
      ui: {
        surfaceEyebrow: "Workspace / Subagents",
        surfaceTitle: "Subagents",
        surfaceDescription: "Profile-scoped subagents live in the same workspace, with search, inspect, edit, and delete flows aligned to the automation card pattern.",
        refreshLabel: "Refresh",
        newLabel: "New Subagent",
        visibleLabel: (count) => `${count} visible`,
        searchHint: "Search subagents by name, path, or summary to reach the right specialist faster.",
        searchPlaceholder: "Search subagents…",
        loadingListLabel: "Loading subagents…",
        loadingItemLabel: "Loading subagent…",
        emptyTitle: "No Custom Subagents",
        emptyDescription: "Create profile-local subagents to standardize reusable specialist behavior.",
        inspectorEmptyTitle: "Subagent Inspector",
        inspectorEmptyDescription: "Open a subagent to inspect its markdown, update the template, and keep profile-local specialist roles consistent.",
        editEyebrow: "Edit subagent",
        detailsEyebrow: "Subagent details",
        summaryTitle: "Summary",
        contentTitle: "Markdown",
        emptySummaryLabel: "No summary available.",
        createEyebrow: "Create Subagent",
        createTitle: "New Subagent",
        createDescription: "Keep specialist setup in the same modal language as automations and tasks, with no separate panel-only flow.",
        createSubmitLabel: "Create Subagent",
        createSubmittingLabel: "Creating…",
        editSubmitLabel: "Save Changes",
        editSubmittingLabel: "Saving…",
        deleteEyebrow: "Delete Subagent",
        deleteTitle: (item) => `Remove ${item.id}`,
        deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local markdown definition.`,
        deleteSubmitLabel: "Delete Subagent",
        deleteSubmittingLabel: "Deleting…",
        idLabel: "Name",
        contentLabel: "Markdown",
        idPlaceholder: "",
        closePanelLabel: "Close subagent panel",
        closeModalLabel: "Close subagent modal",
        closeDeleteLabel: "Close delete modal",
        createSuccessLabel: "Subagent created.",
        updateSuccessLabel: "Subagent updated.",
        deleteSuccessLabel: "Subagent deleted.",
      },
    },
  });
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
