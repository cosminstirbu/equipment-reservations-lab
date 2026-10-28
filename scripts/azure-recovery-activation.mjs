import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { OperationalFailure, cleanupAll } from './process.mjs';
import {
  createKubectlQualificationProbe,
  validateInitialQualificationRecords,
  readInitialQualificationEvidence,
  assertQualificationLease,
  readRecoveryActivationReceipts,
} from './azure-qualification.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import { validateQualificationLaunch } from './azure-qualification-launch.mjs';
import { createBlobJsonTransport } from './azure-handoff.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { renderVerificationResources } from './azure-runtime.mjs';

const fail = () => {
  throw new OperationalFailure(
    'Recovery authority differs from its exact reviewed roles, bindings or actor principal.',
  );
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

export async function observeRecoveryActor({
  outputs,
  actor,
  kubeconfig,
  signal,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  if (!['backup', 'restore'].includes(actor)) fail();
  const principalId = outputs.github_principal_ids?.[actor];
  if (
    !/^[a-f0-9-]{36}$/.test(principalId ?? '') ||
    principalId ===
      outputs.github_principal_ids?.[actor === 'backup' ? 'restore' : 'backup']
  )
    fail();
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal,
  });
  const response = await probe.json(
    'POST',
    '/apis/authentication.k8s.io/v1/selfsubjectreviews',
    { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' },
  );
  const identity = response.value.status?.userInfo;
  if (
    response.value.kind !== 'SelfSubjectReview' ||
    !(
      identity?.username?.toLowerCase() === principalId ||
      identity?.extra?.oid?.includes(principalId)
    )
  )
    fail();
  const authority = await inspectRecoveryAuthority({
    kubeconfig,
    actor,
    principalId,
    signal,
    kubectl,
  });
  return {
    actor,
    principalId,
    authority,
    observedAt: new Date().toISOString(),
  };
}

export async function collectRecoverySourceFacts({
  config,
  outputs,
  kubeconfig,
  token,
  signal,
  request = globalThis.fetch,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  const identity = await observeRecoveryActor({
    outputs,
    actor: 'backup',
    kubeconfig,
    signal,
    kubectl,
  });
  const vaultUri = outputs.workload_key_vault_uri?.replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]{3,24}\.vault\.azure\.net$/.test(vaultUri ?? ''))
    fail();
  const vaultId =
    '/subscriptions/' +
    config.subscriptionId +
    '/resourceGroups/er-' +
    config.environment +
    '-workload/providers/Microsoft.KeyVault/vaults/' +
    new URL(vaultUri).hostname.split('.')[0];
  try {
    const response = await request(
      'https://management.azure.com' + vaultId + '?api-version=2024-11-01',
      {
        headers: {
          Authorization:
            'Bearer ' + (await token('https://management.azure.com/')),
        },
        redirect: 'error',
        signal: globalThis.AbortSignal.any([
          ...(signal ? [signal] : []),
          globalThis.AbortSignal.timeout(30000),
        ]),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      fail();
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 65536) fail();
      chunks.push(chunk);
    }
    const { Buffer } = await import('node:buffer');
    const actual = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (
      actual.id?.toLowerCase() !== vaultId.toLowerCase() ||
      actual.tags?.environment !== config.environment ||
      actual.tags?.generation !== config.generation ||
      actual.properties?.tenantId !== config.tenantId ||
      actual.properties.vaultUri?.replace(/\/$/, '') !== vaultUri
    )
      throw new OperationalFailure(
        'Backup source vault context does not match actual resource truth.',
      );
    const { createIdentityContinuityStore, identityContinuityMetadata } =
      await import('./azure-recovery-identity.mjs');
    const snapshot = await createIdentityContinuityStore({
      vaultUri,
      tenantId: config.tenantId,
      generation: config.generation,
      actor: 'backup',
      token,
      request,
      signal,
    }).capture();
    return {
      producerPrincipalId: identity.principalId,
      ...identityContinuityMetadata(snapshot, {
        vaultUri,
        vaultId,
        tenantId: config.tenantId,
        generation: config.generation,
      }),
    };
  } catch {
    throw new OperationalFailure(
      'Backup source context capture failed; private values suppressed.',
    );
  }
}

