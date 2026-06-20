import { expect, test } from "@playwright/test";

test("mobile shell stays compact and modal controls remain reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only audit.");

  await page.goto("?tab=task-flow&profile=default");

  const mobileBarBox = await page.locator(".workspace-mobile-bar").boundingBox();
  expect(mobileBarBox?.height ?? 999).toBeLessThan(120);

  await expect(page.getByRole("heading", { name: "Task Flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Prepare rollout checklist/i })).toBeVisible();

  await page.getByRole("button", { name: "Flows" }).click();
  const flowDialog = page.getByRole("dialog", { name: "Flow Library" });
  await expect(flowDialog).toBeVisible();
  await expect(flowDialog.getByRole("button", { name: "Close flow manager modal" })).toBeVisible();

  const dialogBox = await flowDialog.boundingBox();
  expect(dialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()!.width);

  await flowDialog.getByRole("button", { name: "Close flow manager modal" }).click();

  await page.getByRole("button", { name: /Prepare rollout checklist/i }).click();
  await expect(page.getByRole("button", { name: "Close task panel" })).toBeVisible();
});

test("mobile automations filters stack cleanly and navigation moves into the burger sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only audit.");

  await page.goto("?tab=automations&profile=default");

  const menuButton = page.getByRole("button", { name: "Open workspace navigation" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Task Flow" })).toBeVisible();
  await page.getByRole("button", { name: "Close mobile navigation" }).click();

  const search = page.getByRole("searchbox", { name: "Search automations" });
  const trigger = page.getByLabel("Filter trigger");
  const status = page.getByLabel("Filter status");
  const includeDeleted = page.locator(".board-toolbar__checkbox");
  const apply = page.getByRole("button", { name: "Apply Filters" });

  await expect(search).toBeVisible();
  await expect(trigger).toBeVisible();
  await expect(status).toBeVisible();
  await expect(includeDeleted).toContainText("Include deleted");
  await expect(apply).toBeVisible();

  const searchBox = await search.boundingBox();
  const triggerBox = await trigger.boundingBox();
  const statusBox = await status.boundingBox();
  const checkboxBox = await includeDeleted.boundingBox();
  const applyBox = await apply.boundingBox();

  expect(searchBox?.width ?? 0).toBeGreaterThan(240);
  expect(triggerBox?.width ?? 0).toBeGreaterThan(240);
  expect(statusBox?.width ?? 0).toBeGreaterThan(240);
  expect(checkboxBox?.width ?? 0).toBeGreaterThan(220);
  expect((applyBox?.y ?? 0)).toBeGreaterThan((statusBox?.y ?? 0) + 20);
});
