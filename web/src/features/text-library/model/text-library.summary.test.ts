import { describe, expect, it } from "vitest";

import { buildTextLibrarySummary } from "@/features/text-library/model/text-library.summary";

describe("buildTextLibrarySummary", () => {
  it("falls back to markdown body text when backend summary is only a heading", () => {
    const summary = buildTextLibrarySummary(
      "# Reviewer",
      `# Reviewer

## Задача:
Координировать работу всех субагентов-ревьюеров и составлять общий отчет.
`,
      "Reviewer",
    );

    expect(summary).toContain("Задача:");
    expect(summary).toContain("Координировать работу всех субагентов-ревьюеров");
  });

  it("keeps descriptive backend summaries intact", () => {
    const summary = buildTextLibrarySummary(
      "Review workflow for runtime changes.",
      `# Reviewer

## Задача:
Координировать работу ревьюеров.
`,
      "Reviewer",
    );

    expect(summary).toBe("Review workflow for runtime changes.");
  });

  it("strips frontmatter and markdown formatting from fallback content", () => {
    const summary = buildTextLibrarySummary(
      "",
      `---
name: reviewer
---

# Reviewer

- **Coordinates** the review queue
- _Keeps_ findings visible
`,
      "Reviewer",
    );

    expect(summary).toBe("Coordinates the review queue Keeps findings visible");
  });

  it("falls back to the body when the backend summary is only the item title", () => {
    const summary = buildTextLibrarySummary(
      "Reviewer",
      `# Reviewer

Coordinates the review queue and keeps reviewer output actionable.
`,
      "Reviewer",
    );

    expect(summary).toBe("Coordinates the review queue and keeps reviewer output actionable.");
  });

  it("does not corrupt underscore-delimited technical identifiers", () => {
    const summary = buildTextLibrarySummary(
      "",
      `# Config

Use task_flow_actor_ref and task_flow_board_limit_per_column when tuning the workspace.
`,
      "Config",
    );

    expect(summary).toContain("task_flow_actor_ref");
    expect(summary).toContain("task_flow_board_limit_per_column");
  });
});
