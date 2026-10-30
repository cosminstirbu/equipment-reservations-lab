import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { isIP } from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { Buffer } from 'node:buffer';
import { OperationalFailure, safeFailure } from './process.mjs';
import { createBlobJsonTransport } from './azure-handoff.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import {
  qualificationSourceDefinition,
  validateQualificationLaunch,
  qualificationInstallationContext,
  validateQualificationInstallationContext,
  verifyQualificationReleaseContext,
} from './azure-qualification-launch.mjs';
import {
  assertPrivatePath,
  createPrivateDirectory,
} from './local-platform.mjs';

const fail = () => {
  throw new OperationalFailure(
    'Recovery identity qualification failed; private credentials, request bodies and process output suppressed.',
  );
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const hash = (value) =>
  createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(canonical(value)),
    )
    .digest('hex');
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const actors = ['backup', 'restore'];
const actorCheck = (actor) => {
  if (!actors.includes(actor))
    throw new OperationalFailure('Qualification actor is invalid.');
};

function privateProbe(command, args, input, signal) {
  return new Promise((resolveResult, reject) => {
    let child;
    let failed = false;
    let bytes = 0;
    const stdout = [];
    const stderr = [];
    const abort = () => {
      failed = true;
      child?.kill('SIGKILL');
    };
    if (signal?.aborted) {
      reject(new OperationalFailure('Qualification was cancelled.'));
      return;
    }
    const timer = setTimeout(abort, 30000);
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      clearTimeout(timer);
      reject(new OperationalFailure('Qualification process failed.'));
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => {
      failed = true;
    });
    for (const [stream, chunks] of [
      [child.stdout, stdout],
      [child.stderr, stderr],
    ])
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 2097152) abort();
        else chunks.push(chunk);
      });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failed) {
        reject(
          new OperationalFailure(
            'Qualification process failed or exceeded its bound; private output suppressed.',
          ),
        );
        return;
      }
      resolveResult({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

export function createKubectlQualificationProbe({
  kubeconfig,
  command = verifiedTool(qualityContext(), 'kubectl'),
  prefix = [],
  signal,
}) {
  const run = (args, input) =>
    privateProbe(
      command,
      [
        ...prefix,
        '--kubeconfig',
        kubeconfig,
        '--v=8',
        '--request-timeout=25s',
        ...args,
      ],
      input,
      signal,
    );
  const raw = async (method, path, body) => {
    if (
      !['GET', 'POST', 'PUT'].includes(method) ||
      !/^\/(?:api|apis)\/[a-zA-Z0-9./?=&_-]+$/.test(path) ||
      path.includes('..') ||
      path.includes('//')
    )
      fail();
    const args =
      method === 'GET'
        ? ['get', '--raw', path]
        : [method === 'POST' ? 'create' : 'replace', '--raw', path, '-f', '-'];
    return privateProbe(
      command,
      [
        ...prefix,
        '--kubeconfig',
        kubeconfig,
        '--v=8',
        '--request-timeout=25s',
        ...args,
      ],
      body === undefined ? undefined : JSON.stringify(body),
      signal,
    );
  };
  const statuses = (output) =>
    [
      ...output.matchAll(
        /(?:Response Status:\s*|"Response"[^\n]*?\bstatus=")(\d{3})\b/g,
      ),
    ].map((match) => Number(match[1]));
  const observedRequest = (output, verb, path) => {
    let matched = false;
    for (const line of output.split(/\r?\n/)) {
      const request =
        /"Request"[^\n]*?verb="([A-Z]+)"[^\n]*?url="([^"]+)"/.exec(line) ??
        /\b(GET|POST|PATCH) (https:\/\/\S+)/.exec(line);
      if (request) {
        try {
          matched =
            (Array.isArray(verb) ? verb : [verb]).includes(request[1]) &&
            new URL(request[2]).pathname === path;
        } catch {
          matched = false;
        }
      }
      const response = statuses(line);
      if (response.length && matched) return response.at(-1);
    }
  };
  const result = (value, expected, allow, verb, path) => {
    const status = statuses(value.stderr).at(-1);
    if (
      status !== expected ||
      (path && observedRequest(value.stderr, verb, path) !== expected) ||
      (allow ? value.code !== 0 : value.code === 0)
    )
      fail();
    return { httpStatus: status, outcome: allow ? 'allowed' : 'denied' };
  };
  return {
    async ownExec(actor) {
      actorCheck(actor);
      const value = await run([
        '--namespace',
        'equipment-recovery',
        'exec',
        `equipment-${actor}-client`,
        '--container',
        'client',
        '--',
        '/bin/true',
      ]);
      return result(
        value,
        101,
        true,
        ['GET', 'POST'],
        `/api/v1/namespaces/equipment-recovery/pods/equipment-${actor}-client/exec`,
      );
    },
    async deny(method, path, body) {
      return result(
        await raw(method, path, body),
        403,
        false,
        method,
        path.split('?')[0],
      );
    },
    async absent(path) {
      const value = await raw('GET', path);
      if (value.code === 0 || statuses(value.stderr).at(-1) !== 404) fail();
    },
    async denySpecWrite(kind, namespace, name) {
      if (!(
        (kind === 'deployment' &&
          namespace === 'equipment-recovery' &&
          name === 'equipment-qualification-writer') ||
        (kind === 'application' &&
          namespace === 'argocd' &&
          name === 'equipment-azure')
      ))
        fail();
      return result(
        await run(
          [
            'patch',
            '-f',
            '-',
            '--type=merge',
            '--patch',
            '{}',
            '--dry-run=server',
            '-o',
            'json',
          ],
          JSON.stringify({
            apiVersion:
              kind === 'deployment' ? 'apps/v1' : 'argoproj.io/v1alpha1',
            kind: kind === 'deployment' ? 'Deployment' : 'Application',
            metadata: { namespace, name },
          }),
        ),
        403,
        false,
        'PATCH',
        kind === 'deployment'
          ? `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`
          : `/apis/argoproj.io/v1alpha1/namespaces/${namespace}/applications/${name}`,
      );
    },
    async json(method, path, body) {
      const value = await raw(method, path, body);
      const status = statuses(value.stderr).at(-1);
      if (value.code !== 0 || ![200, 201].includes(status)) fail();
      try {
        return { value: JSON.parse(value.stdout), httpStatus: status };
      } catch {
        fail();
      }
    },
    async getOptional(path) {
      const value = await raw('GET', path);
      const status = statuses(value.stderr).at(-1);
      if (status === 404 && value.code !== 0) return undefined;
      if (status !== 200 || value.code !== 0) fail();
      try {
        return JSON.parse(value.stdout);
      } catch {
        fail();
      }
    },
    async replaceContinuitySecret(namespace, name, body) {
      const allowed = {
        'cert-manager': [
          'letsencrypt-production-account',
          'letsencrypt-staging-account',
        ],
        equipment: ['equipment-tls', 'dashboard-public-tls'],
        argocd: ['argocd-public-tls'],
      };
      if (
        !allowed[namespace]?.includes(name) ||
        body?.kind !== 'Secret' ||
        body.metadata?.name !== name ||
        body.metadata.namespace !== namespace ||
        typeof body.metadata.resourceVersion !== 'string' ||
        !body.metadata.resourceVersion
      )
        fail();
      const path = '/api/v1/namespaces/' + namespace + '/secrets/' + name;
      const response = await raw('PUT', path, body),
        status = statuses(response.stderr).at(-1);
      if (!observedRequest(response.stderr, 'PUT', path)) fail();
      if (response.code !== 0 && status === 409) return { conflict: true };
      if (response.code !== 0 || status !== 200) fail();
      let value;
      try {
        value = JSON.parse(response.stdout);
      } catch {
        fail();
      }
      if (
        value.kind !== 'Secret' ||
        value.metadata?.name !== name ||
        value.metadata.namespace !== namespace ||
        typeof value.metadata.resourceVersion !== 'string' ||
        !value.metadata.resourceVersion
      )
        fail();
      return { value, httpStatus: status };
    },
    async admissionCheck(resource, body, allow) {
      if (
        !['jobs', 'services'].includes(resource) ||
        typeof allow !== 'boolean'
      )
        fail();
      const path =
        resource === 'jobs'
          ? '/apis/batch/v1/namespaces/equipment-recovery/jobs'
          : '/api/v1/namespaces/equipment-recovery/services';
      const response = await raw('POST', path + '?dryRun=All', body);
      const status = statuses(response.stderr).at(-1);
      if (!observedRequest(response.stderr, 'POST', path)) fail();
      if (allow) {
        let value;
        try {
          value = JSON.parse(response.stdout);
        } catch {
          fail();
        }
        if (
          response.code !== 0 ||
          status !== 201 ||
          value.kind !== (resource === 'jobs' ? 'Job' : 'Service')
        )
          fail();
      } else {
        const policy =
          resource === 'jobs'
            ? 'equipment-verification-jobs'
            : 'equipment-verification-services';
        if (
          response.code === 0 ||
          ![403, 422].includes(status) ||
          !response.stderr.includes('ValidatingAdmissionPolicy') ||
          !response.stderr.includes(policy) ||
          !response.stderr.includes('denied request')
        )
          fail();
      }
      return { httpStatus: status, outcome: allow ? 'allowed' : 'denied' };
    },
    async noOpScale(namespace, name, replicas, allow) {
      if (
        !['equipment', 'equipment-recovery'].includes(namespace) ||
        ![
          'web',
          'inventory',
          'reservations',
          'notifications',
          'keycloak',
          'equipment-qualification-writer',
          'equipment-qualification-forbidden',
        ].includes(name) ||
        !Number.isSafeInteger(replicas) ||
        replicas < 0 ||
        replicas > 10
      )
        fail();
      const value = await run(
        [
          'patch',
          '-f',
          '-',
          '--subresource=scale',
          '--type=merge',
          '--patch',
          JSON.stringify({ spec: { replicas } }),
          ...(allow ? [] : ['--dry-run=server']),
          '-o',
          'json',
        ],
        JSON.stringify({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { namespace, name },
        }),
      );
      return result(
        value,
        allow ? 200 : 403,
        allow,
        'PATCH',
        `/apis/apps/v1/namespaces/${namespace}/deployments/${name}/scale`,
      );
    },
    async configuration() {
      const value = await privateProbe(
        command,
        [
          ...prefix,
          '--kubeconfig',
          kubeconfig,
          'config',
          'view',
          '--raw',
          '--minify',
          '-o',
          'json',
        ],
        undefined,
        signal,
      );
      if (value.code !== 0) fail();
      try {
        const config = JSON.parse(value.stdout);
        const cluster = config.clusters[0].cluster;
        if (
          config.clusters.length !== 1 ||
          cluster['insecure-skip-tls-verify'] ||
          !cluster['certificate-authority-data'] ||
          !cluster.server.startsWith('https://')
        )
          fail();
        return {
          server: cluster.server,
          clusterCaHash: hash(
            Buffer.from(cluster['certificate-authority-data'], 'base64'),
          ),
        };
      } catch {
        fail();
      }
    },
  };
}

export function qualificationDefinition() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  return {
    probeDefinitionHash: qualificationSourceDefinition({ root })
      .probeDefinitionHash,
    roleDefinitionHash: hash(
      readFileSync(
        resolve(
          root,
          'deploy/platform/azure/recovery-controls/qualification.json',
        ),
      ),
    ),
    productionRoleHash: hash(
      readFileSync(
        resolve(root, 'deploy/platform/azure/recovery-controls/roles.json'),
      ),
    ),
    templateHash: hash(
      readFileSync(
        resolve(root, 'deploy/platform/azure/recovery-controls/admission.json'),
      ),
    ),
  };
}

