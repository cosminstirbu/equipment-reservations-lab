import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createLifecycle } from './local-kubernetes.mjs';

test('prerequisite CLI preserves safe provider failure metadata without private output', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lifecycle-provider-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const tool of ['podman', 'git', 'kind']) {
    const executable = join(
      directory,
      tool + (process.platform === 'win32' ? '.exe' : ''),
    );
    copyFileSync(process.execPath, executable);
    chmodSync(executable, 0o755);
  }
  const preload = join(directory, 'provider.mjs');
  writeFileSync(
    preload,
    `if(process.execPath.toLowerCase().endsWith(${JSON.stringify(process.platform === 'win32' ? 'kind.exe' : '/kind')})){process.stderr.write('PRIVATE_PROVIDER_SECRET');process.exit(19);}`,
  );
  const result = spawnSync(
    process.execPath,
    ['scripts/local-kubernetes.mjs', 'prerequisites'],
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
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /kind.*status=19/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PROVIDER_SECRET/);
});

test('private machine JSON parse failures never escape the lifecycle public boundary', async () => {
  const lifecycle = createLifecycle({
    run: (command, args) => {
      if (command === 'kind') return 'kind v0.33.0';
      if (command === 'kubectl')
        return JSON.stringify({ clientVersion: { gitVersion: 'v1.35.8' } });
      if (command === 'podman' && args[0] === 'machine')
        return 'PRIVATE_MACHINE_MARKER';
      return '';
    },
  });
  await assert.rejects(lifecycle.execute(['prerequisites']), (error) => {
    assert.doesNotMatch(error.message + JSON.stringify(error), /PRIVATE_/);
    assert.match(error.message, /private.*(?:response|state).*invalid/i);
    return true;
  });
});

test('host prerequisite failures retain a safe DNS and trust category without raw provider errors', async () => {
  const lifecycle = createLifecycle({
    lookupHost: async () => {
      throw new Error('PRIVATE_HOST_MARKER');
    },
    run: (command, args) => {
      if (command === 'kind')
        return args[0] === 'version' ? 'kind v0.33.0' : '';
      if (command === 'kubectl')
        return JSON.stringify({ clientVersion: { gitVersion: 'v1.35.8' } });
      if (
        command === 'podman' &&
        args[0] === 'machine' &&
        args[1] === 'inspect'
      )
        return JSON.stringify([
          {
            State: 'running',
            Rootful: true,
            Resources: { CPUs: 6, Memory: 12000 },
          },
        ]);
      if (command === 'podman' && args[0] === 'info') return 'false';
      if (command === 'podman' && args[0] === 'machine' && args[1] === 'ssh')
        return String(30 * 1024 * 1024);
      return '';
    },
  });
  await assert.rejects(lifecycle.execute(['prerequisites']), (error) => {
    assert.match(error.message, /DNS.*certificate trust/);
    assert.doesNotMatch(
      error.message + JSON.stringify(error),
      /PRIVATE_HOST_MARKER/,
    );
    return true;
  });
});

test(
  'parent smoke CLI retains the audited child HTTP phase and both progress streams',
  {
    skip:
      process.platform === 'win32'
        ? 'Requires real POSIX private-file modes'
        : false,
  },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'parent-smoke-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const scripts = join(directory, 'scripts');
    mkdirSync(scripts);
    for (const name of [
      'local-kubernetes.mjs',
      'process.mjs',
      'deployment-validation.mjs',
    ])
      copyFileSync(new URL(name, import.meta.url), join(scripts, name));
    symlinkSync(
      join(import.meta.dirname, '..', 'node_modules'),
      join(directory, 'node_modules'),
      'dir',
    );
    await releaseFixture(directory);
    const bundle = createLifecycle({ root: directory }).credentials(false);
    const state = join(directory, '.local/kubernetes');
    for (const name of ['kubeconfig', 'ca.crt'])
      writeFileSync(join(state, name), 'fixture', { mode: 0o600 });
    for (const tool of ['kind', 'kubectl']) {
      const executable = join(directory, tool);
      const response = tool === 'kind' ? 'equipment-local' : bundle.owner;
      assert.match(response, /^[a-z0-9-]+$/);
      writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' '${response}'\n`);
      chmodSync(executable, 0o755);
    }
    const preload = join(directory, 'provider.mjs');
    writeFileSync(
      preload,
      `if(process.argv[1]?.endsWith('/deployment-smoke.mjs')){process.stdout.write('safe smoke stdout progress\\n');process.stderr.write('Smoke persistence verification failed. Identity login page failed (HTTP 503).\\n');process.exit(23);}`,
    );
    const result = spawnSync(
      process.execPath,
      [join(scripts, 'local-kubernetes.mjs'), 'smoke', '--verify-persistence'],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          PATH: directory + ':' + process.env.PATH,
          NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /safe smoke stdout progress/, result.stderr);
    assert.match(result.stderr, /persistence verification failed.*HTTP 503/);
    assert.match(result.stderr, /status=23/);
  },
);

