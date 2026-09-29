import { defineConfig } from '@playwright/test';

/**
 * e2e（07 §8 / 04 §7）：默认对 localhost:5173（vite dev，代理 /api 到 3001）。
 * 需要后端 + PG（docker compose -f docker/compose.dev.yml up -d）。
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'bun run --filter @linkbase/web dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
