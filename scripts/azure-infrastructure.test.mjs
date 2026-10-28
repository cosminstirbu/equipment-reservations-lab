import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer as createTcpServer } from 'node:net';
import { inspectionGuardFixture } from './azure-guard-test-fixture.mjs';

test('environment guard delta accepts only six exact actor bindings and a fixed generation locator', async () => {
  const { validateGuardGenerationOutput } =
    await import('./azure-infrastructure.mjs');
  const scope =
    '/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/erwlearning';
  const delta = {
    current_activation_reference: 'current/learning/lab2026.json',
    inspection_bindings: [
      'apply',
      'backup',
      'destroy',
      'plan',
      'reaper',
      'restore',
    ].map((actor, index) => ({
      roleKey: 'permissions',
      principalId: `${index + 1}1111111-1111-4111-8111-111111111111`,
      assignmentId: `${scope}/providers/Microsoft.Authorization/roleAssignments/${index + 1}2222222-2222-4222-8222-222222222222`,
      scope,
      queryScopes: [scope],
    })),
  };
  assert.deepEqual(validateGuardGenerationOutput(delta), delta);
  assert.equal(
    validateGuardGenerationOutput({
      ...delta,
      current_activation_reference: 'current/learning/2026.json',
    }).current_activation_reference,
    'current/learning/2026.json',
  );
  for (const mutate of [
    (x) => {
      x.current_activation_reference = 'https://foreign/current.json';
    },
    (x) => {
      x.current_activation_reference = 'current/learning/../lab2026.json';
    },
    (x) => {
      x.inspection_bindings.pop();
    },
    (x) => {
      x.inspection_bindings[0].roleKey = 'authority';
    },
    (x) => {
      x.inspection_bindings[0].queryScopes.push('/subscriptions/foreign');
    },
    (x) => {
      x.inspection_bindings[0].assignmentId =
        x.inspection_bindings[1].assignmentId;
    },
    (x) => {
      x.secret = 'PRIVATE_MARKER';
    },
  ]) {
    const changed = globalThis.structuredClone(delta);
    mutate(changed);
    assert.throws(
      () => validateGuardGenerationOutput(changed),
      /guard.*projection/i,
    );
  }
});

