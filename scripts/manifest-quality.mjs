import { generatorInputSchemaVersion } from './azure-generator-input.mjs';
import {
  executeProcess,
  OperationalFailure,
  safeFailure,
  cleanupAllSync,
} from './process.mjs';
import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import parsers from '@stoplight/spectral-parsers';
import {
  qualityContext,
  verifiedTool,
  verifiedSchemas,
} from './azure-quality.mjs';
import { stageAzureFixture } from './azure-runtime-fixture.mjs';
import { workloadSecrets, recoveryWorkloadSecrets } from './azure-runtime.mjs';
import {
  readPublicFile,
  validateAzurePublication,
  canonicalRelease,
} from './deployment-validation.mjs';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

const componentNames = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const allowedPaths = new Set([
  'deploy/environments/local/kustomization.yaml',
  'deploy/environments/local/jobs/database/kustomization.yaml',
  'deploy/environments/local/jobs/identity/kustomization.yaml',
  ...componentNames.flatMap((name) => [
    `deploy/environments/local/releases/${name}.json`,
    `deploy/environments/local/images/${name}.yaml`,
  ]),
]);
const azureScripts = [
  'quality',
  'infrastructure',
  'operations',
  'recovery',
  'terraform',
  'runtime',
  'runtime-fixture',
  'provisioning',
];
const azurePaths = new Set([
  ...azureScripts.flatMap((name) => [
    `scripts/azure-${name}.mjs`,
    `scripts/azure-${name}.test.mjs`,
  ]),
  'scripts/azure-deployment.test.mjs',
  'scripts/azure-observability.test.mjs',
  'scripts/azure-workflows.test.mjs',
  ...['infrastructure', 'operations', 'destroy', 'recovery', 'images'].map(
    (name) => `.github/workflows/azure-${name}.yaml`,
  ),
  'docs/azure-aks.md',
]);
const azurePackageScripts = [
  'infra:tools',
  'infra:format',
  'infra:check',
  'infra:preflight',
  'infra:plan',
  'infra:apply',
  'infra:bootstrap',
  'infra:destroy',
  'azure:start',
  'azure:stop',
  'azure:backup',
  'azure:restore',
  'test:azure',
];
const azurePath = (path) =>
  azurePaths.has(path) ||
  /^(?:infra\/azure|deploy\/(?:environments|platform|argocd)\/azure)\/[A-Za-z0-9_./-]+$/.test(
    path,
  );
const sha = /^[a-f0-9]{40}$/;
const full = (reason) => ({ mode: 'full', paths: [], reason });
const git = (root, args) =>
  executeProcess('git', args, {
    cwd: root,
    operation: 'Manifest quality Git inspection',
    tool: 'git',
    output: 'private-capture',
    timeout: 15000,
    maxBuffer: 16 * 1024 * 1024,
  });

function azurePackageOnly(root, base, revision) {
  const metadata = (ref) => {
    const value = JSON.parse(git(root, ['show', `${ref}:package.json`]));
    if (
      !value ||
      Array.isArray(value) ||
      !value.scripts ||
      typeof value.scripts !== 'object' ||
      Array.isArray(value.scripts)
    )
      throw new Error();
    const scripts = { ...value.scripts };
    for (const name of azurePackageScripts) {
      if (Object.hasOwn(scripts, name) && typeof scripts[name] !== 'string')
        throw new Error();
      delete scripts[name];
    }
    return { ...value, scripts };
  };
  try {
    return isDeepStrictEqual(metadata(base), metadata(revision));
  } catch {
    return false;
  }
}

