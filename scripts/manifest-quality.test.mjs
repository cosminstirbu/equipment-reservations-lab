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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  selectQuality,
  discoverFullQualityBaseline,
  runManifestQuality,
  validateStaticDeployment,
} from './manifest-quality.mjs';

const overlay = 'deploy/environments/local/kustomization.yaml';

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
  };
}

function proofGateway(proof) {
  return {
    api: async (path) =>
      path.startsWith('/actions/workflows/')
        ? { workflow_runs: [proof.run], total_count: 1 }
        : { jobs: [proof.job], total_count: 1 },
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
            : { jobs: [proof.job], total_count: 1 },
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
      const kubectl = process.env.MANIFEST_KUBECTL;
      assert.equal(
        (await validateStaticDeployment({ root: repo.root, kubectl })).status,
        'unreleased',
      );
      const { promotionFiles } = await import('./promote-images.mjs');
      const { imageNames, readJobInputs } =
        await import('./deployment-validation.mjs');
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
