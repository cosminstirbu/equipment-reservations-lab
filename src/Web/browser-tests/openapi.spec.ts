import { expect, test, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { password } from './identity-browser';

const require = createRequire(import.meta.url);
const services = [
  ['Inventory', 'API_INVENTORY_URL'],
  ['Reservations', 'API_RESERVATIONS_URL'],
  ['Notifications', 'API_NOTIFICATIONS_URL'],
] as const;

async function openDocumentation(page: Page, origin: string) {
  const allowed = new Set([new URL(origin).origin]);
  const unexpected = new Set<string>();
  page.context().on('request', (request) => {
    const address = new URL(request.url());
    if (
      ['http:', 'https:'].includes(address.protocol) &&
      !allowed.has(address.origin)
    )
      unexpected.add(address.origin);
  });
  await page.goto(new URL('/scalar/', origin).href);
  const authority = page.getByRole('combobox', {
    name: 'Auth URL',
    exact: true,
  });
  await expect(authority).toBeVisible();
  const provider = new URL((await authority.textContent())!.trim());
  expect(['localhost', '127.0.0.1', '[::1]'].includes(provider.hostname)).toBe(
    true,
  );
  allowed.add(provider.origin);
  return () =>
    expect(
      [...unexpected],
      'Only the configured API and identity origins may receive browser traffic',
    ).toEqual([]);
}

async function collectAccessibility(page: Page) {
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            options: unknown,
          ) => Promise<{ violations: { id: string; impact: string }[] }>;
        };
      }
    ).axe;
    return (
      await axe.run({
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      })
    ).violations.map(({ id, impact }) => ({ id, impact }));
  });
  return violations;
}

async function accessible(page: Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await collectAccessibility(page);
  test.info().annotations.push({
    type: 'accepted-vendor-accessibility',
    description: `Q-IMPL-003: bundled Scalar unchanged; observed ${JSON.stringify(violations)}`,
  });
}

async function signIn(page: Page, origin: string, username: string) {
  let tokenRequests = 0;
  let loginSubmissions = 0;
  let callbackCode: string | null = null;
  let callbackState: string | null = null;
  let callbackAt = 0;
  page.context().on('request', (request) => {
    if (
      new URL(request.url()).pathname.includes('/login-actions/authenticate') &&
      request.method() === 'POST'
    )
      loginSubmissions++;
    if (
      new URL(request.url()).pathname.endsWith(
        '/protocol/openid-connect/token',
      ) &&
      request.method() === 'POST'
    )
      tokenRequests++;
  });
  const exchangePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/protocol/openid-connect/token'),
  );
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Authorize', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForURL((url) =>
    url.pathname.endsWith('/protocol/openid-connect/auth'),
  );
  popup.on('framenavigated', (frame) => {
    if (frame !== popup.mainFrame()) return;
    const address = new URL(frame.url());
    if (
      address.origin === new URL(origin).origin &&
      address.pathname === '/oauth/callback'
    ) {
      const fields = new URLSearchParams(address.hash.slice(1));
      if (fields.has('code') && callbackCode === null) {
        callbackCode = fields.get('code');
        callbackAt = Date.now();
        callbackState = fields.get('state');
      }
    }
  });
  const authorize = new URL(popup.url());
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorize.searchParams.get('response_type')).toBe('code');
  expect(authorize.searchParams.get('response_mode')).toBe('fragment');
  expect(authorize.searchParams.get('client_id')).toBe('equipment-docs');
  expect(authorize.searchParams.get('redirect_uri')).toBe(
    new URL('/oauth/callback', origin).href,
  );
  await popup.locator('#username').fill(username);
  await popup.locator('#password').evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, password(username));
  await popup.locator('#kc-login').click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  const exchange = await exchangePromise;
  const exchangeFields = new URLSearchParams(
    exchange.request().postData() ?? '',
  );
  expect(
    exchangeFields.getAll('client_id').length === 1 &&
      exchangeFields.get('client_id') === 'equipment-docs',
    'Public client ID must remain exact at exchange',
  ).toBe(true);
  expect(
    (await exchange.request().headerValue('authorization')) === null,
    'Public code exchange must not carry a client secret header',
  ).toBe(true);
  expect(
    exchangeFields.get('redirect_uri') ===
      authorize.searchParams.get('redirect_uri'),
    'Code exchange redirect must exactly match authorization redirect',
  ).toBe(true);
  const callbackMatchesExchange =
    callbackCode !== null && callbackCode === exchangeFields.get('code');
  const callbackStateMatches =
    callbackState !== null &&
    callbackState === authorize.searchParams.get('state');
  expect(
    callbackMatchesExchange,
    'Only the issued callback code may be exchanged',
  ).toBe(true);
  expect(
    callbackStateMatches,
    'OAuth callback state must match its authorize request',
  ).toBe(true);
  const verifierMatchesChallenge =
    createHash('sha256')
      .update(exchangeFields.get('code_verifier') ?? '')
      .digest('base64url') === authorize.searchParams.get('code_challenge');
  expect(
    verifierMatchesChallenge,
    'OAuth exchange verifier must match the popup S256 challenge',
  ).toBe(true);
  if (exchange.status() !== 200) {
    const result: unknown = await exchange.json();
    const code =
      result &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string' &&
      [
        'invalid_grant',
        'invalid_client',
        'unauthorized_client',
        'invalid_request',
      ].includes(result.error)
        ? result.error
        : 'unclassified';
    const description =
      result &&
      typeof result === 'object' &&
      'error_description' in result &&
      typeof result.error_description === 'string'
        ? result.error_description.toLowerCase()
        : '';
    const subtype = description.includes('pkce')
      ? 'pkce'
      : description.includes('code not valid')
        ? 'invalid-code'
        : description.includes('expired')
          ? 'expired'
          : 'unclassified';
    throw new Error(
      `OAuth exchange failed: status ${exchange.status()}, category ${code}/${subtype}, POST count ${tokenRequests}, login submissions ${loginSubmissions}, callback age ms ${Date.now() - callbackAt}`,
    );
  }
  expect(await exchange.headerValue('access-control-allow-origin')).toBe(
    new URL(origin).origin,
  );
  await expect(page.getByText(/^Access token$/iu).first()).toBeVisible();
}

