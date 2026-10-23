import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import * as implementation from './component-pipelines.mjs';

const names = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'component-selection-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Pipeline tests');
  git('config', 'user.email', 'pipeline@example.invalid');
  const write = (path, contents = 'source') => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  const projects = {
    Inventory: ['Persistence'],
    Reservations: ['Persistence'],
    Notifications: [],
    DatabaseBootstrap: ['Inventory', 'Reservations'],
    IdentityBootstrap: [],
    BrokerBootstrap: [],
    Persistence: [],
  };
  for (const [name, references] of Object.entries(projects)) {
    write(
      `src/${name}/${name}.csproj`,
      `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${references.map((dependency) => `<ProjectReference Include="../${dependency}/${dependency}.csproj" />`).join('')}<EmbeddedResource Include="Migrations/*.sql" /></ItemGroup></Project>`,
    );
    write(`src/${name}/Program.cs`);
  }
  write('src/Web/package.json', '{}');
  write(
    'package.json',
    JSON.stringify({
      name: 'selection-fixture',
      private: true,
      type: 'module',
      scripts: { 'test:tooling': 'node --test scripts/original.test.mjs' },
      devDependencies: { fixture: '1.0.0' },
    }),
  );
  const commit = () => {
    git('add', '.');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
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

test('a Web-only main change selects only Web against genuine component baselines', () => {
  const repo = repository();
  try {
    repo.write('src/Web/app.ts', 'new frontend');
    const sourceRevision = repo.commit();
    const result = implementation.selectComponents({
      root: repo.root,
      event: 'push',
      sourceRef: 'refs/heads/main',
      sourceRevision,
      baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
    });
    assert.deepEqual(result.selected, ['web']);
  } finally {
    repo.close();
  }
});

test('shared project changes rebuild transitive APIs and database bootstrap', () => {
  const repo = repository();
  try {
    repo.write('src/Persistence/Schema.cs', 'changed');
    const result = implementation.selectComponents({
      root: repo.root,
      event: 'push',
      sourceRef: 'refs/heads/main',
      sourceRevision: repo.commit(),
      baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
    });
    assert.deepEqual(result.selected, [
      'inventory',
      'reservations',
      'database-bootstrap',
    ]);
  } finally {
    repo.close();
  }
});

test('shared build inputs and unknown paths rebuild conservatively while documentation does not', () => {
  for (const [path, expected] of [
    ['global.json', names],
    ['package-lock.json', names],
    ['Directory.Build.props', names],
    ['.github/workflows/validate.yaml', names],
    ['scripts/component-pipelines.mjs', []],
    ['scripts/deployment-ci.mjs', names],
    ['scripts/process.mjs', names],
    ['scripts/unknown-build-step.mjs', names],
    ['mystery.input', names],
    ['deploy/images/web.Dockerfile', ['web']],
    [
      'deploy/images/api.Dockerfile',
      ['inventory', 'reservations', 'notifications'],
    ],
    ['docs/readme.md', []],
    ['deploy/environments/local/releases/web.json', []],
  ]) {
    const repo = repository();
    try {
      repo.write(path, 'changed');
      const result = implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: repo.commit(),
        baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
      });
      assert.deepEqual(result.selected, expected, path);
    } finally {
      repo.close();
    }
  }
});

test('audited deployment, quality and test tooling selects no PR or current-main images', () => {
  const repo = repository();
  try {
    for (const path of [
      'scripts/argocd-installation.mjs',
      'scripts/local-kubernetes.mjs',
      'scripts/quality.mjs',
      'scripts/component-pipelines.mjs',
      'scripts/argocd-installation.test.mjs',
      'scripts/component-selection.test.mjs',
    ])
      repo.write(path, 'changed tooling');
    const sourceRevision = repo.commit();
    for (const event of ['pull_request', 'push']) {
      const result = implementation.selectComponents({
        root: repo.root,
        event,
        sourceRef: event === 'push' ? 'refs/heads/main' : 'refs/heads/tooling',
        sourceRevision,
        baseRevision: repo.base,
        baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
      });
      assert.deepEqual(result.selected, [], event);
    }
  } finally {
    repo.close();
  }
});

test('root quality-script-only changes select no PR or current-main images', () => {
  const repo = repository();
  try {
    const metadata = JSON.parse(
      readFileSync(join(repo.root, 'package.json'), 'utf8'),
    );
    metadata.scripts['test:tooling'] += ' scripts/argocd-installation.test.mjs';
    repo.write('package.json', JSON.stringify(metadata));
    const sourceRevision = repo.commit();
    for (const event of ['pull_request', 'push']) {
      const result = implementation.selectComponents({
        root: repo.root,
        event,
        sourceRef: event === 'push' ? 'refs/heads/main' : 'refs/heads/tooling',
        sourceRevision,
        baseRevision: repo.base,
        baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
      });
      assert.deepEqual(result.selected, [], event);
    }
  } finally {
    repo.close();
  }
});