test('opt-in kubectl prerequisite diagnostics expose only the proven enum through real failed processes', async () => {
  const { runPrivateProcess } = await import('./azure-infrastructure.mjs');
  const refusal =
    'Unable to connect to the server: dial tcp 127.0.0.1:12345: connectex: No connection could be made because the target machine actively refused it.';
  const settings = {
    operation: 'Native prerequisite diagnostic',
    tool: 'kubectl',
    failurePolicy: 'kubectl-prerequisite',
    timeout: 5000,
  };
  const failure = async (stderr, extra = {}) => {
    try {
      await runPrivateProcess(
        process.execPath,
        [
          '-e',
          `process.stderr.write(${JSON.stringify(stderr)});process.exit(17)`,
        ],
        { ...settings, ...extra },
      );
      assert.fail('Expected failed child');
    } catch (error) {
      return error;
    }
  };
  const known = await failure(refusal);
  assert.equal(known.providerCategory, 'connection-refused');
  assert.equal(known.details.category, 'exit');
  assert.equal(known.details.status, 17);
  assert.match(known.message, /providerCategory=connection-refused/);
  for (const text of [
    'PRIVATE_DIAGNOSTIC_MARKER',
    refusal + '\nPRIVATE_DIAGNOSTIC_MARKER',
    refusal + '\nError from server (Forbidden): PRIVATE_DIAGNOSTIC_MARKER',
  ]) {
    const error = await failure(text);
    assert.equal(error.providerCategory, 'unclassified');
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_DIAGNOSTIC_MARKER|127\.0\.0\.1|connectex/,
    );
    assert.equal(error.cause, undefined);
  }
  const ordinary = await failure(refusal, { failurePolicy: undefined });
  assert.equal(ordinary.providerCategory, undefined);
  assert.doesNotMatch(
    ordinary.message + JSON.stringify(ordinary),
    /connectex|127\.0\.0\.1/,
  );
  assert.equal(
    await runPrivateProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write("ready");process.stderr.write("PRIVATE_DIAGNOSTIC_MARKER")',
      ],
      settings,
    ),
    'ready',
  );
  await assert.rejects(
    runPrivateProcess(
      process.execPath,
      ['-e', 'process.stderr.write("PRIVATE_DIAGNOSTIC_MARKER".repeat(10000))'],
      { ...settings, maxBuffer: 1000 },
    ),
    (error) =>
      error.details.category === 'output-limit' &&
      error.providerCategory === 'unclassified' &&
      !/PRIVATE_DIAGNOSTIC_MARKER/.test(error.message + JSON.stringify(error)),
  );
  const controller = new globalThis.AbortController();
  const pending = runPrivateProcess(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    { ...settings, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(
    pending,
    (error) =>
      error.providerCategory === 'unclassified' &&
      /failed|cancelled/.test(error.message),
  );
  await assert.rejects(
    runPrivateProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      ...settings,
      timeout: 50,
    }),
    (error) =>
      error.details.category === 'timeout' &&
      error.providerCategory === 'unclassified',
  );
  assert.throws(
    () =>
      runPrivateProcess(process.execPath, ['-e', 'void 0'], {
        ...settings,
        failurePolicy: () => 'PRIVATE_DIAGNOSTIC_MARKER',
      }),
    /failure policy is invalid/,
  );
  assert.deepEqual(
    await runPrivateProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write("ready");process.stderr.write("PRIVATE_DIAGNOSTIC_MARKER")',
      ],
      { ...settings, captureStderr: true },
    ),
    { stdout: 'ready', stderr: 'PRIVATE_DIAGNOSTIC_MARKER' },
  );
  const { cleanupAll } = await import('./process.mjs');
  const reports = [];
  await assert.rejects(
    cleanupAll(
      [
        {
          operation: 'Diagnostic cleanup contract',
          tool: 'kubectl',
          run: () =>
            runPrivateProcess(
              process.execPath,
              [
                '-e',
                'process.stderr.write("PRIVATE_DIAGNOSTIC_MARKER");process.exit(23)',
              ],
              settings,
            ),
        },
      ],
      { primary: known, report: (text) => reports.push(text) },
    ),
    (error) =>
      error === known &&
      error.details.status === 17 &&
      error.providerCategory === 'connection-refused',
  );
  assert.match(reports.join('\n'), /status=23.*providerCategory=unclassified/);
  assert.doesNotMatch(
    reports.join('\n'),
    /PRIVATE_DIAGNOSTIC_MARKER|127\.0\.0\.1/,
  );
});

test('pinned kubectl closed-loop refusal qualifies the private prerequisite enum without user kubeconfig', async () => {
  const { runPrivateProcess } = await import('./azure-infrastructure.mjs');
  const { qualityContext, verifiedTool } = await import('./azure-quality.mjs');
  const { createPrivateDirectory } = await import('./local-platform.mjs');
  const directory = mkdtempSync(
    resolve('.cache', 'kubectl-diagnostic-contract-'),
  );
  createPrivateDirectory(directory);
  try {
    const file = join(directory, 'config');
    writeFileSync(
      file,
      'apiVersion: v1\nkind: Config\nclusters: []\nusers: []\ncontexts: []\n',
      { mode: 0o600 },
    );
    const server = createTcpServer();
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const port = server.address().port;
    await new Promise((done) => server.close(done));
    await assert.rejects(
      runPrivateProcess(
        verifiedTool(qualityContext(), 'kubectl'),
        [
          '--kubeconfig',
          file,
          '--cache-dir',
          join(directory, 'cache'),
          '--server',
          `http://127.0.0.1:${port}`,
          '--request-timeout=2s',
          'get',
          '--raw=/readyz',
        ],
        {
          operation: 'Pinned kubectl prerequisite refusal',
          tool: 'kubectl',
          failurePolicy: 'kubectl-prerequisite',
          timeout: 10000,
          maxBuffer: 65536,
        },
      ),
      (error) => {
        assert.equal(
          error.providerCategory,
          process.platform === 'win32' ? 'connection-refused' : 'unclassified',
        );
        assert.equal(error.details.category, 'exit');
        assert.equal(error.details.status, 1);
        assert.doesNotMatch(
          error.message + JSON.stringify(error),
          /127\.0\.0\.1|connectex|readyz|config/,
        );
        return true;
      },
    );
  } finally {
    assert.equal(resolve(directory, '..'), resolve('.cache'));
    rmSync(directory, { recursive: true, force: true });
  }
});

