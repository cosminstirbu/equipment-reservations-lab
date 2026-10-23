import { imagePatch, imagePatchPath } from './component-images.mjs';
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
  validateStaticManifests,
  readComponentState,
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
  const kubernetes = parsers.Yaml.parse(
    readFileSync('.github/workflows/kubernetes-verification.yaml', 'utf8'),
  ).data;
  const installation = kubernetes.jobs.verify.steps.find(
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
  for (const name of imageNames) {
    mkdirSync(dirname(join(root, imagePatchPath(name))), { recursive: true });
    writeFileSync(join(root, imagePatchPath(name)), imagePatch(name));
  }
  for (const name of ['database', 'identity']) {
    const path = join(
      root,
      `deploy/environments/local/jobs/${name}/kustomization.yaml`,
    );
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        /nameSuffix:[^\r\n]*/,
        'nameSuffix: -unreleased',
      ),
    );
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
    writeFileSync(
      join(root, imagePatchPath('inventory')),
      imagePatch('inventory', `${componentRecord.image}@${digest}`),
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

async function staticPolicyFixture() {
  const { default: parsers } = await import('@stoplight/spectral-parsers');
  const root = committedFixture();
  const documents = [
    ...['inventory', 'reservations', 'notifications', 'web', 'rabbitmq'].map(
      (name) => `deploy/base/${name}.yaml`,
    ),
    'deploy/base/jobs/database/job.yaml',
    'deploy/base/jobs/identity/job.yaml',
  ].map((path) => {
    const document = JSON.parse(
      JSON.stringify(parsers.Yaml.parse(readFileSync(path, 'utf8')).data),
    );
    document.metadata.namespace = 'equipment';
    if (document.kind === 'Job') document.metadata.name += '-unreleased';
    return document;
  });
  return { root, documents, state: readComponentState(root) };
}

const staticText = (documents) =>
  documents.map((document) => JSON.stringify(document)).join('\n---\n');

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

test('static policy accepts initial seven unresolved image slots while runtime policy remains strict', async () => {
  const f = await staticPolicyFixture();
  try {
    assert.equal(
      validateStaticManifests(staticText(f.documents), f.state).length,
      7,
    );
    assert.throws(
      () => validateManifests(staticText(f.documents)),
      /immutable digest/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('component state exposes validated current bootstrap identities for static slot validation', () => {
  const root = committedFixture();
  try {
    assert.deepEqual(readComponentState(root).jobSuffixes, {
      database: '-unreleased',
      identity: '-unreleased',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('static policy rejects inconsistent component context instead of granting alias permission', async (t) => {
  const f = await staticPolicyFixture();
  try {
    for (const [name, state] of [
      ['missing-list', { ...f.state, missing: [] }],
      ['status', { ...f.state, status: 'released' }],
      ['unknown-record', { ...f.state, records: { unknown: componentRecord } }],
      ['mismatched-record', { ...f.state, records: { web: componentRecord } }],
      [
        'invalid-record',
        {
          ...f.state,
          records: {
            inventory: { ...componentRecord, sourceRevision: 'main' },
          },
        },
      ],
      [
        'invented-bootstrap',
        {
          ...f.state,
          jobSuffixes: {
            database: '-aaaaaaaaaaaaaaaa',
            identity: '-unreleased',
          },
        },
      ],
    ])
      await t.test(name, () =>
        assert.throws(
          () => validateStaticManifests(staticText(f.documents), state),
          /static component state/,
        ),
      );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('static policy requires seven unique correctly located workload and container slots', async (t) => {
  const f = await staticPolicyFixture();
  try {
    const mutations = {
      missing: (docs) => docs.splice(0, 1),
      duplicate: (docs) => docs.push(cloneJson(docs[0])),
      'wrong-namespace': (docs) => {
        docs[0].metadata.namespace = 'other';
        docs[0].spec.template.spec.containers[0].image = `example/image@${digest}`;
      },
      'wrong-workload': (docs) => {
        docs[0].metadata.name = 'other';
        docs[0].spec.template.spec.containers[0].image = `example/image@${digest}`;
      },
      'wrong-container': (docs) => {
        docs[0].spec.template.spec.containers[0].name = 'other';
        docs[0].spec.template.spec.containers[0].image = `example/image@${digest}`;
      },
      'wrong-api': (docs) => {
        docs[0].apiVersion = 'other/v1';
      },
      'job-stale-suffix': (docs) => {
        docs[5].metadata.name = 'database-bootstrap-aaaaaaaaaaaaaaaa';
        docs[5].spec.template.spec.containers[0].image = `example/image@${digest}`;
      },
      'broker-moved-regular': (docs) => {
        docs[4].spec.template.spec.containers.push({
          ...docs[4].spec.template.spec.initContainers[0],
          image: `example/image@${digest}`,
        });
        docs[4].spec.template.spec.initContainers = [];
      },
    };
    for (const [name, mutate] of Object.entries(mutations))
      await t.test(name, () => {
        const documents = cloneJson(f.documents);
        mutate(documents);
        assert.throws(
          () => validateStaticManifests(staticText(documents), f.state),
          /component slot/,
        );
      });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

function publishStaticFixture(f, name) {
  const record = {
    ...componentRecord,
    component: name,
    image: `ghcr.io/example/equipment-${name}`,
  };
  const files = promotionFiles(
    record,
    readFileSync(
      join(f.root, 'deploy/environments/local/kustomization.yaml'),
      'utf8',
    ),
    readJobInputs(f.root),
  );
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(f.root, path)), { recursive: true });
    writeFileSync(join(f.root, path), text);
  }
  f.state = readComponentState(f.root);
  const document = f.documents.find(
    (doc) =>
      doc.metadata.name === name ||
      doc.metadata.name === `${name}-unreleased` ||
      (name === 'broker-bootstrap' && doc.metadata.name === 'rabbitmq'),
  );
  const pod = document.spec.template.spec;
  const container =
    name === 'broker-bootstrap'
      ? pod.initContainers.find((item) => item.name === 'definitions')
      : pod.containers.find((item) => item.name === name);
  container.image = `${record.image}@${record.digest}`;
  if (document.kind === 'Job')
    document.metadata.name = `${name}${f.state.jobSuffixes[name.split('-')[0]]}`;
  return container;
}

test('static policy checks rendered component references against genuine partial records', async (t) => {
  const f = await staticPolicyFixture();
  try {
    const container = publishStaticFixture(f, 'inventory');
    assert.doesNotThrow(() =>
      validateStaticManifests(staticText(f.documents), f.state),
    );
    const original = container.image;
    for (const [name, image] of [
      ['wrong-repository', `ghcr.io/other/image@${digest}`],
      ['wrong-digest', `${componentRecord.image}@sha256:${'b'.repeat(64)}`],
      ['bare-published', 'inventory'],
      ['tagged-published', `${componentRecord.image}:latest`],
    ])
      await t.test(name, () => {
        container.image = image;
        assert.throws(
          () => validateStaticManifests(staticText(f.documents), f.state),
          /component image/,
        );
      });
    container.image = original;
    const web = f.documents.find((doc) => doc.metadata.name === 'web').spec
      .template.spec.containers[0];
    web.image = `ghcr.io/other/web@${digest}`;
    await t.test('unrecorded-pinned-substitute', () =>
      assert.throws(
        () => validateStaticManifests(staticText(f.documents), f.state),
        /component image/,
      ),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('static policy validates each partial bootstrap hash and complete records without weakening runtime completeness', async () => {
  const f = await staticPolicyFixture();
  try {
    for (const name of imageNames) {
      publishStaticFixture(f, name);
      assert.equal(
        validateStaticManifests(staticText(f.documents), f.state).length,
        7,
        name,
      );
      if (name !== imageNames.at(-1)) {
        assert.throws(
          () => readComponentState(f.root, { requireComplete: true }),
          /Missing published components/,
        );
        assert.throws(
          () => validateManifests(staticText(f.documents)),
          /immutable digest/,
        );
      }
    }
    assert.equal(
      readComponentState(f.root, { requireComplete: true }).status,
      'released',
    );
    assert.equal(validateManifests(staticText(f.documents)).length, 7);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('static partial image allowance preserves shared security and resource policies', async (t) => {
  const f = await staticPolicyFixture();
  try {
    const cases = {
      secret: [
        (docs) =>
          docs.push({
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: { name: 'private' },
          }),
        /privately/,
      ],
      'floating-third-party': [
        (docs) => {
          docs[4].spec.template.spec.containers[0].image = 'rabbitmq:latest';
        },
        /immutable digest/,
      ],
      'unrelated-bare-alias': [
        (docs) => {
          docs[0].spec.template.spec.containers.push({
            ...docs[0].spec.template.spec.containers[0],
            name: 'extra',
            image: 'inventory',
          });
        },
        /immutable digest/,
      ],
      'missing-resources': [
        (docs) => {
          delete docs[0].spec.template.spec.containers[0].resources;
        },
        /CPU\/memory/,
      ],
      'destructive-pv': [
        (docs) =>
          docs.push({
            apiVersion: 'v1',
            kind: 'PersistentVolume',
            metadata: { name: 'data' },
            spec: { persistentVolumeReclaimPolicy: 'Delete' },
          }),
        /Retain/,
      ],
      'unprotected-pvc': [
        (docs) =>
          docs.push({
            apiVersion: 'v1',
            kind: 'PersistentVolumeClaim',
            metadata: { name: 'data' },
          }),
        /prune\/delete/,
      ],
      'cascading-application': [
        (docs) =>
          docs.push({
            apiVersion: 'argoproj.io/v1alpha1',
            kind: 'Application',
            metadata: { name: 'app', finalizers: ['cascade'] },
          }),
        /cascade/,
      ],
      'malformed-resource': [
        (docs) => docs.push({ kind: 'Service', metadata: { name: 'bad' } }),
        /apiVersion/,
      ],
      'duplicate-container': [
        (docs) =>
          docs[0].spec.template.spec.containers.push({
            ...docs[0].spec.template.spec.containers[0],
            image: `example/image@${digest}`,
          }),
        /component slot/,
      ],
    };
    for (const [name, [mutate, expected]] of Object.entries(cases))
      await t.test(name, () => {
        const docs = cloneJson(f.documents);
        mutate(docs);
        assert.throws(
          () => validateStaticManifests(staticText(docs), f.state),
          expected,
        );
      });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('static policy rejects a primitive component record map', async () => {
  const f = await staticPolicyFixture();
  try {
    assert.throws(
      () =>
        validateStaticManifests(staticText(f.documents), {
          ...f.state,
          records: 42,
        }),
      /static component state/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('MQ-S001 static policy rejects unsupported nested workloads and resource lists', async (t) => {
  const f = await staticPolicyFixture();
  try {
    const resources = {
      'cronjob-bare-alias': {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'outside', namespace: 'equipment' },
        spec: {
          jobTemplate: {
            spec: {
              template: {
                spec: { containers: [{ name: 'outside', image: 'inventory' }] },
              },
            },
          },
        },
      },
      'cronjob-floating-image': {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'outside' },
        spec: {
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      name: 'outside',
                      image: 'example/image:latest',
                      resources: {
                        requests: { cpu: '10m', memory: '16Mi' },
                        limits: { cpu: '20m', memory: '32Mi' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      'cronjob-missing-resources': {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name: 'outside' },
        spec: {
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  containers: [
                    { name: 'outside', image: `example/image@${digest}` },
                  ],
                },
              },
            },
          },
        },
      },
      'list-hidden-secret': {
        apiVersion: 'v1',
        kind: 'List',
        metadata: { name: 'outside' },
        items: [
          { apiVersion: 'v1', kind: 'Secret', metadata: { name: 'hidden' } },
        ],
      },
      'list-hidden-pod': {
        apiVersion: 'v1',
        kind: 'List',
        metadata: { name: 'outside' },
        items: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: { name: 'hidden' },
            spec: { containers: [{ name: 'outside', image: 'inventory' }] },
          },
        ],
      },
      'pod-template': {
        apiVersion: 'v1',
        kind: 'PodTemplate',
        metadata: { name: 'outside' },
        template: {
          spec: { containers: [{ name: 'outside', image: 'inventory' }] },
        },
      },
      'typed-pod-list': {
        apiVersion: 'v1',
        kind: 'PodList',
        metadata: { name: 'outside' },
        items: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: { name: 'hidden' },
            spec: { containers: [{ name: 'outside', image: 'inventory' }] },
          },
        ],
      },
    };
    for (const [name, resource] of Object.entries(resources))
      await t.test(name, () => {
        assert.throws(
          () =>
            validateStaticManifests(
              staticText([...f.documents, resource]),
              f.state,
            ),
          /Unsupported static manifest kind/,
        );
      });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
