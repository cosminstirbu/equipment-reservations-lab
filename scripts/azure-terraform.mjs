import { createGeneratorInput } from './azure-generator-input.mjs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OperationalFailure,
  safeFailure,
  cleanupAllSync,
  executeProcess,
} from './process.mjs';
import {
  createPrivateDirectory,
  assertPrivatePath,
} from './local-platform.mjs';
import {
  validateReviewAssociation,
  configurationHash,
  runPrivateProcess,
  runAzure,
  validateTerraformOutputs,
  preflight,
} from './azure-infrastructure.mjs';
import {
  qualityContext,
  verifiedTool,
  verifyPolicy,
  assertSecurityReport,
  controlledTerraformEnvironment,
  controlledTerraformCli,
  cleanEnvironment,
} from './azure-quality.mjs';
import { workloadSecrets, recoveryWorkloadSecrets } from './azure-runtime.mjs';
import { renderRuntimeProjection } from './azure-runtime.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new OperationalFailure(message);
};
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function assertSourceRevision(revision, { root = repository } = {}) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? ''))
    fail('Exact reviewed Git revision is required.');
  const current = executeProcess('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    operation: 'Reviewed revision verification',
    tool: 'git',
    output: 'private-capture',
  }).trim();
  const changes = executeProcess(
    'git',
    [
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'infra',
      'deploy',
      'scripts',
      '.github',
      'package.json',
      'package-lock.json',
    ],
    {
      cwd: root,
      operation: 'Reviewed source verification',
      tool: 'git',
      output: 'private-capture',
    },
  );
  if (current !== revision || changes.trim())
    fail(
      'Reviewed revision does not match a clean immutable deployment source.',
    );
}

export function azureTokenProvider(config, run = runAzure) {
  const tokens = new Map();
  return async (resource) => {
    const previous = tokens.get(resource);
    if (previous && previous.expires > Date.now()) return previous.value;
    const result = run([
      'account',
      'get-access-token',
      '--resource',
      resource,
      '--subscription',
      config.subscriptionId,
    ]);
    if (typeof result.accessToken !== 'string' || !result.accessToken)
      fail('Azure authentication prerequisite failed.');
    tokens.set(resource, {
      value: result.accessToken,
      expires: Date.now() + 300000,
    });
    return result.accessToken;
  };
}

export function privateBlobStore(
  config,
  foundation,
  token,
  backend = config.environmentBackend,
) {
  const account = backend.storageAccountName;
  const read = async (container, key) => request(container, key, 'GET');
  async function request(container, key, method, body) {
    if (
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(container) ||
      !/^[a-zA-Z0-9._/-]+$/.test(key) ||
      key.includes('..')
    )
      fail('Private Blob address is invalid.');
    let response;
    try {
      response = await globalThis.fetch(
        `https://${account}.blob.core.windows.net/${container}/${key}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${await token('https://storage.azure.com/')}`,
            'x-ms-version': '2023-11-03',
            ...(method === 'PUT' ? { 'x-ms-blob-type': 'BlockBlob' } : {}),
          },
          body,
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(30000),
        },
      );
    } catch {
      fail('Private Blob request failed; transport details suppressed.');
    }
    if (method === 'GET' && response.status === 404) return null;
    if (!response.ok)
      fail(`Private Blob request failed; HTTP status ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 64 * 1024 * 1024)
      fail('Private Blob response exceeded its size budget.');
    return bytes;
  }
  return {
    async previousOutputs() {
      const data = await read(backend.containerName, backend.key);
      if (!data) return undefined;
      let state;
      try {
        state = JSON.parse(data.toString('utf8'));
      } catch {
        fail('Private backend state is invalid.');
      }
      return state.outputs && Object.keys(state.outputs).length
        ? validateTerraformOutputs(state.outputs)
        : undefined;
    },
    async state() {
      const data = await read(backend.containerName, backend.key);
      if (data === null) return { lineage: 'uncreated', serial: 0 };
      try {
        return validateState(JSON.parse(data.toString('utf8')));
      } catch {
        fail('Private backend state identity is invalid.');
      }
    },
    async persist({ review, plan }) {
      const prefix = `${config.environment}/${review.revision}/${review.planHash}`;
      await request(
        foundation.plan_container_name,
        `${prefix}.tfplan`,
        'PUT',
        plan,
      );
      await request(
        foundation.plan_container_name,
        `${prefix}.review.json`,
        'PUT',
        JSON.stringify(review),
      );
    },
    async restore(review, directory) {
      const prefix = `${config.environment}/${review.revision}/${review.planHash}`;
      const bytes = await read(
        foundation.plan_container_name,
        `${prefix}.tfplan`,
      );
      if (!bytes || hash(bytes) !== review.planHash)
        fail('Private saved plan is unavailable or has wrong digest.');
      writeFileSync(join(directory, 'saved.tfplan'), bytes, { mode: 0o600 });
    },
  };
}

function requireGuardAuthorityContract() {
  // This unfinished phase cannot grant or exercise operational authority until
  // the reviewed G3 descriptor/denial contract has a real validator.
  fail(
    'Mandatory reviewed G3 guard authority qualification is unavailable; protected operation remains blocked.',
  );
}

export async function executeGuardQualification({
  config,
  foundation,
  environment,
  purpose,
  revision,
  familyHandlePath,
}) {
  if (
    !['human-policy-family', 'workload-generation'].includes(purpose) ||
    !foundation?.vault_guard ||
    (purpose === 'workload-generation' && (!environment || !familyHandlePath))
  )
    fail(
      'Guard qualification requires validated purpose and actual private resource projections.',
    );
  requireGuardAuthorityContract();
  assertPhaseRevision(config, revision);
  await verifyTrustedMainRevision(config, revision);
  const { qualificationSourceDefinition } =
    await import('./azure-qualification-launch.mjs');
  const definition = qualificationSourceDefinition({
    root: repository,
    revision,
  });
  const {
    createRestProvider,
    createArmNetworkProvider,
    configuredNetworkResources,
    withAzureOperation,
  } = await import('./azure-operations.mjs');
  const { qualifyVaultGuards } = await import('./azure-vault-guard.mjs');
  const token = azureTokenProvider(config);
  const networkProvider = createArmNetworkProvider({
    ...configuredNetworkResources(config, foundation, { retainedOnly: true }),
    token: () => token('https://management.azure.com/'),
  });
  const provider = createRestProvider({
    account: foundation.operation_storage_account_name,
    container: foundation.operation_container_name,
    environment: config.environment,
    token,
  });
  const response = await globalThis.fetch('https://api.ipify.org?format=json', {
    signal: globalThis.AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) fail('Actual runner address prerequisite is unavailable.');
  const address = (await response.json()).ip;
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address ?? '') ||
    address.split('.').some((x) => Number(x) > 255)
  )
    fail('Actual runner address prerequisite is invalid.');
  const cidr = `${address}/32`;
  let familyHandle;
  if (familyHandlePath) {
    assertPrivatePath(resolve(familyHandlePath), 0o600);
    familyHandle = JSON.parse(readFileSync(familyHandlePath, 'utf8'));
  }
  const execute = async (operation) => {
    const result = await qualifyVaultGuards({
      config,
      guard: foundation.vault_guard,
      outputs: { ...foundation, ...environment },
      purpose,
      familyHandle,
      workloadVaultId: environment
        ? `/subscriptions/${config.subscriptionId}/resourceGroups/${environment.workload_resource_group_name}/providers/Microsoft.KeyVault/vaults/${environment.workload_key_vault_name}`
        : undefined,
      sourceClosureHash: definition.probeDefinitionHash,
      sourceRevision: revision,
      admissionCidr: cidr,
      token,
      signal: operation.signal,
      operation,
    });
    const directory = resolve(
      repository,
      '.local/azure',
      config.environment,
      'guard',
    );
    createPrivateDirectory(directory);
    const path = join(directory, `${purpose}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        reference: result.reference,
        digest: result.digest,
        purpose: result.purpose,
      }),
      { mode: 0o600 },
    );
    assertPrivatePath(path, 0o600);
    return { phase: 'guard-qualified', purpose, digest: result.digest };
  };
  if (purpose === 'human-policy-family')
    return withPermanentFoundationAccess(
      {
        config,
        provider,
        networkProvider,
        runnerCidr: cidr,
        operation: 'guard-qualify',
        durationMs: 3600000,
      },
      execute,
    );
  return withAzureOperation(
    config,
    {
      provider,
      networkProvider,
      backendResources: [
        {
          id: 'recoveryStorage',
          baseline: config.operatorCidrs,
          cidr,
          durationMs: 1800000,
        },
      ],
      operation: 'guard-qualify',
      durationMs: 3600000,
    },
    execute,
  );
}

