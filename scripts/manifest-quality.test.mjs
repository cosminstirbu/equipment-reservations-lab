import { imagePatch, imagePatchPath } from './component-images.mjs';
import { imageNames } from './deployment-validation.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  selectQuality,
  discoverFullQualityBaseline,
  runManifestQuality,
  validateStaticDeployment,
  validateAzureDeployment,
} from './manifest-quality.mjs';
import {
  stageAzureFixture,
  removeAzureFixtureDirectory,
} from './azure-runtime-fixture.mjs';

const overlay = 'deploy/environments/local/kustomization.yaml';

test('Azure gate accepts only current canonical projection metadata and rejects all three old-version records', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'equipment-manifest-seven-'));
  t.after(() =>
    removeAzureFixtureDirectory(source, 'equipment-manifest-seven-'),
  );
  stageAzureFixture(source);
  await validateAzureDeployment({ root: source });
  for (const directory of [
    'deploy/environments/azure/runtime',
    'deploy/platform/azure/runtime',
    'deploy/platform/azure/recovery/runtime',
  ]) {
    const path = join(source, directory, 'projection.json');
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(metadata.version, 2);
    writeFileSync(path, JSON.stringify({ ...metadata, version: 1 }));
  }
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /runtime metadata/,
  );
});

test('Azure public gate accepts the exact seven platform outputs and rejects missing or extra runtime files', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'equipment-manifest-seven-'));
  t.after(() =>
    removeAzureFixtureDirectory(source, 'equipment-manifest-seven-'),
  );
  stageAzureFixture(source);
  const directory = join(source, 'deploy/platform/azure/runtime');
  assert.equal(readdirSync(directory).length, 7);
  assert.equal(
    (await validateAzureDeployment({ root: source })).status,
    'configured',
  );
  const path = join(directory, 'recovery-continuity-bindings.json');
  const original = readFileSync(path, 'utf8');
  rmSync(path);
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /partial runtime/,
  );
  writeFileSync(path, original);
  writeFileSync(join(directory, 'unexpected.json'), 'PRIVATE_EXTRA_RUNTIME');
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /partial runtime/);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_EXTRA_RUNTIME/,
    );
    return true;
  });
});

test('all four actual installer-only files are denied as Kustomize inputs', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'equipment-manifest-installer-'));
  t.after(() =>
    removeAzureFixtureDirectory(source, 'equipment-manifest-installer-'),
  );
  stageAzureFixture(source);
  const path = join(source, 'deploy/platform/azure/runtime/kustomization.yaml');
  const original = readFileSync(path, 'utf8');
  for (const name of [
    'recovery-continuity-bindings.json',
    'recovery-qualification-bindings.json',
    'argocd-bootstrap-patches.json',
    'argocd-bootstrap-resources.json',
  ]) {
    const document = JSON.parse(original);
    document.resources.push(name);
    writeFileSync(path, JSON.stringify(document));
    await assert.rejects(
      validateAzureDeployment({ root: source }),
      /installer-only/,
    );
  }
});

test('installer-only binding inventories are schema-checked and cannot enter ordinary Kustomize deployment', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-installer-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const directory = join(source, 'deploy/platform/azure/runtime');
  for (const name of [
    'recovery-qualification-bindings.json',
    'recovery-continuity-bindings.json',
  ]) {
    const path = join(directory, name);
    const original = readFileSync(path, 'utf8');
    const invalid = JSON.parse(original);
    invalid.items[0].unexpectedPrivateField = 'PRIVATE_INSTALLER_VALUE';
    writeFileSync(path, JSON.stringify(invalid));
    await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
      assert.match(error.message, /schema/);
      assert.doesNotMatch(
        error.message + JSON.stringify(error),
        /PRIVATE_INSTALLER_VALUE/,
      );
      return true;
    });
    writeFileSync(path, original);
  }
  const kustomizationPath = join(directory, 'kustomization.yaml');
  const kustomization = JSON.parse(readFileSync(kustomizationPath, 'utf8'));
  kustomization.resources.push('recovery-qualification-bindings.json');
  writeFileSync(kustomizationPath, JSON.stringify(kustomization));
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /installer-only/,
  );
});

