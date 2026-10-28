// Design: missing or partial completion is never inferred from a consumed receipt.
// Native transport cases qualify adapters; they do not establish live Azure readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { azureRuntimeFixtureInput } from './azure-runtime-fixture.mjs';
import { createGeneratorInput } from './azure-generator-input.mjs';
import { operationOutputsHash } from './azure-operations.mjs';
import { inspectionGuardFixture } from './azure-guard-test-fixture.mjs';

test('normal activation requires its own actual context, not a caller readiness flag', async () => {
  const {
    publishGuardApplicationActivation,
    validateEstablishedGuardActivation,
  } = await import('./azure-guard-activation.mjs');
  for (const run of [
    publishGuardApplicationActivation,
    validateEstablishedGuardActivation,
  ])
    await assert.rejects(
      run({ ready: true, outputs: {}, config: {} }),
      /guard application activation/i,
    );
});

test('actual private Blob transport refuses a valid consumed receipt without completed normal activation', async (t) => {
  const { validateEstablishedGuardActivation } =
    await import('./azure-guard-activation.mjs');
  const input = azureRuntimeFixtureInput();
  const config = input.config;
  const sub = `/subscriptions/${config.subscriptionId}`;
  const recovery = `${sub}/resourceGroups/foundation`,
    workload = `${sub}/resourceGroups/learning-workload`;
  const id = '33333333-3333-4333-8333-333333333333';
  const vaultId = `${workload}/providers/Microsoft.KeyVault/vaults/learning-vault`;
  const roleId = `${sub}/providers/Microsoft.Authorization/roleDefinitions/${id}`;
  const guard = inspectionGuardFixture({
    definition_id: `${sub}/providers/Microsoft.Authorization/policyDefinitions/guard`,
    definition_sha256: 'a'.repeat(64),
    scope_ids: { recovery, workload },
    assignment_ids: Object.fromEntries(
      Object.entries({ recovery, workload }).map(([key, value]) => [
        key,
        `${value}/providers/Microsoft.Authorization/policyAssignments/guard`,
      ]),
    ),
    parameters: Object.fromEntries(
      ['recovery', 'workload'].map((key) => [
        key,
        {
          expectedTenantId: { value: config.tenantId },
          exactVaultName: { value: key === 'recovery' ? 'errecfixture' : '' },
        },
      ]),
    ),
    recovery_vault_id: `${recovery}/providers/Microsoft.KeyVault/vaults/errecfixture`,
    workload_vault_name_prefix: 'erw',
    producer_principal_ids: { human: config.tenantId, apply: id },
    evidence_storage_account_name: 'recoveryfixture',
    evidence_container_names: {
      human: 'guard-evidence',
      apply: 'guard-apply-evidence',
    },
    role_definitions: Object.fromEntries(
      ['recovery_network', 'workload_network'].map((key) => [
        key,
        {
          id: roleId,
        },
      ]),
    ),
  });
  const qualificationDigest = 'c'.repeat(64),
    sourceClosureHash = 'd'.repeat(64);
  const receipt = {
    mode: 'guard-generation-consumption',
    qualificationId: id,
    qualificationDigest,
    generation: config.generation,
    environment: config.environment,
    tenantId: config.tenantId,
    subscriptionId: config.subscriptionId,
    vaultId,
    consumerPrincipalId: id,
    sourceClosureHash,
    familyDigest: 'e'.repeat(64),
    planHash: 'f'.repeat(64),
    roleHash: 'a'.repeat(64),
  };
  const receiptHash = operationOutputsHash(receipt);
  const binding = {
    mode: 'guard-plan-binding',
    qualificationId: id,
    qualificationDigest,
    consumptionDigest: receiptHash,
    producerPrincipalId: id,
    sourceClosureHash,
    familyDigest: receipt.familyDigest,
    planHash: receipt.planHash,
  };
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      auth: req.headers.authorization,
    });
    const value = req.url.includes('/consumed/')
      ? receipt
      : req.url.includes('/plan-bindings/')
        ? binding
        : undefined;
    res.writeHead(value ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value ?? { error: 'PRIVATE_PROVIDER_MARKER' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const options = {
    config,
    outputs: {
      ...input.environment,
      vault_guard: guard,
      projection_inputs: createGeneratorInput(input),
      recovery_storage_account_name: 'recoveryfixture',
    },
    token: async (resource) => {
      assert.equal(resource, 'https://storage.azure.com/');
      return 'PRIVATE_TOKEN_MARKER';
    },
    sourceClosureHash,
    sourceRevision: 'a'.repeat(40),
    kubeconfig: 'private-kubeconfig',
    qualificationHandle: {
      purpose: 'workload-generation',
      reference: `generation/${id}.json`,
      digest: qualificationDigest,
    },
    consumptionHandle: {
      purpose: 'guard-generation-consumption',
      reference: `consumed/${id}.json`,
      digest: receiptHash,
    },
    bindingHandle: {
      purpose: 'guard-plan-binding',
      reference: `plan-bindings/${id}.json`,
      digest: operationOutputsHash(binding),
    },
    request: (url, settings) => {
      assert.equal(
        new URL(url).origin,
        'https://recoveryfixture.blob.core.windows.net',
      );
      return globalThis.fetch(
        `http://127.0.0.1:${server.address().port}${new URL(url).pathname}`,
        settings,
      );
    },
  };
  await assert.rejects(
    validateEstablishedGuardActivation(options),
    (error) =>
      /activation|Blob/i.test(error.message) &&
      !error.message.includes('PRIVATE_'),
  );
  assert.equal(requests.length, 3);
  assert.ok(
    requests.every(
      (x) => x.method === 'GET' && x.auth === 'Bearer PRIVATE_TOKEN_MARKER',
    ),
  );
  assert.equal(
    requests[2].path,
    `/guard-apply-evidence/activation/${config.generation}/${id}.json`,
  );
});