const certificateRoot = mkdtempSync(
  join(tmpdir(), 'equipment-lifecycle-certificates-'),
);
after(() => rmSync(certificateRoot, { recursive: true, force: true }));
function certificateFixture(includeIp) {
  const directory = join(certificateRoot, includeIp ? 'loopback' : 'dns-only');
  if (!existsSync(directory)) {
    mkdirSync(directory, { mode: 0o700 });
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-days',
        '2',
        '-subj',
        '/CN=app.equipment.test',
        '-addext',
        'subjectAltName=DNS:app.equipment.test,DNS:identity.equipment.test' +
          (includeIp ? ',IP:127.0.0.1' : ''),
        '-keyout',
        join(directory, 'tls.key'),
        '-out',
        join(directory, 'tls.crt'),
      ],
      { stdio: 'pipe', timeout: 10000 },
    );
    chmodSync(join(directory, 'tls.key'), 0o600);
  }
  return {
    certificate: readFileSync(join(directory, 'tls.crt'), 'utf8'),
    key: readFileSync(join(directory, 'tls.key'), 'utf8'),
  };
}

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'equipment-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.local/kubernetes'), { recursive: true, mode: 0o700 });
  const leaf = certificateFixture(!options.missingIp);
  for (const [name, contents] of Object.entries({
    'tls.crt': leaf.certificate,
    'tls.key': leaf.key,
    'ca.crt': leaf.certificate,
  }))
    writeFileSync(join(root, '.local/kubernetes', name), contents, {
      mode: 0o600,
    });
  writeFileSync(join(root, 'rootCA.pem'), leaf.certificate);
  const calls = [];
  const output = [];
  const forwards = [];
  let cluster = false;
  let marker = '';
  let operation;
  let observations = 0;
  const run = (command, args, settings = {}) => {
    calls.push({ command, args, settings });
    if (options.fail === command) throw new Error('secret-token from provider');
    if (options.realCertificate && command === 'openssl')
      return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10000,
      });
    if (command === 'mkcert' && args[0] === '-CAROOT') return root;
    if (
      command === 'openssl' &&
      (args.includes('-pubkey') || args.includes('-pubout'))
    )
      return 'PUBLIC KEY';
    if (command === 'git' && args.includes('ls-remote'))
      return 'c'.repeat(40) + '\trefs/heads/main\n';
    if (command === 'kind' && args[0] === 'version') return 'kind v0.33.0';
    if (command === 'kubectl' && args[0] === 'version')
      return JSON.stringify({ clientVersion: { gitVersion: 'v1.35.8' } });
    if (command === 'kind' && args[0] === 'get')
      return cluster ? 'equipment-local\n' : '';
    if (command === 'kind' && args[0] === 'create') {
      cluster = true;
      writeFileSync(join(root, '.local/kubernetes/kubeconfig'), 'private', {
        mode: 0o600,
      });
    }
    if (command === 'podman' && args[0] === 'manifest')
      return JSON.stringify({
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests: ['amd64', 'arm64'].map((architecture) => ({
          platform: { os: 'linux', architecture },
          digest: 'sha256:' + 'a'.repeat(64),
        })),
      });
    if (command === 'podman' && args[0] === 'machine' && args[1] === 'ssh')
      return options.disk ?? '66000000';
    if (command === 'podman' && args[0] === 'machine')
      return JSON.stringify([
        {
          State: 'running',
          Rootful: true,
          Resources: {
            CPUs: options.cpu ?? 6,
            Memory: options.memory ?? 11444,
          },
        },
      ]);
    if (command === 'podman' && args[0] === 'info')
      return options.rootless ?? 'false';
    if (
      command === 'kubectl' &&
      args.includes('get') &&
      args.includes('statefulset/argocd-application-controller')
    )
      return options.controllerAbsent
        ? ''
        : 'statefulset.apps/argocd-application-controller';
    if (
      command === 'kubectl' &&
      args.includes('equipment-local-owner') &&
      args.includes('get')
    )
      return marker;
    if (
      command === 'kubectl' &&
      settings.input?.includes('equipment-local-owner')
    )
      marker = JSON.parse(settings.input).data.id;
    if (
      command === 'kubectl' &&
      args.includes('application') &&
      args.includes('equipment-local') &&
      args.includes('patch')
    ) {
      const patch = JSON.parse(args[args.indexOf('-p') + 1]);
      operation = patch.find((item) => item.path === '/operation')?.value;
      observations = 0;
      return '';
    }
    if (
      command === 'kubectl' &&
      args.includes('application') &&
      args.includes('equipment-local') &&
      args.includes('get')
    ) {
      let observed = operation;
      if (operation && options.staleFirst && observations++ === 0)
        observed = {
          ...operation,
          info: [{ name: 'equipment-local-request', value: 'old-request' }],
        };
      return JSON.stringify({
        metadata: { resourceVersion: '1' },
        spec: {
          syncPolicy: {
            syncOptions: ['CreateNamespace=false', 'FailOnSharedResource=true'],
            retry: {
              limit: 2,
              backoff: { duration: '5s', factor: 2, maxDuration: '20s' },
            },
          },
        },
        status: {
          health: { status: 'Healthy' },
          sync: { status: 'Synced', revision: 'c'.repeat(40) },
          operationState: {
            operation: observed,
            phase:
              observed === operation
                ? (options.operationPhase ?? 'Succeeded')
                : 'Succeeded',
            syncResult: {
              revision: options.wrongRevision ? 'd'.repeat(40) : 'c'.repeat(40),
            },
          },
        },
      });
    }
    return '';
  };
  const app = createLifecycle({
    root,
    run,
    lookupHost: async () => {
      if (options.hostError) throw new Error(options.hostError);
      return options.addresses ?? [{ address: '127.0.0.1' }];
    },
    probePort: async () => options.portAvailable !== false,
    connectPort: async () => true,
    output: (message) => output.push(message),
    spawnChild: (command, args, settings) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.pid = 12345;
      child.exitCode = null;
      child.kill = (signal) => {
        child.exitCode = 0;
        child.emit('exit', 0, signal);
        return true;
      };
      forwards.push({ command, args, settings, child });
      Promise.resolve().then(() => {
        if (options.forwardFailure)
          child.emit('error', new Error('SENSITIVE_PROVIDER_TOKEN'));
        else
          child.stdout.write(
            'Forwarding from 127.0.0.1:18888 -> 18888\nForwarding from 127.0.0.1:18890 -> 18890\n',
          );
      });
      return child;
    },
  });
  return {
    root,
    calls,
    output,
    forwards,
    app,
    setCluster: (value) => {
      cluster = value;
      if (value) {
        mkdirSync(join(root, '.local/kubernetes'), {
          recursive: true,
          mode: 0o700,
        });
        writeFileSync(join(root, '.local/kubernetes/kubeconfig'), 'private', {
          mode: 0o600,
        });
      }
    },
    setMarker: (value) => {
      marker = value;
    },
  };
}