export function validateInitialQualificationRecords({
  challenge,
  proofs,
  config,
  outputs,
  definitions,
  clusterCaHash,
  installationState,
  now = Date.now(),
}) {
  const revision = (value) => /^[a-f0-9]{40}$/.test(value ?? '');
  const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? '');
  const issued = Date.parse(challenge?.issued);
  const expires = Date.parse(challenge?.expires);
  const common = (value) => {
    if (
      value?.version !== 2 ||
      value.mode !== 'activation' ||
      value.environment !== config.environment ||
      value.generation !== config.generation ||
      value.subscriptionId !== config.subscriptionId ||
      value.tenantId !== config.tenantId ||
      value.infrastructureAnchorRevision !== config.gitRevision ||
      value.sourceRevision !== challenge.sourceRevision ||
      !revision(value.sourceRevision) ||
      !revision(value.actualProbeCodeRevision) ||
      value.clusterId !== outputs.aks_resource_id ||
      value.clusterCaHash !== clusterCaHash ||
      !installationState ||
      !value.installationState ||
      !value.definitionManifest ||
      typeof value.definitionManifest !== 'object' ||
      !challenge.definitionManifest ||
      hash(value.definitionManifest) !== hash(challenge.definitionManifest) ||
      hash(value.installationState) !== hash(installationState) ||
      !digest(clusterCaHash) ||
      Object.entries(definitions).some(
        ([key, expected]) => !digest(expected) || value[key] !== expected,
      )
    )
      fail();
  };
  if (
    !challenge ||
    !proofs ||
    !uuid(challenge.nonce) ||
    !Number.isFinite(now) ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now ||
    expires <= now ||
    expires - issued > 86400000 ||
    challenge.actualProbeCodeRevision !== challenge.sourceRevision
  )
    fail();
  if (
    Object.keys(definitions).sort().join(',') !==
    'probeDefinitionHash,productionRoleHash,roleDefinitionHash,templateHash'
  )
    fail();
  common(challenge);
  const challengeHash = hash(challenge);
  const proofHashes = {};
  for (const actor of actors) {
    const proof = proofs[actor];
    common(proof);
    const principalId = outputs.github_principal_ids?.[actor];
    const started = Date.parse(proof.started),
      completed = Date.parse(proof.completed);
    if (
      !uuid(principalId) ||
      challenge.principals?.[actor] !== principalId ||
      proof.principalId !== principalId ||
      proof.challengeHash !== challengeHash ||
      proof.expires !== challenge.expires ||
      !Number.isFinite(started) ||
      !Number.isFinite(completed) ||
      started < issued ||
      completed < started ||
      completed > now ||
      completed >= expires ||
      !uuid(challenge.fixtures?.[actor]?.podUid) ||
      !uuid(challenge.fixtures?.[actor]?.bindingUid)
    )
      fail();
    const own = 'equipment-' + actor + '-client';
    const other =
      'equipment-' + (actor === 'backup' ? 'restore' : 'backup') + '-client';
    const expected = [
      {
        verb: 'connect',
        resource: 'pods/exec',
        namespace: 'equipment-recovery',
        name: own,
        httpStatus: 101,
        outcome: 'allowed',
      },
      {
        verb: 'create',
        resource: 'pods/exec',
        namespace: 'equipment-recovery',
        name: other,
        httpStatus: 403,
        outcome: 'denied',
      },
      {
        verb: 'get',
        resource: 'secrets',
        namespace: 'equipment-recovery',
        name: 'equipment-qualification-forbidden',
        httpStatus: 403,
        outcome: 'denied',
      },
      {
        verb: 'patch',
        resource: 'deployments/scale',
        namespace: 'equipment-recovery',
        name: 'equipment-qualification-writer',
        httpStatus: actor === 'backup' ? 200 : 403,
        outcome: actor === 'backup' ? 'allowed' : 'denied',
      },
      {
        verb: 'patch',
        resource: 'deployments',
        namespace: 'equipment-recovery',
        name: 'equipment-qualification-writer',
        httpStatus: 403,
        outcome: 'denied',
      },
      {
        verb: 'patch',
        resource: 'applications',
        namespace: 'argocd',
        name: 'equipment-azure',
        httpStatus: 403,
        outcome: 'denied',
      },
      {
        verb: 'create',
        resource: 'selfsubjectaccessreviews',
        name: own,
        httpStatus: 201,
        outcome: 'allowed',
      },
    ];
    if (hash(proof.requests) !== hash(expected)) fail();
    proofHashes[actor] = hash(proof);
  }
  return { challengeHash, proofHashes };
}

