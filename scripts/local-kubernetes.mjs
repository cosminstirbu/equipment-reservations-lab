import { spawn } from 'node:child_process';
import {
  executeProcess,
  processFailure,
  OperationalFailure,
  cleanupAll,
  safeFailure,
} from './process.mjs';
import { randomBytes, X509Certificate } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { lookup } from 'node:dns/promises';
import { connect, createServer } from 'node:net';
import { clearTimeout, setTimeout } from 'node:timers';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cluster = 'equipment-local';
const context = `kind-${cluster}`;
const namespace = 'equipment';
const usage =
  'Usage: local-kubernetes.mjs prerequisites|setup|status|access argocd|dashboard|smoke [--capture-persistence|--verify-persistence]|stop|reset --confirm-delete-data|teardown --confirm-delete-cluster';
const secretNames = [
  'postgresAdmin',
  'inventoryDb',
  'reservationsDb',
  'notificationsDb',
  'keycloakDb',
  'rabbitAdmin',
  'rabbitPublisher',
  'rabbitConsumer',
  'brokerAdminSalt',
  'brokerPublisherSalt',
  'brokerConsumerSalt',
  'identityAdmin',
  'alice',
  'bob',
  'manager',
  'staff',
  'inventoryClient',
  'reservationsClient',
  'notificationsClient',
  'dashboardBrowser',
  'dashboardOtlp',
  'dashboardApi',
];

function processRun(command, args, settings) {
  return executeProcess(command, args, {
    ...settings,
    cwd: settings.cwd,
    encoding: 'utf8',
    timeout: settings.timeout,
    input: settings.input,
    env: {
      ...process.env,
      ...settings.env,
      KIND_EXPERIMENTAL_PROVIDER: 'podman',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function probeHostPort(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen(port, '127.0.0.1', () =>
      server.close(() => resolvePromise(true)),
    );
  });
}

async function connectHostPort(port) {
  return new Promise((resolvePromise) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (available) => {
      socket.destroy();
      resolvePromise(available);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(250, () => done(false));
  });
}

async function closeForward(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode != null) return;
  await new Promise((resolvePromise, reject) => {
    let hardTimer;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      hardTimer = setTimeout(
        () =>
          reject(
            new OperationalFailure(
              'Diagnostic forward did not terminate; inspect the owned process privately.',
            ),
          ),
        1000,
      );
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      resolvePromise();
    });
    child.kill('SIGTERM');
  });
}

