import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promotionFiles, refreshJobSuffixes } from './promote-images.mjs';
import {
  classifyChanges,
  validateIndex,
  validateRelease,
  validateManifests,
  canonicalRelease,
  jobSuffix,
  validateJobSuffixes,
  validateCommittedDeployment,
  readJobInputs,
  imageNames,
} from './deployment-validation.mjs';

const digest = `sha256:${'a'.repeat(64)}`;

test('default OCI inspector excludes malformed private JSON and stderr from all error representations', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'oci-private-json-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(
    directory,
    process.platform === 'win32' ? 'docker.exe' : 'docker',
  );
  copyFileSync(process.execPath, executable);
  chmodSync(executable, 0o755);
  const preload = join(directory, 'provider.mjs');
  writeFileSync(
    preload,
    `if(process.execPath.toLowerCase().endsWith(${JSON.stringify(process.platform === 'win32' ? 'docker.exe' : '/docker')})){process.stdout.write('PRIVATE_OCI_JSON_MARKER');process.stderr.write('PRIVATE_OCI_STDERR_MARKER');process.exit(0);}`,
  );
  const release = {
    sourceRevision: 'b'.repeat(40),
    images: Object.fromEntries(
      imageNames.map((name) => [
        name,
        { image: `ghcr.io/example/equipment-${name}`, digest },
      ]),
    ),
  };
  const driver = join(directory, 'driver.mjs');
  writeFileSync(
    driver,
    `import{verifyReleaseIndexes}from ${JSON.stringify(new URL('./deployment-validation.mjs', import.meta.url).href)};import{inspect}from'node:util';try{verifyReleaseIndexes(${JSON.stringify(release)});}catch(error){console.error(error.message);console.error(JSON.stringify(error));console.error(inspect(error,{depth:10}));if(error.cause!==undefined)console.error('RAW_CAUSE_RETAINED');process.exitCode=23;}`,
  );
  const result = spawnSync(process.execPath, [driver], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      PATH:
        directory +
        (process.platform === 'win32' ? ';' : ':') +
        process.env.PATH,
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
    },
  });
  assert.equal(result.status, 23);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Release index response is not valid JSON/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /PRIVATE_|RAW_CAUSE_RETAINED|Unexpected token/,
  );
});