const challengeKey = (config, nonce) => {
  if (!uuid(nonce)) fail();
  return `activation/${config.environment}/${config.generation}/${nonce}.json`;
};
const proofKey = (config, nonce, actor) => {
  actorCheck(actor);
  return `activation/${config.environment}/${config.generation}/${nonce}/${actor}.json`;
};

export async function assertQualificationLease(operation, config, allowed) {
  if (
    !uuid(operation?.leaseId) ||
    !operation.provider ||
    operation.signal?.aborted
  )
    fail();
  const record = await operation.provider.readRecord();
  if (
    record.owner !== operation.leaseId ||
    record.environment !== config.environment ||
    record.revision !== config.gitRevision ||
    !allowed.includes(record.operation) ||
    !Number.isFinite(Date.parse(record.expires)) ||
    Date.parse(record.expires) <= Date.now()
  )
    fail();
  await operation.provider.renew(operation.leaseId);
}

async function observedCluster({
  config,
  outputs,
  token,
  probe,
  request = globalThis.fetch,
  signal,
}) {
  const response = await request(
    `https://management.azure.com${outputs.aks_resource_id}?api-version=2025-07-01`,
    {
      headers: {
        Authorization: `Bearer ${await token('https://management.azure.com/')}`,
      },
      redirect: 'error',
      signal: globalThis.AbortSignal.any([
        ...(signal ? [signal] : []),
        globalThis.AbortSignal.timeout(30000),
      ]),
    },
  );
  if (!response.ok) fail();
  const actual = await response.json();
  const observed = await probe.configuration();
  if (
    actual.id?.toLowerCase() !== outputs.aks_resource_id.toLowerCase() ||
    actual.tags?.application !== 'equipment-reservations' ||
    actual.tags?.environment !== config.environment ||
    actual.tags?.generation !== config.generation ||
    new URL(observed.server).hostname !== actual.properties?.fqdn
  )
    fail();
  return observed;
}