test('root dependency, hook, unknown metadata and invalid-package changes remain image inputs', () => {
  const repo = repository();
  try {
    const original = JSON.parse(
      readFileSync(join(repo.root, 'package.json'), 'utf8'),
    );
    for (const [label, mutate] of [
      [
        'dependency',
        (value) => {
          value.devDependencies.fixture = '2.0.0';
        },
      ],
      [
        'runtime dependency',
        (value) => {
          value.dependencies = { runtime: '1.0.0' };
        },
      ],
      [
        'install hook',
        (value) => {
          value.scripts.preinstall = 'node hook.mjs';
        },
      ],
      [
        'unknown script',
        (value) => {
          value.scripts['build:images'] = 'node builder.mjs';
        },
      ],
      [
        'module type',
        (value) => {
          value.type = 'commonjs';
        },
      ],
      [
        'unknown metadata',
        (value) => {
          value.customBuildInput = true;
        },
      ],
      [
        'invalid quality script',
        (value) => {
          value.scripts['test:tooling'] = [];
        },
      ],
      [
        'null scripts',
        (value) => {
          value.scripts = null;
        },
      ],
      [
        'array scripts',
        (value) => {
          value.scripts = [];
        },
      ],
      [
        'missing scripts',
        (value) => {
          delete value.scripts;
        },
      ],
      ['malformed JSON', () => '{'],
      ['array package', () => '[]'],
    ]) {
      const value = globalThis.structuredClone(original);
      const replacement = mutate(value);
      repo.write(
        'package.json',
        typeof replacement === 'string' ? replacement : JSON.stringify(value),
      );
      const sourceRevision = repo.commit();
      for (const event of ['pull_request', 'push']) {
        const result = implementation.selectComponents({
          root: repo.root,
          event,
          sourceRef:
            event === 'push' ? 'refs/heads/main' : 'refs/heads/tooling',
          sourceRevision,
          baseRevision: repo.base,
          baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
        });
        assert.deepEqual(result.selected, names, `${label}: ${event}`);
      }
    }
  } finally {
    repo.close();
  }
});

test('quality metadata is proven against each component baseline and retains unpublished source', () => {
  const repo = repository();
  try {
    const metadata = JSON.parse(
      readFileSync(join(repo.root, 'package.json'), 'utf8'),
    );
    metadata.devDependencies.fixture = '2.0.0';
    repo.write('package.json', JSON.stringify(metadata));
    repo.write('src/Inventory/Program.cs', 'unpublished source');
    const published = repo.commit();
    metadata.scripts['test:tooling'] += ' scripts/new.test.mjs';
    repo.write('package.json', JSON.stringify(metadata));
    repo.write('scripts/component-pipelines.mjs', 'selector repair');
    const sourceRevision = repo.commit();
    const baselines = Object.fromEntries(
      names.map((name) => [name, published]),
    );
    baselines.inventory = repo.base;
    const selection = { root: repo.root, sourceRevision, baselines };
    assert.deepEqual(
      implementation.selectComponents({
        ...selection,
        event: 'pull_request',
        sourceRef: 'refs/heads/tooling',
        baseRevision: published,
      }).selected,
      [],
    );
    assert.deepEqual(
      implementation.selectComponents({
        ...selection,
        event: 'push',
        sourceRef: 'refs/heads/main',
      }).selected,
      ['inventory'],
    );
    delete baselines.web;
    assert.deepEqual(
      implementation.selectComponents({
        ...selection,
        event: 'push',
        sourceRef: 'refs/heads/main',
      }).selected,
      ['inventory', 'web'],
    );
    assert.deepEqual(
      implementation.selectComponents({
        ...selection,
        event: 'workflow_dispatch',
        sourceRef: 'refs/heads/tooling',
      }).selected,
      names,
    );
  } finally {
    repo.close();
  }
});

test('missing package baselines and deleted or renamed package inputs never skip images', () => {
  const repo = repository();
  try {
    const metadata = readFileSync(join(repo.root, 'package.json'), 'utf8');
    repo.git('rm', 'package.json');
    const missing = repo.commit();
    repo.write('package.json', metadata);
    const sourceRevision = repo.commit();
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision,
        baselines: Object.fromEntries(names.map((name) => [name, missing])),
      }).selected,
      names,
    );
    repo.git('rm', 'package.json');
    const deleted = repo.commit();
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'pull_request',
        sourceRef: 'refs/heads/tooling',
        sourceRevision: deleted,
        baseRevision: repo.base,
      }).selected,
      names,
    );
    repo.write('package.json', metadata);
    const restored = repo.commit();
    repo.write('docs/readme.md', 'retained docs');
    repo.commit();
    repo.git('mv', 'package.json', 'docs/package.json');
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'pull_request',
        sourceRef: 'refs/heads/tooling',
        sourceRevision: repo.commit(),
        baseRevision: restored,
      }).selected,
      names,
    );
  } finally {
    repo.close();
  }
});

test('renaming a build input out of a component still rebuilds its old consumers', () => {
  const repo = repository();
  try {
    mkdirSync(join(repo.root, 'docs'));
    repo.git('mv', 'src/Inventory/Program.cs', 'docs/moved.cs');
    const result = implementation.selectComponents({
      root: repo.root,
      event: 'push',
      sourceRef: 'refs/heads/main',
      sourceRevision: repo.commit(),
      baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
    });
    assert.deepEqual(result.selected, ['inventory', 'database-bootstrap']);
  } finally {
    repo.close();
  }
});

function componentRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    component: 'inventory',
    repository: { id: 17, name: 'owner/repo' },
    sourceRevision: 'a'.repeat(40),
    sourceRef: 'refs/heads/main',
    runId: 21,
    runAttempt: 1,
    workflow: '.github/workflows/validate.yaml',
    image: 'ghcr.io/owner/repo-inventory',
    digest: `sha256:${'b'.repeat(64)}`,
    ...overrides,
  };
}

function publication(record = componentRecord()) {
  return {
    record,
    index: {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: ['amd64', 'arm64'].map((architecture) => ({
        platform: { os: 'linux', architecture },
        digest: `sha256:${'c'.repeat(64)}`,
      })),
    },
    run: {
      id: record.runId,
      run_attempt: record.runAttempt,
      head_sha: record.sourceRevision,
      head_branch: 'main',
      event: 'push',
      path: record.workflow,
      repository: { id: 17, full_name: 'owner/repo' },
      head_repository: { id: 17, full_name: 'owner/repo' },
      conclusion: 'failure',
    },
    job: {
      run_id: record.runId,
      run_attempt: record.runAttempt,
      name: 'Component inventory / Build inventory / Publish inventory',
      conclusion: 'success',
    },
    artifact: {
      id: 31,
      name: 'component-inventory-21-1',
      expired: false,
      workflow_run: {
        id: record.runId,
        head_sha: record.sourceRevision,
        head_branch: 'main',
        repository_id: 17,
        head_repository_id: 17,
      },
    },
  };
}

test('publication authority rejects forged identities even when an artifact exists', () => {
  const valid = publication();
  assert.deepEqual(
    implementation.validatePublicationEvidence(valid, {
      repository: { id: 17, name: 'owner/repo' },
      component: 'inventory',
      sourceRef: 'refs/heads/main',
    }),
    valid.record,
  );
  for (const change of [
    (entry) => (entry.job.conclusion = 'failure'),
    (entry) => (entry.job.name = 'Publish web'),
    (entry) => (entry.run.event = 'pull_request'),
    (entry) => (entry.run.repository.id = 99),
    (entry) => (entry.run.head_sha = 'd'.repeat(40)),
    (entry) => (entry.artifact.expired = true),
    (entry) => (entry.artifact.name = 'component-inventory-21-2'),
    (entry) => (entry.record.runAttempt = 2),
  ]) {
    const invalid = globalThis.structuredClone(valid);
    change(invalid);
    assert.throws(
      () =>
        implementation.validatePublicationEvidence(invalid, {
          repository: { id: 17, name: 'owner/repo' },
          component: 'inventory',
          sourceRef: 'refs/heads/main',
        }),
      /publication evidence/i,
    );
  }
});

function runIntent() {
  return {
    schemaVersion: 1,
    repository: { id: 17, name: 'owner/repo' },
    sourceRevision: 'a'.repeat(40),
    sourceRef: 'refs/heads/main',
    event: 'push',
    runId: 21,
    runAttempt: 1,
    workflow: '.github/workflows/validate.yaml',
    selected: ['inventory'],
    components: Object.fromEntries(
      names.map((name) => [name, { target: null, proposal: null }]),
    ),
  };
}

test('original intent requires explicit targets and binds each proposal to its component repository', () => {
  const valid = runIntent();
  valid.components.inventory = {
    target: componentRecord(),
    proposal: { head: 'd'.repeat(40), record: componentRecord() },
  };
  assert.deepEqual(implementation.validateRunIntent(valid), valid);
  for (const change of [
    (intent) => delete intent.components.web,
    (intent) => delete intent.components.inventory.target,
    (intent) => (intent.sourceRef = 'refs/tags/v1'),
    (intent) => (intent.event = 'pull_request_target'),
    (intent) => (intent.runId = 1.5),
    (intent) => (intent.selected = ['inventory', 'inventory']),
    (intent) => (intent.selected = ['unknown']),
    (intent) => (intent.selected = ['web', 'inventory']),
    (intent) => (intent.components.inventory.proposal.head = 'bad'),
    (intent) => (intent.components.inventory.target.component = 'web'),
    (intent) =>
      (intent.components.inventory.proposal.record.repository.id = 19),
  ]) {
    const invalid = globalThis.structuredClone(valid);
    change(invalid);
    assert.throws(
      () => implementation.validateRunIntent(invalid),
      /run intent/i,
    );
  }
});