const validConfig = () => ({
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
});

const capabilities = (config) => ({
  account: {
    id: config.subscriptionId,
    tenantId: config.tenantId,
    state: 'Enabled',
  },
  versions: { values: [{ version: '1.35', patchVersions: { '1.35.8': {} } }] },
  skus: [
    { name: 'Standard_D4s_v5', locations: ['westeurope'], restrictions: [] },
  ],
  usage: [
    { name: { value: 'standardDSv5Family' }, limit: 20, currentValue: 0 },
    { name: { value: 'cores' }, limit: 20, currentValue: 0 },
  ],
  operatorGroup: { id: config.operatorGroupObjectId },
  permissions: [{ actions: ['*'], notActions: [] }],
  directoryRoles: {
    value: [{ roleTemplateId: '62e90394-69f5-4237-9190-012177145e10' }],
  },
});

test('null recovery key is permitted only in explicit initial foundation stage', async () => {
  const { validateAzureConfig, evaluateCapabilities } =
    await import('./azure-infrastructure.mjs');
  const config = { ...validConfig(), recoveryKeyVersion: null };
  assert.throws(() => validateAzureConfig(config), /configuration/i);
  assert.equal(
    validateAzureConfig(config, { stage: 'foundation-bootstrap' }),
    config,
  );
  const workflow = capabilities(validConfig());
  workflow.directoryRoles = { value: [] };
  workflow.permissions = [
    { actions: ['*'], notActions: ['Microsoft.Authorization/*/Write'] },
  ];
  assert.equal(
    evaluateCapabilities(validConfig(), workflow, { stage: 'environment' })
      .nodes,
    2,
  );
  assert.throws(
    () =>
      evaluateCapabilities(validConfig(), workflow, {
        stage: 'foundation-bootstrap',
      }),
    /authority/i,
  );
});

test('read-only plan identity does not need apply or tenant administrator authority', async () => {
  const { evaluateCapabilities } = await import('./azure-infrastructure.mjs');
  const config = validConfig();
  const data = {
    ...capabilities(config),
    permissions: [{ actions: ['*/read'], notActions: [] }],
    directoryRoles: { value: [] },
  };
  assert.equal(
    evaluateCapabilities(config, data, { operation: 'plan' }).nodes,
    2,
  );
  assert.throws(
    () => evaluateCapabilities(config, data, { operation: 'apply' }),
    /authority/i,
  );
});