async function releaseFixture(root) {
  const { imageNames, jobNames, jobSuffix, wrapperPath } =
    await import('./deployment-validation.mjs');
  const records = Object.fromEntries(
    imageNames.map((component) => [
      component,
      {
        schemaVersion: 1,
        component,
        repository: { id: 123, name: 'example/equipment' },
        sourceRevision: 'a'.repeat(40),
        sourceRef: 'refs/heads/main',
        runId: 456,
        runAttempt: 1,
        workflow: '.github/workflows/validate.yaml',
        image: `ghcr.io/example/equipment-${component}`,
        digest: `sha256:${'a'.repeat(64)}`,
      },
    ]),
  );
  const copy = (path) => {
    const text = readFileSync(join(import.meta.dirname, '..', path), 'utf8');
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
    return text;
  };
  const base = copy('deploy/base/configuration.yaml');
  const local = copy('deploy/environments/local/configuration.yaml');
  const overlay = copy('deploy/environments/local/kustomization.yaml');
  writeFileSync(
    join(root, 'deploy/environments/local/kustomization.yaml'),
    overlay.replace(
      'images: []',
      `images: ${JSON.stringify(Object.values(records).map((record) => ({ name: record.component, newName: record.image, digest: record.digest })))}`,
    ),
  );
  for (const name of jobNames) {
    const template = copy(`deploy/base/jobs/${name}/job.yaml`);
    const path = wrapperPath(name);
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(
      join(root, path),
      `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../../../../base/jobs/${name}]\nnameSuffix: ${jobSuffix(records[`${name}-bootstrap`], base, local, template)}\n`,
    );
  }
  mkdirSync(join(root, 'deploy/environments/local/releases'), {
    recursive: true,
  });
  for (const record of Object.values(records))
    writeFileSync(
      join(root, `deploy/environments/local/releases/${record.component}.json`),
      JSON.stringify(record),
    );
  return records;
}

