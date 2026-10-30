import { imagePatch, imagePatchPath } from './component-images.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawnSync, execFileSync } from 'node:child_process';
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check } from 'prettier';
import {
  promotionFiles,
  promote,
  githubGateway,
  refreshJobSuffixes,
  proposeAzure,
  validateAzurePublication,
} from './promote-images.mjs';
import { imageNames, readJobInputs } from './deployment-validation.mjs';

test('Azure publication validation binds exact registry, repository and workload patch with safe malformed-input errors', () => {
  const source = {
    schemaVersion: 1,
    component: 'inventory',
    repository: { id: 123, name: 'example/equipment' },
    sourceRevision: 'd'.repeat(40),
    sourceRef: 'refs/heads/main',
    runId: 456,
    runAttempt: 1,
    workflow: '.github/workflows/validate.yaml',
    image: 'ghcr.io/example/equipment-inventory',
    digest: `sha256:${'e'.repeat(64)}`,
  };
  const publication = {
    schemaVersion: 1,
    source,
    image: 'learning.azurecr.io/equipment-inventory',
    digest: source.digest,
  };
  const options = {
    acrLoginServer: 'learning.azurecr.io',
    repository: source.repository,
    patch: imagePatch(
      'inventory',
      `${publication.image}@${publication.digest}`,
    ),
  };
  assert.equal(validateAzurePublication(publication, options), publication);
  for (const invalid of [
    { ...publication, image: 42 },
    { ...publication, digest: `sha256:${'f'.repeat(64)}` },
    { ...publication, unknown: true },
    { ...publication, source: { ...source, sourceRef: 'refs/heads/feature' } },
  ])
    assert.throws(
      () => validateAzurePublication(invalid, options),
      /Invalid Azure component publication/,
    );
  for (const invalidOptions of [
    { ...options, acrLoginServer: 'other.azurecr.io' },
    { ...options, repository: { ...source.repository, id: 999 } },
    {
      ...options,
      patch: imagePatch('web', `${publication.image}@${publication.digest}`),
    },
  ])
    assert.throws(
      () => validateAzurePublication(publication, invalidOptions),
      /Invalid Azure component publication/,
    );
});

test('lost operation lease prevents authenticated GitHub requests before a proposal mutation', async () => {
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    azure: true,
    token: 'PRIVATE',
    signal: globalThis.AbortSignal.abort(),
    request: async () => assert.fail('lost lease must not access GitHub'),
  });
  await assert.rejects(gateway.readState(), /cancel|lease/i);
});

test('verified Azure publication creates a review branch and PR without updating main', async () => {
  const writes = [];
  const source = {
    schemaVersion: 1,
    component: 'inventory',
    repository: { id: 123, name: 'example/equipment' },
    sourceRevision: 'd'.repeat(40),
    sourceRef: 'refs/heads/main',
    runId: 456,
    runAttempt: 1,
    workflow: '.github/workflows/validate.yaml',
    image: 'ghcr.io/example/equipment-inventory',
    digest: `sha256:${'e'.repeat(64)}`,
  };
  const gateway = githubGateway({
    repository: source.repository.name,
    component: source.component,
    azure: true,
    token: 'PRIVATE_TOKEN',
    request: async (url, options) => {
      const body = options.body && JSON.parse(options.body);
      if (options.method !== 'GET') writes.push({ url, body });
      let status = 200;
      let value;
      if (url.endsWith('/git/ref/heads/main'))
        value = { object: { sha: 'a'.repeat(40) } };
      else if (url.includes('/git/ref/heads/automation/')) {
        status = 404;
        value = {};
      } else if (url.includes('/git/commits/') && options.method === 'GET')
        value = { sha: 'a'.repeat(40), tree: { sha: 'b'.repeat(40) } };
      else if (url.includes('/git/trees/') && options.method === 'GET')
        value = { sha: 'b'.repeat(40), tree: [] };
      else if (url.endsWith('/git/trees')) value = { sha: 'c'.repeat(40) };
      else if (url.endsWith('/git/commits')) value = { sha: 'f'.repeat(40) };
      else if (url.endsWith('/graphql')) value = { data: { updateRefs: {} } };
      else if (url.includes('/pulls?')) value = [];
      else if (url.endsWith('/pulls')) value = { number: 42 };
      else value = { node_id: 'repo-node' };
      return { ok: status === 200, status, json: async () => value };
    },
  });
  const result = await proposeAzure({
    publication: {
      schemaVersion: 1,
      source,
      image: 'learning.azurecr.io/equipment-inventory',
      digest: source.digest,
    },
    gateway,
  });
  assert.equal(result.number, 42);
  const tree = writes.find((call) => call.url.endsWith('/git/trees')).body.tree;
  assert.deepEqual(tree.map((file) => file.path).sort(), [
    'deploy/environments/azure/images/inventory.yaml',
    'deploy/environments/azure/releases/inventory.json',
  ]);
  assert.match(
    tree.find((file) => file.path.endsWith('.yaml')).content,
    /learning\.azurecr\.io\/equipment-inventory@sha256:/,
  );
  const refs = writes.find((call) => call.url.endsWith('/graphql')).body
    .variables.input.refUpdates;
  assert.equal(refs.length, 1);
  assert.match(refs[0].name, /^refs\/heads\/automation\/azure-image-/);
  assert.equal(refs[0].beforeOid, '0'.repeat(40));
  assert.equal(refs[0].force, false);
  assert.equal(
    writes.find((call) => call.url.endsWith('/pulls')).body.base,
    'main',
  );
});

