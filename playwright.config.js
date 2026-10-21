import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:8123/', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'node tools/serve.mjs 8123', url: 'http://localhost:8123/', reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
