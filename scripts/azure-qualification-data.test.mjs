import { createGeneratorInput } from './azure-generator-input.mjs';
// Design: independent constrained data parsing and complete generated-map comparison.
// Git/launch tests separately establish the origin of these actual source bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePatch } from './component-images.mjs';
import { createHash } from 'node:crypto';
import { renderRuntimeProjection } from './azure-runtime.mjs';
import { azureRuntimeFixtureInput } from './azure-runtime-fixture.mjs';
const repository = {
  id: 1426639177,
  name: 'cosminstirbu/equipment-reservations-lab',
};
const components = [
  'web',
  'inventory',
  'reservations',
  'notifications',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
function releases() {
  const files = {};
  for (const component of components) {
    const source = {
      schemaVersion: 1,
      component,
      repository,
      sourceRevision: 'a'.repeat(40),
      sourceRef: 'refs/heads/main',
      runId: 1,
      runAttempt: 1,
      workflow: '.github/workflows/validate.yaml',
      image: `ghcr.io/${repository.name}-${component}`,
      digest: `sha256:${'b'.repeat(64)}`,
    };
    for (const environment of ['local', 'azure']) {
      const image =
        environment === 'local'
          ? source.image
          : `fixtureacr.azurecr.io/equipment-reservations-lab-${component}`;
      const record =
        environment === 'local'
          ? source
          : { schemaVersion: 1, source, image, digest: source.digest };
      files[`deploy/environments/${environment}/releases/${component}.json`] =
        JSON.stringify(record);
      files[`deploy/environments/${environment}/images/${component}.yaml`] =
        imagePatch(component, `${image}@${source.digest}`);
    }
  }
  return files;
}
test('exact 28 release paths validate all seven target shapes and reject adjacent fields and unknown paths', async () => {
  const { classifyReleaseFiles } =
    await import('./azure-qualification-data.mjs');
  const files = releases();
  assert.equal(
    classifyReleaseFiles(files, {
      repository,
      acrLoginServer: 'fixtureacr.azurecr.io',
      requireAzure: true,
    }).files.length,
    28,
  );
  for (const component of components) {
    const path = `deploy/environments/azure/images/${component}.yaml`;
    assert.throws(
      () =>
        classifyReleaseFiles(
          { ...files, [path]: files[path] + '          command: [evil]\n' },
          { repository },
        ),
      /qualification data/i,
    );
    assert.throws(
      () =>
        classifyReleaseFiles(
          {
            ...files,
            [path]: files[path].replace(
              'metadata:\n',
              'metadata:\n  namespace: forbidden\n',
            ),
          },
          { repository },
        ),
      /qualification data/i,
    );
  }
  assert.throws(
    () =>
      classifyReleaseFiles(
        {
          ...files,
          'deploy/environments/azure/images/unknown.yaml':
            files['deploy/environments/azure/images/web.yaml'],
        },
        { repository },
      ),
    /qualification data/i,
  );
  const broker = 'deploy/environments/azure/images/broker-bootstrap.yaml';
  assert.throws(
    () =>
      classifyReleaseFiles(
        {
          ...files,
          [broker]: files[broker].replace('kind: Deployment', 'kind: Job'),
        },
        { repository },
      ),
    /qualification data/i,
  );
});
test('duplicate keys, YAML ambiguity, foreign registry and provenance cannot be release data', async () => {
  const { classifyReleaseFiles } =
    await import('./azure-qualification-data.mjs');
  const files = releases(),
    path = 'deploy/environments/azure/releases/web.json',
    patch = 'deploy/environments/azure/images/web.yaml';
  for (const value of [
    files[path].replace('{', '{"schemaVersion":1,'),
    files[path].replace('refs/heads/main', 'refs/heads/other'),
    files[path].replace('fixtureacr.azurecr.io', 'foreignacr.azurecr.io'),
  ])
    assert.throws(
      () =>
        classifyReleaseFiles(
          { ...files, [path]: value },
          { repository, acrLoginServer: 'fixtureacr.azurecr.io' },
        ),
      /qualification data/i,
    );
  for (const value of [
    files[patch] + '---\nkind: Role\n',
    files[patch].replace('metadata:', 'metadata: &alias'),
    files[patch].replace('kind: Deployment', 'kind: !tag Deployment'),
  ])
    assert.throws(
      () => classifyReleaseFiles({ ...files, [patch]: value }, { repository }),
      /qualification data/i,
    );
});

test('complete actual generator maps bind predicted transition and reject other edits or forged opposite maps', async () => {
  const {
    buildQualificationInstallation,
    validateQualificationInstallation,
    qualificationStatePath,
  } = await import('./azure-qualification-data.mjs');
  const input = azureRuntimeFixtureInput(),
    projection = renderRuntimeProjection(createGeneratorInput(input)),
    files = {};
  for (const [key, root] of [
    ['applicationFiles', 'deploy/environments/azure/runtime'],
    ['platformFiles', 'deploy/platform/azure/runtime'],
    ['recoveryFiles', 'deploy/platform/azure/recovery/runtime'],
  ])
    for (const [name, value] of Object.entries(projection[key]))
      files[`${root}/${name}`] = value;
  const prettier = await import('prettier');
  files[qualificationStatePath] = await prettier.format(
    JSON.stringify({
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      resources: [
        'admission.json',
        'roles.json',
        'network.json',
        'qualification.json',
      ],
    }),
    { parser: 'yaml', singleQuote: true },
  );
  const { binding, targetFiles } = await buildQualificationInstallation({
    files,
    input,
  });
  assert.equal(binding.source.files.length, 15);
  assert.notEqual(binding.source.hash, binding.target.hash);
  await validateQualificationInstallation({
    files,
    input,
    binding,
    phase: 'source',
  });
  await validateQualificationInstallation({
    files: targetFiles,
    input,
    binding,
    phase: 'target',
  });
  const forged = globalThis.structuredClone(binding);
  forged.target.files[0].sha256 = 'c'.repeat(64);
  forged.target.hash = createHash('sha256')
    .update(JSON.stringify(forged.target.files))
    .digest('hex');
  await assert.rejects(
    async () =>
      validateQualificationInstallation({
        files,
        input,
        binding: forged,
        phase: 'source',
      }),
    /qualification data/i,
  );
  for (const altered of [
    { ...files, 'deploy/platform/azure/runtime/unknown.json': '{}' },
    {
      ...files,
      [qualificationStatePath]: files[qualificationStatePath].replace(
        'network.json',
        'other.json',
      ),
    },
    { ...files, 'deploy/platform/azure/runtime/identities.json': '{}' },
  ])
    await assert.rejects(
      () => buildQualificationInstallation({ files: altered, input }),
      /qualification data/i,
    );
});
