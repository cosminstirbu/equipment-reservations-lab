// Design: one pure canonical boundary shared by the publisher, renderer and actors.
// These schema tests do not establish actual Azure resource ownership.
import test from 'node:test';
import assert from 'node:assert/strict';
import { azureRuntimeFixtureInput } from './azure-runtime-fixture.mjs';

test('canonical public tuple drops private unused roots and gives publisher and actor identical versioned hashes', async () => {
  const {
    createGeneratorInput,
    validateGeneratorInput,
    generatorInputHash,
    generatorInputSchemaVersion,
  } = await import('./azure-generator-input.mjs');
  const full = azureRuntimeFixtureInput();
  const tuple = createGeneratorInput(full);
  assert.equal(generatorInputSchemaVersion, 2);
  assert.equal(Object.keys(tuple.config).length, 8);
  assert.equal(Object.keys(tuple.foundation).length, 4);
  assert.equal(Object.keys(tuple.environment).length, 4);
  assert.equal(JSON.stringify(tuple).includes(full.config.acmeEmail), false);
  assert.deepEqual(validateGeneratorInput(tuple), tuple);
  assert.equal(
    generatorInputHash(tuple),
    generatorInputHash(createGeneratorInput(tuple)),
  );
  const unused = globalThis.structuredClone(full);
  unused.foundation.state_container_name = 'unused-change';
  unused.environment.acr_login_server = 'unrelated.azurecr.io';
  unused.config.acmeEmail = 'different@example.invalid';
  assert.equal(
    generatorInputHash(tuple),
    generatorInputHash(createGeneratorInput(unused)),
  );
  const changed = globalThis.structuredClone(full);
  changed.environment.ingress_public_ip = '203.0.113.99';
  assert.notEqual(
    generatorInputHash(tuple),
    generatorInputHash(createGeneratorInput(changed)),
  );
});
test('strict hash interface rejects missing, extra, secret and malformed nested input', async () => {
  const { createGeneratorInput, validateGeneratorInput } =
    await import('./azure-generator-input.mjs');
  const tuple = createGeneratorInput(azureRuntimeFixtureInput());
  for (const change of [
    (x) => {
      x.config.acmeEmail = 'private@example.invalid';
    },
    (x) => {
      x.foundation.state_container_name = 'tfstate';
    },
    (x) => {
      delete x.foundation.operator_client_ids.dashboard;
    },
    (x) => {
      x.environment.workload_client_ids.foreign =
        '11111111-1111-4111-8111-111111111111';
    },
    (x) => {
      x.config.domain = 'foreign.example';
    },
    (x) => {
      x.config.operatorCidrs = ['0.0.0.0/0'];
    },
    (x) => {
      x.environment.ingress_public_ip = '127.0.0.1';
    },
    (x) => {
      x.extra = 'secret';
    },
  ]) {
    const value = globalThis.structuredClone(tuple);
    change(value);
    assert.throws(() => validateGeneratorInput(value), /generator input/i);
  }
});
