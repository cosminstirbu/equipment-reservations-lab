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
import { execFileSync } from 'node:child_process';
import {
  imageNames,
  validateRelease,
  verifyReleaseIndexes,
  readPublicFile,
  readJobInputs,
  jobSuffix,
  validateManifests,
  validateCommittedDeployment,
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
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 900000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  } catch {
    throw new Error(
      `${command} failed or timed out; private provider output is suppressed.`,
    );
  }
};

export function buildImages({
  sourceRevision,
  repository,
  publish = false,
  run = execute,
  metadata = (path) => JSON.parse(readFileSync(path, 'utf8')),
}) {
  if (!/^[a-f0-9]{40}$/.test(sourceRevision))
    throw new Error('Exact source revision required');
  if (publish && !/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''))
    throw new Error('Publication repository required');
  const directory = mkdtempSync(join(tmpdir(), 'equipment-build-'));
  try {
    const images = {};
    for (const name of imageNames) {
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
        publish ? 'linux/amd64,linux/arm64' : 'linux/amd64',
        publish ? '--push' : '--load',
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
      run('docker', args);
      images[name] = {
        image,
        digest: metadata(path)['containerimage.digest'],
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
    if (publish) validateRelease(release);
    return {
      ...release,
      tags: Object.values(images).map((entry) => entry.tag),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function documents(rendered) {
  return rendered
    .split(/^---\s*$/m)
    .filter((text) => text.trim())
    .map((text) => {
      const parsed = parsers.Yaml.parse(text);
      if (parsed.diagnostics.some((item) => item.severity === 0))
        throw new Error('Invalid CI manifest YAML');
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
    throw new Error('Unexpected or ambiguous application image reference');
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
          throw new Error('Missing actual locally built CI image');
        container.image = tag;
        container.imagePullPolicy = 'Never';
      } else if (!/@sha256:[a-f0-9]{64}$/.test(container.image))
        throw new Error('Unexpected unpinned CI image');
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
    throw new Error('Invalid source image overlay');
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
    if (!resource) throw new Error(`Missing actual ${name} bootstrap Job`);
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

export function createEphemeralCluster({
  fixture,
  release,
  run = execute,
  root = process.cwd(),
}) {
  if (!fixture)
    throw new Error(
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
      if (resource.kind === 'Job')
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const publish = process.argv[2] === 'publish';
  if (publish) {
    if (
      process.env.GITHUB_EVENT_NAME !== 'push' ||
      process.env.GITHUB_REF !== 'refs/heads/main'
    )
      throw new Error(
        'Publication requires the separately authorized main release job',
      );
    validateCommittedDeployment(process.cwd());
    const release = buildImages({
      sourceRevision: process.env.GITHUB_SHA,
      repository: process.env.GITHUB_REPOSITORY,
      publish: true,
    });
    delete release.tags;
    verifyReleaseIndexes(release);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `release=${JSON.stringify(release)}\n`,
    );
  } else {
    if (process.argv.length > 2)
      throw new Error('Usage: deployment-ci.mjs [publish]');
    if (process.env.GITHUB_ACTIONS !== 'true')
      throw new Error(
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
}
