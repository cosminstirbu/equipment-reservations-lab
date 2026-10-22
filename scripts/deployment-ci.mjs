import { Buffer } from 'node:buffer';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import parsers from '@stoplight/spectral-parsers';
import { createLifecycle, buildPrivateResources } from './local-kubernetes.mjs';
import {
  executeProcess,
  OperationalFailure,
  safeFailure,
  cleanupAllSync,
  processFailure,
} from './process.mjs';
import {
  imageNames,
  validateRelease,
  readPublicFile,
  readJobInputs,
  jobSuffix,
  validateManifests,
  validateCommittedDeployment,
  validateComponentRelease,
  verifyComponentIndex,
  validateIndex,
} from './deployment-validation.mjs';

const projects = {
  inventory: 'Inventory',
  reservations: 'Reservations',
  notifications: 'Notifications',
  'database-bootstrap': 'DatabaseBootstrap',
  'identity-bootstrap': 'IdentityBootstrap',
  'broker-bootstrap': 'BrokerBootstrap',
};
const nodeImage =
  'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0';
const execute = (command, args, options = {}) => {
  let operation = 'CI private provider operation';
  let output = 'private-capture';
  if (command === 'kind' && args[0] === 'create') {
    operation = 'CI cluster creation';
    output = 'stream';
  } else if (command === 'kind' && args[0] === 'load') {
    operation = 'CI image loading';
    output = 'stream';
  } else if (command === 'kubectl' && args[0] === 'kustomize') {
    operation = 'CI public manifest rendering';
    output = 'public-capture';
  } else if (command === 'kubectl' && args.includes('rollout')) {
    operation = 'CI deployment rollout';
    output = 'stream';
  } else if (command === 'kubectl' && args.includes('wait')) {
    operation = 'CI bootstrap completion';
    output = 'stream';
  } else if (command === 'kubectl' && args.includes('get')) {
    operation = 'CI private status projection';
  } else if (command === 'kubectl' && args.includes('logs')) {
    operation = 'CI private bootstrap log projection';
  } else if (command === 'openssl') {
    operation = 'CI private TLS provisioning';
  } else if (command === 'sudo') {
    operation = 'CI public hostname configuration';
    output = 'stream';
  }
  return executeProcess(command, args, {
    timeout: 900000,
    operation,
    output,
    tool: command,
    ...options,
  });
};

export function buildImages({
  sourceRevision,
  repository,
  publish = false,
  components = imageNames,
  load = true,
  run = execute,
  metadata = (path) => JSON.parse(readFileSync(path, 'utf8')),
}) {
  if (!/^[a-f0-9]{40}$/.test(sourceRevision))
    throw new OperationalFailure('Exact source revision required');
  if (publish && !/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''))
    throw new OperationalFailure('Publication repository required');
  if (
    !Array.isArray(components) ||
    !components.length ||
    components.some((name) => !imageNames.includes(name)) ||
    new Set(components).size !== components.length
  )
    throw new OperationalFailure(
      'Select known distinct application components',
    );
  const directory = mkdtempSync(join(tmpdir(), 'equipment-build-'));
  let primary;
  try {
    const images = {};
    for (const name of components) {
      const image = publish
        ? `ghcr.io/${repository.toLowerCase()}-${name}`
        : `equipment-ci/${name}`;
      const tag = `${image}:${sourceRevision}`;
      const path = join(directory, `${name}.json`);
      const kind =
        name === 'web'
          ? 'web'
          : name.endsWith('-bootstrap')
            ? 'bootstrap'
            : 'api';
      let exportArguments = ['--output', 'type=cacheonly', '--progress=plain'];
      if (publish) exportArguments = ['--push'];
      else if (load) exportArguments = ['--load'];
      const args = [
        'buildx',
        'build',
        '--file',
        `deploy/images/${kind}.Dockerfile`,
        '--tag',
        tag,
        '--metadata-file',
        path,
        '--platform',
        publish || !load ? 'linux/amd64,linux/arm64' : 'linux/amd64',
        ...exportArguments,
        '--label',
        `org.opencontainers.image.revision=${sourceRevision}`,
      ];
      if (publish)
        args.push(
          '--label',
          `org.opencontainers.image.source=https://github.com/${repository}`,
        );
      if (projects[name]) args.push('--build-arg', `PROJECT=${projects[name]}`);
      args.push('.');
      run('docker', args, {
        operation: `image build ${name}`,
        tool: 'docker',
        output: 'stream',
      });
      images[name] = {
        image,
        digest:
          publish || load ? metadata(path)['containerimage.digest'] : undefined,
        tag,
      };
    }
    const release = {
      sourceRevision,
      images: Object.fromEntries(
        Object.entries(images).map(([name, { image, digest }]) => [
          name,
          { image, digest },
        ]),
      ),
    };
    if (publish && components.length === imageNames.length)
      validateRelease(release);
    return {
      ...release,
      tags: Object.values(images).map((entry) => entry.tag),
    };
  } catch (error) {
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            'Image build failed; private provider and metadata details suppressed.',
          );
  } finally {
    cleanupAllSync(
      [
        {
          operation: 'image build temporary cleanup',
          tool: 'filesystem',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ],
      { primary },
    );
  }
}