test('missing tool fails with actionable sanitized diagnostic and no mutations', async (t) => {
  const f = fixture(t, { fail: 'kind' });
  await assert.rejects(f.app.execute(['prerequisites']), /kind.*required/);
  assert.equal(
    f.calls.some((c) => c.args.includes('create')),
    false,
  );
});

test('all subprocess invocations have finite timeout and setup requires release before cluster creation', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.app.execute(['setup']),
    /Missing published components/i,
  );
  assert.equal(
    f.calls.some((c) => c.command === 'kind' && c.args[0] === 'create'),
    false,
  );
  assert.ok(
    f.calls.every(
      (c) => c.settings.timeout > 0 && c.settings.timeout <= 180000,
    ),
  );
});

test('private credentials are create-once with restricted modes and no replacement when cluster survives', async (t) => {
  const f = fixture(t);
  const first = f.app.credentials(false);
  const path = join(f.root, '.local/kubernetes/credentials.json');
  const before = readFileSync(path);
  assert.deepEqual(f.app.credentials(false), first);
  assert.deepEqual(readFileSync(path), before);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(f.root, '.local/kubernetes')).mode & 0o777, 0o700);
  unlinkSync(path);
  assert.throws(() => f.app.credentials(true), /restore.*private.*bundle/i);
  assert.equal(f.calls.length, 0);
});

test('foreign cluster ownership blocks status and every lifecycle mutation', async (t) => {
  const f = fixture(t);
  f.app.credentials(false);
  f.setCluster(true);
  f.setMarker('foreign');
  for (const command of [
    ['status'],
    ['stop'],
    ['reset', '--confirm-delete-data'],
    ['teardown', '--confirm-delete-cluster'],
  ]) {
    await assert.rejects(f.app.execute(command), /ownership/i);
  }
  assert.equal(
    f.calls.some((c) => c.args.includes('delete') || c.args.includes('scale')),
    false,
  );
});

test('destructive operations require exact confirmation and unknown commands fail before processes', async (t) => {
  const f = fixture(t);
  for (const command of [
    ['reset'],
    ['teardown'],
    ['access', 'database'],
    ['wat'],
  ])
    await assert.rejects(f.app.execute(command), /Usage|confirm/);
  assert.equal(f.calls.length, 0);
});

test('stop suspends controller before workloads and preserves storage and credentials', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['stop']);
  const commands = f.calls.map((c) => c.args.join(' '));
  const suspended = commands.findIndex(
    (s) =>
      s.includes('statefulset/argocd-application-controller') &&
      s.includes('--replicas=0'),
  );
  const stopped = commands.findIndex((s) =>
    s.includes('--namespace equipment scale'),
  );
  assert.ok(suspended >= 0 && stopped > suspended);
  assert.equal(
    commands.some((s) => /delete.*(namespace|pv|pvc|cluster)/.test(s)),
    false,
  );
  assert.deepEqual(f.app.credentials(true), bundle);
});

