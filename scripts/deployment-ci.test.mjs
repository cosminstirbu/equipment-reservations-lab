import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
  mkdtempSync,
  existsSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imageNames } from './deployment-validation.mjs';
import {
  buildImages,
  createEphemeralCluster,
  ciResources,
  prepareCiFixture,
} from './deployment-ci.mjs';
import { executeProcess } from './process.mjs';

test('publication CLI streams both provider streams and preserves safe process failure evidence', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'build-progress-'));
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
    `if(process.execPath.toLowerCase().endsWith(${JSON.stringify(process.platform === 'win32' ? 'docker.exe' : '/docker')})){process.stdout.write('build stdout progress\\n');process.stderr.write('build stderr progress\\n');process.exit(17);}`,
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/deployment-ci.mjs', 'publish'],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PATH:
          directory +
          (process.platform === 'win32' ? ';' : ':') +
          process.env.PATH,
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REPOSITORY: 'example/equipment',
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /build stdout progress/);
  assert.match(result.stderr, /build stderr progress/);
  assert.match(result.stderr, /image build inventory.*status=17/);
});

test('retired diagnostic build CLI is rejected before any provider invocation', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'retired-build-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(
    directory,
    process.platform === 'win32' ? 'docker.exe' : 'docker',
  );
  copyFileSync(process.execPath, executable);
  chmodSync(executable, 0o755);
  const calls = join(directory, 'calls');
  writeFileSync(calls, '');
  const preload = join(directory, 'provider.mjs');
  writeFileSync(
    preload,
    `import{appendFileSync}from'node:fs';if(process.execPath.toLowerCase().endsWith(${JSON.stringify(process.platform === 'win32' ? 'docker.exe' : '/docker')})){appendFileSync(${JSON.stringify(calls)},'docker invoked');process.exit(17);}`,
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/deployment-ci.mjs', 'diagnose-build'],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        GITHUB_SHA: 'a'.repeat(40),
        PATH:
          directory +
          (process.platform === 'win32' ? ';' : ':') +
          process.env.PATH,
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(readFileSync(calls, 'utf8'), '');
  assert.match(result.stderr, /Usage: deployment-ci.mjs/);
});

test('routing CLI streams audited progress and reports primary and all cleanup failures', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'routing-failure-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(
    directory,
    process.platform === 'win32' ? 'docker.exe' : 'docker',
  );
  copyFileSync(process.execPath, executable);
  chmodSync(executable, 0o755);
  const calls = join(directory, 'calls');
  const preload = join(directory, 'provider.mjs');
  writeFileSync(
    preload,
    `import{appendFileSync}from'node:fs';if(process.execPath.toLowerCase().endsWith(${JSON.stringify(process.platform === 'win32' ? 'docker.exe' : '/docker')})){const args=process.argv.slice(1);appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');process.stdout.write('routing stdout progress\\n');process.stderr.write('routing stderr progress\\n');process.exit(args.includes('create')?42:43);}`,
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/deployment-routing.test.mjs'],
    {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        CONTAINER_RUNTIME: 'docker',
        NODE_TEST_CONTEXT: '',
        PATH:
          directory +
          (process.platform === 'win32' ? ';' : ':') +
          process.env.PATH,
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      },
    },
  );
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /status=42/);
  assert.match(output, /Cleanup failure:.*status=43/);
  assert.match(result.stdout, /routing stdout progress/);
  assert.match(result.stderr, /routing stderr progress/);
  const commands = readFileSync(calls, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(
    commands.filter((args) =>
      args.some((argument) => /(?:^|[/\\])rm$/.test(argument)),
    ).length,
    5,
  );
});

test('image-build cleanup preserves primary failure and reports cleanup after success', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'build-cleanup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const driver = join(directory, 'driver.mjs');
  writeFileSync(
    driver,
    `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';const original=fs.rmSync;fs.rmSync=(path,options)=>{if(String(path).includes('equipment-build-'))throw Object.assign(new Error('PRIVATE_FS_MARKER'),{code:'EACCES'});return original(path,options);};syncBuiltinESMExports();const{buildImages}=await import(${JSON.stringify(new URL('./deployment-ci.mjs', import.meta.url).href)});const{OperationalFailure}=await import(${JSON.stringify(new URL('./process.mjs', import.meta.url).href)});try{buildImages({sourceRevision:'a'.repeat(40),run:(command,args)=>{if(process.env.PRIMARY==='true')throw new OperationalFailure('primary image build failed');fs.writeFileSync(args[args.indexOf('--metadata-file')+1],JSON.stringify({'containerimage.digest':'sha256:'+'a'.repeat(64)}));}});}catch(error){console.error(error.message);process.exitCode=1;}`,
  );
  for (const primary of [false, true]) {
    const result = spawnSync(process.execPath, [driver], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PRIMARY: String(primary) },
    });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Cleanup failure:.*image build temporary cleanup/,
    );
    if (primary) assert.match(result.stderr, /primary image build failed/);
    else assert.match(result.stderr, /cleanup operation/);
    assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_FS_MARKER/);
  }
});