export function selectQuality({
  root,
  event,
  sourceRef,
  sourceRevision,
  baseRevision,
  fullQualityBaseline,
}) {
  if (
    !sha.test(sourceRevision ?? '') ||
    !['push', 'pull_request'].includes(event) ||
    (event === 'push' &&
      (sourceRef !== 'refs/heads/main' ||
        !sha.test(fullQualityBaseline?.sourceRevision ?? ''))) ||
    (event === 'pull_request' && !sha.test(baseRevision ?? ''))
  )
    return full('unproven-comparison');
  try {
    let base;
    if (event === 'push') {
      base = fullQualityBaseline.sourceRevision;
      git(root, ['merge-base', '--is-ancestor', base, sourceRevision]);
    } else
      base = git(root, ['merge-base', baseRevision, sourceRevision]).trim();
    const parts = git(root, [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--find-copies',
      base,
      sourceRevision,
    ]).split('\0');
    if (parts.pop() !== '') return full('unproven-comparison');
    const paths = [];
    let infrastructure = false;
    let local = false;
    for (let index = 0; index < parts.length;) {
      const status = parts[index++];
      let count;
      if (/^[AMD]$/.test(status)) count = 1;
      else if (/^[RC](?:100|[0-9]{1,2})$/.test(status)) count = 2;
      else return full('unsupported-change');
      for (let endpoint = 0; endpoint < count; endpoint++) {
        const path = parts[index++];
        const azure =
          azurePath(path) ||
          (path === 'package.json' &&
            azurePackageOnly(root, base, sourceRevision));
        if (!allowedPaths.has(path) && !azure) return full('outside-allowlist');
        infrastructure ||= azure;
        local ||= allowedPaths.has(path);
        paths.push(path);
      }
    }
    if (!paths.length) return full('empty-comparison');
    if (infrastructure && local) return full('mixed-azure-local-changes');
    return {
      mode: infrastructure ? 'infrastructure' : 'manifest',
      paths: [...new Set(paths)].sort(),
      reason: infrastructure ? 'azure-only-changes' : 'allowlisted-changes',
    };
  } catch {
    return full('unproven-comparison');
  }
}