export async function executeInfrastructure(command, settings) {
  const { config, foundation, stage = 'environment' } = settings;
  if (!['plan', 'apply'].includes(command))
    fail('Unsupported infrastructure execution phase.');
  await verifyInfrastructureRevision(command, settings);
  await preflight(config, { stage, foundation, operation: command });
  const execute = async (signal, verifyAccess, operation) => {
    const context = await createTerraformContext({
      ...settings,
      signal,
      command,
      verifyAccess,
      operation,
    });
    if (command === 'plan')
      return {
        phase: settings.initialFoundationPreview
          ? 'foundation-preview-not-for-apply'
          : 'plan-reviewed-required',
        ...(await planDeployment(context)),
      };
    if (!settings.reviewPath)
      fail('An explicit private saved-plan review is required.');
    assertPrivatePath(settings.reviewPath, 0o600);
    let review;
    try {
      review = JSON.parse(readFileSync(settings.reviewPath, 'utf8'));
    } catch {
      fail('Private saved-plan review is invalid.');
    }
    if (context.restore) await context.restore(review, context.directory);
    const result = await applyDeployment(context, review);
    const outputs = await context.outputs();
    writeFileSync(
      join(context.directory, 'outputs.json'),
      JSON.stringify(outputs.raw),
      { mode: 0o600 },
    );
    if (stage === 'foundation-bootstrap') {
      await context.migrateFoundation();
      if (!settings.networkGateReady)
        return {
          ...result,
          phase:
            'foundation-applied-remote-state-verified-network-gate-binding-required',
        };
      const { publishProjection } = await import('./azure-handoff.mjs');
      await publishProjection({
        config,
        raw: outputs.raw,
        scope: 'foundation',
        foundation: outputs.selected,
        token: azureTokenProvider(config),
        signal,
      });
      return { ...result, phase: 'foundation-applied-remote-state-verified' };
    }
    const { publishOperationalProjection } =
      await import('./azure-handoff.mjs');
    await publishOperationalProjection({
      config,
      raw: outputs.raw,
      foundation,
      token: azureTokenProvider(config),
      signal,
    });
    const projection = renderRuntimeProjection(
      createGeneratorInput({
        config,
        foundation,
        environment: outputs.selected,
      }),
    );
    for (const [directory, files] of [
      ['deploy/environments/azure/runtime', projection.applicationFiles],
      ['deploy/platform/azure/runtime', projection.platformFiles],
      ['deploy/platform/azure/recovery/runtime', projection.recoveryFiles],
    ]) {
      for (const [name, text] of Object.entries(files)) {
        if (
          !/^[a-zA-Z0-9_.-]+\.(json|yaml)$/.test(name) ||
          typeof text !== 'string'
        )
          fail('Runtime generator returned an unsafe file contract.');
        const target = resolve(repository, directory, name);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
      }
    }
    return {
      ...result,
      phase: 'configuration-review-pending',
      generation: projection.generation,
      outputHash: projection.outputHash,
    };
  };
  if (stage === 'foundation-bootstrap' && !settings.networkGateReady)
    return execute();
  if (stage === 'foundation-bootstrap' && !foundation)
    fail(
      'Verified foundation outputs are required for persistent operator maintenance.',
    );
  const {
    createRestProvider,
    createArmNetworkProvider,
    configuredNetworkResources,
    withAzureOperation,
    reapNetworkAdmissions,
  } = await import('./azure-operations.mjs');
  const token = azureTokenProvider(config);
  const retained = configuredNetworkResources(config, foundation, {
    retainedOnly: true,
  });
  const networkProvider = createArmNetworkProvider({
    ...retained,
    token: () => token('https://management.azure.com/'),
  });
  const provider = createRestProvider({
    account: foundation.operation_storage_account_name,
    container: foundation.operation_container_name,
    environment: config.environment,
    token,
  });
  let address;
  try {
    const response = await globalThis.fetch(
      'https://api.ipify.org?format=json',
      { signal: globalThis.AbortSignal.timeout(10000), redirect: 'error' },
    );
    if (!response.ok) fail('Runner address discovery failed.');
    address = (await response.json()).ip;
  } catch {
    fail('Actual runner public address prerequisite is unavailable.');
  }
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address ?? '') ||
    address.split('.').some((value) => Number(value) > 255)
  )
    fail('Runner public address response is invalid.');
  const cidr = `${address}/32`;
  if (stage === 'foundation-bootstrap')
    return withPermanentFoundationAccess(
      {
        config,
        provider,
        networkProvider,
        runnerCidr: cidr,
        operation: command,
        durationMs: command === 'apply' ? 3600000 : 1800000,
      },
      (operation) => execute(operation.signal, operation.verify, operation),
    );
  return withAzureOperation(
    config,
    {
      provider,
      networkProvider,
      backendResources: ['recoveryStorage', 'state'].map((id) => ({
        id,
        baseline: config.operatorCidrs,
        cidr,
        durationMs: 1800000,
      })),
      operation: command,
      durationMs: command === 'apply' ? 3600000 : 1800000,
    },
    async (operation) => {
      const { signal } = operation;
      const previous = await privateBlobStore(
        config,
        foundation,
        token,
      ).previousOutputs();
      if (previous) {
        const all = configuredNetworkResources(config, {
          ...foundation,
          ...previous,
        });
        const actual = createArmNetworkProvider({
          ...all,
          token: () => token('https://management.azure.com/'),
        });
        const baselines = {
          aks: previous.persistent_api_cidrs,
          workloadVault: config.operatorCidrs,
        };
        await reapNetworkAdmissions(
          actual,
          ['aks', 'workloadVault'],
          baselines,
        );
        for (const id of ['aks', 'workloadVault'])
          if (
            [...(await actual.readResource(id)).ranges].sort().join(',') !==
            [...baselines[id]].sort().join(',')
          )
            fail('Active or unexplained network admission blocks Terraform.');
      }
      return execute(signal, undefined, operation);
    },
  );
}