test('optional recovery manifests receive native schema and Pod security validation without private output or leftover material', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-recovery-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const path = join(source, 'deploy/platform/azure/recovery/clients.json');
  const original = readFileSync(path, 'utf8');
  const before = readdirSync(tmpdir())
    .filter((name) => name.startsWith('equipment-azure-quality-'))
    .sort();
  const kustomization = join(
    source,
    'deploy/platform/azure/recovery/kustomization.yaml',
  );
  const originalKustomization = readFileSync(kustomization, 'utf8');
  writeFileSync(
    kustomization,
    originalKustomization.replace(
      'clients.json',
      'https://PRIVATE_RECOVERY_VALUE.invalid/remote',
    ),
  );
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /offline/);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_RECOVERY_VALUE/,
    );
    return true;
  });
  writeFileSync(kustomization, originalKustomization);
  for (const fault of ['schema', 'unknown', 'privileged']) {
    const input = JSON.parse(original);
    if (fault === 'schema')
      input.items[0].spec.unexpectedField = 'PRIVATE_RECOVERY_VALUE';
    else if (fault === 'unknown') input.items[0].kind = 'UnknownRecoveryKind';
    else
      input.items[0].spec.containers[0].securityContext.allowPrivilegeEscalation = true;
    writeFileSync(path, JSON.stringify(input));
    await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
      assert.match(error.message, fault === 'privileged' ? /policy/ : /schema/);
      assert.doesNotMatch(
        error.message + JSON.stringify(error),
        /PRIVATE_RECOVERY_VALUE/,
      );
      return true;
    });
    assert.deepEqual(
      readdirSync(tmpdir())
        .filter((name) => name.startsWith('equipment-azure-quality-'))
        .sort(),
      before,
    );
  }
  writeFileSync(path, original);
  const projectionPath = join(
    source,
    'deploy/platform/azure/recovery/runtime/projection.json',
  );
  const originalProjection = readFileSync(projectionPath, 'utf8');
  const projection = JSON.parse(originalProjection);
  projection.outputHash = 'f'.repeat(64);
  writeFileSync(projectionPath, JSON.stringify(projection));
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /runtime metadata/,
  );
  writeFileSync(projectionPath, originalProjection);
  const metadataPaths = [
    'deploy/environments/azure/runtime',
    'deploy/platform/azure/runtime',
    'deploy/platform/azure/recovery/runtime',
  ].map((directory) => join(source, directory, 'projection.json'));
  for (const path of metadataPaths)
    writeFileSync(
      path,
      JSON.stringify({
        ...JSON.parse(originalProjection),
        unknown: 'PRIVATE_RECOVERY_VALUE',
      }),
    );
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /runtime metadata/);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_RECOVERY_VALUE/,
    );
    return true;
  });
  for (const path of metadataPaths) writeFileSync(path, originalProjection);
  rmSync(
    join(source, 'deploy/platform/azure/recovery/runtime/identities.json'),
  );
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /partial|incomplete/,
  );
});

test('recovery admission policies must fail closed with enforced namespace-scoped bindings', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-admission-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const path = join(
    source,
    'deploy/platform/azure/recovery-controls/admission.json',
  );
  const original = readFileSync(path, 'utf8');
  for (const fault of ['ignore', 'audit']) {
    const input = JSON.parse(original);
    if (fault === 'ignore') input.items[0].spec.failurePolicy = 'Ignore';
    else
      input.items.find(
        (item) => item.kind === 'ValidatingAdmissionPolicyBinding',
      ).spec.validationActions = ['Audit'];
    writeFileSync(path, JSON.stringify(input));
    await assert.rejects(
      validateAzureDeployment({ root: source }),
      /policy.*admission/,
    );
  }
});