function documents(rendered) {
  return rendered
    .split(/^---\s*$/m)
    .filter((text) => text.trim())
    .map((text) => {
      const parsed = parsers.Yaml.parse(text);
      if (parsed.diagnostics.some((item) => item.severity === 0))
        throw new OperationalFailure('Invalid CI manifest YAML');
      return parsed.data;
    });
}

export function ciResources(rendered, release, applicationReferences = {}) {
  if (
    Object.entries(applicationReferences).some(
      ([name, reference]) =>
        !imageNames.includes(name) ||
        !/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(reference),
    ) ||
    new Set(Object.values(applicationReferences)).size !==
      Object.keys(applicationReferences).length
  )
    throw new OperationalFailure(
      'Unexpected or ambiguous application image reference',
    );
  return documents(rendered).map((original) => {
    const resource = JSON.parse(
      JSON.stringify(original).replaceAll(
        '"equipment-local-control-plane"',
        '"equipment-ci-control-plane"',
      ),
    );
    const pod =
      resource.kind === 'Pod' ? resource.spec : resource.spec?.template?.spec;
    for (const container of [
      ...(pod?.initContainers ?? []),
      ...(pod?.containers ?? []),
    ]) {
      const name = imageNames.includes(container.image)
        ? container.image
        : Object.keys(applicationReferences).find(
            (name) => applicationReferences[name] === container.image,
          );
      if (name) {
        const tag = `equipment-ci/${name}:${release.sourceRevision}`;
        if (!release.tags.includes(tag))
          throw new OperationalFailure('Missing actual locally built CI image');
        container.image = tag;
        container.imagePullPolicy = 'Never';
      } else if (!/@sha256:[a-f0-9]{64}$/.test(container.image))
        throw new OperationalFailure('Unexpected unpinned CI image');
    }
    validateManifests(JSON.stringify(resource), {
      ciImages: release.tags,
      ciRevision: release.sourceRevision,
    });
    return resource;
  });
}

