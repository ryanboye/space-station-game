import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools/harness/scenarios',
  timeout: 120_000,
  retries: 0,
  workers: 1, // scenarios share side-effects; run serially
  use: {
    baseURL: process.env.HARNESS_BASE_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 900 },
    // capture everything on failure — bots read these directly
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/harness-runs/latest/summary.json' }],
  ],
  webServer: process.env.HARNESS_SKIP_SERVER
    ? undefined
    : {
        command: 'npm run dev -- --port 5173',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