test('a successful component inside a failed parent advances only its own ancestor baseline', async () => {
  const repo = repository();
  try {
    repo.write('docs/readme.md', 'later docs');
    const candidate = repo.commit();
    const evidence = publication(
      componentRecord({ sourceRevision: repo.base }),
    );
    const gateway = {
      listArtifacts: async () => ({
        artifacts: [evidence.artifact],
        total_count: 1,
      }),
      readResult: async () => ({
        record: evidence.record,
        index: evidence.index,
      }),
      readRun: async () => evidence.run,
      listJobs: async () => ({ jobs: [evidence.job], total_count: 1 }),
    };
    const result = await implementation.discoverBaselines({
      repository: { id: 17, name: 'owner/repo' },
      sourceRef: 'refs/heads/main',
      sourceRevision: candidate,
      gateway,
      root: repo.root,
    });
    assert.deepEqual(result, { inventory: repo.base });
    const selection = implementation.selectComponents({
      root: repo.root,
      event: 'push',
      sourceRef: 'refs/heads/main',
      sourceRevision: candidate,
      baselines: result,
    });
    assert.deepEqual(
      selection.selected,
      names.filter((name) => name !== 'inventory'),
    );
  } finally {
    repo.close();
  }
});

function archive(member, value, options = {}) {
  return execFileSync(
    process.platform === 'win32' ? 'python' : 'python3',
    [
      '-c',
      'import sys,io,zipfile,json,base64; d=json.load(sys.stdin); b=io.BytesIO(); z=zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED); z.writestr(d["member"],d["value"]); [(z.writestr(k,v)) for k,v in d["extra"].items()]; z.close(); sys.stdout.write(base64.b64encode(b.getvalue()).decode())',
    ],
    {
      input: JSON.stringify({ member, value, extra: options.extra ?? {} }),
      encoding: 'utf8',
    },
  );
}

test('artifact reading accepts only one bounded fixed JSON member without extracting paths', () => {
  const valid = Buffer.from(
    archive('component-result.json', '{"safe":true}'),
    'base64',
  );
  assert.deepEqual(
    implementation.readArtifactJson(valid, 'component-result.json'),
    { safe: true },
  );
  for (const bytes of [
    Buffer.from(archive('../component-result.json', '{}'), 'base64'),
    Buffer.from(
      archive('component-result.json', '{}', {
        extra: { 'secret.txt': 'PRIVATE-MARKER' },
      }),
      'base64',
    ),
    Buffer.from(archive('component-result.json', 'x'.repeat(65537)), 'base64'),
    Buffer.alloc(262145),
  ]) {
    assert.throws(
      () => implementation.readArtifactJson(bytes, 'component-result.json'),
      (error) =>
        /artifact/i.test(error.message) &&
        !error.message.includes('PRIVATE-MARKER'),
    );
  }
});

test('authenticated evidence transport parses bounded API responses and suppresses private payload failures', async () => {
  const gateway = implementation.createEvidenceGateway({
    repository: { id: 17, name: 'owner/repo' },
    token: 'PRIVATE-TOKEN',
    request: async (url, options) => {
      assert.equal(
        url,
        'https://api.github.com/repos/owner/repo/actions/artifacts?per_page=100&page=1',
      );
      assert.equal(options.headers.Authorization, 'Bearer PRIVATE-TOKEN');
      assert.ok(options.signal);
      return new globalThis.Response(
        JSON.stringify({ artifacts: [], total_count: 0 }),
      );
    },
  });
  assert.deepEqual(await gateway.listArtifacts(1), {
    artifacts: [],
    total_count: 0,
  });
  for (const response of [
    new globalThis.Response('PRIVATE-BODY', { status: 403 }),
    new globalThis.Response('PRIVATE-INVALID-JSON'),
    new globalThis.Response('x'.repeat(2097153)),
  ]) {
    const bad = implementation.createEvidenceGateway({
      repository: { id: 17, name: 'owner/repo' },
      token: 'PRIVATE-TOKEN',
      request: async () => response,
    });
    await assert.rejects(
      () => bad.listArtifacts(1),
      (error) =>
        /GitHub evidence/.test(error.message) &&
        !JSON.stringify(error).includes('PRIVATE') &&
        !error.message.includes('PRIVATE'),
    );
  }
});

test('baseline discovery reads actual fixed-member artifacts and attempt-specific producer metadata', async () => {
  const repo = repository();
  try {
    const evidence = publication(
      componentRecord({ sourceRevision: repo.base }),
    );
    const zip = Buffer.from(
      archive(
        'component-result.json',
        JSON.stringify({ record: evidence.record, index: evidence.index }),
      ),
      'base64',
    );
    const responses = {
      '/actions/artifacts?per_page=100&page=1': {
        artifacts: [evidence.artifact],
        total_count: 1,
      },
      '/actions/artifacts/31/zip': zip,
      '/actions/runs/21/attempts/1': evidence.run,
      '/actions/runs/21/attempts/1/jobs?per_page=100': {
        jobs: [evidence.job],
        total_count: 1,
      },
    };
    const gateway = implementation.createEvidenceGateway({
      repository: { id: 17, name: 'owner/repo' },
      token: 'PRIVATE',
      request: async (url) =>
        new globalThis.Response(
          responses[
            url.replace('https://api.github.com/repos/owner/repo', '')
          ] instanceof Buffer
            ? responses[
                url.replace('https://api.github.com/repos/owner/repo', '')
              ]
            : JSON.stringify(
                responses[
                  url.replace('https://api.github.com/repos/owner/repo', '')
                ] ?? {},
              ),
        ),
    });
    assert.deepEqual(
      await implementation.discoverBaselines({
        root: repo.root,
        repository: { id: 17, name: 'owner/repo' },
        sourceRef: 'refs/heads/main',
        sourceRevision: repo.base,
        gateway,
      }),
      { inventory: repo.base },
    );
  } finally {
    repo.close();
  }
});