for (const [service, variable] of services) {
  test(`${service} Scalar loads only local resources and records vendor accessibility`, async ({
    page,
  }) => {
    const origin = process.env[variable];
    if (!origin)
      throw new Error(`Set ${variable} for documentation verification.`);
    const verifyTraffic = await openDocumentation(page, origin);
    await expect(
      page.getByRole('main', {
        name: new RegExp(`API documentation for ${service}`, 'u'),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Agent Scalar', exact: true }),
    ).toHaveCount(0);
    await accessible(page);
    verifyTraffic();
  });
}

test('Scalar performs S256 popup login and does not restore authorization in a fresh session', async ({
  page,
  browser,
}) => {
  const origin = process.env.API_INVENTORY_URL;
  if (!origin)
    throw new Error('Set API_INVENTORY_URL for documentation verification.');
  const verifyTraffic = await openDocumentation(page, origin);
  await signIn(page, origin, 'employee-a');
  await page
    .getByRole('button', {
      name: 'Test Request (get /api/equipment)',
      exact: true,
    })
    .click();
  const readPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/^\/+/u, '/') ===
      '/api/equipment',
  );
  await page
    .getByRole('dialog', { name: 'API Client' })
    .getByRole('button', { name: /^Send get request/u })
    .click();
  const read = await readPromise;
  const hasBearer =
    (await read.request().headerValue('authorization'))?.startsWith(
      'Bearer ',
    ) === true;
  expect(hasBearer, 'Scalar UI must attach its issued bearer token').toBe(true);
  expect(read.status()).toBe(200);
  expect(new URL(read.url()).origin).toBe(new URL(origin).origin);
  const persisted = await page.evaluate(() =>
    Object.values(localStorage as unknown as Record<string, string>).some(
      (value) => /access_token|refresh_token|eyJ/.test(value),
    ),
  );
  expect(persisted).toBe(false);
  const fresh = await browser.newContext();
  const clean = await fresh.newPage();
  const verifyFreshTraffic = await openDocumentation(clean, origin);
  expect(
    await clean.evaluate(() =>
      Object.values(localStorage as unknown as Record<string, string>).some(
        (value) => /access_token|refresh_token|eyJ/.test(value),
      ),
    ),
  ).toBe(false);
  await clean
    .getByRole('button', {
      name: 'Test Request (get /api/equipment)',
      exact: true,
    })
    .click();
  const anonymousPromise = clean.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.replace(/^\/+/u, '/') ===
      '/api/equipment',
  );
  await clean
    .getByRole('dialog', { name: 'API Client' })
    .getByRole('button', { name: /^Send get request/u })
    .click();
  expect((await anonymousPromise).status()).toBe(401);
  verifyFreshTraffic();
  verifyTraffic();
  await fresh.close();
});

