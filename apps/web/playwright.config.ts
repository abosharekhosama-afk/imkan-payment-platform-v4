import {defineConfig, devices} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const credPath = path.resolve(__dirname, '../../.tmp/e2e-credentials.json');
const creds = fs.existsSync(credPath) ? JSON.parse(fs.readFileSync(credPath, 'utf8')) : null;

/** Prefer system Chrome — avoids flaky Chromium CDN downloads in restricted networks. */
const useSystemChrome = process.env.V4_E2E_USE_CHROMIUM !== 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {timeout: 20_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', {outputFile: '../../.tmp/e2e-results.json'}]],
  use: {
    baseURL: process.env.V4_E2E_BASE_URL || creds?.webBase || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video disabled: ffmpeg binary download is blocked in this environment (same CDN issue as Chromium).
    video: 'off',
    ...(useSystemChrome ? {channel: 'chrome' as const} : {...devices['Desktop Chrome']}),
  },
  webServer: process.env.V4_E2E_NO_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