test('approved config validates and narrow prerequisite changes fail closed', async () => {
  const { validateAzureConfig, evaluateCapabilities } =
    await import('./azure-infrastructure.mjs');
  const config = validConfig();
  assert.equal(validateAzureConfig(config), config);
  assert.equal(evaluateCapabilities(config, capabilities(config)).nodes, 2);
  for (const change of [
    { operatorCidrs: ['0.0.0.0/0'] },
    { operatorCidrs: ['8.8.8.8/24/32'] },
    { operatorCidrs: ['203.0.113.1/32'] },
    { acmeTermsAccepted: false },
    { nodeCount: 1 },
    { kubernetesVersion: '1.36.0' },
    { region: 'eastus' },
    { password: 'PRIVATE_CONFIG_MARKER' },
    {
      environmentBackend: {
        ...config.environmentBackend,
        storageAccountName: 'otherstate',
      },
    },
    {
      environmentBackend: {
        ...config.environmentBackend,
        containerName: config.foundationBackend.containerName,
      },
    },
  ])
    assert.throws(
      () => validateAzureConfig({ ...validConfig(), ...change }),
      /configuration/i,
    );
  for (const change of [
    { versions: { values: [] } },
    { skus: [] },
    { usage: [] },
    {
      permissions: [{ actions: ['*/read'], notActions: [] }],
    },
  ])
    assert.throws(
      () =>
        evaluateCapabilities(config, { ...capabilities(config), ...change }),
      /prerequisite|unsupported|authority/i,
    );
});

test('current cost BOM uses EUR consumption regular meters and accounts for retained resources', async () => {
  const { retailBillOfMaterials, calculateCost } =
    await import('./azure-infrastructure.mjs');
  const request = async (url) => {
    assert.equal(url.origin, 'https://prices.azure.com');
    assert.equal(url.searchParams.get('currencyCode'), 'EUR');
    const filter = url.searchParams.get('$filter');
    const field = (name) => new RegExp(`${name} eq '([^']*)'`).exec(filter)[1];
    const meter = field('meterName');
    const unit =
      meter === 'Analytics Logs Data Ingestion'
        ? '1 GB'
        : meter === 'Public Zone'
          ? '1'
          : meter.includes('Registry')
            ? '1/Day'
            : meter.includes('Data Stored')
              ? '1 GB/Month'
              : meter.includes('Disk')
                ? '1/Month'
                : '1 Hour';
    return {
      ok: true,
      json: async () => ({
        Items: [
          {
            currencyCode: 'EUR',
            type: 'Consumption',
            unitOfMeasure: unit,
            tierMinimumUnits: meter === 'Analytics Logs Data Ingestion' ? 5 : 0,
            productName: field('productName'),
            meterName: meter,
            skuName: field('skuName'),
            armRegionName: field('armRegionName'),
            retailPrice: 0.001,
            meterId: 'fixture',
          },
        ],
        NextPageLink: null,
      }),
    };
  };
  const items = await retailBillOfMaterials({ request });
  const cost = calculateCost(items, { taxRate: 0 });
  assert.equal(items.length, 13);
  assert.equal(
    items.find((item) => item.id === 'audit-ingestion').retainedQuantity,
    (0.03 * 730) / 24,
  );
  assert.ok(cost.runningGross > cost.stoppedGross);
  assert.equal(items.find((item) => item.id === 'compute').runningQuantity, 80);
  assert.equal(items.find((item) => item.id === 'disk-e4').retainedQuantity, 6);
  await assert.rejects(
    () =>
      retailBillOfMaterials({
        request: async () => ({ ok: true, json: async () => ({ Items: [] }) }),
      }),
    /cost meter/i,
  );
});

const invoke = (...args) =>
  spawnSync(
    process.execPath,
    [resolve('scripts/azure-infrastructure.mjs'), ...args],
    { encoding: 'utf8', timeout: 10000 },
  );

test('public preflight rejects missing configuration before provider access', () => {
  const result = invoke('preflight');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configuration/i);
});

test('public guard qualification dispatch rejects missing purpose and projection before provider access', async (t) => {
  const { createPrivateDirectory } = await import('./local-platform.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-guard-cli-'));
  createPrivateDirectory(directory);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  writeFileSync(path, JSON.stringify(validConfig()), { mode: 0o600 });
  const result = invoke('guard-qualify', '--config', path);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /guard qualification requires/i);
});

test('public config validation rejects examples and unknown secret fields privately', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'azure-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  writeFileSync(path, JSON.stringify({ password: 'PRIVATE_CONFIG_MARKER' }));
  const result = invoke('validate-config', '--config', path);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configuration/i);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_CONFIG_MARKER/);
});

