import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readFileSync,
  mkdtempSync,
  cpSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { imagePatch, readImageReference } from './component-images.mjs';
import { validateStaticDeployment } from './manifest-quality.mjs';
import { promotionFiles, promote, githubGateway } from './promote-images.mjs';
import { readJobInputs } from './deployment-validation.mjs';

const root = new URL('../', import.meta.url);
const overlay = readFileSync(
  new URL('deploy/environments/local/kustomization.yaml', root),
  'utf8',
);
const jobs = readJobInputs(fileURLToPath(root));
const record = (name) => ({
  schemaVersion: 1,
  component: name,
  repository: { id: 123, name: 'example/equipment' },
  sourceRevision: 'd'.repeat(40),
  sourceRef: 'refs/heads/feature/testing',
  runId: 456,
  runAttempt: 1,
  workflow: '.github/workflows/validate.yaml',
  image: `ghcr.io/example/equipment-${name}`,
  digest: `sha256:${'e'.repeat(64)}`,
});
const names = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const intent = (release) => ({
  schemaVersion: 1,
  repository: release.repository,
  sourceRevision: release.sourceRevision,
  sourceRef: release.sourceRef,
  runId: release.runId,
  runAttempt: 1,
  workflow: release.workflow,
  event: 'workflow_dispatch',
  selected: [release.component],
  components: Object.fromEntries(
    names.map((name) => [name, { target: null, proposal: null }]),
  ),
});

test('independent promotions never edit a shared image file', () => {
  const ownership = new Set();
  for (const name of names) {
    const files = promotionFiles(record(name), overlay, jobs);
    assert.ok(
      Object.hasOwn(files, `deploy/environments/local/images/${name}.yaml`),
    );
    for (const path of Object.keys(files)) {
      assert.ok(
        !ownership.has(path),
        `overlapping component ownership: ${path}`,
      );
      ownership.add(path);
    }
  }
});

function boundary() {
  const calls = [];
  const snapshot = {
    revision: 'f'.repeat(40),
    records: {},
    kustomization: overlay,
    jobInputs: jobs,
  };
  return {
    calls,
    snapshot,
    readState: async () => ({
      base: snapshot.revision,
      head: null,
      managed: true,
    }),
    readSnapshot: async () => snapshot,
    isAncestor: async () => false,
    validateCandidate: async () => calls.push('validate'),
    commit: async (files, parent) => {
      calls.push({ files, parent });
      return 'a'.repeat(40);
    },
    compareAndSwap: async (expected, sha) => calls.push({ expected, sha }),
    ensurePullRequest: async () => {
      assert.fail('direct promotion must never create a PR');
    },
  };
}

test('direct promotion validates before committing and atomically updates exact main', async () => {
  const gateway = boundary();
  const release = record('inventory');
  const result = await promote({ release, intent: intent(release), gateway });
  assert.equal(result.status, 'promoted');
  assert.equal(gateway.calls[0], 'validate');
  assert.equal(gateway.calls[1].parent, 'f'.repeat(40));
  assert.deepEqual(gateway.calls[2], {
    expected: 'f'.repeat(40),
    sha: 'a'.repeat(40),
  });
});

test('invalid candidate never creates a commit or changes main', async () => {
  const gateway = boundary();
  gateway.validateCandidate = async () => {
    throw new Error('invalid manifest candidate');
  };
  const release = record('inventory');
  await assert.rejects(
    promote({ release, intent: intent(release), gateway }),
    /invalid manifest candidate/,
  );
  assert.deepEqual(gateway.calls, []);
});

test('GitHub component ref update targets main without force or promotion branch requests', async () => {
  const requests = [];
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    token: 'PRIVATE_TOKEN',
    request: async (url, options) => {
      requests.push({ url, options });
      const data = url.endsWith('/heads/main')
        ? { object: { sha: 'f'.repeat(40) } }
        : url.endsWith('/graphql')
          ? { data: { updateRefs: {} } }
          : { node_id: 'repository-id' };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  await gateway.readState();
  await gateway.compareAndSwap('f'.repeat(40), 'a'.repeat(40));
  const update = JSON.parse(
    requests.find((call) => call.url.endsWith('/graphql')).options.body,
  ).variables.input.refUpdates[0];
  assert.deepEqual(update, {
    name: 'refs/heads/main',
    beforeOid: 'f'.repeat(40),
    afterOid: 'a'.repeat(40),
    force: false,
  });
  assert.ok(requests.every((call) => !/automation|\/pulls/.test(call.url)));
});

test('image patches reject extra fields, wrong targets and mutable image references', () => {
  const valid = imagePatch(
    'inventory',
    `${record('inventory').image}@${record('inventory').digest}`,
  );
  assert.equal(
    readImageReference('inventory', valid),
    `${record('inventory').image}@${record('inventory').digest}`,
  );
  for (const changed of [
    valid + 'unexpected: true\n',
    valid.replace('name: inventory', 'name: reservations'),
    valid.replace(/@sha256:[a-f0-9]{64}/, ':latest'),
  ])
    assert.throws(() => readImageReference('inventory', changed), /patch/);
});

test('GitHub authorization rejection is actionable without exposing private response details', async () => {
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    token: 'PRIVATE_TOKEN',
    request: async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/graphql')
          ? {
              errors: [
                { type: 'FORBIDDEN', message: 'PRIVATE_PROVIDER_RESPONSE' },
              ],
            }
          : { node_id: 'repository-id' },
    }),
  });
  await assert.rejects(
    gateway.compareAndSwap('f'.repeat(40), 'a'.repeat(40)),
    (error) => {
      assert.match(error.message, /authorization rejected/);
      assert.doesNotMatch(error.message, /PRIVATE/);
      return true;
    },
  );
});

