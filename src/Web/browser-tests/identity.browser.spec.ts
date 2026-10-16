import { expect, Page, test } from '@playwright/test';
import { createRequire } from 'node:module';

import { login, logout } from './identity-browser';

const require = createRequire(import.meta.url);

async function accessible(page: Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(): Promise<{
            violations: { id: string; impact: string | null }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run()).violations.map(({ id, impact }) => ({
      id,
      impact,
    }));
  });
  expect(violations).toEqual([]);
}

test('real provider code flow, cancelled navigation, account switch and provider logout retain no browser authority', async ({
  page,
}) => {
  let protectedCalls = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) protectedCalls++;
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  expect(protectedCalls).toBe(0);
  await accessible(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#username')).toBeVisible();
  const authorization = new URL(page.url());
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorization.searchParams.get('response_type')).toBe('code');
  await page.goBack();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  expect(protectedCalls).toBe(0);
  await login(page, 'employee-a');
  await expect(
    page.getByRole('button', { name: 'Book equipment', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('header')).toContainText('Employee');
  expect(new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).search).toBe('');
  const storedAuthority = await page.evaluate(() =>
    [localStorage, sessionStorage].some((storage) =>
      Object.keys(storage).some(
        (key) =>
          /token|profile/i.test(key) ||
          /eyJ[A-Za-z0-9_-]+\./.test(storage.getItem(key) ?? ''),
      ),
    ),
  );
  expect(storedAuthority).toBe(false);
  await accessible(page);
  await logout(page);
  await login(page, 'employee-b');
  await expect(page.locator('header')).toContainText('employee-b');
  await logout(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#username')).toBeVisible();
});

for (const [username, role] of [
  ['approver', 'Approver'],
  ['equipment-staff', 'EquipmentStaff'],
]) {
  test(`real ${role} account has advisory/inbox access and no implied Employee controls`, async ({
    page,
  }) => {
    await page.goto('/');
    await login(page, username);
    await expect(page.locator('header')).toContainText(role);
    await expect(
      page.getByRole('button', { name: 'Check availability' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Refresh notifications' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Book equipment', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Refresh reservations' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh notifications' }).click();
    await expect(page.getByRole('status').last()).toContainText(
      /Notifications refreshed|No notifications observed/,
    );
    await accessible(page);
    await logout(page);
  });
}

test('provider outage clears the local session immediately and permits explicit provider sign-out retry', async ({
  page,
}) => {
  await page.goto('/');
  await login(page, 'employee-a');
  await page.route(
    '**/realms/equipment/.well-known/openid-configuration',
    (route) => route.abort('failed'),
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry provider sign-out' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Book equipment', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('header')).toContainText('Signed out locally');
  await accessible(page);
  await page.unroute('**/realms/equipment/.well-known/openid-configuration');
  const origin = new URL(page.url()).origin;
  const returned = page.waitForEvent(
    'framenavigated',
    (frame) =>
      frame === page.mainFrame() && new URL(frame.url()).origin === origin,
  );
  await page.getByRole('button', { name: 'Retry provider sign-out' }).click();
  await returned;
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
});

test('expiry clears a real provider session without refreshing or replaying protected operations', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await login(page, 'employee-a');
  let tokenCalls = 0;
  let writes = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.endsWith('/protocol/openid-connect/token')
    )
      tokenCalls++;
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      request.method() === 'POST'
    )
      writes++;
  });
  await page.clock.fastForward(125000);
  await expect(page.locator('header')).toContainText('Session expired');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Book equipment', exact: true }),
  ).toHaveCount(0);
  expect(tokenCalls).toBe(0);
  expect(writes).toBe(0);
  await accessible(page);
});
