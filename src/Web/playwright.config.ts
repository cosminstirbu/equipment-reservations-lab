import { defineConfig } from '@playwright/test';

const baseURL = process.env.API_WEB_URL;
if (!baseURL)
  throw new Error('Set API_WEB_URL to the running Aspire Web resource URL.');
const url = new URL(baseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Browser verification is restricted to the local demo.');
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