export async function observeRecoveryMaintenance({
  actor,
  kubeconfig,
  signal,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  if (!['backup', 'restore'].includes(actor)) fail();
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal,
  });
  const expected = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/argocd/azure/application/application.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const application = (
    await probe.json(
      'GET',
      '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/equipment-azure',
    )
  ).value;
  if (
    application.kind !== 'Application' ||
    application.metadata?.name !== 'equipment-azure' ||
    application.metadata.namespace !== 'argocd' ||
    !isDeepStrictEqual(application.spec?.source, expected.spec.source) ||
    !isDeepStrictEqual(
      application.spec.destination,
      expected.spec.destination,
    ) ||
    application.spec.project !== expected.spec.project
  )
    throw new OperationalFailure(
      'Recovery maintenance application source or destination differs from reviewed Git.',
    );
  const project = (
    await probe.json(
      'GET',
      '/apis/argoproj.io/v1alpha1/namespaces/argocd/appprojects/equipment-azure',
    )
  ).value;
  if (
    project.kind !== 'AppProject' ||
    project.metadata?.name !== 'equipment-azure' ||
    project.metadata.namespace !== 'argocd'
  )
    fail();
  const seedJobs = [];
  if (actor === 'restore')
    for (const name of ['database-bootstrap', 'identity-bootstrap']) {
      const job = await probe.getOptional(
        '/apis/batch/v1/namespaces/equipment/jobs/' + name,
      );
      if (job) {
        if (
          job.kind !== 'Job' ||
          job.metadata?.name !== name ||
          job.metadata.namespace !== 'equipment'
        )
          fail();
        seedJobs.push(job);
      }
    }
  return {
    application,
    project,
    seedJobs,
    observedAt: new Date().toISOString(),
  };
}

export async function inspectRecoveryAuthority({
  kubeconfig,
  actor,
  principalId,
  signal,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  if (
    !['backup', 'restore'].includes(actor) ||
    !/^[a-f0-9-]{36}$/.test(principalId ?? '')
  )
    fail();
  const source = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/platform/azure/recovery-controls/roles.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const base = 'equipment-recovery-' + actor;
  const inventory = [
    ['equipment-recovery', base],
    ['equipment', base + '-scale'],
    ['cert-manager', base + '-continuity'],
    ['argocd', base + '-continuity'],
    [undefined, base + '-issuers'],
  ];
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal,
  });
  const records = [];
  for (const [namespace, name] of inventory) {
    const kind = namespace ? 'Role' : 'ClusterRole';
    const expected = source.items.find(
      (item) =>
        item.kind === kind &&
        item.metadata.namespace === namespace &&
        item.metadata.name === name,
    );
    if (!expected) fail();
    const prefix =
      '/apis/rbac.authorization.k8s.io/v1/' +
      (namespace ? 'namespaces/' + namespace + '/' : '');
    const role = (
      await probe.json(
        'GET',
        prefix + (namespace ? 'roles/' : 'clusterroles/') + name,
      )
    ).value;
    const binding = (
      await probe.json(
        'GET',
        prefix + (namespace ? 'rolebindings/' : 'clusterrolebindings/') + name,
      )
    ).value;
    const subjects = [
      {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'User',
        name: principalId,
      },
    ];
    if (
      role.kind !== kind ||
      role.metadata?.name !== name ||
      role.metadata.namespace !== namespace ||
      role.aggregationRule ||
      !isDeepStrictEqual(role.rules, expected.rules) ||
      binding.metadata?.name !== name ||
      binding.metadata.namespace !== namespace ||
      binding.kind !== (namespace ? 'RoleBinding' : 'ClusterRoleBinding') ||
      !isDeepStrictEqual(binding.roleRef, {
        apiGroup: 'rbac.authorization.k8s.io',
        kind,
        name,
      }) ||
      !isDeepStrictEqual(binding.subjects, subjects)
    )
      fail();
    records.push({
      namespace: namespace ?? null,
      name,
      roleHash: digest(role.rules),
      bindingHash: digest({
        roleRef: binding.roleRef,
        subjects: binding.subjects,
      }),
    });
  }
  return records;
}

