import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  promotionFiles,
  promote,
  githubGateway,
  refreshJobSuffixes,
} from './promote-images.mjs';
import { imageNames } from './deployment-validation.mjs';

const jobs = Object.fromEntries(
  ['database', 'identity'].map((name) => [
    name,
    {
      template: `kind: Job\nmetadata:\n  name: ${name}\n`,
      wrapper: `# retained job comment\napiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../../../../base/jobs/${name}]\nnameSuffix: -unreleased\n`,
    },
  ]),
);
const jobInputs = {
  baseConfiguration: 'base-config',
  localConfiguration: 'local-config',
  jobs,
};

const release = {
  sourceRevision: 'a'.repeat(40),
  images: Object.fromEntries(
    imageNames.map((name) => [
      name,
      {
        image: `ghcr.io/example/equipment-${name}`,
        digest: `sha256:${'b'.repeat(64)}`,
      },
    ]),
  ),
};

test('promotion changes only image references, provenance and the two derived Job suffixes', () => {
  const files = promotionFiles(
    release,
    '# retained configuration comment\napiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - ../../base\nimages:\n  - name: inventory\n    newName: old\n    digest: old\n',
    jobInputs,
  );
  assert.deepEqual(Object.keys(files).sort(), [
    'deploy/environments/local/jobs/database/kustomization.yaml',
    'deploy/environments/local/jobs/identity/kustomization.yaml',
    'deploy/environments/local/kustomization.yaml',
    'deploy/environments/local/release.json',
  ]);
  assert.match(
    files['deploy/environments/local/kustomization.yaml'],
    /\.\.\/\.\.\/base/,
  );
  assert.ok(
    files['deploy/environments/local/kustomization.yaml'].startsWith(
      '# retained configuration comment\napiVersion:',
    ),
  );
  assert.equal(
    JSON.parse(files['deploy/environments/local/release.json']).sourceRevision,
    release.sourceRevision,
  );
});

test('compare-and-swap rejection never force-overwrites or creates a PR', async () => {
  let created = false;
  const gateway = {
    readState: async () => ({
      head: 'old',
      base: release.sourceRevision,
      managed: true,
    }),
    readSnapshot: async (revision) => ({
      revision,
      kustomization: 'resources: []',
      jobInputs,
      releaseText: null,
    }),
    commit: async () => 'new',
    compareAndSwap: async () => {
      throw new Error('head changed');
    },
    ensurePullRequest: async () => {
      created = true;
    },
  };
  await assert.rejects(
    promote({
      release,
      kustomization: 'resources: []',
      jobInputs,
      checkoutRevision: release.sourceRevision,
      expectedHead: 'old',
      gateway,
    }),
    /head changed/,
  );
  assert.equal(created, false);
});

test('human branch changes stop before commit; existing PR is reused after safe update', async () => {
  let commits = 0;
  const gateway = {
    readState: async () => ({
      head: 'human',
      base: release.sourceRevision,
      managed: false,
    }),
    commit: async () => {
      commits++;
      return 'new';
    },
    compareAndSwap: async () => {},
    ensurePullRequest: async () => ({ number: 42 }),
  };
  await assert.rejects(
    promote({
      release,
      kustomization: 'resources: []',
      jobInputs,
      checkoutRevision: release.sourceRevision,
      expectedHead: 'old',
      gateway,
    }),
    /changed|managed/,
  );
  assert.equal(commits, 0);
  gateway.readSnapshot = async (revision) => ({
    revision,
    kustomization: 'resources: []',
    jobInputs,
    releaseText: null,
  });
  gateway.readState = async () => ({
    head: 'old',
    base: release.sourceRevision,
    managed: true,
  });
  assert.deepEqual(
    await promote({
      release,
      kustomization: 'resources: []',
      jobInputs,
      checkoutRevision: release.sourceRevision,
      expectedHead: 'old',
      gateway,
    }),
    { number: 42 },
  );
});