test('offline Azure gate renders complete fixtures while missing actual runtime remains explicitly unconfigured', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-source-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const configured = await validateAzureDeployment({ root: source });
  assert.equal(configured.status, 'configured');
  assert.equal(configured.fixture, true);
  assert.ok(configured.resources > 100);
  for (const path of [
    'deploy/environments/azure/runtime',
    'deploy/platform/azure/runtime',
    'deploy/platform/azure/recovery/runtime',
    'deploy/environments/azure/images',
    'deploy/environments/azure/releases',
  ])
    rmSync(join(source, path), { recursive: true, force: true });
  const unconfigured = await validateAzureDeployment({ root: source });
  assert.equal(unconfigured.status, 'unconfigured');
  assert.equal(unconfigured.fixture, true);
  assert.ok(unconfigured.resources > 100);
  assert.throws(() =>
    readFileSync(
      join(source, 'deploy/environments/azure/runtime/kustomization.yaml'),
    ),
  );
});

test('Azure gate rejects partial actual runtime and inconsistent reviewed image metadata before fixtures can hide either', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-partial-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const path = join(
    source,
    'deploy/environments/azure/runtime/identities.json',
  );
  const original = readFileSync(path, 'utf8');
  rmSync(path);
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /partial|incomplete/i,
  );
  writeFileSync(path, original);
  const metadataPath = join(
    source,
    'deploy/environments/azure/releases/inventory.json',
  );
  const publication = JSON.parse(readFileSync(metadataPath, 'utf8'));
  publication.digest = `sha256:${'c'.repeat(64)}`;
  writeFileSync(metadataPath, JSON.stringify(publication));
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /publication|image/i,
  );
  const projectionPath = join(
    source,
    'deploy/environments/azure/runtime/projection.json',
  );
  writeFileSync(projectionPath, 'PRIVATE_MANIFEST_VALUE');
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /runtime|inspection/i);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_MANIFEST_VALUE/,
    );
    return true;
  });
});

test('Azure gate rejects authored schema errors and unknown kinds without printing private manifest values', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-invalid-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const path = join(source, 'deploy/base/postgres-service.yaml');
  const original = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    original + '\nunexpectedPrivateField: PRIVATE_MANIFEST_VALUE\n',
  );
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /schema|policy/i);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_MANIFEST_VALUE/,
    );
    return true;
  });
  writeFileSync(
    path,
    original.replace('kind: Service', 'kind: UnknownCloudKind'),
  );
  await assert.rejects(
    validateAzureDeployment({ root: source }),
    /schema|unknown/i,
  );
});

test('Azure gate blocks public dependency exposure and privileged or unprobed application containers', async (t) => {
  for (const fault of ['public-service', 'privileged', 'probe']) {
    const source = mkdtempSync(join(tmpdir(), 'azure-quality-policy-'));
    t.after(() => rmSync(source, { recursive: true, force: true }));
    stageAzureFixture(source);
    const path = join(
      source,
      fault === 'public-service'
        ? 'deploy/base/postgres-service.yaml'
        : 'deploy/base/inventory.yaml',
    );
    const text = readFileSync(path, 'utf8');
    if (fault === 'public-service')
      writeFileSync(
        path,
        text.replace('spec:\n', 'spec:\n  type: LoadBalancer\n'),
      );
    else if (fault === 'privileged')
      writeFileSync(
        path,
        text.replace(
          'allowPrivilegeEscalation: false',
          'allowPrivilegeEscalation: true',
        ),
      );
    else
      writeFileSync(
        path,
        text.replace(
          /\n {10}livenessProbe:[\s\S]*?failureThreshold: 3\n/,
          '\n',
        ),
      );
    await assert.rejects(
      validateAzureDeployment({ root: source }),
      /policy|probe|privileg|exposure/i,
      fault,
    );
  }
});