test('access only forwards approved interfaces to loopback and never prints tokens', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['access', 'dashboard']);
  const forward = f.calls.find((c) => c.args.includes('port-forward'));
  assert.ok(forward.args.includes('--address=127.0.0.1'));
  assert.ok(forward.args.includes('18888:18888'));
  assert.equal(forward.settings.inherit, false);
});

test('symlinked or permissive private state is rejected', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, '.local/kubernetes'), {
    recursive: true,
    mode: 0o755,
  });
  chmodSync(join(f.root, '.local/kubernetes'), 0o755);
  assert.throws(() => f.app.credentials(false), /0700/);
});

test('prerequisites reject insufficient VM resources, disk, rootless provider and host failures without mutation', async (t) => {
  for (const options of [
    { cpu: 2 },
    { memory: 4096 },
    { disk: '200' },
    { rootless: 'true' },
    { portAvailable: false },
    { hostError: 'Untrusted certificate' },
  ]) {
    const f = fixture(t, options);
    await assert.rejects(
      f.app.execute(['prerequisites']),
      /CPU|MiB|disk|rootful|Port|certificate/,
    );
    assert.equal(
      f.calls.some(
        (c) => c.args.includes('create') || c.args.includes('apply'),
      ),
      false,
    );
  }
});

test('explicit reset deletes only application namespace, PVs and exact node paths after reconciliation has stopped', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['reset', '--confirm-delete-data']);
  const deletion = f.calls.filter((c) => c.args.includes('delete'));
  assert.ok(
    deletion.some(
      (c) => c.args.includes('namespace') && c.args.includes('equipment'),
    ),
  );
  assert.equal(
    deletion.some((c) => c.args.includes('cluster')),
    false,
  );
  const erase = f.calls.find(
    (c) => c.command === 'podman' && c.args.includes('rm'),
  );
  assert.deepEqual(erase.args, [
    'exec',
    'equipment-local-control-plane',
    'rm',
    '-rf',
    '--',
    '/var/local/equipment/postgres',
    '/var/local/equipment/rabbitmq',
  ]);
  assert.deepEqual(f.app.credentials(true), bundle);
});

test('explicit teardown targets one owned cluster and never touches VM or unrelated compatibility cluster', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['teardown', '--confirm-delete-cluster']);
  const deletion = f.calls.find(
    (c) => c.command === 'kind' && c.args[0] === 'delete',
  );
  assert.deepEqual(deletion.args, [
    'delete',
    'cluster',
    '--name',
    'equipment-local',
  ]);
  assert.equal(
    f.calls.some(
      (c) =>
        c.args.includes('equipment-compat-012') || c.args.includes('machine'),
    ),
    false,
  );
});

test('provider failures are bounded, secret-free and prevent later destructive steps', async (t) => {
  const f = fixture(t, { fail: 'kubectl' });
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await assert.rejects(
    f.app.execute(['reset', '--confirm-delete-data']),
    (error) =>
      !error.message.includes('secret-token') &&
      error.message.includes('unknown'),
  );
  assert.equal(
    f.calls.some((c) => c.command === 'podman' && c.args.includes('rm')),
    false,
  );
  assert.ok(f.calls.every((c) => c.settings.timeout <= 180000));
});

test('setup prioritizes missing credentials recovery when the named cluster survives', async (t) => {
  const f = fixture(t);
  f.setCluster(true);
  await assert.rejects(f.app.execute(['setup']), /restore.*private.*bundle/i);
  assert.equal(
    f.calls.some((c) => c.args.includes('create') || c.args.includes('apply')),
    false,
  );
});

test('concurrent mutation cannot run until the existing operator lock is resolved', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  mkdirSync(join(f.root, '.local/kubernetes/operation.lock'), { mode: 0o700 });
  await assert.rejects(f.app.execute(['stop']), /operation.*lock/i);
  assert.equal(
    f.calls.some((c) => c.args.includes('scale')),
    false,
  );
});

test('private malformed credentials cannot leak parsed secret fragments', (t) => {
  const f = fixture(t);
  f.app.credentials(false);
  writeFileSync(
    join(f.root, '.local/kubernetes/credentials.json'),
    '{"alice":"SENSITIVE_PRIVATE_PASSWORD"',
  );
  assert.throws(
    () => f.app.credentials(true),
    (error) =>
      error.message.includes('restore') && !error.message.includes('SENSITIVE'),
  );
});