export function createRecoveryActivationRecord(settings) {
  const { challenge, config, outputs, definitions, installationState } =
    settings;
  const { challengeHash, proofHashes } =
    validateInitialQualificationRecords(settings);
  return {
    version: 2,
    mode: 'recovery-activation',
    environment: config.environment,
    generation: config.generation,
    subscriptionId: config.subscriptionId,
    tenantId: config.tenantId,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: challenge.clusterCaHash,
    infrastructureAnchorRevision: config.gitRevision,
    sourceRevision: challenge.sourceRevision,
    nonce: challenge.nonce,
    principals: challenge.principals,
    challengeHash,
    proofHashes,
    ...definitions,
    definitionManifest: challenge.definitionManifest,
    installationState,
  };
}

export function assertRecoveryActivationRecord(record, expected) {
  if (
    !record ||
    record.version !== 2 ||
    record.mode !== 'recovery-activation' ||
    !isDeepStrictEqual(record, expected)
  )
    throw new OperationalFailure(
      'Reviewed recovery activation differs from actual trusted qualification records.',
    );
}

async function waitApplication(probe, name, revision, signal) {
  while (true) {
    signal.throwIfAborted();
    const value = (
      await probe.json(
        'GET',
        '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/' + name,
      )
    ).value;
    if (
      value.operation ||
      ['Running', 'Terminating'].includes(value.status?.operationState?.phase)
    ) {
      await delay(1000, undefined, { signal });
      continue;
    }
    if (
      value.status?.sync?.status === 'Synced' &&
      value.status.sync.revision === revision &&
      value.status.health?.status === 'Healthy'
    )
      return;
    await delay(1000, undefined, { signal });
  }
}

async function qualifyAdmission(probe) {
  const source = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/platform/azure/recovery-controls/admission.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const normalize = (spec) => {
    const result = globalThis.structuredClone(spec);
    for (const field of ['matchConstraints', 'matchResources'])
      if (result[field]) {
        result[field].matchPolicy ??= 'Equivalent';
        result[field].namespaceSelector ??= {};
        result[field].objectSelector ??= {};
      }
    return result;
  };
  for (const expected of source.items) {
    const collection =
      expected.kind === 'ValidatingAdmissionPolicy'
        ? 'validatingadmissionpolicies'
        : 'validatingadmissionpolicybindings';
    const actual = (
      await probe.json(
        'GET',
        '/apis/admissionregistration.k8s.io/v1/' +
          collection +
          '/' +
          expected.metadata.name,
      )
    ).value;
    if (!isDeepStrictEqual(normalize(actual.spec), normalize(expected.spec)))
      fail();
    if (
      expected.kind === 'ValidatingAdmissionPolicy' &&
      (!actual.status?.typeChecking ||
        actual.status.observedGeneration !== actual.metadata.generation ||
        (actual.status.typeChecking.expressionWarnings ?? []).length)
    )
      fail();
  }
  const { job, service } = renderVerificationResources('0123456789abcdef');
  await probe.admissionCheck('jobs', job, true);
  await probe.admissionCheck('services', service, true);
  const jobMutations = [
    (candidate) =>
      (candidate.spec.template.spec.containers[0].image =
        'invalid.example/foreign:latest'),
    (candidate) =>
      candidate.spec.template.spec.containers[0].env.push({
        name: 'UNREVIEWED',
        value: 'x',
      }),
    (candidate) =>
      candidate.spec.template.spec.volumes.push({
        name: 'host',
        hostPath: { path: '/tmp' },
      }),
    (candidate) =>
      (candidate.spec.template.spec.containers[0].securityContext.privileged = true),
    (candidate) => (candidate.metadata.name = 'unreviewed'),
  ];
  for (const mutate of jobMutations) {
    const candidate = globalThis.structuredClone(job);
    mutate(candidate);
    await probe.admissionCheck('jobs', candidate, false);
  }
  for (const mutate of [
    (candidate) => (candidate.spec.externalIPs = ['203.0.113.1']),
    (candidate) => (candidate.spec.selector.foreign = 'x'),
    (candidate) => (candidate.metadata.name = 'unreviewed'),
  ]) {
    const candidate = globalThis.structuredClone(service);
    mutate(candidate);
    await probe.admissionCheck('services', candidate, false);
  }
}