export async function discoverFullQualityBaseline({
  root,
  repository,
  sourceRevision,
  gateway,
}) {
  if (
    !sha.test(sourceRevision ?? '') ||
    !Number.isSafeInteger(repository?.id) ||
    repository.id <= 0 ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository.name ?? '')
  )
    return null;
  const deadline = Date.now() + 60000;
  try {
    for (let page = 1; page <= 10 && Date.now() < deadline; page++) {
      const listing = await gateway.api(
        `/actions/workflows/validate.yaml/runs?branch=main&event=push&per_page=100&page=${page}`,
      );
      if (
        !Array.isArray(listing.workflow_runs) ||
        listing.workflow_runs.length > 100 ||
        !Number.isSafeInteger(listing.total_count) ||
        listing.total_count < 0
      )
        return null;
      for (const run of listing.workflow_runs) {
        if (Date.now() >= deadline) return null;
        if (
          !Number.isSafeInteger(run.id) ||
          run.id <= 0 ||
          !Number.isSafeInteger(run.run_attempt) ||
          run.run_attempt <= 0 ||
          run.path !== '.github/workflows/validate.yaml' ||
          run.event !== 'push' ||
          run.head_branch !== 'main' ||
          !sha.test(run.head_sha ?? '') ||
          run.repository?.id !== repository.id ||
          run.repository?.full_name !== repository.name ||
          run.head_repository?.id !== repository.id ||
          run.head_repository?.full_name !== repository.name
        )
          continue;
        const jobs = await gateway.api(
          `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        );
        if (
          !Array.isArray(jobs.jobs) ||
          jobs.jobs.length !== jobs.total_count ||
          jobs.jobs.length > 100
        )
          continue;
        const quality = jobs.jobs.filter((job) => job.name === 'quality');
        if (quality.length !== 1) continue;
        const job = quality[0];
        const markers = job.steps?.filter(
          (step) => step.name === 'Full application quality completed',
        );
        if (
          job.run_id !== run.id ||
          job.run_attempt !== run.run_attempt ||
          job.status !== 'completed' ||
          job.conclusion !== 'success' ||
          markers?.length !== 1 ||
          markers[0].status !== 'completed' ||
          markers[0].conclusion !== 'success'
        )
          continue;
        const deployment = jobs.jobs.filter(
          (candidate) =>
            candidate.name ===
            'Kubernetes verification / Kubernetes verification',
        );
        if (
          deployment.length !== 1 ||
          deployment[0].run_id !== run.id ||
          deployment[0].run_attempt !== run.run_attempt ||
          deployment[0].status !== 'completed' ||
          deployment[0].conclusion !== 'success'
        )
          continue;
        try {
          git(root, [
            'merge-base',
            '--is-ancestor',
            run.head_sha,
            sourceRevision,
          ]);
        } catch {
          continue;
        }
        return {
          sourceRevision: run.head_sha,
          runId: run.id,
          runAttempt: run.run_attempt,
        };
      }
      if (
        listing.workflow_runs.length < 100 ||
        page * 100 >= listing.total_count
      )
        return null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function validateStaticDeployment({ root, kubectl }) {
  if (!isAbsolute(kubectl ?? ''))
    throw new OperationalFailure('Explicit pinned kubectl path required');
  const { readComponentState, validateStaticManifests } =
    await import('./deployment-validation.mjs');
  const state = readComponentState(root, { requireComplete: false });
  const rendered = executeProcess(
    kubectl,
    ['kustomize', 'deploy/environments/local'],
    {
      cwd: root,
      operation: 'Manifest quality rendering',
      tool: 'kubectl',
      output: 'public-capture',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const resources = validateStaticManifests(rendered, state);
  return { status: state.status, resources: resources.length };
}

const runtimeFiles = {
  'deploy/environments/azure/runtime': [
    'kustomization.yaml',
    'identities.json',
    'projection.json',
  ],
  'deploy/platform/azure/runtime': [
    'kustomization.yaml',
    'identities.json',
    'projection.json',
    'argocd-bootstrap-patches.json',
    'argocd-bootstrap-resources.json',
    'recovery-qualification-bindings.json',
    'recovery-continuity-bindings.json',
  ],
  'deploy/platform/azure/recovery/runtime': [
    'kustomization.yaml',
    'identities.json',
    'projection.json',
    'bindings.json',
  ],
};

const installerOnlyFiles = [
  'deploy/platform/azure/runtime/recovery-continuity-bindings.json',
  'deploy/platform/azure/runtime/recovery-qualification-bindings.json',
  'deploy/platform/azure/runtime/argocd-bootstrap-patches.json',
  'deploy/platform/azure/runtime/argocd-bootstrap-resources.json',
];

function azureFailure(phase) {
  throw new OperationalFailure(
    `Azure manifest ${phase} failed; manifest contents suppressed`,
  );
}

function yamlDocuments(text) {
  return text
    .split(/^---\s*$/m)
    .filter((part) => part.trim())
    .map((part) => {
      const parsed = parsers.Yaml.parse(part);
      if (
        parsed.diagnostics.some((item) => item.severity === 0) ||
        !parsed.data ||
        typeof parsed.data !== 'object'
      )
        azureFailure('schema parsing');
      return parsed.data;
    });
}

function inspectAzureSource(root) {
  const deployRoot = resolve(root, 'deploy');
  const inspect = (directory) => {
    if (lstatSync(directory).isSymbolicLink())
      azureFailure('offline local inputs');
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) azureFailure('offline local inputs');
      if (stat.isDirectory()) inspect(path);
      else if (/^kustomization(?:\.(yaml|yml|json))?$/i.test(name)) {
        const [document] = yamlDocuments(readFileSync(path, 'utf8'));
        if (document?.helmCharts?.length) azureFailure('offline local inputs');
        const references = [
          ...(document?.resources ?? []),
          ...(document?.components ?? []),
          ...(document?.bases ?? []),
          ...(document?.crds ?? []),
          ...(document?.configurations ?? []),
          ...(document?.generators ?? []),
          ...(document?.transformers ?? []),
          ...(document?.openapi?.path ? [document.openapi.path] : []),
          ...(document?.replacements ?? [])
            .map((entry) => entry.path)
            .filter(Boolean),
          ...(document?.patchesJson6902 ?? [])
            .map((entry) => entry.path)
            .filter(Boolean),
          ...(document?.patches ?? [])
            .map((patch) => patch.path)
            .filter(Boolean),
          ...(document?.patchesStrategicMerge ?? []).filter(
            (patch) => typeof patch === 'string',
          ),
          ...[
            ...(document?.configMapGenerator ?? []),
            ...(document?.secretGenerator ?? []),
          ].flatMap((generator) =>
            [...(generator.files ?? []), ...(generator.envs ?? [])].map(
              (entry) => entry.split('=').at(-1),
            ),
          ),
        ];
        for (const reference of references) {
          if (
            typeof reference !== 'string' ||
            /[:?\\]/.test(reference) ||
            isAbsolute(reference)
          )
            azureFailure('offline local inputs');
          const target = resolve(directory, reference);
          if (
            installerOnlyFiles.some((entry) => {
              const expected = resolve(root, entry);
              return (
                target === expected ||
                (process.platform === 'win32' &&
                  target.toLowerCase() === expected.toLowerCase())
              );
            })
          )
            azureFailure('installer-only resource included in Kustomize');
          if (
            !target.startsWith(deployRoot + '/') &&
            !target.startsWith(deployRoot + '\\')
          )
            azureFailure('offline local inputs');
          if (!existsSync(target)) {
            const generated = [
              'deploy/environments/azure/runtime',
              'deploy/platform/azure/runtime',
              'deploy/platform/azure/recovery/runtime',
              ...Object.entries(runtimeFiles).flatMap(([directory, names]) =>
                names.map((name) => `${directory}/${name}`),
              ),
              ...componentNames.map(
                (component) =>
                  `deploy/environments/azure/images/${component}.yaml`,
              ),
            ].some((entry) => target === resolve(root, entry));
            if (!generated) azureFailure('offline local inputs');
          }
        }
      }
    }
  };
  for (const directory of [
    'deploy/base',
    'deploy/environments/azure',
    'deploy/platform/azure',
    'deploy/platform/azure/recovery',
    'deploy/argocd/azure',
  ])
    inspect(join(root, directory));
  const runtime = Object.entries(runtimeFiles).map(([directory, names]) => {
    const path = join(root, directory);
    if (!existsSync(path)) return false;
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())
      azureFailure('partial runtime');
    const actual = readdirSync(path);
    if (
      actual.length !== names.length ||
      actual.some((name) => !names.includes(name))
    )
      azureFailure('partial runtime');
    for (const name of names) readPublicFile(root, `${directory}/${name}`);
    return true;
  });
  if (runtime.some(Boolean) && !runtime.every(Boolean))
    azureFailure('partial runtime');
  if (runtime.every(Boolean)) {
    const metadata = Object.keys(runtimeFiles).map((directory) =>
      JSON.parse(readPublicFile(root, `${directory}/projection.json`)),
    );
    if (
      metadata.some(
        (value) =>
          Object.keys(value).sort().join(',') !==
            'generation,outputHash,sourceRevision,version' ||
          value.version !== generatorInputSchemaVersion ||
          !/^[a-f0-9]{64}$/.test(value.outputHash ?? '') ||
          !/^[a-f0-9]{40}$/.test(value.sourceRevision ?? '') ||
          !/^\w{4,12}$/.test(value.generation ?? ''),
      ) ||
      metadata.some(
        (value) => canonicalRelease(value) !== canonicalRelease(metadata[0]),
      )
    )
      azureFailure('runtime metadata');
  }
  const directories = ['images', 'releases'].map((name) =>
    join(root, 'deploy/environments/azure', name),
  );
  const images = directories.some(
    (path) => existsSync(path) && readdirSync(path).length,
  );
  if (images) {
    for (const [index, path] of directories.entries()) {
      const suffix = index === 0 ? '.yaml' : '.json';
      if (
        !existsSync(path) ||
        lstatSync(path).isSymbolicLink() ||
        readdirSync(path).length !== componentNames.length ||
        readdirSync(path).some(
          (name) =>
            !componentNames.some((component) => name === component + suffix),
        )
      )
        azureFailure('partial image publication');
    }
    let repository;
    let registry;
    for (const component of componentNames) {
      const publication = JSON.parse(
        readPublicFile(
          root,
          `deploy/environments/azure/releases/${component}.json`,
        ),
      );
      if (publication.source?.component !== component)
        azureFailure('image publication identity');
      repository ??= publication.source.repository;
      registry ??= publication.image?.split('/')[0];
      validateAzurePublication(publication, {
        repository,
        acrLoginServer: registry,
        patch: readPublicFile(
          root,
          `deploy/environments/azure/images/${component}.yaml`,
        ),
      });
    }
  }
  return { runtime: runtime.every(Boolean), images };
}

function renderedAzure(root, kubectl) {
  const paths = [
    'deploy/environments/azure',
    'deploy/platform/azure',
    'deploy/platform/azure/recovery',
    'deploy/argocd/azure/projects',
    'deploy/argocd/azure/application',
    'deploy/argocd/azure/platform',
  ];
  const documents = paths.flatMap((path) =>
    yamlDocuments(
      executeProcess(kubectl, ['kustomize', path], {
        cwd: root,
        operation: 'Azure manifest rendering',
        tool: 'kubectl',
        output: 'private-capture',
        timeout: 60000,
        maxBuffer: 32 * 1024 * 1024,
      }),
    ),
  );
  const installerResources = [
    'deploy/platform/azure/runtime/recovery-qualification-bindings.json',
    'deploy/platform/azure/runtime/recovery-continuity-bindings.json',
  ].flatMap((path) => {
    const installer = JSON.parse(readPublicFile(root, path));
    if (installer.kind !== 'List' || !Array.isArray(installer.items))
      azureFailure('installer-only resource shape');
    return installer.items;
  });
  return [...documents, ...installerResources];
}

function validateAzurePolicy(documents) {
  const required = (kind, name, namespace) => {
    const found = documents.filter(
      (item) =>
        item.kind === kind &&
        item.metadata?.name === name &&
        (namespace === undefined || item.metadata.namespace === namespace),
    );
    if (found.length !== 1) azureFailure('policy resource inventory');
    return found[0];
  };
  for (const document of documents) {
    const { kind, spec = {}, metadata = {} } = document;
    if (kind === 'Secret') azureFailure('policy plaintext secret');
    if (kind === 'Service' && spec.type && spec.type !== 'ClusterIP') {
      if (
        metadata.name !== 'traefik' ||
        spec.type !== 'LoadBalancer' ||
        spec.externalTrafficPolicy !== 'Local' ||
        canonicalRelease(
          spec.ports.map((port) => port.port).sort((a, b) => a - b),
        ) !== '[80,443]'
      )
        azureFailure('policy public service exposure');
    }
    if (
      kind === 'PersistentVolumeClaim' &&
      (spec.storageClassName !== 'equipment-azure-retain' ||
        spec.volumeName ||
        !metadata.annotations?.['argocd.argoproj.io/sync-options']?.includes(
          'Prune=false',
        ) ||
        !metadata.annotations?.['argocd.argoproj.io/sync-options']?.includes(
          'Delete=false',
        ))
    )
      azureFailure('policy retained storage');
    if (kind === 'SecretProviderClass') {
      const allowed =
        workloadSecrets[metadata.name] ??
        recoveryWorkloadSecrets[metadata.name];
      if (
        !allowed ||
        spec.provider !== 'azure' ||
        !spec.parameters?.clientID ||
        !spec.parameters?.keyvaultName ||
        spec.parameters.usePodIdentity !== 'false'
      )
        azureFailure('policy workload secret authority');
      const actual = spec.secretObjects?.flatMap((secret) =>
        secret.data.map((entry) => [entry.key, entry.objectName]),
      );
      if (
        canonicalRelease(actual?.sort()) !==
        canonicalRelease(Object.entries(allowed).sort())
      )
        azureFailure('policy workload secret authority');
      const encoded = yamlDocuments(spec.parameters.objects)[0].array;
      if (
        !Array.isArray(encoded) ||
        canonicalRelease(
          encoded.map((text) => yamlDocuments(text)[0].objectName).sort(),
        ) !== canonicalRelease(Object.values(allowed).sort())
      )
        azureFailure('policy workload secret authority');
    }
    if (
      !['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'Pod'].includes(kind)
    )
      continue;
    const pod = kind === 'Pod' ? spec : spec.template?.spec;
    if (
      !pod ||
      pod.hostNetwork ||
      pod.hostPID ||
      pod.hostIPC ||
      (!pod.serviceAccountName && pod.automountServiceAccountToken !== false) ||
      pod.serviceAccountName === 'default'
    )
      azureFailure('policy pod security');
    for (const container of [
      ...(pod.containers ?? []),
      ...(pod.initContainers ?? []),
    ]) {
      const security = container.securityContext ?? {};
      if (!/@sha256:[a-f0-9]{64}$/.test(container.image ?? ''))
        azureFailure('policy immutable image');
      if (
        security.privileged ||
        security.allowPrivilegeEscalation !== false ||
        !(security.runAsNonRoot ?? pod.securityContext?.runAsNonRoot) ||
        !security.capabilities?.drop?.includes('ALL')
      )
        azureFailure('policy privileged container');
      if (
        !['requests', 'limits'].every((bound) =>
          ['cpu', 'memory'].every(
            (resource) => container.resources?.[bound]?.[resource],
          ),
        )
      )
        azureFailure('policy resource budgets');
      if (
        kind !== 'Job' &&
        metadata.namespace === 'equipment' &&
        pod.containers.includes(container) &&
        !['startupProbe', 'readinessProbe', 'livenessProbe'].every(
          (probe) => container[probe],
        )
      )
        azureFailure('policy application probes');
      for (const variable of container.env ?? [])
        if (
          /password|clientsecret|apikey|token/i.test(variable.name) &&
          variable.value &&
          !variable.value.includes('$(')
        )
          azureFailure('policy literal credential');
    }
  }
  const storage = required('StorageClass', 'equipment-azure-retain');
  for (const name of [
    'equipment-verification-jobs',
    'equipment-verification-services',
  ]) {
    const policy = required('ValidatingAdmissionPolicy', name);
    const binding = required('ValidatingAdmissionPolicyBinding', name);
    if (
      policy.spec?.failurePolicy !== 'Fail' ||
      !policy.spec.validations?.length ||
      !policy.spec.matchConstraints?.resourceRules?.length ||
      !policy.spec.matchConditions?.length ||
      binding.spec?.policyName !== name ||
      canonicalRelease(binding.spec.validationActions) !==
        canonicalRelease(['Deny']) ||
      binding.spec.matchResources?.namespaceSelector?.matchLabels?.[
        'kubernetes.io/metadata.name'
      ] !== 'equipment-recovery'
    )
      azureFailure('policy recovery admission');
  }
  if (
    storage.provisioner !== 'disk.csi.azure.com' ||
    storage.parameters?.skuName !== 'StandardSSD_LRS' ||
    storage.reclaimPolicy !== 'Retain'
  )
    azureFailure('policy Azure storage');
  const ingress = required('Ingress', 'equipment', 'equipment');
  const paths = ingress.spec.rules.flatMap((rule) =>
    rule.http.paths.map((path) => ({
      host: rule.host,
      path: path.path,
      service: path.backend.service.name,
    })),
  );
  if (
    canonicalRelease(paths) !==
      canonicalRelease([
        { host: 'app.codingfunlab.com', path: '/', service: 'web' },
        {
          host: 'identity.codingfunlab.com',
          path: '/realms/equipment/',
          service: 'keycloak',
        },
        {
          host: 'identity.codingfunlab.com',
          path: '/resources/',
          service: 'keycloak',
        },
      ]) ||
    ingress.spec.ingressClassName !== 'traefik' ||
    !ingress.spec.tls?.length
  )
    azureFailure('policy public identity routes');
  const dashboard = required('IngressRoute', 'dashboard', 'equipment');
  if (
    dashboard.spec.entryPoints?.join(',') !== 'websecure' ||
    !dashboard.spec.tls?.secretName ||
    dashboard.spec.routes.length !== 1 ||
    dashboard.spec.routes[0].match !==
      'Host(`dashboard.codingfunlab.com`) && !PathPrefix(`/api`) && !PathPrefix(`/v1`)' ||
    canonicalRelease(dashboard.spec.routes[0].middlewares) !==
      '[{"name":"operator-source"}]'
  )
    azureFailure('policy operator routes');
  const argo = required('Ingress', 'argocd', 'argocd');
  if (
    argo.spec.rules?.[0]?.host !== 'argocd.codingfunlab.com' ||
    !argo.spec.tls?.length ||
    argo.metadata.annotations?.[
      'traefik.ingress.kubernetes.io/router.middlewares'
    ] !== 'argocd-operator-source@kubernetescrd'
  )
    azureFailure('policy operator routes');
  if (
    documents.filter((item) => ['Ingress', 'IngressRoute'].includes(item.kind))
      .length !== 3
  )
    azureFailure('policy unexpected public route');
  for (const namespace of [
    'equipment',
    'equipment-platform',
    'argocd',
    'cert-manager',
  ]) {
    if (
      !documents.some(
        (item) =>
          item.kind === 'NetworkPolicy' &&
          item.metadata.namespace === namespace &&
          canonicalRelease(item.spec.podSelector) === '{}' &&
          canonicalRelease([...(item.spec.policyTypes ?? [])].sort()) ===
            '["Egress","Ingress"]' &&
          !item.spec.ingress?.length &&
          !item.spec.egress?.length,
      )
    )
      azureFailure('policy default-deny network');
  }
  for (const namespace of ['equipment', 'argocd']) {
    const policy = required('Middleware', 'operator-source', namespace).spec
      .ipAllowList;
    if (
      !policy?.sourceRange?.length ||
      policy.sourceRange.some(
        (cidr) => !/^\d{1,3}(?:\.\d{1,3}){3}\/32$/.test(cidr),
      )
    )
      azureFailure('policy operator source restriction');
  }
}

function prepareAzureSchemas(context, root, destination, documents) {
  const cache = verifiedSchemas(context);
  mkdirSync(destination, { recursive: true });
  for (const file of cache.files.filter(
    (file) => !file.path.startsWith('inputs/'),
  ))
    cpSync(join(cache.directory, file.path), join(destination, file.path));
  for (const source of context.lock.schemas.vendoredFiles ?? []) {
    const bytes = readPublicFile(root, source.path);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
      azureFailure('schema vendor integrity');
  }
  if (context.lock.schemas.vendoredFiles?.length !== 2)
    azureFailure('schema vendor pins');
  const swagger = JSON.parse(
    readFileSync(
      join(cache.directory, 'inputs/kubernetes-swagger.json'),
      'utf8',
    ),
  );
  writeFileSync(
    join(destination, 'customresourcedefinition-apiextensions-v1.json'),
    JSON.stringify({
      $schema: 'http://json-schema.org/draft-04/schema#',
      $ref: '#/definitions/io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition',
      definitions: swagger.definitions,
    }),
  );
  const crds = [
    ...documents.filter((item) => item.kind === 'CustomResourceDefinition'),
    ...yamlDocuments(
      readFileSync(join(cache.directory, 'inputs/argocd-install.yaml'), 'utf8'),
    ).filter((item) => item.kind === 'CustomResourceDefinition'),
    ...yamlDocuments(
      readFileSync(
        join(cache.directory, 'inputs/secretproviderclass.yaml'),
        'utf8',
      ),
    ),
  ];
  for (const crd of crds) {
    if (crd.kind !== 'CustomResourceDefinition')
      azureFailure('schema CRD source');
    for (const version of crd.spec.versions.filter(
      (version) => version.served,
    )) {
      const schema = JSON.parse(
        JSON.stringify(version.schema?.openAPIV3Schema ?? null),
      );
      if (!schema || schema.type !== 'object')
        azureFailure('schema CRD definition');
      writeFileSync(
        join(
          destination,
          `${crd.spec.names.kind.toLowerCase()}-${crd.spec.group}-${version.name}.json`,
        ),
        JSON.stringify({
          $schema: 'http://json-schema.org/draft-07/schema#',
          ...schema,
        }),
      );
    }
  }
}

function validateAzureSchemas(documents, binary, directory) {
  executeProcess(
    binary,
    [
      '-strict',
      '-summary',
      '-output',
      'json',
      '-schema-location',
      join(directory, '{{.ResourceKind}}{{.KindSuffix}}.json'),
      '-schema-location',
      join(
        directory,
        '{{.ResourceKind}}-{{.Group}}-{{.ResourceAPIVersion}}.json',
      ),
    ],
    {
      operation: 'Azure manifest schema validation',
      tool: 'kubeconform',
      output: 'private-capture',
      input: documents
        .map((document) => JSON.stringify(document))
        .join('\n---\n'),
      timeout: 120000,
      maxBuffer: 1048576,
    },
  );
}

export async function validateAzureDeployment({
  root = process.cwd(),
  context = qualityContext(),
} = {}) {
  let source;
  try {
    source = inspectAzureSource(root);
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    azureFailure('runtime or image inspection');
  }
  const kubectl = verifiedTool(context, 'kubectl');
  const kubeconform = verifiedTool(context, 'kubeconform');
  const directory = mkdtempSync(join(tmpdir(), 'equipment-azure-quality-'));
  let primary;
  let phase = 'fixture staging';
  try {
    const staged = join(directory, 'fixture');
    stageAzureFixture(staged, { sourceRoot: root });
    phase = 'fixture rendering';
    const fixtureDocuments = renderedAzure(staged, kubectl);
    const schemas = join(directory, 'schemas');
    phase = 'schema preparation';
    prepareAzureSchemas(context, root, schemas, fixtureDocuments);
    phase = 'schema validation';
    validateAzureSchemas(fixtureDocuments, kubeconform, schemas);
    phase = 'policy validation';
    validateAzurePolicy(fixtureDocuments);
    if (source.runtime || source.images) {
      const actualDirectories = [
        ...(source.runtime ? Object.keys(runtimeFiles) : []),
        ...(source.images
          ? [
              'deploy/environments/azure/images',
              'deploy/environments/azure/releases',
            ]
          : []),
      ];
      for (const path of actualDirectories)
        cpSync(join(root, path), join(staged, path), { recursive: true });
      const actual = renderedAzure(staged, kubectl);
      validateAzureSchemas(actual, kubeconform, schemas);
      validateAzurePolicy(actual);
    }
    return {
      mode: 'infrastructure',
      status: source.runtime && source.images ? 'configured' : 'unconfigured',
      fixture: true,
      resources: fixtureDocuments.length,
      pending: [
        ...(!source.runtime ? ['runtime'] : []),
        ...(!source.images ? ['images'] : []),
      ],
    };
  } catch (error) {
    const category = ['TypeError', 'RangeError', 'SyntaxError'].includes(
      error?.name,
    )
      ? error.name
      : 'unexpected';
    const sourceLine =
      /manifest-quality\.mjs:(\d+):/.exec(error?.stack ?? '')?.[1] ??
      'unavailable';
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            `Azure manifest ${phase} failed; category=${category}; sourceLine=${sourceLine}; private contents suppressed`,
          );
  } finally {
    cleanupAllSync(
      [
        {
          operation: 'Azure manifest temporary cleanup',
          tool: 'filesystem',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ],
      { primary },
    );
  }
}

export async function runManifestQuality({
  command,
  args = [],
  env = process.env,
  root = process.cwd(),
  request = globalThis.fetch,
}) {
  if (command === 'azure') return validateAzureDeployment({ root });
  if (command === 'validate') {
    let selection;
    try {
      const path = argument(args, '--selection');
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
        throw new Error();
      selection = JSON.parse(readFileSync(path, 'utf8'));
      if (
        selection?.mode !== 'manifest' ||
        selection.reason !== 'allowlisted-changes' ||
        !Array.isArray(selection.paths) ||
        !selection.paths.length ||
        selection.paths.some((path) => !allowedPaths.has(path)) ||
        new Set(selection.paths).size !== selection.paths.length ||
        Object.keys(selection).some(
          (key) => !['mode', 'paths', 'reason'].includes(key),
        )
      )
        throw new Error();
    } catch {
      throw new OperationalFailure('Invalid manifest quality selection scope');
    }
    const { readPublicFile } = await import('./deployment-validation.mjs');
    const existing = [];
    for (const path of selection.paths) {
      try {
        readPublicFile(root, path);
        existing.push(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (existing.length)
      executeProcess(
        process.execPath,
        [resolve(root, 'scripts/quality.mjs'), 'format-check', ...existing],
        {
          cwd: root,
          operation: 'Manifest quality scoped formatting',
          tool: 'node',
          output: 'public-capture',
          timeout: 60000,
        },
      );
    return {
      mode: 'manifest',
      ...(await validateStaticDeployment({
        root,
        kubectl: argument(args, '--kubectl'),
      })),
    };
  }
  if (command !== 'select')
    throw new OperationalFailure('Unknown manifest quality command');
  const refValid =
    env.GITHUB_EVENT_NAME === 'pull_request'
      ? /^refs\/pull\/[1-9][0-9]*\/(merge|head)$/.test(env.GITHUB_REF ?? '')
      : env.GITHUB_REF === 'refs/heads/main';
  let fullQualityBaseline = null;
  if (refValid && env.GITHUB_EVENT_NAME === 'push' && env.GH_TOKEN) {
    const repository = {
      id: Number(env.GITHUB_REPOSITORY_ID),
      name: env.GITHUB_REPOSITORY,
    };
    fullQualityBaseline = await discoverFullQualityBaseline({
      root,
      repository,
      sourceRevision: env.GITHUB_SHA,
      gateway: qualityGateway(repository, env.GH_TOKEN, request),
    });
  }
  const selection = refValid
    ? selectQuality({
        root,
        event: env.GITHUB_EVENT_NAME,
        sourceRef: env.GITHUB_REF,
        sourceRevision: env.GITHUB_SHA,
        baseRevision: env.BASE_REVISION,
        fullQualityBaseline,
      })
    : full('unproven-comparison');
  const index = args.indexOf('--output');
  if (index < 0 || !args[index + 1])
    throw new OperationalFailure('Manifest quality output file required');
  writeFileSync(args[index + 1], `${JSON.stringify(selection)}\n`);
  if (env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(selection))
      appendFileSync(
        env.GITHUB_OUTPUT,
        `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`,
      );
  return selection;
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new OperationalFailure('Manifest quality command argument required');
  return args[index + 1];
}

function qualityGateway(repository, token, request) {
  const deadline = Date.now() + 60000;
  return {
    api: async (path) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new OperationalFailure('Full quality lookup budget exhausted');
        let response;
        try {
          response = await request(
            `https://api.github.com/repos/${repository.name}${path}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              signal: globalThis.AbortSignal.timeout(
                Math.min(15000, remaining),
              ),
            },
          );
        } catch {
          if (attempt === 2)
            throw new OperationalFailure(
              'Full quality lookup transport failed',
            );
        }
        if (!response || response.status === 429 || response.status >= 500) {
          await response?.body?.cancel();
          if (attempt < 2) {
            await delay(
              Math.min(
                200 * 2 ** attempt + Math.random() * 100,
                Math.max(0, deadline - Date.now()),
              ),
            );
            continue;
          }
        }
        if (!response?.ok)
          throw new OperationalFailure('Full quality lookup HTTP failure');
        try {
          const chunks = [];
          let length = 0;
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > 2097152 || Date.now() > deadline) throw new Error();
            chunks.push(chunk);
          }
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new OperationalFailure(
            'Full quality lookup invalid bounded response',
          );
        }
      }
      throw new OperationalFailure('Full quality lookup failed');
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(
        await runManifestQuality({
          command: process.argv[2],
          args: process.argv.slice(3),
        }),
      ),
    );
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'Manifest quality operation failed; private details suppressed',
      ),
    );
    process.exitCode = 1;
  }
}
