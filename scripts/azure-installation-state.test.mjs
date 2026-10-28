import { createGeneratorInput } from './azure-generator-input.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderRuntimeProjection } from './azure-runtime.mjs';
import { azureRuntimeFixtureInput } from './azure-runtime-fixture.mjs';
import { validateInstallationState } from './azure-installation-state.mjs';

function scenario() {
  const input = azureRuntimeFixtureInput();
  const projection = renderRuntimeProjection(createGeneratorInput(input));
  const files = Object.fromEntries([
    ...Object.entries(projection.applicationFiles).map(([name, text]) => [
      `deploy/environments/azure/runtime/${name}`,
      text,
    ]),
    ...Object.entries(projection.platformFiles).map(([name, text]) => [
      `deploy/platform/azure/runtime/${name}`,
      text,
    ]),
    ...Object.entries(projection.recoveryFiles).map(([name, text]) => [
      `deploy/platform/azure/recovery/runtime/${name}`,
      text,
    ]),
  ]);
  return { input, projection, files };
}

test('installation state distinguishes complete absence from actual complete generated state', () => {
  const { input, projection, files } = scenario();
  assert.equal(Object.keys(files).length, 14);
  const absent = validateInstallationState({ ...input, files: {} });
  const generated = validateInstallationState({ ...input, files });
  assert.equal(absent.state, 'absent');
  assert.equal(generated.state, 'generated');
  assert.equal(generated.generation, projection.generation);
  assert.equal(generated.outputHash, projection.outputHash);
  assert.match(generated.installationHash, /^[a-f0-9]{64}$/);
  assert.notEqual(absent.installationHash, generated.installationHash);
  assert.deepEqual(
    validateInstallationState({
      ...input,
      files: Object.fromEntries(Object.entries(files).reverse()),
    }),
    generated,
  );
});

test('installation admission rejects every missing or changed generated file and extra paths', () => {
  const { input, files } = scenario();
  for (const path of Object.keys(files)) {
    const missing = { ...files };
    delete missing[path];
    assert.throws(
      () => validateInstallationState({ ...input, files: missing }),
      /Installation state is invalid/,
    );
    assert.throws(
      () =>
        validateInstallationState({
          ...input,
          files: { ...files, [path]: files[path] + '\n' },
        }),
      /Installation state is invalid/,
    );
  }
  for (const path of [
    'deploy/platform/azure/runtime/extra.json',
    'deploy/platform/azure/runtime/projection.yml',
    'deploy/platform/azure/runtime/../projection.json',
  ]) {
    assert.throws(
      () =>
        validateInstallationState({
          ...input,
          files: { ...files, [path]: '{}' },
        }),
      /Installation state is invalid/,
    );
  }
  for (const prefix of [
    'deploy/environments/azure/runtime/',
    'deploy/platform/azure/runtime/',
    'deploy/platform/azure/recovery/runtime/',
  ]) {
    assert.throws(
      () =>
        validateInstallationState({
          ...input,
          files: Object.fromEntries(
            Object.entries(files).filter(([path]) => path.startsWith(prefix)),
          ),
        }),
      /Installation state is invalid/,
    );
  }
});

test('installation state uses actual validated inputs and refuses stale generation or subjects', () => {
  const { input, files } = scenario();
  for (const change of [
    (value) => {
      value.config.generation = 'next1234';
    },
    (value) => {
      value.config.gitRevision = 'b'.repeat(40);
    },
    (value) => {
      value.foundation.github_principal_ids.backup =
        '33333333-3333-4333-8333-333333333333';
    },
    (value) => {
      value.environment.ingress_public_ip = '203.0.113.9';
    },
  ]) {
    const changed = globalThis.structuredClone(input);
    change(changed);
    assert.throws(
      () => validateInstallationState({ ...changed, files }),
      /Installation state is invalid/,
    );
  }
  for (const files of [undefined, null, [], { anything: 42 }]) {
    assert.throws(
      () => validateInstallationState({ ...input, files }),
      /Installation state is invalid/,
    );
  }
  const invalid = globalThis.structuredClone(input);
  invalid.config.domain = 'invalid.example';
  assert.throws(
    () => validateInstallationState({ ...invalid, files: {} }),
    /Installation state is invalid/,
  );
});