test('capability and current cost gate reject unknown or excessive prerequisites', async () => {
  const { evaluateCapabilities, calculateCost } =
    await import('./azure-infrastructure.mjs');
  assert.throws(
    () => evaluateCapabilities({ region: 'eastus' }, {}),
    /region/i,
  );
  assert.throws(() => calculateCost([]), /cost|price/i);
  assert.throws(
    () =>
      calculateCost(
        [{ id: 'compute', rate: 2, runningQuantity: 80, retainedQuantity: 0 }],
        { taxRate: 0 },
      ),
    /120/,
  );
});

test('gross budget uses explicit tax and fails before paid work when tax or gross cost is unknown', async () => {
  const { calculateCost } = await import('./azure-infrastructure.mjs');
  const items = [
    { id: 'compute', rate: 100, runningQuantity: 1, retainedQuantity: 0 },
  ];
  assert.throws(() => calculateCost(items), /tax/i);
  assert.throws(() => calculateCost(items, { taxRate: 0.25 }), /120/);
  const result = calculateCost(items, { taxRate: 0.19 });
  assert.equal(result.runningNet, 100);
  assert.equal(result.runningTax, 19);
  assert.equal(result.runningGross, 119);
});

test('review association rejects stale revision, inputs, policy, state or expiry', async () => {
  const { validateReviewAssociation } =
    await import('./azure-infrastructure.mjs');
  const expected = {
    revision: 'a'.repeat(40),
    inputHash: 'b'.repeat(64),
    policyHash: 'c'.repeat(64),
    planHash: 'd'.repeat(64),
    stateLineage: 'state',
    stateSerial: 1,
  };
  const review = { ...expected, expiresAt: '2030-01-01T00:00:00Z' };
  assert.doesNotThrow(() =>
    validateReviewAssociation(review, expected, new Date('2026-10-26')),
  );
  for (const field of Object.keys(expected))
    assert.throws(
      () =>
        validateReviewAssociation(
          { ...review, [field]: 'wrong' },
          expected,
          new Date('2026-10-26'),
        ),
      /review/i,
    );
  assert.throws(
    () => validateReviewAssociation(review, expected, new Date('2031-01-01')),
    /expired/i,
  );
  assert.throws(
    () =>
      validateReviewAssociation(
        { expiresAt: '2030-01-01' },
        {},
        new Date('2026-10-26'),
      ),
    /review/i,
  );
});

test('Terraform projections reject wrong types and sensitive declarations', async () => {
  const { validateTerraformOutputs } =
    await import('./azure-infrastructure.mjs');
  const raw = {
    foundation_resource_group_name: { value: 'foundation' },
    state_storage_account_name: { value: 'labstate' },
    operation_container_name: { value: 'operations' },
    recovery_key_id: {
      value: 'https://retained.vault.azure.net/keys/recovery/abcdef',
    },
  };
  assert.equal(
    validateTerraformOutputs(raw, 'foundation').operation_container_name,
    'operations',
  );
  assert.throws(
    () =>
      validateTerraformOutputs(
        {
          ...raw,
          operation_container_name: { value: { password: 'PRIVATE_MARKER' } },
        },
        'foundation',
      ),
    /output/i,
  );
  assert.throws(
    () =>
      validateTerraformOutputs(
        {
          ...raw,
          operation_container_name: { value: 'operations', sensitive: true },
        },
        'foundation',
      ),
    /output/i,
  );
});