test('Azure gate refuses remote render inputs and removes temporary validation material on failure', async (t) => {
  const source = mkdtempSync(join(tmpdir(), 'azure-quality-offline-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  stageAzureFixture(source);
  const temporary = () =>
    readdirSync(tmpdir())
      .filter((name) => name.startsWith('equipment-azure-quality-'))
      .sort();
  const before = temporary();
  const path = join(source, 'deploy/base/kustomization.yaml');
  const original = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    original.replace(
      'resources:',
      'resources:\n  - https://PRIVATE_MANIFEST_VALUE.invalid/remote',
    ),
  );
  await assert.rejects(validateAzureDeployment({ root: source }), (error) => {
    assert.match(error.message, /offline|local input/i);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_MANIFEST_VALUE/,
    );
    return true;
  });
  assert.deepEqual(temporary(), before);
  writeFileSync(path, original);
  const service = join(source, 'deploy/base/postgres-service.yaml');
  writeFileSync(
    service,
    readFileSync(service, 'utf8') +
      '\nunexpectedField: PRIVATE_MANIFEST_VALUE\n',
  );
  await assert.rejects(validateAzureDeployment({ root: source }), /schema/);
  assert.deepEqual(temporary(), before);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'manifest-quality-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Manifest tests');
  git('config', 'user.email', 'manifest@example.invalid');
  const write = (path, value = 'fixture') => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = () => {
    git('add', '.');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  write(overlay, 'initial');
  write('README.md', 'initial');
  const base = commit();
  return {
    root,
    git,
    write,
    commit,
    base,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('an actual allowlisted PR diff selects manifest quality', () => {
  const repo = fixture();
  try {
    repo.write(overlay, 'promoted image');
    assert.deepEqual(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: repo.commit(),
        baseRevision: repo.base,
      }),
      { mode: 'manifest', paths: [overlay], reason: 'allowlisted-changes' },
    );
  } finally {
    repo.close();
  }
});

test('audited Azure-only PR and proven-main diffs select infrastructure quality while mixed application changes stay full', () => {
  const repo = fixture();
  try {
    const metadata = {
      private: true,
      scripts: { build: 'node app-build.mjs' },
      devDependencies: { fixture: '1.0.0' },
    };
    repo.write('package.json', JSON.stringify(metadata));
    const base = repo.commit();
    const paths = [
      'infra/azure/environment/main.tf',
      'scripts/azure-runtime.mjs',
      'scripts/azure-runtime-fixture.mjs',
      'scripts/azure-deployment.test.mjs',
      '.github/workflows/azure-infrastructure.yaml',
      'deploy/environments/azure/kustomization.yaml',
      'deploy/platform/azure/storage/storage.yaml',
      'deploy/argocd/azure/projects/projects.yaml',
      'package.json',
    ];
    for (const path of paths.filter((path) => path !== 'package.json'))
      repo.write(path, 'Azure source');
    metadata.scripts['infra:check'] = 'node scripts/azure-quality.mjs check';
    metadata.scripts['azure:start'] = 'node scripts/azure-operations.mjs start';
    repo.write('package.json', JSON.stringify(metadata));
    const revision = repo.commit();
    for (const event of ['pull_request', 'push']) {
      const result = selectQuality({
        root: repo.root,
        event,
        sourceRef: 'refs/heads/main',
        sourceRevision: revision,
        baseRevision: base,
        fullQualityBaseline: { sourceRevision: base },
      });
      assert.deepEqual(
        result,
        {
          mode: 'infrastructure',
          reason: 'azure-only-changes',
          paths: [...paths].sort(),
        },
        event,
      );
    }
    repo.write('src/Inventory/Program.cs', 'actual app change');
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: repo.commit(),
        baseRevision: base,
      }).mode,
      'full',
    );
  } finally {
    repo.close();
  }
});