test('browser reports both Rabbit cleanup failures after primary workflow failure', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'browser-cleanup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'browser.cjs');
  writeFileSync(
    preload,
    `const Module=require('node:module');const original=Module._load;Module._load=function(name,...args){if(name==='@playwright/test')return {chromium:{launch:async()=>({newContext:async()=>({newPage:async()=>({setDefaultTimeout(){},setDefaultNavigationTimeout(){},on(){},goto:async()=>{throw new Error('PRIVATE_PRIMARY');},request:{fetch:async(url)=>{console.log(url.includes('/queues/')?'queue cleanup attempted':'exchange cleanup attempted');throw new Error('PRIVATE_CLEANUP');}}})}),close:async()=>{}})},expect:{configure:()=>({})}};return original.call(this,name,...args);};`,
  );
  const result = spawnSync(
    process.execPath,
    ['--require', preload, 'scripts/admin-console-browser.mjs', 'rabbit'],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        RABBIT_URL: 'http://127.0.0.1',
        RABBIT_USERNAME: 'private',
        RABBIT_PASSWORD: 'private',
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed at: rabbit login/);
  assert.match(result.stderr, /Cleanup failure:.*Rabbit/);
  assert.match(result.stdout, /queue cleanup attempted/);
  assert.match(result.stdout, /exchange cleanup attempted/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_/);
});

test('browser CLI reports fixed stage and category without raw browser exception material', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'browser-private-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'browser.cjs');
  writeFileSync(
    preload,
    `const Module=require('node:module');const original=Module._load;Module._load=function(name,...args){if(name==='@playwright/test')return {chromium:{launch:async()=>{const error=new Error('PRIVATE_BROWSER_MESSAGE');error.name='PRIVATE_BROWSER_NAME';throw error;}},expect:{configure:()=>({})}};return original.call(this,name,...args);};`,
  );
  const result = spawnSync(
    process.execPath,
    ['--require', preload, 'scripts/admin-console-browser.mjs', 'postgres'],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /configuration/);
  assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_BROWSER/);
});

