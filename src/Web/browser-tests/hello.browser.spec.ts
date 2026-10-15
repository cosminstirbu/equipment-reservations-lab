import { test, expect, Page } from '@playwright/test';
import { createRequire } from 'node:module';
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
    const result = await axe.run();
    return result.violations.map(({ id, impact }) => ({ id, impact }));
  });
  expect(violations).toEqual([]);
}

test('real services complete two keyboard sends with distinct correlation IDs', async ({
  page,
}) => {
  const equipmentReply = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/equipment') && response.status() === 200,
  );
  await page.goto('/hello');
  const items = (await (await equipmentReply).json()) as {
    id: string;
    name: string;
  }[];
  const camera = items.find((item) => item.id === 'camera-001')!;
  expect(camera.name).toBe('Demo Camera');
  await expect(page.getByRole('heading', { name: camera.name })).toBeVisible();
  await accessible(page);
  const send = page.getByRole('button', { name: 'Send hello' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(send).toBeFocused();
  const ids: string[] = [];
  for (const key of ['Enter', 'Space']) {
    if (
      !(await send.evaluate((element) => document.activeElement === element))
    ) {
      await page.keyboard.press('Tab');
      await expect(send).toBeFocused();
    }
    const response = page.waitForResponse(
      (reply) =>
        reply.url().endsWith('/api/hellos') &&
        reply.request().method() === 'POST',
    );
    await page.keyboard.press(key);
    const accepted = await response;
    expect(accepted.status()).toBe(202);
    expect(accepted.request().postDataJSON()).toEqual({
      equipmentId: camera.id,
    });
    const result = (await accepted.json()) as { correlationId: string };
    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
    );
    await expect(page.getByRole('status')).toHaveText(
      `Hello received for ${camera.name}`,
    );
    await expect(page.locator('code')).toHaveText(result.correlationId);
    ids.push(result.correlationId);
    await expect(send).toBeEnabled();
    await expect(send).toBeFocused();
    await accessible(page);
  }
  expect(ids[0]).not.toBe(ids[1]);
});

test('UI-only held HTTP boundary shows accessible loading and pending states', async ({
  page,
}) => {
  let releaseInventory!: () => void;
  const inventoryGate = new Promise<void>((resolve) => {
    releaseInventory = resolve;
  });
  await page.route('**/api/equipment', async (route) => {
    await inventoryGate;
    await route.fulfill({ json: [{ id: 'camera-001', name: 'Demo Camera' }] });
  });
  await page.goto('/hello');
  await expect(page.getByRole('status')).toHaveText('Loading equipment…');
  await accessible(page);
  releaseInventory();
  await expect(page.getByRole('button', { name: 'Send hello' })).toBeEnabled();
  await page.route('**/api/hellos', (route) =>
    route.fulfill({
      status: 202,
      json: { correlationId: 'c648ddbb-ceab-4668-9e04-a5597c125248' },
    }),
  );
  await page.route('**/api/notifications/**', (route) =>
    route.fulfill({ status: 404, json: { title: 'Pending' } }),
  );
  await page.getByRole('button', { name: 'Send hello' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Waiting for notification…',
  );
  await expect(page.getByRole('button', { name: 'Send hello' })).toBeDisabled();
  await accessible(page);
  await page.unroute('**/api/notifications/**');
  await page.route('**/api/notifications/**', (route) =>
    route.fulfill({ status: 503, json: { title: 'Unavailable' } }),
  );
  await expect(page.getByRole('status')).toHaveText(
    'Unable to receive notification. Check Notifications and try again.',
  );
  await expect(page.getByRole('button', { name: 'Send hello' })).toBeFocused();
  await accessible(page);
});

test('UI-only unavailable HTTP boundary announces an accessible error', async ({
  page,
}) => {
  await page.route('**/api/equipment', (route) =>
    route.fulfill({ status: 503, json: { title: 'Inventory unavailable' } }),
  );
  await page.goto('/hello');
  await expect(page.getByRole('status')).toHaveText(
    'Unable to load equipment. Check Inventory and reload.',
  );
  await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  await accessible(page);
});