test('setup sends private Secrets before Argo sync and reuses original credentials across reruns', async (t) => {
  const f = fixture(t);
  const first = f.app.credentials(false);
  await releaseFixture(f.root);
  await f.app.execute(['setup']);
  await f.app.execute(['setup']);
  const privateSecret = f.calls.findIndex((c) =>
    c.settings.input?.includes('equipment-credentials'),
  );
  const argo = f.calls.findIndex((c) =>
    c.args.some((arg) => arg.endsWith('deploy/argocd/local.yaml')),
  );
  assert.ok(privateSecret >= 0 && argo > privateSecret);
  assert.deepEqual(f.app.credentials(true), first);
  assert.equal(
    f.calls.filter((c) => c.command === 'kind' && c.args[0] === 'create')
      .length,
    1,
  );
  assert.equal(
    f.output.some((line) =>
      Object.values(first).some(
        (value) => typeof value === 'string' && line.includes(value),
      ),
    ),
    false,
  );
  assert.ok(
    f.calls
      .filter((c) => c.settings.input?.includes('equipment-credentials'))
      .every((c) => c.args.includes('--server-side')),
  );
});

test('teardown safely handles owned partial setup before the Argo controller exists', async (t) => {
  const f = fixture(t, { controllerAbsent: true });
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['teardown', '--confirm-delete-cluster']);
  assert.equal(
    f.calls.some((c) => c.args.includes('scale')),
    false,
  );
  assert.ok(
    f.calls.some((c) => c.command === 'kind' && c.args[0] === 'delete'),
  );
});

test('smoke uses private state and CA before child startup with owned loopback diagnostic forwards', async (t) => {
  const f = fixture(t);
  await releaseFixture(f.root);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await f.app.execute(['smoke']);
  const directory = join(f.root, '.local/kubernetes');
  const statePath = join(directory, 'smoke-state.json');
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), {
    applicationOrigin: 'https://app.equipment.test',
    authority: 'https://identity.equipment.test/realms/equipment',
    context: 'kind-equipment-local',
    credentialsFile: join(directory, 'credentials.json'),
    caFile: join(directory, 'ca.crt'),
    dashboardOrigin: 'http://127.0.0.1:18888',
    otlpOrigin: 'http://127.0.0.1:18890',
  });
  const smoke = f.calls.find((c) => c.command === process.execPath);
  assert.deepEqual(smoke.args, [
    join(f.root, 'scripts/deployment-smoke.mjs'),
    '--state',
    directory,
  ]);
  assert.equal(
    smoke.settings.env.NODE_EXTRA_CA_CERTS,
    join(directory, 'ca.crt'),
  );
  assert.equal(f.forwards.length, 1);
  assert.ok(f.forwards[0].args.includes('--address=127.0.0.1'));
  assert.ok(
    f.forwards[0].args.includes('18888:18888') &&
      f.forwards[0].args.includes('18890:18890'),
  );
  assert.equal(f.forwards[0].child.exitCode, 0);
});

test('smoke always cleans forwards after child failure and suppresses provider tokens', async (t) => {
  const f = fixture(t, { fail: process.execPath });
  await releaseFixture(f.root);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await assert.rejects(
    f.app.execute(['smoke']),
    (error) => !error.message.includes('secret-token'),
  );
  assert.equal(f.forwards.length, 1);
  assert.equal(f.forwards[0].child.exitCode, 0);
});

test('failed diagnostic forwarding stops smoke before HTTP execution and cleans the child', async (t) => {
  const f = fixture(t, { forwardFailure: true });
  await releaseFixture(f.root);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await assert.rejects(
    f.app.execute(['smoke']),
    (error) => !error.message.includes('SENSITIVE_PROVIDER_TOKEN'),
  );
  assert.equal(
    f.calls.some((c) => c.command === process.execPath),
    false,
  );
  assert.equal(f.forwards[0].child.exitCode, 0);
});

