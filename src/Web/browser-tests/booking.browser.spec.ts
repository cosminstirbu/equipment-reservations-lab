import { expect, test, Page, APIRequestContext } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Reservation } from '../src/app/booking/booking-api';

const require = createRequire(import.meta.url);
test.use({ timezoneId: 'Europe/Bucharest' });

for (const failed of [false, true]) {
  test(`history refresh restores keyboard focus after ${failed ? 'failure' : 'success'}`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/equipment', (route) =>
      route.fulfill({
        json: [{ id: 'camera-001', name: 'Demo Camera', operational: true }],
      }),
    );
    await page.route('**/api/reservations', async (route) => {
      await gate;
      await route.fulfill(
        failed
          ? { status: 503, json: { code: 'persistence_unavailable' } }
          : { json: [] },
      );
    });
    await page.goto('/');
    const refresh = page.getByRole('button', { name: 'Refresh reservations' });
    await refresh.focus();
    await page.keyboard.press('Space');
    await expect(refresh).toBeDisabled();
    await expect(page.getByRole('status').nth(1)).toHaveText(
      'Loading reservations…',
    );
    release();
    await expect(refresh).toBeEnabled();
    await expect(page.getByRole('status').nth(1)).toContainText(
      failed ? 'Unable to load reservations' : 'No reservations yet.',
    );
    await expect(refresh).toBeFocused({ timeout: 1000 });
  });

  test(`equipment reload restores keyboard focus after ${failed ? 'failure' : 'success'}`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route('**/api/equipment', async (route) => {
      calls++;
      if (calls > 1) {
        await gate;
      }
      await route.fulfill(
        failed && calls > 1
          ? { status: 503, json: { code: 'inventory_unavailable' } }
          : {
              json: [
                { id: 'camera-001', name: 'Demo Camera', operational: true },
              ],
            },
      );
    });
    await page.goto('/');
    const reload = page.getByRole('button', { name: 'Reload equipment' });
    await expect(reload).toBeEnabled();
    await reload.focus();
    await page.keyboard.press('Space');
    await expect(reload).toBeDisabled();
    await expect(page.getByRole('status').first()).toHaveText(
      'Loading equipment…',
    );
    release();
    await expect(reload).toBeEnabled();
    await expect(page.getByRole('status').first()).toContainText(
      failed ? 'Unable to load equipment' : 'Choose operational equipment',
    );
    await expect(reload).toBeFocused({ timeout: 1000 });
  });
}

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

function futureInterval() {
  const start = new Date(Date.now() + 10 * 86400000);
  start.setUTCSeconds(0, 0);
  // Unique test-owned interval; completed reservations are retained as history.
  start.setUTCMinutes(
    start.getUTCMinutes() + Math.floor(Math.random() * 100000),
  );
  return {
    equipmentId: 'camera-001',
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3600000).toISOString(),
  };
}

function localTime(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (name: string) =>
    parts.find((value) => value.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

async function fill(page: Page, input = futureInterval()) {
  await page
    .getByLabel('Equipment', { exact: true })
    .selectOption(input.equipmentId);
  await page
    .getByLabel('Start time', { exact: true })
    .fill(localTime(input.startAt));
  await page
    .getByLabel('End time', { exact: true })
    .fill(localTime(input.endAt));
  return input;
}

test('real services book, conflict, cancel, rebook and explicitly observe both event IDs by keyboard', async ({
  page,
  request,
}) => {
  const created: string[] = [];
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Book equipment', exact: true }),
    ).toBeEnabled();
    const input = await fill(page);
    const availability = page.getByRole('button', {
      name: 'Check availability',
    });
    await availability.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').first()).toContainText(
      'Available (advisory)',
    );
    await expect(availability).toBeFocused();
    const book = page.getByRole('button', {
      name: 'Book equipment',
      exact: true,
    });
    await book.focus();
    const reply = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/reservations') &&
        response.request().method() === 'POST',
    );
    await page.keyboard.press('Space');
    const response = await reply;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toEqual(input);
    const reservation = (await response.json()) as Reservation;
    created.push(reservation.id);
    await expect(book).toBeFocused();
    await expect(page.getByRole('status').first()).toContainText(
      'Reservation saved: Confirmed',
    );
    await expect(
      page
        .getByRole('heading', { name: 'Latest saved reservation' })
        .locator('..'),
    ).toContainText('not yet observed');
    await accessible(page);

    const conflict = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/reservations') &&
        response.request().method() === 'POST',
    );
    await page.keyboard.press('Enter');
    expect((await conflict).status()).toBe(409);
    await expect(page.getByRole('status').first()).toContainText(
      'now conflicts',
    );
    await expect(book).toBeFocused();
    await accessible(page);

    const refresh = page.getByRole('button', { name: 'Refresh reservations' });
    await refresh.focus();
    await page.keyboard.press('Enter');
    const row = page.locator(`[data-reservation-id="${reservation.id}"]`);
    await expect(row).toContainText('Confirmed');
    await expect(refresh).toBeFocused();
    await expect(row).toContainText('Europe/Bucharest');
    await expect(row).toContainText('UTC+');
    const cancel = row.getByRole('button', { name: /^Cancel reservation for/ });
    await cancel.focus();
    const cancelledReply = page.waitForResponse((response) =>
      response.url().endsWith(`/api/reservations/${reservation.id}/cancel`),
    );
    await page.keyboard.press('Space');
    const cancelled = (await (await cancelledReply).json()) as Reservation;
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.confirmationEventId).toBe(reservation.confirmationEventId);
    expect(cancelled.cancellationEventId).toBeTruthy();
    await expect(row).toContainText('Cancelled');
    await expect(refresh).toBeFocused();
    await accessible(page);

    const inboxRefresh = page.getByRole('button', {
      name: 'Refresh notifications',
    });
    for (const eventId of [
      reservation.confirmationEventId,
      cancelled.cancellationEventId!,
    ]) {
      // Test-owned observation repeats explicit refresh, never application polling.
      await expect(async () => {
        await inboxRefresh.focus();
        await page.keyboard.press('Enter');
        await expect(inboxRefresh).toBeEnabled();
        await expect(page.locator(`[data-event-id="${eventId}"]`)).toBeVisible({
          timeout: 1000,
        });
      }).toPass({ timeout: 35000, intervals: [500, 1000, 2000] });
    }
    await expect(inboxRefresh).toBeFocused();
    await expect(row).toContainText('Cancellation notification observed');
    await accessible(page);

    await book.focus();
    const rebookReply = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/reservations') &&
        response.request().method() === 'POST',
    );
    await page.keyboard.press('Enter');
    const rebookResponse = await rebookReply;
    expect(rebookResponse.status()).toBe(201);
    created.push(((await rebookResponse.json()) as Reservation).id);
    expect(created[0]).not.toBe(created[1]);
  } finally {
    for (const id of created) {
      expect(
        (await request.post(`/api/reservations/${id}/cancel`)).status(),
      ).toBe(200);
    }
  }
});

