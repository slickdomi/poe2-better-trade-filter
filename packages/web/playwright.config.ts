import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the app's own dev server as a real browser — the `web` docker
 * compose service must already be running (`docker compose up -d web`)
 * before this runs; it doesn't start one itself, since these tests are
 * meant to run from a separate `e2e` container over the host network (see
 * docker-compose.yml's comment on why: Vite rejects a compose-network
 * container hostname's Host header).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