export async function executeRecoveryActivation({
  config,
  outputs,
  installationInput,
  kubeconfig,
  token,
  signal,
  operation,
  vaultGuard,
  request,
}) {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new OperationalFailure(
      'Recovery activation requires protected hosted apply.',
    );
  const launch = await validateQualificationLaunch();
  const kubectl = verifiedTool(qualityContext(), 'kubectl');
  const activationSignal = globalThis.AbortSignal.any([
    ...(signal ? [signal] : []),
    globalThis.AbortSignal.timeout(1800000),
  ]);
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal: activationSignal,
  });
  const identity = (
    await probe.json(
      'POST',
      '/apis/authentication.k8s.io/v1/selfsubjectreviews',
      { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview' },
    )
  ).value.status?.userInfo;
  const applyId = outputs.github_principal_ids?.apply;
  if (
    !/^[a-f0-9-]{36}$/.test(applyId ?? '') ||
    !(
      identity?.username?.toLowerCase() === applyId ||
      identity?.extra?.oid?.includes(applyId)
    )
  )
    fail();
  const recordText = readFileSync(
    new URL(
      '../deploy/platform/azure/recovery-activation.json',
      import.meta.url,
    ),
    'utf8',
  );
  const record = JSON.parse(recordText);
  const prettier = await import('prettier');
  if (
    recordText !==
    (await prettier.format(JSON.stringify(record), { parser: 'json' }))
  )
    fail();
  const evidence = await readInitialQualificationEvidence({
    config,
    outputs,
    installationInput,
    kubeconfig,
    token,
    signal: activationSignal,
    operation,
    request,
    nonce: record.nonce,
    phase: 'target',
  });
  assertRecoveryActivationRecord(
    record,
    createRecoveryActivationRecord(evidence),
  );
  const { validateVaultGuardEvidence } =
    await import('./azure-vault-guard.mjs');
  const { populateRecoverySecrets } = await import('./azure-provisioning.mjs');
  if (
    typeof validateVaultGuardEvidence !== 'function' ||
    typeof populateRecoverySecrets !== 'function'
  )
    throw new OperationalFailure(
      'Reviewed guard and recovery credential provisioning prerequisites are unavailable.',
    );
  const { configuredNetworkResources } = await import('./azure-operations.mjs');
  const workloadVaultId = configuredNetworkResources(config, outputs, {
    resources: ['workloadVault'],
  }).resources.workloadVault.id;
  await validateVaultGuardEvidence({
    ...vaultGuard,
    config,
    workloadVaultId,
    sourceClosureHash: launch.definition.probeDefinitionHash,
    token,
    signal: activationSignal,
    usage: 'active',
    operation,
  });
  await qualifyAdmission(probe);
  await waitApplication(
    probe,
    'equipment-azure-platform',
    launch.actualProbeCodeRevision,
    activationSignal,
  );
  const rechecked = await validateQualificationLaunch();
  if (digest(rechecked) !== digest(launch)) fail();
  const store = createBlobJsonTransport({
    account: outputs.recovery_storage_account_name,
    container: 'qualification-challenges',
    token,
    signal: activationSignal,
    request,
  });
  const consumption = {
    version: 2,
    mode: 'recovery-activation-consumption',
    environment: config.environment,
    generation: config.generation,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: evidence.clusterCaHash,
    nonce: record.nonce,
    challengeHash: evidence.challengeHash,
    proofHashes: evidence.proofHashes,
    activationRecordHash: digest(record),
    activationRevision: launch.actualProbeCodeRevision,
    infrastructureAnchorRevision: config.gitRevision,
    installationTargetHash: record.installationState.target.hash,
    consumer: applyId,
    consumedAt: new Date().toISOString(),
    leaseId: operation.leaseId,
  };
  validateInitialQualificationRecords({ ...evidence, now: Date.now() });
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'recovery-activate',
  ]);
  await store.createOnly(
    'consumption/' +
      config.environment +
      '/' +
      config.generation +
      '/' +
      record.nonce +
      '.json',
    consumption,
  );
  const fixtures = ['backup', 'restore'].flatMap((actor) => [
    {
      path:
        '/api/v1/namespaces/equipment-recovery/pods/equipment-' +
        actor +
        '-client',
      uid: evidence.challenge.fixtures[actor].podUid,
    },
    {
      path:
        '/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/rolebindings/equipment-recovery-qualification-' +
        actor,
      uid: evidence.challenge.fixtures[actor].bindingUid,
    },
  ]);
  await cleanupAll(
    fixtures.map(({ path, uid }) => ({
      operation: 'UID-owned harmless qualification cleanup',
      tool: 'kubectl',
      run: async () => {
        const actual = await probe.getOptional(path);
        if (!actual) return;
        if (actual.metadata?.uid !== uid) fail();
        await runPrivateProcess(
          kubectl,
          ['--kubeconfig', kubeconfig, 'delete', '--raw', path, '-f', '-'],
          {
            operation: 'UID-owned harmless recovery fixture removal',
            tool: 'kubectl',
            input: JSON.stringify({
              apiVersion: 'v1',
              kind: 'DeleteOptions',
              preconditions: { uid },
              propagationPolicy: 'Foreground',
            }),
            signal: activationSignal,
            timeout: 30000,
          },
        );
        while (true) {
          const current = await probe.getOptional(path);
          if (!current) return;
          if (current.metadata?.uid !== uid) fail();
          await delay(1000, undefined, { signal: activationSignal });
        }
      },
    })),
  );
  const qualification = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/platform/azure/recovery-controls/qualification.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const item of qualification.items.filter((item) =>
    ['Role', 'Deployment'].includes(item.kind),
  )) {
    const path =
      item.kind === 'Role'
        ? '/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/roles/'
        : '/apis/apps/v1/namespaces/equipment-recovery/deployments/';
    if (await probe.getOptional(path + item.metadata.name)) fail();
  }
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'recovery-activate',
  ]);
  await populateRecoverySecrets({
    vaultUri: outputs.workload_key_vault_uri,
    token,
    signal: activationSignal,
    request,
  });
  const bindings = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/platform/azure/runtime/recovery-continuity-bindings.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  if (bindings.kind !== 'List' || bindings.items?.length !== 6) fail();
  for (const binding of bindings.items) {
    const actor = ['backup', 'restore'].find((value) =>
      binding.metadata.name.startsWith('equipment-recovery-' + value + '-'),
    );
    const namespace = binding.metadata.namespace;
    const cluster = binding.kind === 'ClusterRoleBinding';
    if (
      !actor ||
      !isDeepStrictEqual(binding.subjects, [
        {
          kind: 'User',
          apiGroup: 'rbac.authorization.k8s.io',
          name: outputs.github_principal_ids[actor],
        },
      ]) ||
      binding.roleRef.name !== binding.metadata.name ||
      binding.roleRef.kind !== (cluster ? 'ClusterRole' : 'Role') ||
      !(cluster
        ? binding.metadata.name ===
            'equipment-recovery-' + actor + '-issuers' && !namespace
        : ['cert-manager', 'argocd'].includes(namespace) &&
          binding.metadata.name ===
            'equipment-recovery-' + actor + '-continuity')
    )
      fail();
    const collection =
      '/apis/rbac.authorization.k8s.io/v1/' +
      (cluster
        ? 'clusterrolebindings'
        : 'namespaces/' + namespace + '/rolebindings');
    if (await probe.getOptional(collection + '/' + binding.metadata.name))
      fail();
    await assertQualificationLease(operation, config, [
      'bootstrap',
      'recovery-activate',
    ]);
    await probe.json('POST', collection, binding);
  }
  const application = JSON.parse(
    readFileSync(
      new URL(
        '../deploy/argocd/azure/recovery/application.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  if (
    application.metadata?.name !== 'equipment-azure-recovery' ||
    application.metadata.namespace !== 'argocd'
  )
    fail();
  const collection =
    '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications';
  if (await probe.getOptional(collection + '/' + application.metadata.name))
    fail();
  const finalLaunch = await validateQualificationLaunch();
  if (digest(finalLaunch) !== digest(launch)) fail();
  await assertQualificationLease(operation, config, [
    'bootstrap',
    'recovery-activate',
  ]);
  await probe.json('POST', collection, application);
  await waitApplication(
    probe,
    'equipment-azure-recovery',
    launch.actualProbeCodeRevision,
    activationSignal,
  );
  for (const actor of ['backup', 'restore'])
    await inspectRecoveryAuthority({
      kubeconfig,
      actor,
      principalId: outputs.github_principal_ids[actor],
      signal: activationSignal,
      kubectl,
    });
  return {
    phase: 'recovery-activated',
    generation: config.generation,
    revision: launch.actualProbeCodeRevision,
    installedTargetHash: record.installationState.target.hash,
    consumptionDigest: digest(consumption),
  };
}

export async function validateEstablishedRecoveryActivation({
  config,
  outputs,
  installationInput,
  kubeconfig,
  token,
  signal,
  operation,
  record: provided,
  request,
}) {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new OperationalFailure(
      'Recovery validation requires its protected hosted checkout and identity.',
    );
  const launch = await validateQualificationLaunch();
  const kubectl = verifiedTool(qualityContext(), 'kubectl');
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal,
  });
  const path = fileURLToPath(
    new URL(
      '../deploy/platform/azure/recovery-activation.json',
      import.meta.url,
    ),
  );
  let text;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1048576 || realpathSync(path) !== path)
      fail();
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (provided !== undefined) fail();
    const production = [
      '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/equipment-azure-recovery',
    ];
    for (const actor of ['backup', 'restore']) {
      const base = 'equipment-recovery-' + actor;
      production.push(
        '/apis/rbac.authorization.k8s.io/v1/namespaces/equipment-recovery/rolebindings/' +
          base,
        '/apis/rbac.authorization.k8s.io/v1/namespaces/equipment/rolebindings/' +
          base +
          '-scale',
        '/apis/rbac.authorization.k8s.io/v1/namespaces/cert-manager/rolebindings/' +
          base +
          '-continuity',
        '/apis/rbac.authorization.k8s.io/v1/namespaces/argocd/rolebindings/' +
          base +
          '-continuity',
        '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/' +
          base +
          '-issuers',
      );
      const pod = await probe.getOptional(
        '/api/v1/namespaces/equipment-recovery/pods/equipment-' +
          actor +
          '-client',
      );
      if (
        pod &&
        (pod.metadata?.labels?.['equipment.recovery/qualification'] !==
          'true' ||
          pod.spec?.serviceAccountName !== 'equipment-recovery-qualification' ||
          pod.spec.volumes?.some((volume) => volume.csi || volume.secret))
      )
        fail();
    }
    for (const name of production) if (await probe.getOptional(name)) fail();
    return null;
  }
  const record = JSON.parse(text);
  if (provided !== undefined && !isDeepStrictEqual(provided, record)) fail();
  const prettier = await import('prettier');
  if (
    text !== (await prettier.format(JSON.stringify(record), { parser: 'json' }))
  )
    fail();
  if (
    record.version !== 2 ||
    record.mode !== 'recovery-activation' ||
    !/^[a-f0-9-]{36}$/.test(record.nonce ?? '')
  )
    fail();
  const { consumption } = await readRecoveryActivationReceipts({
    config,
    outputs,
    nonce: record.nonce,
    token,
    signal,
    request,
  });
  const consumedAt = Date.parse(consumption.consumedAt);
  if (
    consumption.version !== 2 ||
    consumption.mode !== 'recovery-activation-consumption' ||
    consumption.environment !== config.environment ||
    consumption.generation !== config.generation ||
    consumption.clusterId !== outputs.aks_resource_id ||
    consumption.nonce !== record.nonce ||
    consumption.activationRecordHash !== digest(record) ||
    consumption.consumer !== outputs.github_principal_ids?.apply ||
    consumption.infrastructureAnchorRevision !== config.gitRevision ||
    !/^[a-f0-9]{40}$/.test(consumption.activationRevision ?? '') ||
    !Number.isFinite(consumedAt) ||
    consumedAt > Date.now()
  )
    fail();
  const evidence = await readInitialQualificationEvidence({
    config,
    outputs,
    installationInput,
    kubeconfig,
    token,
    signal,
    request,
    operation,
    nonce: record.nonce,
    phase: 'target',
    validationTime: consumedAt,
  });
  assertRecoveryActivationRecord(
    record,
    createRecoveryActivationRecord(evidence),
  );
  if (
    consumption.challengeHash !== evidence.challengeHash ||
    !isDeepStrictEqual(consumption.proofHashes, evidence.proofHashes) ||
    consumption.clusterCaHash !== evidence.clusterCaHash ||
    consumption.installationTargetHash !== record.installationState.target.hash
  )
    fail();
  const original = await runPrivateProcess(
    'git',
    [
      'show',
      consumption.activationRevision +
        ':deploy/platform/azure/recovery-activation.json',
    ],
    {
      operation: 'Original consumed recovery activation Git object',
      tool: 'git',
      timeout: 10000,
      signal,
    },
  );
  if (original !== text) fail();
  await waitApplication(
    probe,
    'equipment-azure-recovery',
    launch.actualProbeCodeRevision,
    globalThis.AbortSignal.any([
      ...(signal ? [signal] : []),
      globalThis.AbortSignal.timeout(600000),
    ]),
  );
  for (const actor of ['backup', 'restore'])
    await inspectRecoveryAuthority({
      kubeconfig,
      actor,
      principalId: outputs.github_principal_ids[actor],
      signal,
      kubectl,
    });
  await qualifyAdmission(probe);
  const rechecked = await validateQualificationLaunch();
  if (digest(rechecked) !== digest(launch)) fail();
  return {
    generation: config.generation,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: evidence.clusterCaHash,
    revision: launch.actualProbeCodeRevision,
    installedTargetHash: record.installationState.target.hash,
    activationRecordHash: digest(record),
    consumptionDigest: digest(consumption),
    record,
  };
}
export async function observeAzureGitOpsTargets({
  kubeconfig,
  revision,
  signal,
  timeoutMs = 600000,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  if (
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 600000
  )
    throw new OperationalFailure(
      'Actual GitOps source observation requires a bounded reviewed revision.',
    );
  const bounded = globalThis.AbortSignal.any([
    ...(signal ? [signal] : []),
    globalThis.AbortSignal.timeout(timeoutMs),
  ]);
  const probe = createKubectlQualificationProbe({
    kubeconfig,
    command: kubectl,
    signal: bounded,
  });
  const targets = {};
  for (const [key, directory] of [
    ['platform', 'platform'],
    ['application', 'application'],
  ]) {
    const expected = JSON.parse(
      readFileSync(
        new URL(
          '../deploy/argocd/azure/' + directory + '/application.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    while (true) {
      const actual = (
        await probe.json(
          'GET',
          '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/' +
            expected.metadata.name,
        )
      ).value;
      if (
        actual.kind !== 'Application' ||
        actual.metadata?.name !== expected.metadata.name ||
        actual.metadata.namespace !== 'argocd' ||
        !isDeepStrictEqual(actual.spec?.source, expected.spec.source) ||
        actual.spec.project !== expected.spec.project ||
        !isDeepStrictEqual(actual.spec.destination, expected.spec.destination)
      )
        throw new OperationalFailure(
          'Actual GitOps source, project or destination differs from the reviewed target.',
        );
      if (
        !actual.operation &&
        !['Running', 'Terminating'].includes(
          actual.status?.operationState?.phase,
        ) &&
        actual.status?.sync?.status === 'Synced' &&
        actual.status.sync.revision === revision &&
        actual.status.health?.status === 'Healthy'
      ) {
        targets[key] = {
          name: expected.metadata.name,
          revision,
          sync: 'Synced',
          health: 'Healthy',
          sourceHash: digest(actual.spec.source),
          project: actual.spec.project,
          destinationHash: digest(actual.spec.destination),
        };
        break;
      }
      await delay(1000, undefined, { signal: bounded });
    }
  }
  return { ...targets, observedAt: new Date().toISOString() };
}