test('supplementary held boundaries expose accessible loading, empty, pending and dependency states', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/equipment', async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText(
    'Loading equipment…',
  );
  await accessible(page);
  release();
  await expect(page.getByRole('status').first()).toHaveText(
    'No equipment available.',
  );
  await expect(
    page.getByRole('button', { name: 'Book equipment', exact: true }),
  ).toBeDisabled();
  await accessible(page);
  await page.unroute('**/api/equipment');
  await page.getByRole('button', { name: 'Reload equipment' }).click();
  await expect(
    page.getByRole('button', { name: 'Book equipment', exact: true }),
  ).toBeEnabled();
  await fill(page);
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  await page.route('**/api/reservations', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] });
      return;
    }
    await writeGate;
    await route.fulfill({
      status: 503,
      json: { code: 'inventory_unavailable' },
    });
  });
  const book = page.getByRole('button', {
    name: 'Book equipment',
    exact: true,
  });
  await book.click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Saving reservation…',
  );
  await expect(book).toBeDisabled();
  await expect(page.getByLabel('Equipment', { exact: true })).toBeDisabled();
  await accessible(page);
  releaseWrite();
  await expect(page.getByRole('status').first()).toContainText(
    'Inventory is unavailable. No reservation was created',
  );
  await expect(book).toBeFocused();
  await accessible(page);
  await page.getByRole('button', { name: 'Refresh reservations' }).click();
  await expect(page.getByRole('status').nth(1)).toHaveText(
    'No reservations yet.',
  );
  await page.route('**/api/notifications', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.getByRole('button', { name: 'Refresh notifications' }).click();
  await expect(page.getByRole('status').nth(2)).toHaveText(
    'No notifications observed yet.',
  );
  await accessible(page);
});

test('supplementary real browser requires explicit repeated DST offsets and rejects nonexistent local times', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Equipment', { exact: true })
    .selectOption('camera-001');
  await page.getByLabel('Start time', { exact: true }).fill('2030-03-31T03:30');
  await page.getByLabel('End time', { exact: true }).fill('2030-03-31T05:00');
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'does not exist in Europe/Bucharest',
  );
  await accessible(page);
  await page.getByLabel('Start time', { exact: true }).fill('2030-10-27T03:30');
  await page.getByLabel('End time', { exact: true }).fill('2030-10-27T03:45');
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Choose an offset for the repeated start time',
  );
  await page.getByLabel('Start timezone offset').selectOption('+03:00');
  await page.getByLabel('End timezone offset').selectOption('+02:00');
  await page.route('**/api/availability?**', (route) =>
    route.fulfill({
      json: {
        equipmentId: 'camera-001',
        startAt: '2030-10-27T00:30:00Z',
        endAt: '2030-10-27T01:45:00Z',
        available: true,
        advisory: true,
      },
    }),
  );
  const reply = page.waitForResponse((response) =>
    response.url().includes('/api/availability?'),
  );
  await page.getByRole('button', { name: 'Check availability' }).click();
  const url = new URL((await reply).url());
  expect(url.searchParams.get('startAt')).toBe('2030-10-27T00:30:00.000Z');
  expect(url.searchParams.get('endAt')).toBe('2030-10-27T01:45:00.000Z');
  await accessible(page);
});