test('aggregate Azure proposal preserves prior verified components and rejects races or unowned branches before writes', async () => {
  for (const scenario of [
    'aggregate',
    'race',
    'unowned',
    'merged',
    'divergent',
  ]) {
    const source = {
      schemaVersion: 1,
      component: 'inventory',
      repository: { id: 123, name: 'example/equipment' },
      sourceRevision: 'd'.repeat(40),
      sourceRef: 'refs/heads/main',
      runId: 456,
      runAttempt: 1,
      workflow: '.github/workflows/validate.yaml',
      image: 'ghcr.io/example/equipment-inventory',
      digest: `sha256:${'e'.repeat(64)}`,
    };
    const prior = {
      ...source,
      component: scenario === 'divergent' ? 'inventory' : 'web',
      image:
        scenario === 'divergent'
          ? 'ghcr.io/example/equipment-inventory'
          : 'ghcr.io/example/equipment-web',
      digest:
        scenario === 'divergent' ? `sha256:${'f'.repeat(64)}` : source.digest,
    };
    const publication = (record) => ({
      schemaVersion: 1,
      source: record,
      image: `learning.azurecr.io/equipment-${record.component}`,
      digest: record.digest,
    });
    const priorFiles = {
      [`deploy/environments/azure/releases/${prior.component}.json`]: `${JSON.stringify(publication(prior), null, 2)}\n`,
      [`deploy/environments/azure/images/${prior.component}.yaml`]: imagePatch(
        prior.component,
        `learning.azurecr.io/equipment-${prior.component}@${prior.digest}`,
      ),
    };
    const writes = [];
    let reads = 0;
    const blobs = new Map(
      Object.entries(priorFiles).map(([path, text]) => {
        const bytes = Buffer.from(text);
        const sha = createHash('sha1')
          .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
          .digest('hex');
        return [sha, { path, text }];
      }),
    );
    const request = async (url, options) => {
      const body = options.body && JSON.parse(options.body);
      if (options.method !== 'GET') writes.push({ url, body });
      let value;
      if (url.endsWith('/git/ref/heads/main')) {
        reads++;
        value = {
          object: {
            sha:
              scenario === 'race' && reads > 1
                ? '9'.repeat(40)
                : 'a'.repeat(40),
          },
        };
      } else if (url.includes('/git/ref/heads/automation/'))
        value = { object: { sha: 'b'.repeat(40) } };
      else if (url.includes('/compare/'))
        value = {
          behind_by: 1,
          ahead_by: scenario === 'merged' ? 0 : 1,
          merge_base_commit: {
            sha: scenario === 'merged' ? 'b'.repeat(40) : 'c'.repeat(40),
          },
          commits:
            scenario === 'merged'
              ? []
              : [
                  {
                    sha: 'b'.repeat(40),
                    author: {
                      login:
                        scenario === 'unowned'
                          ? 'someone'
                          : 'github-actions[bot]',
                    },
                    commit: {
                      message: 'chore: propose Azure component images\n',
                    },
                  },
                ],
          files: Object.keys(priorFiles).map((filename) => ({
            filename,
            status: 'added',
          })),
        };
      else if (url.includes('/git/commits/') && options.method === 'GET') {
        const sha = url.split('/').at(-1);
        value = {
          sha,
          tree: {
            sha: sha === 'b'.repeat(40) ? '1'.repeat(40) : '2'.repeat(40),
          },
        };
      } else if (url.includes('/git/trees/') && options.method === 'GET') {
        const sha = url.split('/').at(-1).split('?')[0];
        value = {
          sha,
          tree:
            sha === '1'.repeat(40) || scenario === 'merged'
              ? [...blobs].map(([sha, { path }]) => ({
                  sha,
                  path,
                  type: 'blob',
                  mode: '100644',
                }))
              : [],
        };
      } else if (url.includes('/git/blobs/')) {
        const sha = url.split('/').at(-1);
        value = {
          sha,
          encoding: 'base64',
          content: Buffer.from(blobs.get(sha).text).toString('base64'),
        };
      } else if (url.endsWith('/git/trees')) value = { sha: 'f'.repeat(40) };
      else if (url.endsWith('/git/commits')) value = { sha: 'e'.repeat(40) };
      else if (url.endsWith('/graphql')) value = { data: { updateRefs: {} } };
      else if (url.includes('/pulls?')) value = [];
      else if (url.endsWith('/pulls')) value = { number: 42 };
      else value = { node_id: 'repo-node' };
      return { ok: true, status: 200, json: async () => value };
    };
    const gateway = githubGateway({
      repository: source.repository.name,
      component: 'inventory',
      azure: true,
      token: 'PRIVATE',
      request,
    });
    const action = proposeAzure({ publication: publication(source), gateway });
    if (
      scenario === 'race' ||
      scenario === 'unowned' ||
      scenario === 'divergent'
    ) {
      await assert.rejects(
        action,
        scenario === 'race'
          ? /changed/
          : scenario === 'divergent'
            ? /different.*source|source.*different|divergent/i
            : /not managed/,
      );
      assert.deepEqual(writes, []);
    } else {
      await action;
      const tree = writes.find((call) => call.url.endsWith('/git/trees')).body;
      assert.equal(tree.base_tree, '2'.repeat(40));
      assert.ok(tree.tree.some((file) => file.path.endsWith('/web.json')));
      assert.ok(
        tree.tree.some((file) => file.path.endsWith('/inventory.json')),
      );
      assert.equal(
        writes.find((call) => call.url.endsWith('/graphql')).body.variables
          .input.refUpdates[0].beforeOid,
        'b'.repeat(40),
      );
    }
  }
});