test('operation role projection accepts exactly reviewed lifecycle and continuity roles', async () => {
  const { validateTerraformOutputs } =
    await import('./azure-infrastructure.mjs');
  const base = {
    foundation_resource_group_name: { value: 'foundation' },
    state_storage_account_name: { value: 'labstate' },
    operation_container_name: { value: 'operations' },
    recovery_key_id: {
      value: 'https://retained.vault.azure.net/keys/recovery/abcdef',
    },
  };
  const id =
    '/subscriptions/11111111-1111-4111-8111-111111111111/providers/Microsoft.Authorization/roleDefinitions/22222222-2222-4222-8222-222222222222';
  const roles = Object.fromEntries(
    [
      'stop',
      'admission',
      'lifecycle',
      'continuity_backup',
      'continuity_restore',
      'workload_network',
      'guard_permissions_read',
      'guard_authority_read',
    ].map((key) => [key, id]),
  );
  assert.deepEqual(
    validateTerraformOutputs(
      { ...base, operation_role_ids: { value: roles } },
      'foundation',
    ).operation_role_ids,
    roles,
  );
  assert.throws(
    () =>
      validateTerraformOutputs(
        {
          ...base,
          operation_role_ids: { value: { ...roles, unreviewed: id } },
        },
        'foundation',
      ),
    /role output/,
  );
  assert.throws(
    () =>
      validateTerraformOutputs(
        {
          operation_role_ids: {
            value: {
              ...roles,
              continuity_restore: '/subscriptions/foreign/role',
            },
          },
        },
        'foundation',
      ),
    /role output/,
  );
});

test('guard output schema rejects unreviewed nested authority and malformed references', async () => {
  const { validateVaultGuardOutput } =
    await import('./azure-infrastructure.mjs');
  const subscription = '/subscriptions/11111111-1111-4111-8111-111111111111';
  const scope = `${subscription}/resourceGroups/foundation`;
  const workload = `${subscription}/resourceGroups/workload`;
  const role = `${subscription}/providers/Microsoft.Authorization/roleDefinitions/22222222-2222-4222-8222-222222222222`;
  const guard = inspectionGuardFixture({
    definition_id: `${subscription}/providers/Microsoft.Authorization/policyDefinitions/vault-guard`,
    definition_sha256: 'a'.repeat(64),
    assignment_ids: Object.fromEntries(
      [
        ['recovery', scope],
        ['workload', workload],
      ].map(([k, v]) => [
        k,
        `${v}/providers/Microsoft.Authorization/policyAssignments/guard`,
      ]),
    ),
    scope_ids: { recovery: scope, workload },
    parameters: Object.fromEntries(
      ['recovery', 'workload'].map((k) => [
        k,
        {
          expectedTenantId: { value: '22222222-2222-4222-8222-222222222222' },
          exactVaultName: { value: k === 'recovery' ? 'errecfixture' : '' },
        },
      ]),
    ),
    recovery_vault_id: `${scope}/providers/Microsoft.KeyVault/vaults/errecfixture`,
    workload_vault_name_prefix: 'erw',
    producer_principal_ids: {
      human: '22222222-2222-4222-8222-222222222222',
      apply: '33333333-3333-4333-8333-333333333333',
    },
    evidence_storage_account_name: 'recoveryfixture',
    evidence_container_names: {
      human: 'guard-evidence',
      apply: 'guard-apply-evidence',
    },
    role_definitions: Object.fromEntries(
      ['recovery_network', 'workload_network'].map((k) => [
        k,
        {
          id: role,
        },
      ]),
    ),
  });
  assert.deepEqual(validateVaultGuardOutput(guard), guard);
  for (const key of ['recovery_network', 'workload_network']) {
    const original = guard.role_definitions[key];
    assert.deepEqual(original.actions, [
      'Microsoft.KeyVault/vaults/read',
      'Microsoft.KeyVault/vaults/write',
      'Microsoft.Resources/tags/read',
      'Microsoft.Resources/tags/write',
    ]);
    for (const [label, mutate] of [
      [
        'added action',
        (role) => {
          role.actions.push('Microsoft.KeyVault/vaults/delete');
        },
      ],
      [
        'deleted action',
        (role) => {
          role.actions.pop();
        },
      ],
      [
        'delete substitution',
        (role) => {
          role.actions[1] = 'Microsoft.KeyVault/vaults/delete';
        },
      ],
      [
        'duplicate action',
        (role) => {
          role.actions.push(role.actions[0]);
        },
      ],
      [
        'reordered actions',
        (role) => {
          role.actions.reverse();
        },
      ],
      [
        'null actions',
        (role) => {
          role.actions = null;
        },
      ],
      [
        'non-string action',
        (role) => {
          role.actions[0] = 1;
        },
      ],
      [
        'extra semantic field',
        (role) => {
          role.dataActions = [];
        },
      ],
    ]) {
      const changed = globalThis.structuredClone(guard);
      const role = changed.role_definitions[key];
      mutate(role);
      role.sha256 = createHash('sha256')
        .update(JSON.stringify({ actions: role.actions, dataActions: [] }))
        .digest('hex');
      assert.throws(
        () => validateVaultGuardOutput(changed),
        /guard output/,
        `${key}: ${label} with recomputed hash`,
      );
    }
    for (const sha256 of ['b'.repeat(64), 'invalid', null]) {
      const changed = globalThis.structuredClone(guard);
      changed.role_definitions[key].sha256 = sha256;
      assert.throws(
        () => validateVaultGuardOutput(changed),
        /guard output/,
        `${key}: changed hash`,
      );
    }
  }
  for (const mutate of [
    (x) => {
      x.secret = 'private';
    },
    (x) => {
      x.producer_principal_ids.foreign = x.producer_principal_ids.human;
    },
    (x) => {
      x.assignment_ids.workload = x.assignment_ids.recovery;
    },
    (x) => {
      x.role_definitions.workload_network.actions.push('*');
    },
    (x) => {
      x.parameters.workload.exactVaultName.extra = true;
    },
    (x) => {
      delete x.inspection_roles;
    },
    (x) => {
      x.inspection_roles.authority.sha256 = 'c'.repeat(64);
    },
    (x) => {
      x.inspection_roles.permissions.assignableScopes.push(subscription);
    },
    (x) => {
      x.inspection_roles.policy_definition.dataActions.push('*');
    },
    (x) => {
      x.inspection_bindings.pop();
    },
    (x) => {
      x.inspection_bindings.push(
        globalThis.structuredClone(x.inspection_bindings[0]),
      );
    },
    (x) => {
      x.inspection_bindings[0].queryScopes = [subscription];
    },
    (x) => {
      x.current_family_reference = 'current/foreign/extra.json';
    },
    (x) => {
      x.canary.definition.properties.policyRule.then.effect = 'deny';
    },
    (x) => {
      x.canary.role_assignments.backup.properties.principalId =
        x.producer_principal_ids.apply;
    },
  ]) {
    const changed = globalThis.structuredClone(guard);
    mutate(changed);
    assert.throws(() => validateVaultGuardOutput(changed), /guard output/);
  }
});