test(
  'real Git promotions in either order preserve both digests and the root overlay',
  { skip: !process.env.MANIFEST_KUBECTL },
  async () => {
    for (const order of [
      ['inventory', 'reservations'],
      ['reservations', 'inventory'],
    ]) {
      const directory = mkdtempSync(join(tmpdir(), 'direct-promotion-git-'));
      try {
        cpSync(new URL('deploy', root), join(directory, 'deploy'), {
          recursive: true,
        });
        const git = (...args) =>
          execFileSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();
        git('init', '-q', '-b', 'main');
        git('config', 'user.name', 'Promotion tests');
        git('config', 'user.email', 'promotion@example.invalid');
        git('add', 'deploy');
        git('commit', '-qm', 'initial');
        const before = git(
          'show',
          'main:deploy/environments/local/kustomization.yaml',
        );
        const gateway = {
          readState: async () => ({ base: git('rev-parse', 'main') }),
          readSnapshot: async (revision) => ({
            revision,
            kustomization:
              git(
                'show',
                `${revision}:deploy/environments/local/kustomization.yaml`,
              ) + '\n',
            jobInputs: readJobInputs(directory),
            records: Object.fromEntries(
              git(
                'ls-tree',
                '-r',
                '--name-only',
                revision,
                'deploy/environments/local/releases',
              )
                .split('\n')
                .filter(Boolean)
                .map((path) => {
                  const value = JSON.parse(git('show', `${revision}:${path}`));
                  return [value.component, value];
                }),
            ),
          }),
          isAncestor: async () => false,
          validateCandidate: async (files) => {
            for (const [path, text] of Object.entries(files)) {
              mkdirSync(dirname(join(directory, path)), { recursive: true });
              writeFileSync(join(directory, path), text);
            }
            await validateStaticDeployment({
              root: directory,
              kubectl: process.env.MANIFEST_KUBECTL,
            });
          },
          commit: async (files, parent, message) => {
            git('add', '--', ...Object.keys(files));
            return git(
              'commit-tree',
              git('write-tree'),
              '-p',
              parent,
              '-m',
              message,
            );
          },
          compareAndSwap: async (expected, sha) =>
            git('update-ref', 'refs/heads/main', sha, expected),
        };
        for (const name of order) {
          const release = record(name);
          assert.equal(
            (await promote({ release, intent: intent(release), gateway }))
              .status,
            'promoted',
          );
        }
        for (const name of order) {
          const release = record(name);
          assert.equal(
            readImageReference(
              name,
              git('show', `main:deploy/environments/local/images/${name}.yaml`),
            ),
            `${release.image}@${release.digest}`,
          );
        }
        assert.equal(
          git('show', 'main:deploy/environments/local/kustomization.yaml'),
          before,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);

test(
  'production candidate validation renders exact public files and rejects invalid output before GitHub mutation',
  { skip: !process.env.MANIFEST_KUBECTL },
  async () => {
    const directory = fileURLToPath(root);
    const publicFiles = Object.fromEntries(
      ['deploy/base', 'deploy/environments/local'].flatMap((prefix) =>
        readdirSync(join(directory, prefix), {
          recursive: true,
          withFileTypes: true,
        })
          .filter((entry) => entry.isFile())
          .map((entry) => {
            const path = join(entry.parentPath, entry.name);
            return [
              path.slice(directory.length).replaceAll('\\', '/'),
              readFileSync(path, 'utf8'),
            ];
          }),
      ),
    );
    const gateway = githubGateway({
      repository: 'example/equipment',
      component: 'inventory',
      token: 'PRIVATE_TOKEN',
      kubectl: process.env.MANIFEST_KUBECTL,
      request: async () =>
        assert.fail('candidate validation must not mutate GitHub'),
    });
    const files = promotionFiles(record('inventory'), overlay, jobs);
    const result = await gateway.validateCandidate(files, { publicFiles });
    assert.equal(result.status, 'partial');
    await assert.rejects(
      gateway.validateCandidate(
        {
          ...files,
          'deploy/environments/local/images/inventory.yaml':
            files['deploy/environments/local/images/inventory.yaml'] +
            'unexpected: true\n',
        },
        { publicFiles },
      ),
      /patch shape/,
    );
  },
);