test('unknown infrastructure helpers or changed package dependencies never qualify for infrastructure-only quality', () => {
  for (const path of [
    'infra/future-build.input',
    'scripts/azure-build-image.mjs',
    '.github/workflows/azure-unknown.yaml',
    'package.json',
  ]) {
    const repo = fixture();
    try {
      repo.write(
        'package.json',
        JSON.stringify({
          scripts: { 'infra:check': 'existing' },
          devDependencies: { fixture: '1.0.0' },
        }),
      );
      const base = repo.commit();
      repo.write('infra/azure/environment/main.tf', 'known Azure input');
      repo.write(
        path,
        path === 'package.json'
          ? JSON.stringify({
              scripts: { 'infra:check': 'existing' },
              devDependencies: { fixture: '2.0.0' },
            })
          : 'unknown input',
      );
      assert.equal(
        selectQuality({
          root: repo.root,
          event: 'pull_request',
          sourceRevision: repo.commit(),
          baseRevision: base,
        }).mode,
        'full',
        path,
      );
    } finally {
      repo.close();
    }
  }
});

test('mixed Azure and malformed local release inputs dispatch full committed-state validation instead of bypassing it', () => {
  for (const fault of ['release', 'image']) {
    const repo = fixture();
    try {
      cpSync(
        fileURLToPath(new URL('../deploy', import.meta.url)),
        join(repo.root, 'deploy'),
        { recursive: true },
      );
      const base = repo.commit();
      repo.write('infra/azure/environment/main.tf', 'Azure-only source');
      repo.write(
        fault === 'release'
          ? 'deploy/environments/local/releases/inventory.json'
          : 'deploy/environments/local/images/inventory.yaml',
        fault === 'release'
          ? '{invalid private metadata'
          : imagePatch(
              'inventory',
              `ghcr.io/foreign/repo-inventory@sha256:${'c'.repeat(64)}`,
            ),
      );
      const revision = repo.commit();
      const stdout = execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('./manifest-quality.mjs', import.meta.url)),
          'select',
          '--output',
          join(repo.root, 'selection.json'),
        ],
        {
          cwd: repo.root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_REF: 'refs/pull/1/merge',
            GITHUB_SHA: revision,
            BASE_REVISION: base,
            GITHUB_OUTPUT: '',
          },
        },
      );
      const selection = JSON.parse(stdout);
      const dispatch = () => {
        if (selection.mode === 'full')
          execFileSync(
            process.execPath,
            [
              fileURLToPath(
                new URL('./deployment-validation.mjs', import.meta.url),
              ),
              'committed',
              repo.root,
            ],
            { cwd: repo.root, stdio: 'pipe' },
          );
      };
      assert.throws(dispatch, (error) => error.status === 1, fault);
      assert.equal(selection.mode, 'full');
      assert.equal(selection.reason, 'mixed-azure-local-changes');
    } finally {
      repo.close();
    }
  }
});

test('main compares the trusted full-quality ancestor rather than only the latest push', () => {
  const repo = fixture();
  try {
    repo.write(overlay, 'manifest change');
    const current = repo.commit();
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: current,
        fullQualityBaseline: { sourceRevision: repo.base },
      }).mode,
      'manifest',
    );
    repo.write('src/Inventory/Program.cs', 'failed unchecked source');
    repo.commit();
    repo.write(overlay, 'later manifest change');
    const afterFailedSource = repo.commit();
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: afterFailedSource,
        fullQualityBaseline: { sourceRevision: repo.base },
      }).mode,
      'full',
    );
  } finally {
    repo.close();
  }
});