for (const username of ['employee-a', 'approver']) {
  test(`Scalar reservation writes preserve ${username} permissions`, async ({
    page,
  }) => {
    const origin = process.env.API_RESERVATIONS_URL;
    if (!origin)
      throw new Error(
        'Set API_RESERVATIONS_URL for documentation verification.',
      );
    const verifyTraffic = await openDocumentation(page, origin);
    await signIn(page, origin, username);
    await accessible(page);
    await page
      .getByRole('link', {
        name: 'Reserve equipment HTTP Method: POST',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: 'Test Request (post /api/reservations)',
        exact: true,
      })
      .click();
    const client = page.getByRole('dialog', { name: 'API Client' });
    const editor = client.getByRole('textbox', { name: '', exact: true });
    const start = new Date(Date.now() + 7 * 86400000);
    const input = JSON.stringify({
      equipmentId: 'camera-001',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600000).toISOString(),
    });
    await editor.click();
    await editor.press('ControlOrMeta+A');
    await page.keyboard.insertText(input);
    const bookingPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/^\/+/u, '/') ===
          '/api/reservations' && response.request().method() === 'POST',
    );
    await client.getByRole('button', { name: /^Send post request/u }).click();
    const booking = await bookingPromise;
    expect(new URL(booking.url()).origin).toBe(new URL(origin).origin);
    expect(booking.status()).toBe(username === 'employee-a' ? 201 : 403);
    await accessible(page);
    if (username === 'employee-a') {
      const location = booking.headers().location;
      expect(
        typeof location === 'string' &&
          location.startsWith('/api/reservations/'),
      ).toBe(true);
      const id = location.split('/').at(-1)!;
      await client
        .getByRole('button', { name: 'Close Client', exact: true })
        .click();
      await page
        .getByRole('link', {
          name: 'Cancel my reservation HTTP Method: POST',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: 'Test Request (post /api/reservations/{id}/cancel)',
          exact: true,
        })
        .click();
      const pathRow = client.getByRole('row').filter({ hasText: 'id' });
      await pathRow
        .getByRole('combobox', { name: 'Value', exact: true })
        .fill(id);
      const cancelledPromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.replace(/^\/+/u, '/') ===
          `/api/reservations/${id}/cancel`,
      );
      await client.getByRole('button', { name: /^Send post request/u }).click();
      expect((await cancelledPromise).status()).toBe(200);
      await accessible(page);
    }
    verifyTraffic();
  });
}

for (const failure of ['cancelled', 'unavailable']) {
  test(`Scalar does not authenticate after ${failure} provider login`, async ({
    page,
  }) => {
    const origin = process.env.API_INVENTORY_URL;
    if (!origin)
      throw new Error('Set API_INVENTORY_URL for documentation verification.');
    const verifyTraffic = await openDocumentation(page, origin);
    if (failure === 'unavailable') {
      await page
        .context()
        .route('**/protocol/openid-connect/auth**', (route) =>
          route.abort('connectionrefused'),
        );
    }
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Authorize', exact: true }).click();
    const popup = await popupPromise;
    if (failure === 'cancelled')
      await expect(popup.locator('#username')).toBeVisible();
    else
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
    await popup.close();
    await expect(page.getByText(/^Access token$/iu)).toHaveCount(0);
    await page
      .getByRole('button', {
        name: 'Test Request (get /api/equipment)',
        exact: true,
      })
      .click();
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.replace(/^\/+/u, '/') ===
        '/api/equipment',
    );
    await page
      .getByRole('dialog', { name: 'API Client' })
      .getByRole('button', { name: /^Send get request/u })
      .click();
    expect((await responsePromise).status()).toBe(401);
    await accessible(page);
    verifyTraffic();
  });
}

test('Dedicated OAuth callback preserves its fragment and is inert and accessible', async ({
  browser,
}) => {
  const origin = process.env.API_INVENTORY_URL;
  if (!origin)
    throw new Error('Set API_INVENTORY_URL for documentation verification.');
  const context = await browser.newContext();
  await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
  const page = await context.newPage();
  const destinations: string[] = [];
  context.on('request', (request) => {
    destinations.push(new URL(request.url()).origin);
    expect(new URL(request.url()).hash.length === 0).toBe(true);
  });
  const address = new URL(
    '/oauth/callback#code=opaque-test-code&state=opaque-test-state',
    origin,
  );
  await page.goto(address.href);
  expect(new URL(page.url()).hash === address.hash).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Return to API documentation' }),
  ).toBeVisible();
  await expect(page.locator('script')).toHaveCount(0);
  expect(await collectAccessibility(page)).toEqual([]);
  expect(
    destinations.every((destination) => destination === new URL(origin).origin),
  ).toBe(true);
  await context.close();
});