export function prepareCiFixture({
  directory,
  kubeconfig,
  context,
  release,
  root = process.cwd(),
  run = execute,
}) {
  validateCommittedDeployment(root);
  const state = join(directory, '.local/kubernetes');
  const bundle = createLifecycle({ root: directory }).credentials(false);
  function privateWrite(name, content) {
    const path = join(state, name);
    writeFileSync(path, content, { mode: 0o600 });
    return path;
  }
  const caKey = join(directory, 'ca.key');
  const ca = join(state, 'ca.crt');
  const tlsKey = join(state, 'tls.key');
  const tlsCertificate = join(state, 'tls.crt');
  const csr = join(state, 'tls.csr');
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    caKey,
    '-out',
    ca,
    '-days',
    '1',
    '-subj',
    '/CN=Equipment disposable CI CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  ]);
  run('openssl', [
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    tlsKey,
    '-out',
    csr,
    '-subj',
    '/CN=app.equipment.test',
  ]);
  const extensions = privateWrite(
    'tls.ext',
    'subjectAltName=DNS:app.equipment.test,DNS:identity.equipment.test,IP:127.0.0.1\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
  );
  run('openssl', [
    'x509',
    '-req',
    '-in',
    csr,
    '-CA',
    ca,
    '-CAkey',
    caKey,
    '-CAcreateserial',
    '-out',
    tlsCertificate,
    '-days',
    '1',
    '-extfile',
    extensions,
  ]);
  for (const path of [caKey, ca, tlsKey, tlsCertificate, csr])
    chmodSync(path, 0o600);
  const common = [
    '--kubeconfig',
    kubeconfig,
    '--context',
    context,
    '--request-timeout=15s',
  ];
  const kubectl = (args, options) =>
    run('kubectl', [...common, ...args], options);
  kubectl(['apply', '-f', join(root, 'deploy/platform/namespaces.yaml')]);
  for (const resource of buildPrivateResources({
    bundle,
    tlsCertificate: readFileSync(tlsCertificate, 'utf8'),
    tlsKey: readFileSync(tlsKey, 'utf8'),
    caCertificate: readFileSync(ca, 'utf8'),
  })) {
    kubectl(
      [
        'apply',
        '--server-side',
        '--field-manager=equipment-ci-private',
        '-f',
        '-',
      ],
      { input: JSON.stringify(resource) },
    );
  }
  for (const operation of [
    ['mkdir', '-p'],
    ['chown', '999:999'],
    ['chmod', '0700'],
  ])
    run('docker', [
      'exec',
      'equipment-ci-control-plane',
      ...operation,
      '/var/local/equipment/postgres',
      '/var/local/equipment/rabbitmq',
    ]);
  const platform = ciResources(
    run('kubectl', ['kustomize', join(root, 'deploy/platform')]),
    release,
  );
  const platformManifest = privateWrite(
    'platform.json',
    JSON.stringify({ apiVersion: 'v1', kind: 'List', items: platform }),
  );
  kubectl(['apply', '--dry-run=server', '-f', platformManifest]);
  kubectl(['apply', '-f', platformManifest]);
  kubectl([
    '--namespace',
    'equipment-platform',
    'rollout',
    'status',
    'deployment/traefik',
    '--timeout=180s',
  ]);
  kubectl([
    '--namespace',
    'kube-system',
    'rollout',
    'restart',
    'deployment/coredns',
  ]);
  kubectl([
    '--namespace',
    'kube-system',
    'rollout',
    'status',
    'deployment/coredns',
    '--timeout=180s',
  ]);
  run('sudo', ['tee', '-a', '/etc/hosts'], {
    input: '\n127.0.0.1 app.equipment.test identity.equipment.test\n',
  });
  const inputs = readJobInputs(root);
  const overlay = parsers.Yaml.parse(
    readPublicFile(root, 'deploy/environments/local/kustomization.yaml'),
  );
  if (overlay.diagnostics.some((item) => item.severity === 0))
    throw new OperationalFailure('Invalid source image overlay');
  const applicationReferences = Object.fromEntries(
    (overlay.data.images ?? [])
      .filter((entry) => imageNames.includes(entry.name))
      .map((entry) => [entry.name, `${entry.newName}@${entry.digest}`]),
  );
  const resources = ciResources(
    run('kubectl', ['kustomize', join(root, 'deploy/environments/local')]),
    release,
    applicationReferences,
  );
  for (const name of ['database', 'identity']) {
    const resource = resources.find(
      (item) =>
        item.kind === 'Job' &&
        item.metadata.labels?.['equipment.test/bootstrap'] === name,
    );
    if (!resource)
      throw new OperationalFailure(`Missing actual ${name} bootstrap Job`);
    resource.metadata.name = `${name}-bootstrap${jobSuffix({ sourceRevision: release.sourceRevision, images: release.images }, inputs.baseConfiguration, inputs.localConfiguration, inputs.jobs[name].template)}`;
  }
  const waves = [
    ...new Set(
      resources.map((resource) =>
        Number(
          resource.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ?? 0,
        ),
      ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((wave, index) => {
      const items = resources.filter(
        (resource) =>
          Number(
            resource.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ??
              0,
          ) === wave,
      );
      return {
        resources: items,
        manifests: privateWrite(
          `wave-${index}.json`,
          JSON.stringify({ apiVersion: 'v1', kind: 'List', items }),
        ),
      };
    });
  privateWrite(
    'smoke-state.json',
    JSON.stringify({
      applicationOrigin: 'https://app.equipment.test',
      authority: 'https://identity.equipment.test/realms/equipment',
      caFile: ca,
      credentialsFile: join(state, 'credentials.json'),
      context,
      kubeconfig,
      dashboardOrigin: 'http://127.0.0.1:18888',
      otlpOrigin: 'http://127.0.0.1:18890',
    }),
  );
  return { waves, state, ca };
}

const jobConditionTypes = new Set([
  'Complete',
  'Failed',
  'Suspended',
  'FailureTarget',
  'SuccessCriteriaMet',
]);
const jobConditionReasons = new Set([
  'BackoffLimitExceeded',
  'DeadlineExceeded',
  'PodFailurePolicy',
  'FailedIndexes',
  'SuccessPolicy',
  'CompletionsReached',
]);
const conditionStatuses = new Set(['True', 'False', 'Unknown']);
const podPhases = new Set([
  'Pending',
  'Running',
  'Succeeded',
  'Failed',
  'Unknown',
]);
const waitingReasons = new Set([
  'ImagePullBackOff',
  'ErrImagePull',
  'ErrImageNeverPull',
  'CreateContainerConfigError',
  'CreateContainerError',
  'CrashLoopBackOff',
  'ContainerCreating',
  'PodInitializing',
  'RunContainerError',
]);
const publicIdentity = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;

function diagnosticEnum(value, allowed) {
  return allowed.has(value) ? value : 'Other';
}

const bootstrapFailureTypes = new Set([
  'NpgsqlException',
  'PostgresException',
  'InvalidOperationException',
  'ArgumentException',
  'OperationCanceledException',
  'TimeoutException',
  'IOException',
  'UnauthorizedAccessException',
  'FormatException',
  'TypeInitializationException',
]);

function databaseFailureType(name, namespace, common, run) {
  try {
    const raw = run(
      'kubectl',
      [
        ...common.filter(
          (argument) => !argument.startsWith('--request-timeout='),
        ),
        '--request-timeout=5s',
        '--namespace',
        namespace,
        'logs',
        `job/${name}`,
        '--container=database-bootstrap',
        '--tail=100',
        '--limit-bytes=16384',
        '--pod-running-timeout=2s',
      ],
      { timeout: 6000, maxBuffer: 16384 },
    );
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384)
      throw new OperationalFailure(
        'Private diagnostic response exceeds bound.',
      );
    const matched = raw
      .split(/\r?\n/)
      .map(
        (line) =>
          line
            .trim()
            .match(
              /^Database provisioning failed \(([A-Za-z][A-Za-z0-9.]*)\)$/,
            )?.[1],
      )
      .filter(Boolean);
    if (matched.length === 1 && bootstrapFailureTypes.has(matched[0]))
      return { bootstrapFailureType: matched[0] };
  } catch {
    // Private log/query errors must neither escape nor replace Job status evidence.
  }
  return { bootstrapFailureTypeUnavailable: true };
}

function jobWaitFailure(resource, common, run) {
  const namespace = resource.metadata.namespace ?? 'equipment';
  const name = resource.metadata.name;
  if (
    typeof namespace !== 'string' ||
    namespace.length > 63 ||
    !publicIdentity.test(namespace) ||
    typeof name !== 'string' ||
    name.length > 63 ||
    !publicIdentity.test(name)
  )
    return new OperationalFailure(
      'CI Job wait failed for invalid public resource identity. {"diagnosticsUnavailable":true}',
    );
  const stage = `Job/${namespace}/${name}`;
  let status;
  try {
    const argumentsPrefix = [
      ...common.filter(
        (argument) => !argument.startsWith('--request-timeout='),
      ),
      '--request-timeout=5s',
      '--namespace',
      namespace,
    ];
    const query = (argumentsSuffix) => {
      const raw = run(
        'kubectl',
        [...argumentsPrefix, 'get', ...argumentsSuffix, '-o', 'json'],
        { timeout: 6000, maxBuffer: 128 * 1024 },
      );
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 128 * 1024)
        throw new OperationalFailure('Status response exceeds bound.');
      return JSON.parse(raw);
    };
    const job = query([`job/${name}`]);
    const pods = query([
      'pods',
      '--selector',
      `batch.kubernetes.io/job-name=${name}`,
    ]);
    const conditions = job?.status?.conditions ?? [];
    if (!Array.isArray(conditions) || !Array.isArray(pods?.items))
      throw new OperationalFailure('Status response has invalid shape.');
    status = {
      jobConditions: conditions.slice(0, 10).map((condition) => ({
        type: diagnosticEnum(condition?.type, jobConditionTypes),
        status: diagnosticEnum(condition?.status, conditionStatuses),
        reason: diagnosticEnum(condition?.reason, jobConditionReasons),
      })),
      pods: pods.items.slice(0, 10).map((pod) => {
        const init = pod?.status?.initContainerStatuses ?? [];
        const containers = pod?.status?.containerStatuses ?? [];
        if (!Array.isArray(init) || !Array.isArray(containers))
          throw new OperationalFailure(
            'Container status response has invalid shape.',
          );
        return {
          phase: diagnosticEnum(pod?.status?.phase, podPhases),
          containers: [...init, ...containers].slice(0, 10).map((container) => {
            const result = {};
            if (container?.state?.waiting)
              result.waitingReason = diagnosticEnum(
                container.state.waiting.reason,
                waitingReasons,
              );
            const exitCode = container?.state?.terminated?.exitCode;
            if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255)
              result.exitCode = exitCode;
            return result;
          }),
        };
      }),
    };
    if (Buffer.byteLength(JSON.stringify(status)) > 16 * 1024)
      throw new OperationalFailure(
        'Projected diagnostic response exceeds bound.',
      );
  } catch {
    status = { diagnosticsUnavailable: true };
  }
  if (
    namespace === 'equipment' &&
    /^database-bootstrap-[a-f0-9]{16}$/.test(name)
  )
    Object.assign(status, databaseFailureType(name, namespace, common, run));
  return new OperationalFailure(
    `CI wait failed for ${stage}. ${JSON.stringify(status)}`,
  );
}