test('dual publication copies the proven digest, verifies both destinations and retries without rebuilding', (t) => {
  const fixture = dualRegistryFixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const publication = JSON.parse(readFileSync(fixture.output, 'utf8'));
    assert.equal(publication.digest, fixture.record.digest);
    assert.equal(publication.image, 'learning.azurecr.io/equipment-inventory');
    assert.deepEqual(publication.source, fixture.record);
  }
  const commands = fixture.commands();
  assert.equal(commands.filter((args) => args.includes('create')).length, 2);
  assert.ok(commands.every((args) => !args.includes('build')));
  assert.ok(
    commands
      .filter((args) => args.includes('create'))
      .every(
        (args) =>
          args.at(-1) === `${fixture.record.image}@${fixture.record.digest}`,
      ),
  );
  assert.equal(
    readFileSync(fixture.sentinel, 'utf8'),
    'unchanged deployment reference',
  );
});

test('dual publication fails closed on partial copy, manifest mismatch, missing platform or wrong source without private output', (t) => {
  const fixture = dualRegistryFixture(t);
  for (const failure of [
    'copy',
    'destination',
    'source',
    'platform',
    'labels',
  ]) {
    rmSync(fixture.output, { force: true });
    const result = fixture.run({
      REGISTRY_FAILURE: failure,
      REGISTRY_PROPOSE: 'true',
    });
    assert.equal(result.status, 1, failure);
    assert.match(
      result.stderr,
      /(?:registry|publication|index|source|platform)/i,
    );
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_REGISTRY/);
    assert.equal(fixture.outputExists(), false, failure);
    assert.ok(fixture.commands().every((args) => args[0] !== 'GITHUB_REQUEST'));
    assert.equal(
      readFileSync(fixture.sentinel, 'utf8'),
      'unchanged deployment reference',
    );
  }
});

