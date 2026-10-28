import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';

const names = [
  'identity-admin',
  'reservations-client',
  'alice',
  'bob',
  'manager',
  'staff',
];
test('identity continuity transport captures only exact six source values and restores atomic PUT attributes without secret GET or list', async () => {
  const { createIdentityContinuityStore } =
    await import('./azure-recovery-identity.mjs');
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const name = new URL(request.url, 'http://fixture').pathname.split('/')[2];
    requests.push({ method: request.method, path: request.url, body });
    const value =
      request.method === 'PUT'
        ? JSON.parse(body)
        : {
            value: `PRIVATE-${name}-1234567890abcdef`,
            attributes: {
              enabled: true,
              exp: Math.floor(Date.now() / 1000) + 86400,
            },
            contentType: 'text/plain',
          };
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        ...value,
        id: `https://target.vault.azure.net/secrets/${name}/${'a'.repeat(32)}`,
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (url, options) =>
    globalThis.fetch(
      `http://127.0.0.1:${server.address().port}${new URL(url).pathname}${new URL(url).search}`,
      options,
    );
  const context = {
    vaultUri: 'https://target.vault.azure.net',
    tenantId: 'tenant',
    generation: 'g1',
  };
  try {
    const backup = createIdentityContinuityStore({
      ...context,
      actor: 'backup',
      token: async () => 'PRIVATE-TOKEN',
      request,
    });
    const bundle = await backup.capture();
    assert.deepEqual(
      bundle.secrets.map((item) => item.name),
      names,
    );
    const restore = createIdentityContinuityStore({
      ...context,
      generation: 'g2',
      actor: 'restore',
      token: async () => 'PRIVATE-TOKEN',
      request,
    });
    await restore.restore(bundle, context);
    assert.deepEqual(
      requests.map((item) => item.method),
      [...names.map(() => 'GET'), ...names.map(() => 'PUT')],
    );
    assert.ok(
      requests.every(
        (item) =>
          !item.path.includes('versions') && !item.path.includes('list'),
      ),
    );
    for (const item of requests.filter((item) => item.method === 'PUT'))
      assert.deepEqual(Object.keys(JSON.parse(item.body)).sort(), [
        'attributes',
        'contentType',
        'value',
      ]);
    const invalid = globalThis.structuredClone(bundle);
    invalid.secrets[0].name = 'database-admin';
    const before = requests.length;
    await assert.rejects(restore.restore(invalid, context), /continuity/i);
    assert.equal(requests.length, before);
    const unlisted = globalThis.structuredClone(bundle);
    unlisted.secrets[0].postgresAdmin = 'PRIVATE-UNLISTED';
    await assert.rejects(restore.restore(unlisted, context), /continuity/i);
    assert.equal(requests.length, before);
    await assert.rejects(restore.capture(), /actor/i);
    await assert.rejects(backup.restore(bundle, context), /actor/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('identity continuity suppresses token-provider private failures before any request', async () => {
  const { createIdentityContinuityStore } =
    await import('./azure-recovery-identity.mjs');
  const { OperationalFailure } = await import('./process.mjs');
  const store = createIdentityContinuityStore({
    vaultUri: 'https://target.vault.azure.net',
    tenantId: 'tenant',
    generation: 'g1',
    actor: 'backup',
    token: async () => {
      throw new OperationalFailure('PRIVATE-TOKEN-PROVIDER-SECRET');
    },
    request: async () => assert.fail('request after failed token'),
  });
  await assert.rejects(store.capture(), (error) => {
    assert.doesNotMatch(error.message, /PRIVATE-TOKEN-PROVIDER-SECRET/);
    return true;
  });
});