export async function publishInitialQualificationChallenge({
  config,
  outputs,
  kubeconfig,
  token,
  signal,
  request,
  operation,
  installationInput,
}) {
  const launch = await validateQualificationLaunch();
  await verifyQualificationReleaseContext({
    revision: launch.actualProbeCodeRevision,
    acrLoginServer: outputs.acr_login_server,
    signal,
  });
  const { binding: installationState } = await qualificationInstallationContext(
    { input: installationInput },
  );
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'qualification-challenge',
  ]);
  const probe = createKubectlQualificationProbe({ kubeconfig, signal });
  const observed = await observedCluster({
    config,
    outputs,
    token,
    probe,
    signal,
    request,
  });
  const principals = Object.fromEntries(
    actors.map((actor) => [actor, outputs.github_principal_ids?.[actor]]),
  );
  if (Object.values(principals).some((value) => !uuid(value))) fail();
  const source = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/platform/azure/recovery-controls/qualification.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const fixtures = {};
  for (const actor of actors) {
    const name = `equipment-recovery-qualification-${actor}`;
    const expected = source.items.find(
      (item) => item.kind === 'Role' && item.metadata.name === name,
    );
    const role = (
      await probe.json(
        'GET',
        `/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/roles/${name}`,
      )
    ).value;
    const binding = (
      await probe.json(
        'GET',
        `/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/rolebindings/${name}`,
      )
    ).value;
    const pod = (
      await probe.json(
        'GET',
        `/api/v1/namespaces/equipment-recovery/pods/equipment-${actor}-client`,
      )
    ).value;
    if (
      hash(role.rules) !== hash(expected.rules) ||
      binding.roleRef?.kind !== 'Role' ||
      binding.roleRef?.name !== name ||
      binding.subjects?.length !== 1 ||
      binding.subjects[0].kind !== 'User' ||
      binding.subjects[0].name !== principals[actor] ||
      pod.metadata?.labels?.['equipment.recovery/qualification'] !== 'true' ||
      pod.spec?.serviceAccountName !== 'equipment-recovery-qualification' ||
      pod.spec?.volumes?.some((volume) => volume.secret || volume.csi) ||
      pod.spec?.containers?.some(
        (container) =>
          container.envFrom?.length ||
          container.env?.some((value) => value.valueFrom),
      )
    )
      fail();
    fixtures[actor] = {
      podUid: pod.metadata.uid,
      bindingUid: binding.metadata.uid,
    };
    if (!uuid(fixtures[actor].podUid) || !uuid(fixtures[actor].bindingUid))
      fail();
    await probe.absent(
      `/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/rolebindings/equipment-recovery-${actor}`,
    );
  }
  await probe.absent(
    '/apis/batch/v1/namespaces/equipment-recovery/jobs/recovery-database-bootstrap',
  );
  await probe.absent(
    '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/equipment-azure-recovery',
  );
  const nonce = randomUUID();
  const rechecked = await validateQualificationLaunch();
  if (hash(rechecked) !== hash(launch)) fail();
  const challenge = {
    version: 2,
    mode: 'activation',
    environment: config.environment,
    generation: config.generation,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: observed.clusterCaHash,
    principals,
    fixtures,
    subscriptionId: config.subscriptionId,
    tenantId: config.tenantId,
    infrastructureAnchorRevision: config.gitRevision,
    sourceRevision: launch.actualProbeCodeRevision,
    actualProbeCodeRevision: launch.actualProbeCodeRevision,
    definitionManifest: launch.definition.manifest,
    installationState,
    ...qualificationDefinition(),
    nonce,
    issued: new Date().toISOString(),
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
  const store = createBlobJsonTransport({
    account: outputs.recovery_storage_account_name,
    container: 'qualification-challenges',
    token,
    signal,
    request,
  });
  await store.createOnly(challengeKey(config, nonce), challenge);
  return { nonce, challengeHash: hash(challenge), expires: challenge.expires };
}