test('dual publication rejects untrusted invocation and changed provenance before accessing registries', (t) => {
  const fixture = dualRegistryFixture(t);
  for (const changed of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/untrusted' },
    { GITHUB_SHA: 'f'.repeat(40) },
    { GITHUB_REPOSITORY_ID: '999' },
  ]) {
    const before = fixture.commands().length;
    const result = fixture.run(changed);
    assert.equal(result.status, 1);
    assert.equal(fixture.commands().length, before);
    assert.equal(fixture.outputExists(), false);
  }
});

test('ACR recreation reuses a committed reviewed release without current-run substitution or rebuild', (t) => {
  const fixture = dualRegistryFixture(t);
  const result = fixture.repopulate();
  assert.equal(result.status, 0, result.stderr);
  const publication = JSON.parse(readFileSync(fixture.output, 'utf8'));
  assert.deepEqual(publication.source, fixture.record);
  assert.equal(publication.digest, fixture.record.digest);
  assert.ok(fixture.commands().every((args) => !args.includes('build')));
});

test('registry authentication reports only safe status for real process success and failure', (t) => {
  const fixture = dualRegistryFixture(t);
  const success = fixture.login();
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /authentication ready/);
  const failure = fixture.login({ REGISTRY_FAILURE: 'login' });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /ACR federated registry login.*status=19/);
  assert.doesNotMatch(
    success.stdout + success.stderr + failure.stdout + failure.stderr,
    /PRIVATE_REGISTRY/,
  );
});

