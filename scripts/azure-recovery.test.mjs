import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  constants,
  createHash,
} from 'node:crypto';
import {
  encryptObject,
  decryptObject,
  successfulRetention,
  createKeyVaultWrapping,
} from './azure-recovery.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateDirectory } from './local-platform.mjs';

test('protected recovery configuration requires the explicit strong monitor credential and rejects unknown fields privately', async () => {
  const { loadRecoveryConfig } = await import('./azure-recovery.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'recovery-config-'));
  createPrivateDirectory(directory);
  const path = join(directory, 'config.json');
  try {
    const value = {
      version: 1,
      brokerMonitorPassword: 'monitor-password-private-1234567890abcdef',
    };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    assert.deepEqual(loadRecoveryConfig(path), value);
    writeFileSync(
      path,
      JSON.stringify({ ...value, arbitrary: 'PRIVATE-UNEXPECTED' }),
      { mode: 0o600 },
    );
    assert.throws(
      () => loadRecoveryConfig(path),
      (error) => {
        assert.doesNotMatch(
          error.message,
          /PRIVATE-UNEXPECTED|monitor-password/,
        );
        return true;
      },
    );
    writeFileSync(
      path,
      JSON.stringify({ version: 1, brokerMonitorPassword: 'weak' }),
      { mode: 0o600 },
    );
    assert.throws(() => loadRecoveryConfig(path), /private/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL transport uses fixed client, allowlisted databases and private stdin owner restore', async () => {
  const { createPostgresRecoveryClient } = await import('./azure-recovery.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'recovery-process-'));
  const fixture = join(directory, 'kubectl.mjs');
  writeFileSync(
    fixture,
    `let input='';for await(const chunk of process.stdin)input+=chunk;const args=process.argv.slice(2);if(args.includes('equipment-restore-client')){if(!input.startsWith('SET ROLE "reservations_app";\\nDROP SCHEMA public CASCADE;'))process.exit(19);if(!input.includes('PRIVATE-SQL-DATA'))process.exit(20);}else if(!args.includes('equipment-backup-client'))process.exit(21);console.log('private-result');`,
  );
  try {
    const client = createPostgresRecoveryClient({
      kubeconfig: 'private-config',
      actor: 'backup',
      command: process.execPath,
      prefix: [fixture],
    });
    assert.equal(
      (await client.dump('inventory')).toString().trim(),
      'private-result',
    );
    await assert.rejects(client.dump('postgres'), /database/i);
    await assert.rejects(
      client.restore('inventory', Buffer.from('PRIVATE-SQL-DATA')),
      /actor/i,
    );
    const restore = createPostgresRecoveryClient({
      kubeconfig: 'private-config',
      actor: 'restore',
      command: process.execPath,
      prefix: [fixture],
    });
    await restore.restore('reservations', Buffer.from('PRIVATE-SQL-DATA'));
    await assert.rejects(
      restore.restore('reservations;DROP DATABASE inventory', Buffer.from('x')),
      /database/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fixed PostgreSQL outbox observation reports fresh integer counts and privately rejects malformed results', async () => {
  const { createPostgresRecoveryClient } = await import('./azure-recovery.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'recovery-outbox-'));
  const fixture = join(directory, 'kubectl.mjs');
  writeFileSync(
    fixture,
    `let input='';for await(const chunk of process.stdin)input+=chunk;const args=process.argv.slice(2);if(!args.includes('reservations')||!args.includes('equipment-backup-client')||!input.includes('SELECT count(*) FROM reservation_outbox WHERE published_at IS NULL;'))process.exit(19);console.log(args.includes('--invalid')?'PRIVATE-INVALID-RESULT':'0');`,
  );
  try {
    const client = createPostgresRecoveryClient({
      kubeconfig: 'private',
      actor: 'backup',
      command: process.execPath,
      prefix: [fixture],
    });
    const result = await client.outboxCount();
    assert.equal(result.count, 0);
    assert.ok(Math.abs(Date.now() - Date.parse(result.observedAt)) < 1000);
    const invalid = createPostgresRecoveryClient({
      kubeconfig: 'private',
      actor: 'backup',
      command: process.execPath,
      prefix: [fixture, '--invalid'],
    });
    await assert.rejects(invalid.outboxCount(), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE-INVALID-RESULT/);
      return true;
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const keyId = `https://recovery.vault.azure.net/keys/backup/${'a'.repeat(32)}`;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrapping = {
  async wrap(key) {
    return {
      kid: keyId,
      value: publicEncrypt(
        {
          key: keys.publicKey,
          oaepHash: 'sha256',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        key,
      ).toString('base64url'),
    };
  },
  async unwrap(value) {
    return privateDecrypt(
      {
        key: keys.privateKey,
        oaepHash: 'sha256',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(value, 'base64url'),
    );
  },
};

test('backup core never starts stopped clusters and restores exact replicas after failed dump', async () => {
  const { backupRecoveryPoint } = await import('./azure-recovery.mjs');
  const effects = [];
  let running = false;
  const scales = {
    web: 2,
    inventory: 1,
    reservations: 2,
    notifications: 1,
    keycloak: 1,
  };
  const revision = 'a'.repeat(40);
  const provider = {
    async cluster() {
      return {
        properties: {
          powerState: { code: running ? 'Running' : 'Stopped' },
          provisioningState: 'Succeeded',
        },
      };
    },
    async qualify(phase) {
      effects.push(`probe:${phase}`);
    },
    async maintenance() {
      return {
        application: { status: { sync: { status: 'Synced', revision } } },
        project: {
          spec: {
            syncWindows: [
              {
                kind: 'deny',
                schedule: '0 20 * * *',
                duration: '2h',
                timeZone: 'Europe/Bucharest',
                applications: ['equipment-azure'],
                manualSync: false,
              },
            ],
          },
        },
      };
    },
    async readScale(name) {
      return scales[name];
    },
    async saveMaintenance(value) {
      effects.push('save');
      assert.deepEqual(value.replicas, scales);
    },
    async scale(name, count) {
      effects.push(`${name}:${count}`);
    },
    async waitScale() {},
    async drain() {
      effects.push('drain');
    },
    async clearMaintenance() {
      effects.push('clear');
    },
    database: {
      async dump() {
        throw new Error('PRIVATE DATABASE CONTENT');
      },
    },
  };
  const settings = {
    pointId: 'daily-2026-10-26',
    normalRevision: revision,
    compatibility: { imagesHash: 'b'.repeat(64), schemaHash: 'c'.repeat(64) },
    keyId,
    wrapping,
    now: () => Date.parse('2026-10-26T18:05:00Z'),
  };
  assert.deepEqual(await backupRecoveryPoint(provider, settings), {
    outcome: 'skipped-stopped',
  });
  assert.deepEqual(effects, []);
  running = true;
  await assert.rejects(backupRecoveryPoint(provider, settings), (error) => {
    assert.doesNotMatch(error.message, /PRIVATE DATABASE CONTENT/);
    return true;
  });
  assert.ok(effects.indexOf('save') < effects.indexOf('web:0'));
  assert.ok(effects.indexOf('web:0') < effects.indexOf('drain'));
  for (const [name, count] of Object.entries(scales))
    assert.ok(effects.includes(`${name}:${count}`));
  assert.equal(effects.at(-1), 'clear');
});

test('verified backup stages real encryption before completion and restores from authenticated objects without scaling', async () => {
  const { backupRecoveryPoint, restoreRecoveryPoint, recoveryEnvelopeHash } =
    await import('./azure-recovery.mjs');
  const revision = 'a'.repeat(40);
  const effects = [];
  const sourceIdentity = {
    vaultUri: 'https://fixture.vault.azure.net',
    vaultId:
      '/subscriptions/subscription/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/fixture',
    tenantId: 'tenant',
    generation: 'g1',
  };
  const credentialIdentity = {
    version: 1,
    source: {
      vaultUri: sourceIdentity.vaultUri,
      tenantId: sourceIdentity.tenantId,
      generation: sourceIdentity.generation,
    },
    secrets: [
      'identity-admin',
      'reservations-client',
      'alice',
      'bob',
      'manager',
      'staff',
    ].map((name) => ({
      name,
      version: 'a'.repeat(32),
      value: 'PRIVATE-COMPATIBLE-CREDENTIALS-' + name,
      valueHash: createHash('sha256')
        .update('PRIVATE-COMPATIBLE-CREDENTIALS-' + name)
        .digest('hex'),
      attributes: { enabled: true },
    })),
  };
  const staged = new Map();
  const fingerprints = Object.fromEntries(
    ['inventory', 'reservations', 'notifications', 'keycloak'].map((name) => [
      name,
      `${name}|1|digest\n`,
    ]),
  );
  let marker;
  const compatibility = {
    generation: 'g1',
    imagesHash: 'b'.repeat(64),
    schemaHash: 'c'.repeat(64),
  };
  const provider = {
    async sourceFacts() {
      return {
        producerPrincipalId: '11111111-1111-4111-8111-111111111111',
        sourceIdentity,
        sourceSecrets: credentialIdentity.secrets.map(
          ({ name, version, valueHash }) => ({ name, version, valueHash }),
        ),
      };
    },
    async cluster() {
      return {
        properties: {
          powerState: { code: 'Running' },
          provisioningState: 'Succeeded',
        },
      };
    },
    async qualify(phase) {
      effects.push(`probe:${phase}`);
    },
    async maintenance() {
      return {
        seedJobs: [],
        application: { status: { sync: { status: 'Synced', revision } } },
        project: {
          spec: {
            syncWindows: [
              {
                kind: 'deny',
                schedule: '0 20 * * *',
                duration: '2h',
                timeZone: 'Europe/Bucharest',
                manualSync: false,
                applications: ['equipment-azure'],
              },
            ],
          },
        },
      };
    },
    async readScale() {
      return 0;
    },
    async saveMaintenance() {},
    async scale() {
      effects.push('scale');
    },
    async waitScale() {},
    async drain() {},
    async clearMaintenance() {},
    async captureBundle() {
      return Buffer.from(JSON.stringify({ identity: credentialIdentity }));
    },
    async restoreBundle(bundle, context) {
      assert.deepEqual(
        JSON.parse(bundle.toString()).identity,
        credentialIdentity,
      );
      assert.deepEqual(context.sourceIdentity, sourceIdentity);
      assert.deepEqual(
        context.sourceSecrets,
        credentialIdentity.secrets.map(({ name, version, valueHash }) => ({
          name,
          version,
          valueHash,
        })),
      );
      effects.push('credentials-restored');
    },
    async recordRestored() {
      effects.push('restored');
    },
    database: {
      async dump(name) {
        return Buffer.from(`CREATE TABLE ${name}_example(id int);`);
      },
      async fingerprint(name) {
        return fingerprints[name];
      },
      async verify(host, objects, actual) {
        assert.match(
          host,
          /^equipment-verify-[a-f0-9]{16}\.equipment-recovery\.svc$/,
        );
        assert.deepEqual(actual, fingerprints);
        assert.match(objects.inventory.toString(), /CREATE TABLE/);
        effects.push('isolated-verified');
      },
      async restore(name, plaintext) {
        assert.match(plaintext.toString(), new RegExp(name));
        assert.ok(effects.includes('credentials-restored'));
        effects.push(`restore:${name}`);
      },
    },
    verification: {
      async create() {
        effects.push('create');
      },
      async wait() {},
      async remove() {
        effects.push('remove');
      },
    },
    storage: {
      async putObject(point, name, object) {
        assert.equal(point, 'daily-2026-10-26');
        assert.doesNotMatch(
          object.ciphertext.toString(),
          /PRIVATE-COMPATIBLE-CREDENTIALS|CREATE TABLE/,
        );
        staged.set(name, object);
      },
      async complete(point, value) {
        assert.ok(effects.includes('isolated-verified'));
        assert.ok(effects.includes('remove'));
        marker = value;
      },
      async list() {
        return [marker];
      },
      async remove() {
        assert.fail('latest successful point removed');
      },
      async getComplete() {
        return marker;
      },
      async readCompletion() {
        return {
          marker,
          etag: '"fixture-etag"',
          versionId: '2026-10-26T18:05:00.0000000Z',
          markerHash: createHash('sha256')
            .update(JSON.stringify(marker))
            .digest('hex'),
        };
      },
      async getObject(point, name) {
        return {
          ...staged.get(name),
          storedHash: recoveryEnvelopeHash(staged.get(name)),
        };
      },
    },
  };
  const settings = {
    pointId: 'daily-2026-10-26',
    normalRevision: revision,
    maintenanceRevision: revision,
    compatibility,
    sourceIdentity,
    backupPrincipalId: '11111111-1111-4111-8111-111111111111',
    environment: 'learning',
    tenantId: 'tenant',
    subscriptionId: 'subscription',
    keyId,
    wrapping,
    now: () => Date.parse('2026-10-26T18:05:00Z'),
  };
  assert.deepEqual(await backupRecoveryPoint(provider, settings), {
    outcome: 'verified',
    pointId: settings.pointId,
  });
  const scaleCount = effects.filter((value) => value === 'scale').length;
  assert.equal(marker.version, 2);
  assert.deepEqual(marker.sourceIdentity, sourceIdentity);
  assert.equal(marker.producerPrincipalId, settings.backupPrincipalId);
  assert.deepEqual(await restoreRecoveryPoint(provider, settings), {
    outcome: 'data-restored-awaiting-reviewed-resume',
    pointId: settings.pointId,
  });
  assert.equal(effects.filter((value) => value === 'scale').length, scaleCount);
  assert.equal(effects.at(-1), 'restored');
  const goodMarker = globalThis.structuredClone(marker);
  const protectedSettings = { ...settings };
  delete protectedSettings.sourceIdentity;
  for (const mutate of [
    (value) => (value.version = 1),
    (value) => delete value.sourceSecrets,
    (value) => (value.sourceIdentity.tenantId = 'foreign'),
    (value) => {
      value.sourceIdentity.vaultUri = 'https://foreign.vault.azure.net';
      value.sourceIdentity.vaultId =
        '/subscriptions/subscription/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/foreign';
    },
    (value) => {
      value.sourceIdentity.generation = 'other';
      value.compatibility.generation = 'other';
    },
    (value) => (value.sourceSecrets[0].version = 'b'.repeat(32)),
    (value) => (value.sourceSecrets[0].valueHash = 'b'.repeat(64)),
    (value) => (value.id = 'wrong-point'),
    (value) =>
      (value.producerPrincipalId = '22222222-2222-4222-8222-222222222222'),
    (value) => {
      value.metadataHash = 'b'.repeat(64);
      value.objectHashes.metadata = value.metadataHash;
    },
  ]) {
    marker = globalThis.structuredClone(goodMarker);
    mutate(marker);
    const before = effects.length;
    await assert.rejects(restoreRecoveryPoint(provider, protectedSettings));
    assert.ok(
      effects
        .slice(before)
        .every((value) => value === 'probe:restore-prerequisites'),
    );
  }
  marker = goodMarker;
  const { selectRecoveryPoint } = await import('./azure-recovery.mjs');
  const selected = await selectRecoveryPoint(
    provider.storage,
    protectedSettings,
  );
  assert.throws(
    () => (selected.marker.sourceSecrets[0].version = 'b'.repeat(32)),
    TypeError,
  );
  assert.equal(selected.pointId, settings.pointId);
  const originalInventory = staged.get('inventory');
  const substituted = Buffer.from(originalInventory.ciphertext);
  substituted[0] ^= 1;
  staged.set('inventory', { ...originalInventory, ciphertext: substituted });
  const beforeSubstitution = effects.length;
  await assert.rejects(
    restoreRecoveryPoint(provider, protectedSettings),
    /restore/i,
  );
  assert.deepEqual(effects.slice(beforeSubstitution), [
    'probe:restore-prerequisites',
  ]);
  staged.set('inventory', originalInventory);
  for (const sourceIdentity of [
    {
      ...settings.sourceIdentity,
      vaultUri: 'https://foreign.vault.azure.net',
      vaultId:
        '/subscriptions/subscription/resourceGroups/source/providers/Microsoft.KeyVault/vaults/foreign',
    },
    { ...settings.sourceIdentity, tenantId: 'foreign' },
    { ...settings.sourceIdentity, generation: 'foreign' },
  ]) {
    const before = effects.length;
    await assert.rejects(
      restoreRecoveryPoint(provider, { ...settings, sourceIdentity }),
      /restore/i,
    );
    assert.ok(
      effects
        .slice(before)
        .every((value) => value === 'probe:restore-prerequisites'),
    );
  }
  const beforeUnterminated = effects.length;
  provider.waitScale = async () => {
    throw Error('Writer Pod still terminating.');
  };
  await assert.rejects(restoreRecoveryPoint(provider, settings), /terminating/);
  assert.deepEqual(effects.slice(beforeUnterminated), [
    'probe:restore-prerequisites',
  ]);
  provider.waitScale = async () => {};
  marker.verified = false;
  await assert.rejects(restoreRecoveryPoint(provider, settings), /marker/);
});

test('Blob recovery store uses create-only envelopes and markers, follows inventory and deletes only exact retained-point objects', async () => {
  const { createRecoveryBlobStore } = await import('./azure-recovery.mjs');
  const stored = new Map();
  const calls = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer private-storage-token');
    const url = new URL(request.url, 'http://localhost');
    calls.push([request.method, url.pathname]);
    if (url.searchParams.get('comp') === 'list') {
      response.setHeader('content-type', 'application/xml');
      response.end(
        `<EnumerationResults><Blobs>${[...stored.keys()].map((name) => `<Blob><Name>${name.slice('/recovery/'.length)}</Name></Blob>`).join('')}</Blobs><NextMarker /></EnumerationResults>`,
      );
      return;
    }
    if (request.method === 'PUT') {
      assert.equal(request.headers['if-none-match'], '*');
      assert.equal(request.headers['x-ms-blob-type'], 'BlockBlob');
      if (stored.has(url.pathname)) {
        response.statusCode = 412;
        response.end();
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      stored.set(url.pathname, body);
      response.statusCode = 201;
      response.end();
      return;
    }
    if (request.method === 'DELETE') {
      stored.delete(url.pathname);
      response.statusCode = 202;
      response.end();
      return;
    }
    if (!stored.has(url.pathname)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(stored.get(url.pathname));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const store = createRecoveryBlobStore({
      account: 'retainedaccount',
      container: 'recovery',
      token: async () => 'private-storage-token',
      origin: `http://127.0.0.1:${server.address().port}`,
    });
    const encrypted = await encryptObject(Buffer.from('private dump'), {
      keyId,
      wrapping,
      object: 'inventory',
    });
    await store.putObject('point-1', 'inventory', encrypted);
    const actualObject = await store.getObject('point-1', 'inventory');
    assert.deepEqual(
      { manifest: actualObject.manifest, ciphertext: actualObject.ciphertext },
      encrypted,
    );
    assert.equal(
      actualObject.storedHash,
      createHash('sha256')
        .update(stored.get('/recovery/points/point-1/inventory.json'))
        .digest('hex'),
    );
    const marker = {
      version: 2,
      id: 'point-1',
      created: '2026-10-26T18:00:00Z',
      complete: true,
      verified: true,
      objects: [
        'inventory',
        'reservations',
        'notifications',
        'keycloak',
        'credentials',
        'metadata',
      ],
      producerPrincipalId: '11111111-1111-4111-8111-111111111111',
      sourceIdentity: {
        vaultUri: 'https://fixture.vault.azure.net',
        vaultId:
          '/subscriptions/subscription/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/fixture',
        tenantId: 'tenant',
        generation: 'g1',
      },
      sourceSecrets: [
        'identity-admin',
        'reservations-client',
        'alice',
        'bob',
        'manager',
        'staff',
      ].map((name) => ({
        name,
        version: 'a'.repeat(32),
        valueHash: 'b'.repeat(64),
      })),
      compatibility: { generation: 'g1', imagesHash: 'b'.repeat(64) },
      keyId,
      metadataHash: 'd'.repeat(64),
      objectHashes: Object.fromEntries(
        [
          'inventory',
          'reservations',
          'notifications',
          'keycloak',
          'credentials',
          'metadata',
        ].map((name) => [name, 'd'.repeat(64)]),
      ),
    };
    const beforeLegacy = calls.length;
    await assert.rejects(
      store.complete('legacy', { ...marker, id: 'legacy', version: 1 }),
      /marker/i,
    );
    assert.equal(calls.length, beforeLegacy);
    await assert.rejects(
      store.complete('invalid', {
        ...marker,
        id: 'invalid',
        unexpected: 'PRIVATE-EXTRA',
      }),
      /marker/i,
    );
    assert.equal(calls.length, beforeLegacy);
    await store.complete('point-1', marker);
    assert.deepEqual(await store.list(), [marker]);
    await assert.rejects(store.complete('point-1', marker), /412/);
    await assert.rejects(
      store.putObject('../escape', 'inventory', encrypted),
      /point/i,
    );
    await store.remove('point-1');
    assert.equal(stored.size, 0);
    assert.ok(calls.every(([, path]) => path.startsWith('/recovery')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('backup window requires all worst-case time in both seasons and rejects unrelated drift', async () => {
  const { assertBackupWindow } = await import('./azure-recovery.mjs');
  const revision = 'a'.repeat(40);
  const evidence = {
    application: { status: { sync: { status: 'Synced', revision } } },
    project: {
      spec: {
        syncWindows: [
          {
            kind: 'deny',
            schedule: '0 20 * * *',
            duration: '2h',
            timeZone: 'Europe/Bucharest',
            manualSync: false,
            applications: ['equipment-azure'],
          },
        ],
      },
    },
  };
  assert.equal(
    assertBackupWindow(evidence, revision, Date.parse('2026-10-26T18:05:00Z')),
    115 * 60000,
  );
  assert.equal(
    assertBackupWindow(evidence, revision, Date.parse('2026-07-01T17:05:00Z')),
    115 * 60000,
  );
  assert.throws(
    () =>
      assertBackupWindow(
        evidence,
        revision,
        Date.parse('2026-10-26T19:30:00Z'),
      ),
    /insufficient/,
  );
  evidence.application.status.sync.status = 'OutOfSync';
  evidence.application.status.resources = [
    {
      kind: 'Deployment',
      namespace: 'equipment',
      name: 'web',
      status: 'OutOfSync',
    },
  ];
  assert.equal(
    assertBackupWindow(
      evidence,
      revision,
      Date.parse('2026-10-26T18:05:00Z'),
      60000,
      true,
    ),
    115 * 60000,
  );
  evidence.application.status.resources[0].name = 'unrelated';
  assert.throws(
    () =>
      assertBackupWindow(
        evidence,
        revision,
        Date.parse('2026-10-26T18:05:00Z'),
        60000,
        true,
      ),
    /reviewed/,
  );
});

test('Key Vault adapter sends actual versioned wrap/unwrap schema over HTTP', async () => {
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer PRIVATE_TOKEN');
    const parameters = JSON.parse(body);
    assert.equal(parameters.alg, 'RSA-OAEP-256');
    assert.deepEqual(Object.keys(parameters).sort(), ['alg', 'value']);
    assert.match(
      request.url,
      new RegExp(
        `/keys/backup/${'a'.repeat(32)}/(wrapkey|unwrapkey)\\?api-version=2025-07-01$`,
      ),
    );
    const result = request.url.includes('/unwrapkey')
      ? {
          kid: keyId,
          value: (await wrapping.unwrap(parameters.value)).toString(
            'base64url',
          ),
        }
      : await wrapping.wrap(Buffer.from(parameters.value, 'base64url'));
    response.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const vault = createKeyVaultWrapping({
      keyId,
      token: async () => 'PRIVATE_TOKEN',
      fetch: (url, options) =>
        globalThis.fetch(
          `http://127.0.0.1:${server.address().port}${new URL(url).pathname}${new URL(url).search}`,
          options,
        ),
    });
    const envelope = await encryptObject(Buffer.from('PRIVATE database'), {
      keyId,
      wrapping: vault,
      object: 'booking.dump',
    });
    assert.equal(
      (
        await decryptObject(envelope, {
          keyId,
          wrapping: vault,
          object: 'booking.dump',
        })
      ).toString(),
      'PRIVATE database',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('per-object envelope recovers plaintext with fresh nonce and key and pinned key version', async () => {
  const first = await encryptObject(Buffer.from('PRIVATE dump'), {
    keyId,
    wrapping,
    object: 'booking.dump',
  });
  const second = await encryptObject(Buffer.from('PRIVATE dump'), {
    keyId,
    wrapping,
    object: 'booking.dump',
  });
  assert.notEqual(first.manifest.nonce, second.manifest.nonce);
  assert.notEqual(first.manifest.wrappedKey, second.manifest.wrappedKey);
  assert.equal(
    (
      await decryptObject(first, { keyId, wrapping, object: 'booking.dump' })
    ).toString(),
    'PRIVATE dump',
  );
  assert.doesNotMatch(JSON.stringify(first.manifest), /PRIVATE dump/);
});

test('tampered ciphertext, manifest identity, authentication tag and key version fail closed', async () => {
  const envelope = await encryptObject(Buffer.from('PRIVATE dump'), {
    keyId,
    wrapping,
    object: 'booking.dump',
  });
  const cases = [
    { ...envelope, ciphertext: Buffer.from('corrupt') },
    {
      ...envelope,
      manifest: {
        ...envelope.manifest,
        tag: Buffer.alloc(16).toString('base64url'),
      },
    },
    { ...envelope, manifest: { ...envelope.manifest, object: 'other.dump' } },
    {
      ...envelope,
      manifest: {
        ...envelope.manifest,
        keyId: keyId.replace('/backup/', '/other/'),
      },
    },
    { ...envelope, manifest: { ...envelope.manifest, version: 2 } },
  ];
  for (const value of cases)
    await assert.rejects(
      decryptObject(value, { keyId, wrapping, object: 'booking.dump' }),
      /recovery|decrypt|authentication/i,
    );
});

test('wrap-only authority cannot decrypt and provider errors never expose secret material', async () => {
  const envelope = await encryptObject(Buffer.from('PRIVATE dump'), {
    keyId,
    wrapping,
    object: 'booking.dump',
  });
  await assert.rejects(
    decryptObject(envelope, {
      keyId,
      object: 'booking.dump',
      wrapping: {
        unwrap() {
          throw new Error('PRIVATE secret token');
        },
      },
    }),
    (error) => {
      assert.doesNotMatch(error.message + JSON.stringify(error), /PRIVATE/);
      return true;
    },
  );
});

test('retention counts seven successful daily sets and never deletes partial or latest good point', () => {
  const points = Array.from({ length: 9 }, (_, index) => ({
    id: `point-${index}`,
    created: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    complete: true,
    verified: true,
  }));
  points.push({
    id: 'partial',
    created: '2026-10-20T00:00:00Z',
    complete: false,
  });
  assert.deepEqual(
    successfulRetention(points).map((point) => point.id),
    ['point-0', 'point-1'],
  );
});

test('protected point selector reads authenticated fixed-container v2 catalog and requires native Blob version properties', async () => {
  const { selectRecoveryPoint, createRecoveryBlobStore } =
    await import('./azure-recovery.mjs');
  const names = [
    'inventory',
    'reservations',
    'notifications',
    'keycloak',
    'credentials',
    'metadata',
  ];
  const sourceSecrets = [
    'identity-admin',
    'reservations-client',
    'alice',
    'bob',
    'manager',
    'staff',
  ].map((name) => ({
    name,
    version: 'a'.repeat(32),
    valueHash: 'b'.repeat(64),
  }));
  const marker = {
    version: 2,
    id: 'selected-point',
    created: '2026-10-26T18:05:00Z',
    complete: true,
    verified: true,
    objects: names,
    producerPrincipalId: '11111111-1111-4111-8111-111111111111',
    sourceIdentity: {
      vaultUri: 'https://fixture.vault.azure.net',
      vaultId:
        '/subscriptions/subscription/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/fixture',
      tenantId: 'tenant',
      generation: 'g1',
    },
    sourceSecrets,
    compatibility: {
      generation: 'g1',
      imagesHash: 'b'.repeat(64),
      schemaHash: 'c'.repeat(64),
    },
    keyId,
    metadataHash: 'd'.repeat(64),
    objectHashes: Object.fromEntries(
      names.map((name) => [name, 'd'.repeat(64)]),
    ),
  };
  let missingVersion = false,
    denied = false;
  const paths = [];
  const server = createServer((request, response) => {
    paths.push([request.method, request.url]);
    assert.equal(request.headers.authorization, 'Bearer private-restore-token');
    if (request.method !== 'GET' || denied) {
      response.writeHead(403).end('PRIVATE-CATALOG-DENIAL');
      return;
    }
    assert.equal(request.url, '/recovery/points/selected-point/complete.json');
    response.setHeader('etag', '"actual-etag"');
    if (!missingVersion)
      response.setHeader('x-ms-version-id', '2026-10-26T18:05:00.0000000Z');
    response.end(JSON.stringify(marker));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = {
    pointId: marker.id,
    backupPrincipalId: marker.producerPrincipalId,
    environment: 'learning',
    subscriptionId: 'subscription',
    tenantId: 'tenant',
    maintenanceRevision: 'a'.repeat(40),
    compatibility: marker.compatibility,
    keyId,
  };
  const origin = 'http://127.0.0.1:' + server.address().port;
  const storage = createRecoveryBlobStore({
    account: 'retainedaccount',
    container: 'recovery',
    origin,
    token: async () => 'private-restore-token',
  });
  try {
    const selected = await selectRecoveryPoint(storage, settings);
    assert.equal(selected.etag, '"actual-etag"');
    assert.deepEqual(selected.marker.sourceSecrets, sourceSecrets);
    assert.equal(paths.length, 1);
    const mutation = await globalThis.fetch(
      origin + '/recovery/points/selected-point/complete.json',
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer private-restore-token' },
        body: '{}',
      },
    );
    assert.equal(mutation.status, 403);
    await mutation.body.cancel();
    missingVersion = true;
    await assert.rejects(selectRecoveryPoint(storage, settings), /version/i);
    missingVersion = false;
    denied = true;
    await assert.rejects(selectRecoveryPoint(storage, settings), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE-/);
      return true;
    });
    const before = paths.length;
    await assert.rejects(
      selectRecoveryPoint(storage, { ...settings, pointId: '../escape' }),
      /selection/i,
    );
    assert.equal(paths.length, before);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