async function hostPrerequisites({
  ports,
  call,
  state,
  lookupHost,
  probePort,
}) {
  for (const hostname of ['app.equipment.test', 'identity.equipment.test']) {
    let timer;
    let addresses;
    try {
      addresses = await Promise.race([
        lookupHost(hostname, { all: true }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new OperationalFailure(
                  `DNS lookup for ${hostname} exceeded 5 seconds.`,
                ),
              ),
            5000,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof OperationalFailure) throw error;
      throw new OperationalFailure(
        'DNS prerequisite lookup failed; verify local DNS and certificate trust privately.',
      );
    } finally {
      clearTimeout(timer);
    }
    if (
      !addresses.length ||
      addresses.some((entry) => entry.address !== '127.0.0.1')
    )
      throw new OperationalFailure(
        `Resolve ${hostname} to 127.0.0.1 explicitly before setup.`,
      );
  }
  for (const port of ports) {
    if (!(await probePort(port)))
      throw new OperationalFailure(
        `Port ${port} is unavailable; stop its owner explicitly.`,
      );
  }
  for (const name of ['tls.crt', 'tls.key', 'ca.crt']) {
    const path = join(state, name);
    if (
      !existsSync(path) ||
      !lstatSync(path).isFile() ||
      lstatSync(path).isSymbolicLink()
    )
      throw new OperationalFailure(
        `Prepare private ${path} using your explicitly trusted local CA; setup never installs trust.`,
      );
  }
  if ((lstatSync(join(state, 'tls.key')).mode & 0o777) !== 0o600)
    throw new OperationalFailure('tls.key must have mode 0600.');
  let certificate;
  try {
    certificate = new X509Certificate(readFileSync(join(state, 'tls.crt')));
  } catch {
    throw new OperationalFailure(
      'Invalid local TLS certificate; prepare the owner-issued local leaf privately.',
    );
  }
  for (const hostname of ['app.equipment.test', 'identity.equipment.test'])
    if (
      certificate.checkHost(hostname, {
        subject: 'never',
        wildcards: false,
      }) !== hostname
    )
      throw new OperationalFailure(
        `Local TLS certificate requires an exact DNS SAN for ${hostname}.`,
      );
  if (certificate.checkIP('127.0.0.1') !== '127.0.0.1')
    throw new OperationalFailure(
      'Local TLS certificate requires IP SAN 127.0.0.1 for authenticated Argo access.',
    );
  call('openssl', [
    'verify',
    '-CAfile',
    join(state, 'ca.crt'),
    '-purpose',
    'sslserver',
    join(state, 'tls.crt'),
  ]);
  call('openssl', [
    'x509',
    '-checkend',
    '86400',
    '-noout',
    '-in',
    join(state, 'tls.crt'),
  ]);
  const certPublic = call('openssl', [
    'x509',
    '-pubkey',
    '-noout',
    '-in',
    join(state, 'tls.crt'),
  ]);
  const keyPublic = call('openssl', [
    'pkey',
    '-pubout',
    '-in',
    join(state, 'tls.key'),
  ]);
  if (certPublic.trim() !== keyPublic.trim())
    throw new OperationalFailure('TLS certificate and key do not match.');
  const caRoot = call('mkcert', ['-CAROOT']).trim();
  if (
    readFileSync(join(caRoot, 'rootCA.pem'), 'utf8').trim() !==
    readFileSync(join(state, 'ca.crt'), 'utf8').trim()
  )
    throw new OperationalFailure(
      'Public CA must match your explicitly installed mkcert CA.',
    );
  call('security', [
    'verify-cert',
    '-c',
    join(state, 'tls.crt'),
    '-p',
    'ssl',
    '-s',
    'identity.equipment.test',
  ]);
}

export function buildPrivateResources({
  bundle,
  tlsCertificate,
  tlsKey,
  caCertificate,
}) {
  return [
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'equipment-credentials', namespace },
      type: 'Opaque',
      stringData: Object.fromEntries(
        secretNames.map((name) => [name, bundle[name]]),
      ),
    },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'equipment-tls', namespace },
      type: 'kubernetes.io/tls',
      stringData: { 'tls.crt': tlsCertificate, 'tls.key': tlsKey },
    },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'argocd-server-tls', namespace: 'argocd' },
      type: 'kubernetes.io/tls',
      stringData: { 'tls.crt': tlsCertificate, 'tls.key': tlsKey },
    },
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'equipment-ca', namespace },
      data: { 'ca.crt': caCertificate },
    },
  ];
}

