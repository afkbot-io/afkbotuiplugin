import { createTextLibraryController } from "./text-library-controller.js";

export function createBootstrapFilesController({
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
      actionAttr: "data-bootstrap-action",
      openAttr: "data-bootstrap-open",
      formAttr: "data-bootstrap-form",
      panelAttr: "data-bootstrap-panel",
      gridClass: "bootstrap-grid",
      cardClass: "bootstrap-card",
      fields: {
        id: "file_name",
        content: "content",
      },
      idReadonlyOnEdit: false,
      createContentRows: 18,
      editContentRows: 20,
      defaultDraft() {
        return {
          id: "",
          content: defaultBootstrapTemplate(),
        };
      },
      mapItem(rawItem) {
        return {
          id: rawItem.file_name,
          content: rawItem.content || "",
          summary: rawItem.summary || "",
          path: rawItem.path || "",
          cardBadges: [
            { text: "bootstrap", className: "badge badge--ai" },
            { text: "profile", className: "badge" },
          ],
          detailBadges: [
            { text: "bootstrap", className: "badge badge--ai" },
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
      async list(client, profileId, query) {
        const payload = await client.listBootstrapFiles(profileId, { q: query });
        return payload.bootstrap_files || [];
      },
      async get(client, profileId, itemId) {
        const payload = await client.getBootstrapFile(profileId, itemId);
        return payload.bootstrap_file;
      },
      async create(client, profileId, draft) {
        const payload = await client.createBootstrapFile(profileId, {
          file_name: draft.id,
          content: draft.content,
        });
        return payload.bootstrap_file;
      },
      async update(client, profileId, item, draft) {
        const payload = await client.updateBootstrapFile(profileId, item.id, {
          file_name: draft.id,
          content: draft.content,
        });
        return payload.bootstrap_file;
      },
      async remove(client, profileId, item) {
        await client.deleteBootstrapFile(profileId, item.id);
      },
      ui: {
        surfaceEyebrow: "Workspace / Bootstrap",
        surfaceTitle: "Bootstrap Files",
        surfaceDescription: "Manage profile-scoped bootstrap context files in the same workspace shell, with the same spacing, cards, and editing patterns as the rest of the platform.",
        refreshLabel: "Refresh",
        newLabel: "New File",
        visibleLabel: (count) => `${count} visible`,
        searchHint: "Search bootstrap files by file name, path, or the first content line.",
        searchPlaceholder: "Search bootstrap files…",
        loadingListLabel: "Loading bootstrap files…",
        loadingItemLabel: "Loading bootstrap file…",
        emptyTitle: "No Bootstrap Files",
        emptyDescription: "Add profile-level bootstrap context like role, tooling, or workspace rules for the selected profile.",
        profileMissingDescription: (profileId) => `Bootstrap files are unavailable because the profile "${profileId}" is not available in the current runtime.`,
        inspectorEmptyTitle: "Bootstrap Inspector",
        inspectorEmptyDescription: "Open a bootstrap file to inspect or edit profile-specific runtime instructions.",
        editEyebrow: "Edit bootstrap file",
        detailsEyebrow: "Bootstrap details",
        summaryTitle: "Summary",
        contentTitle: "Content",
        emptySummaryLabel: "No summary available.",
        createEyebrow: "Create Bootstrap File",
        createTitle: "New Bootstrap File",
        createDescription: "Add a profile-scoped file under the bootstrap directory without leaving the unified workspace shell.",
        createSubmitLabel: "Create File",
        createSubmittingLabel: "Creating…",
        editSubmitLabel: "Save Changes",
        editSubmittingLabel: "Saving…",
        deleteEyebrow: "Delete Bootstrap File",
        deleteTitle: (item) => `Remove ${item.id}`,
        deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local bootstrap file.`,
        deleteSubmitLabel: "Delete File",
        deleteSubmittingLabel: "Deleting…",
        idLabel: "File Name",
        contentLabel: "Content",
        idPlaceholder: "AGENTS.md",
        closePanelLabel: "Close bootstrap panel",
        closeModalLabel: "Close bootstrap modal",
        closeDeleteLabel: "Close delete bootstrap modal",
        createSuccessLabel: "Bootstrap file created.",
        updateSuccessLabel: "Bootstrap file updated.",
        deleteSuccessLabel: "Bootstrap file deleted.",
      },
    },
  });
}

function defaultBootstrapTemplate() {
  return `# Bootstrap context

Add profile-specific runtime instructions here.
`;
}