export function foundationBackendMode({
  marker,
  backendHash,
  remote,
  local,
  localAuthority,
  accountExists,
  initialFoundationPreview = false,
  localFoundation = false,
  auditStage = 'create',
}) {
  if (
    initialFoundationPreview &&
    (marker || remote || local || accountExists !== false)
  )
    fail(
      'Initial foundation preview requires verified local/uncreated authority.',
    );
  if (marker) {
    if (
      marker.version !== 1 ||
      marker.backendHash !== backendHash ||
      !remote ||
      marker.lineage !== remote.lineage ||
      !Number.isInteger(marker.serial) ||
      remote.serial < marker.serial
    )
      fail(
        'Foundation remote authority verification failed; preserve state and recover explicitly.',
      );
    return 'remote';
  }
  if (localFoundation && ['bind', 'enable'].includes(auditStage))
    fail(
      'Verified remote foundation authority is required for audit bind or enable.',
    );
  if (
    remote ||
    (accountExists && !(local && localAuthority?.backendHash === backendHash))
  )
    fail(
      'Foundation state authority is ambiguous; preserve local/remote state and recover explicitly.',
    );
  return 'local';
}

async function foundationAuthority(
  config,
  directory,
  token,
  initialFoundationPreview = false,
  { localFoundation = false, auditStage = 'create' } = {},
) {
  const backendHash = hash(JSON.stringify(config.foundationBackend));
  const markerPath = join(directory, 'remote-authority.json');
  const localPath = join(directory, 'foundation', 'terraform.tfstate');
  const localAuthorityPath = join(directory, 'local-authority.json');
  let account;
  try {
    account = await globalThis.fetch(
      `https://management.azure.com/subscriptions/${config.subscriptionId}/resourceGroups/${config.foundationBackend.resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${config.foundationBackend.storageAccountName}?api-version=2025-06-01`,
      {
        headers: {
          Authorization: `Bearer ${await token('https://management.azure.com/')}`,
        },
        signal: globalThis.AbortSignal.timeout(30000),
        redirect: 'error',
      },
    );
  } catch {
    fail(
      'Foundation authority probe failed; preserve state and verify Azure access.',
    );
  }
  if (!account.ok && account.status !== 404)
    fail(`Foundation authority probe failed; HTTP status ${account.status}.`);
  const accountExists = account.ok;
  const marker = existsSync(markerPath)
    ? JSON.parse(readFileSync(markerPath, 'utf8'))
    : undefined;
  const localBytes = existsSync(localPath)
    ? readFileSync(localPath, 'utf8')
    : undefined;
  const local = localBytes ? validateState(JSON.parse(localBytes)) : undefined;
  const localAuthority = existsSync(localAuthorityPath)
    ? JSON.parse(readFileSync(localAuthorityPath, 'utf8'))
    : undefined;
  const store = privateBlobStore(config, {}, token, config.foundationBackend);
  const state = accountExists ? await store.state() : undefined;
  const remote = state?.lineage === 'uncreated' ? undefined : state;
  const mode = foundationBackendMode({
    marker,
    backendHash,
    remote,
    local,
    localAuthority,
    accountExists,
    initialFoundationPreview,
    localFoundation,
    auditStage,
  });
  if (localBytes === '' && mode !== 'remote')
    fail('Empty local foundation state requires verified remote authority.');
  if (mode === 'local' && !localAuthority)
    writeFileSync(
      localAuthorityPath,
      JSON.stringify({ version: 1, backendHash }),
      { mode: 0o600 },
    );
  return { mode, backendHash, markerPath, store };
}

export function validateFoundationMigration(local, remote) {
  const invalid = () =>
    fail(
      'Foundation migration snapshot mismatch; preserve all state copies for recovery.',
    );
  const normalize = (state) => {
    validateState(state);
    if (
      state.version !== 4 ||
      !Number.isSafeInteger(state.serial) ||
      typeof state.terraform_version !== 'string' ||
      !state.terraform_version ||
      !Array.isArray(state.resources) ||
      !state.outputs ||
      typeof state.outputs !== 'object' ||
      Array.isArray(state.outputs)
    )
      invalid();
    const snapshot = { ...state };
    delete snapshot.serial;
    if (
      snapshot.check_results !== undefined &&
      snapshot.check_results !== null
    ) {
      if (!Array.isArray(snapshot.check_results)) invalid();
      const refs = new Set();
      for (const record of snapshot.check_results) {
        if (
          !record ||
          typeof record.config_addr !== 'string' ||
          !/^[A-Za-z_][A-Za-z0-9_.[\]"-]*$/.test(record.config_addr) ||
          refs.has(record.config_addr) ||
          typeof record.object_kind !== 'string' ||
          !record.object_kind ||
          !['pass', 'fail', 'error', 'unknown'].includes(record.status) ||
          !Array.isArray(record.objects) ||
          record.objects.some(
            (object) =>
              !object ||
              typeof object.object_addr !== 'string' ||
              !object.object_addr.trim() ||
              !['pass', 'fail', 'error', 'unknown'].includes(object.status),
          )
        )
          invalid();
        refs.add(record.config_addr);
      }
      snapshot.check_results = [...snapshot.check_results].sort((a, b) =>
        a.config_addr.localeCompare(b.config_addr),
      );
    }
    return snapshot;
  };
  const left = normalize(local);
  const right = normalize(remote);
  if (
    ![local.serial, local.serial + 1].includes(remote.serial) ||
    !isDeepStrictEqual(left, right)
  )
    invalid();
  return remote;
}

export async function finalizeFoundationMigration(
  config,
  revision,
  settings = {},
  boundary = {},
) {
  if (
    settings.localFoundation !== true ||
    settings.stage !== 'foundation-bootstrap' ||
    settings.initialFoundationPreview === true ||
    ![undefined, 'create'].includes(settings.auditStage) ||
    ![undefined, false].includes(settings.networkGateReady)
  )
    fail(
      'Foundation migration finalization requires explicit local-human foundation mode.',
    );
  const revisionSettings = { ...settings, config, revision };
  const verify = () =>
    verifyInfrastructureRevision(
      'foundation-migration-finalize',
      revisionSettings,
      boundary,
    );
  await verify();
  const directory = resolve(
    boundary.root ?? repository,
    '.local/azure',
    config.environment,
    'foundation-bootstrap',
  );
  const source = join(directory, 'foundation');
  assertPrivatePath(directory, 0o700);
  assertPrivatePath(source, 0o700);
  const markerPath = join(directory, 'remote-authority.json');
  if (existsSync(markerPath))
    fail(
      'Foundation migration authority marker already exists; it will not be overwritten.',
    );
  const readPrivate = (path) => {
    assertPrivatePath(path, 0o600);
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      fail('Private foundation migration evidence is invalid.');
    }
  };
  const backendHash = hash(JSON.stringify(config.foundationBackend));
  const localAuthority = readPrivate(join(directory, 'local-authority.json'));
  if (
    localAuthority.version !== 1 ||
    localAuthority.backendHash !== backendHash
  )
    fail('Foundation migration local backend authority mismatch.');
  const native = readPrivate(join(source, '.terraform', 'terraform.tfstate'));
  const expected = {
    resource_group_name: config.foundationBackend.resourceGroupName,
    storage_account_name: config.foundationBackend.storageAccountName,
    container_name: config.foundationBackend.containerName,
    key: config.foundationBackend.key,
    use_azuread_auth: true,
  };
  if (
    native.backend?.type !== 'azurerm' ||
    !native.backend.config ||
    Object.entries(expected).some(
      ([key, value]) => native.backend.config[key] !== value,
    ) ||
    Object.entries(native.backend.config).some(
      ([key, value]) => !Object.hasOwn(expected, key) && value !== null,
    )
  )
    fail(
      'Foundation migration native backend does not match the exact Azure AD target.',
    );
  const preserved = join(source, 'terraform.tfstate.pre-migration');
  const local = readPrivate(
    existsSync(preserved)
      ? preserved
      : join(source, 'terraform.tfstate.backup'),
  );
  const localPath = join(source, 'terraform.tfstate');
  if (existsSync(localPath)) {
    assertPrivatePath(localPath, 0o600);
    const bytes = readFileSync(localPath, 'utf8');
    if (bytes) validateFoundationMigration(local, readPrivate(localPath));
  }
  const token = azureTokenProvider(config, boundary.run ?? runAzure);
  const remote = await privateBlobStore(
    config,
    {},
    token,
    config.foundationBackend,
  ).state();
  validateFoundationMigration(local, remote);
  await verify();
  writeFileSync(
    markerPath,
    JSON.stringify({
      version: 1,
      backendHash,
      lineage: remote.lineage,
      serial: remote.serial,
    }),
    { mode: 0o600, flag: 'wx' },
  );
  assertPrivatePath(markerPath, 0o600);
  return { status: 'foundation-migration-finalized' };
}

