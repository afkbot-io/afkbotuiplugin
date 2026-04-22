import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";

export const bootstrapDefinition: TextLibraryDefinition = {
  entity: "bootstrap",
  cardClass: "bootstrap-card",
  contentFieldName: "content",
  contentRows: {
    create: 18,
    edit: 20,
  },
  gridClass: "bootstrap-grid",
  defaultDraft() {
    return {
      content: defaultBootstrapTemplate(),
      id: "",
    };
  },
  draftFromItem(item) {
    return {
      content: item.content || "",
      id: item.id,
    };
  },
  idFieldName: "file_name",
  idReadonlyOnEdit: false,
  async list(api, profileId, query) {
    const payload = await (api as {
      listBootstrapFiles: (
        profileId: string,
        params: { q: string },
      ) => Promise<{ bootstrap_files?: Array<Record<string, unknown>> }>;
    }).listBootstrapFiles(profileId, { q: query });
    return (payload.bootstrap_files || []).map(mapBootstrapItem);
  },
  async get(api, profileId, itemId) {
    const payload = await (api as {
      getBootstrapFile: (profileId: string, itemId: string) => Promise<{ bootstrap_file: Record<string, unknown> }>;
    }).getBootstrapFile(profileId, itemId);
    return mapBootstrapItem(payload.bootstrap_file);
  },
  async create(api, profileId, draft) {
    const payload = await (api as {
      createBootstrapFile: (
        profileId: string,
        payload: { content: string; file_name: string },
      ) => Promise<{ bootstrap_file: Record<string, unknown> }>;
    }).createBootstrapFile(profileId, {
      content: draft.content,
      file_name: draft.id,
    });
    return mapBootstrapItem(payload.bootstrap_file);
  },
  async update(api, profileId, item, draft) {
    const payload = await (api as {
      updateBootstrapFile: (
        profileId: string,
        itemId: string,
        payload: { content: string; file_name: string },
      ) => Promise<{ bootstrap_file: Record<string, unknown> }>;
    }).updateBootstrapFile(profileId, item.id, {
      content: draft.content,
      file_name: draft.id,
    });
    return mapBootstrapItem(payload.bootstrap_file);
  },
  async remove(api, profileId, item) {
    await (api as {
      deleteBootstrapFile: (profileId: string, itemId: string) => Promise<void>;
    }).deleteBootstrapFile(profileId, item.id);
  },
  validateCreate(draft) {
    if (!draft.id) {
      return "Bootstrap file name is required.";
    }
    return "";
  },
  validateUpdate(draft) {
    if (!draft.id) {
      return "Bootstrap file name is required.";
    }
    return "";
  },
  ui: {
    closeDeleteLabel: "Close delete bootstrap modal",
    closeModalLabel: "Close bootstrap modal",
    closePanelLabel: "Close bootstrap panel",
    contentLabel: "Content",
    contentTitle: "Content",
    createDescription: "Add a profile-scoped file under the bootstrap directory without leaving the unified workspace shell.",
    createEyebrow: "Create Bootstrap File",
    createSubmitLabel: "Create File",
    createSubmittingLabel: "Creating…",
    createSuccessLabel: "Bootstrap file created.",
    createTitle: "New Bootstrap File",
    deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local bootstrap file.`,
    deleteEyebrow: "Delete Bootstrap File",
    deleteSubmitLabel: "Delete File",
    deleteSubmittingLabel: "Deleting…",
    deleteSuccessLabel: "Bootstrap file deleted.",
    deleteTitle: (item) => `Remove ${item.id}`,
    detailsEyebrow: "Bootstrap details",
    editEyebrow: "Edit bootstrap file",
    editSubmitLabel: "Save Changes",
    editSubmittingLabel: "Saving…",
    emptyDescription: "Add profile-level bootstrap context like role, tooling, or workspace rules for the selected profile.",
    emptySummaryLabel: "No summary available.",
    emptyTitle: "No Bootstrap Files",
    idLabel: "File Name",
    idPlaceholder: "AGENTS.md",
    inspectorEmptyDescription: "Open a bootstrap file to inspect or edit profile-specific runtime instructions.",
    inspectorEmptyTitle: "Bootstrap Inspector",
    loadingItemLabel: "Loading bootstrap file…",
    loadingListLabel: "Loading bootstrap files…",
    newLabel: "New File",
    profileMissingDescription: (profileId) =>
      `Bootstrap files are unavailable because the profile "${profileId}" is not available in the current runtime.`,
    refreshLabel: "Refresh",
    searchHint: "Search bootstrap files by file name, path, or the first content line.",
    searchPlaceholder: "Search bootstrap files…",
    summaryTitle: "Summary",
    surfaceDescription:
      "Manage profile-scoped bootstrap context files in the same workspace shell, with the same spacing, cards, and editing patterns as the rest of the platform.",
    surfaceEyebrow: "Workspace / Bootstrap",
    surfaceTitle: "Bootstrap Files",
    updateSuccessLabel: "Bootstrap file updated.",
    visibleLabel: (count) => `${count} visible`,
  },
};

function mapBootstrapItem(rawItem: Record<string, unknown>) {
  return {
    cardBadges: [
      { text: "bootstrap", className: "badge badge--ai" },
      { text: "profile", className: "badge" },
    ],
    content: String(rawItem.content || ""),
    detailBadges: [
      { text: "bootstrap", className: "badge badge--ai" },
      { text: String(rawItem.path || ""), className: "badge" },
    ],
    id: String(rawItem.file_name || ""),
    path: String(rawItem.path || ""),
    summary: String(rawItem.summary || ""),
  };
}

function defaultBootstrapTemplate() {
  return `# Bootstrap context

Add profile-specific runtime instructions here.
`;
}
