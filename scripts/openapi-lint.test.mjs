import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

function document() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Fixture',
      version: '1',
      description: 'Fixture API',
      contact: { name: 'API team' },
    },
    servers: [{ url: '/' }],
    tags: [{ name: 'Equipment', description: 'Equipment operations' }],
    paths: {
      '/equipment': {
        get: {
          operationId: 'ListEquipment',
          summary: 'List equipment',
          description: 'Lists equipment.',
          tags: ['Equipment'],
          responses: {
            200: {
              description: 'Equipment',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Equipment' },
                },
              },
            },
          },
        },
      },
    },
    components: { schemas: { Equipment: { type: 'string' } } },
  };
}

function validate(input, label = 'Fixture') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/openapi-lint.mjs', label], {
      stdio: 'pipe',
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

test('valid OpenAPI with an internal reference passes the recommended baseline', async () => {
  const result = await validate(document());
  assert.equal(result.code, 0, result.output);
});

test('warning alone fails with service, rule and path', async () => {
  const input = document();
  delete input.info.contact;
  const result = await validate(input, 'Inventory');
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Inventory.*warning.*info-contact.*info/);
  assert.doesNotMatch(result.output, /: error /);
});

test('schema errors fail with actionable rule diagnostics', async () => {
  const input = document();
  input.info.version = 7;
  const result = await validate(input, 'Reservations');
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Reservations.*error.*oas3-schema.*info/);
  assert.doesNotMatch(result.output, /: warning /);
});

for (const input of ['', '{', '{}', '{"openapi":"2.0"}']) {
  test(`invalid input fails clearly: ${JSON.stringify(input)}`, async () => {
    const result = await validate(input);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /Fixture.*input/);
  });
}

for (const reference of [
  'file:///private/secret.json',
  'https://127.0.0.1:1/schema',
  '../schema.json',
]) {
  for (const keyword of ['$ref', '$dynamicRef']) {
    test(`${keyword} external reference is rejected before resolution: ${reference}`, async () => {
      const input = document();
      input.components.schemas.Equipment = { [keyword]: reference };
      const result = await validate(input);
      assert.notEqual(result.code, 0);
      assert.match(result.output, /Fixture.*external-reference.*components/);
    });
  }
}

test('concurrent subprocesses keep diagnostic labels independent', async () => {
  const input = document();
  delete input.info.contact;
  const results = await Promise.all(
    ['Inventory', 'Notifications'].map((label) => validate(input, label)),
  );
  for (const [index, result] of results.entries()) {
    assert.notEqual(result.code, 0);
    assert.match(
      result.output,
      new RegExp(`${['Inventory', 'Notifications'][index]}.*info-contact`),
    );
    assert.doesNotMatch(
      result.output,
      new RegExp(['Notifications', 'Inventory'][index]),
    );
  }
});
