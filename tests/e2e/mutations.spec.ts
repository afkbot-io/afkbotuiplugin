import { expect, test } from "@playwright/test";

test("built dist supports core create and delete flows across workspace surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Mutation smoke runs once on desktop Chromium.");

  const suffix = `${Date.now()}`;
  const automationName = `Smoke Automation ${suffix}`;
  const flowName = `Smoke Flow ${suffix}`;
  const skillName = `smoke-skill-${suffix}`;

  await page.goto("?tab=automations&profile=default");
  await page.getByRole("button", { name: "New Automation" }).click();
  await page.getByLabel("Name").fill(automationName);
  await page.getByLabel("Prompt").fill("Smoke automation prompt.");
  await page.getByRole("button", { name: "Create Automation" }).click();
  await expect(page.getByRole("button", { name: new RegExp(automationName) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(automationName) }).click();
  await expect(page.getByRole("heading", { name: automationName })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${automationName}` })
    .getByRole("button", { exact: true, name: "Delete Automation" })
    .click();
  await expect(page.getByText(automationName)).toHaveCount(0);

  await page.getByRole("link", { name: "Task Flow" }).click();
  await page.getByRole("button", { name: "Flows" }).click();
  const flowDialog = page.getByRole("dialog", { name: "Project Flows" });
  await flowDialog.getByLabel("Flow name").fill(flowName);
  await flowDialog.getByLabel("Purpose").fill("Mutation smoke flow.");
  await flowDialog.getByRole("button", { name: "Add Flow" }).click();
  await expect(flowDialog.getByRole("heading", { name: flowName })).toBeVisible();

  const flowCard = flowDialog.locator(".flow-manager__item", { hasText: flowName }).first();
  await flowCard.getByRole("button", { name: "Delete" }).click();
  await flowCard.getByRole("button", { name: "Confirm Delete" }).click();
  await expect(flowDialog.getByText(flowName)).toHaveCount(0);
  await flowDialog.getByRole("button", { name: "Close flow manager modal" }).click();

  await page.getByRole("link", { name: "Skills" }).click();
  await page.getByRole("button", { name: "New Skill" }).click();
  const createDialog = page.getByRole("dialog", { name: "New Skill" });
  await createDialog.getByLabel("Name").fill(skillName);
  await createDialog.getByRole("button", { name: "Create Skill" }).click();
  await expect(page.getByRole("heading", { name: skillName })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("SKILL.md").fill("---\ndescription: Smoke skill\n---\n\n# Smoke\n\nUpdated content.");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Updated content.")).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: `Remove ${skillName}` })
    .getByRole("button", { exact: true, name: "Delete Skill" })
    .click();
  await expect(page.getByText(skillName)).toHaveCount(0);
});