test('the manual selection CLI emits all component outputs without provider publication', () => {
  const repo = repository();
  try {
    const output = join(repo.root, 'outputs');
    const stdout = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('./component-pipelines.mjs', import.meta.url)),
        'select',
      ],
      {
        cwd: repo.root,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...runEnvironment({
            GITHUB_SHA: repo.base,
            GITHUB_OUTPUT: output,
            GH_TOKEN: '',
          }),
        },
      },
    );
    assert.deepEqual(JSON.parse(stdout).selected, names);
  } finally {
    repo.close();
  }
});

function runEnvironment(overrides = {}) {
  return {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/feature/nested',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_REPOSITORY_ID: '17',
    GITHUB_RUN_ID: '21',
    GITHUB_RUN_ATTEMPT: '1',
    GH_TOKEN: 'PRIVATE',
    ...overrides,
  };
}

function withOriginalIntent(gateway, evidence) {
  const intent = {
    ...runIntent(),
    sourceRevision: evidence.run.head_sha,
    sourceRef: `refs/heads/${evidence.run.head_branch}`,
    event: evidence.run.event,
    selected: ['inventory'],
  };
  const artifact = {
    ...evidence.artifact,
    id: 1031,
    name: 'run-intent-21',
    workflow_run: {
      ...evidence.artifact.workflow_run,
      head_branch: evidence.run.head_branch,
      head_sha: evidence.run.head_sha,
    },
  };
  return {
    ...gateway,
    readIntent: async () => intent,
    listArtifacts: async (...args) => {
      const listing = await gateway.listArtifacts(...args);
      return {
        ...listing,
        artifacts: [...listing.artifacts, artifact],
        total_count: listing.total_count + 1,
      };
    },
    listJobs: async (...args) => {
      const listing = await gateway.listJobs(...args);
      return {
        jobs: [
          ...listing.jobs,
          {
            run_id: 21,
            run_attempt: 1,
            name: 'Select components',
            conclusion: 'success',
          },
        ],
        total_count: listing.total_count + 1,
      };
    },
  };
}

test('intent capture records explicit current component targets and proposals before building', async () => {
  const repo = repository();
  try {
    const file = join(repo.root, 'run-intent.json');
    const selection = join(repo.root, 'selection.json');
    writeFileSync(selection, JSON.stringify({ selected: names }));
    const record = componentRecord();
    const gateway = {
      readRef: async (ref) =>
        ref === 'heads/main'
          ? 'd'.repeat(40)
          : ref.endsWith('inventory')
            ? 'e'.repeat(40)
            : null,
      readRecord: async (name) => (name === 'inventory' ? record : null),
    };
    await implementation.runPipelineCommand({
      command: 'intent',
      args: ['--selection', selection, '--output', file],
      env: runEnvironment(),
      root: repo.root,
      gateway,
    });
    const intent = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(intent.components.inventory, {
      target: record,
      proposal: null,
    });
    assert.deepEqual(intent.components.web, { target: null, proposal: null });
    assert.equal(intent.sourceRef, 'refs/heads/feature/nested');
    assert.equal(intent.runAttempt, 1);
  } finally {
    repo.close();
  }
});

test('intent capture reads immutable remote records and accepts only explicit missing GitHub refs', async () => {
  const repo = repository();
  try {
    const record = componentRecord();
    const gateway = implementation.createEvidenceGateway({
      repository: record.repository,
      token: 'PRIVATE',
      request: async (url) => {
        const path = url.replace('https://api.github.com/repos/owner/repo', '');
        if (path === '/git/ref/heads/main')
          return new globalThis.Response(
            JSON.stringify({ object: { sha: 'd'.repeat(40) } }),
          );
        if (
          path ===
          `/contents/deploy/environments/local/releases/inventory.json?ref=${'d'.repeat(40)}`
        )
          return new globalThis.Response(
            JSON.stringify({
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(JSON.stringify(record)).toString('base64'),
            }),
          );
        return new globalThis.Response('{}', { status: 404 });
      },
    });
    const file = join(repo.root, 'intent.json');
    const selection = join(repo.root, 'selection.json');
    writeFileSync(selection, JSON.stringify({ selected: names }));
    await implementation.runPipelineCommand({
      command: 'intent',
      args: ['--selection', selection, '--output', file],
      env: runEnvironment(),
      gateway,
    });
    assert.deepEqual(
      JSON.parse(readFileSync(file, 'utf8')).components.inventory,
      { target: record, proposal: null },
    );
  } finally {
    repo.close();
  }
});

