import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { clearTimeout } from 'node:timers';

const requireWeb = createRequire(
  new URL('../src/Web/package.json', import.meta.url),
);
const { chromium, expect: baseExpect } = requireWeb('@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });
const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const executablePath =
  process.env.BROWSER_EXECUTABLE ?? (existsSync(edge) ? edge : undefined);
let stage = 'configuration';

function localUrl(name) {
  const url = new URL(process.env[name]);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.protocol, 'http:');
  return url.origin;
}

async function openSection(page, title) {
  const heading = page.getByRole('heading', { name: title });
  const section = heading.locator('..');
  if (!(await section.locator('.hider').first().isVisible())) {
    await heading.click();
  }
  return section;
}

async function rabbit(page) {
  const origin = localUrl('RABBIT_URL');
  const prefix = process.env.RABBIT_PREFIX ?? `admin-ui-${randomUUID()}`;
  assert.match(prefix, /^admin-ui-[a-f0-9-]+$/);
  const queue = `${prefix}-messages`;
  const exchange = `${prefix}-exchange`;
  const payload = `${prefix}-payload`;
  const authorization = `Basic ${Buffer.from(`${process.env.RABBIT_USERNAME}:${process.env.RABBIT_PASSWORD}`).toString('base64')}`;
  const api = async (method, path) =>
    page.request.fetch(`${origin}/api/${path}`, {
      method,
      headers: { Authorization: authorization },
      timeout: 10_000,
    });

  let cleanupFailed = false;

  try {
    stage = 'rabbit login';
    await page.goto(origin);
    await page
      .locator('input[name="username"]')
      .fill(process.env.RABBIT_USERNAME);
    await page
      .locator('input[name="password"]')
      .fill(process.env.RABBIT_PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Overview', exact: true }),
    ).toBeVisible();

    stage = 'rabbit create queue';
    await page
      .getByRole('link', { name: /^Queues/ })
      .first()
      .click();
    const queueSection = await openSection(page, 'Add a new queue');
    await queueSection.locator('input[name="name"]').fill(queue);
    await queueSection
      .getByRole('button', { name: 'Add queue', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: queue, exact: true }),
    ).toBeVisible();

    stage = 'rabbit create exchange';
    await page
      .getByRole('link', { name: 'Exchanges', exact: true })
      .first()
      .click();
    const exchangeSection = await openSection(page, 'Add a new exchange');
    await exchangeSection.locator('input[name="name"]').fill(exchange);
    await exchangeSection
      .getByRole('button', { name: 'Add exchange', exact: true })
      .click();
    await page.getByRole('link', { name: exchange, exact: true }).click();

    stage = 'rabbit bind queue';
    await openSection(page, /^Bindings/);
    const binding = page.locator('form[action="#/bindings"]');
    await binding.locator('input[name="destination"]').fill(queue);
    await binding.locator('input[name="routing_key"]').fill('admin-ui');
    await binding.getByRole('button', { name: 'Bind', exact: true }).click();
    await expect(
      page.getByRole('link', { name: queue, exact: true }),
    ).toBeVisible();

    stage = 'rabbit publish message';
    const publish = await openSection(page, 'Publish message');
    await publish.locator('input[name="routing_key"]').fill('admin-ui');
    await publish.locator('textarea[name="payload"]').fill(payload);
    const published = page.waitForResponse(
      (response) =>
        response.url().includes('/publish') &&
        response.request().method() === 'POST',
    );
    await publish
      .getByRole('button', { name: 'Publish message', exact: true })
      .click();
    assert.equal((await (await published).json()).routed, true);

    stage = 'rabbit inspect message';
    await page.getByRole('link', { name: queue, exact: true }).first().click();
    const get = await openSection(page, 'Get messages');
    await get
      .getByRole('button', { name: 'Get Message(s)', exact: true })
      .click();
    await expect(page.locator('#msg-wrapper')).toContainText(payload);

    stage = 'rabbit purge queue';
    const purge = await openSection(page, 'Purge');
    const purged = page.waitForResponse(
      (response) =>
        response.url().endsWith('/contents') &&
        response.request().method() === 'DELETE',
    );
    await purge
      .getByRole('button', { name: 'Purge Messages', exact: true })
      .click();
    assert.ok((await purged).ok());
    await expect
      .poll(
        async () => {
          const response = await api(
            'GET',
            `queues/%2F/${encodeURIComponent(queue)}`,
          );
          assert.ok(response.ok());
          return (await response.json()).messages_ready;
        },
        { timeout: 15_000 },
      )
      .toBe(0);

    stage = 'rabbit inspect consumer';
    const consumerQueue = process.env.RABBIT_CONSUMER_QUEUE;
    assert.ok(consumerQueue?.startsWith(prefix));
    await page
      .getByRole('link', { name: /^Queues/ })
      .first()
      .click();
    await page.getByRole('link', { name: consumerQueue, exact: true }).click();
    await openSection(page, /^Consumers \(1\)/);
    await expect(
      page.locator('#queue-consumers-section table tbody tr'),
    ).toHaveCount(1);
  } finally {
    const cleanup = await Promise.allSettled([
      api('DELETE', `queues/%2F/${encodeURIComponent(queue)}`),
      api('DELETE', `exchanges/%2F/${encodeURIComponent(exchange)}`),
    ]);
    for (const [index, result] of cleanup.entries()) {
      if (
        result.status !== 'fulfilled' ||
        !(result.value.ok() || result.value.status() === 404)
      ) {
        cleanupFailed = true;
        console.error(
          `Cleanup failure: Rabbit ${index === 0 ? 'queue' : 'exchange'} cleanup failed; private provider details suppressed.`,
        );
      }
    }
  }

  assert.equal(
    cleanupFailed,
    false,
    'Disposable Rabbit fixture cleanup failed',
  );
  console.log(
    'Rabbit UI passed: login; queue/exchange/binding inspection; publication; message inspection; purge; live consumer inspection.',
  );
}