async function fixture(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><html lang="en"><head><title>Local hostile origin fixture</title></head><body><h1>Hostile origin fixture</h1></body></html>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://hostile.localhost:${(server.address() as AddressInfo).port}`,
  };
}

async function history(request: APIRequestContext) {
  const response = await request.get('/api/reservations');
  expect(response.status()).toBe(200);
  return (await response.json()) as Reservation[];
}

for (const opaque of [false, true]) {
  test(`actual ${opaque ? 'opaque null' : 'hostile alias'} browser writes receive server 403 with unchanged durable history`, async ({
    page,
    request,
    baseURL,
  }) => {
    const localFixture = await fixture();
    const input = futureInterval();
    const creation = await request.post('/api/reservations', { data: input });
    expect(creation.status()).toBe(201);
    const own = (await creation.json()) as Reservation;
    try {
      const before = await history(request);
      await page.goto(localFixture.url);
      let target = page.mainFrame();
      if (opaque) {
        await page.evaluate(() => {
          const iframe = document.createElement('iframe');
          iframe.sandbox.add('allow-scripts', 'allow-forms');
          iframe.srcdoc =
            '<!doctype html><html><head><title>Opaque origin fixture</title></head><body></body></html>';
          document.body.append(iframe);
        });
        await expect.poll(() => page.frames().length).toBe(2);
        target = page.frames()[1];
      }
      const createURL = new URL('/api/reservations', baseURL).toString();
      const rejectedCreate = page.waitForResponse(
        (response) =>
          response.url() === createURL &&
          response.request().method() === 'POST',
      );
      await target.evaluate(
        async ({ url, body }) => {
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body,
          });
        },
        {
          url: createURL,
          body: JSON.stringify({ ...input, equipmentId: 'laptop-001' }),
        },
      );
      const createResponse = await rejectedCreate;
      expect(createResponse.status()).toBe(403);
      // Edge/Playwright's network capture omits security headers here. Assert
      // the real browser context origin and actual server response separately;
      // literal incoming Origin branches have independent HTTP/SQL coverage.
      expect(await target.evaluate(() => window.origin)).toBe(
        opaque ? 'null' : localFixture.url,
      );

      const rejectedForm = page.waitForResponse(
        (response) =>
          response.url() === createURL &&
          response.request().method() === 'POST',
      );
      await target.evaluate(
        ({ url, input }) => {
          const frame = document.createElement('iframe');
          frame.name = 'booking-target';
          document.body.append(frame);
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = url;
          form.target = frame.name;
          for (const [name, value] of Object.entries(input)) {
            const field = document.createElement('input');
            field.name = name;
            field.value = value;
            form.append(field);
          }
          document.body.append(form);
          form.submit();
        },
        { url: createURL, input: { ...input, equipmentId: 'laptop-001' } },
      );
      expect((await rejectedForm).status()).toBe(403);

      const helloURL = new URL('/api/hellos', baseURL).toString();
      const rejectedHello = page.waitForResponse(
        (response) =>
          response.url() === helloURL && response.request().method() === 'POST',
      );
      await target.evaluate(async (url) => {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ equipmentId: 'camera-001' }),
        });
      }, helloURL);
      expect((await rejectedHello).status()).toBe(403);

      const cancelURL = new URL(
        `/api/reservations/${own.id}/cancel`,
        baseURL,
      ).toString();
      const rejectedCancel = page.waitForResponse(
        (response) =>
          response.url() === cancelURL &&
          response.request().method() === 'POST',
      );
      await target.evaluate((url) => {
        const frame = document.createElement('iframe');
        frame.name = 'cancel-target';
        document.body.append(frame);
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.target = frame.name;
        document.body.append(form);
        form.submit();
      }, cancelURL);
      const cancelResponse = await rejectedCancel;
      expect(cancelResponse.status()).toBe(403);
      expect(await target.evaluate(() => window.origin)).toBe(
        opaque ? 'null' : localFixture.url,
      );
      expect(await history(request)).toEqual(before);
      expect(
        (await history(request)).find((value) => value.id === own.id)
          ?.cancellationEventId,
      ).toBeNull();
    } finally {
      const cleanup = await request.post(`/api/reservations/${own.id}/cancel`);
      expect(cleanup.status()).toBe(200);
      const cancelled = (await cleanup.json()) as Reservation;
      console.log(
        'SEC_BROWSER_EXPECTED',
        JSON.stringify({
          origin: opaque ? 'null' : localFixture.url,
          reservationId: own.id,
          confirmationEventId: own.confirmationEventId,
          cancellationEventId: cancelled.cancellationEventId,
          hostileInterval: { ...input, equipmentId: 'laptop-001' },
          expectedTransitions: ['ReservationConfirmed', 'ReservationCancelled'],
        }),
      );
      localFixture.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        localFixture.server.close((error) =>
          error ? reject(error) : resolve(),
        ),
      );
    }
  });
}