async function verifiedGate(config, foundation, token) {
  const group =
    foundation?.dns_zone_resource_group_name ??
    config.foundationBackend.resourceGroupName;
  const url = `https://management.azure.com/subscriptions/${config.subscriptionId}/resourceGroups/${group}/providers/Microsoft.Network/dnsZones/${config.domain}/TXT/_azure-network-lease?api-version=2018-05-01`;
  let response;
  try {
    response = await globalThis.fetch(url, {
      headers: {
        Authorization: `Bearer ${await token('https://management.azure.com/')}`,
      },
      signal: globalThis.AbortSignal.timeout(30000),
      redirect: 'error',
    });
  } catch {
    fail(
      'Operational DNS gate verification failed; private transport details suppressed.',
    );
  }
  if (!response.ok)
    fail(
      `Operational DNS gate prerequisite failed; HTTP status ${response.status}.`,
    );
  const record = await response.json();
  if (
    !record.etag ||
    record.properties?.TXTRecords?.length !== 1 ||
    record.properties.TXTRecords[0].value?.length !== 1 ||
    record.properties.TXTRecords[0].value[0] !== 'reserved' ||
    Object.keys(record.properties.metadata ?? {}).length
  )
    fail(
      'Operational DNS gate is missing, changed or active; foundation maintenance is blocked.',
    );
  return url;
}

