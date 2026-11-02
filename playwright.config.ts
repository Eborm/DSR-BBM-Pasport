import { defineConfig } from "@playwright/test";

/**
 * Acceptance tests: a real browser walks through the scenarios in the web application.
 * `npx playwright test` starts the demo itself (local chain, demo data and web app), so the
 * chain starts clean on every run. Stop a running demo first, otherwise port 8545 is in use.
 */
export default defineConfig({
  testDir: "./acceptance",
  // All scenarios share one chain, so they run one after another.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "acceptance-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 900 },
    // One screenshot of the end result per scenario, visible in the report.
    screenshot: "on",
    // Only needed when the browser lives at a fixed location. Do not set it on a normal computer.
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: "npm run demo",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