function qualityProof(revision) {
  return {
    run: {
      id: 71,
      run_attempt: 1,
      path: '.github/workflows/validate.yaml',
      head_sha: revision,
      head_branch: 'main',
      event: 'push',
      conclusion: 'failure',
      repository: { id: 17, full_name: 'owner/repo' },
      head_repository: { id: 17, full_name: 'owner/repo' },
    },
    job: {
      run_id: 71,
      run_attempt: 1,
      name: 'quality',
      status: 'completed',
      conclusion: 'success',
      steps: [
        {
          name: 'Full application quality completed',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    },
    deployment: {
      run_id: 71,
      run_attempt: 1,
      name: 'Kubernetes verification / Kubernetes verification',
      status: 'completed',
      conclusion: 'success',
    },
  };
}

function proofGateway(proof) {
  return {
    api: async (path) =>
      path.startsWith('/actions/workflows/')
        ? { workflow_runs: [proof.run], total_count: 1 }
        : {
            jobs: [proof.job, proof.deployment].filter(Boolean),
            total_count: proof.deployment ? 2 : 1,
          },
  };
}

test('a full-quality success inside a failed component run is a trusted ancestor baseline', async () => {
  const repo = fixture();
  try {
    const proof = qualityProof(repo.base);
    assert.deepEqual(
      await discoverFullQualityBaseline({
        root: repo.root,
        repository: { id: 17, name: 'owner/repo' },
        sourceRevision: repo.base,
        gateway: proofGateway(proof),
      }),
      { sourceRevision: repo.base, runId: 71, runAttempt: 1 },
    );
  } finally {
    repo.close();
  }
});

test('the public selection CLI reports manifest mode and fixed Actions outputs for PRs', () => {
  const repo = fixture();
  try {
    repo.write(overlay, 'new digest');
    const current = repo.commit();
    const result = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('./manifest-quality.mjs', import.meta.url)),
        'select',
        '--output',
        join(repo.root, 'scope.json'),
      ],
      {
        cwd: repo.root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REF: 'refs/pull/4/merge',
          GITHUB_SHA: current,
          BASE_REVISION: repo.base,
          GITHUB_OUTPUT: join(repo.root, 'outputs'),
        },
      },
    );
    assert.equal(JSON.parse(result).mode, 'manifest');
  } finally {
    repo.close();
  }
});

test('main CLI selection uses bounded authenticated full-quality proof and privately falls back on API failure', async () => {
  const repo = fixture();
  try {
    repo.write(overlay, 'new digest');
    const source = repo.commit();
    const proof = qualityProof(repo.base);
    const env = {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: source,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_REPOSITORY_ID: '17',
      GH_TOKEN: 'PRIVATE-TOKEN',
    };
    const request = async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer PRIVATE-TOKEN');
      assert.ok(options.signal);
      return new globalThis.Response(
        JSON.stringify(
          url.includes('/workflows/')
            ? { workflow_runs: [proof.run], total_count: 1 }
            : { jobs: [proof.job, proof.deployment], total_count: 2 },
        ),
      );
    };
    assert.equal(
      (
        await runManifestQuality({
          command: 'select',
          args: ['--output', join(repo.root, 'scope.json')],
          root: repo.root,
          env,
          request,
        })
      ).mode,
      'manifest',
    );
    assert.equal(
      (
        await runManifestQuality({
          command: 'select',
          args: ['--output', join(repo.root, 'scope.json')],
          root: repo.root,
          env,
          request: async () =>
            new globalThis.Response('PRIVATE-RESPONSE', { status: 403 }),
        })
      ).mode,
      'full',
    );
  } finally {
    repo.close();
  }
});