test('registry subprocess waits keep the operation lease heartbeat event loop responsive', (t) => {
  const fixture = dualRegistryFixture(t);
  const result = fixture.run({ REGISTRY_TICKS: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    fixture.commands().some((args) => args[0] === 'HEARTBEAT_TICK'),
    'lease heartbeat must run while registry child is active',
  );
});

test('remote publication verification scopes Docker credentials to child environment without changing caller environment', (t) => {
  const fixture = dualRegistryFixture(t);
  const result = fixture.run({
    REGISTRY_VERIFY_ENV: 'true',
    REGISTRY_EXPECTED_DOCKER_CONFIG: 'fixture-private-config',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('production publication CLI requires the shared private operation lease before any registry access', (t) => {
  const fixture = dualRegistryFixture(t);
  const result = fixture.production();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration|Private/);
  assert.deepEqual(fixture.commands(), []);
  assert.equal(fixture.outputExists(), false);
});

test('lost operation lease cancels an active registry child and prevents GitHub mutation', (t) => {
  const fixture = dualRegistryFixture(t);
  const result = fixture.run({
    REGISTRY_ABORT: 'true',
    REGISTRY_TICKS: 'true',
    REGISTRY_PROPOSE: 'true',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /cancel|failed/i);
  assert.ok(fixture.commands().some((args) => args.includes('create')));
  assert.ok(fixture.commands().every((args) => args[0] !== 'GITHUB_REQUEST'));
  assert.equal(fixture.outputExists(), false);
});

function dualRegistryFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dual-registry-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const index = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: ['amd64', 'arm64'].map((architecture, i) => ({
      digest: `sha256:${String(i + 1).repeat(64)}`,
      platform: { os: 'linux', architecture },
    })),
  };
  const raw = JSON.stringify(index);
  const record = {
    schemaVersion: 1,
    component: 'inventory',
    repository: { id: 123, name: 'example/equipment' },
    sourceRevision: 'd'.repeat(40),
    sourceRef: 'refs/heads/main',
    runId: 456,
    runAttempt: 1,
    workflow: '.github/workflows/validate.yaml',
    image: 'ghcr.io/example/equipment-inventory',
    digest: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
  };
  const intent = {
    schemaVersion: 1,
    repository: record.repository,
    sourceRevision: record.sourceRevision,
    sourceRef: record.sourceRef,
    runId: record.runId,
    runAttempt: 1,
    workflow: record.workflow,
    event: 'push',
    selected: ['inventory'],
    components: Object.fromEntries(
      imageNames.map((name) => [name, { target: null, proposal: null }]),
    ),
  };
  const resultPath = join(directory, 'component-result.json');
  const intentPath = join(directory, 'run-intent.json');
  const output = join(directory, 'publication.json');
  const calls = join(directory, 'calls.jsonl');
  const sentinel = join(directory, 'deployment-reference');
  writeFileSync(resultPath, JSON.stringify({ record, index }));
  writeFileSync(intentPath, JSON.stringify(intent));
  writeFileSync(sentinel, 'unchanged deployment reference');
  writeFileSync(calls, '');
  const provider = join(directory, 'registry.mjs');
  writeFileSync(
    provider,
    `import fs from 'node:fs';
const args=process.argv.slice(2);fs.appendFileSync(process.env.REGISTRY_CALLS,JSON.stringify(args)+'\\n');
const fail=process.env.REGISTRY_FAILURE;const acr=args.at(-1).includes('azurecr.io');
if(process.env.REGISTRY_EXPECTED_DOCKER_CONFIG&&process.env.DOCKER_CONFIG!==process.env.REGISTRY_EXPECTED_DOCKER_CONFIG){console.error('PRIVATE_REGISTRY_CONFIG');process.exit(31);}
if(args[0]==='login'){if(fail==='login'){console.log('PRIVATE_REGISTRY_TOKEN');console.error('PRIVATE_REGISTRY_ERROR');process.exit(19);}process.exit(0);}
if(args.includes('create')){if(fail==='copy'){console.error('PRIVATE_REGISTRY_TOKEN');process.exit(23);}if(process.env.REGISTRY_TICKS==='true')await new Promise(resolve=>setTimeout(resolve,200));process.exit(0);}
if(args.includes('--raw')){let index=${raw};if((fail==='destination'&&acr)||(fail==='source'&&!acr))index.extra='PRIVATE_REGISTRY_PAYLOAD';if(fail==='platform')index.manifests.pop();process.stdout.write(JSON.stringify(index));}
else {const architecture=args.at(-1).endsWith('2'.repeat(64))?'arm64':'amd64';process.stdout.write(JSON.stringify({os:'linux',architecture,config:{Labels:{'org.opencontainers.image.revision':fail==='labels'?'PRIVATE_REGISTRY_REVISION':'${record.sourceRevision}','org.opencontainers.image.source':'https://github.com/example/equipment'}}}));}`,
  );
  const preload = join(directory, 'preload.mjs');
  writeFileSync(
    preload,
    `import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=cp.execFileSync;const spawn=cp.spawn;let active=0;
const target=(command,args)=>command==='docker'?[${JSON.stringify(provider)},...args]:(command==='az'&&process.platform!=='win32'||command==='cmd.exe')?[${JSON.stringify(provider)},'login',...args]:null;
cp.execFileSync=(command,args,options)=>{const routed=target(command,args);if(!routed)return original(command,args,options);active++;try{return original(process.execPath,routed,options);}finally{active--;}};
cp.spawn=(command,args,options)=>{const routed=target(command,args);if(!routed)return spawn(command,args,options);active++;const child=spawn(process.execPath,routed,options);child.once('close',()=>active--);return child;};
if(process.env.REGISTRY_TICKS==='true')setInterval(()=>{if(active)fs.appendFileSync(process.env.REGISTRY_CALLS,JSON.stringify(['HEARTBEAT_TICK'])+'\\n');},30).unref();
syncBuiltinESMExports();globalThis.fetch=async()=>{fs.appendFileSync(process.env.REGISTRY_CALLS,JSON.stringify(['GITHUB_REQUEST'])+'\\n');throw new Error('PRIVATE_REGISTRY_GITHUB');};`,
  );
  const releaseDirectory = join(
    directory,
    'deploy/environments/azure/releases',
  );
  mkdirSync(releaseDirectory, { recursive: true });
  writeFileSync(
    join(releaseDirectory, 'inventory.json'),
    JSON.stringify({
      schemaVersion: 1,
      source: record,
      image: 'previous.azurecr.io/equipment-inventory',
      digest: record.digest,
    }),
  );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Registry fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', 'deploy');
  git('commit', '-qm', 'Reviewed original publication');
  const revision = git('rev-parse', 'HEAD');
  const driver = join(directory, 'command-driver.mjs');
  writeFileSync(
    driver,
    `import fs from 'node:fs';import {runPromotionCommand,verifyAzurePublication} from ${JSON.stringify(new URL('./promote-images.mjs', import.meta.url).href)};import {safeFailure} from ${JSON.stringify(new URL('./process.mjs', import.meta.url).href)};const controller=new AbortController();if(process.env.REGISTRY_ABORT==='true'){const watcher=setInterval(()=>{if(fs.readFileSync(process.env.REGISTRY_CALLS,'utf8').includes('"create"')){clearInterval(watcher);controller.abort();}},10);watcher.unref();}try{if(process.env.REGISTRY_VERIFY_ENV==='true'){const before=process.env.DOCKER_CONFIG;const source=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).record;await verifyAzurePublication({schemaVersion:1,source,image:'learning.azurecr.io/equipment-inventory',digest:source.digest},{env:{...process.env,DOCKER_CONFIG:process.env.REGISTRY_EXPECTED_DOCKER_CONFIG}});if(process.env.DOCKER_CONFIG!==before)throw Error('Caller environment changed');}else await runPromotionCommand({signal:controller.signal});}catch(error){console.error(safeFailure(error,'Publication failed'));process.exitCode=1;}`,
  );
  return {
    record,
    output,
    sentinel,
    production: () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(preload).href,
          fileURLToPath(new URL('./promote-images.mjs', import.meta.url)),
          'dual',
          resultPath,
          intentPath,
          'learning.azurecr.io',
          output,
        ],
        {
          encoding: 'utf8',
          timeout: 30000,
          env: {
            ...process.env,
            AZURE_CONFIG_PATH: '',
            AZURE_OUTPUTS_PATH: '',
            REGISTRY_CALLS: calls,
          },
        },
      ),
    login: (extra = {}) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(preload).href,
          fileURLToPath(new URL('./promote-images.mjs', import.meta.url)),
          'registry-login',
          'learning.azurecr.io',
        ],
        {
          encoding: 'utf8',
          timeout: 30000,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REF: 'refs/heads/main',
            REGISTRY_CALLS: calls,
            ...extra,
          },
        },
      ),
    repopulate: () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(preload).href,
          driver,
          'repopulate',
          'inventory',
          'learning.azurecr.io',
          output,
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30000,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_REF: 'refs/heads/main',
            GITHUB_SHA: revision,
            GITHUB_REPOSITORY: record.repository.name,
            GITHUB_REPOSITORY_ID: '123',
            REGISTRY_CALLS: calls,
          },
        },
      ),
    outputExists: () => {
      try {
        readFileSync(output);
        return true;
      } catch {
        return false;
      }
    },
    commands: () =>
      readFileSync(calls, 'utf8').split('\n').filter(Boolean).map(JSON.parse),
    run: (extra = {}) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(preload).href,
          driver,
          'dual',
          resultPath,
          intentPath,
          'learning.azurecr.io',
          output,
          ...(extra.REGISTRY_PROPOSE === 'true' ? ['--propose'] : []),
        ],
        {
          encoding: 'utf8',
          timeout: 30000,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REF: record.sourceRef,
            GITHUB_SHA: record.sourceRevision,
            GITHUB_REPOSITORY: record.repository.name,
            GITHUB_REPOSITORY_ID: '123',
            GITHUB_RUN_ID: '456',
            GITHUB_RUN_ATTEMPT: '1',
            REGISTRY_CALLS: calls,
            ...extra,
          },
        },
      ),
  };
}

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
  paths.push(...imageNames.map(imagePatchPath));
  const blobs = new Map();
  const tree = paths.map((path) => {
    const name = imageNames.find((name) => imagePatchPath(name) === path);
    const bytes = name
      ? Buffer.from(imagePatch(name))
      : Buffer.from(
          readFileSync(path, 'utf8').replace(
            /nameSuffix:[^\r\n]*/,
            'nameSuffix: -unreleased',
          ),
        );
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
  for (const component of [undefined]) {
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
    'deploy/environments/local/images/inventory.yaml',
    'deploy/environments/local/releases/inventory.json',
  ]);
  assert.match(overlay, /sha256:old/);
  const database = {
    ...component,
    component: 'database-bootstrap',
    image: 'ghcr.io/example/equipment-database-bootstrap',
  };
  const bootstrap = promotionFiles(database, overlay, jobInputs);
  assert.deepEqual(Object.keys(bootstrap).sort(), [
    'deploy/environments/local/images/database-bootstrap.yaml',
    'deploy/environments/local/jobs/database/kustomization.yaml',
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
    validateCandidate: async () => {},
    ensurePullRequest: async () => {
      assert.fail('component promotion cannot create a PR');
    },
  };
}

test('manual divergent component source proposes from fresh main independently of sibling publication', async () => {
  const gateway = independentGateway();
  const result = await promote({
    release: component,
    intent: intentFor(component),
    gateway,
  });
  assert.equal(result.status, 'promoted');
  assert.equal(gateway.writes[0].parent, 'f'.repeat(40));
  assert.deepEqual(Object.keys(gateway.writes[0].files).sort(), [
    'deploy/environments/local/images/inventory.yaml',
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
  gateway.snapshot.imagePatches = {
    inventory: files[imagePatchPath('inventory')],
  };
  const result = await promote({
    release: component,
    intent: intentFor(component, component),
    gateway,
  });
  assert.equal(result.status, 'noop');
  assert.deepEqual(gateway.writes, []);
  gateway.snapshot.records.inventory = {
    ...component,
    runId: component.runId + 1,
  };
  await assert.rejects(
    promote({ release: component, intent: intentFor(component), gateway }),
    /target changed/,
  );
  assert.deepEqual(gateway.writes, []);
});

test('direct main transport commits from exactly one fresh main parent', async () => {
  const calls = [];
  const gateway = githubGateway({
    repository: 'example/equipment',
    component: 'inventory',
    token: 'private',
    request: async (url, options) => {
      calls.push({ url, options });
      const data = url.endsWith('/heads/main')
        ? { object: { sha: 'f'.repeat(40) } }
        : url.includes('/git/commits/')
          ? { tree: { sha: 'c'.repeat(40) } }
          : { sha: 'a'.repeat(40) };
      return { ok: true, status: 200, json: async () => data };
    },
  });
  assert.equal((await gateway.readState()).base, 'f'.repeat(40));
  await gateway.commit(
    promotionFiles(component, 'images: []\n', jobInputs),
    'f'.repeat(40),
    'message',
  );
  const commit = JSON.parse(
    calls.find((call) => call.url.endsWith('/git/commits')).options.body,
  );
  assert.deepEqual(commit.parents, ['f'.repeat(40)]);
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

test('legacy proposal intent fails closed without accessing or mutating its branch', async () => {
  const gateway = independentGateway();
  await assert.rejects(
    promote({
      release: component,
      intent: intentFor(component, null, {
        head: 'b'.repeat(40),
        record: component,
      }),
      gateway,
    }),
    /Legacy promotion proposal/,
  );
  assert.deepEqual(gateway.writes, []);
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

test('CP-S002 rejects ancestor rollback even when the deployed branch name differs', async () => {
  const gateway = independentGateway();
  const newer = {
    ...component,
    sourceRef: 'refs/heads/renamed-branch',
    sourceRevision: 'c'.repeat(40),
    digest: `sha256:${'c'.repeat(64)}`,
  };
  gateway.snapshot.records.inventory = newer;
  gateway.isAncestor = async () => true;
  await assert.rejects(
    promote({
      release: component,
      intent: intentFor(component, newer),
      gateway,
    }),
    /obsolete/,
  );
  assert.deepEqual(gateway.writes, []);
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
  gateway.isAncestor = async () => false;
  const result = await promote({
    release: component,
    intent: intentFor(component, deployed),
    gateway,
  });
  assert.equal(result.status, 'promoted');
  assert.equal(
    JSON.parse(
      gateway.writes[0].files[
        'deploy/environments/local/releases/inventory.json'
      ],
    ).sourceRef,
    component.sourceRef,
  );
});
