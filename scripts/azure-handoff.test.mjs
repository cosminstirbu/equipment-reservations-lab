import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { inspectionGuardFixture } from './azure-guard-test-fixture.mjs';

test('durable handoff transport uses exact private paths and rejects foreign, unknown, secret and modified exports', async () => {
  const { createProjection, validateProjection, createBlobJsonTransport } =
    await import('./azure-handoff.mjs');
  const config = {
    environment: 'learning',
    generation: 'lab2026',
    subscriptionId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    gitRevision: 'a'.repeat(40),
  };
  const raw = Object.fromEntries(
    Object.entries({
      foundation_resource_group_name: 'foundation',
      state_storage_account_name: 'stateaccount',
      operation_container_name: 'operations',
      recovery_key_id: 'https://recovery.vault.azure.net/keys/recovery/version',
    }).map(([key, value]) => [key, { value, sensitive: false }]),
  );
  const wrapper = createProjection(config, raw, 'foundation');
  assert.equal(
    validateProjection(wrapper, config, 'foundation')
      .state_storage_account_name,
    'stateaccount',
  );
  for (const changed of [
    { ...wrapper, generation: 'foreign' },
    { ...wrapper, unknown: 'PRIVATE_MARKER' },
    { ...wrapper, outputs: { ...raw, password: { value: 'PRIVATE_MARKER' } } },
    { ...wrapper, outputsHash: 'b'.repeat(64) },
  ])
    assert.throws(
      () => validateProjection(changed, config, 'foundation'),
      /projection|output/i,
    );
  const stored = new Map();
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    if (req.url.includes('denied')) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'PUT') {
      if (req.headers['if-none-match'] === '*' && stored.has(req.url)) {
        res.writeHead(412).end();
        return;
      }
      stored.set(req.url, body);
      res.writeHead(201).end();
    } else if (stored.has(req.url)) {
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(stored.get(req.url));
    } else res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const transport = createBlobJsonTransport({
      account: 'recoveryaccount',
      container: 'bootstrap',
      token: async () => 'PRIVATE_TOKEN',
      request: (url, options) =>
        globalThis.fetch(
          `http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,
          options,
        ),
    });
    await transport.write('foundation/learning.json', wrapper);
    assert.deepEqual(await transport.read('foundation/learning.json'), wrapper);
    await assert.rejects(
      () => transport.createOnly('foundation/learning.json', wrapper),
      /412/,
    );
    await assert.rejects(
      () => transport.read('denied.json'),
      (error) =>
        /403/.test(error.message) && !/PRIVATE_TOKEN/.test(error.message),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('operational composite excludes state/plan fields while validating context and current generation', async () => {
  const { createOperationalProjection, validateOperationalProjection } =
    await import('./azure-handoff.mjs');
  const { operationOutputsHash } = await import('./azure-operations.mjs');
  const fixture = (
    await import('./azure-runtime-fixture.mjs')
  ).azureRuntimeFixtureInput();
  const config = {
    ...fixture.config,
    foundationBackend: {
      ...fixture.config.foundationBackend,
      resourceGroupName: 'foundation',
    },
    environment: 'learning',
    generation: 'lab2026',
    subscriptionId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    operatorGroupObjectId: '55555555-5555-4555-8555-555555555555',
    gitRevision: 'a'.repeat(40),
  };
  const raw = (value) =>
    Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        { value, sensitive: false },
      ]),
    );
  const foundation = {
    ...fixture.foundation,
    foundation_resource_group_name: 'foundation',
    state_storage_account_name: 'stateaccount',
    state_container_name: 'state',
    plan_container_name: 'plans',
    recovery_key_id: 'https://recovery.vault.azure.net/keys/recovery/version',
    recovery_key_version: 'b'.repeat(32),
    recovery_storage_account_name: 'recoveryaccount',
    recovery_container_name: 'recovery',
    operation_storage_account_name: 'recoveryaccount',
    operation_container_name: 'operations',
    bootstrap_container_name: 'bootstrap',
    qualification_container_names: {
      backup: 'qualification-backup',
      restore: 'qualification-restore',
    },
    qualification_challenge_container_name: 'qualification-challenges',
    github_principal_ids: {
      apply: '66666666-6666-4666-8666-666666666666',
      backup: '33333333-3333-4333-8333-333333333333',
      restore: '44444444-4444-4444-8444-444444444444',
    },
    tenant_id: config.tenantId,
    operator_group_object_id: '55555555-5555-4555-8555-555555555555',
    approved_operator_object_ids: ['77777777-7777-4777-8777-777777777777'],
  };
  const environment = {
    ...fixture.environment,
    workload_resource_group_name: 'er-learning-workload',
    aks_cluster_name: 'er-learning-aks',
    aks_resource_id: `/subscriptions/${config.subscriptionId}/resourceGroups/er-learning-workload/providers/Microsoft.ContainerService/managedClusters/er-learning-aks`,
    acr_login_server: 'testregistry.azurecr.io',
    workload_key_vault_uri: 'https://workload.vault.azure.net/',
    tenant_id: config.tenantId,
  };
  const prefix = `/subscriptions/${config.subscriptionId}`;
  const scopes = {
    recovery: `${prefix}/resourceGroups/foundation`,
    workload: `${prefix}/resourceGroups/er-learning-workload`,
  };
  foundation.vault_guard = inspectionGuardFixture({
    definition_id: `${prefix}/providers/Microsoft.Authorization/policyDefinitions/guard`,
    definition_sha256: 'a'.repeat(64),
    scope_ids: scopes,
    assignment_ids: Object.fromEntries(
      Object.entries(scopes).map(([k, v]) => [
        k,
        `${v}/providers/Microsoft.Authorization/policyAssignments/guard`,
      ]),
    ),
    parameters: Object.fromEntries(
      ['recovery', 'workload'].map((k) => [
        k,
        {
          expectedTenantId: { value: config.tenantId },
          exactVaultName: { value: k === 'recovery' ? 'recovery' : '' },
        },
      ]),
    ),
    recovery_vault_id: `${scopes.recovery}/providers/Microsoft.KeyVault/vaults/recovery`,
    workload_vault_name_prefix: 'erw',
    producer_principal_ids: {
      human: foundation.approved_operator_object_ids[0],
      apply: foundation.github_principal_ids.apply,
    },
    evidence_storage_account_name: foundation.recovery_storage_account_name,
    evidence_container_names: {
      human: 'guard-evidence',
      apply: 'guard-apply-evidence',
    },
    role_definitions: Object.fromEntries(
      ['recovery_network', 'workload_network'].map((k) => [
        k,
        {
          id: `${prefix}/providers/Microsoft.Authorization/roleDefinitions/88888888-8888-4888-8888-888888888888`,
        },
      ]),
    ),
  });
  foundation.github_principal_ids = Object.fromEntries(
    Object.entries(foundation.vault_guard.canary.role_assignments).map(
      ([actor, descriptor]) => [actor, descriptor.properties.principalId],
    ),
  );
  const vaultScope = `${scopes.workload}/providers/Microsoft.KeyVault/vaults/workload`;
  environment.vault_guard_generation = {
    current_activation_reference: `current/${config.environment}/${config.generation}.json`,
    inspection_bindings: Object.values(foundation.github_principal_ids).map(
      (principalId, index) => ({
        roleKey: 'permissions',
        principalId,
        scope: vaultScope,
        queryScopes: [vaultScope],
        assignmentId: `${vaultScope}/providers/Microsoft.Authorization/roleAssignments/${index + 1}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      }),
    ),
  };
  const wrapper = createOperationalProjection(
    config,
    raw(foundation),
    raw(environment),
  );
  const selected = validateOperationalProjection(wrapper, config);
  assert.ok(selected.projection_inputs);
  assert.equal(selected.projection_inputs.config.acmeEmail, undefined);
  assert.deepEqual(selected.projection_inputs.foundation.github_principal_ids, {
    backup: foundation.github_principal_ids.backup,
    restore: foundation.github_principal_ids.restore,
  });
  assert.equal(selected.state_storage_account_name, undefined);
  assert.equal(selected.plan_container_name, undefined);
  assert.equal(selected.recovery_storage_account_name, 'recoveryaccount');
  assert.equal(
    selected.vault_guard.current_activation_reference,
    environment.vault_guard_generation.current_activation_reference,
  );
  assert.equal(selected.vault_guard.inspection_bindings.length, 126);
  assert.equal(selected.vault_guard_generation, undefined);
  for (const mutate of [
    (x) => {
      x.projection_inputs.config.gitRevision = 'b'.repeat(40);
    },
    (x) => {
      x.projection_inputs.environment.ingress_public_ip = '203.0.113.99';
    },
    (x) => {
      x.projection_inputs.foundation.github_principal_ids.backup =
        '66666666-6666-4666-8666-666666666666';
    },
    (x) => {
      x.projection_inputs.config.acmeEmail = 'private@example.invalid';
    },
    (x) => {
      delete x.vault_guard;
    },
    (x) => {
      x.vault_guard.secret = 'private';
    },
    (x) => {
      x.vault_guard.evidence_storage_account_name = 'foreignaccount';
    },
    (x) => {
      x.vault_guard.parameters.workload.expectedTenantId.value =
        '99999999-9999-4999-8999-999999999999';
    },
    (x) => {
      x.vault_guard.producer_principal_ids.apply =
        '99999999-9999-4999-8999-999999999999';
    },
    (x) => {
      x.vault_guard.current_activation_reference =
        'current/learning/foreign.json';
    },
    (x) => {
      x.vault_guard.inspection_bindings.pop();
    },
    (x) => {
      x.github_principal_ids.restore = x.github_principal_ids.backup;
    },
  ]) {
    const changed = globalThis.structuredClone(selected);
    mutate(changed);
    assert.throws(
      () =>
        validateOperationalProjection(
          {
            ...wrapper,
            outputs: raw(changed),
            outputsHash: operationOutputsHash(changed),
          },
          config,
        ),
      /generator|projection|input/i,
    );
  }
  const outputs = {
    ...wrapper.outputs,
    plan_container_name: { value: 'plans', sensitive: false },
  };
  const altered = {
    ...wrapper,
    outputs,
    outputsHash: operationOutputsHash({
      ...selected,
      plan_container_name: 'plans',
    }),
  };
  assert.throws(
    () => validateOperationalProjection(altered, config),
    /field scope|projection/i,
  );
  assert.throws(
    () =>
      validateOperationalProjection(
        { ...wrapper, generation: 'foreign' },
        config,
      ),
    /projection/i,
  );
});
