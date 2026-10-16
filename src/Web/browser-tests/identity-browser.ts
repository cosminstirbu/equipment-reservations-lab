import { expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

function password(username: string) {
  const path = process.env.IDENTITY_BROWSER_ACCOUNTS_FILE;
  if (!path)
    throw new Error(
      'Set IDENTITY_BROWSER_ACCOUNTS_FILE to the isolated local account fixture.',
    );
  const accounts: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!accounts || typeof accounts !== 'object' || !(username in accounts))
    throw new Error('Required local browser account is unavailable.');
  const value: unknown = (accounts as Record<string, unknown>)[username];
  if (typeof value !== 'string' || !value)
    throw new Error('Required local browser credential is unavailable.');
  return value;
}

export async function login(
  page: Page,
  username: string,
  equipmentReady = true,
) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(username);
  await page.locator('#password').evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, password(username));
  await page.locator('#kc-login').click();
  await expect(page.locator('header')).toContainText(username);
  if (equipmentReady)
    await expect(
      page.getByRole('button', { name: 'Reload equipment' }),
    ).toBeEnabled();
}

export async function logout(page: Page) {
  const origin = new URL(page.url()).origin;
  const returned = page.waitForEvent(
    'framenavigated',
    (frame) =>
      frame === page.mainFrame() && new URL(frame.url()).origin === origin,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await returned;
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Reload equipment' }),
  ).toHaveCount(0);
}