test('private asynchronous process keeps heartbeat responsive and suppresses failure payloads', async () => {
  const { runPrivateProcess } = await import('./azure-infrastructure.mjs');
  let responsive = false;
  const pending = runPrivateProcess(
    process.execPath,
    ['-e', 'setTimeout(()=>process.stdout.write("ready"),150)'],
    { operation: 'Async process contract', timeout: 5000 },
  );
  await new Promise((resolve) =>
    globalThis.setTimeout(() => {
      responsive = true;
      resolve();
    }, 25),
  );
  assert.equal(await pending, 'ready');
  assert.equal(responsive, true);
  await assert.rejects(
    () =>
      runPrivateProcess(
        process.execPath,
        [
          '-e',
          'process.stdout.write("PRIVATE_PROCESS_MARKER");process.stderr.write("PRIVATE_PROCESS_MARKER");process.exit(7)',
        ],
        { operation: 'Async process failure', timeout: 5000 },
      ),
    (error) => {
      assert.match(error.message, /status=7/);
      assert.doesNotMatch(
        error.message + JSON.stringify(error),
        /PRIVATE_PROCESS_MARKER/,
      );
      return true;
    },
  );
});

test('private async process reports spawn, timeout, output limit and cancellation safely', async () => {
  const { runPrivateProcess } = await import('./azure-infrastructure.mjs');
  await assert.rejects(
    () =>
      runPrivateProcess('equipment-missing-executable-014', [], {
        operation: 'Missing tool',
        timeout: 1000,
      }),
    /spawn/,
  );
  await assert.rejects(
    () =>
      runPrivateProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        operation: 'Timeout contract',
        timeout: 50,
      }),
    /timeout/,
  );
  await assert.rejects(
    () =>
      runPrivateProcess(
        process.execPath,
        ['-e', 'process.stderr.write("x".repeat(100000))'],
        { operation: 'Output contract', timeout: 1000, maxBuffer: 1000 },
      ),
    /output-limit/,
  );
  const controller = new globalThis.AbortController();
  const pending = runPrivateProcess(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    {
      operation: 'Cancellation contract',
      timeout: 5000,
      signal: controller.signal,
    },
  );
  controller.abort();
  await assert.rejects(() => pending, /failed|cancelled/);
});

