import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCi = Boolean(process.env.CI);
const hasPrebuiltDist = fs.existsSync(path.resolve(__dirname, 'dist/index.html'));
const previewCommand = 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  reporter: isCi ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    channel: isCi ? undefined : 'chrome',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--disable-gpu'],
    },
    trace: 'on-first-retry',
  },
  webServer: {
    command: hasPrebuiltDist ? previewCommand : `npm run build && ${previewCommand}`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !isCi,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