export function createEphemeralCluster({
  fixture,
  release,
  run = execute,
  root = process.cwd(),
}) {
  if (!fixture)
    throw new OperationalFailure(
      'Real CI deployment fixture is required; local setup cannot substitute for this boundary',
    );
  validateCommittedDeployment(root);
  const directory = mkdtempSync(join(tmpdir(), 'equipment-ci-'));
  const kubeconfig = join(directory, 'kubeconfig');
  const config = parsers.Yaml.parse(
    readPublicFile(root, 'deploy/platform/kind.yaml'),
  ).data;
  config.name = 'equipment-ci';
  const configFile = join(directory, 'kind.json');
  writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
  run('kind', [
    'create',
    'cluster',
    '--name',
    'equipment-ci',
    '--image',
    nodeImage,
    '--config',
    configFile,
    '--kubeconfig',
    kubeconfig,
    '--wait',
    '120s',
  ]);
  chmodSync(kubeconfig, 0o600);
  for (const tag of release.tags)
    run('kind', ['load', 'docker-image', tag, '--name', 'equipment-ci']);
  const prepared = fixture({
    directory,
    kubeconfig,
    release,
    context: 'kind-equipment-ci',
    root,
    run,
  });
  const common = [
    '--kubeconfig',
    kubeconfig,
    '--context',
    'kind-equipment-ci',
    '--request-timeout=15s',
  ];
  for (const wave of prepared.waves) {
    run('kubectl', [
      ...common,
      'apply',
      '--dry-run=server',
      '-f',
      wave.manifests,
    ]);
    run('kubectl', [...common, 'apply', '-f', wave.manifests]);
    for (const resource of wave.resources) {
      const scoped = [
        ...common,
        '--namespace',
        resource.metadata.namespace ?? 'equipment',
      ];
      if (resource.kind === 'Deployment')
        run(
          'kubectl',
          [
            ...scoped,
            'rollout',
            'status',
            `deployment/${resource.metadata.name}`,
            '--timeout=300s',
          ],
          { timeout: 310000 },
        );
      if (resource.kind === 'Job') {
        try {
          run(
            'kubectl',
            [
              ...scoped,
              'wait',
              '--for=condition=Complete',
              `job/${resource.metadata.name}`,
              '--timeout=300s',
            ],
            { timeout: 310000 },
          );
        } catch (error) {
          const failure = processFailure(error, {
            operation: 'CI bootstrap completion',
            tool: 'kubectl',
          });
          const projection = jobWaitFailure(resource, common, run);
          throw new OperationalFailure(
            `${failure.message}\n${projection.message}`,
          );
        }
      }
    }
  }
  return {
    directory,
    kubeconfig,
    context: 'kind-equipment-ci',
    state: prepared.state,
    ca: prepared.ca,
  };
}

