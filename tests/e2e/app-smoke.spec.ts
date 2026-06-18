import { expect, test } from "@playwright/test";

async function openRoute(page: import("@playwright/test").Page, name: string) {
  const desktopLink = page.getByRole("link", { exact: true, name });
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
    return;
  }

  const menuButton = page.getByRole("button", { name: "Open workspace navigation" });
  if (await menuButton.isVisible()) {
    await menuButton.click();
    await page.getByRole("dialog", { name: "Workspace navigation" }).getByRole("link", { exact: true, name }).click();
    return;
  }

  await desktopLink.click();
}

test("dist workspace routes render against mock API without runtime failures", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("?tab=automations&profile=default");

  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  await expect(page.getByText("Nightly Sync")).toBeVisible();
  await page.getByRole("button", { name: /Nightly Sync/i }).click();
  await expect(page.getByRole("heading", { name: "Nightly Sync" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Sync task digests across the workspace.")).toBeVisible();

  await openRoute(page, "Task Flow");
  await expect(page.getByRole("heading", { name: "Task Flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Prepare rollout checklist/i })).toBeVisible();
  await page.getByLabel("Filter task board by flow").selectOption("flow-beta");
  await expect(page.getByRole("button", { name: /Prepare rollout checklist/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No tasks" }).first()).toBeVisible();
  await page.getByLabel("Filter task board by flow").selectOption("flow-alpha");
  await expect(page.getByRole("button", { name: /Prepare rollout checklist/i })).toBeVisible();
  await expect(page.getByText("Blocked")).toBeVisible();
  await page.getByRole("button", { name: /Prepare rollout checklist/i }).click();
  await expect(page.getByText("Inspector")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Live Activity" })).toBeVisible();
  await page.getByRole("button", { name: "Open Live Activity" }).click();
  await expect(page.getByRole("dialog", { name: "Live Activity" })).toBeVisible();
  await expect(page.getByText("Continue preparing the rollout checklist.")).toBeVisible();
  await expect(page.getByText("Planner is assembling the rollout sequence.")).toBeVisible();
  await page.getByRole("button", { name: "Close live activity modal" }).click();
  await page.getByRole("button", { name: "Close task panel" }).click();
  await page.getByRole("button", { name: "Flows" }).click();
  await expect(page.getByRole("heading", { name: "Project Flows" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Alpha Project" })).toBeVisible();
  await page.getByRole("button", { name: "Close flow manager modal" }).click();

  await openRoute(page, "Docs");
  await expect(page.getByRole("heading", { name: "Docs" })).toBeVisible();
  await page.getByRole("region", { name: "Document filters" }).getByLabel("Flow").selectOption("flow-alpha");
  const flowPlanCard = page.getByRole("button", { name: /Flow plan/i });
  await expect(flowPlanCard).toBeVisible();
  await expect(flowPlanCard.getByText("Проект: Alpha Project")).toBeVisible();
  await expect(page.getByText("Revision")).toBeVisible();
  await expect(flowPlanCard.getByText("draft", { exact: true })).toBeVisible();

  await openRoute(page, "Subagents");
  await expect(page.getByRole("heading", { name: "Subagents" })).toBeVisible();
  await expect(page.getByRole("button", { name: /planner/i })).toBeVisible();
  await page.getByRole("button", { name: /planner/i }).click();
  await expect(page.getByRole("heading", { name: "planner" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Project planning specialist.")).toBeVisible();
  await page.getByRole("button", { name: "Close subagent panel" }).click();

  await openRoute(page, "Skills");
  await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
  await expect(page.getByRole("button", { name: /reviewer/i })).toBeVisible();
  await page.getByRole("button", { name: /reviewer/i }).click();
  await expect(page.getByRole("heading", { name: "reviewer" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Review workflow for runtime changes.")).toBeVisible();
  await page.getByRole("button", { name: "Close skill panel" }).click();

  await openRoute(page, "Bootstrap");
  await expect(page.getByRole("heading", { name: "Bootstrap Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: /AGENTS.md/i })).toBeVisible();
  await page.getByRole("button", { name: /AGENTS.md/i }).click();
  await expect(page.getByRole("heading", { name: "AGENTS.md" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Workspace bootstrap rules.")).toBeVisible();
  await page.getByRole("button", { name: "Close bootstrap panel" }).click();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