export async function initializeFoundationGate(
  config,
  revision,
  foundation,
  settings = {},
) {
  const revisionSettings = {
    ...settings,
    config,
    revision,
    foundation,
    stage: 'foundation-bootstrap',
  };
  await verifyInfrastructureRevision('foundation-gate', revisionSettings);
  await preflight(config, { stage: 'foundation-bootstrap' });
  const directory = resolve(
    repository,
    '.local/azure',
    config.environment,
    'foundation-bootstrap',
  );
  const token = azureTokenProvider(config);
  const authority = await foundationAuthority(config, directory, token);
  if (authority.mode !== 'remote')
    fail(
      'Verified remote foundation state is required before DNS gate creation.',
    );
  const group =
    foundation?.dns_zone_resource_group_name ??
    config.foundationBackend.resourceGroupName;
  await verifyInfrastructureRevision('foundation-gate', revisionSettings);
  let response;
  try {
    response = await globalThis.fetch(
      `https://management.azure.com/subscriptions/${config.subscriptionId}/resourceGroups/${group}/providers/Microsoft.Network/dnsZones/${config.domain}/TXT/_azure-network-lease?api-version=2018-05-01`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${await token('https://management.azure.com/')}`,
          'Content-Type': 'application/json',
          'If-None-Match': '*',
        },
        body: JSON.stringify({
          properties: {
            TTL: 60,
            TXTRecords: [{ value: ['reserved'] }],
            metadata: {},
          },
        }),
        signal: globalThis.AbortSignal.timeout(30000),
        redirect: 'error',
      },
    );
  } catch {
    fail('DNS gate creation completion is uncertain; verify ARM before retry.');
  }
  if (!response.ok && response.status !== 412)
    fail(`DNS gate creation failed; HTTP status ${response.status}.`);
  await verifiedGate(config, foundation, token);
  return { phase: 'operational-dns-gate-verified-binding-review-required' };
}

export async function createTerraformContext(
  {
    config,
    foundation,
    stage = 'environment',
    revision,
    signal,
    recoveryKeyExpirationDate,
    networkGateReady = false,
    bootstrapOperatorObjectId,
    auditStage = 'create',
    command = 'plan',
    locatorHash,
    verifyAccess,
    guardStage = 'creation',
    familyHandlePath,
    generationHandlePath,
    environment: deployedEnvironment,
    operation,
    initialFoundationPreview = false,
    localFoundation = false,
    bootstrapLocator,
  },
  boundary = {},
) {
  const root = boundary.root ?? repository;
  assertSourceRevision(revision, { root });
  if (typeof initialFoundationPreview !== 'boolean')
    fail('Initial foundation preview flag must be an explicit boolean.');
  if (typeof localFoundation !== 'boolean')
    fail('Local foundation flag must be an explicit boolean.');
  const revisionSettings = {
    config,
    foundation,
    stage,
    auditStage,
    networkGateReady,
    command,
    familyHandlePath,
    generationHandlePath,
    locatorHash,
    bootstrapOperatorObjectId,
    guardStage,
    initialFoundationPreview,
    localFoundation,
    bootstrapLocator,
    environment: deployedEnvironment,
  };
  if (initialFoundationPreview || localFoundation)
    await verifyInfrastructureRevision(
      command,
      {
        ...revisionSettings,
        revision,
      },
      boundary,
    );
  const directory = resolve(root, '.local/azure', config.environment, stage);
  createPrivateDirectory(directory);
  const token = azureTokenProvider(config, boundary.run ?? runAzure);
  const authority =
    stage === 'foundation-bootstrap'
      ? await foundationAuthority(
          config,
          directory,
          token,
          initialFoundationPreview,
          { localFoundation, auditStage },
        )
      : undefined;
  if (stage === 'foundation-bootstrap') {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        bootstrapOperatorObjectId ?? '',
      )
    )
      fail('Explicit reviewed human bootstrap operator object ID is required.');
    if (authority.mode === 'local' && networkGateReady)
      fail(
        'Initial foundation cannot bind a DNS gate before creating and verifying it.',
      );
    if (authority.mode === 'remote') {
      if (!networkGateReady)
        fail(
          'Foundation remote maintenance requires explicit verified network-gate-ready binding.',
        );
      await verifiedGate(config, foundation, token);
    }
  }
  const tools = qualityContext();
  const terraform = verifiedTool(tools, 'terraform');
  let source = resolve(
    repository,
    'infra/azure',
    stage === 'foundation-bootstrap' ? 'foundation' : 'environment',
  );
  if (stage === 'foundation-bootstrap') {
    if (
      typeof recoveryKeyExpirationDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(
        recoveryKeyExpirationDate,
      ) ||
      Date.parse(recoveryKeyExpirationDate) <= Date.now()
    )
      fail(
        'Explicit reviewed future recovery key expiration date is required.',
      );
    source = join(directory, 'foundation');
    createPrivateDirectory(source);
    synchronizeTerraformSource(
      resolve(repository, 'infra/azure/foundation'),
      source,
    );
    const versions = readFileSync(join(source, 'versions.tf'), 'utf8');
    const pattern =
      / {2}backend "azurerm" \{\r?\n {4}use_azuread_auth = true\r?\n {2}\}\r?\n/;
    if (!pattern.test(versions))
      fail(
        'Reviewed foundation backend declaration changed; bootstrap staging requires review.',
      );
    if (authority.mode === 'local')
      writeFileSync(join(source, 'versions.tf'), versions.replace(pattern, ''));
  }
  let auditQualification;
  let requalify;
  if (stage === 'foundation-bootstrap') {
    if (!['create', 'bind', 'enable'].includes(auditStage))
      fail('Audit stage must be create, bind or enable.');
    if (auditStage !== 'create') {
      if (!foundation)
        fail('Validated actual foundation audit outputs are required.');
      const { qualifyAudit, validateAuditObservation, auditArmReader } =
        await import('./azure-audit.mjs');
      const request = auditArmReader(token, { signal });
      const path = join(directory, 'audit-qualification.json');
      if (command === 'apply') {
        assertPrivatePath(path, 0o600);
        auditQualification = JSON.parse(readFileSync(path, 'utf8'));
        validateAuditObservation(auditQualification, config, foundation);
        if (auditQualification.stage !== auditStage)
          fail('Audit saved observation stage mismatch.');
      } else {
        auditQualification = await qualifyAudit({
          config,
          outputs: foundation,
          stage: auditStage,
          request,
        });
        writeFileSync(path, JSON.stringify(auditQualification), {
          mode: 0o600,
        });
        assertPrivatePath(path, 0o600);
      }
      requalify = async () => {
        validateAuditObservation(auditQualification, config, foundation);
        await qualifyAudit({
          config,
          outputs: foundation,
          stage: auditStage,
          request,
        });
      };
    }
  }
  let guard;
  if (stage === 'environment' || familyHandlePath) {
    requireGuardAuthorityContract();
    if (
      !foundation?.vault_guard ||
      !familyHandlePath ||
      !['creation', 'grant', 'active'].includes(guardStage) ||
      (guardStage !== 'creation' &&
        (!deployedEnvironment || !generationHandlePath))
    )
      fail(
        'Explicit guard stage and private family/generation evidence prerequisites are required.',
      );
    const readHandle = (path, purpose) => {
      assertPrivatePath(resolve(path), 0o600);
      const value = JSON.parse(readFileSync(path, 'utf8'));
      if (
        !value ||
        Object.keys(value).sort().join(',') !== 'digest,purpose,reference' ||
        value.purpose !== purpose ||
        !/^[a-f0-9]{64}$/.test(value.digest ?? '')
      )
        fail('Private guard evidence handle is invalid.');
      return value;
    };
    const familyHandle = readHandle(familyHandlePath, 'human-policy-family');
    const generationHandle = generationHandlePath
      ? readHandle(generationHandlePath, 'workload-generation')
      : undefined;
    const { qualificationSourceDefinition } =
      await import('./azure-qualification-launch.mjs');
    const sourceClosureHash = qualificationSourceDefinition({
      root: repository,
      revision,
    }).probeDefinitionHash;
    const { validateVaultGuardEvidence } =
      await import('./azure-vault-guard.mjs');
    const outputs = { ...foundation, ...deployedEnvironment };
    const options = {
      config,
      guard: foundation.vault_guard,
      outputs,
      sourceClosureHash,
      sourceRevision: revision,
      token,
      signal,
      operation,
      workloadVaultId: deployedEnvironment
        ? `/subscriptions/${config.subscriptionId}/resourceGroups/${deployedEnvironment.workload_resource_group_name}/providers/Microsoft.KeyVault/vaults/${deployedEnvironment.workload_key_vault_name}`
        : undefined,
    };
    const validate = async () => {
      const family = await validateVaultGuardEvidence({
        ...options,
        purpose: 'human-policy-family',
        handle: familyHandle,
      });
      if (
        qualificationSourceDefinition({
          root: repository,
          revision: family.source_revision,
        }).probeDefinitionHash !== sourceClosureHash
      )
        fail('Family qualifier and actual phase source closures differ.');
      let generation = null;
      if (guardStage !== 'creation') {
        if (guardStage === 'active')
          fail(
            'Durable active guard evidence discovery requires the reviewed completed activation locator contract.',
          );
        generation = await validateVaultGuardEvidence({
          ...options,
          purpose: 'workload-generation',
          handle: generationHandle,
          familyHandle,
          usage: 'fresh',
        });
        if (
          qualificationSourceDefinition({
            root: repository,
            revision: generation.source_revision,
          }).probeDefinitionHash !== sourceClosureHash
        )
          fail('Generation qualifier and actual phase source closures differ.');
      }
      return { family, generation };
    };
    const proofs = await validate();
    const auditRequalify = requalify;
    requalify = async () => {
      if (auditRequalify) await auditRequalify();
      const actual = await validate();
      if (configurationHash(actual) !== configurationHash(proofs))
        fail('Guard evidence changed after saved-plan approval.');
    };
    guard = {
      ...options,
      ...proofs,
      familyHandle,
      generationHandle,
      validate,
      phase: guardStage,
    };
  }
  const variables =
    stage === 'foundation-bootstrap'
      ? {
          config,
          bootstrap_operator_object_id: bootstrapOperatorObjectId,
          operator_secret_names: {
            argocd: 'argocd-oidc-client-secret',
            dashboard: 'dashboard-oidc-client-secret',
          },
          recovery_key_expiration_date: recoveryKeyExpirationDate,
          network_gate_ready: networkGateReady,
          audit_transform_ready: auditStage !== 'create',
          audit_diagnostics_ready: auditStage === 'enable',
          audit_qualification: auditQualification ?? null,
          vault_guard_family_qualification: guard?.family ?? null,
        }
      : {
          config,
          foundation: Object.fromEntries(
            [
              'workload_resource_group_name',
              'dns_zone_name',
              'dns_zone_resource_group_name',
              'github_client_ids',
              'github_principal_ids',
              'approved_operator_object_ids',
              'operation_role_ids',
              'vault_guard',
            ].map((key) => [key, foundation[key]]),
          ),
          workload_secret_scopes: Object.fromEntries(
            Object.entries({
              ...workloadSecrets,
              ...Object.fromEntries(
                Object.entries(recoveryWorkloadSecrets).filter(
                  ([key]) => key !== 'recovery-database-bootstrap',
                ),
              ),
              'database-bootstrap': {
                ...workloadSecrets['database-bootstrap'],
                ...recoveryWorkloadSecrets['recovery-database-bootstrap'],
              },
            }).map(([key, value]) => [key, [...new Set(Object.values(value))]]),
          ),
          vault_guard_generation_qualification: guard?.generation ?? null,
        };
  const variablesPath = join(directory, 'inputs.tfvars.json');
  writeFileSync(variablesPath, JSON.stringify(variables), { mode: 0o600 });
  let stagedInventory =
    stage === 'foundation-bootstrap'
      ? terraformSourceInventory(source)
      : undefined;
  const environment = controlledTerraformEnvironment(process.env, tools);
  const run = async (args) => {
    if (verifyAccess) await verifyAccess();
    if (stagedInventory) assertTerraformSource(source, stagedInventory);
    controlledTerraformEnvironment(process.env, tools);
    return runPrivateProcess(terraform, args, {
      cwd: source,
      env: environment,
      signal,
      timeout: args[0] === 'apply' ? 3600000 : 900000,
      operation: `Terraform ${args[0]}`,
    });
  };
  const init = ['init', '-input=false', '-no-color', '-lockfile=readonly'];
  if (stage !== 'foundation-bootstrap' || authority.mode === 'remote')
    for (const [key, value] of Object.entries({
      resource_group_name: (stage === 'foundation-bootstrap'
        ? config.foundationBackend
        : config.environmentBackend
      ).resourceGroupName,
      storage_account_name: (stage === 'foundation-bootstrap'
        ? config.foundationBackend
        : config.environmentBackend
      ).storageAccountName,
      container_name: (stage === 'foundation-bootstrap'
        ? config.foundationBackend
        : config.environmentBackend
      ).containerName,
      key: (stage === 'foundation-bootstrap'
        ? config.foundationBackend
        : config.environmentBackend
      ).key,
      use_azuread_auth: true,
    }))
      init.push(`-backend-config=${key}=${value}`);
  await run(init);
  const store =
    stage === 'foundation-bootstrap'
      ? authority.mode === 'remote'
        ? authority.store
        : undefined
      : privateBlobStore(config, foundation, token);
  return {
    directory,
    revision,
    initialFoundationPreview,
    localFoundation,
    requalify,
    guard,
    validatePlan:
      stage === 'environment'
        ? async (plan) =>
            validateGuardPlan(plan, {
              phase: guard.phase,
              networkRoleId: foundation.operation_role_ids.workload_network,
              workloadVaultId: guard.workloadVaultId,
              principals: foundation.github_principal_ids,
            })
        : undefined,
    inputHash: configurationHash({
      variables,
      locatorHash: locatorHash ?? null,
      initialFoundationPreview,
      ...(localFoundation ? { localFoundation: true } : {}),
    }),
    policyHash: hash(
      controlledTerraformCli +
        '\n' +
        [
          'tools.lock.json',
          '.tflint.hcl',
          'trivy.yaml',
          'policy-exceptions.json',
        ]
          .map(
            (path) =>
              path +
              '\0' +
              readFileSync(resolve(repository, 'infra/azure', path), 'utf8'),
          )
          .join('\n'),
    ),
    assertRevision: async (revision) => {
      await verifyInfrastructureRevision(
        command,
        {
          ...revisionSettings,
          revision,
        },
        boundary,
      );
      if (initialFoundationPreview)
        await foundationAuthority(config, directory, token, true);
      else if (localFoundation) {
        const current = await foundationAuthority(
          config,
          directory,
          token,
          false,
          { localFoundation, auditStage },
        );
        if (
          current.mode !== authority.mode ||
          current.backendHash !== authority.backendHash
        )
          fail('Foundation state authority changed; a new plan is required.');
      }
    },
    run,
    planArguments: [`-var-file=${variablesPath}`],
    state:
      store?.state ??
      (async () => {
        const statePath = join(source, 'terraform.tfstate');
        if (!existsSync(statePath)) return { lineage: 'uncreated', serial: 0 };
        return validateState(JSON.parse(readFileSync(statePath, 'utf8')));
      }),
    persist: stage === 'foundation-bootstrap' ? async () => {} : store.persist,
    restore: stage === 'foundation-bootstrap' ? undefined : store.restore,
    async migrateFoundation() {
      if (stage !== 'foundation-bootstrap' || authority.mode === 'remote')
        return;
      const localPath = join(source, 'terraform.tfstate');
      assertPrivatePath(localPath, 0o600);
      const localBytes = readFileSync(localPath);
      const local = validateState(JSON.parse(localBytes.toString('utf8')));
      validateFoundationMigration(local, local);
      writeFileSync(
        join(source, 'terraform.tfstate.pre-migration'),
        localBytes,
        { mode: 0o600, flag: 'wx' },
      );
      assertPrivatePath(join(source, 'terraform.tfstate.pre-migration'), 0o600);
      assertTerraformSource(source, stagedInventory);
      copyFileSync(
        resolve(repository, 'infra/azure/foundation/versions.tf'),
        join(source, 'versions.tf'),
      );
      stagedInventory = terraformSourceInventory(source);
      const settings = config.foundationBackend;
      await run([
        'init',
        '-migrate-state',
        '-force-copy',
        '-input=false',
        '-no-color',
        ...Object.entries({
          resource_group_name: settings.resourceGroupName,
          storage_account_name: settings.storageAccountName,
          container_name: settings.containerName,
          key: settings.key,
          use_azuread_auth: true,
        }).map(([key, value]) => `-backend-config=${key}=${value}`),
      ]);
      const remote = await authority.store.state();
      validateFoundationMigration(local, remote);
      await verifyInfrastructureRevision(
        command,
        {
          ...revisionSettings,
          revision,
        },
        boundary,
      );
      writeFileSync(
        authority.markerPath,
        JSON.stringify({
          version: 1,
          backendHash: authority.backendHash,
          lineage: remote.lineage,
          serial: remote.serial,
        }),
        { mode: 0o600, flag: 'wx' },
      );
      assertPrivatePath(authority.markerPath, 0o600);
    },
    async scan(path) {
      verifyPolicy(tools);
      const result = await runPrivateProcess(
        verifiedTool(tools, 'trivy'),
        [
          'config',
          '--config',
          resolve(repository, 'infra/azure/trivy.yaml'),
          '--cache-dir',
          tools.policyDirectory,
          '--skip-check-update',
          '--checks-bundle-repository',
          tools.lock.policy.repository,
          '--skip-version-check',
          '--disable-telemetry',
          '--format',
          'json',
          '--ignorefile',
          '',
          '--exit-code',
          '0',
          path,
        ],
        {
          env: cleanEnvironment(),
          operation: 'Resolved Terraform plan security',
          signal,
          timeout: 300000,
          captureStderr: true,
        },
      );
      verifyPolicy(tools);
      if (/ERROR|FATAL|failed to parse/i.test(result.stderr))
        fail('Resolved plan scanner failed; private diagnostics suppressed.');
      assertSecurityReport(
        result.stdout,
        resolve(
          repository,
          'infra/azure',
          stage === 'foundation-bootstrap' ? 'foundation' : 'environment',
        ),
      );
    },
    async outputs() {
      let raw;
      try {
        raw = JSON.parse(await run(['output', '-json']));
      } catch {
        fail('Private Terraform output projection is invalid.');
      }
      return {
        raw,
        selected: validateTerraformOutputs(
          raw,
          stage === 'foundation-bootstrap' ? 'foundation' : 'environment',
        ),
      };
    },
  };
}

function validateState(value) {
  if (
    !value ||
    typeof value.lineage !== 'string' ||
    !value.lineage ||
    !Number.isInteger(value.serial) ||
    value.serial < 0
  )
    fail('Terraform state identity is unavailable or invalid.');
  return value;
}

export function validateGuardPlan(
  plan,
  { phase, workloadVaultId, networkRoleId, principals } = {},
) {
  const invalid = () =>
    fail(
      'Normalized guard plan crosses its reviewed creation or grant authority boundary.',
    );
  if (
    !['creation', 'grant', 'active'].includes(phase) ||
    typeof networkRoleId !== 'string' ||
    !networkRoleId ||
    (phase === 'grant' &&
      (typeof workloadVaultId !== 'string' ||
        !principals ||
        ['backup', 'restore', 'reaper'].some(
          (x) => typeof principals[x] !== 'string',
        )))
  )
    invalid();
  summarizePlan(plan);
  const validate = (entry) => {
    const after = entry.change?.after ?? entry.values;
    const network =
      entry.type === 'azurerm_role_assignment' &&
      (entry.address?.startsWith(
        'azurerm_role_assignment.workload_vault_network[',
      ) ||
        after?.role_definition_id === networkRoleId);
    if (phase === 'creation' && network) invalid();
    if (
      phase !== 'grant' ||
      !entry.change ||
      entry.change.actions.every((x) => x === 'no-op' || x === 'read')
    )
      return;
    if (
      entry.address === 'terraform_data.vault_guard_generation_stage' &&
      entry.type === 'terraform_data' &&
      entry.change.actions.every((x) => x === 'create' || x === 'update')
    )
      return;
    const actor =
      /^azurerm_role_assignment\.workload_vault_network\["(backup|restore|reaper)"\]$/.exec(
        entry.address ?? '',
      )?.[1];
    if (
      !actor ||
      entry.type !== 'azurerm_role_assignment' ||
      entry.change.actions.join(',') !== 'create' ||
      after?.scope !== workloadVaultId ||
      after.role_definition_id !== networkRoleId ||
      after.principal_id !== principals[actor] ||
      after.principal_type !== 'ServicePrincipal' ||
      ['scope', 'role_definition_id', 'principal_id', 'principal_type'].some(
        (key) => entry.change.after_unknown?.[key] === true,
      )
    )
      invalid();
  };
  plan.resource_changes.forEach(validate);
  const walk = (module) => {
    for (const entry of module?.resources ?? []) validate(entry);
    for (const child of module?.child_modules ?? []) walk(child);
  };
  if (phase === 'creation') walk(plan.planned_values?.root_module);
  return phase;
}

function summarizePlan(plan) {
  if (
    !plan ||
    !['1.0', '1.1', '1.2'].includes(plan.format_version) ||
    !Array.isArray(plan.resource_changes)
  )
    fail('Terraform resolved plan schema is invalid.');
  const actions = { create: 0, update: 0, delete: 0, read: 0 };
  for (const entry of plan.resource_changes) {
    if (
      typeof entry.type !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(entry.type) ||
      !Array.isArray(entry.change?.actions)
    )
      fail('Terraform resolved plan action is invalid.');
    for (const action of entry.change.actions) {
      if (action === 'no-op') continue;
      if (!Object.hasOwn(actions, action))
        fail('Unsupported Terraform plan action.');
      actions[action]++;
    }
  }
  return actions;
}

export async function planDeployment(context) {
  const { localFoundation = false } = context;
  if (typeof localFoundation !== 'boolean')
    fail('Local foundation plan mode is invalid.');
  const directory = resolve(context.directory);
  createPrivateDirectory(directory);
  await context.assertRevision(context.revision);
  const state = validateState(await context.state());
  if (
    context.initialFoundationPreview &&
    (state.lineage !== 'uncreated' || state.serial !== 0)
  )
    fail('Initial foundation preview requires uncreated state.');
  const planPath = join(directory, 'saved.tfplan');
  const jsonPath = join(directory, 'saved.tfplan.json');
  let primary;
  try {
    await context.run([
      'plan',
      '-input=false',
      '-no-color',
      '-lock-timeout=5m',
      `-out=${planPath}`,
      ...(context.planArguments ?? []),
    ]);
    assertPrivatePath(planPath, 0o600);
    const raw = await context.run(['show', '-json', planPath]);
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      fail('Terraform resolved plan JSON is invalid.');
    }
    const actions = summarizePlan(plan);
    if (localFoundation && actions.delete > 0)
      fail('Local foundation mode cannot execute a destructive plan.');
    if (context.validatePlan) await context.validatePlan(plan);
    writeFileSync(jsonPath, raw, { mode: 0o600 });
    await context.scan(jsonPath);
    const current = validateState(await context.state());
    if (current.lineage !== state.lineage || current.serial !== state.serial)
      fail('Terraform state changed while preparing review.');
    const review = {
      version: 1,
      ...(context.initialFoundationPreview
        ? { initialFoundationPreview: true }
        : {}),
      ...(localFoundation ? { localFoundation: true } : {}),
      revision: context.revision,
      inputHash: context.inputHash,
      policyHash: context.policyHash,
      planHash: hash(readFileSync(planPath)),
      stateLineage: state.lineage,
      stateSerial: state.serial,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      actions,
    };
    validateReviewAssociation(review, review);
    await context.persist({ review, plan: readFileSync(planPath) });
    writeFileSync(join(directory, 'review.json.tmp'), JSON.stringify(review), {
      mode: 0o600,
    });
    renameSync(
      join(directory, 'review.json.tmp'),
      join(directory, 'review.json'),
    );
    return review;
  } catch (error) {
    primary = new OperationalFailure(
      safeFailure(
        error,
        'Saved plan operation failed; private details suppressed.',
      ),
    );
    throw primary;
  } finally {
    cleanupAllSync(
      existsSync(jsonPath)
        ? [
            {
              operation: 'Private plan JSON cleanup',
              tool: 'filesystem',
              run: () => rmSync(jsonPath),
            },
          ]
        : [],
      { primary },
    );
  }
}

export async function applyDeployment(context, review) {
  if (
    context.initialFoundationPreview ||
    Object.hasOwn(review, 'initialFoundationPreview')
  )
    fail(
      'Initial foundation preview cannot be applied; a new qualifying plan/review is required.',
    );
  const { localFoundation = false } = context;
  if (
    typeof localFoundation !== 'boolean' ||
    Object.hasOwn(review, 'localFoundation') !== localFoundation ||
    (Object.hasOwn(review, 'localFoundation') &&
      review.localFoundation !== true)
  )
    fail('Saved plan local foundation mode does not match this apply context.');
  await context.assertRevision(context.revision);
  const state = validateState(await context.state());
  const path = join(resolve(context.directory), 'saved.tfplan');
  assertPrivatePath(path, 0o600);
  validateReviewAssociation(review, {
    revision: context.revision,
    inputHash: context.inputHash,
    policyHash: context.policyHash,
    planHash: hash(readFileSync(path)),
    stateLineage: state.lineage,
    stateSerial: state.serial,
  });
  if (context.requalify) await context.requalify();
  if (context.validatePlan || localFoundation) {
    let plan;
    try {
      plan = JSON.parse(await context.run(['show', '-json', path]));
    } catch {
      fail('Saved guard plan cannot be independently normalized before apply.');
    }
    if (localFoundation && summarizePlan(plan).delete > 0)
      fail('Local foundation mode cannot execute a destructive saved plan.');
    if (context.validatePlan) await context.validatePlan(plan);
  }
  if (context.beforeApply)
    await context.beforeApply({ review, savedPlanPath: path });
  await context.run([
    'apply',
    '-input=false',
    '-no-color',
    '-lock-timeout=5m',
    path,
  ]);
  return {
    phase: 'infrastructure-applied',
    revision: review.revision,
    planHash: review.planHash,
  };
}

const isTerraformConfiguration = (name) =>
  /(?:\.tf(?:\.json)?$|\.tfvars(?:\.json)?$|^\.terraform\.lock\.hcl$)/.test(
    name,
  );
function terraformSourceInventory(directory) {
  const result = {};
  for (const entry of readdirSync(directory, { withFileTypes: true }))
    if (isTerraformConfiguration(entry.name)) {
      if (!entry.isFile() || entry.isSymbolicLink())
        fail(
          'Terraform staged configuration must contain regular reviewed files.',
        );
      result[entry.name] = hash(readFileSync(join(directory, entry.name)));
    }
  return result;
}
export function synchronizeTerraformSource(original, staged) {
  const expected = terraformSourceInventory(original);
  for (const entry of readdirSync(staged, { withFileTypes: true }))
    if (isTerraformConfiguration(entry.name)) {
      if (!entry.isFile() || entry.isSymbolicLink())
        fail('Terraform staged configuration contains an unsupported entry.');
      if (!Object.hasOwn(expected, entry.name))
        rmSync(join(staged, entry.name));
    }
  for (const name of Object.keys(expected))
    copyFileSync(join(original, name), join(staged, name));
  assertTerraformSource(staged, expected);
  return expected;
}
export function assertTerraformSource(directory, expected) {
  const actual = terraformSourceInventory(directory);
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(expected).sort())
  )
    fail(
      'Terraform staged configuration inventory or content changed; state remains preserved.',
    );
}

export async function withPermanentFoundationAccess(
  {
    config,
    provider,
    networkProvider,
    runnerCidr,
    operation,
    durationMs = 3600000,
  },
  action,
) {
  const ipv4 = (value) => {
    const parts = value.split('.');
    if (
      parts.length !== 4 ||
      parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
    )
      fail('Persistent operator runner address is invalid.');
    return parts.reduce(
      (result, part) => (result * 256 + Number(part)) >>> 0,
      0,
    );
  };
  if (typeof runnerCidr !== 'string' || !runnerCidr.endsWith('/32'))
    fail('Persistent operator runner address is required.');
  const runner = ipv4(runnerCidr.slice(0, -3));
  if (
    !config.operatorCidrs.some((cidr) => {
      const [address, prefix] = cidr.split('/');
      const mask = 0xffffffff << (32 - Number(prefix));
      return (runner & mask) === (ipv4(address) & mask);
    })
  )
    fail(
      'Foundation maintenance requires an actual runner within persistent operator CIDRs; no temporary admission is permitted.',
    );
  const verify = async () => {
    for (const name of ['state', 'recoveryStorage', 'recoveryVault']) {
      const actual = await networkProvider.readResource(name);
      if (
        actual.ranges.slice().sort().join(',') !==
          config.operatorCidrs.slice().sort().join(',') ||
        Object.keys(actual.tags).some((key) =>
          key.startsWith('equipment-admission-'),
        ) ||
        actual.raw?.properties?.networkAcls?.defaultAction !== 'Deny' ||
        actual.raw.properties.networkAcls.bypass !== 'None'
      )
        fail(
          'Foundation ACL baseline or active admission differs; finish/reap other operations before maintenance.',
        );
    }
  };
  await verify();
  const { withOperationLease } = await import('./azure-operations.mjs');
  return withOperationLease(
    config,
    { provider, operation, durationMs },
    async (context) => {
      await verify();
      const result = await action({ ...context, verify });
      await verify();
      return result;
    },
  );
}

export function assertPhaseRevision(config, revision, options) {
  if (!/^[a-f0-9]{40}$/.test(config.gitRevision ?? ''))
    fail('Recorded generation infrastructure anchor is invalid.');
  assertSourceRevision(revision, options);
}

export async function verifyInfrastructureRevision(
  command,
  settings,
  {
    root = repository,
    request = globalThis.fetch,
    run = runAzure,
    environment = process.env,
  } = {},
) {
  const {
    config,
    revision,
    initialFoundationPreview = false,
    localFoundation = false,
  } = settings;
  assertPhaseRevision(config, revision, { root });
  if (typeof initialFoundationPreview !== 'boolean')
    fail('Initial foundation preview flag must be an explicit boolean.');
  if (
    typeof localFoundation !== 'boolean' ||
    (localFoundation && initialFoundationPreview)
  )
    fail(
      'Local foundation mode requires a boolean and cannot be combined with preview.',
    );
  if (!initialFoundationPreview && !localFoundation)
    return verifyTrustedMainRevision(config, revision, { request });

  if (
    (localFoundation
      ? ![
          'plan',
          'apply',
          'foundation-gate',
          'foundation-migration-finalize',
        ].includes(command)
      : command !== 'plan') ||
    settings.stage !== 'foundation-bootstrap' ||
    !(
      localFoundation
        ? [undefined, 'create', 'bind', 'enable']
        : [undefined, 'create']
    ).includes(settings.auditStage) ||
    !(localFoundation ? [undefined, false, true] : [undefined, false]).includes(
      settings.networkGateReady,
    ) ||
    (localFoundation &&
      settings.guardStage !== undefined &&
      settings.guardStage !== 'creation') ||
    [
      'familyHandlePath',
      'generationHandlePath',
      'bootstrapLocator',
      'locatorHash',
      ...(!localFoundation ? ['foundation'] : []),
      'environment',
    ].some((key) => settings[key] !== undefined) ||
    Object.entries(environment).some(
      ([key, value]) =>
        value &&
        /^(CI|GITHUB_ACTIONS|GITHUB_RUN_ID|GITHUB_WORKFLOW|GITHUB_SHA|ACTIONS_ID_TOKEN_REQUEST_URL|ACTIONS_ID_TOKEN_REQUEST_TOKEN|ARM_.*|AZURE_CLIENT_.*|AZURE_FEDERATED_TOKEN_FILE)$/.test(
          key.toUpperCase(),
        ),
    )
  )
    fail(
      'Local foundation execution and initial foundation preview require eligible local-human foundation operations.',
    );

  const account = run(['account', 'show']);
  if (
    account?.user?.type !== 'user' ||
    (localFoundation && account.state !== 'Enabled') ||
    account.id !== config.subscriptionId ||
    account.tenantId !== config.tenantId
  )
    fail(
      'Initial foundation preview requires an unambiguous current human identity.',
    );
  const human = run(['ad', 'signed-in-user', 'show']);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      human?.id ?? '',
    ) ||
    human.id !== settings.bootstrapOperatorObjectId
  )
    fail(
      'Initial foundation preview requires the actual reviewed human bootstrap identity.',
    );
}

export async function verifyTrustedMainRevision(
  config,
  revision,
  { request = globalThis.fetch } = {},
) {
  if (
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.githubRepository ?? '')
  )
    fail('Exact trusted main revision prerequisite is invalid.');
  const response = await request(
    `https://api.github.com/repos/${config.githubRepository}/commits/main`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GH_TOKEN
          ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
          : {}),
      },
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(30000),
    },
  );
  if (!response.ok || (await response.json()).sha !== revision)
    fail(
      'Actual operation revision is not the exact currently reviewed main SHA; review/re-plan required.',
    );
}