test(
  'pinned Kustomize validates actual initial partial complete states and rejects a broken generator',
  { skip: !process.env.MANIFEST_KUBECTL },
  async () => {
    const repo = fixture();
    try {
      cpSync(
        fileURLToPath(new URL('../deploy', import.meta.url)),
        join(repo.root, 'deploy'),
        { recursive: true },
      );
      rmSync(join(repo.root, 'deploy/environments/local/releases'), {
        recursive: true,
        force: true,
      });
      for (const name of imageNames)
        repo.write(imagePatchPath(name), imagePatch(name));
      for (const name of ['database', 'identity']) {
        const path = `deploy/environments/local/jobs/${name}/kustomization.yaml`;
        repo.write(
          path,
          readFileSync(join(repo.root, path), 'utf8').replace(
            /nameSuffix:[^\r\n]*/,
            'nameSuffix: -unreleased',
          ),
        );
      }
      const kubectl = process.env.MANIFEST_KUBECTL;
      assert.equal(
        (await validateStaticDeployment({ root: repo.root, kubectl })).status,
        'unreleased',
      );
      const { promotionFiles } = await import('./promote-images.mjs');
      const { readJobInputs } = await import('./deployment-validation.mjs');
      for (const [index, name] of imageNames.entries()) {
        const record = {
          schemaVersion: 1,
          component: name,
          repository: { id: 17, name: 'owner/repo' },
          sourceRevision: 'a'.repeat(40),
          sourceRef: 'refs/heads/main',
          runId: 71,
          runAttempt: 1,
          workflow: '.github/workflows/validate.yaml',
          image: `ghcr.io/owner/repo-${name}`,
          digest: `sha256:${'b'.repeat(64)}`,
        };
        const files = promotionFiles(
          record,
          readFileSync(join(repo.root, overlay), 'utf8'),
          readJobInputs(repo.root),
        );
        for (const [path, content] of Object.entries(files))
          repo.write(path, content);
        assert.equal(
          (await validateStaticDeployment({ root: repo.root, kubectl })).status,
          index === imageNames.length - 1 ? 'released' : 'partial',
        );
      }
      repo.write(
        overlay,
        readFileSync(join(repo.root, overlay), 'utf8').replace(
          '  - configuration.yaml',
          '  - missing-generator.yaml\n  - configuration.yaml',
        ),
      );
      await assert.rejects(
        () => validateStaticDeployment({ root: repo.root, kubectl }),
        /Manifest quality rendering.*failed/,
      );
    } finally {
      repo.close();
    }
  },
);

test(
  'pinned Kustomize public validation CLI runs scoped formatter and static validation',
  { skip: !process.env.MANIFEST_KUBECTL },
  () => {
    const repo = fixture();
    try {
      const scope = join(repo.root, 'scope.json');
      writeFileSync(
        scope,
        JSON.stringify({
          mode: 'manifest',
          paths: [overlay],
          reason: 'allowlisted-changes',
        }),
      );
      const stdout = execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('./manifest-quality.mjs', import.meta.url)),
          'validate',
          '--selection',
          scope,
          '--kubectl',
          process.env.MANIFEST_KUBECTL,
        ],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          encoding: 'utf8',
        },
      );
      assert.equal(JSON.parse(stdout).mode, 'manifest');
    } finally {
      repo.close();
    }
  },
);

