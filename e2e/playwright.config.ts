import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm dev:desktop",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
  },
});
