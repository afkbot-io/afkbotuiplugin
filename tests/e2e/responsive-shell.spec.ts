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

      const topbar = page.locator(".topbar__shell");
      await expect(topbar).toBeVisible();
      const topbarBox = await topbar.boundingBox();

      expect(topbarBox?.y ?? 999).toBeLessThanOrEqual(18);
      expect((topbarBox?.x ?? 999)).toBeGreaterThanOrEqual(0);
      expect((topbarBox?.x ?? 0) + (topbarBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
      expect(topbarBox?.height ?? 999).toBeLessThanOrEqual(viewport.width <= 1024 ? 152 : 86);

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