test('persistence smoke flags pass through narrowly, and verification needs no diagnostic forwards', async (t) => {
  for (const flag of ['--capture-persistence', '--verify-persistence']) {
    const f = fixture(t);
    await releaseFixture(f.root);
    const bundle = f.app.credentials(false);
    f.setCluster(true);
    f.setMarker(bundle.owner);
    await f.app.execute(['smoke', flag]);
    assert.ok(
      f.calls.find((c) => c.command === process.execPath).args.includes(flag),
    );
    assert.equal(f.forwards.length, flag === '--verify-persistence' ? 0 : 1);
  }
  const f = fixture(t);
  await releaseFixture(f.root);
  await assert.rejects(
    f.app.execute(['smoke', '--state', '/tmp/foreign']),
    /Usage/,
  );
  await assert.rejects(f.app.execute(['smoke', '--unknown']), /Usage/);
  assert.equal(f.calls.length, 0);
});

test('setup rejects duplicate release fields and stale Job suffixes before mutation', async (t) => {
  for (const duplicate of [true, false]) {
    const f = fixture(t);
    await releaseFixture(f.root);
    if (duplicate) {
      const path = join(
        f.root,
        'deploy/environments/local/releases/inventory.json',
      );
      const text = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        text.replace('{', '{"sourceRevision":"' + 'b'.repeat(40) + '",'),
      );
    } else
      writeFileSync(
        join(
          f.root,
          'deploy/environments/local/jobs/database/kustomization.yaml',
        ),
        'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../../../../base/jobs/database]\nnameSuffix: -unreleased\n',
      );
    await assert.rejects(f.app.execute(['setup']), /JSON|stale|malformed/);
    assert.equal(
      f.calls.some(
        (c) => c.args.includes('create') || c.args.includes('apply'),
      ),
      false,
    );
  }
});

test('the real process adapter supplies the CA environment to Node before its first statement', async (t) => {
  const f = fixture(t);
  await releaseFixture(f.root);
  f.app.credentials(false);
  const directory = join(f.root, '.local/kubernetes');
  writeFileSync(join(directory, 'kubeconfig'), 'private', { mode: 0o600 });
  const binaries = join(f.root, 'bin');
  mkdirSync(binaries);
  mkdirSync(join(f.root, 'scripts'));
  writeFileSync(
    join(binaries, 'kind'),
    '#!/usr/bin/env node\nprocess.stdout.write("equipment-local\\n");\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(binaries, 'kubectl'),
    '#!/usr/bin/env node\nconst fs=require("node:fs");const path=require("node:path");process.stdout.write(JSON.parse(fs.readFileSync(path.join(process.cwd(),".local/kubernetes/credentials.json"),"utf8")).owner);\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(f.root, 'scripts/deployment-smoke.mjs'),
    'import {writeFileSync} from "node:fs";writeFileSync("child-observation.json",JSON.stringify({ca:process.env.NODE_EXTRA_CA_CERTS,args:process.argv.slice(2)}));',
  );
  const moduleUrl = pathToFileURL(
    join(import.meta.dirname, 'local-kubernetes.mjs'),
  ).href;
  const source = `import {createLifecycle} from ${JSON.stringify(moduleUrl)};import{EventEmitter}from'node:events';await createLifecycle({root:${JSON.stringify(f.root)},output:()=>{},probePort:async()=>true,connectPort:async()=>true,spawnChild:()=>{const child=new EventEmitter();child.pid=123;child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);return true;};return child;}}).execute(['smoke']);`;
  execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: f.root,
    env: { ...process.env, PATH: binaries + ':' + process.env.PATH },
    stdio: 'pipe',
    timeout: 10000,
  });
  assert.deepEqual(
    JSON.parse(readFileSync(join(f.root, 'child-observation.json'), 'utf8')),
    { ca: join(directory, 'ca.crt'), args: ['--state', directory] },
  );
});

test('setup rejects stale healthy workloads followed by a failed current hook operation', async (t) => {
  const f = fixture(t, { staleFirst: true, operationPhase: 'Failed' });
  await releaseFixture(f.root);
  await assert.rejects(f.app.execute(['setup']), /current.*sync.*failed/i);
  assert.equal(
    f.calls.some((c) => c.args.includes('--for=condition=Available')),
    false,
  );
});

