import { createTextLibraryController } from "./text-library-controller.js";

export function createSkillsController({
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
      actionAttr: "data-skill-action",
      openAttr: "data-skill-open",
      formAttr: "data-skill-form",
      panelAttr: "data-skill-panel",
      gridClass: "cards-grid",
      cardClass: "skill-card",
      fields: {
        id: "name",
        content: "content",
      },
      idReadonlyOnEdit: true,
      createContentRows: 20,
      editContentRows: 22,
      defaultDraft() {
        return {
          id: "",
          content: defaultSkillTemplate(),
        };
      },
      mapItem(rawItem) {
        const availabilityBadge = rawItem.available
          ? { text: rawItem.execution_mode || "advisory", className: "badge badge--ai" }
          : { text: "unavailable", className: "badge badge--danger" };
        const pathBadge = rawItem.path
          ? { text: rawItem.path, className: "badge" }
          : null;
        return {
          id: rawItem.name,
          content: rawItem.content || "",
          summary: rawItem.summary || "",
          path: rawItem.path || "",
          cardBadges: [
            { text: "profile", className: "badge" },
            { text: "skill", className: "badge badge--accent" },
            availabilityBadge,
          ],
          detailBadges: [
            { text: "profile", className: "badge" },
            { text: rawItem.execution_mode || "advisory", className: "badge badge--accent" },
            ...(rawItem.available ? [] : [{ text: "missing requirements", className: "badge badge--danger" }]),
            ...(pathBadge ? [pathBadge] : []),
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
          return "Skill name is required.";
        }
        if (!draft.content.trim()) {
          return "Skill markdown is required.";
        }
        return "";
      },
      validateUpdate(draft) {
        if (!draft.id) {
          return "Skill name is required.";
        }
        if (!draft.content.trim()) {
          return "Skill markdown is required.";
        }
        return "";
      },
      async list(client, profileId, query) {
        const payload = await client.listSkills(profileId, { q: query });
        return payload.skills || [];
      },
      async get(client, profileId, itemId) {
        const payload = await client.getSkill(profileId, itemId);
        return payload.skill;
      },
      async create(client, profileId, draft) {
        const payload = await client.createSkill(profileId, {
          name: draft.id,
          markdown: draft.content,
        });
        return payload.skill;
      },
      async update(client, profileId, item, draft) {
        const payload = await client.updateSkill(profileId, item.id, {
          markdown: draft.content,
        });
        return payload.skill;
      },
      async remove(client, profileId, item) {
        await client.deleteSkill(profileId, item.id);
      },
      ui: {
        surfaceEyebrow: "Workspace / Skills",
        surfaceTitle: "Skills",
        surfaceDescription: "Profile-local skills are managed in the same card, modal, and inspector language as subagents and bootstrap files, bound to the currently selected profile.",
        refreshLabel: "Refresh",
        newLabel: "New Skill",
        visibleLabel: (count) => `${count} visible`,
        searchHint: "Search profile skills by name, path, summary, aliases, or execution mode.",
        searchPlaceholder: "Search skills…",
        loadingListLabel: "Loading skills…",
        loadingItemLabel: "Loading skill…",
        emptyTitle: "No Custom Skills",
        emptyDescription: "Add profile-local skills to keep reusable workflows and routing instructions attached to the selected profile.",
        profileMissingDescription: (profileId) => `Skills are unavailable because the profile "${profileId}" is not available in the current runtime.`,
        inspectorEmptyTitle: "Skill Inspector",
        inspectorEmptyDescription: "Open a skill to inspect or edit its profile-local SKILL.md definition.",
        editEyebrow: "Edit skill",
        detailsEyebrow: "Skill details",
        summaryTitle: "Summary",
        contentTitle: "SKILL.md",
        emptySummaryLabel: "No summary available.",
        createEyebrow: "Create Skill",
        createTitle: "New Skill",
        createDescription: "Add a profile-scoped SKILL.md file with the same modal workflow used across the rest of the workspace.",
        createSubmitLabel: "Create Skill",
        createSubmittingLabel: "Creating…",
        editSubmitLabel: "Save Changes",
        editSubmittingLabel: "Saving…",
        deleteEyebrow: "Delete Skill",
        deleteTitle: (item) => `Remove ${item.id}`,
        deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local skill definition from the selected profile.`,
        deleteSubmitLabel: "Delete Skill",
        deleteSubmittingLabel: "Deleting…",
        idLabel: "Name",
        contentLabel: "SKILL.md",
        idPlaceholder: "workflow-review",
        closePanelLabel: "Close skill panel",
        closeModalLabel: "Close skill modal",
        closeDeleteLabel: "Close delete skill modal",
        createSuccessLabel: "Skill created.",
        updateSuccessLabel: "Skill updated.",
        deleteSuccessLabel: "Skill deleted.",
      },
    },
  });
}

function defaultSkillTemplate() {
  return `---
description: "Use this skill when the task explicitly requires this workflow."
---

# New Skill

Use this skill when the selected profile needs a reusable workflow.

## Workflow
1. Inspect the task context.
2. Apply the specialized workflow.
3. Return the result in the expected format.

## Rules
- Keep scope narrow and reusable.
- Reference exact tools, files, or APIs when needed.
`;
}
