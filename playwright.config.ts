import { defineConfig } from "@playwright/test";

const PORT = 3100;

/**
 * Browser tests run in demo mode, so they never call the real API. They use the installed Edge
 * rather than a downloaded browser; set PW_CHANNEL=chrome, or to "" for Playwright's Chromium.
 */
const channel = process.env.PW_CHANNEL ?? "msedge";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 375, height: 812 }, // mobile first (CLAUDE.md §9)
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DEMO_MODE: "true" },
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
