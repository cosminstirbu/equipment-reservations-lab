import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { executeProcess } from './process.mjs';
import { OperationalFailure } from './process.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateDirectory } from './local-platform.mjs';
import { validateTerraformOutputs } from './azure-infrastructure.mjs';
import {
  withOperationLease,
  createRestProvider,
  runLifecycle,
  safetyStopDue,
  withDnsNetworkGate,
  updateNetworkAdmissions,
  withBackendAccess,
  withAzureOperation,
  createArmNetworkProvider,
  validateOperationSnapshot,
  operationOutputsHash,
  withRegistryPublication,
  configuredNetworkResources,
  assertAzureOperationLease,
} from './azure-operations.mjs';

const config = { environment: 'learning', gitRevision: 'a'.repeat(40) };

test('configured registry wrapper retains real parser, private files, token subprocess and ARM Blob boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'azure-registry-contract-'));
  createPrivateDirectory(directory);
  const config = {
    version: 1,
    taxRate: 0,
    environment: 'learning',
    generation: 'lab2026',
    subscriptionId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    region: 'westeurope',
    domain: 'codingfunlab.com',
    operatorGroupObjectId: '33333333-3333-4333-8333-333333333333',
    operatorCidrs: ['8.8.8.8/32'],
    acmeEmail: 'operator@codingfunlab.com',
    acmeTermsAccepted: true,
    kubernetesVersion: '1.35.8',
    nodeVmSize: 'Standard_D4s_v5',
    nodeCount: 2,
    githubRepository: 'cosminstirbu/equipment-reservations-lab',
    gitRevision: 'a'.repeat(40),
    foundationBackend: {
      resourceGroupName: 'foundation',
      storageAccountName: 'labstate',
      containerName: 'tfstate',
      key: 'foundation.tfstate',
    },
    environmentBackend: {
      resourceGroupName: 'foundation',
      storageAccountName: 'labstate',
      containerName: 'environment-state',
      key: 'environment.tfstate',
    },
    recoveryKeyVersion: 'b'.repeat(32),
  };
  const values = {
    workload_resource_group_name: 'er-learning-workload',
    aks_cluster_name: 'learning',
    aks_resource_id: `/subscriptions/${config.subscriptionId}/resourceGroups/er-learning-workload/providers/Microsoft.ContainerService/managedClusters/learning`,
    acr_login_server: 'labacr.azurecr.io',
    workload_key_vault_uri: 'https://workload.vault.azure.net/',
    recovery_key_id: `https://recovery.vault.azure.net/keys/backup/${config.recoveryKeyVersion}`,
    operation_storage_account_name: 'labrecovery',
    recovery_storage_account_name: 'labrecovery',
    operation_container_name: 'operations',
    persistent_api_cidrs: ['8.8.8.8/32', '9.9.9.9/32'],
  };
  const outputs = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { value, sensitive: false },
    ]),
  );
  const snapshot = {
    version: 1,
    environment: config.environment,
    generation: config.generation,
    subscriptionId: config.subscriptionId,
    tenantId: config.tenantId,
    sourceRevision: config.gitRevision,
    outputsHash: operationOutputsHash(validateTerraformOutputs(outputs)),
    outputs,
  };
  const configPath = join(directory, 'config.json');
  const outputsPath = join(directory, 'outputs.json');
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  writeFileSync(outputsPath, JSON.stringify(snapshot), { mode: 0o600 });
  const tokenFixture = join(directory, 'token.mjs');
  writeFileSync(
    tokenFixture,
    `import assert from 'node:assert/strict';assert.deepEqual(process.argv.slice(2,4),['account','get-access-token']);assert.ok(process.argv.includes('--resource'));process.stdout.write(JSON.stringify({accessToken:'PRIVATE_TOKEN'}));`,
    { mode: 0o600 },
  );
  const originalFetch = globalThis.fetch;
  const paths = [];
  let gate = {
    etag: '1',
    properties: {
      TTL: 60,
      TXTRecords: [{ value: ['reserved'] }],
      metadata: {},
    },
  };
  let storage = {
    tags: {
      application: 'equipment-reservations',
      environment: config.environment,
    },
    properties: {
      networkAcls: {
        defaultAction: 'Deny',
        bypass: 'None',
        ipRules: [{ value: '8.8.8.8', action: 'Allow' }],
      },
    },
  };
  let record;
  let leased = false;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    paths.push(request.url);
    assert.equal(request.headers.authorization, 'Bearer PRIVATE_TOKEN');
    if (request.url.includes('/dnsZones/')) {
      if (request.method === 'PUT') {
        assert.equal(request.headers['if-match'], gate.etag);
        gate = { ...JSON.parse(body), etag: `${gate.etag}x` };
      }
      response.end(JSON.stringify(gate));
    } else if (request.url.includes('/storageAccounts/labrecovery')) {
      if (request.method === 'PATCH') storage = JSON.parse(body);
      response.end(JSON.stringify(storage));
    } else if (request.url.includes('?comp=lease')) {
      leased = request.headers['x-ms-lease-action'] !== 'release';
      response.writeHead(201).end();
    } else if (request.url.startsWith('/operations/operations/learning.json')) {
      if (request.method === 'PUT') {
        if (request.headers['if-none-match'] && record)
          response.writeHead(412).end();
        else {
          record = JSON.parse(body);
          response.writeHead(201).end();
        }
      } else response.end(JSON.stringify(record));
    } else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://api.ipify.org'))
        return new globalThis.Response(JSON.stringify({ ip: '8.8.4.4' }));
      const target = new URL(url);
      return originalFetch(
        `http://127.0.0.1:${server.address().port}${target.pathname}${target.search}`,
        options,
      );
    };
    const result = await withRegistryPublication(
      { configPath, outputsPath },
      async ({ signal, outputs }) => {
        assert.equal(signal.aborted, false);
        assert.equal(leased, true);
        assert.equal(outputs.acr_login_server, 'labacr.azurecr.io');
        assert.deepEqual(gate.properties.metadata, {});
        assert.ok(
          storage.properties.networkAcls.ipRules.some(
            (rule) => rule.value === '8.8.4.4',
          ),
        );
        return 'published';
      },
      {
        azureTokenProcess: {
          command: process.execPath,
          prefix: [tokenFixture],
        },
      },
    );
    assert.equal(result, 'published');
    assert.equal(leased, false);
    assert.deepEqual(storage.properties.networkAcls.ipRules, [
      { value: '8.8.8.8', action: 'Allow' },
    ]);
    assert.equal(
      paths.some((path) =>
        /managedClusters|\/vaults\/|storageAccounts\/labstate/.test(path),
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('retained-only factory works before cluster creation and registry scope needs only recovery storage', () => {
  const config = {
    environment: 'learning',
    generation: 'abcd',
    subscriptionId: '11111111-1111-4111-8111-111111111111',
    domain: 'codingfunlab.com',
    foundationBackend: {
      resourceGroupName: 'foundation',
      storageAccountName: 'stateaccount',
    },
    operatorCidrs: ['8.8.8.8/32'],
  };
  const outputs = {
    recovery_storage_account_name: 'recoveryaccount',
    operation_storage_account_name: 'recoveryaccount',
    operation_container_name: 'operations',
    recovery_key_id: `https://recovery.vault.azure.net/keys/backup/${'a'.repeat(32)}`,
  };
  assert.deepEqual(
    Object.keys(
      configuredNetworkResources(config, outputs, { retainedOnly: true })
        .resources,
    ),
    ['state', 'recoveryStorage', 'recoveryVault'],
  );
  assert.deepEqual(
    Object.keys(
      configuredNetworkResources(
        config,
        { ...outputs, recovery_key_id: undefined },
        { resources: ['recoveryStorage'] },
      ).resources,
    ),
    ['recoveryStorage'],
  );
  const full = {
    ...outputs,
    workload_resource_group_name: 'er-learning-workload',
    workload_key_vault_uri: 'https://workload.vault.azure.net/',
    aks_resource_id: `/subscriptions/${config.subscriptionId}/resourceGroups/er-learning-workload/providers/Microsoft.ContainerService/managedClusters/learning`,
    persistent_api_cidrs: ['8.8.8.8/32', '9.9.9.9/32'],
  };
  assert.deepEqual(
    configuredNetworkResources(config, full).resources.aks.baseline,
    full.persistent_api_cidrs,
  );
});

test('registry lease wrapper rejects missing private deployment inputs before publication', async () => {
  let published = false;
  await assert.rejects(
    withRegistryPublication(
      {
        configPath: 'missing-private-config',
        outputsPath: 'missing-private-output',
      },
      async () => {
        published = true;
      },
    ),
    /configuration|Private/,
  );
  assert.equal(published, false);
});

test('private output cache is bound to deployment revision, environment, generation and selected output digest', () => {
  const configuration = {
    ...config,
    generation: 'abcd',
    tenantId: 'tenant',
    subscriptionId: 'subscription',
  };
  const selected = {
    aks_resource_id: '/cluster',
    workload_key_vault_uri: 'https://workload.vault.azure.net/',
  };
  const snapshot = {
    version: 1,
    environment: configuration.environment,
    generation: configuration.generation,
    tenantId: configuration.tenantId,
    subscriptionId: configuration.subscriptionId,
    sourceRevision: configuration.gitRevision,
    outputsHash: operationOutputsHash(selected),
    outputs: {},
  };
  assert.deepEqual(
    validateOperationSnapshot(snapshot, configuration, () => selected),
    selected,
  );
  for (const change of [
    { generation: 'other' },
    { sourceRevision: 'b'.repeat(40) },
    { outputsHash: '0'.repeat(64) },
    { tenantId: 'other' },
  ])
    assert.throws(
      () =>
        validateOperationSnapshot(
          { ...snapshot, ...change },
          configuration,
          () => selected,
        ),
      /snapshot|cache/i,
    );
});

test('ARM network adapter uses DNS ETag and narrow storage PATCH with individual IP rule', async () => {
  const subscription = '11111111-1111-4111-8111-111111111111';
  const prefix = `/subscriptions/${subscription}/resourceGroups/foundation/providers/`;
  const gateId = `${prefix}Microsoft.Network/dnsZones/codingfunlab.com/TXT/_azure-network-lease`;
  const storageId = `${prefix}Microsoft.Storage/storageAccounts/teststate`;
  let gate = {
    etag: 'one',
    properties: {
      TTL: 60,
      TXTRecords: [{ value: ['reserved'] }],
      metadata: {},
    },
  };
  let storage = {
    tags: { project: 'equipment' },
    properties: {
      networkAcls: {
        defaultAction: 'Deny',
        bypass: 'None',
        ipRules: [{ value: '203.0.113.1', action: 'Allow' }],
        virtualNetworkRules: [],
      },
    },
  };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.equal(request.headers.authorization, 'Bearer PRIVATE_TOKEN');
    if (request.url.startsWith(gateId)) {
      if (request.method === 'PUT') {
        assert.equal(request.headers['if-match'], gate.etag);
        gate = { ...JSON.parse(body), etag: `${gate.etag}x` };
      }
      response.end(JSON.stringify(gate));
    } else {
      assert.ok(request.url.startsWith(storageId));
      if (request.method === 'PATCH') {
        const update = JSON.parse(body);
        assert.deepEqual(Object.keys(update).sort(), ['properties', 'tags']);
        assert.deepEqual(Object.keys(update.properties), ['networkAcls']);
        assert.equal(update.properties.networkAcls.defaultAction, 'Deny');
        assert.ok(
          update.properties.networkAcls.ipRules.every(
            (rule) => !rule.value.endsWith('/32'),
          ),
        );
        storage = update;
      }
      response.end(JSON.stringify(storage));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = createArmNetworkProvider({
      gateId,
      resources: { state: { id: storageId, kind: 'storage' } },
      token: async () => 'PRIVATE_TOKEN',
      origin: `http://127.0.0.1:${server.address().port}`,
    });
    await withBackendAccess(
      provider,
      { id: 'state', baseline: ['203.0.113.1/32'], cidr: '198.51.100.2/32' },
      async (access) => access.verify(),
    );
    assert.deepEqual((await provider.readResource('state')).ranges, [
      '203.0.113.1/32',
    ]);
    await assert.rejects(
      provider.readResource('/arbitrary/resource'),
      /configured/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function networkBoundary() {
  let sequence = 1;
  let gate = {
    etag: '1',
    properties: {
      TTL: 60,
      TXTRecords: [{ value: ['reserved'] }],
      metadata: {},
    },
  };
  const resources = new Map(
    ['storage', 'vault', 'aks'].map((kind) => [
      kind,
      { kind, tags: { project: 'equipment' }, ranges: ['203.0.113.1/32'] },
    ]),
  );
  const events = [];
  return {
    events,
    resources,
    async readGate() {
      return globalThis.structuredClone(gate);
    },
    async writeGate(value, etag) {
      if (etag !== gate.etag) throw new Error('conflict');
      gate = { ...globalThis.structuredClone(value), etag: String(++sequence) };
      events.push(
        Object.keys(gate.properties.metadata).length
          ? 'dns-acquired'
          : 'dns-released',
      );
    },
    async readResource(id) {
      return globalThis.structuredClone(resources.get(id));
    },
    async writeResource(id, value) {
      resources.set(id, globalThis.structuredClone(value));
      events.push(`write-${id}`);
    },
  };
}

test('DNS gate refuses malformed ownership, unowned records and lost ownership', async () => {
  for (const properties of [
    { TXTRecords: [{ value: ['wrong'] }], metadata: {} },
    { TXTRecords: [{ value: ['reserved'] }], metadata: { unknown: 'x' } },
  ]) {
    const provider = networkBoundary();
    provider.readGate = async () => ({ etag: '1', properties });
    await assert.rejects(
      withDnsNetworkGate(provider, async () => {}),
      /DNS|gate/,
    );
  }
  const provider = networkBoundary();
  await assert.rejects(
    withDnsNetworkGate(provider, async (gate) => {
      provider.readGate = async () => ({
        etag: '2',
        properties: {
          TXTRecords: [{ value: ['reserved'] }],
          metadata: { equipmentOwner: 'other' },
        },
      });
      await gate.assertOwner();
    }),
    /gate|DNS/,
  );
});

test('uncertain asynchronous resource write retains DNS ownership for settling recovery', async () => {
  const provider = networkBoundary();
  provider.writeResource = async () => {
    const error = new OperationalFailure('Network write completion uncertain.');
    error.uncertainNetworkWrite = true;
    throw error;
  };
  await assert.rejects(
    updateNetworkAdmissions(provider, {
      id: 'storage',
      baseline: ['203.0.113.1/32'],
      owner: '11111111-1111-4111-8111-111111111111',
      cidr: '198.51.100.3/32',
      expires: new Date(Date.now() + 60000).toISOString(),
    }),
    /uncertain/,
  );
  assert.ok((await provider.readGate()).properties.metadata.equipmentOwner);
});

test('network admissions preserve baseline, other active leases and unrelated tags across all resource kinds', async () => {
  const provider = networkBoundary();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  for (const kind of ['storage', 'vault', 'aks']) {
    await updateNetworkAdmissions(provider, {
      id: kind,
      baseline: ['203.0.113.1/32'],
      owner: other,
      cidr: '198.51.100.2/32',
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    await updateNetworkAdmissions(provider, {
      id: kind,
      baseline: ['203.0.113.1/32'],
      owner,
      cidr: '198.51.100.3/32',
      expires: new Date(Date.now() + 60000).toISOString(),
    });
    await updateNetworkAdmissions(provider, {
      id: kind,
      baseline: ['203.0.113.1/32'],
      owner,
      remove: true,
    });
    assert.deepEqual(provider.resources.get(kind).ranges.sort(), [
      '198.51.100.2/32',
      '203.0.113.1/32',
    ]);
    assert.equal(provider.resources.get(kind).tags.project, 'equipment');
    assert.ok(
      provider.resources.get(kind).tags[`equipment-admission-${other}`],
    );
  }
});

test('network admission rejects overlong expiry, malformed tags and capacity overflow before mutation', async () => {
  const request = {
    id: 'storage',
    baseline: ['203.0.113.1/32'],
    owner: '11111111-1111-4111-8111-111111111111',
    cidr: '198.51.100.3/32',
    expires: new Date(Date.now() + 60000).toISOString(),
  };
  await assert.rejects(
    updateNetworkAdmissions(networkBoundary(), {
      ...request,
      expires: new Date(Date.now() + 1805000).toISOString(),
    }),
    /invalid/,
  );
  const malformed = networkBoundary();
  malformed.resources.get('storage').tags['equipment-admission-invalid'] = '{}';
  await assert.rejects(
    updateNetworkAdmissions(malformed, request),
    /Malformed/,
  );
  const full = networkBoundary();
  for (let index = 0; index < 10; index++) {
    const owner = `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`;
    full.resources.get('storage').tags[`equipment-admission-${owner}`] =
      JSON.stringify({
        cidr: '198.51.100.2/32',
        expires: new Date(Date.now() + 60000).toISOString(),
      });
  }
  full.resources.get('storage').ranges.push('198.51.100.2/32');
  await assert.rejects(updateNetworkAdmissions(full, request), /capacity/);
  assert.equal(full.events.includes('write-storage'), false);
});

test('owned network cleanup failure fails successful work and preserves simultaneous private primary failure', async () => {
  for (const primary of [false, true]) {
    const provider = networkBoundary();
    const update = provider.writeResource;
    let writes = 0;
    provider.writeResource = async (...args) => {
      if (++writes > 1) throw new Error('PRIVATE cleanup');
      return update(...args);
    };
    await assert.rejects(
      withBackendAccess(
        provider,
        {
          id: 'storage',
          baseline: ['203.0.113.1/32'],
          cidr: '198.51.100.3/32',
          report: () => {},
        },
        async () => {
          if (primary) throw new Error('PRIVATE primary');
        },
      ),
      (error) => {
        assert.doesNotMatch(error.message, /PRIVATE/);
        assert.match(error.message, primary ? /operation failed/ : /cleanup/);
        return true;
      },
    );
  }
});

test('backend admission releases DNS before Blob wait and cleanup can acquire DNS while another owner waits', async () => {
  const provider = networkBoundary();
  let blobAcquired = false;
  await withBackendAccess(
    provider,
    { id: 'storage', baseline: ['203.0.113.1/32'], cidr: '198.51.100.3/32' },
    async () => {
      assert.deepEqual((await provider.readGate()).properties.metadata, {});
      blobAcquired = true;
      await withDnsNetworkGate(provider, async () => {
        provider.events.push('competing-cleanup');
      });
    },
  );
  assert.equal(blobAcquired, true);
  assert.deepEqual(provider.resources.get('storage').ranges, [
    '203.0.113.1/32',
  ]);
  assert.ok(provider.events.includes('competing-cleanup'));
});

test('combined operation removes network admission before releasing Blob including failed work', async () => {
  for (const shouldFail of [false, true]) {
    const network = networkBoundary();
    const blob = boundary();
    const release = blob.release;
    blob.release = async () => {
      assert.deepEqual(network.resources.get('storage').ranges, [
        '203.0.113.1/32',
      ]);
      return release();
    };
    const work = withAzureOperation(
      config,
      {
        provider: blob,
        networkProvider: network,
        backend: {
          id: 'storage',
          baseline: ['203.0.113.1/32'],
          cidr: '198.51.100.3/32',
        },
        operation: 'apply',
      },
      async () => {
        if (shouldFail) throw new Error('PRIVATE failure');
      },
    );
    if (shouldFail) await assert.rejects(work, /operation failed/);
    else await work;
  }
});

test('Terraform admits both retained accounts before one Blob lease and cleans both before release', async () => {
  const network = networkBoundary();
  network.resources.set('state', {
    kind: 'storage',
    tags: {},
    ranges: ['203.0.113.1/32'],
  });
  network.resources.set('recoveryStorage', {
    kind: 'storage',
    tags: {},
    ranges: ['203.0.113.1/32'],
  });
  const blob = boundary();
  const acquire = blob.acquire;
  blob.acquire = async (...args) => {
    assert.deepEqual((await network.readGate()).properties.metadata, {});
    for (const id of ['state', 'recoveryStorage'])
      assert.ok(network.resources.get(id).ranges.includes('198.51.100.3/32'));
    return acquire(...args);
  };
  blob.release = async () => {
    for (const id of ['state', 'recoveryStorage'])
      assert.deepEqual(network.resources.get(id).ranges, ['203.0.113.1/32']);
  };
  await withAzureOperation(
    config,
    {
      provider: blob,
      networkProvider: network,
      backendResources: ['recoveryStorage', 'state'].map((id) => ({
        id,
        baseline: ['203.0.113.1/32'],
        cidr: '198.51.100.3/32',
      })),
      operation: 'apply',
    },
    async () => {},
  );
});

test(
  'competing admitted owner waits for Blob while holder cleanup and reaper use DNS without lock inversion',
  { timeout: 5000 },
  async () => {
    const network = networkBoundary();
    const entered = Promise.withResolvers();
    const waiting = Promise.withResolvers();
    const released = Promise.withResolvers();
    const blob = boundary();
    let held = false;
    blob.acquire = async () => {
      if (held) {
        assert.deepEqual((await network.readGate()).properties.metadata, {});
        waiting.resolve();
        await released.promise;
      }
      held = true;
    };
    blob.release = async () => {
      held = false;
      released.resolve();
    };
    const options = {
      provider: blob,
      networkProvider: network,
      backendResources: [
        {
          id: 'storage',
          baseline: ['203.0.113.1/32'],
          cidr: '198.51.100.3/32',
        },
      ],
      operation: 'apply',
    };
    const first = withAzureOperation(config, options, async () => {
      entered.resolve();
      await waiting.promise;
    });
    await entered.promise;
    const second = withAzureOperation(
      config,
      { ...options, operation: 'backup' },
      async () => {
        await updateNetworkAdmissions(network, {
          id: 'storage',
          baseline: ['203.0.113.1/32'],
          reap: true,
        });
        assert.ok(
          network.resources.get('storage').ranges.includes('198.51.100.3/32'),
        );
      },
    );
    await Promise.all([first, second]);
    assert.deepEqual(network.resources.get('storage').ranges, [
      '203.0.113.1/32',
    ]);
  },
);

test('backend renewal reacquires DNS independently and cannot outlive its declared operation budget', async () => {
  const provider = networkBoundary();
  let now = Date.now();
  await withBackendAccess(
    provider,
    {
      id: 'storage',
      baseline: ['203.0.113.1/32'],
      cidr: '198.51.100.3/32',
      now: () => now,
      durationMs: 3600000,
    },
    async (access) => {
      now += 600000;
      await access.renew();
      assert.deepEqual((await provider.readGate()).properties.metadata, {});
      const tag =
        provider.resources.get('storage').tags[
          `equipment-admission-${access.owner}`
        ];
      assert.equal(Date.parse(JSON.parse(tag).expires), now + 1800000);
      now += 3000001;
      await assert.rejects(access.renew(), /budget|expired/);
    },
  );
});

test('ARM reaper needs no Blob or vault data access and rejects unknown rules and malformed tags', async () => {
  const provider = networkBoundary();
  const resource = provider.resources.get('vault');
  resource.tags['equipment-admission-11111111-1111-4111-8111-111111111111'] =
    JSON.stringify({
      cidr: '198.51.100.3/32',
      expires: '2020-01-01T00:00:00.000Z',
    });
  resource.ranges.push('198.51.100.3/32');
  await updateNetworkAdmissions(provider, {
    id: 'vault',
    baseline: ['203.0.113.1/32'],
    reap: true,
  });
  assert.deepEqual(provider.resources.get('vault').ranges, ['203.0.113.1/32']);
  resource.ranges.push('198.51.100.9/32');
  provider.resources.set('vault', resource);
  await assert.rejects(
    updateNetworkAdmissions(provider, {
      id: 'vault',
      baseline: ['203.0.113.1/32'],
      reap: true,
    }),
    /baseline|unexplained/i,
  );
});

test('reaper verifies clean baselines without repeatedly updating AKS or vault resources', async () => {
  const provider = networkBoundary();
  await updateNetworkAdmissions(provider, {
    id: 'aks',
    baseline: ['203.0.113.1/32'],
    reap: true,
  });
  assert.equal(provider.events.includes('write-aks'), false);
});

test('nightly stop handles both Bucharest offsets and bounded override expiry', () => {
  assert.equal(safetyStopDue('2026-01-01T21:00:00Z'), true);
  assert.equal(safetyStopDue('2026-07-01T20:00:00Z'), true);
  assert.equal(safetyStopDue('2026-07-01T19:00:00Z'), false);
  assert.equal(
    safetyStopDue('2026-07-01T20:00:00Z', {
      issued: '2026-07-01T19:00:00Z',
      expires: '2026-07-01T21:00:00Z',
      actor: 'owner',
      reason: 'exercise',
    }),
    false,
  );
  assert.equal(
    safetyStopDue('2026-07-01T20:00:00Z', {
      issued: '2026-07-01T18:00:00Z',
      expires: '2026-07-01T19:00:00Z',
      actor: 'owner',
      reason: 'exercise',
    }),
    true,
  );
  assert.throws(
    () =>
      safetyStopDue('2026-07-01T20:00:00Z', {
        expires: '2099-01-01T00:00:00Z',
      }),
    /override/,
  );
});

test('start observes settling and actual provider state then requires every readiness check', async () => {
  const events = [];
  let running = false;
  const provider = {
    async cluster() {
      return {
        properties: {
          powerState: { code: running ? 'Running' : 'Stopped' },
          provisioningState: 'Succeeded',
        },
      };
    },
    async transition(action) {
      events.push(action);
      running = true;
    },
  };
  await assert.rejects(
    runLifecycle(provider, 'start', {
      lastStop: new Date(Date.now() - 60000).toISOString(),
      wait: async (ms) => events.push(ms),
      readiness: async () => ({ certificates: true }),
    }),
    /readiness/,
  );
  assert.equal(events[0] >= 14 * 60000, true);
  assert.equal(events[1], 'start');
  const checks = Object.fromEntries(
    [
      'certificates',
      'secrets',
      'login',
      'persistence',
      'messaging',
      'deployed',
      'history',
    ].map((key) => [key, true]),
  );
  assert.equal(
    (await runLifecycle(provider, 'start', { readiness: async () => checks }))
      .state,
    'Running',
  );
});

test('failed provider transition cannot be reported stopped', async () => {
  await assert.rejects(
    runLifecycle(
      {
        cluster: async () => ({
          properties: {
            powerState: { code: 'Running' },
            provisioningState: 'Failed',
          },
        }),
      },
      'stop',
    ),
    /provider/,
  );
});

test('real REST adapter uses Blob lease headers and actual AKS read schema', async () => {
  let record = null;
  let lease;
  let ranges = ['203.0.113.1/32'];
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ url: request.url, method: request.method });
    assert.equal(request.headers.authorization, 'Bearer PRIVATE_TOKEN');
    if (request.url.includes('comp=lease')) {
      const action = request.headers['x-ms-lease-action'];
      if (action === 'acquire') {
        assert.equal(request.headers['x-ms-lease-duration'], '60');
        lease = request.headers['x-ms-proposed-lease-id'];
        assert.match(lease, /^[a-f0-9-]{36}$/);
      } else assert.equal(request.headers['x-ms-lease-id'], lease);
      response.writeHead(action === 'acquire' ? 201 : 200).end();
    } else if (request.url.startsWith('/operations/')) {
      if (request.method === 'GET') response.end(JSON.stringify(record));
      else if (request.headers['if-none-match'] && record)
        response.writeHead(412).end();
      else {
        if (lease && !request.headers['if-none-match'])
          assert.equal(request.headers['x-ms-lease-id'], lease);
        assert.equal(request.headers['x-ms-blob-type'], 'BlockBlob');
        record = JSON.parse(body);
        response.writeHead(201).end();
      }
    } else if (request.method === 'PUT') {
      assert.equal(request.headers['if-match'], 'cluster-etag');
      ranges =
        JSON.parse(body).properties.apiServerAccessProfile.authorizedIPRanges;
      response.writeHead(202).end();
    } else
      response.end(
        JSON.stringify({
          location: 'westeurope',
          etag: 'cluster-etag',
          properties: {
            provisioningState: 'Succeeded',
            powerState: { code: 'Running' },
            apiServerAccessProfile: { authorizedIPRanges: ranges },
          },
        }),
      );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const provider = createRestProvider({
      environment: 'learning',
      clusterId: '/cluster',
      token: async () => 'PRIVATE_TOKEN',
      blobOrigin: origin,
      armOrigin: origin,
    });
    await withOperationLease(
      config,
      { provider, operation: 'start' },
      async (operation) => {
        const settings = {
          config,
          outputs: {
            operation_storage_account_name: 'fixturerecovery',
            recovery_storage_account_name: 'fixturerecovery',
            operation_container_name: 'operations',
          },
          token: async () => 'PRIVATE_TOKEN',
          operation,
          allowedOperations: ['start'],
          request: (url, options) =>
            globalThis.fetch(
              origin + new URL(url).pathname + new URL(url).search,
              options,
            ),
        };
        const held = await assertAzureOperationLease(settings);
        assert.equal(held.owner, operation.leaseId);
        assert.equal(held.nonce, operation.leaseId);
        await assert.rejects(
          assertAzureOperationLease({
            ...settings,
            allowedOperations: ['apply'],
          }),
          /lease/i,
        );
        const previous = record.owner;
        record.owner = '11111111-1111-4111-8111-111111111111';
        await assert.rejects(assertAzureOperationLease(settings), /lease/i);
        record.owner = previous;
        assert.equal(
          (await provider.cluster()).properties.powerState.code,
          'Running',
        );
      },
    );
    assert.deepEqual(ranges, ['203.0.113.1/32']);
    assert.equal(record.operation, 'start');
    assert.equal(
      requests.filter(
        (item) => item.method === 'PUT' && item.url.startsWith('/cluster'),
      ).length,
      0,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function boundary({ record = null } = {}) {
  let held = false;
  const effects = [];
  return {
    effects,
    async acquire() {
      if (held) throw new Error('PRIVATE lease conflict');
      held = true;
    },
    async renew() {
      effects.push('renew');
    },
    async release() {
      held = false;
      effects.push('release');
    },
    async readRecord() {
      return record;
    },
    async writeRecord(value) {
      record = globalThis.structuredClone(value);
    },
  };
}

test('operation lease serializes competing owners and releases after failure', async () => {
  const provider = boundary();
  await withOperationLease(
    config,
    { provider, operation: 'apply' },
    async () => {
      await assert.rejects(
        withOperationLease(
          config,
          { provider, operation: 'stop' },
          async () => {},
        ),
        /lease acquire/,
      );
    },
  );
  await assert.rejects(
    withOperationLease(config, { provider, operation: 'apply' }, async () => {
      throw new Error('PRIVATE failure');
    }),
    /operation failed/,
  );
  assert.equal(
    provider.effects.filter((value) => value === 'release').length,
    2,
  );
});

test('public CLI rejects unsupported action without leaking private arguments', () => {
  assert.throws(
    () =>
      executeProcess(
        process.execPath,
        ['scripts/azure-operations.mjs', 'PRIVATE_INVALID'],
        { output: 'public-capture', operation: 'operations CLI', tool: 'node' },
      ),
    (error) => {
      assert.match(error.details.stderr, /Unsupported Azure operation/);
      assert.doesNotMatch(
        error.details.stderr,
        /PRIVATE_INVALID|node:internal/,
      );
      return true;
    },
  );
});

test('public start CLI validates private readiness inputs before any Azure token or provider call', () => {
  assert.throws(
    () =>
      executeProcess(
        process.execPath,
        [
          'scripts/azure-operations.mjs',
          'start',
          '--config',
          'private',
          '--outputs',
          'private',
          '--state',
          'absent-private-state',
          '--kubeconfig',
          'private',
        ],
        { output: 'public-capture', operation: 'operations CLI', tool: 'node' },
      ),
    (error) => {
      assert.match(error.details.stderr, /readiness requires/);
      assert.doesNotMatch(
        error.details.stderr,
        /absent-private-state|Unsupported|node:internal/,
      );
      return true;
    },
  );
});
