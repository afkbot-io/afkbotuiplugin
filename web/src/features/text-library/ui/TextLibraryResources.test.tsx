import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { BootstrapPage } from "@/features/bootstrap/BootstrapPage";
import { bootstrapDefinition } from "@/features/bootstrap/bootstrap.definition";
import { SkillsPage } from "@/features/skills/SkillsPage";
import { skillsDefinition } from "@/features/skills/skills.definition";
import { SubagentsPage } from "@/features/subagents/SubagentsPage";
import { subagentsDefinition } from "@/features/subagents/subagents.definition";

function renderWithClient(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("text-library resource definitions", () => {
  it("maps subagents api calls and validation rules", async () => {
    const api = {
      createSubagent: vi.fn(async () => ({
        subagent: {
          content: "Created markdown",
          name: "builder",
          path: "profiles/default/builder.md",
          summary: "Builds things",
        },
      })),
      deleteSubagent: vi.fn(async () => undefined),
      getSubagent: vi.fn(async () => ({
        subagent: {
          content: "Existing markdown",
          name: "builder",
          path: "profiles/default/builder.md",
          summary: "Builds things",
        },
      })),
      listSubagents: vi.fn(async () => ({
        subagents: [
          {
            content: "Existing markdown",
            name: "builder",
            path: "profiles/default/builder.md",
            summary: "Builds things",
          },
        ],
      })),
      updateSubagent: vi.fn(async () => ({
        subagent: {
          content: "Updated markdown",
          name: "builder",
          path: "profiles/default/builder.md",
          summary: "Builds things",
        },
      })),
    };

    const list = await subagentsDefinition.list(api, "default", "build");
    expect(api.listSubagents).toHaveBeenCalledWith("default", { q: "build" });
    expect(list[0].cardBadges[1].text).toBe("subagent");

    const item = await subagentsDefinition.get(api, "default", "builder");
    expect(item.path).toBe("profiles/default/builder.md");

    const created = await subagentsDefinition.create(api, "default", {
      content: "Created markdown",
      id: "builder",
    });
    expect(created.summary).toBe("Builds things");
    expect(api.createSubagent).toHaveBeenCalledWith("default", {
      markdown: "Created markdown",
      name: "builder",
    });

    await subagentsDefinition.update(api, "default", created, {
      content: "Updated markdown",
      id: "builder",
    });
    expect(api.updateSubagent).toHaveBeenCalledWith("default", "builder", {
      markdown: "Updated markdown",
    });

    await subagentsDefinition.remove(api, "default", created);
    expect(api.deleteSubagent).toHaveBeenCalledWith("default", "builder");

    expect(subagentsDefinition.defaultDraft().content).toContain("# backend-engineer");
    expect(subagentsDefinition.defaultDraft().content).toContain("task.context.get");
    expect(subagentsDefinition.defaultDraft().content).toContain("task.doc.put");
    expect(subagentsDefinition.validateCreate({ content: "", id: "" })).toBe("Subagent name is required.");
    expect(subagentsDefinition.validateUpdate({ content: "", id: "builder" }, created)).toBe(
      "Subagent markdown is required.",
    );
  });

  it("maps skills api calls, unavailable state, and validation rules", async () => {
    const api = {
      createSkill: vi.fn(async () => ({
        skill: {
          available: false,
          content: "Created skill",
          execution_mode: "agent",
          name: "review",
          path: "profiles/default/review/SKILL.md",
          summary: "Review workflow",
        },
      })),
      deleteSkill: vi.fn(async () => undefined),
      getSkill: vi.fn(async () => ({
        skill: {
          available: false,
          content: "Existing skill",
          execution_mode: "agent",
          name: "review",
          path: "profiles/default/review/SKILL.md",
          summary: "Review workflow",
        },
      })),
      listSkills: vi.fn(async () => ({
        skills: [
          {
            aliases: ["reviewer"],
            available: false,
            content: "Existing skill",
            execution_mode: "agent",
            missing_requirements: ["token"],
            name: "review",
            path: "profiles/default/review/SKILL.md",
            summary: "Review workflow",
          },
        ],
      })),
      updateSkill: vi.fn(async () => ({
        skill: {
          available: false,
          content: "Updated skill",
          execution_mode: "agent",
          name: "review",
          path: "profiles/default/review/SKILL.md",
          summary: "Review workflow",
        },
      })),
    };

    const list = await skillsDefinition.list(api, "default", "review");
    expect(api.listSkills).toHaveBeenCalledWith("default", { q: "review" });
    expect(list[0].cardBadges[2].text).toBe("unavailable");
    expect(list[0].detailBadges.some((badge) => badge.text === "missing requirements")).toBe(true);

    const item = await skillsDefinition.get(api, "default", "review");
    expect(item.id).toBe("review");

    await skillsDefinition.create(api, "default", {
      content: "Created skill",
      id: "review",
    });
    expect(api.createSkill).toHaveBeenCalledWith("default", {
      markdown: "Created skill",
      name: "review",
    });

    await skillsDefinition.update(api, "default", item, {
      content: "Updated skill",
      id: "review",
    });
    expect(api.updateSkill).toHaveBeenCalledWith("default", "review", {
      markdown: "Updated skill",
    });

    await skillsDefinition.remove(api, "default", item);
    expect(api.deleteSkill).toHaveBeenCalledWith("default", "review");

    expect(skillsDefinition.defaultDraft().content).toContain("# New Skill");
    expect(skillsDefinition.validateCreate({ content: "", id: "" })).toBe("Skill name is required.");
    expect(skillsDefinition.validateUpdate({ content: "", id: "review" }, item)).toBe("Skill markdown is required.");
    expect(skillsDefinition.ui.profileMissingDescription?.("blue")).toContain('"blue"');
  });

  it("maps bootstrap api calls, rename payloads, and empty-content validation rules", async () => {
    const api = {
      createBootstrapFile: vi.fn(async () => ({
        bootstrap_file: {
          content: "",
          file_name: "AGENTS.md",
          path: "profiles/default/bootstrap/AGENTS.md",
          summary: "Bootstrap context",
        },
      })),
      deleteBootstrapFile: vi.fn(async () => undefined),
      getBootstrapFile: vi.fn(async () => ({
        bootstrap_file: {
          content: "",
          file_name: "AGENTS.md",
          path: "profiles/default/bootstrap/AGENTS.md",
          summary: "Bootstrap context",
        },
      })),
      listBootstrapFiles: vi.fn(async () => ({
        bootstrap_files: [
          {
            content: "",
            file_name: "AGENTS.md",
            path: "profiles/default/bootstrap/AGENTS.md",
            summary: "Bootstrap context",
          },
        ],
      })),
      updateBootstrapFile: vi.fn(async () => ({
        bootstrap_file: {
          content: "",
          file_name: "README.md",
          path: "profiles/default/bootstrap/README.md",
          summary: "Bootstrap context",
        },
      })),
    };

    const list = await bootstrapDefinition.list(api, "default", "AGENTS");
    expect(api.listBootstrapFiles).toHaveBeenCalledWith("default", { q: "AGENTS" });
    expect(list[0].cardBadges[0].text).toBe("bootstrap");

    const item = await bootstrapDefinition.get(api, "default", "AGENTS.md");
    expect(item.id).toBe("AGENTS.md");

    await bootstrapDefinition.create(api, "default", {
      content: "",
      id: "AGENTS.md",
    });
    expect(api.createBootstrapFile).toHaveBeenCalledWith("default", {
      content: "",
      file_name: "AGENTS.md",
    });

    const updated = await bootstrapDefinition.update(api, "default", item, {
      content: "",
      id: "README.md",
    });
    expect(updated.id).toBe("README.md");
    expect(api.updateBootstrapFile).toHaveBeenCalledWith("default", "AGENTS.md", {
      content: "",
      file_name: "README.md",
    });

    await bootstrapDefinition.remove(api, "default", item);
    expect(api.deleteBootstrapFile).toHaveBeenCalledWith("default", "AGENTS.md");

    expect(bootstrapDefinition.defaultDraft().content).toContain("# Bootstrap context");
    expect(bootstrapDefinition.validateCreate({ content: "", id: "" })).toBe("Bootstrap file name is required.");
    expect(bootstrapDefinition.validateUpdate({ content: "", id: "" }, item)).toBe("Bootstrap file name is required.");
    expect(bootstrapDefinition.validateCreate({ content: "", id: "AGENTS.md" })).toBe("");
  });
});

describe("text-library resource pages", () => {
  it("renders native wrapper pages with their definition-specific labels", async () => {
    const config = {
      poll_interval_sec: 5,
    };
    const notify = vi.fn();
    const profiles: Array<{ id?: string | null; title?: string | null }> = [];
    const updateConfig = vi.fn(async (patch: Record<string, unknown>) => patch);
    const subagentsApi = {
      listSubagents: vi.fn(async () => ({
        subagents: [
          {
            content: "Spec",
            name: "builder",
            path: "profiles/default/builder.md",
            summary: "Builds things",
          },
        ],
      })),
    };
    const skillsApi = {
      listSkills: vi.fn(async () => ({
        skills: [
          {
            available: true,
            content: "Skill",
            execution_mode: "advisory",
            name: "review",
            path: "profiles/default/review/SKILL.md",
            summary: "Review workflow",
          },
        ],
      })),
    };
    const bootstrapApi = {
      listBootstrapFiles: vi.fn(async () => ({
        bootstrap_files: [
          {
            content: "",
            file_name: "AGENTS.md",
            path: "profiles/default/bootstrap/AGENTS.md",
            summary: "Bootstrap context",
          },
        ],
      })),
    };

    renderWithClient(
      <SubagentsPage
        active
        api={subagentsApi}
        config={config}
        notify={notify}
        profileId="default"
        profiles={profiles}
        updateConfig={updateConfig}
      />,
    );
    expect(await screen.findByText("Subagents")).toBeInTheDocument();
    expect(await screen.findByText("builder")).toBeInTheDocument();

    renderWithClient(
      <SkillsPage
        active
        api={skillsApi}
        config={config}
        notify={notify}
        profileId="default"
        profiles={profiles}
        updateConfig={updateConfig}
      />,
    );
    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(await screen.findByText("review")).toBeInTheDocument();

    renderWithClient(
      <BootstrapPage
        active
        api={bootstrapApi}
        config={config}
        notify={notify}
        profileId="default"
        profiles={profiles}
        updateConfig={updateConfig}
      />,
    );
    expect(await screen.findByText("Bootstrap Files")).toBeInTheDocument();
    expect(await screen.findByText("AGENTS.md")).toBeInTheDocument();
  });
});