async function postgres(page) {
  const origin = localUrl('PGADMIN_URL');
  stage = 'pgadmin automatic server registration';
  await page.goto(origin);
  await expect(
    page.getByRole('button', { name: 'Tools', exact: true }),
  ).toBeVisible();

  stage = 'pgadmin visible authentication boundary';
  await expect(page.locator('input[type="password"]:visible')).toHaveCount(0);

  stage = 'pgadmin expand registered server';
  const server = page.getByText('postgres', { exact: true }).first();
  if (!(await server.isVisible())) {
    await page.getByText(/^Servers(?: \(\d+\))?$/, { exact: true }).dblclick();
  }
  await expect(server).toBeVisible();
  await server.click();
  const databases = page.getByText(/^Databases(?: \(\d+\))?$/, { exact: true });
  await expect(databases).toBeVisible();

  stage = 'pgadmin expand databases';
  if (!(await page.getByText('inventory', { exact: true }).isVisible())) {
    await databases.dblclick();
  }

  const existingTables = {
    inventory: 'equipment',
    notifications: 'reservation_inbox',
    reservations: 'reservations',
  };

  for (const [database, table] of Object.entries(existingTables)) {
    stage = `pgadmin browse ${database}`;
    const databaseNode = page.getByText(database, { exact: true }).first();
    await expect(databaseNode).toBeVisible();
    await databaseNode.click();
    const queryButton = page
      .getByRole('button', { name: /^Query Tool(?! Workspace)/ })
      .first();
    await expect(queryButton).toBeEnabled();

    const schemas = page.getByText(/^Schemas(?: \(\d+\))?$/, { exact: true });
    await expect(schemas).toBeVisible();
    if (!(await page.getByText('public', { exact: true }).isVisible())) {
      await schemas.dblclick();
    }
    const publicSchema = page.getByText('public', { exact: true });
    await expect(publicSchema).toBeVisible();
    const tables = page.getByText(/^Tables(?: \(\d+\))?$/, { exact: true });
    await publicSchema.click();
    await expect(tables).toBeVisible();
    if (
      !(await page.getByText('schema_migrations', { exact: true }).isVisible())
    ) {
      await tables.dblclick();
    }
    await expect(page.getByText(table, { exact: true }).last()).toBeVisible();

    stage = `pgadmin open query tool ${database}`;
    await databaseNode.click();
    await queryButton.click();
    const queryFrames = () =>
      page.frames().filter((frame) => {
        const url = new URL(frame.url());
        return (
          url.pathname.startsWith('/sqleditor/panel/') &&
          url.searchParams.get('database_name') === database
        );
      });
    await expect.poll(() => queryFrames().length).toBe(1);
    const frame = queryFrames()[0];

    stage = `pgadmin query editor ${database}`;
    const editor = frame.locator('.CodeMirror, .cm-editor').first();
    await expect(editor).toBeVisible();
    const outputCell = (value) =>
      frame
        .getByRole('cell', { name: value, exact: true })
        .or(frame.getByRole('gridcell', { name: value, exact: true }));
    const execute = async (sql, marker) => {
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(sql);
      await expect(editor).toContainText(marker);
      const submitted = page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          request.url().includes('/sqleditor/query_tool/start/'),
      );
      await frame.getByRole('button', { name: /^Execute script/ }).click();
      assert.ok(
        (await submitted).postData()?.includes(marker),
        'The query submitted through the UI must contain its result marker',
      );
      await expect(outputCell(marker)).toBeVisible();
    };

    const suffix = randomUUID().replaceAll('-', '');
    const schema = `admin_ui_${suffix}`;
    stage = `pgadmin query existing data ${database}`;
    await execute(
      `SELECT '${suffix}_existing' AS step, current_database() AS database_name, current_user AS administrator, (SELECT count(*) FROM public.${table}) AS row_count;`,
      `${suffix}_existing`,
    );
    await expect(outputCell(database)).toBeVisible();
    await expect(outputCell('postgres')).toBeVisible();

    stage = `pgadmin create schema and insert ${database}`;
    await execute(
      `CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.scratch (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO ${schema}.scratch VALUES (1, 'before'); SELECT '${suffix}_created' AS step, value FROM ${schema}.scratch;`,
      `${suffix}_created`,
    );
    await expect(outputCell('before')).toBeVisible();

    stage = `pgadmin edit data ${database}`;
    await execute(
      `UPDATE ${schema}.scratch SET value = 'after' WHERE id = 1 RETURNING '${suffix}_edited' AS step, value;`,
      `${suffix}_edited`,
    );
    await expect(outputCell('after')).toBeVisible();

    stage = `pgadmin delete and drop ${database}`;
    await execute(
      `DELETE FROM ${schema}.scratch WHERE id = 1; SELECT '${suffix}_deleted' AS step, count(*) AS remaining_rows FROM ${schema}.scratch;`,
      `${suffix}_deleted`,
    );
    await expect(outputCell('0')).toBeVisible();
    await execute(
      `DROP SCHEMA ${schema} CASCADE; SELECT '${suffix}_cleaned' AS step, CASE WHEN to_regnamespace('${schema}') IS NULL THEN 'removed' ELSE 'present' END AS removal;`,
      `${suffix}_cleaned`,
    );
    await expect(outputCell('removed')).toBeVisible();

    // Collapse this database so the virtualized explorer keeps the next one visible.
    await databaseNode.dblclick();
    console.log(
      `pgAdmin UI passed for ${database}: existing table browsing/query; administrator schema/create/insert/edit/delete/drop.`,
    );
  }
}

let browser;

try {
  browser = await chromium.launch({ executablePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  if (process.argv[2] === 'rabbit') {
    await rabbit(page);
  } else if (process.argv[2] === 'postgres') {
    await postgres(page);
  } else {
    throw new Error('Unknown console workflow');
  }
} catch {
  console.error(
    `Administration browser workflow failed at: ${stage}. No credentials or page content retained.`,
  );
  process.exitCode = 1;
} finally {
  if (browser) {
    let timer;
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Browser shutdown deadline expired.')),
            5000,
          );
        }),
      ]);
    } catch {
      console.error(
        'Cleanup failure: administration browser shutdown failed or exceeded 5 seconds.',
      );
      process.exitCode = 1;
    } finally {
      clearTimeout(timer);
    }
  }
}