test('public bootstrap rejects operational snapshot wrappers as raw Terraform inputs before provider access', async () => {
  const { createPrivateDirectory } = await import('./local-platform.mjs');
  const directory = mkdtempSync(resolve('.cache', 'azure-bootstrap-contract-'));
  createPrivateDirectory(directory);
  assert.ok(
    directory.startsWith(resolve('.cache') + '\\') ||
      directory.startsWith(resolve('.cache') + '/'),
  );
  try {
    const config = join(directory, 'config.json');
    writeFileSync(config, JSON.stringify(validConfig()), { mode: 0o600 });
    const foundation = join(directory, 'foundation.json');
    writeFileSync(
      foundation,
      JSON.stringify(
        Object.fromEntries(
          Object.entries({
            foundation_resource_group_name: 'foundation',
            state_storage_account_name: 'labstate',
            operation_container_name: 'operations',
            recovery_key_id:
              'https://recovery.vault.azure.net/keys/recovery/version',
          }).map(([key, value]) => [key, { value, sensitive: false }]),
        ),
      ),
      { mode: 0o600 },
    );
    const outputs = join(directory, 'environment.json');
    writeFileSync(
      outputs,
      JSON.stringify({
        version: 1,
        outputs: {},
        privateMarker: 'PRIVATE_WRAPPER_MARKER',
      }),
      { mode: 0o600 },
    );
    const result = invoke(
      'bootstrap',
      '--config',
      config,
      '--foundation-outputs',
      foundation,
      '--environment-outputs',
      outputs,
      '--revision',
      'a'.repeat(40),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Terraform output|output projection/i);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /PRIVATE_WRAPPER_MARKER/,
    );
    const maintenance = invoke(
      'operator-credentials',
      '--config',
      config,
      '--stage',
      'foundation-bootstrap',
      '--foundation-outputs',
      foundation,
    );
    assert.notEqual(maintenance.status, 0);
    assert.match(maintenance.stderr, /reviewed expiry/i);
    const { createProjection } = await import('./azure-handoff.mjs');
    const { readFileSync } = await import('node:fs');
    const wrapper = createProjection(
      validConfig(),
      JSON.parse(readFileSync(foundation, 'utf8')),
      'foundation',
    );
    writeFileSync(outputs, JSON.stringify(wrapper), { mode: 0o600 });
    const verified = invoke(
      'validate-projection',
      '--config',
      config,
      '--input',
      outputs,
      '--scope',
      'foundation',
    );
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /projection-valid/);
    assert.doesNotMatch(verified.stdout, /recovery.vault.azure.net/);
    writeFileSync(
      outputs,
      JSON.stringify({ ...wrapper, generation: 'foreign' }),
      { mode: 0o600 },
    );
    const foreign = invoke(
      'validate-projection',
      '--config',
      config,
      '--input',
      outputs,
      '--scope',
      'foundation',
    );
    assert.notEqual(foreign.status, 0);
    assert.match(foreign.stderr, /projection/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
