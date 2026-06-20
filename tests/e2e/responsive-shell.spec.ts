import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { height: 1100, name: "desktop", width: 1440 },
  { height: 800, name: "mini-laptop", width: 1280 },
  { height: 1366, name: "tablet", width: 1024 },
];

test("shell stays compact and within viewport across desktop, mini-laptop, and tablet breakpoints", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Responsive shell audit runs in Chromium only.");

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width });

    for (const route of ["automations", "task-flow"] as const) {
      await page.goto(`?tab=${route}&profile=default`);

      const sidebar = page.locator(".workspace-sidebar");
      await expect(sidebar).toBeVisible();
      const sidebarBox = await sidebar.boundingBox();

      expect(sidebarBox?.x ?? 999).toBeGreaterThanOrEqual(0);
      expect(sidebarBox?.y ?? 999).toBeLessThanOrEqual(1);
      expect(sidebarBox?.height ?? 0).toBeLessThanOrEqual(viewport.height);
      expect(sidebarBox?.width ?? 0).toBeLessThanOrEqual(300);

      const overflow = await page.evaluate(() => {
        const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return width - window.innerWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);

      await expect(page.getByLabel("Select profile")).toBeVisible();
      await expect(page.locator(".section-head").first()).toBeVisible();
    }
  }
});
