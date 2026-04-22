import { expect, test } from "@playwright/test";

function json(body: unknown, init: { status?: number } = {}) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    status: init.status || 200,
  };
}

async function mockLoginPage(page: import("@playwright/test").Page) {
  await page.route("**/auth/login?**", async (route) => {
    await route.fulfill({
      body: "<!doctype html><html><body><h1>Mock Login</h1></body></html>",
      contentType: "text/html; charset=utf-8",
      status: 200,
    });
  });
}

test("redirects protected unauthenticated sessions to login with preserved next url", async ({ page }) => {
  await page.route("**/v1/auth/session", async (route) => {
    await route.fulfill(
      json({
        auth: {
          configured: true,
          protected_plugin_ids: ["afkbotui"],
        },
        authenticated: false,
        session: null,
      }),
    );
  });
  await mockLoginPage(page);

  await page.goto("?tab=task-flow&profile=default");

  await page.waitForURL(/\/auth\/login\?next=/);
  await expect(page).toHaveURL(/next=%2Fplugins%2Fafkbotui%2F%3Ftab%3Dtask-flow%26profile%3Ddefault/);
  await expect(page.getByRole("heading", { name: "Mock Login" })).toBeVisible();
});

test("redirects to login when the initial auth session probe returns ui_auth_required", async ({ page }) => {
  await page.route("**/v1/auth/session", async (route) => {
    await route.fulfill(
      json(
        {
          detail: {
            error_code: "ui_auth_required",
            message: "Session expired.",
          },
        },
        { status: 401 },
      ),
    );
  });
  await mockLoginPage(page);

  await page.goto("?tab=automations&profile=default");

  await page.waitForURL(/\/auth\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Mock Login" })).toBeVisible();
});

test("shows protected session state and supports logout redirect", async ({ page }) => {
  await page.route("**/v1/auth/session", async (route) => {
    await route.fulfill(
      json({
        auth: {
          configured: true,
          protected_plugin_ids: ["afkbotui"],
        },
        authenticated: true,
        session: {
          username: "tester",
        },
      }),
    );
  });
  await page.route("**/v1/auth/logout", async (route) => {
    await route.fulfill(json({ ok: true }));
  });
  await mockLoginPage(page);

  await page.goto("?tab=automations&profile=default");

  await expect(page.locator("#workspace-auth-status")).toHaveText("Signed in as tester");
  const signOut = page.getByRole("button", { name: "Sign out" });
  if (!(await signOut.isVisible())) {
    const menuButton = page.getByRole("button", { name: "Open workspace navigation" });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }
  }
  await expect(signOut).toBeVisible();
  await signOut.click();

  await page.waitForURL(/\/auth\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Mock Login" })).toBeVisible();
});

test("redirects to login when an authenticated API request returns ui_auth_required", async ({ page }) => {
  await page.route("**/v1/auth/session", async (route) => {
    await route.fulfill(
      json({
        auth: {
          configured: true,
          protected_plugin_ids: ["afkbotui"],
        },
        authenticated: true,
        session: {
          username: "tester",
        },
      }),
    );
  });
  await page.route("**/v1/plugins/afkbotui/automations**", async (route) => {
    await route.fulfill(
      json(
        {
          detail: {
            error_code: "ui_auth_required",
            message: "Session expired.",
          },
        },
        { status: 401 },
      ),
    );
  });
  await mockLoginPage(page);

  await page.goto("?tab=automations&profile=default");

  await page.waitForURL(/\/auth\/login\?next=/);
  await expect(page.getByRole("heading", { name: "Mock Login" })).toBeVisible();
});
