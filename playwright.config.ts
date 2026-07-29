import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools/harness/scenarios',
  timeout: 120_000,
  retries: 0,
  workers: 1, // scenarios share side-effects; run serially
  // Baseline screenshots are committed evidence, not throwaway run output.
  // `test-results/` and the harness run dir are both gitignored, so a visual
  // claim backed only by those has no artifact behind it once the run ends.
  // Anything captured with `toHaveScreenshot` lands here instead, flat and
  // per-platform (rasterisation differs between darwin and CI linux).
  // Regenerate deliberately with `npm run test:harness:update-snapshots`.
  snapshotDir: './tools/harness/baselines',
  snapshotPathTemplate: '{snapshotDir}/{arg}-{platform}{ext}',
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
