import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4182);
const baseURL = `http://127.0.0.1:${port}/plugins/afkbotui/`;

export default defineConfig({
  reporter: "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        baseURL,
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        baseURL,
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        baseURL,
      },
    },
  ],
  webServer: {
    command: `node tests/e2e/mock-server.mjs`,
    env: {
      PLAYWRIGHT_PORT: String(port),
    },
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
