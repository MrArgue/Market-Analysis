import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command:
      "node node_modules/wrangler/bin/wrangler.js dev --local --port 8787",
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: !process.env.CI,
    env: {
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: "./.wrangler/e2e.log",
    },
  },
});