test('publication CLI permits manual branch releases and only automatic main pushes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-trigger-'));
  const preload = join(directory, 'docker.mjs');
  const calls = join(directory, 'calls.jsonl');
  const output = join(directory, 'output');
  writeFileSync(
    preload,
    `import childProcess from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
childProcess.execFileSync = (command, args) => {
  if (command !== 'docker') throw new Error('Unexpected external command: ' + command);
  appendFileSync(process.env.RELEASE_TEST_CALLS, JSON.stringify(args) + '\\n');
  const digest = 'sha256:' + 'a'.repeat(64);
  if (args[0] === 'buildx' && args[1] === 'build') {
    writeFileSync(args[args.indexOf('--metadata-file') + 1], JSON.stringify({'containerimage.digest': digest}));
    return '';
  }
  if (args[0] === 'buildx' && args[1] === 'imagetools') {
    return JSON.stringify({mediaType: 'application/vnd.oci.image.index.v1+json', manifests: ['amd64', 'arm64'].map(architecture => ({digest, platform: {os: 'linux', architecture}}))});
  }
  throw new Error('Unexpected Docker operation');
};
syncBuiltinESMExports();
`,
  );
  try {
    for (const [event, ref, allowed] of [
      ['push', 'refs/heads/main', true],
      ['workflow_dispatch', 'refs/heads/main', true],
      ['workflow_dispatch', 'refs/heads/feature', true],
      ['workflow_dispatch', 'refs/heads/feature/nested', true],
      ['workflow_dispatch', 'refs/heads/Main', true],
      ['workflow_dispatch', 'refs/heads/MAIN', true],
      ['push', 'refs/heads/Main', false],
      ['push', 'refs/heads/MAIN', false],
      ['pull_request', 'refs/heads/main', false],
      ['workflow_call', 'refs/heads/main', false],
      ['push', 'refs/heads/feature', false],
      ['push', 'refs/heads/feature/nested', false],
      ['push', 'refs/tags/v1', false],
      ['workflow_dispatch', 'refs/tags/v1', false],
      ['workflow_dispatch', 'refs/pull/1/merge', false],
      ['pull_request', 'refs/heads/feature', false],
      ['workflow_call', 'refs/heads/feature', false],
      ['schedule', 'refs/heads/main', false],
      ['workflow_dispatch', '', false],
      ['workflow_dispatch', 'refs/heads/', false],
      ['push', '', false],
      ['push', 'refs/heads/', false],
    ]) {
      writeFileSync(calls, '');
      writeFileSync(output, '');
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(preload).href,
          fileURLToPath(new URL('./deployment-ci.mjs', import.meta.url)),
          'publish',
        ],
        {
          cwd: fileURLToPath(new URL('../', import.meta.url)),
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: event,
            GITHUB_REF: ref,
            GITHUB_SHA: 'b'.repeat(40),
            GITHUB_REPOSITORY: 'example/equipment',
            GITHUB_OUTPUT: output,
            RELEASE_TEST_CALLS: calls,
          },
        },
      );
      const context = `${event} on ${ref}: ${result.stderr}`;
      if (allowed) {
        assert.equal(result.status, 0, context);
        const release = JSON.parse(
          readFileSync(output, 'utf8').trim().slice('release='.length),
        );
        assert.equal(release.sourceRevision, 'b'.repeat(40));
        assert.deepEqual(
          Object.keys(release.images).sort(),
          [...imageNames].sort(),
        );
        const commands = readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.equal(
          commands.filter((args) => args.includes('--push')).length,
          imageNames.length,
        );
        assert.equal(
          commands.filter((args) => args.includes('imagetools')).length,
          imageNames.length,
        );
        for (const args of commands.filter((args) => args.includes('--push'))) {
          assert.equal(
            args[args.indexOf('--platform') + 1],
            'linux/amd64,linux/arm64',
            context,
          );
          assert.match(
            args[args.indexOf('--tag') + 1],
            new RegExp(`:${'b'.repeat(40)}$`),
            context,
          );
          assert.ok(
            args.includes(
              `org.opencontainers.image.revision=${'b'.repeat(40)}`,
            ),
            context,
          );
        }
        for (const image of Object.values(release.images))
          assert.equal(image.digest, `sha256:${'a'.repeat(64)}`, context);
      } else {
        assert.notEqual(result.status, 0, context);
        assert.match(result.stderr, /Publication requires/);
        assert.equal(readFileSync(calls, 'utf8'), '');
        assert.equal(readFileSync(output, 'utf8'), '');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CI builds only local test images without publication; release indexes retain source', () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    return JSON.stringify({
      'containerimage.digest': `sha256:${'a'.repeat(64)}`,
    });
  };
  const metadata = () => ({
    'containerimage.digest': `sha256:${'a'.repeat(64)}`,
  });
  const local = buildImages({ sourceRevision: 'b'.repeat(40), run, metadata });
  assert.deepEqual(Object.keys(local.images).sort(), [...imageNames].sort());
  assert.ok(calls.every(([, args]) => !args.includes('--push')));
  calls.length = 0;
  const release = buildImages({
    sourceRevision: 'b'.repeat(40),
    repository: 'Example/Equipment',
    publish: true,
    run,
    metadata,
  });
  assert.equal(release.images.web.image, 'ghcr.io/example/equipment-web');
  assert.ok(
    calls
      .filter(([command]) => command === 'docker')
      .every(
        ([, args]) =>
          args.includes('--push') && args.includes('linux/amd64,linux/arm64'),
      ),
  );
});

test('ephemeral cluster is named and isolated, and cannot apply without real fixture', () => {
  const calls = [];
  assert.throws(
    () => createEphemeralCluster({ run: (...args) => calls.push(args) }),
    /fixture/,
  );
  assert.equal(calls.length, 0);
});