test('reruns reuse original intent instead of recapturing changed target state', async () => {
  const repo = repository();
  try {
    const intent = runIntent();
    intent.event = 'workflow_dispatch';
    intent.sourceRef = 'refs/heads/feature/nested';
    const evidence = publication();
    evidence.run.event = intent.event;
    evidence.run.head_branch = 'feature/nested';
    const artifact = {
      ...evidence.artifact,
      name: 'run-intent-21',
      workflow_run: {
        ...evidence.artifact.workflow_run,
        head_branch: 'feature/nested',
      },
    };
    const gateway = {
      listArtifacts: async () => ({ artifacts: [artifact], total_count: 1 }),
      readIntent: async () => intent,
      readRun: async () => evidence.run,
      listJobs: async () => ({
        jobs: [
          {
            run_id: 21,
            run_attempt: 1,
            name: 'Select components',
            conclusion: 'success',
          },
        ],
        total_count: 1,
      }),
      readRef: async () => {
        throw new Error('must not recapture');
      },
    };
    const file = join(repo.root, 'intent.json');
    await implementation.runPipelineCommand({
      command: 'intent',
      args: ['--output', file],
      env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
      gateway,
    });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), intent);
    await assert.rejects(
      () =>
        implementation.runPipelineCommand({
          command: 'load-intent',
          args: ['--output', file],
          env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
          gateway: {
            ...gateway,
            listArtifacts: async () => ({ artifacts: [], total_count: 0 }),
          },
        }),
      /fresh run/i,
    );
  } finally {
    repo.close();
  }
});

test('an initial component build proceeds when no result has yet been published', async () => {
  const repo = repository();
  try {
    const result = await implementation.runPipelineCommand({
      command: 'load-result',
      args: [
        '--component',
        'inventory',
        '--output',
        join(repo.root, 'result.json'),
      ],
      env: runEnvironment(),
      gateway: {
        listArtifacts: async () => ({ artifacts: [], total_count: 0 }),
      },
    });
    assert.deepEqual(result, { available: false });
  } finally {
    repo.close();
  }
});

test('a failed producer can rebuild on rerun while successful or unknown prior history fails closed', async () => {
  const repo = repository();
  try {
    const evidence = publication();
    evidence.run.event = 'workflow_dispatch';
    evidence.run.head_branch = 'feature/nested';
    const gateway = withOriginalIntent(
      {
        listArtifacts: async () => ({ artifacts: [], total_count: 0 }),
        readRun: async () => evidence.run,
        listJobs: async () => ({
          jobs: [{ ...evidence.job, conclusion: 'failure' }],
          total_count: 1,
        }),
      },
      evidence,
    );
    const invoke = (override) =>
      implementation.runPipelineCommand({
        command: 'load-result',
        args: [
          '--component',
          'inventory',
          '--output',
          join(repo.root, 'result.json'),
        ],
        env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
        gateway: { ...gateway, ...override },
      });
    assert.deepEqual(await invoke({}), { available: false });
    for (const override of [
      {
        listJobs: async () => ({
          jobs: [
            evidence.job,
            {
              run_id: 21,
              run_attempt: 1,
              name: 'Select components',
              conclusion: 'success',
            },
          ],
          total_count: 2,
        }),
      },
      { listJobs: async () => ({ jobs: [], total_count: 1 }) },
      { readRun: async () => ({ ...evidence.run, head_sha: 'f'.repeat(40) }) },
      { listJobs: async () => ({ jobs: [], total_count: 0 }) },
    ])
      await assert.rejects(() => invoke(override), /fresh run/i);
  } finally {
    repo.close();
  }
});

test('successful same-run component results are reused exactly and ambiguity or wrong source fails closed', async () => {
  const repo = repository();
  try {
    const evidence = publication(
      componentRecord({ sourceRef: 'refs/heads/feature/nested' }),
    );
    evidence.run.head_branch = 'feature/nested';
    evidence.run.event = 'workflow_dispatch';
    evidence.artifact.workflow_run.head_branch = 'feature/nested';
    const gateway = withOriginalIntent(
      {
        listArtifacts: async () => ({
          artifacts: [evidence.artifact],
          total_count: 1,
        }),
        readResult: async () => ({
          record: evidence.record,
          index: evidence.index,
        }),
        readRun: async () => evidence.run,
        listJobs: async () => ({ jobs: [evidence.job], total_count: 1 }),
      },
      evidence,
    );
    const file = join(repo.root, 'result.json');
    const invoke = (override) =>
      implementation.runPipelineCommand({
        command: 'load-result',
        args: ['--component', 'inventory', '--output', file],
        env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
        gateway: { ...gateway, ...override },
      });
    assert.deepEqual(await invoke({}), { available: true });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
      record: evidence.record,
      index: evidence.index,
    });
    for (const override of [
      {
        listArtifacts: async () => ({
          artifacts: [
            evidence.artifact,
            { ...evidence.artifact, id: 32 },
            ...(await gateway.listArtifacts()).artifacts.filter(
              (artifact) => artifact.name === 'run-intent-21',
            ),
          ],
          total_count: 3,
        }),
      },
      {
        readResult: async () => ({
          record: { ...evidence.record, sourceRevision: 'd'.repeat(40) },
          index: evidence.index,
        }),
      },
      { readRun: async () => ({ ...evidence.run, id: 22 }) },
    ])
      await assert.rejects(() => invoke(override), /fresh run/i);
  } finally {
    repo.close();
  }
});