export function createLifecycle({
  root = repository,
  run = processRun,
  lookupHost = lookup,
  probePort = probeHostPort,
  connectPort = connectHostPort,
  spawnChild = spawn,
  output = console.log,
} = {}) {
  const state = join(root, '.local/kubernetes');
  const bundlePath = join(state, 'credentials.json');
  let deadline = Infinity;

  function call(command, args, options = {}) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new OperationalFailure(
        'Setup exceeded its 15 minute budget; inspect status before retrying.',
      );
    let operation = 'local private provider operation';
    let policy = 'private-capture';
    if (command === 'kind' && ['create', 'delete'].includes(args[0])) {
      operation = 'local cluster lifecycle';
      policy = 'stream';
    } else if (command === 'kind' && args[0] === 'get') {
      operation = 'local cluster discovery';
      policy = 'public-capture';
    } else if (command === 'kubectl' && args[0] === 'kustomize') {
      operation = 'local public manifest rendering';
      policy = 'public-capture';
    } else if (command === 'kubectl' && args.includes('rollout')) {
      operation = 'local deployment rollout';
      policy = 'stream';
    } else if (command === 'kubectl' && args.includes('wait')) {
      operation = 'local bootstrap completion';
      policy = 'stream';
    } else if (command === 'kubectl' && args.includes('get')) {
      operation = 'local private resource inspection';
    } else if (
      command === 'openssl' ||
      command === 'mkcert' ||
      command === 'security'
    ) {
      operation = 'local private TLS verification';
    } else if (command === process.execPath) {
      operation = 'local smoke verification';
    } else if (command === 'git') {
      operation = 'local release reference inspection';
    }
    const execution = {
      operation,
      tool: command === process.execPath ? 'node' : command,
      output: policy,
      ...options,
    };
    const started = Date.now();
    try {
      return run(command, args, {
        cwd: root,
        inherit: false,
        ...execution,
        timeout: Math.min(options.timeout ?? 180000, remaining),
      });
    } catch (error) {
      throw processFailure(error, {
        operation: execution.operation,
        tool: execution.tool,
        output: execution.output,
        durationMs: Date.now() - started,
      });
    }
  }

  function kubectl(args, options) {
    return call(
      'kubectl',
      [
        '--kubeconfig',
        join(state, 'kubeconfig'),
        '--context',
        context,
        '--request-timeout=15s',
        ...args,
      ],
      options,
    );
  }

  function privateFile(path, mode) {
    const info = lstatSync(path);
    if (
      info.isSymbolicLink() ||
      (info.mode & 0o777) !== mode ||
      (mode === 0o700 ? !info.isDirectory() : !info.isFile())
    )
      throw new OperationalFailure(
        `Private state requires ${mode === 0o700 ? '0700 directory' : '0600 regular file'}: ${path}`,
      );
  }

  function credentials(durable) {
    const parent = join(root, '.local');
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
      throw new OperationalFailure('Private state parent cannot be a symlink.');
    if (existsSync(state)) privateFile(state, 0o700);
    else mkdirSync(state, { recursive: true, mode: 0o700 });
    if (existsSync(bundlePath)) {
      privateFile(bundlePath, 0o600);
      let bundle;
      try {
        bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
      } catch {
        throw new OperationalFailure(
          'Invalid private credential bundle; restore the original private bundle.',
        );
      }
      if (
        bundle.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(bundle.owner) ||
        secretNames.some((name) => !/^[a-f0-9]{64}$/.test(bundle[name]))
      )
        throw new OperationalFailure(
          'Invalid private credential bundle; restore the original private bundle.',
        );
      return bundle;
    }
    if (durable || existsSync(join(state, 'kubeconfig')))
      throw new OperationalFailure(
        'Durable state survives missing credentials: restore the original private credential bundle from your private backup; never generate replacement passwords. Explicit reset/teardown requires original ownership state.',
      );
    const bundle = { version: 1, owner: randomBytes(32).toString('hex') };
    for (const name of secretNames)
      bundle[name] = randomBytes(32).toString('hex');
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    return bundle;
  }

  function hasCluster() {
    return call('kind', ['get', 'clusters'])
      .trim()
      .split(/\s+/)
      .includes(cluster);
  }

  function owned() {
    if (!hasCluster())
      throw new OperationalFailure(
        `Named cluster ${cluster} is absent; use setup.`,
      );
    const bundle = credentials(true);
    privateFile(join(state, 'kubeconfig'), 0o600);
    const marker = kubectl([
      '--namespace',
      'kube-system',
      'get',
      'configmap',
      'equipment-local-owner',
      '-o',
      'jsonpath={.data.id}',
    ]).trim();
    if (marker !== bundle.owner)
      throw new OperationalFailure(
        `Cluster ownership mismatch for ${cluster}; refusing operation.`,
      );
    return bundle;
  }

  async function prerequisites() {
    const tools = {
      podman: ['--version'],
      git: ['--version'],
      kind: ['version'],
      kubectl: ['version', '--client'],
      mkcert: ['-version'],
      openssl: ['version'],
      security: ['help'],
    };
    for (const [tool, args] of Object.entries(tools)) {
      try {
        call(tool, args);
      } catch (error) {
        throw new OperationalFailure(
          `${tool} is required; install it yourself, then rerun prerequisites. ${safeFailure(error, 'Prerequisite check failed.')}`,
        );
      }
    }
    if (!/^kind v0\.33\.0(?:\s|$)/.test(call('kind', ['version'])))
      throw new OperationalFailure('kind v0.33.0 is required.');
    if (
      JSON.parse(call('kubectl', ['version', '--client', '-o', 'json']))
        .clientVersion?.gitVersion !== 'v1.35.8'
    )
      throw new OperationalFailure('kubectl v1.35.8 is required.');
    const machine = JSON.parse(call('podman', ['machine', 'inspect']));
    const vm = machine.find((item) => item.State === 'running');
    if (
      !vm ||
      !vm.Rootful ||
      !Number.isFinite(vm.Resources?.CPUs) ||
      !Number.isFinite(vm.Resources?.Memory) ||
      vm.Resources?.CPUs < 6 ||
      vm.Resources?.Memory < 11000
    )
      throw new OperationalFailure(
        'Existing running rootful Podman VM requires >=6 CPU and >=11000 MiB; owner must make any VM changes.',
      );
    if (
      call('podman', [
        'info',
        '--format',
        '{{.Host.Security.Rootless}}',
      ]).trim() !== 'false'
    )
      throw new OperationalFailure(
        'Podman connection must target the existing rootful VM.',
      );
    const free = Number(
      call('podman', [
        'machine',
        'ssh',
        "df -Pk /var | tail -1 | awk '{print $4}'",
      ]).trim(),
    );
    if (!Number.isFinite(free) || free < 20 * 1024 * 1024)
      throw new OperationalFailure('Existing VM requires >=20 GiB free disk.');
    const exists = hasCluster();
    if (exists) owned();
    await hostPrerequisites({
      ports: exists ? [] : [80, 443],
      call,
      state,
      lookupHost,
      probePort,
    });
    output(
      'Prerequisites passed; DNS, trust and VM settings were not changed.',
    );
  }

  function resource(kind, name, ns, data) {
    kubectl(
      [
        'apply',
        '--server-side',
        '--field-manager=equipment-private-setup',
        '-f',
        '-',
      ],
      {
        input: JSON.stringify({
          apiVersion: 'v1',
          kind,
          metadata: { name, namespace: ns },
          ...data,
        }),
      },
    );
  }

  function provision(bundle) {
    const resources = buildPrivateResources({
      bundle,
      tlsCertificate: readFileSync(join(state, 'tls.crt'), 'utf8'),
      tlsKey: readFileSync(join(state, 'tls.key'), 'utf8'),
      caCertificate: readFileSync(join(state, 'ca.crt'), 'utf8'),
    });
    for (const entry of resources)
      kubectl(
        [
          'apply',
          '--server-side',
          '--field-manager=equipment-private-setup',
          '-f',
          '-',
        ],
        { input: JSON.stringify(entry) },
      );
  }

  function suspend() {
    const controller = kubectl([
      '--namespace',
      'argocd',
      'get',
      'statefulset/argocd-application-controller',
      '--ignore-not-found',
      '-o',
      'name',
    ]).trim();
    if (!controller) return;
    kubectl([
      '--namespace',
      'argocd',
      'scale',
      'statefulset/argocd-application-controller',
      '--replicas=0',
    ]);
    kubectl([
      '--namespace',
      'argocd',
      'wait',
      '--for=delete',
      'pod',
      '-l',
      'app.kubernetes.io/name=argocd-application-controller',
      '--timeout=180s',
    ]);
    const application = JSON.parse(
      kubectl([
        '--namespace',
        'argocd',
        'get',
        'application',
        cluster,
        '--ignore-not-found',
        '-o',
        'json',
      ]) || '{}',
    );
    if (application.metadata?.finalizers?.length)
      throw new OperationalFailure(
        'Unexpected Application finalizer; refusing cascading deletion.',
      );
    kubectl([
      '--namespace',
      'argocd',
      'delete',
      'application',
      cluster,
      '--ignore-not-found',
      '--cascade=orphan',
      '--wait=true',
      '--timeout=180s',
    ]);
  }

  function requestFullSync(revision) {
    const application = JSON.parse(
      kubectl([
        '--namespace',
        'argocd',
        'get',
        'application',
        cluster,
        '-o',
        'json',
      ]),
    );
    if (!application.metadata?.resourceVersion || application.operation)
      throw new OperationalFailure(
        'Application changed or already has an operation; inspect status privately before retrying.',
      );
    const policy = application.spec?.syncPolicy;
    const retry = policy?.retry;
    const options = policy?.syncOptions;
    if (
      retry?.limit !== 2 ||
      retry.backoff?.duration !== '5s' ||
      retry.backoff?.factor !== 2 ||
      retry.backoff?.maxDuration !== '20s' ||
      options?.length !== 2 ||
      !options.includes('CreateNamespace=false') ||
      !options.includes('FailOnSharedResource=true')
    )
      throw new OperationalFailure(
        'Unexpected Application sync/retry policy; refusing full sync.',
      );
    const request = randomBytes(16).toString('hex');
    const operation = {
      initiatedBy: { username: 'equipment-local-cli' },
      info: [{ name: 'equipment-local-request', value: request }],
      retry,
      sync: { revision, prune: true, syncOptions: options },
    };
    kubectl([
      '--namespace',
      'argocd',
      'patch',
      'application',
      cluster,
      '--type=json',
      '-p',
      JSON.stringify([
        {
          op: 'test',
          path: '/metadata/resourceVersion',
          value: application.metadata.resourceVersion,
        },
        { op: 'add', path: '/operation', value: operation },
      ]),
    ]);
    return request;
  }

  async function waitCurrentSync(request, revision) {
    const syncDeadline = Math.min(deadline, Date.now() + 600000);
    while (Date.now() < syncDeadline) {
      const application = JSON.parse(
        kubectl([
          '--namespace',
          'argocd',
          'get',
          'application',
          cluster,
          '-o',
          'json',
        ]),
      );
      const status = application.status;
      const current = status?.operationState;
      const matches = current?.operation?.info?.some(
        (item) =>
          item.name === 'equipment-local-request' && item.value === request,
      );
      if (matches) {
        if (['Failed', 'Error', 'Terminating'].includes(current.phase))
          throw new OperationalFailure(
            'Current Argo sync failed; inspect retained hook diagnostics privately before an explicit retry.',
          );
        if (current.phase === 'Succeeded') {
          if (
            current.syncResult?.revision !== revision ||
            (status.sync?.revision && status.sync.revision !== revision)
          )
            throw new OperationalFailure(
              'Current Argo sync resolved an unexpected revision; refusing stale deployment success.',
            );
          if (
            status.health?.status === 'Healthy' &&
            status.sync?.status === 'Synced' &&
            status.sync.revision === revision
          )
            return;
        }
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
    throw new OperationalFailure(
      'Current Argo sync exceeded its 10 minute budget; inspect operation and retained hook diagnostics privately.',
    );
  }

  async function perform(args) {
    const [command, flag, ...extra] = args;
    if (
      extra.length ||
      ![
        'prerequisites',
        'setup',
        'status',
        'access',
        'smoke',
        'stop',
        'reset',
        'teardown',
      ].includes(command)
    )
      throw new OperationalFailure(usage);
    if (command === 'reset' && flag !== '--confirm-delete-data')
      throw new OperationalFailure(
        'reset requires --confirm-delete-data: deletes equipment namespace data only.',
      );
    if (command === 'teardown' && flag !== '--confirm-delete-cluster')
      throw new OperationalFailure(
        'teardown requires --confirm-delete-cluster: deletes equipment-local cluster and its data.',
      );
    if (command === 'access' && !['argocd', 'dashboard'].includes(flag))
      throw new OperationalFailure(usage);
    if (
      command === 'smoke' &&
      flag &&
      !['--capture-persistence', '--verify-persistence'].includes(flag)
    )
      throw new OperationalFailure(usage);
    if (!['reset', 'teardown', 'access', 'smoke'].includes(command) && flag)
      throw new OperationalFailure(usage);
    if (command === 'prerequisites') return prerequisites();
    if (command === 'setup') {
      const exists = hasCluster();
      if (exists) owned();
      const { readComponentState, verifyComponentIndex } =
        await import('./deployment-validation.mjs');
      const selected = readComponentState(root, { requireComplete: true });
      for (const record of Object.values(selected.records))
        verifyComponentIndex(record, (image) => {
          const raw = call('podman', ['manifest', 'inspect', image]);
          try {
            return JSON.parse(raw);
          } catch {
            throw new OperationalFailure(
              'Published component index response is invalid JSON; private response suppressed.',
            );
          }
        });
      await prerequisites();
      const remote = call(
        'git',
        [
          'ls-remote',
          '--exit-code',
          '--refs',
          'https://github.com/cosminstirbu/equipment-reservations-lab.git',
          'refs/heads/main',
        ],
        { timeout: 15000, env: { GIT_TERMINAL_PROMPT: '0' } },
      ).trim();
      const match = /^([a-f0-9]{40})\s+refs\/heads\/main$/.exec(remote);
      if (!match)
        throw new OperationalFailure(
          'Cannot resolve exact reviewed main revision; refusing setup.',
        );
      const revision = match[1];
      const bundle = credentials(exists);
      if (exists) suspend();
      if (!exists) {
        call('kind', [
          'create',
          'cluster',
          '--name',
          cluster,
          '--config',
          join(root, 'deploy/platform/kind.yaml'),
          '--kubeconfig',
          join(state, 'kubeconfig'),
          '--wait',
          '180s',
        ]);
        chmodSync(join(state, 'kubeconfig'), 0o600);
        resource('ConfigMap', 'equipment-local-owner', 'kube-system', {
          data: { id: bundle.owner },
        });
      } else owned();
      kubectl(['apply', '-f', join(root, 'deploy/platform/namespaces.yaml')]);
      call('podman', [
        'exec',
        `${cluster}-control-plane`,
        'mkdir',
        '-p',
        '/var/local/equipment/postgres',
        '/var/local/equipment/rabbitmq',
      ]);
      call('podman', [
        'exec',
        `${cluster}-control-plane`,
        'chown',
        '999:999',
        '/var/local/equipment/postgres',
        '/var/local/equipment/rabbitmq',
      ]);
      call('podman', [
        'exec',
        `${cluster}-control-plane`,
        'chmod',
        '0700',
        '/var/local/equipment/postgres',
        '/var/local/equipment/rabbitmq',
      ]);
      kubectl(['apply', '-f', join(root, 'deploy/platform/storage.yaml')]);
      provision(bundle);
      kubectl(['apply', '-k', join(root, 'deploy/platform')]);
      kubectl([
        'apply',
        '--server-side',
        '--field-manager=equipment-local-platform',
        '-k',
        join(root, 'deploy/argocd'),
      ]);
      kubectl([
        'wait',
        '--for=condition=Established',
        'crd/applications.argoproj.io',
        'crd/appprojects.argoproj.io',
        '--timeout=180s',
      ]);
      suspend();
      kubectl(['apply', '-f', join(root, 'deploy/argocd/local.yaml')]);
      const syncRequest = requestFullSync(revision);
      kubectl([
        '--namespace',
        'argocd',
        'scale',
        'statefulset/argocd-application-controller',
        '--replicas=1',
      ]);
      await waitCurrentSync(syncRequest, revision);
      kubectl([
        '--namespace',
        namespace,
        'wait',
        '--for=condition=Available',
        'deployment',
        '--all',
        '--timeout=180s',
      ]);
      output(
        'Setup submitted and deployments available; run smoke and browser acceptance separately. Credentials remain in the private bundle.',
      );
      return;
    }
    owned();
    if (command === 'status') {
      output(kubectl(['--namespace', namespace, 'get', 'pods,pvc,jobs']));
      return;
    }
    if (command === 'access') {
      const dashboard = flag === 'dashboard';
      output(
        `Authenticate manually using private credentials. Forward runs for at most 180 seconds at ${dashboard ? 'http://127.0.0.1:18888' : 'https://127.0.0.1:18443'}. No token URL is printed.`,
      );
      kubectl(
        [
          '--namespace',
          dashboard ? namespace : 'argocd',
          'port-forward',
          '--address=127.0.0.1',
          dashboard ? 'service/dashboard' : 'service/argocd-server',
          dashboard ? '18888:18888' : '18443:443',
        ],
        { operation: 'local authenticated access forward' },
      );
      return;
    }
    if (command === 'smoke') {
      const { readComponentState } =
        await import('./deployment-validation.mjs');
      readComponentState(root, { requireComplete: true });
      const statePath = join(state, 'smoke-state.json');
      if (existsSync(statePath)) privateFile(statePath, 0o600);
      privateFile(join(state, 'ca.crt'), 0o600);
      const configuration = {
        applicationOrigin: 'https://app.equipment.test',
        authority: 'https://identity.equipment.test/realms/equipment',
        context,
        credentialsFile: bundlePath,
        caFile: join(state, 'ca.crt'),
        dashboardOrigin: 'http://127.0.0.1:18888',
        otlpOrigin: 'http://127.0.0.1:18890',
      };
      writeFileSync(statePath, JSON.stringify(configuration, null, 2) + '\n', {
        mode: 0o600,
      });
      const invokeSmoke = () =>
        call(
          process.execPath,
          [
            join(root, 'scripts/deployment-smoke.mjs'),
            '--state',
            state,
            ...(flag ? [flag] : []),
          ],
          {
            timeout: 600000,
            output: 'stream',
            operation: 'local smoke verification',
            env: {
              NODE_EXTRA_CA_CERTS: join(state, 'ca.crt'),
              EQUIPMENT_DASHBOARD_ORIGIN: configuration.dashboardOrigin,
              EQUIPMENT_OTLP_ORIGIN: configuration.otlpOrigin,
            },
          },
        );
      if (flag === '--verify-persistence') {
        invokeSmoke();
        output('Persistence verification passed.');
        return;
      }
      for (const port of [18888, 18890])
        if (!(await probePort(port)))
          throw new OperationalFailure(
            `Diagnostic port ${port} is occupied; stop its owner explicitly.`,
          );
      const child = spawnChild(
        'kubectl',
        [
          '--kubeconfig',
          join(state, 'kubeconfig'),
          '--context',
          context,
          '--namespace',
          namespace,
          'port-forward',
          '--address=127.0.0.1',
          'service/dashboard',
          '18888:18888',
          '18890:18890',
        ],
        {
          cwd: root,
          env: { ...process.env, KIND_EXPERIMENTAL_PROVIDER: 'podman' },
          stdio: 'ignore',
        },
      );
      const forwardStarted = Date.now();
      output('Diagnostic forwarding starting on loopback.');
      child.stdout?.resume();
      child.stderr?.resume();
      let failed;
      child.on('error', (error) => {
        failed = processFailure(error, {
          operation: 'diagnostic forward startup',
          tool: 'kubectl',
          durationMs: Date.now() - forwardStarted,
        });
      });
      child.on('exit', (status, signal) => {
        failed = processFailure(
          { status, signal },
          {
            operation: 'diagnostic forward unexpected exit',
            tool: 'kubectl',
            durationMs: Date.now() - forwardStarted,
          },
        );
      });
      let primary;
      try {
        const readyDeadline = Date.now() + 15000;
        while (true) {
          const ready =
            (await connectPort(18888)) && (await connectPort(18890));
          if (failed) throw failed;
          if (ready) break;
          if (Date.now() >= readyDeadline)
            throw new OperationalFailure(
              'Diagnostic forwarding exceeded its 15 second readiness budget.',
            );
          await new Promise((resolvePromise) =>
            setTimeout(resolvePromise, 100),
          );
        }
        output('Diagnostic forwarding ready on loopback.');
        invokeSmoke();
        if (failed) throw failed;
      } catch (error) {
        primary = error;
      } finally {
        await cleanupAll(
          [
            {
              operation: 'diagnostic forward shutdown',
              run: () => closeForward(child),
            },
          ],
          { primary, report: output },
        );
      }
      output('Deployment smoke passed.');
      return;
    }
    suspend();
    if (command === 'stop') {
      const jobs = kubectl([
        '--namespace',
        namespace,
        'get',
        'jobs',
        '-o',
        'name',
      ])
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const job of jobs) {
        if (!/^job\.batch\/[a-z0-9-]+$/.test(job))
          throw new OperationalFailure(
            'Unexpected Job name; refusing mutation.',
          );
        kubectl([
          '--namespace',
          namespace,
          'patch',
          job,
          '--type=merge',
          '-p',
          JSON.stringify({ spec: { suspend: true } }),
        ]);
      }
      kubectl([
        '--namespace',
        namespace,
        'scale',
        'deployment,statefulset',
        '--all',
        '--replicas=0',
      ]);
      output(
        'Stopped application reconciliation and workloads; credentials and durable volumes retained.',
      );
    } else if (command === 'reset') {
      kubectl([
        'delete',
        'namespace',
        namespace,
        '--ignore-not-found',
        '--wait=true',
        '--timeout=180s',
      ]);
      kubectl([
        'delete',
        'pv',
        'equipment-postgres',
        'equipment-rabbitmq',
        '--ignore-not-found',
        '--wait=true',
        '--timeout=180s',
      ]);
      call('podman', [
        'exec',
        `${cluster}-control-plane`,
        'rm',
        '-rf',
        '--',
        '/var/local/equipment/postgres',
        '/var/local/equipment/rabbitmq',
      ]);
      output(
        'Reset only equipment application data; private credentials retained. Setup recreates application resources.',
      );
    } else {
      call('kind', ['delete', 'cluster', '--name', cluster]);
      output(
        'Deleted only equipment-local cluster and its data; private credentials retained for explicit recovery.',
      );
    }
  }

  async function execute(args) {
    if (!['setup', 'stop', 'reset', 'teardown', 'smoke'].includes(args[0])) {
      try {
        return await perform(args);
      } catch (error) {
        throw error instanceof OperationalFailure
          ? error
          : new OperationalFailure(
              'Local private response or state is invalid; raw details suppressed.',
            );
      }
    }
    if (
      existsSync(join(root, '.local')) &&
      lstatSync(join(root, '.local')).isSymbolicLink()
    )
      throw new OperationalFailure('Private state parent cannot be a symlink.');
    if (existsSync(state)) privateFile(state, 0o700);
    else mkdirSync(state, { recursive: true, mode: 0o700 });
    const lock = join(state, 'operation.lock');
    try {
      mkdirSync(lock, { mode: 0o700 });
    } catch {
      throw new OperationalFailure(
        'An operation lock exists; verify no operator command is running before explicitly removing the private operation.lock directory.',
      );
    }
    deadline = args[0] === 'setup' ? Date.now() + 900000 : Infinity;
    let primary;
    try {
      return await perform(args);
    } catch (error) {
      primary =
        error instanceof OperationalFailure
          ? error
          : new OperationalFailure(
              'Local private response or state is invalid; raw details suppressed.',
            );
    } finally {
      deadline = Infinity;
      await cleanupAll(
        [
          {
            operation: 'local operation lock cleanup',
            run: () => rmSync(lock, { recursive: true }),
          },
        ],
        { primary, report: output },
      );
    }
  }

  return { execute, credentials };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  createLifecycle()
    .execute(process.argv.slice(2))
    .catch((error) => {
      console.error(
        safeFailure(
          error,
          'Local operation failed; private provider details suppressed.',
        ),
      );
      process.exitCode = 1;
    });
}