test('CI transforms only declared app images and physical node binding while preserving canonical issuer', () => {
  const release = {
    sourceRevision: 'b'.repeat(40),
    tags: imageNames.map((name) => `equipment-ci/${name}:${'b'.repeat(40)}`),
  };
  const rendered =
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n        - name: web\n          image: web\n          resources:\n            requests: {cpu: 50m, memory: 32Mi}\n            limits: {cpu: 250m, memory: 128Mi}\n          env:\n            - name: AUTHORITY\n              value: https://identity.equipment.test/realms/equipment\n';
  const [resource] = ciResources(rendered, release);
  const container = resource.spec.template.spec.containers[0];
  assert.equal(container.image, `equipment-ci/web:${release.sourceRevision}`);
  assert.equal(container.imagePullPolicy, 'Never');
  assert.equal(
    container.env[0].value,
    'https://identity.equipment.test/realms/equipment',
  );
  assert.throws(
    () =>
      ciResources(
        rendered.replace('image: web', 'image: unknown-app'),
        release,
      ),
    /image/,
  );
});

test('successful CI orchestration keeps kubeconfig private and scopes validation, apply and waits to its disposable context', () => {
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === 'kind' && args[0] === 'create')
      writeFileSync(args[args.indexOf('--kubeconfig') + 1], 'test-kubeconfig', {
        mode: 0o644,
      });
    return '';
  };
  const result = createEphemeralCluster({
    run,
    release: { tags: ['equipment-ci/web:test'] },
    fixture: ({ directory }) => ({
      state: directory,
      ca: 'public-ca',
      waves: [
        {
          manifests: 'temporary-wave.json',
          resources: [
            {
              kind: 'Job',
              metadata: {
                namespace: 'equipment',
                name: 'database-bootstrap-example',
                annotations: {
                  'argocd.argoproj.io/hook': 'Sync',
                  'argocd.argoproj.io/hook-delete-policy':
                    'HookSucceeded,BeforeHookCreation',
                },
              },
            },
          ],
        },
      ],
    }),
  });
  try {
    assert.equal(statSync(result.kubeconfig).mode & 0o777, 0o600);
    assert.equal(
      JSON.parse(readFileSync(`${result.directory}/kind.json`, 'utf8')).name,
      'equipment-ci',
    );
    const kubectl = calls.filter((call) => call.command === 'kubectl');
    assert.ok(
      kubectl.every(
        (call) =>
          call.args.includes('kind-equipment-ci') &&
          call.args.includes(result.kubeconfig),
      ),
    );
    assert.ok(kubectl[0].args.includes('--dry-run=server'));
    assert.ok(kubectl.at(-1).args.includes('--for=condition=Complete'));
  } finally {
    rmSync(result.directory, { recursive: true, force: true });
  }
});

test('CI tests current source even after the local overlay has a genuine digest promotion', () => {
  const sourceRevision = 'b'.repeat(40);
  const image = `ghcr.io/example/equipment-web@sha256:${'a'.repeat(64)}`;
  const rendered = JSON.stringify({
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
  });
  const release = {
    sourceRevision,
    tags: [`equipment-ci/web:${sourceRevision}`],
  };
  const [resource] = ciResources(rendered, release, { web: image });
  assert.equal(
    resource.spec.template.spec.containers[0].image,
    release.tags[0],
  );
});