test('GitHub transport submits atomic expected-head CAS and reuses matching open PR', async () => {
  const calls = [];
  const gateway = githubGateway({
    repository: 'example/equipment',
    token: 'test-only-token',
    request: async (url, options) => {
      calls.push({ url, ...options });
      const data = url.includes('/pulls?')
        ? [{ number: 42 }]
        : url.endsWith('/graphql')
          ? { data: { updateRefs: { clientMutationId: null } } }
          : { node_id: 'repository-id' };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  await gateway.compareAndSwap('old', 'new');
  assert.deepEqual(JSON.parse(calls[1].body).variables.input, {
    repositoryId: 'repository-id',
    refUpdates: [
      {
        name: 'refs/heads/automation/local-image-promotion',
        beforeOid: 'old',
        afterOid: 'new',
        force: false,
      },
    ],
  });
  assert.equal(calls[1].method, 'POST');
  assert.ok(calls[1].signal);
  assert.deepEqual(await gateway.ensurePullRequest(), { number: 42 });
  assert.equal(
    calls.filter(
      (call) => call.method === 'POST' && !call.url.endsWith('/graphql'),
    ).length,
    0,
  );
});

test('config-only refresh preserves images and unrelated wrapper fields and rejects symlink inputs before writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'promotion-fixture-'));
  function write(path, content) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  try {
    const releaseText = JSON.stringify(release);
    write('deploy/environments/local/release.json', releaseText);
    write('deploy/base/configuration.yaml', jobInputs.baseConfiguration);
    write(
      'deploy/environments/local/configuration.yaml',
      jobInputs.localConfiguration,
    );
    for (const [name, job] of Object.entries(jobInputs.jobs)) {
      write(`deploy/base/jobs/${name}/job.yaml`, job.template);
      write(
        `deploy/environments/local/jobs/${name}/kustomization.yaml`,
        job.wrapper,
      );
    }
    const files = refreshJobSuffixes(root);
    assert.equal(files.length, 2);
    assert.equal(
      readFileSync(
        join(root, 'deploy/environments/local/release.json'),
        'utf8',
      ),
      releaseText,
    );
    const wrapperPath =
      'deploy/environments/local/jobs/database/kustomization.yaml';
    const wrapper = readFileSync(join(root, wrapperPath), 'utf8');
    assert.ok(wrapper.startsWith('# retained job comment\napiVersion:'));
    assert.match(wrapper, /^nameSuffix: -[a-f0-9]{16}$/m);
    const config = join(root, 'deploy/base/configuration.yaml');
    rmSync(config);
    symlinkSync(join(root, 'deploy/environments/local/release.json'), config);
    assert.throws(() => refreshJobSuffixes(root), /Symlink/);
    assert.equal(readFileSync(join(root, wrapperPath), 'utf8'), wrapper);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unexpected parent wrapper fields abort the whole proposal before remote mutation', async () => {
  let wrote = false;
  const invalid = {
    ...jobInputs,
    jobs: {
      ...jobs,
      identity: {
        ...jobs.identity,
        wrapper: jobs.identity.wrapper + 'namespace: injected\n',
      },
    },
  };
  const gateway = {
    readState: async () => ({
      base: release.sourceRevision,
      head: null,
      managed: true,
    }),
    readSnapshot: async (revision) => ({
      revision,
      kustomization: 'resources: []',
      jobInputs: invalid,
      releaseText: null,
    }),
    commit: async () => {
      wrote = true;
    },
  };
  await assert.rejects(
    promote({
      release,
      checkoutRevision: release.sourceRevision,
      expectedHead: null,
      gateway,
    }),
    /field/,
  );
  assert.equal(wrote, false);
});

test('promotion refuses main advancing beyond its checked-out source before any write', async () => {
  let wrote = false;
  const gateway = {
    readState: async () => ({
      base: 'advanced-main',
      head: null,
      managed: true,
    }),
    commit: async () => {
      wrote = true;
      return 'new';
    },
    compareAndSwap: async () => {},
    ensurePullRequest: async () => ({ number: 1 }),
  };
  await assert.rejects(
    promote({
      release,
      kustomization: 'resources: []',
      jobInputs,
      checkoutRevision: release.sourceRevision,
      expectedHead: null,
      gateway,
    }),
    /main|revision|checkout/,
  );
  assert.equal(wrote, false);
});

test('existing promotion parent with unrelated human changes is refused instead of overwritten from checkout', async () => {
  let wrote = false;
  const snapshot = (revision) => ({
    revision,
    kustomization:
      revision === 'promotion-head'
        ? 'resources: []\nsecuritySetting: preserve-human-change\n'
        : 'resources: []\n',
    jobInputs,
    releaseText: null,
  });
  const gateway = {
    readState: async () => ({
      base: release.sourceRevision,
      head: 'promotion-head',
      managed: true,
    }),
    readSnapshot: async (revision) => snapshot(revision),
    commit: async () => {
      wrote = true;
      return 'new';
    },
    compareAndSwap: async () => {},
    ensurePullRequest: async () => ({ number: 1 }),
  };
  await assert.rejects(
    promote({
      release,
      kustomization: 'resources: []',
      jobInputs,
      checkoutRevision: release.sourceRevision,
      expectedHead: 'promotion-head',
      gateway,
    }),
    /parent|unrelated|changed/,
  );
  assert.equal(wrote, false);
});

test('proposal derives complete files from the exact verified remote parent, preserving its security settings', async () => {
  let files;
  const gateway = {
    readState: async () => ({
      base: release.sourceRevision,
      head: null,
      managed: true,
    }),
    readSnapshot: async (revision) => ({
      revision,
      kustomization: 'resources: []\nsecuritySetting: verified-parent\n',
      jobInputs,
      releaseText: null,
    }),
    commit: async (proposal) => {
      files = proposal;
      return 'new';
    },
    compareAndSwap: async () => {},
    ensurePullRequest: async () => ({ number: 1 }),
  };
  await promote({
    release,
    kustomization: 'resources: []\nsecuritySetting: stale-checkout\n',
    jobInputs,
    checkoutRevision: release.sourceRevision,
    expectedHead: null,
    gateway,
  });
  assert.match(
    files['deploy/environments/local/kustomization.yaml'],
    /securitySetting: verified-parent/,
  );
  assert.doesNotMatch(
    files['deploy/environments/local/kustomization.yaml'],
    /stale-checkout/,
  );
});

function snapshotTransport() {
  const paths = [
    'deploy/environments/local/kustomization.yaml',
    'deploy/base/configuration.yaml',
    'deploy/environments/local/configuration.yaml',
    ...['database', 'identity'].flatMap((name) => [
      `deploy/base/jobs/${name}/job.yaml`,
      `deploy/environments/local/jobs/${name}/kustomization.yaml`,
    ]),
  ];
  const blobs = new Map();
  const tree = paths.map((path) => {
    const bytes = readFileSync(path);
    const sha = createHash('sha1')
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest('hex');
    blobs.set(sha, {
      sha,
      encoding: 'base64',
      content: bytes.toString('base64'),
    });
    return { path, sha, type: 'blob', mode: '100644' };
  });
  const calls = [];
  const treeRevision = 'c'.repeat(40);
  let tamper = false;
  const gateway = githubGateway({
    repository: 'example/equipment',
    token: 'test-only-token',
    request: async (url) => {
      calls.push(url);
      let data;
      if (url.includes('/git/commits/'))
        data = { sha: release.sourceRevision, tree: { sha: treeRevision } };
      else if (url.includes('/git/trees/'))
        data = { sha: treeRevision, truncated: false, tree };
      else {
        const sha = url.split('/').at(-1);
        data = { ...blobs.get(sha) };
        if (tamper)
          data.content = Buffer.from(
            Buffer.from(data.content, 'base64').toString('utf8') +
              '\n# different blob bytes\n',
          ).toString('base64');
      }
      return { ok: true, status: 200, json: async () => data };
    },
  });
  return {
    gateway,
    calls,
    treeRevision,
    tamper: () => {
      tamper = true;
    },
  };
}

test('GitHub snapshot resolves every source blob through the exact verified parent commit tree', async () => {
  const fixture = snapshotTransport();
  const snapshot = await fixture.gateway.readSnapshot(release.sourceRevision);
  assert.equal(snapshot.revision, release.sourceRevision);
  assert.equal(
    fixture.calls[0],
    `https://api.github.com/repos/example/equipment/git/commits/${release.sourceRevision}`,
  );
  assert.ok(
    fixture.calls.includes(
      `https://api.github.com/repos/example/equipment/git/trees/${fixture.treeRevision}?recursive=1`,
    ),
  );
});

test('GitHub snapshot rejects content not matching its parent blob object ID', async () => {
  const fixture = snapshotTransport();
  fixture.tamper();
  await assert.rejects(
    fixture.gateway.readSnapshot(release.sourceRevision),
    /blob|parent/,
  );
});

test('managed branch validation rejects earlier human commits and cumulative unrelated changes', async () => {
  for (const problem of ['human-history', 'unrelated-file', 'advanced-main']) {
    const head = 'd'.repeat(40);
    const bot = (sha) => ({
      sha,
      author: { login: 'github-actions[bot]' },
      commit: {
        message: 'chore: promote local application images\n\nSource: revision',
      },
    });
    const allowed = {
      filename: 'deploy/environments/local/release.json',
      status: 'modified',
    };
    const gateway = githubGateway({
      repository: 'example/equipment',
      token: 'test-only-token',
      request: async (url) => {
        let data;
        if (url.endsWith('/git/ref/heads/main'))
          data = { object: { sha: release.sourceRevision } };
        else if (url.includes('/git/ref/heads/'))
          data = { object: { sha: head } };
        else if (url.includes('/compare/'))
          data = {
            ahead_by: 2,
            behind_by: problem === 'advanced-main' ? 1 : 0,
            merge_base_commit: { sha: release.sourceRevision },
            commits: [
              {
                ...bot('e'.repeat(40)),
                author: {
                  login:
                    problem === 'human-history'
                      ? 'human-owner'
                      : 'github-actions[bot]',
                },
              },
              bot(head),
            ],
            files:
              problem === 'unrelated-file'
                ? [allowed, { filename: 'src/Auth.cs', status: 'modified' }]
                : [allowed],
          };
        else data = { ...bot(head), files: [allowed] };
        return { ok: true, status: 200, json: async () => data };
      },
    });
    assert.equal((await gateway.readState()).managed, false, problem);
  }
});