export async function produceInitialQualificationProof({
  actor,
  nonce,
  config,
  outputs,
  kubeconfig,
  token,
  signal,
  request,
  operation,
  installationInput,
}) {
  actorCheck(actor);
  const launch = await validateQualificationLaunch();
  await verifyQualificationReleaseContext({
    revision: launch.actualProbeCodeRevision,
    acrLoginServer: outputs.acr_login_server,
    signal,
  });
  await assertQualificationLease(operation, config, [`qualification-${actor}`]);
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    fail();
  const challengeStore = createBlobJsonTransport({
    account: outputs.recovery_storage_account_name,
    container: 'qualification-challenges',
    token,
    signal,
    request,
  });
  const challenge = await challengeStore.read(challengeKey(config, nonce));
  const probe = createKubectlQualificationProbe({ kubeconfig, signal });
  const observed = await observedCluster({
    config,
    outputs,
    token,
    probe,
    signal,
    request,
  });
  await validateQualificationInstallationContext({
    input: installationInput,
    acrLoginServer: outputs.acr_login_server,
    binding: challenge.installationState,
    phase: 'source',
  });
  const definitions = qualificationDefinition();
  const now = Date.now();
  if (
    challenge.version !== 2 ||
    challenge.mode !== 'activation' ||
    challenge.nonce !== nonce ||
    challenge.environment !== config.environment ||
    challenge.generation !== config.generation ||
    challenge.clusterId !== outputs.aks_resource_id ||
    challenge.clusterCaHash !== observed.clusterCaHash ||
    challenge.infrastructureAnchorRevision !== config.gitRevision ||
    challenge.subscriptionId !== config.subscriptionId ||
    challenge.tenantId !== config.tenantId ||
    !/^[a-f0-9]{40}$/.test(challenge.sourceRevision ?? '') ||
    challenge.actualProbeCodeRevision !== challenge.sourceRevision ||
    hash(challenge.definitionManifest) !== hash(launch.definition.manifest) ||
    hash(
      qualificationSourceDefinition({ revision: challenge.sourceRevision }),
    ) !== hash(launch.definition) ||
    Object.entries(definitions).some(
      ([key, value]) => challenge[key] !== value,
    ) ||
    !Number.isFinite(Date.parse(challenge.expires)) ||
    !Number.isFinite(Date.parse(challenge.issued)) ||
    Date.parse(challenge.expires) <= now ||
    Date.parse(challenge.issued) > now ||
    Date.parse(challenge.expires) - Date.parse(challenge.issued) > 86400000
  )
    fail();
  const identity = await probe.json(
    'POST',
    '/apis/authentication.k8s.io/v1/selfsubjectreviews',
    { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' },
  );
  const principalId = challenge.principals?.[actor];
  const user = identity.value.status?.userInfo;
  if (
    !uuid(principalId) ||
    principalId !== outputs.github_principal_ids?.[actor] ||
    !(
      user?.username?.toLowerCase() === principalId ||
      user?.extra?.oid?.includes(principalId)
    )
  )
    fail();
  const started = new Date().toISOString();
  const requests = [];
  const own = `equipment-${actor}-client`;
  const other = `equipment-${actor === 'backup' ? 'restore' : 'backup'}-client`;
  const currentPod = (
    await probe.json('GET', `/api/v1/namespaces/equipment-recovery/pods/${own}`)
  ).value;
  if (
    currentPod.metadata?.uid !== challenge.fixtures?.[actor]?.podUid ||
    currentPod.metadata?.labels?.['equipment.recovery/qualification'] !== 'true'
  )
    fail();
  requests.push({
    verb: 'connect',
    resource: 'pods/exec',
    namespace: 'equipment-recovery',
    name: own,
    ...(await probe.ownExec(actor)),
  });
  requests.push({
    verb: 'create',
    resource: 'pods/exec',
    namespace: 'equipment-recovery',
    name: other,
    ...(await probe.deny(
      'POST',
      `/api/v1/namespaces/equipment-recovery/pods/${other}/exec?command=true&stdout=true`,
      {},
    )),
  });
  requests.push({
    verb: 'get',
    resource: 'secrets',
    namespace: 'equipment-recovery',
    name: 'equipment-qualification-forbidden',
    ...(await probe.deny(
      'GET',
      '/api/v1/namespaces/equipment-recovery/secrets/equipment-qualification-forbidden',
    )),
  });
  const scale =
    actor === 'backup'
      ? (
          await probe.json(
            'GET',
            '/apis/apps/v1/namespaces/equipment-recovery/deployments/equipment-qualification-writer/scale',
          )
        ).value.spec?.replicas
      : 0;
  requests.push({
    verb: 'patch',
    resource: 'deployments/scale',
    namespace: 'equipment-recovery',
    name: 'equipment-qualification-writer',
    ...(await probe.noOpScale(
      'equipment-recovery',
      'equipment-qualification-writer',
      scale,
      actor === 'backup',
    )),
  });
  requests.push({
    verb: 'patch',
    resource: 'deployments',
    namespace: 'equipment-recovery',
    name: 'equipment-qualification-writer',
    ...(await probe.denySpecWrite(
      'deployment',
      'equipment-recovery',
      'equipment-qualification-writer',
    )),
  });
  requests.push({
    verb: 'patch',
    resource: 'applications',
    namespace: 'argocd',
    name: 'equipment-azure',
    ...(await probe.denySpecWrite('application', 'argocd', 'equipment-azure')),
  });
  const access = await probe.json(
    'POST',
    '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
    {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          namespace: 'equipment-recovery',
          verb: 'create',
          resource: 'pods',
          subresource: 'exec',
          name: own,
        },
      },
    },
  );
  if (access.value.status?.allowed !== true) fail();
  requests.push({
    verb: 'create',
    resource: 'selfsubjectaccessreviews',
    name: own,
    httpStatus: access.httpStatus,
    outcome: 'allowed',
  });
  if (Date.now() >= Date.parse(challenge.expires)) fail();
  await assertQualificationLease(operation, config, [`qualification-${actor}`]);
  const rechecked = await validateQualificationLaunch();
  if (hash(rechecked) !== hash(launch)) fail();
  const proof = {
    version: 2,
    mode: 'activation',
    environment: config.environment,
    generation: config.generation,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: observed.clusterCaHash,
    principalId,
    challengeHash: hash(challenge),
    subscriptionId: config.subscriptionId,
    tenantId: config.tenantId,
    infrastructureAnchorRevision: config.gitRevision,
    sourceRevision: challenge.sourceRevision,
    actualProbeCodeRevision: launch.actualProbeCodeRevision,
    definitionManifest: launch.definition.manifest,
    installationState: challenge.installationState,
    nonce,
    ...definitions,
    started,
    completed: new Date().toISOString(),
    expires: challenge.expires,
    requests,
  };
  const store = createBlobJsonTransport({
    account: outputs.recovery_storage_account_name,
    container: `qualification-${actor}`,
    token,
    signal,
    request,
  });
  await store.createOnly(proofKey(config, nonce, actor), proof);
  return { actor, proofHash: hash(proof), completed: proof.completed };
}