test('exact generated paths are eligible while mixed unknown empty missing-history and outside rename changes stay full', () => {
  const repo = fixture();
  try {
    const names = [
      'inventory',
      'reservations',
      'notifications',
      'web',
      'database-bootstrap',
      'identity-bootstrap',
      'broker-bootstrap',
    ];
    const paths = [
      overlay,
      'deploy/environments/local/jobs/database/kustomization.yaml',
      'deploy/environments/local/jobs/identity/kustomization.yaml',
      ...names.map((name) => `deploy/environments/local/releases/${name}.json`),
    ];
    for (const path of paths) repo.write(path, 'changed');
    const source = repo.commit();
    assert.deepEqual(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: source,
        baseRevision: repo.base,
      }).paths,
      [...paths].sort(),
    );
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'workflow_dispatch',
        sourceRevision: source,
        baseRevision: repo.base,
      }).mode,
      'full',
    );
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: source,
        baseRevision: source,
      }).mode,
      'full',
    );
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: source,
        baseRevision: 'f'.repeat(40),
      }).mode,
      'full',
    );
    repo.git('rm', 'deploy/environments/local/releases/web.json');
    const deletion = repo.commit();
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: deletion,
        baseRevision: source,
      }).mode,
      'manifest',
    );
    repo.git('mv', 'README.md', 'deploy/environments/local/releases/web.json');
    const rename = repo.commit();
    assert.equal(
      selectQuality({
        root: repo.root,
        event: 'pull_request',
        sourceRevision: rename,
        baseRevision: deletion,
      }).mode,
      'full',
    );
    for (const path of [
      'src/Inventory/Program.cs',
      'scripts/extra.mjs',
      '.github/workflows/extra.yaml',
      'deploy/base/extra.yaml',
      'deploy/images/api.Dockerfile',
      process.platform === 'win32' ? 'strange name' : 'strange\nname',
    ]) {
      repo.write(path, 'outside');
      const mixed = repo.commit();
      assert.equal(
        selectQuality({
          root: repo.root,
          event: 'pull_request',
          sourceRevision: mixed,
          baseRevision: rename,
        }).mode,
        'full',
        path,
      );
    }
  } finally {
    repo.close();
  }
});

test('static success forged quality proof and nonancestor history never advance the full-quality baseline', async () => {
  const repo = fixture();
  try {
    const proof = qualityProof(repo.base);
    for (const mutate of [
      (p) => (p.run.repository.id = 18),
      (p) => (p.run.repository.full_name = 'other/repo'),
      (p) => (p.run.head_repository.id = 18),
      (p) => (p.run.head_branch = 'Main'),
      (p) => (p.run.event = 'workflow_dispatch'),
      (p) => (p.run.path = '.github/workflows/other.yaml'),
      (p) => (p.job.name = 'other-quality'),
      (p) => (p.job.run_id = 72),
      (p) => (p.job.run_attempt = 2),
      (p) => (p.job.status = 'in_progress'),
      (p) => (p.job.conclusion = 'failure'),
      (p) => (p.job.steps = []),
      (p) => (p.job.steps[0].conclusion = 'skipped'),
      (p) => p.job.steps.push({ ...p.job.steps[0] }),
      (p) => (p.deployment = undefined),
      (p) => (p.deployment.conclusion = 'failure'),
      (p) => (p.deployment.conclusion = 'skipped'),
      (p) => (p.deployment.run_attempt = 2),
      (p) => (p.deployment.run_id = 72),
    ]) {
      const invalid = globalThis.structuredClone(proof);
      mutate(invalid);
      assert.equal(
        await discoverFullQualityBaseline({
          root: repo.root,
          repository: { id: 17, name: 'owner/repo' },
          sourceRevision: repo.base,
          gateway: proofGateway(invalid),
        }),
        null,
      );
    }
    repo.write('source.txt', 'new unchecked');
    const future = repo.commit();
    assert.equal(
      await discoverFullQualityBaseline({
        root: repo.root,
        repository: { id: 17, name: 'owner/repo' },
        sourceRevision: repo.base,
        gateway: proofGateway(qualityProof(future)),
      }),
      null,
    );
    assert.equal(
      await discoverFullQualityBaseline({
        root: repo.root,
        repository: { id: 17, name: 'owner/repo' },
        sourceRevision: future,
        gateway: {
          api: async () => {
            throw new Error('PRIVATE-API');
          },
        },
      }),
      null,
    );
    const pages = [];
    assert.equal(
      await discoverFullQualityBaseline({
        root: repo.root,
        repository: { id: 17, name: 'owner/repo' },
        sourceRevision: future,
        gateway: {
          api: async (path) => {
            pages.push(path);
            return {
              workflow_runs: Array.from({ length: 100 }, () => ({
                ...proof.run,
                event: 'pull_request',
              })),
              total_count: 1001,
            };
          },
        },
      }),
      null,
    );
    assert.equal(pages.length, 10);
  } finally {
    repo.close();
  }
});