test('a full rerun retains originally selected components even after publication and promotion failure', async () => {
  const intent = runIntent();
  intent.event = 'workflow_dispatch';
  intent.sourceRef = 'refs/heads/feature/nested';
  const evidence = publication();
  evidence.run.event = intent.event;
  evidence.run.head_branch = 'feature/nested';
  const artifact = {
    ...evidence.artifact,
    name: 'run-intent-21',
    workflow_run: {
      ...evidence.artifact.workflow_run,
      head_branch: 'feature/nested',
    },
  };
  const gateway = {
    listArtifacts: async () => ({ artifacts: [artifact], total_count: 1 }),
    readIntent: async () => intent,
    readRun: async () => evidence.run,
    listJobs: async () => ({
      jobs: [
        {
          run_id: 21,
          run_attempt: 1,
          name: 'Select components',
          conclusion: 'success',
        },
      ],
      total_count: 1,
    }),
  };
  const result = await implementation.runPipelineCommand({
    command: 'select',
    env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
    gateway,
  });
  assert.deepEqual(result.selected, ['inventory']);
  intent.selected = [];
  assert.deepEqual(
    (
      await implementation.runPipelineCommand({
        command: 'select',
        env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
        gateway,
      })
    ).selected,
    [],
  );
});

test('unknown source projects and uncertain candidate graphs conservatively select every component', () => {
  for (const [path, value] of [
    ['src/Unmapped/Thing.cs', 'new source'],
    [
      'src/Inventory/Inventory.csproj',
      '<Project><Import Project="custom.props" /></Project>',
    ],
    ['src/Inventory/Inventory.csproj', '<Project><ItemGroup></Project>'],
  ]) {
    const repo = repository();
    try {
      repo.write(path, value);
      assert.deepEqual(
        implementation.selectComponents({
          root: repo.root,
          event: 'push',
          sourceRef: 'refs/heads/main',
          sourceRevision: repo.commit(),
          baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
        }).selected,
        names,
        path,
      );
    } finally {
      repo.close();
    }
  }
});

test('a verified never-started selected producer can build after a failed attempt', async () => {
  const repo = repository();
  try {
    const intent = runIntent();
    intent.event = 'workflow_dispatch';
    intent.sourceRef = 'refs/heads/feature/nested';
    const evidence = publication();
    evidence.run.event = intent.event;
    evidence.run.head_branch = 'feature/nested';
    evidence.run.status = 'completed';
    const artifact = {
      ...evidence.artifact,
      name: 'run-intent-21',
      workflow_run: {
        ...evidence.artifact.workflow_run,
        head_branch: 'feature/nested',
      },
    };
    const gateway = {
      listArtifacts: async () => ({ artifacts: [artifact], total_count: 1 }),
      readIntent: async () => intent,
      readRun: async () => evidence.run,
      listJobs: async () => ({
        jobs: [
          {
            run_id: 21,
            run_attempt: 1,
            name: 'Select components',
            conclusion: 'success',
          },
        ],
        total_count: 1,
      }),
    };
    const invoke = (overrides) =>
      implementation.runPipelineCommand({
        command: 'load-result',
        args: [
          '--component',
          'inventory',
          '--output',
          join(repo.root, 'result.json'),
        ],
        env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
        gateway: { ...gateway, ...overrides },
      });
    assert.deepEqual(await invoke({}), { available: false });
    for (const overrides of [
      { readRun: async () => ({ ...evidence.run, status: 'in_progress' }) },
      { readRun: async () => ({ ...evidence.run, conclusion: 'success' }) },
      { listJobs: async () => ({ jobs: [], total_count: 1 }) },
      { readIntent: async () => ({ ...intent, selected: [] }) },
    ])
      await assert.rejects(() => invoke(overrides), /fresh run/i);
  } finally {
    repo.close();
  }
});

test('intent creation refuses oversized metadata before writing a retained artifact', async () => {
  const repo = repository();
  try {
    const selection = join(repo.root, 'selection.json');
    writeFileSync(selection, JSON.stringify({ selected: names }));
    const huge = componentRecord({
      sourceRef: `refs/heads/${'x'.repeat(66000)}`,
    });
    const gateway = {
      readRef: async (ref) => (ref === 'heads/main' ? 'd'.repeat(40) : null),
      readRecord: async (name) => (name === 'inventory' ? huge : null),
    };
    await assert.rejects(
      () =>
        implementation.runPipelineCommand({
          command: 'intent',
          args: [
            '--selection',
            selection,
            '--output',
            join(repo.root, 'intent.json'),
          ],
          env: runEnvironment(),
          gateway,
        }),
      /bounded|64KiB/i,
    );
  } finally {
    repo.close();
  }
});