test('setup requests a correlated full sync at exact main revision and requires its successful result', async (t) => {
  const f = fixture(t, { staleFirst: true });
  await releaseFixture(f.root);
  await f.app.execute(['setup']);
  const request = f.calls.find(
    (c) => c.args.includes('application') && c.args.includes('patch'),
  );
  assert.ok(request);
  const patch = JSON.parse(request.args[request.args.indexOf('-p') + 1]);
  assert.deepEqual(patch[0], {
    op: 'test',
    path: '/metadata/resourceVersion',
    value: '1',
  });
  const operation = patch.find((item) => item.path === '/operation').value;
  assert.equal(operation.sync.revision, 'c'.repeat(40));
  assert.equal(operation.sync.resources, undefined);
  assert.equal(operation.sync.syncStrategy, undefined);
  assert.equal(operation.retry.limit, 2);
  assert.match(operation.info[0].value, /^[a-f0-9]{32}$/);
  assert.ok(f.calls.some((c) => c.args.includes('--for=condition=Available')));
});

test('a succeeded current operation with a different resolved revision cannot pass setup', async (t) => {
  const f = fixture(t, { wrongRevision: true });
  await releaseFixture(f.root);
  await assert.rejects(f.app.execute(['setup']), /revision/i);
  assert.equal(
    f.calls.some((c) => c.args.includes('--for=condition=Available')),
    false,
  );
});

test('prerequisites reject an actual DNS-only leaf and accept a chained leaf with exact loopback IP SAN', async (t) => {
  const missing = fixture(t, { missingIp: true, realCertificate: true });
  await assert.rejects(
    missing.app.execute(['prerequisites']),
    /127\.0\.0\.1|SAN/,
  );
  assert.equal(
    missing.calls.some(
      (c) => c.args.includes('create') || c.args.includes('apply'),
    ),
    false,
  );
  const valid = fixture(t, { realCertificate: true });
  await valid.app.execute(['prerequisites']);
  assert.ok(valid.output.some((line) => line.includes('Prerequisites passed')));
});

test('setup sends the matching Argo server TLS Secret privately before Argo installation', async (t) => {
  const f = fixture(t);
  await releaseFixture(f.root);
  await f.app.execute(['setup']);
  const index = f.calls.findIndex((c) =>
    c.settings.input?.includes('argocd-server-tls'),
  );
  assert.ok(index >= 0);
  const secret = JSON.parse(f.calls[index].settings.input);
  assert.equal(secret.kind, 'Secret');
  assert.equal(secret.type, 'kubernetes.io/tls');
  assert.deepEqual(secret.metadata, {
    name: 'argocd-server-tls',
    namespace: 'argocd',
  });
  const state = join(f.root, '.local/kubernetes');
  assert.deepEqual(secret.stringData, {
    'tls.crt': readFileSync(join(state, 'tls.crt'), 'utf8'),
    'tls.key': readFileSync(join(state, 'tls.key'), 'utf8'),
  });
  const installation = f.calls.findIndex(
    (c) =>
      c.args.includes('-k') &&
      c.args.some((arg) => arg.endsWith('deploy/argocd')),
  );
  assert.ok(installation > index);
  assert.equal(
    f.output.some((line) => line.includes(secret.stringData['tls.key'])),
    false,
  );
  assert.ok(f.calls[index].args.includes('--server-side'));
});

test('partial component publication names missing images before any setup mutation', async (t) => {
  const f = fixture(t);
  await releaseFixture(f.root);
  for (const name of ['inventory', 'reservations'])
    rmSync(join(f.root, `deploy/environments/local/releases/${name}.json`));
  await assert.rejects(
    f.app.execute(['setup']),
    /Missing published components: inventory, reservations/,
  );
  assert.equal(
    f.calls.some((c) => c.args.includes('create') || c.args.includes('apply')),
    false,
  );
});

test('smoke refuses partial component state before starting diagnostic forwarding', async (t) => {
  const f = fixture(t);
  const bundle = f.app.credentials(false);
  f.setCluster(true);
  f.setMarker(bundle.owner);
  await releaseFixture(f.root);
  rmSync(join(f.root, 'deploy/environments/local/releases/web.json'));
  await assert.rejects(
    f.app.execute(['smoke']),
    /Missing published components: web/,
  );
  assert.equal(f.forwards.length, 0);
});
