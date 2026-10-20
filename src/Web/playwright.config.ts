import { defineConfig } from '@playwright/test';

// Playwright's failure-page snapshots can contain OAuth fields even with traces off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

const baseURL = process.env.API_WEB_URL;
if (!baseURL)
  throw new Error('Set API_WEB_URL to the running Aspire Web resource URL.');
const url = new URL(baseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Browser verification is restricted to the local demo.');
}

for (const name of [
  'API_INVENTORY_URL',
  'API_RESERVATIONS_URL',
  'API_NOTIFICATIONS_URL',
]) {
  const value = process.env[name];
  if (!value) continue;
  const api = new URL(value);
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) ||
    api.port === '0' ||
    api.username ||
    api.password ||
    api.search ||
    api.hash ||
    api.pathname !== '/'
  ) {
    throw new Error(`${name} must be an explicit loopback service origin.`);
  }
}

export default defineConfig({
  testDir: './browser-tests',
  timeout: 45000,
  expect: { timeout: 35000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {},
  },
});