test('invalid committed source is rejected before CI credential generation or external mutation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'invalid-ci-source-'));
  let calls = 0;
  try {
    assert.throws(() =>
      prepareCiFixture({
        root: directory,
        directory,
        kubeconfig: join(directory, 'kubeconfig'),
        context: 'kind-equipment-ci',
        release: {},
        run: () => {
          calls++;
          return '';
        },
      }),
    );
    assert.equal(calls, 0);
    assert.equal(existsSync(join(directory, '.local')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function failedJobFixture(
  t,
  diagnosticResponse,
  logResponse = () => '',
  jobName,
  namespace = 'equipment',
  waitFailure,
) {
  const calls = [];
  let directory;
  const name = jobName ?? `database-bootstrap-${'a'.repeat(16)}`;
  const run = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === 'kind' && args[0] === 'create') {
      const path = args[args.indexOf('--kubeconfig') + 1];
      writeFileSync(path, 'test-kubeconfig', { mode: 0o600 });
    }
    if (command === 'kubectl' && args.includes('wait') && waitFailure)
      return waitFailure();
    if (command === 'kubectl' && args.includes('wait'))
      throw new Error('provider-private-password sentinel');
    if (command === 'kubectl' && args.includes('logs'))
      return logResponse(args);
    if (command === 'kubectl' && args.includes('get'))
      return diagnosticResponse(args);
    return '';
  };
  t.after(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  return {
    calls,
    name,
    invoke: () =>
      createEphemeralCluster({
        root: process.cwd(),
        run,
        release: { tags: [] },
        fixture: (settings) => {
          directory = settings.directory;
          return {
            state: directory,
            ca: 'public-ca',
            waves: [
              {
                manifests: 'private-wave.json',
                resources: [{ kind: 'Job', metadata: { namespace, name } }],
              },
            ],
          };
        },
      }),
  };
}

test('CI Job projection preserves real process status category and duration', (t) => {
  const fixture = failedJobFixture(
    t,
    () => JSON.stringify({ items: [] }),
    () => '',
    undefined,
    'equipment',
    () =>
      executeProcess(
        process.execPath,
        ['-e', "process.stderr.write('PRIVATE_JOB_MARKER');process.exit(23)"],
        { operation: 'CI bootstrap completion', tool: 'kubectl' },
      ),
  );
  assert.throws(fixture.invoke, (error) => {
    assert.match(
      error.message,
      /CI bootstrap completion.*exit; status=23.*duration=\d+ms/,
    );
    assert.match(error.message, /CI wait failed for Job\/equipment\//);
    assert.doesNotMatch(error.message, /PRIVATE_JOB_MARKER/);
    return true;
  });
});

test('failed CI Job wait identifies exact public stage and emits only bounded allowlisted status fields', (t) => {
  const fixture = failedJobFixture(t, (args) =>
    JSON.stringify(
      args.includes(`job/${fixture.name}`)
        ? {
            status: {
              conditions: [
                {
                  type: 'Failed',
                  status: 'True',
                  reason: 'BackoffLimitExceeded',
                  message: 'private-password',
                },
              ],
            },
            spec: { secret: 'private-password' },
          }
        : {
            items: [
              {
                metadata: { name: 'private-password' },
                status: {
                  phase: 'Failed',
                  message: 'private-password',
                  initContainerStatuses: [
                    {
                      name: 'private-password',
                      state: {
                        waiting: {
                          reason: 'private-password',
                          message: 'private-password',
                        },
                      },
                    },
                  ],
                  containerStatuses: [
                    {
                      name: 'private-password',
                      state: {
                        terminated: {
                          exitCode: 1,
                          message: 'private-password',
                          reason: 'private-password',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
    ),
  );
  assert.throws(fixture.invoke, (error) => {
    assert.match(error.message, new RegExp(`Job/equipment/${fixture.name}`));
    assert.match(error.message, /BackoffLimitExceeded/);
    assert.match(error.message, /exitCode.*1/);
    assert.match(error.message, /Other/);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(
      error.message,
      /private-password|provider-private|sentinel/,
    );
    assert.ok(Buffer.byteLength(error.message) < 16 * 1024);
    return true;
  });
  const queries = fixture.calls.filter((call) => call.args.includes('get'));
  assert.equal(queries.length, 2);
  assert.ok(
    queries.every(
      ({ args, options }) =>
        args.includes('kind-equipment-ci') &&
        args.includes('--request-timeout=5s') &&
        options.timeout === 6000 &&
        options.maxBuffer === 128 * 1024,
    ),
  );
  assert.ok(
    queries.some(({ args }) =>
      args.includes(`batch.kubernetes.io/job-name=${fixture.name}`),
    ),
  );
  assert.ok(fixture.calls.every(({ args }) => !args.includes('events')));
});

test('diagnostic query failures, malformed or oversized responses preserve a sanitized named Job failure', (t) => {
  for (const response of [
    () => {
      throw new Error('private-password');
    },
    () => '{bad',
    () => 'x'.repeat(128 * 1024 + 1),
  ]) {
    const fixture = failedJobFixture(t, response);
    assert.throws(fixture.invoke, (error) => {
      assert.match(error.message, new RegExp(`Job/equipment/${fixture.name}`));
      assert.match(error.message, /diagnosticsUnavailable/);
      assert.doesNotMatch(
        error.message,
        /private-password|provider-private|sentinel/,
      );
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('Job diagnostic enums, count and numeric projection cannot echo arbitrary provider values', (t) => {
  const fixture = failedJobFixture(t, (args) =>
    JSON.stringify(
      args.includes(`job/${fixture.name}`)
        ? {
            status: {
              conditions: Array.from({ length: 20 }, () => ({
                type: 'private-password',
                status: 'private-password',
                reason: 'private-password',
              })),
            },
          }
        : {
            items: Array.from({ length: 20 }, () => ({
              status: {
                phase: 'private-password',
                containerStatuses: Array.from({ length: 20 }, () => ({
                  state: { terminated: { exitCode: 'private-password' } },
                })),
              },
            })),
          },
    ),
  );
  assert.throws(fixture.invoke, (error) => {
    assert.doesNotMatch(error.message, /private-password|exitCode/);
    const status = JSON.parse(error.message.slice(error.message.indexOf('{')));
    assert.equal(status.jobConditions.length, 10);
    assert.equal(status.pods.length, 10);
    assert.ok(
      status.pods.every(
        (pod) => pod.phase === 'Other' && pod.containers.length === 10,
      ),
    );
    assert.ok(Buffer.byteLength(error.message) < 16 * 1024);
    return true;
  });
});

test('known database Job privately projects only exact allowlisted bootstrap failure type', (t) => {
  const fixture = failedJobFixture(
    t,
    () => JSON.stringify({ items: [] }),
    () =>
      'fail: DatabaseBootstrap[2]\n      Database provisioning failed (NpgsqlException)\nprivate-password sentinel',
  );
  assert.throws(fixture.invoke, (error) => {
    assert.match(error.message, /"bootstrapFailureType":"NpgsqlException"/);
    assert.match(error.message, /"pods":\[\]/);
    assert.doesNotMatch(
      error.message,
      /private-password|sentinel|DatabaseBootstrap\[2\]/,
    );
    assert.equal(error.cause, undefined);
    return true;
  });
  const logs = fixture.calls.filter(({ args }) => args.includes('logs'));
  assert.equal(logs.length, 1);
  assert.ok(logs[0].args.includes(`job/${fixture.name}`));
  for (const arg of [
    'kind-equipment-ci',
    '--namespace',
    'equipment',
    '--request-timeout=5s',
    '--container=database-bootstrap',
    '--tail=100',
    '--limit-bytes=16384',
    '--pod-running-timeout=2s',
  ])
    assert.ok(logs[0].args.includes(arg));
  assert.equal(logs[0].options.timeout, 6000);
  assert.equal(logs[0].options.maxBuffer, 16384);
});

test('database failure-type extraction preserves status and failure on hostile or unavailable private logs', (t) => {
  for (const logs of [
    () => {
      throw new Error('private-password sentinel');
    },
    () => 'x'.repeat(16385),
    () => 'Database provisioning failed (private-password)',
    () =>
      'prefix Database provisioning failed (NpgsqlException) private-password',
    () => 'Database provisioning failed (Npgsql\nException)',
    () =>
      'Database provisioning failed (NpgsqlException)\nDatabase provisioning failed (TimeoutException)',
    () => '',
  ]) {
    const fixture = failedJobFixture(
      t,
      () => JSON.stringify({ items: [] }),
      logs,
    );
    assert.throws(fixture.invoke, (error) => {
      assert.match(error.message, /"bootstrapFailureTypeUnavailable":true/);
      assert.match(error.message, /"pods":\[\]/);
      assert.doesNotMatch(
        error.message,
        /private-password|sentinel|NpgsqlException/,
      );
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('private bootstrap log query is restricted to the exact known database Job identity', (t) => {
  for (const name of [
    'identity-bootstrap-aaaaaaaaaaaaaaaa',
    'database-bootstrap-unknown',
    'other-job',
  ]) {
    const fixture = failedJobFixture(
      t,
      () => JSON.stringify({ items: [] }),
      () => {
        throw new Error('must not query logs');
      },
      name,
    );
    assert.throws(fixture.invoke, /CI wait failed/);
    assert.equal(
      fixture.calls.filter(({ args }) => args.includes('logs')).length,
      0,
    );
  }
});

test('matching database Job name in another namespace cannot query private logs', (t) => {
  const fixture = failedJobFixture(
    t,
    () => JSON.stringify({ items: [] }),
    () => '',
    undefined,
    'other',
  );
  assert.throws(
    fixture.invoke,
    /CI wait failed for Job\/other\/database-bootstrap-/,
  );
  assert.equal(
    fixture.calls.filter(({ args }) => args.includes('logs')).length,
    0,
  );
});
