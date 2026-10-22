import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';
import { check } from 'prettier';
import {
  promotionFiles,
  promote,
  githubGateway,
  refreshJobSuffixes,
} from './promote-images.mjs';
import { imageNames, readJobInputs } from './deployment-validation.mjs';

test('authenticated GitHub failures retain safe phase or status without raw response data', async () => {
  for (const failure of ['transport', 'body', 'status']) {
    const gateway = githubGateway({
      repository: 'example/equipment',
      token: 'PRIVATE_TOKEN',
      request: async () => {
        if (failure === 'transport')
          throw new Error('PRIVATE_PROVIDER_FAILURE');
        return {
          ok: failure !== 'status',
          status: failure === 'status' ? 503 : 200,
          json: async () => {
            throw new Error('PRIVATE_PROVIDER_BODY');
          },
        };
      },
    });
    await assert.rejects(gateway.readState(), (error) => {
      assert.match(error.message, /GitHub.*(?:transport|payload|503)/);
      assert.doesNotMatch(error.message + JSON.stringify(error), /PRIVATE_/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

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

test('suffix refresh attempts every temporary cleanup and preserves its primary failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'promotion-cleanup-'));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write('deploy/environments/local/release.json', JSON.stringify(release));
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
  const driver = join(root, 'driver.mjs');
  writeFileSync(
    driver,
    `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const original=fs.rmSync;fs.rmSync=(path,options)=>{if(String(path).endsWith('.tmp')){console.log('temporary cleanup attempted');throw Object.assign(new Error('PRIVATE_CLEANUP'),{code:'EACCES'});}return original(path,options);};const{OperationalFailure}=await import(${JSON.stringify(new URL('./process.mjs', import.meta.url).href)});if(process.env.PRIMARY==='true')fs.renameSync=()=>{throw new OperationalFailure('primary promotion write failed');};syncBuiltinESMExports();const{refreshJobSuffixes}=await import(${JSON.stringify(new URL('./promote-images.mjs', import.meta.url).href)});try{refreshJobSuffixes(${JSON.stringify(root)});}catch(error){console.error(error.message);process.exitCode=1;}`,
  );
  try {
    for (const primary of [false, true]) {
      const result = spawnSync(process.execPath, [driver], {
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, PRIMARY: String(primary) },
      });
      assert.equal(result.status, 1);
      assert.equal(
        (result.stdout.match(/temporary cleanup attempted/g) ?? []).length,
        2,
      );
      assert.match(
        result.stderr,
        /Cleanup failure:.*Job suffix temporary cleanup/,
      );
      if (primary)
        assert.match(result.stderr, /primary promotion write failed/);
      else assert.match(result.stderr, /cleanup operation/);
      assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_/);
    }
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

function snapshotTransport(componentName) {
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
    component: componentName,
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

test('component snapshot accepts genuine unreleased main without a fabricated global release', async () => {
  const fixture = snapshotTransport('inventory');
  const snapshot = await fixture.gateway.readSnapshot(release.sourceRevision);
  assert.deepEqual(snapshot.records, {});
});

test('GitHub snapshot rejects content not matching its parent blob object ID', async () => {
  const fixture = snapshotTransport();
  fixture.tamper();
  await assert.rejects(
    fixture.gateway.readSnapshot(release.sourceRevision),
    /blob|parent/,
  );
});

test('first promotion branches remain managed on rerun with quoted unreleased Job suffixes', async () => {
  const changes = [
    ["'-unreleased'", '-1ba05fd4ba467463', true],
    ['"-unreleased"', '"-1ba05fd4ba467463"', true],
    ['-unreleased', "'-1ba05fd4ba467463'", true],
    ["'-unreleased'", '\'-1ba05fd4ba467463"', false],
    ['\'-unreleased"', '-1ba05fd4ba467463', false],
    ["'-unreleased'", "'-arbitrary'", false],
    ["'-unreleased'", '-1ba05fd4ba467463\n+resources: []', false],
  ];
  for (const component of [
    undefined,
    'database-bootstrap',
    'identity-bootstrap',
  ]) {
    for (const [previous, next, managed] of changes) {
      let existing = false;
      const base = 'a'.repeat(40);
      const head = 'd'.repeat(40);
      const names = component
        ? [component.split('-')[0]]
        : ['database', 'identity'];
      const gateway = githubGateway({
        repository: 'example/equipment',
        component,
        token: 'private',
        request: async (url) => {
          let data;
          if (url.endsWith('/heads/main')) data = { object: { sha: base } };
          else if (url.includes('/git/ref/')) {
            if (!existing) return { ok: false, status: 404 };
            data = { object: { sha: head } };
          } else
            data = {
              behind_by: 0,
              merge_base_commit: { sha: base },
              ahead_by: 1,
              commits: [
                {
                  sha: head,
                  author: { login: 'github-actions[bot]' },
                  commit: {
                    message:
                      'chore: promote local application images\n\nSource: ' +
                      base,
                  },
                },
              ],
              files: names.map((name) => ({
                filename: `deploy/environments/local/jobs/${name}/kustomization.yaml`,
                status: 'modified',
                patch: `@@ -3,4 +3,4 @@\n-nameSuffix: ${previous}\n+nameSuffix: ${next}`,
              })),
            };
          return { ok: true, status: 200, json: async () => data };
        },
      });
      assert.deepEqual(await gateway.readState(), {
        base,
        head: null,
        managed: true,
      });
      existing = true;
      const rerun = await gateway.readState();
      assert.equal(rerun.head, head);
      assert.equal(
        rerun.managed,
        managed,
        `${component ?? 'legacy release'}: ${previous} -> ${next}`,
      );
    }
  }
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

const component = {
  schemaVersion: 1,
  component: 'inventory',
  repository: { id: 123, name: 'example/equipment' },
  sourceRevision: 'd'.repeat(40),
  sourceRef: 'refs/heads/feature/testing',
  runId: 456,
  runAttempt: 1,
  workflow: '.github/workflows/validate.yaml',
  image: 'ghcr.io/example/equipment-inventory',
  digest: `sha256:${'e'.repeat(64)}`,
};

test('generated promotion files satisfy repository formatting for initial and successive component updates', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const overlayPath = 'deploy/environments/local/kustomization.yaml';
  const initial = readFileSync(join(root, overlayPath), 'utf8');
  const options = JSON.parse(
    readFileSync(join(root, '.prettierrc.json'), 'utf8'),
  );
  const inputs = readJobInputs(root);
  let overlay = initial;
  for (const name of imageNames) {
    const record = {
      ...component,
      component: name,
      image: `ghcr.io/example/equipment-${name}`,
    };
    const files = promotionFiles(record, overlay, inputs);
    for (const [path, content] of Object.entries(files))
      assert.equal(
        await check(content, { ...options, filepath: join(root, path) }),
        true,
        path,
      );
    overlay = files[overlayPath];
  }
  for (const [path, content] of Object.entries(
    promotionFiles(release, initial, inputs),
  ))
    assert.equal(
      await check(content, { ...options, filepath: join(root, path) }),
      true,
      path,
    );
});

test('independent component promotion preserves siblings and touches only its own bootstrap identity', () => {
  const overlay =
    'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nimages: [{name: web, newName: ghcr.io/example/equipment-web, digest: sha256:old}]\n';
  const files = promotionFiles(component, overlay, jobInputs);
  assert.deepEqual(Object.keys(files).sort(), [
    'deploy/environments/local/kustomization.yaml',
    'deploy/environments/local/releases/inventory.json',
  ]);
  assert.match(
    files['deploy/environments/local/kustomization.yaml'],
    /sha256:old/,
  );
  const database = {
    ...component,
    component: 'database-bootstrap',
    image: 'ghcr.io/example/equipment-database-bootstrap',
  };
  const bootstrap = promotionFiles(database, overlay, jobInputs);
  assert.deepEqual(Object.keys(bootstrap).sort(), [
    'deploy/environments/local/jobs/database/kustomization.yaml',
    'deploy/environments/local/kustomization.yaml',
    'deploy/environments/local/releases/database-bootstrap.json',
  ]);
  assert.match(
    bootstrap['deploy/environments/local/jobs/database/kustomization.yaml'],
    /nameSuffix: -[a-f0-9]{16}/,
  );
});

function intentFor(record, target = null, proposal = null) {
  return {
    schemaVersion: 1,
    repository: record.repository,
    sourceRevision: record.sourceRevision,
    sourceRef: record.sourceRef,
    event: 'workflow_dispatch',
    runId: record.runId,
    runAttempt: 1,
    workflow: record.workflow,
    selected: [record.component],
    components: Object.fromEntries(
      imageNames.map((name) => [
        name,
        {
          target: name === record.component ? target : null,
          proposal: name === record.component ? proposal : null,
        },
      ]),
    ),
  };
}

function independentGateway() {
  const writes = [];
  const snapshot = {
    revision: 'f'.repeat(40),
    records: {},
    kustomization: readFileSync(
      'deploy/environments/local/kustomization.yaml',
      'utf8',
    ),
    jobInputs: {
      baseConfiguration: readFileSync('deploy/base/configuration.yaml', 'utf8'),
      localConfiguration: readFileSync(
        'deploy/environments/local/configuration.yaml',
        'utf8',
      ),
      jobs: Object.fromEntries(
        ['database', 'identity'].map((name) => [
          name,
          {
            template: readFileSync(`deploy/base/jobs/${name}/job.yaml`, 'utf8'),
            wrapper: readFileSync(
              `deploy/environments/local/jobs/${name}/kustomization.yaml`,
              'utf8',
            ),
          },
        ]),
      ),
    },
  };
  return {
    writes,
    snapshot,
    readState: async () => ({
      base: snapshot.revision,
      head: null,
      managed: true,
    }),
    readSnapshot: async () => snapshot,
    isAncestor: async () => false,
    commit: async (files, parent, message) => {
      writes.push({ files, parent, message });
      return 'a'.repeat(40);
    },
    compareAndSwap: async (expected, sha) => writes.push({ expected, sha }),
    ensurePullRequest: async () => ({ number: 9 }),
  };
}

test('manual divergent component source proposes from fresh main independently of sibling publication', async () => {
  const gateway = independentGateway();
  const result = await promote({
    release: component,
    intent: intentFor(component),
    gateway,
  });
  assert.equal(result.number, 9);
  assert.equal(gateway.writes[0].parent, 'f'.repeat(40));
  assert.deepEqual(Object.keys(gateway.writes[0].files).sort(), [
    'deploy/environments/local/kustomization.yaml',
    'deploy/environments/local/releases/inventory.json',
  ]);
  assert.match(gateway.writes[0].message, /feature\/testing/);
});

test('an unselected component cannot promote using another component run intent', async () => {
  const gateway = independentGateway();
  const intent = intentFor(component);
  intent.selected = [];
  await assert.rejects(
    promote({ release: component, intent, gateway }),
    /not selected/,
  );
  assert.deepEqual(gateway.writes, []);
});

test('unchanged deployed digest is a no-op and stale same-component intent cannot mutate', async () => {
  const gateway = independentGateway();
  gateway.snapshot.records.inventory = component;
  const files = promotionFiles(
    component,
    gateway.snapshot.kustomization,
    gateway.snapshot.jobInputs,
  );
  gateway.snapshot.kustomization =
    files['deploy/environments/local/kustomization.yaml'];
  const result = await promote({
    release: component,
    intent: intentFor(component, component),
    gateway,
  });
  assert.equal(result.status, 'noop');
  assert.deepEqual(gateway.writes, []);
  await assert.rejects(
    promote({ release: component, intent: intentFor(component), gateway }),
    /target changed/,
  );
  assert.deepEqual(gateway.writes, []);
});

test('captured proposal record and source freshness reject obsolete candidates before writes', async () => {
  for (const problem of ['changed-record', 'newer-source']) {
    const gateway = independentGateway();
    const previous = {
      ...component,
      sourceRevision: 'c'.repeat(40),
      digest: `sha256:${'c'.repeat(64)}`,
    };
    const proposal = { head: 'b'.repeat(40), record: previous };
    gateway.readState = async () => ({
      base: gateway.snapshot.revision,
      head: proposal.head,
      managed: true,
    });
    gateway.readSnapshot = async (revision) =>
      revision === proposal.head
        ? {
            ...gateway.snapshot,
            revision,
            records: {
              inventory:
                problem === 'changed-record'
                  ? { ...previous, runId: 999 }
                  : previous,
            },
          }
        : gateway.snapshot;
    gateway.isAncestor = async () => problem === 'newer-source';
    await assert.rejects(
      promote({
        release: component,
        intent: intentFor(component, null, proposal),
        gateway,
      }),
      /proposal record|obsolete/,
    );
    assert.deepEqual(gateway.writes, []);
  }
});

test('component GitHub transport isolates its managed branch and merge commit uses fresh main tree', async () => {
  const calls = [];
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    token: 'private',
    request: async (url, options) => {
      calls.push({ url, options });
      let data = {};
      if (url.endsWith('/git/ref/heads/main'))
        data = { object: { sha: 'f'.repeat(40) } };
      else if (url.includes('/git/ref/heads/'))
        return { ok: false, status: 404 };
      else if (url.includes('/git/commits/'))
        data = { tree: { sha: 'c'.repeat(40) } };
      else if (url.endsWith('/git/trees')) data = { sha: 'b'.repeat(40) };
      else if (url.endsWith('/git/commits')) data = { sha: 'a'.repeat(40) };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  await gateway.readState();
  assert.match(
    calls[1].url,
    /heads\/automation\/local-image-promotion-inventory$/,
  );
  const files = promotionFiles(component, 'images: []\n', jobInputs);
  await gateway.commit(files, 'b'.repeat(40), 'message', {
    treeParent: 'f'.repeat(40),
    mergeParent: 'f'.repeat(40),
  });
  const tree = JSON.parse(
    calls.find((call) => call.url.endsWith('/git/trees')).options.body,
  );
  assert.equal(tree.base_tree, 'c'.repeat(40));
  const commit = JSON.parse(
    calls.find((call) => call.url.endsWith('/git/commits')).options.body,
  );
  assert.deepEqual(commit.parents, ['b'.repeat(40), 'f'.repeat(40)]);
});

test('configuration refresh updates only available bootstrap records without inventing sibling releases', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-refresh-'));
  try {
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    for (const path of [
      'deploy/environments/local/kustomization.yaml',
      'deploy/base/configuration.yaml',
      'deploy/environments/local/configuration.yaml',
      ...['database', 'identity'].flatMap((name) => [
        `deploy/base/jobs/${name}/job.yaml`,
        `deploy/environments/local/jobs/${name}/kustomization.yaml`,
      ]),
    ])
      write(path, readFileSync(path, 'utf8'));
    const record = {
      ...component,
      component: 'database-bootstrap',
      image: 'ghcr.io/example/equipment-database-bootstrap',
    };
    const files = promotionFiles(
      record,
      readFileSync(
        join(root, 'deploy/environments/local/kustomization.yaml'),
        'utf8',
      ),
      {
        baseConfiguration: readFileSync(
          'deploy/base/configuration.yaml',
          'utf8',
        ),
        localConfiguration: readFileSync(
          'deploy/environments/local/configuration.yaml',
          'utf8',
        ),
        jobs: Object.fromEntries(
          ['database', 'identity'].map((name) => [
            name,
            {
              template: readFileSync(
                `deploy/base/jobs/${name}/job.yaml`,
                'utf8',
              ),
              wrapper: readFileSync(
                `deploy/environments/local/jobs/${name}/kustomization.yaml`,
                'utf8',
              ),
            },
          ]),
        ),
      },
    );
    for (const [path, text] of Object.entries(files)) write(path, text);
    const database = join(
      root,
      'deploy/environments/local/jobs/database/kustomization.yaml',
    );
    const identity = join(
      root,
      'deploy/environments/local/jobs/identity/kustomization.yaml',
    );
    const before = readFileSync(database, 'utf8');
    const identityBefore = readFileSync(identity, 'utf8');
    write(
      'deploy/environments/local/configuration.yaml',
      readFileSync('deploy/environments/local/configuration.yaml', 'utf8') +
        '\n# changed\n',
    );
    assert.deepEqual(refreshJobSuffixes(root), [
      'deploy/environments/local/jobs/database/kustomization.yaml',
    ]);
    assert.notEqual(readFileSync(database, 'utf8'), before);
    assert.equal(readFileSync(identity, 'utf8'), identityBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('promotion CLI rejects untrusted events before image or authenticated GitHub access', () => {
  const root = mkdtempSync(join(tmpdir(), 'component-cli-'));
  try {
    const record = join(root, 'component-result.json');
    const intent = join(root, 'run-intent.json');
    writeFileSync(record, JSON.stringify({ record: component, index: {} }));
    writeFileSync(intent, JSON.stringify(intentFor(component)));
    const result = spawnSync(
      process.execPath,
      ['scripts/promote-images.mjs', record, intent],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REF: component.sourceRef,
          GITHUB_SHA: component.sourceRevision,
          GITHUB_REPOSITORY: 'example/equipment',
          GITHUB_REPOSITORY_ID: '123',
          GITHUB_RUN_ID: '456',
          GITHUB_RUN_ATTEMPT: '1',
          GH_TOKEN: 'PRIVATE_TOKEN',
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /trusted repository branch invocation/);
    assert.doesNotMatch(result.stderr, /docker|PRIVATE_TOKEN/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a managed component proposal cannot conceal edits to another component', async () => {
  const gateway = independentGateway();
  const old = { ...component, sourceRevision: 'c'.repeat(40) };
  const web = {
    ...component,
    component: 'web',
    image: 'ghcr.io/example/equipment-web',
  };
  const head = 'b'.repeat(40);
  gateway.readState = async () => ({
    base: gateway.snapshot.revision,
    head,
    managed: true,
  });
  const proposalFiles = promotionFiles(
    web,
    gateway.snapshot.kustomization,
    gateway.snapshot.jobInputs,
  );
  gateway.readSnapshot = async (revision) =>
    revision === head
      ? {
          ...gateway.snapshot,
          revision,
          records: { inventory: old, web },
          kustomization:
            proposalFiles['deploy/environments/local/kustomization.yaml'],
        }
      : gateway.snapshot;
  await assert.rejects(
    promote({
      release: component,
      intent: intentFor(component, null, { head, record: old }),
      gateway,
    }),
    /unrelated component/,
  );
  assert.deepEqual(gateway.writes, []);
});

test('managed component branch remains refreshable after unrelated main advancement', async () => {
  const base = 'f'.repeat(40),
    head = 'b'.repeat(40),
    merge = 'a'.repeat(40);
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    token: 'private',
    request: async (url) => {
      let data;
      if (url.endsWith('/heads/main')) data = { object: { sha: base } };
      else if (url.includes('/git/ref/')) data = { object: { sha: head } };
      else
        data = {
          behind_by: 1,
          merge_base_commit: { sha: merge },
          ahead_by: 1,
          commits: [
            {
              sha: head,
              author: { login: 'github-actions[bot]' },
              commit: {
                message:
                  'chore: promote local application images\n\nComponent: inventory',
              },
            },
          ],
          files: [
            {
              filename: 'deploy/environments/local/releases/inventory.json',
              status: 'added',
            },
          ],
        };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  const state = await gateway.readState();
  assert.equal(state.managed, true);
  assert.equal(state.proposalBase, merge);
});

test('target or proposal movement during commit creation stops before updating a remote ref', async () => {
  const gateway = independentGateway();
  let moved = false,
    refWritten = false;
  gateway.readState = async () => ({
    base: moved ? 'b'.repeat(40) : gateway.snapshot.revision,
    head: null,
    managed: true,
  });
  gateway.commit = async () => {
    moved = true;
    return 'c'.repeat(40);
  };
  gateway.compareAndSwap = async () => {
    refWritten = true;
  };
  await assert.rejects(
    promote({ release: component, intent: intentFor(component), gateway }),
    /changed before ref/,
  );
  assert.equal(refWritten, false);
});

test('GitHub lineage inspection fails closed on malformed ancestry and recognizes only proven ancestry', async () => {
  for (const [data, expected] of [
    [{ status: 'ahead', merge_base_commit: { sha: 'a'.repeat(40) } }, true],
    [{ status: 'diverged', merge_base_commit: { sha: 'c'.repeat(40) } }, false],
    [{}, null],
  ]) {
    const gateway = githubGateway({
      repository: 'example/equipment',
      component: 'inventory',
      token: 'PRIVATE_TOKEN',
      request: async () => ({ ok: true, status: 200, json: async () => data }),
    });
    if (expected === null)
      await assert.rejects(
        gateway.isAncestor('a'.repeat(40), 'b'.repeat(40)),
        /lineage response/,
      );
    else
      assert.equal(
        await gateway.isAncestor('a'.repeat(40), 'b'.repeat(40)),
        expected,
      );
  }
});

test('CP-S002 rejects ancestor rollback from another branch against deployed and proposed components', async (t) => {
  for (const location of ['target', 'proposal']) {
    await t.test(location, async () => {
      const gateway = independentGateway();
      const newer = {
        ...component,
        sourceRef: 'refs/heads/renamed-branch',
        sourceRevision: 'c'.repeat(40),
        digest: `sha256:${'c'.repeat(64)}`,
      };
      const head = 'b'.repeat(40);
      const updated = promotionFiles(
        newer,
        gateway.snapshot.kustomization,
        gateway.snapshot.jobInputs,
      )['deploy/environments/local/kustomization.yaml'];
      let intent;
      if (location === 'target') {
        gateway.snapshot.records.inventory = newer;
        gateway.snapshot.kustomization = updated;
        intent = intentFor(component, newer);
      } else {
        gateway.readState = async () => ({
          base: gateway.snapshot.revision,
          head,
          managed: true,
        });
        gateway.readSnapshot = async (revision) =>
          revision === head
            ? {
                ...gateway.snapshot,
                revision,
                records: { inventory: newer },
                kustomization: updated,
              }
            : gateway.snapshot;
        intent = intentFor(component, null, { head, record: newer });
      }
      gateway.isAncestor = async () => true;
      await assert.rejects(
        promote({ release: component, intent, gateway }),
        /obsolete/,
        location,
      );
      assert.deepEqual(gateway.writes, [], location);
    });
  }
});

test('a genuinely divergent manual branch can propose over a captured component target', async () => {
  const gateway = independentGateway();
  const deployed = {
    ...component,
    sourceRef: 'refs/heads/main',
    sourceRevision: 'c'.repeat(40),
    digest: `sha256:${'c'.repeat(64)}`,
  };
  gateway.snapshot.records.inventory = deployed;
  gateway.snapshot.kustomization = promotionFiles(
    deployed,
    gateway.snapshot.kustomization,
    gateway.snapshot.jobInputs,
  )['deploy/environments/local/kustomization.yaml'];
  gateway.isAncestor = async () => false;
  const result = await promote({
    release: component,
    intent: intentFor(component, deployed),
    gateway,
  });
  assert.equal(result.number, 9);
  assert.equal(
    JSON.parse(
      gateway.writes[0].files[
        'deploy/environments/local/releases/inventory.json'
      ],
    ).sourceRef,
    component.sourceRef,
  );
});