function pipelineSummary() {
  const outcomes = new Set(['success', 'failure', 'cancelled', 'skipped']);
  let needs = {};
  let selected = imageNames;
  let invalid = false;
  try {
    needs = JSON.parse(process.env.PIPELINE_NEEDS ?? '{}');
    const requested = JSON.parse(process.env.SELECTED_COMPONENTS ?? 'null');
    if (
      !Array.isArray(requested) ||
      requested.some((name) => !imageNames.includes(name)) ||
      new Set(requested).size !== requested.length
    )
      invalid = true;
    else selected = requested;
  } catch {
    invalid = true;
  }
  const status = (key) =>
    outcomes.has(needs?.[key]?.result) ? needs[key].result : 'missing';
  const lines = [
    `quality: ${status('quality')}`,
    `selection: ${status('select')}`,
  ];
  let failed =
    invalid ||
    status('quality') !== 'success' ||
    status('select') !== 'success';
  const lane =
    process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'pr' : 'component';
  for (const name of imageNames) {
    if (!selected.includes(name)) {
      lines.push(`${name}: not selected`);
      continue;
    }
    const result = status(`${lane}_${name.replaceAll('-', '_')}`);
    lines.push(`${name}: ${result}`);
    if (result !== 'success') failed = true;
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  if (failed)
    throw new OperationalFailure(
      'Required component work failed, was canceled, or is missing; rerun failed jobs or start a fresh run if retained evidence expired.',
    );
}

function componentBuild() {
  const component = process.argv[3];
  if (!imageNames.includes(component))
    throw new OperationalFailure('Select a known application component');
  let publish = false;
  let output;
  const flags = process.argv.slice(4);
  for (let index = 0; index < flags.length; index++) {
    if (flags[index] === '--publish' && !publish) publish = true;
    else if (flags[index] === '--output' && !output && flags[index + 1])
      output = flags[++index];
    else
      throw new OperationalFailure(
        'Usage: deployment-ci.mjs component NAME [--publish --output FILE]',
      );
  }
  const event = process.env.GITHUB_EVENT_NAME;
  const sourceRef = process.env.GITHUB_REF ?? '';
  const mainPush = event === 'push' && sourceRef === 'refs/heads/main';
  const manualBranch =
    event === 'workflow_dispatch' && /^refs\/heads\/[^\s]+$/.test(sourceRef);
  if (publish && !mainPush && !manualBranch)
    throw new OperationalFailure(
      'Publication requires an authorized main push or manual repository branch component job',
    );
  if (
    !publish &&
    (event !== 'pull_request' ||
      !/^refs\/pull\/[1-9]\d*\/merge$/.test(sourceRef))
  )
    throw new OperationalFailure(
      'Readonly component validation requires its pull-request context',
    );
  const sourceRevision = process.env.GITHUB_SHA;
  const repository = process.env.GITHUB_REPOSITORY;
  const identity = {
    id: Number(process.env.GITHUB_REPOSITORY_ID),
    name: repository,
  };
  const runId = Number(process.env.GITHUB_RUN_ID);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (
    publish &&
    (!output ||
      ![identity.id, runId, runAttempt].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ))
  )
    throw new OperationalFailure(
      'Publication requires an output path and exact repository/run identity',
    );
  validateCommittedDeployment(process.cwd());
  const built = buildImages({
    sourceRevision,
    repository,
    publish,
    components: [component],
    load: false,
  });
  if (!publish) {
    console.log(
      `Validated ${component} for linux/amd64 and linux/arm64 without publication.`,
    );
    return;
  }
  const entry = built.images[component];
  const record = validateComponentRelease({
    schemaVersion: 1,
    component,
    repository: identity,
    sourceRevision,
    sourceRef,
    runId,
    runAttempt,
    workflow: '.github/workflows/validate.yaml',
    ...entry,
  });
  const observed = verifyComponentIndex(record);
  const index = {
    mediaType: observed.mediaType,
    manifests: ['amd64', 'arm64'].map((architecture) => {
      const descriptor = observed.manifests.find(
        (item) =>
          item.platform?.os === 'linux' &&
          item.platform?.architecture === architecture,
      );
      return {
        digest: descriptor.digest,
        platform: { os: 'linux', architecture },
      };
    }),
  };
  validateIndex(index);
  const serialized = JSON.stringify({ record, index }, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > 64 * 1024)
    throw new OperationalFailure(
      'Public component result exceeds its 64KiB metadata bound.',
    );
  writeFileSync(output, serialized);
  console.log(`Published ${component}; immutable component result is ready.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv[2] === 'summary') {
      pipelineSummary();
    } else if (process.argv[2] === 'component') {
      componentBuild();
    } else {
      if (process.argv.length > 2)
        throw new OperationalFailure(
          'Usage: deployment-ci.mjs [component NAME [--publish --output FILE] | summary]',
        );
      if (process.env.GITHUB_ACTIONS !== 'true')
        throw new OperationalFailure(
          'Ephemeral CI deployment requires its isolated GitHub Actions runner',
        );
      validateCommittedDeployment(process.cwd());
      const release = buildImages({ sourceRevision: process.env.GITHUB_SHA });
      const prepared = createEphemeralCluster({
        fixture: prepareCiFixture,
        release,
      });
      appendFileSync(
        process.env.GITHUB_ENV,
        `EQUIPMENT_CI_STATE=${prepared.state}\nNODE_EXTRA_CA_CERTS=${prepared.ca}\n`,
      );
      console.log(
        'Ephemeral deployment is ready for separately invoked smoke; private credentials were not printed.',
      );
    }
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'CI build or deployment failed; private state and provider responses suppressed.',
      ),
    );
    process.exitCode = 1;
  }
}
