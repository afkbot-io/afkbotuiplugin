import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";
import { buildTextLibrarySummary } from "@/features/text-library/model/text-library.summary";

export const skillsDefinition: TextLibraryDefinition = {
  entity: "skills",
  cardClass: "skill-card",
  contentFieldName: "content",
  contentRows: {
    create: 20,
    edit: 22,
  },
  gridClass: "cards-grid",
  defaultDraft() {
    return {
      content: defaultSkillTemplate(),
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
      listSkills: (profileId: string, params: { q: string }) => Promise<{ skills?: Array<Record<string, unknown>> }>;
    }).listSkills(profileId, { q: query });
    return (payload.skills || []).map(mapSkillItem);
  },
  async get(api, profileId, itemId) {
    const payload = await (api as {
      getSkill: (profileId: string, itemId: string) => Promise<{ skill: Record<string, unknown> }>;
    }).getSkill(profileId, itemId);
    return mapSkillItem(payload.skill);
  },
  async create(api, profileId, draft) {
    const payload = await (api as {
      createSkill: (
        profileId: string,
        payload: { markdown: string; name: string },
      ) => Promise<{ skill: Record<string, unknown> }>;
    }).createSkill(profileId, {
      markdown: draft.content,
      name: draft.id,
    });
    return mapSkillItem(payload.skill);
  },
  async update(api, profileId, item, draft) {
    const payload = await (api as {
      updateSkill: (
        profileId: string,
        itemId: string,
        payload: { markdown: string },
      ) => Promise<{ skill: Record<string, unknown> }>;
    }).updateSkill(profileId, item.id, {
      markdown: draft.content,
    });
    return mapSkillItem(payload.skill);
  },
  async remove(api, profileId, item) {
    await (api as {
      deleteSkill: (profileId: string, itemId: string) => Promise<void>;
    }).deleteSkill(profileId, item.id);
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
  ui: {
    closeDeleteLabel: "Close delete skill modal",
    closeModalLabel: "Close skill modal",
    closePanelLabel: "Close skill panel",
    contentLabel: "SKILL.md",
    contentTitle: "SKILL.md",
    createDescription: "Add a profile-scoped SKILL.md file with the same modal workflow used across the rest of the workspace.",
    createEyebrow: "Create Skill",
    createSubmitLabel: "Create Skill",
    createSubmittingLabel: "Creating…",
    createSuccessLabel: "Skill created.",
    createTitle: "New Skill",
    deleteDescription: (item) => `Delete ${item.id}? This removes the profile-local skill definition from the selected profile.`,
    deleteEyebrow: "Delete Skill",
    deleteSubmitLabel: "Delete Skill",
    deleteSubmittingLabel: "Deleting…",
    deleteSuccessLabel: "Skill deleted.",
    deleteTitle: (item) => `Remove ${item.id}`,
    detailsEyebrow: "Skill details",
    editEyebrow: "Edit skill",
    editSubmitLabel: "Save Changes",
    editSubmittingLabel: "Saving…",
    emptyDescription:
      "Add profile-local skills to keep reusable workflows and routing instructions attached to the selected profile.",
    emptySummaryLabel: "No summary available.",
    emptyTitle: "No Custom Skills",
    idLabel: "Name",
    idPlaceholder: "workflow-review",
    inspectorEmptyDescription: "Open a skill to inspect or edit its profile-local SKILL.md definition.",
    inspectorEmptyTitle: "Skill Inspector",
    loadingItemLabel: "Loading skill…",
    loadingListLabel: "Loading skills…",
    newLabel: "New Skill",
    profileMissingDescription: (profileId) =>
      `Skills are unavailable because the profile "${profileId}" is not available in the current runtime.`,
    refreshLabel: "Refresh",
    searchHint: "Search profile skills by name, path, summary, aliases, or execution mode.",
    searchPlaceholder: "Search skills…",
    summaryTitle: "Summary",
    surfaceDescription:
      "Profile-local skills are managed in the same card, modal, and inspector language as subagents and bootstrap files, bound to the currently selected profile.",
    surfaceEyebrow: "Workspace / Skills",
    surfaceTitle: "Skills",
    updateSuccessLabel: "Skill updated.",
    visibleLabel: (count) => `${count} visible`,
  },
};

function mapSkillItem(rawItem: Record<string, unknown>) {
  const available = Boolean(rawItem.available);
  const executionMode = String(rawItem.execution_mode || "advisory");
  const path = String(rawItem.path || "");
  const id = String(rawItem.name || "");
  const content = String(rawItem.content || "");
  return {
    cardBadges: [
      { text: "profile", className: "badge" },
      { text: "skill", className: "badge badge--accent" },
      available
        ? { text: executionMode, className: "badge badge--ai" }
        : { text: "unavailable", className: "badge badge--danger" },
    ],
    content,
    detailBadges: [
      { text: "profile", className: "badge" },
      { text: executionMode, className: "badge badge--accent" },
      ...(available ? [] : [{ text: "missing requirements", className: "badge badge--danger" }]),
      ...(path ? [{ text: path, className: "badge" }] : []),
    ],
    id,
    path,
    summary: buildTextLibrarySummary(rawItem.summary, content, id),
  };
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