test(
  'committed validation rejects a symlinked component metadata directory',
  { skip: process.platform === 'win32' ? 'Requires POSIX symlinks' : false },
  () => {
    const root = committedFixture();
    try {
      const target = join(root, 'records');
      mkdirSync(target);
      symlinkSync(
        target,
        join(root, 'deploy/environments/local/releases'),
        'dir',
      );
      assert.throws(
        () => validateCommittedDeployment(root),
        /Symlinked component/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('only application and build changes publish; deployment promotion cannot loop', () => {
  assert.equal(
    classifyChanges([
      'docs/readme.md',
      'deploy/environments/local/release.json',
    ]),
    false,
  );
  assert.equal(classifyChanges(['src/Inventory/Program.cs']), true);
  assert.equal(classifyChanges(['deploy/images/api.Dockerfile']), true);
  assert.equal(classifyChanges(['Directory.Packages.props']), true);
  assert.equal(classifyChanges([]), false);
});

test('release rejects fabricated missing images and pins source plus all seven indexes', () => {
  assert.throws(
    () => validateRelease({ sourceRevision: 'a'.repeat(40), images: {} }),
    /inventory/,
  );
  const names = [
    'inventory',
    'reservations',
    'notifications',
    'database-bootstrap',
    'identity-bootstrap',
    'broker-bootstrap',
    'web',
  ];
  const release = {
    sourceRevision: 'b'.repeat(40),
    images: Object.fromEntries(
      names.map((name) => [
        name,
        { image: `ghcr.io/example/equipment-${name}`, digest },
      ]),
    ),
  };
  assert.doesNotThrow(() => validateRelease(release));
  release.images.web.digest = 'latest';
  assert.throws(() => validateRelease(release), /digest/);
});

test('OCI contract requires both real Linux architectures and index media type', () => {
  const manifest = {
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: ['amd64', 'arm64'].map((architecture) => ({
      digest,
      platform: { os: 'linux', architecture },
    })),
  };
  assert.doesNotThrow(() => validateIndex(manifest));
  assert.throws(
    () =>
      validateIndex({ ...manifest, manifests: manifest.manifests.slice(0, 1) }),
    /arm64/,
  );
  assert.throws(
    () =>
      validateIndex({
        ...manifest,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
      }),
    /index/,
  );
});

test('rendered policy rejects secrets, floating images, destructive storage and unbounded pods', () => {
  assert.throws(
    () =>
      validateManifests(
        'apiVersion: v1\nkind: Secret\nmetadata:\n  name: forbidden\n',
      ),
    /Secret/,
  );
  assert.throws(
    () =>
      validateManifests(
        'apiVersion: v1\nkind: PersistentVolume\nmetadata:\n  name: data\nspec:\n  persistentVolumeReclaimPolicy: Delete\n',
      ),
    /Retain/,
  );
  assert.throws(
    () =>
      validateManifests(
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n        - name: web\n          image: nginx:latest\n',
      ),
    /digest/,
  );
});

test('validation no longer exposes the temporary image-build diagnostic job', async () => {
  const { default: parsers } = await import('@stoplight/spectral-parsers');
  const validate = parsers.Yaml.parse(
    readFileSync('.github/workflows/validate.yaml', 'utf8'),
  ).data;
  assert.equal(validate.jobs['image-build-diagnostics'], undefined);
  assert.ok(validate.jobs.quality);
  assert.ok(validate.jobs.deployment);
  for (const job of Object.values(validate.jobs))
    for (const step of job.steps ?? [])
      assert.doesNotMatch(step.run ?? '', /diagnose-build/);
});

test('prerequisite quality retains committed deployment validation and pinned tools', async () => {
  const { default: parsers } = await import('@stoplight/spectral-parsers');
  const validate = parsers.Yaml.parse(
    readFileSync('.github/workflows/validate.yaml', 'utf8'),
  ).data;
  assert.ok(
    validate.jobs.quality.steps.some((step) =>
      step.run?.includes('deployment-validation.mjs committed'),
    ),
  );
  assert.equal(validate.permissions.contents, 'read');
  assert.equal(validate.on.pull_request_target, undefined);
  const installation = validate.jobs.deployment.steps.find(
    (step) => step.name === 'Install checksum-verified deployment tools',
  );
  assert.match(
    installation?.run ?? '',
    /aee6151561422756b764a4ae28e7f44cda5af5a9eead3cc9985112b1de8d8e0d/,
  );
  assert.match(
    installation?.run ?? '',
    /874d5e72dbb819f43cff16bcd1e4f8bac5b7f2361fe1e55049b0a6c676fb0cbf/,
  );
});
test('canonical release rejects ambiguous JSON and orders Unicode keys by codepoint', () => {
  assert.equal(
    canonicalRelease(' {"z":[3,2],"a":{"\\ud800\\udc00":1,"\\ue000":2}} '),
    '{"a":{"\ue000":2,"𐀀":1},"z":[3,2]}',
  );
  assert.throws(() => canonicalRelease('{"a":1,"a":2}'), /JSON/);
  assert.throws(() => canonicalRelease({ a: Infinity }), /finite|JSON/);
  assert.throws(() => canonicalRelease({ a: undefined }), /JSON/);
});

test('Job freshness independently rejects stale suffixes and unexpected wrapper fields', () => {
  const release = {
    sourceRevision: 'a'.repeat(40),
    images: Object.fromEntries(
      [
        'inventory',
        'reservations',
        'notifications',
        'web',
        'database-bootstrap',
        'identity-bootstrap',
        'broker-bootstrap',
      ].map((name) => [name, { image: `ghcr.io/example/${name}`, digest }]),
    ),
  };
  const inputs = {
    baseConfiguration: 'base',
    localConfiguration: 'local',
    jobs: Object.fromEntries(
      ['database', 'identity'].map((name) => [
        name,
        {
          template: name,
          wrapper: `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../../../../base/jobs/${name}]\nnameSuffix: ${jobSuffix(release, 'base', 'local', name)}\n`,
        },
      ]),
    ),
  };
  assert.doesNotThrow(() => validateJobSuffixes(release, inputs));
  inputs.jobs.database.template += 'changed';
  assert.throws(() => validateJobSuffixes(release, inputs), /stale/);
  inputs.jobs.database.template = 'database';
  inputs.jobs.database.wrapper += 'namespace: injected\n';
  assert.throws(() => validateJobSuffixes(release, inputs), /field/);
});

test('Job hash matches independent length-framed SHA256 vector and distinguishes input boundaries', () => {
  assert.equal(
    jobSuffix({ b: [2, 3], a: 1 }, 'base\n', 'local\n', 'job\n'),
    '-7ded14e44a9cb2fd',
  );
  assert.notEqual(jobSuffix({}, 'ab', 'c', ''), jobSuffix({}, 'a', 'bc', ''));
});

test('CI-only explicit built-image policy retains default digest enforcement and resource bounds', () => {
  const image = `equipment-ci/web:${'a'.repeat(40)}`;
  const resource = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web' },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'web',
              image,
              resources: {
                requests: { cpu: '50m', memory: '32Mi' },
                limits: { cpu: '250m', memory: '128Mi' },
              },
            },
          ],
        },
      },
    },
  };
  assert.throws(() => validateManifests(JSON.stringify(resource)), /digest/);
  assert.doesNotThrow(() =>
    validateManifests(JSON.stringify(resource), {
      ciImages: [image],
      ciRevision: 'a'.repeat(40),
    }),
  );
  assert.throws(
    () =>
      validateManifests(JSON.stringify(resource), {
        ciImages: ['ghcr.io/example/web:latest'],
        ciRevision: 'a'.repeat(40),
      }),
    /policy/,
  );
  resource.spec.template.spec.containers[0].resources = {};
  assert.throws(
    () =>
      validateManifests(JSON.stringify(resource), {
        ciImages: [image],
        ciRevision: 'a'.repeat(40),
      }),
    /bounds/,
  );
});

function committedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'committed-deployment-'));
  const paths = [
    'deploy/environments/local/kustomization.yaml',
    'deploy/base/configuration.yaml',
    'deploy/environments/local/configuration.yaml',
    ...['database', 'identity'].flatMap((name) => [
      `deploy/base/jobs/${name}/job.yaml`,
      `deploy/environments/local/jobs/${name}/kustomization.yaml`,
    ]),
  ];
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(path));
  }
  return root;
}

test('committed real release rejects config-only stale suffixes before CI regeneration; exact refresh passes', () => {
  const root = committedFixture();
  try {
    const release = {
      sourceRevision: 'a'.repeat(40),
      images: Object.fromEntries(
        imageNames.map((name) => [
          name,
          { image: `ghcr.io/example/equipment-${name}`, digest },
        ]),
      ),
    };
    const files = promotionFiles(
      release,
      readFileSync(
        join(root, 'deploy/environments/local/kustomization.yaml'),
        'utf8',
      ),
      readJobInputs(root),
    );
    for (const [path, text] of Object.entries(files))
      writeFileSync(join(root, path), text);
    assert.equal(validateCommittedDeployment(root), 'released');
    const config = join(root, 'deploy/environments/local/configuration.yaml');
    writeFileSync(
      config,
      `${readFileSync(config, 'utf8')}\n# changed public configuration\n`,
    );
    assert.throws(() => validateCommittedDeployment(root), /stale/);
    refreshJobSuffixes(root);
    assert.equal(validateCommittedDeployment(root), 'released');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('initial committed state permits only empty images and unreleased wrappers with valid public inputs', () => {
  const root = committedFixture();
  try {
    assert.equal(validateCommittedDeployment(root), 'unreleased');
    const wrapper = join(
      root,
      'deploy/environments/local/jobs/database/kustomization.yaml',
    );
    const original = readFileSync(wrapper, 'utf8');
    writeFileSync(
      wrapper,
      original.replace('-unreleased', '-aaaaaaaaaaaaaaaa'),
    );
    assert.throws(() => validateCommittedDeployment(root), /unreleased/);
    writeFileSync(wrapper, original);
    writeFileSync(
      join(root, 'deploy/environments/local/release.json'),
      '{invalid',
    );
    assert.throws(() => validateCommittedDeployment(root), /JSON/);
    rmSync(join(root, 'deploy/environments/local/release.json'));
    writeFileSync(
      join(root, 'deploy/base/configuration.yaml'),
      'kind: Secret\n',
    );
    assert.throws(() => validateCommittedDeployment(root), /generator|public/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Component records are deterministic public provenance contracts.
const componentRecord = {
  schemaVersion: 1,
  component: 'inventory',
  repository: { id: 123, name: 'example/equipment' },
  sourceRevision: 'b'.repeat(40),
  sourceRef: 'refs/heads/feature/testing',
  runId: 456,
  runAttempt: 1,
  workflow: '.github/workflows/validate.yaml',
  image: 'ghcr.io/example/equipment-inventory',
  digest,
};

test('a genuine independently published component does not require six sibling images', () => {
  assert.equal(validateRelease(componentRecord), componentRecord);
  for (const invalid of [
    { ...componentRecord, component: 'unknown' },
    { ...componentRecord, sourceRevision: 'main' },
    { ...componentRecord, image: 'ghcr.io/other/repository' },
    { ...componentRecord, repository: { id: 0, name: 'example/equipment' } },
    { ...componentRecord, unexpected: 'field' },
  ])
    assert.throws(() => validateRelease(invalid));
});

test('committed partial component state validates only genuine available images and reports missing siblings', async () => {
  const root = committedFixture();
  try {
    const path = 'deploy/environments/local/releases/inventory.json';
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(componentRecord));
    const overlay = join(root, 'deploy/environments/local/kustomization.yaml');
    writeFileSync(
      overlay,
      readFileSync(overlay, 'utf8').replace(
        'images: []',
        `images: [{name: inventory, newName: ${componentRecord.image}, digest: ${digest}}]`,
      ),
    );
    assert.equal(validateCommittedDeployment(root), 'partial');
    const { readComponentState } = await import('./deployment-validation.mjs');
    const state = readComponentState(root);
    assert.deepEqual(Object.keys(state.records), ['inventory']);
    assert.equal(state.missing.length, 6);
    assert.throws(
      () => readComponentState(root, { requireComplete: true }),
      /Missing.*reservations.*web/,
    );
    writeFileSync(
      join(root, path),
      JSON.stringify({ ...componentRecord, component: 'web' }),
    );
    assert.throws(() => validateCommittedDeployment(root), /component|record/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('jobs CLI validates explicitly unreleased component state without a global release file', () => {
  const root = committedFixture();
  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/deployment-validation.mjs', 'jobs', root],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('single component release index verification retains both architecture requirements', async () => {
  const { verifyReleaseIndexes } = await import('./deployment-validation.mjs');
  const index = {
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: ['amd64', 'arm64'].map((architecture) => ({
      platform: { os: 'linux', architecture },
      digest,
    })),
  };
  assert.doesNotThrow(() => verifyReleaseIndexes(componentRecord, () => index));
  assert.throws(
    () =>
      verifyReleaseIndexes(componentRecord, () => ({
        ...index,
        manifests: index.manifests.slice(0, 1),
      })),
    /arm64/,
  );
});

test('component metadata is bounded before parsing rather than accepting oversized records', async () => {
  const root = committedFixture();
  try {
    const path = join(
      root,
      'deploy/environments/local/releases/inventory.json',
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(componentRecord) + ' '.repeat(65536));
    const overlay = join(root, 'deploy/environments/local/kustomization.yaml');
    writeFileSync(
      overlay,
      readFileSync(overlay, 'utf8').replace(
        'images: []',
        `images: [{name: inventory,newName: ${componentRecord.image},digest: ${digest}}]`,
      ),
    );
    const { readComponentState } = await import('./deployment-validation.mjs');
    assert.throws(() => readComponentState(root), /64KiB/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