export async function readRecoveryActivationReceipts({
  config,
  outputs,
  nonce,
  token,
  signal,
  request,
}) {
  if (
    !uuid(nonce) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(config?.environment ?? '') ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(config?.generation ?? '')
  )
    fail();
  const common = {
    account: outputs.recovery_storage_account_name,
    token,
    signal,
    request,
  };
  const challenges = createBlobJsonTransport({
    ...common,
    container: 'qualification-challenges',
  });
  const challenge = await challenges.read(challengeKey(config, nonce));
  const proofs = {};
  for (const actor of actors)
    proofs[actor] = await createBlobJsonTransport({
      ...common,
      container: 'qualification-' + actor,
    }).read(proofKey(config, nonce, actor));
  const consumption = await challenges.read(
    `consumption/${config.environment}/${config.generation}/${nonce}.json`,
  );
  return { challenge, proofs, consumption };
}

export async function readInitialQualificationEvidence({
  config,
  outputs,
  kubeconfig,
  token,
  signal,
  request,
  operation,
  nonce,
  installationInput,
  phase = 'target',
  validationTime,
}) {
  if (!['source', 'target'].includes(phase) || !uuid(nonce)) fail();
  const launch = await validateQualificationLaunch();
  await verifyQualificationReleaseContext({
    revision: launch.actualProbeCodeRevision,
    acrLoginServer: outputs.acr_login_server,
    signal,
  });
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'recovery-activate',
  ]);
  const probe = createKubectlQualificationProbe({ kubeconfig, signal });
  const observed = await observedCluster({
    config,
    outputs,
    kubeconfig,
    token,
    signal,
    request,
    probe,
  });
  const common = {
    account: outputs.recovery_storage_account_name,
    token,
    signal,
    request,
  };
  const challenge = await createBlobJsonTransport({
    ...common,
    container: 'qualification-challenges',
  }).read(challengeKey(config, nonce));
  const proofs = {};
  for (const actor of actors)
    proofs[actor] = await createBlobJsonTransport({
      ...common,
      container: 'qualification-' + actor,
    }).read(proofKey(config, nonce, actor));
  await validateQualificationInstallationContext({
    input: installationInput,
    acrLoginServer: outputs.acr_login_server,
    binding: challenge.installationState,
    phase,
  });
  for (const record of [challenge, ...Object.values(proofs)]) {
    if (
      !record.definitionManifest ||
      !/^[a-f0-9]{40}$/.test(record.actualProbeCodeRevision ?? '') ||
      hash(record.definitionManifest) !== hash(launch.definition.manifest) ||
      hash(
        qualificationSourceDefinition({
          revision: record.actualProbeCodeRevision,
        }),
      ) !== hash(launch.definition)
    )
      fail();
  }
  if (
    hash(
      qualificationSourceDefinition({ revision: challenge.sourceRevision }),
    ) !== hash(launch.definition)
  )
    fail();
  const settings = {
    challenge,
    proofs,
    config,
    outputs,
    definitions: qualificationDefinition(),
    installationState: challenge.installationState,
    clusterCaHash: observed.clusterCaHash,
    ...(validationTime !== undefined ? { now: validationTime } : {}),
  };
  const hashes = validateInitialQualificationRecords(settings);
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'recovery-activate',
  ]);
  const rechecked = await validateQualificationLaunch();
  if (hash(rechecked) !== hash(launch)) fail();
  return {
    ...settings,
    ...hashes,
    actualProbeCodeRevision: launch.actualProbeCodeRevision,
  };
}

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new OperationalFailure(
      'Qualification requires its protected hosted main identity.',
    );
  await validateQualificationLaunch();
  const [action, ...args] = process.argv.slice(2);
  if (action !== 'prove') fail();
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--config', '--locator', '--actor', '--nonce'].includes(args[index]) ||
      !args[index + 1] ||
      options[args[index]]
    )
      fail();
    options[args[index]] = args[index + 1];
  }
  actorCheck(options['--actor']);
  if (!uuid(options['--nonce'])) fail();
  const { loadAzureConfig, runPrivateProcess } =
    await import('./azure-infrastructure.mjs');
  const { loadHostedProjections, validateBootstrapLocator } =
    await import('./azure-handoff.mjs');
  const { withQualificationOperation } = await import('./azure-operations.mjs');
  const { prepareUserKubeconfig } = await import('./azure-provisioning.mjs');
  const config = loadAzureConfig(options['--config']);
  assertPrivatePath(resolve(options['--locator']), 0o600);
  let locator;
  try {
    locator = validateBootstrapLocator(
      JSON.parse(readFileSync(options['--locator'], 'utf8')),
    );
  } catch {
    fail();
  }
  const tokens = new Map();
  const token = async (resource) => {
    if (
      !['https://management.azure.com/', 'https://storage.azure.com/'].includes(
        resource,
      )
    )
      fail();
    const cached = tokens.get(resource);
    if (cached && cached.expires > Date.now()) return cached.token;
    const args = [
      'account',
      'get-access-token',
      '--resource',
      resource,
      '--subscription',
      config.subscriptionId,
      '--output',
      'json',
      '--only-show-errors',
    ];
    const value = JSON.parse(
      await runPrivateProcess(
        process.platform === 'win32' ? 'cmd.exe' : 'az',
        process.platform === 'win32'
          ? ['/d', '/s', '/c', `az ${args.map((arg) => `"${arg}"`).join(' ')}`]
          : args,
        {
          tool: 'az',
          operation: 'Private qualification token acquisition',
          timeout: 30000,
        },
      ),
    );
    if (typeof value.accessToken !== 'string' || !value.accessToken) fail();
    tokens.set(resource, {
      token: value.accessToken,
      expires: Date.now() + 1200000,
    });
    return value.accessToken;
  };
  const projections = await loadHostedProjections({
    config,
    locator,
    includeFoundation: false,
    includeEnvironment: true,
    token,
  });
  if (!projections.outputs) fail();
  const response = await globalThis.fetch('https://api.ipify.org?format=json', {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(10000),
  });
  if (!response.ok) fail();
  const { ip } = await response.json();
  if (isIP(ip) !== 4) fail();
  const directory = mkdtempSync(join(tmpdir(), 'equipment-qualification-'));
  createPrivateDirectory(directory);
  try {
    await withQualificationOperation(
      { config, outputs: projections.outputs, token, cidr: `${ip}/32` },
      options['--actor'],
      async (operation) => {
        const { kubeconfig } = await prepareUserKubeconfig({
          config,
          outputs: projections.outputs,
          token,
          stateDirectory: directory,
          signal: operation.signal,
        });
        await produceInitialQualificationProof({
          actor: options['--actor'],
          nonce: options['--nonce'],
          config,
          outputs: projections.outputs,
          installationInput: projections.outputs.projection_inputs,
          kubeconfig,
          token,
          signal: operation.signal,
          operation,
        });
      },
    );
    console.log(
      'Protected actor qualification proof persisted; initial activation remains separate.',
    );
  } finally {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !directory.startsWith(join(tmpdir(), 'equipment-qualification-'))
    )
      fail();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      safeFailure(error, 'Qualification failed; private details suppressed.'),
    );
    process.exitCode = 1;
  });