test('the CLI preserves a safe phase diagnostic for unexpected filesystem failures', () => {
  const repo = repository();
  try {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./component-pipelines.mjs', import.meta.url)),
        'select',
        '--output',
        join(repo.root, 'PRIVATE-MARKER', 'selection.json'),
      ],
      {
        cwd: repo.root,
        encoding: 'utf8',
        env: { ...process.env, ...runEnvironment(), GITHUB_SHA: repo.base },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Component pipeline operation failed/);
    assert.ok(!result.stderr.includes('PRIVATE-MARKER'));
  } finally {
    repo.close();
  }
});

test('PR selection compares merge-base while main retains an earlier failed component through docs changes', () => {
  const repo = repository();
  try {
    repo.git('checkout', '-qb', 'target');
    repo.write('src/Notifications/Program.cs', 'target-only');
    const target = repo.commit();
    repo.git('checkout', '-qb', 'proposal', repo.base);
    repo.write('src/Web/app.ts', 'proposal-only');
    const candidate = repo.commit();
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'pull_request',
        sourceRef: 'refs/heads/proposal',
        sourceRevision: candidate,
        baseRevision: target,
      }).selected,
      ['web'],
    );
    repo.git('checkout', '-q', 'target');
    repo.write('src/Inventory/Program.cs', 'failed publication');
    repo.commit();
    repo.write('docs/later.md', 'documentation');
    const current = repo.commit();
    const baselines = Object.fromEntries(
      names.map((name) => [
        name,
        ['inventory', 'database-bootstrap'].includes(name) ? target : current,
      ]),
    );
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: current,
        baselines,
      }).selected,
      ['inventory', 'database-bootstrap'],
    );
    baselines.inventory = 'f'.repeat(40);
    baselines['database-bootstrap'] = current;
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: current,
        baselines,
      }).selected,
      ['inventory'],
    );
  } finally {
    repo.close();
  }
});

test('removing a project reference retains the baseline dependency impact', () => {
  const repo = repository();
  try {
    repo.write(
      'src/Inventory/Inventory.csproj',
      '<Project Sdk="Microsoft.NET.Sdk" />',
    );
    repo.write('src/Persistence/Program.cs', 'changed old dependency');
    assert.deepEqual(
      implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: repo.commit(),
        baselines: Object.fromEntries(names.map((name) => [name, repo.base])),
      }).selected,
      ['inventory', 'reservations', 'database-bootstrap'],
    );
  } finally {
    repo.close();
  }
});

for (const successful of [false, true])
  test(`later ${successful ? 'successful' : 'failed'} producer recovery requires original valid selected intent first`, async () => {
    const repo = repository();
    try {
      const evidence = publication(
        componentRecord({ sourceRef: 'refs/heads/feature/nested' }),
      );
      evidence.run.event = 'workflow_dispatch';
      evidence.run.head_branch = 'feature/nested';
      evidence.artifact.workflow_run.head_branch = 'feature/nested';
      let resultReads = 0;
      const base = {
        listArtifacts: async () => ({
          artifacts: successful ? [evidence.artifact] : [],
          total_count: successful ? 1 : 0,
        }),
        readResult: async () => {
          resultReads++;
          return { record: evidence.record, index: evidence.index };
        },
        readRun: async () => evidence.run,
        listJobs: async () => ({
          jobs: [
            { ...evidence.job, conclusion: successful ? 'success' : 'failure' },
          ],
          total_count: 1,
        }),
      };
      const valid = withOriginalIntent(base, evidence);
      for (const override of [
        { listArtifacts: base.listArtifacts },
        {
          readIntent: async () => ({
            ...runIntent(),
            sourceRevision: 'f'.repeat(40),
          }),
        },
        {
          readIntent: async () => ({
            ...runIntent(),
            sourceRef: 'refs/heads/feature/nested',
            event: 'workflow_dispatch',
            selected: [],
          }),
        },
      ]) {
        await assert.rejects(
          () =>
            implementation.runPipelineCommand({
              command: 'load-result',
              args: [
                '--component',
                'inventory',
                '--output',
                join(repo.root, 'result.json'),
              ],
              env: runEnvironment({ GITHUB_RUN_ATTEMPT: '2' }),
              gateway: { ...valid, ...override },
            }),
          /fresh run/i,
        );
        assert.equal(
          resultReads,
          0,
          'untrusted intent must fail before result provider consumption',
        );
      }
    } finally {
      repo.close();
    }
  });

for (const item of ['Compile', 'EmbeddedResource'])
  test(`linked external ${item} input cannot silently omit its consuming component`, () => {
    const repo = repository();
    try {
      repo.write(
        'src/BrokerBootstrap/BrokerBootstrap.csproj',
        `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><${item} Include="../Inventory/Program.cs" Link="linked.cs" /></ItemGroup></Project>`,
      );
      const baseline = repo.commit();
      repo.write('src/Inventory/Program.cs', 'changed shared linked input');
      const selected = implementation.selectComponents({
        root: repo.root,
        event: 'push',
        sourceRef: 'refs/heads/main',
        sourceRevision: repo.commit(),
        baselines: Object.fromEntries(names.map((name) => [name, baseline])),
      }).selected;
      assert.deepEqual(selected, names);
    } finally {
      repo.close();
    }
  });
