import { validateGeneratorInput } from './azure-generator-input.mjs';
import {
  createVaultGuardCanaryDescriptors,
  validateWorkloadDelegationProjection,
} from './azure-vault-guard.mjs';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  executeProcess,
  OperationalFailure,
  safeFailure,
  processFailure,
} from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = /^[a-f0-9]{40}$/;
const keys = [
  'version',
  'taxRate',
  'environment',
  'generation',
  'subscriptionId',
  'tenantId',
  'region',
  'domain',
  'operatorGroupObjectId',
  'operatorCidrs',
  'acmeEmail',
  'acmeTermsAccepted',
  'kubernetesVersion',
  'nodeVmSize',
  'nodeCount',
  'githubRepository',
  'gitRevision',
  'foundationBackend',
  'environmentBackend',
  'recoveryKeyVersion',
];
const fail = (message) => {
  throw new OperationalFailure(message);
};

export function runPrivateProcess(
  command,
  args,
  {
    operation,
    tool = command === process.execPath ? 'node' : 'terraform',
    timeout = 900000,
    cwd,
    env = process.env,
    input,
    signal,
    maxBuffer = 16 * 1024 * 1024,
    captureStderr = false,
    failurePolicy,
  } = {},
) {
  if (
    failurePolicy !== undefined &&
    (failurePolicy !== 'kubectl-prerequisite' || tool !== 'kubectl')
  )
    fail('Private process failure policy is invalid.');
  return new Promise((resolveResult, reject) => {
    const started = performance.now();
    let reason;
    let size = 0;
    const chunks = [];
    const stderr = [];
    let child;
    let timer;
    const abort = () => {
      reason = { code: 'ABORT_ERR' };
      child?.kill('SIGKILL');
    };
    const finish = (error, status, exitSignal) => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error || reason || status !== 0) {
        const failure = processFailure(
          error ?? reason ?? { status, signal: exitSignal },
          {
            operation,
            tool,
            durationMs: performance.now() - started,
            output: 'private-capture',
          },
        );
        if (failurePolicy === 'kubectl-prerequisite') {
          const text =
            failure.details.category === 'exit'
              ? Buffer.concat(stderr).toString('utf8').trim()
              : '';
          failure.providerCategory =
            /^Unable to connect to the server: dial tcp 127\.0\.0\.1:[1-9][0-9]{0,4}: connectex: No connection could be made because the target machine actively refused it\.$/.test(
              text,
            )
              ? 'connection-refused'
              : 'unclassified';
          failure.message += `; providerCategory=${failure.providerCategory}`;
        }
        reject(failure);
      } else
        resolveResult(
          captureStderr
            ? {
                stdout: Buffer.concat(chunks).toString('utf8'),
                stderr: Buffer.concat(stderr).toString('utf8'),
              }
            : Buffer.concat(chunks).toString('utf8'),
        );
    };
    if (signal?.aborted) {
      reject(
        new OperationalFailure('Private process cancelled before execution.'),
      );
      return;
    }
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      finish(error);
      return;
    }
    child.once('error', (error) => {
      reason = error;
    });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBuffer) {
        reason = { code: 'ENOBUFS' };
        child.kill('SIGKILL');
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBuffer) {
        reason = { code: 'ENOBUFS' };
        child.kill('SIGKILL');
      } else if (captureStderr || failurePolicy === 'kubectl-prerequisite')
        stderr.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.once('close', (status, exitSignal) =>
      finish(undefined, status, exitSignal),
    );
    timer = globalThis.setTimeout(() => {
      reason = { code: 'ETIMEDOUT' };
      child.kill('SIGKILL');
    }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdin.end(input);
  });
}

function publicIpv4(address) {
  if (isIP(address) !== 4) return false;
  const [first, second, third] = address.split('.').map(Number);
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 168 || (second === 0 && third <= 2))) ||
    (first === 198 && [18, 19].includes(second)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  );
}

export function validateAzureConfig(config, { stage = 'environment' } = {}) {
  if (!['environment', 'foundation-bootstrap'].includes(stage))
    fail('Private configuration stage is invalid.');
  if (
    !config ||
    Array.isArray(config) ||
    Object.keys(config).length !== keys.length ||
    keys.some((key) => !(key in config)) ||
    Object.keys(config).some((key) => !keys.includes(key))
  )
    fail('Private configuration fields are missing or unsupported.');
  if (
    config.version !== 1 ||
    !Number.isFinite(config.taxRate) ||
    config.taxRate < 0 ||
    config.taxRate > 1 ||
    !/^[a-z][a-z0-9-]{2,19}$/.test(config.environment) ||
    !/^[a-z0-9]{4,12}$/.test(config.generation)
  )
    fail('Private configuration environment or generation is invalid.');
  for (const key of ['subscriptionId', 'tenantId', 'operatorGroupObjectId'])
    if (!uuid.test(config[key]) || /^0{8}-/.test(config[key]))
      fail('Private configuration identity is invalid.');
  if (
    config.region !== 'westeurope' ||
    config.domain !== 'codingfunlab.com' ||
    config.nodeVmSize !== 'Standard_D4s_v5' ||
    config.nodeCount !== 2 ||
    !/^1\.35\.\d+$/.test(config.kubernetesVersion)
  )
    fail(
      'Private configuration region, SKU, nodes or Kubernetes patch is unsupported.',
    );
  if (
    !Array.isArray(config.operatorCidrs) ||
    !config.operatorCidrs.length ||
    config.operatorCidrs.length > 10 ||
    config.operatorCidrs.some((cidr) => {
      if (typeof cidr !== 'string') return true;
      const [address, prefix, extra] = cidr.split('/');
      return (
        extra !== undefined ||
        !publicIpv4(address) ||
        !/^(2[4-9]|3[0-2])$/.test(prefix) ||
        /^(0\.|127\.|10\.|192\.168\.|169\.254\.)/.test(address)
      );
    })
  )
    fail('Private configuration requires narrow public operator CIDRs.');
  if (
    typeof config.acmeEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.acmeEmail) ||
    /example\.(com|org|net)$/i.test(config.acmeEmail) ||
    config.acmeTermsAccepted !== true
  )
    fail(
      'Private configuration requires actual ACME contact and accepted terms.',
    );
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.githubRepository) ||
    !sha.test(config.gitRevision) ||
    (!(
      stage === 'foundation-bootstrap' && config.recoveryKeyVersion === null
    ) &&
      !/^[a-f0-9]{32}$/.test(config.recoveryKeyVersion))
  )
    fail(
      'Private configuration repository, revision or recovery key version is invalid.',
    );
  for (const key of ['foundationBackend', 'environmentBackend']) {
    const backend = config[key];
    if (
      !backend ||
      Object.keys(backend).sort().join(',') !==
        'containerName,key,resourceGroupName,storageAccountName' ||
      !/^[a-zA-Z0-9._()-]{1,90}$/.test(backend.resourceGroupName) ||
      !/^[a-z0-9]{3,24}$/.test(backend.storageAccountName) ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(backend.containerName) ||
      !/^[a-zA-Z0-9._/-]+\.tfstate$/.test(backend.key) ||
      backend.key.includes('..')
    )
      fail('Private configuration backend is invalid.');
  }
  if (
    ['resourceGroupName', 'storageAccountName'].some(
      (key) => config.foundationBackend[key] !== config.environmentBackend[key],
    ) ||
    config.foundationBackend.key === config.environmentBackend.key ||
    config.foundationBackend.containerName ===
      config.environmentBackend.containerName
  )
    fail(
      'Private configuration requires shared retained account with distinct state containers and keys.',
    );
  return Object.freeze(config);
}

export function loadAzureConfig(path, { stage = 'environment' } = {}) {
  try {
    if (typeof path !== 'string' || !path)
      fail('Private configuration path is required.');
    assertPrivatePath(resolve(path), 0o600);
    return validateAzureConfig(JSON.parse(readFileSync(path, 'utf8')), {
      stage,
    });
  } catch (error) {
    throw new OperationalFailure(
      'Private configuration rejected. ' +
        safeFailure(
          error,
          'Private configuration is missing, insecure or invalid; values suppressed.',
        ),
    );
  }
}

export function runAzure(args, { timeout = 30000 } = {}) {
  if (
    !Array.isArray(args) ||
    args.some(
      (arg) =>
        typeof arg !== 'string' ||
        !/^[A-Za-z0-9_./:=,@?&%+$ -]+$/.test(arg) ||
        (process.platform === 'win32' && arg.includes('%')),
    )
  )
    fail('Azure operation arguments are invalid.');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'az';
  const actual =
    process.platform === 'win32'
      ? [
          '/d',
          '/s',
          '/c',
          `az ${args.map((arg) => `"${arg}"`).join(' ')} --output json --only-show-errors`,
        ]
      : [...args, '--output', 'json', '--only-show-errors'];
  const raw = executeProcess(command, actual, {
    operation: 'Azure read operation',
    tool: 'az',
    output: 'private-capture',
    timeout: Math.min(30000, Math.max(1, timeout)),
    windowsVerbatimArguments: process.platform === 'win32',
  });
  try {
    return JSON.parse(raw);
  } catch {
    fail('Azure operation returned invalid machine-readable output.');
  }
}

export function evaluateCapabilities(
  config,
  data,
  { stage = 'environment', operation = 'apply' } = {},
) {
  if (config.region !== 'westeurope') fail('Unsupported region.');
  if (
    data.account?.id !== config.subscriptionId ||
    data.account?.tenantId !== config.tenantId ||
    data.account?.state !== 'Enabled'
  )
    fail('Azure identity or subscription prerequisite is unknown.');
  const versions =
    data.versions?.values?.flatMap((entry) => [
      entry.version,
      ...Object.keys(entry.patchVersions ?? {}),
    ]) ?? [];
  if (!versions.includes(config.kubernetesVersion))
    fail('Unsupported regional Kubernetes patch.');
  const sku = data.skus?.find(
    (entry) =>
      entry.name === config.nodeVmSize &&
      entry.locations?.includes(config.region),
  );
  if (!sku || sku.restrictions?.length)
    fail('Unsupported or restricted regional VM SKU.');
  const quota = data.usage?.find(
    (entry) => entry.name?.value?.toLowerCase() === 'standarddsv5family',
  );
  const regional = data.usage?.find(
    (entry) => entry.name?.value?.toLowerCase() === 'cores',
  );
  if (
    !quota ||
    !regional ||
    [quota, regional].some(
      (entry) =>
        !Number.isFinite(entry.limit) ||
        !Number.isFinite(entry.currentValue) ||
        entry.limit - entry.currentValue < 8,
    )
  )
    fail('Azure node quota prerequisite is insufficient or unknown.');
  const matches = (pattern, action) =>
    typeof pattern === 'string' &&
    /^[a-zA-Z0-9._/*]+$/.test(pattern) &&
    new RegExp(
      '^' + pattern.replaceAll('.', '\\.').replaceAll('*', '.*') + '$',
      'i',
    ).test(action);
  const requiredActions =
    stage === 'foundation-bootstrap'
      ? ['Microsoft.Authorization/roleAssignments/write']
      : [
          'Microsoft.ContainerService/managedClusters/write',
          'Microsoft.Compute/virtualMachineScaleSets/write',
          'Microsoft.Network/virtualNetworks/write',
          'Microsoft.KeyVault/vaults/write',
          'Microsoft.ContainerRegistry/registries/write',
          'Microsoft.ManagedIdentity/userAssignedIdentities/write',
        ];
  if (operation === 'plan' && stage === 'environment')
    for (let index = 0; index < requiredActions.length; index++)
      requiredActions[index] = requiredActions[index].replace(/write$/, 'read');
  if (
    data.operatorGroup?.id !== config.operatorGroupObjectId ||
    !Array.isArray(data.permissions) ||
    !requiredActions.every((action) =>
      data.permissions.some(
        (entry) =>
          entry.actions?.some((pattern) => matches(pattern, action)) &&
          !entry.notActions?.some((pattern) => matches(pattern, action)),
      ),
    )
  )
    fail(
      'Azure identity deployment authority is unknown; explicit bootstrap authority required.',
    );
  const approvedDirectoryRoles = [
    '62e90394-69f5-4237-9190-012177145e10',
    'e8611ab8-c189-46e8-94e1-60213ab1f814',
  ];
  if (
    stage === 'foundation-bootstrap' &&
    !data.directoryRoles?.value?.some((role) =>
      approvedDirectoryRoles.includes(role.roleTemplateId),
    )
  )
    fail(
      'Entra bootstrap authority prerequisite is unknown; tenant administrator qualification required.',
    );
  return {
    region: config.region,
    nodes: config.nodeCount,
    kubernetesVersion: config.kubernetesVersion,
  };
}

export function calculateCost(items, { taxRate } = {}) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.some(
      (item) =>
        !/^[a-z0-9-]+$/.test(item.id) ||
        ![item.rate, item.runningQuantity, item.retainedQuantity].every(
          (value) => Number.isFinite(value) && value >= 0,
        ),
    )
  )
    fail('Current cost prices are missing or invalid.');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1)
    fail('Actual applicable tax rate is required before paid provisioning.');
  const stopped = items.reduce(
    (sum, item) => sum + item.rate * item.retainedQuantity,
    0,
  );
  const running =
    stopped +
    items.reduce((sum, item) => sum + item.rate * item.runningQuantity, 0);
  if (running * (1 + taxRate) > 120)
    fail(
      'Estimated gross monthly cost exceeds EUR120 including tax; owner revision required.',
    );
  return {
    currency: 'EUR',
    runningHours: 40,
    taxRate,
    runningNet: Number(running.toFixed(2)),
    runningTax: Number((running * taxRate).toFixed(2)),
    runningGross: Number((running * (1 + taxRate)).toFixed(2)),
    stoppedNet: Number(stopped.toFixed(2)),
    stoppedTax: Number((stopped * taxRate).toFixed(2)),
    stoppedGross: Number((stopped * (1 + taxRate)).toFixed(2)),
    items,
  };
}

export function validateReviewAssociation(review, expected, now = new Date()) {
  if (
    !review ||
    !expected ||
    !sha.test(expected.revision) ||
    !['inputHash', 'policyHash', 'planHash'].every((key) =>
      /^[a-f0-9]{64}$/.test(expected[key]),
    ) ||
    typeof expected.stateLineage !== 'string' ||
    !expected.stateLineage ||
    !Number.isInteger(expected.stateSerial) ||
    expected.stateSerial < 0 ||
    [
      'revision',
      'inputHash',
      'policyHash',
      'planHash',
      'stateLineage',
      'stateSerial',
    ].some((key) => review[key] !== expected[key])
  )
    fail('Saved plan review association is stale or mismatched.');
  const expiry = Date.parse(review.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now.getTime())
    fail('Saved plan approval is expired.');
  return review;
}

export function configurationHash(config) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function validateGuardGenerationOutput(value) {
  const invalid = () =>
    fail('Terraform generation guard output projection is invalid.');
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'current_activation_reference,inspection_bindings' ||
    !/^current\/[a-z][a-z0-9-]{2,19}\/[a-z0-9]{4,12}\.json$/.test(
      value.current_activation_reference ?? '',
    ) ||
    !Array.isArray(value.inspection_bindings) ||
    value.inspection_bindings.length !== 6
  )
    invalid();
  const assignmentIds = new Set();
  const principals = new Set();
  let vaultScope;
  for (const binding of value.inspection_bindings) {
    if (
      !binding ||
      Object.keys(binding).sort().join(',') !==
        'assignmentId,principalId,queryScopes,roleKey,scope' ||
      binding.roleKey !== 'permissions' ||
      !uuid.test(binding.principalId ?? '') ||
      typeof binding.scope !== 'string' ||
      !/^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[a-z0-9._()-]+\/providers\/Microsoft.KeyVault\/vaults\/[a-z][a-z0-9-]{2,23}$/i.test(
        binding.scope,
      ) ||
      typeof binding.assignmentId !== 'string' ||
      !binding.assignmentId.startsWith(
        `${binding.scope}/providers/Microsoft.Authorization/roleAssignments/`,
      ) ||
      !uuid.test(binding.assignmentId.split('/').at(-1)) ||
      !Array.isArray(binding.queryScopes) ||
      binding.queryScopes.length !== 1 ||
      binding.queryScopes[0] !== binding.scope ||
      assignmentIds.has(binding.assignmentId) ||
      principals.has(binding.principalId) ||
      (vaultScope && vaultScope !== binding.scope)
    )
      invalid();
    assignmentIds.add(binding.assignmentId);
    principals.add(binding.principalId);
    vaultScope = binding.scope;
  }
  return value;
}

export function validateVaultGuardOutput(value) {
  const invalid = () => fail('Terraform guard output projection is invalid.');
  const exact = (object, keys) => {
    if (
      !object ||
      Array.isArray(object) ||
      typeof object !== 'object' ||
      Object.keys(object).sort().join(',') !== [...keys].sort().join(',')
    )
      invalid();
  };
  exact(value, [
    'definition_id',
    'definition_sha256',
    'assignment_ids',
    'scope_ids',
    'parameters',
    'recovery_vault_id',
    'workload_vault_name_prefix',
    'producer_principal_ids',
    'evidence_storage_account_name',
    'evidence_container_names',
    'role_definitions',
    'inspection_roles',
    'inspection_bindings',
    'current_family_reference',
    'canary',
    'workload_delegation',
    ...(Object.hasOwn(value, 'current_activation_reference')
      ? ['current_activation_reference']
      : []),
  ]);
  const id =
    /^\/subscriptions\/([a-f0-9-]{36})\/providers\/Microsoft.Authorization\/policyDefinitions\/[a-z0-9._()-]+$/i.exec(
      value.definition_id ?? '',
    );
  if (
    !id ||
    !uuid.test(id[1]) ||
    !/^[a-f0-9]{64}$/.test(value.definition_sha256 ?? '')
  )
    invalid();
  const prefix = `/subscriptions/${id[1]}`;
  exact(value.scope_ids, ['recovery', 'workload']);
  exact(value.assignment_ids, ['recovery', 'workload']);
  exact(value.parameters, ['recovery', 'workload']);
  if (value.scope_ids.recovery === value.scope_ids.workload) invalid();
  for (const family of ['recovery', 'workload']) {
    const scope = value.scope_ids[family];
    if (
      typeof scope !== 'string' ||
      !scope.startsWith(`${prefix}/resourceGroups/`) ||
      !/^[a-z0-9._()-]+$/i.test(
        scope.slice(`${prefix}/resourceGroups/`.length),
      ) ||
      typeof value.assignment_ids[family] !== 'string' ||
      !value.assignment_ids[family].startsWith(
        `${scope}/providers/Microsoft.Authorization/policyAssignments/`,
      ) ||
      !/^[a-z0-9._()-]+$/i.test(value.assignment_ids[family].split('/').at(-1))
    )
      invalid();
    exact(value.parameters[family], ['expectedTenantId', 'exactVaultName']);
    for (const key of ['expectedTenantId', 'exactVaultName'])
      exact(value.parameters[family][key], ['value']);
    if (
      !uuid.test(value.parameters[family].expectedTenantId.value ?? '') ||
      typeof value.parameters[family].exactVaultName.value !== 'string'
    )
      invalid();
  }
  const recoveryName = value.parameters.recovery.exactVaultName.value;
  if (
    !/^[a-z][a-z0-9-]{2,23}$/.test(recoveryName) ||
    value.parameters.workload.exactVaultName.value !== '' ||
    value.recovery_vault_id !==
      `${value.scope_ids.recovery}/providers/Microsoft.KeyVault/vaults/${recoveryName}` ||
    value.workload_vault_name_prefix !== 'erw'
  )
    invalid();
  exact(value.producer_principal_ids, ['human', 'apply']);
  if (
    Object.values(value.producer_principal_ids).some((x) => !uuid.test(x ?? ''))
  )
    invalid();
  exact(value.evidence_container_names, ['human', 'apply']);
  if (
    !/^[a-z0-9]{3,24}$/.test(value.evidence_storage_account_name ?? '') ||
    value.evidence_container_names.human !== 'guard-evidence' ||
    value.evidence_container_names.apply !== 'guard-apply-evidence'
  )
    invalid();
  exact(value.role_definitions, ['recovery_network', 'workload_network']);
  const networkActions = [
    'Microsoft.KeyVault/vaults/read',
    'Microsoft.KeyVault/vaults/write',
    'Microsoft.Resources/tags/read',
    'Microsoft.Resources/tags/write',
  ];
  const networkHash = configurationHash({
    actions: networkActions,
    dataActions: [],
  });
  for (const role of Object.values(value.role_definitions)) {
    exact(role, ['id', 'actions', 'sha256']);
    if (
      typeof role.id !== 'string' ||
      !role.id.startsWith(
        `${prefix}/providers/Microsoft.Authorization/roleDefinitions/`,
      ) ||
      !uuid.test(role.id.split('/').at(-1)) ||
      !isDeepStrictEqual(role.actions, networkActions) ||
      role.sha256 !== networkHash
    )
      invalid();
  }
  const environment = /^current\/([a-z][a-z0-9-]{2,19})\.json$/.exec(
    value.current_family_reference ?? '',
  )?.[1];
  if (!environment) invalid();
  const actors = ['plan', 'apply', 'destroy', 'backup', 'restore', 'reaper'];
  exact(value.canary?.role_assignments, actors);
  const principalIds = Object.fromEntries(
    actors.map((actor) => [
      actor,
      value.canary.role_assignments[actor]?.properties?.principalId,
    ]),
  );
  if (
    Object.values(principalIds).some(
      (principal) => !uuid.test(principal ?? ''),
    ) ||
    new Set(Object.values(principalIds)).size !== actors.length ||
    principalIds.apply !== value.producer_principal_ids.apply
  )
    invalid();
  if (
    !isDeepStrictEqual(
      value.canary,
      createVaultGuardCanaryDescriptors({
        config: { subscriptionId: id[1], environment },
        guard: value,
        principalIds,
      }),
    )
  )
    invalid();

  try {
    validateWorkloadDelegationProjection(value.workload_delegation);
  } catch {
    invalid();
  }
  if (value.workload_delegation.scope !== value.scope_ids.workload) invalid();
  for (const actor of ['apply', 'destroy'])
    if (
      value.workload_delegation.assignments[actor].principalId !==
      principalIds[actor]
    )
      invalid();

  const canonical = (object) =>
    Array.isArray(object)
      ? object.map(canonical)
      : object && typeof object === 'object'
        ? Object.fromEntries(
            Object.keys(object)
              .sort()
              .map((key) => [key, canonical(object[key])]),
          )
        : object;
  const scopes = Object.values(value.scope_ids).sort();
  const definitions = {
    permissions: {
      actions: ['Microsoft.Authorization/permissions/read'],
      assignableScopes: [...scopes, value.definition_id].sort(),
    },
    authority: {
      actions: [
        'Microsoft.Authorization/roleAssignments/read',
        'Microsoft.Authorization/roleDefinitions/read',
      ],
      assignableScopes: [...scopes, value.definition_id].sort(),
    },
    policy_definition: {
      actions: ['Microsoft.Authorization/policyDefinitions/read'],
      assignableScopes: [value.definition_id],
    },
    policy_assignment: {
      actions: ['Microsoft.Authorization/policyAssignments/read'],
      assignableScopes: scopes,
    },
    policy_exemptions: {
      actions: ['Microsoft.Authorization/policyExemptions/read'],
      assignableScopes: scopes,
    },
  };
  exact(value.inspection_roles, Object.keys(definitions));
  const roleIds = new Set();
  for (const [key, expected] of Object.entries(definitions)) {
    const role = value.inspection_roles[key];
    exact(role, [
      'id',
      'actions',
      'notActions',
      'dataActions',
      'notDataActions',
      'assignableScopes',
      'sha256',
    ]);
    const semantic = {
      ...expected,
      notActions: [],
      dataActions: [],
      notDataActions: [],
    };
    if (
      typeof role.id !== 'string' ||
      !role.id.startsWith(
        `${prefix}/providers/Microsoft.Authorization/roleDefinitions/`,
      ) ||
      !uuid.test(role.id.split('/').at(-1)) ||
      roleIds.has(role.id) ||
      Object.entries(semantic).some(
        ([field, expectedValue]) =>
          !isDeepStrictEqual(role[field], expectedValue),
      ) ||
      role.sha256 !== configurationHash(canonical(semantic))
    )
      invalid();
    roleIds.add(role.id);
  }

  const containers = Object.values(value.evidence_container_names).map(
    (name) =>
      `${value.scope_ids.recovery}/providers/Microsoft.Storage/storageAccounts/${value.evidence_storage_account_name}/blobServices/default/containers/${name}`,
  );
  const targets = [
    value.definition_id,
    ...Object.values(value.assignment_ids),
    ...scopes,
  ];
  const tuples = [
    ...containers.flatMap((scope) =>
      ['permissions', 'authority'].map((roleKey) => ({ scope, roleKey })),
    ),
    { scope: value.recovery_vault_id, roleKey: 'permissions' },
    ...targets.flatMap((scope) =>
      ['permissions', 'authority'].map((roleKey) => ({ scope, roleKey })),
    ),
    { scope: value.definition_id, roleKey: 'policy_definition' },
    ...Object.values(value.assignment_ids).map((scope) => ({
      scope,
      roleKey: 'policy_assignment',
    })),
    ...scopes.map((scope) => ({ scope, roleKey: 'policy_exemptions' })),
  ];
  const tupleKey = (binding) =>
    JSON.stringify([binding.roleKey, binding.principalId, binding.scope]);
  const expectedBindings = new Set(
    actors.flatMap((actor) =>
      tuples.map((tuple) =>
        tupleKey({ ...tuple, principalId: principalIds[actor] }),
      ),
    ),
  );
  const merged = Object.hasOwn(value, 'current_activation_reference');
  if (!Array.isArray(value.inspection_bindings)) invalid();
  const extraBindings = value.inspection_bindings.filter(
    (binding) => !expectedBindings.has(tupleKey(binding ?? {})),
  );
  if (merged) {
    validateGuardGenerationOutput({
      current_activation_reference: value.current_activation_reference,
      inspection_bindings: extraBindings,
    });
    if (
      !value.current_activation_reference.startsWith(
        `current/${environment}/`,
      ) ||
      !isDeepStrictEqual(
        extraBindings.map((binding) => binding.principalId).sort(),
        Object.values(principalIds).sort(),
      )
    )
      invalid();
  } else if (extraBindings.length) invalid();
  const assignmentIds = new Set();
  for (const binding of value.inspection_bindings) {
    exact(binding, [
      'roleKey',
      'principalId',
      'assignmentId',
      'scope',
      'queryScopes',
    ]);
    const key = tupleKey(binding);
    if (
      typeof binding.assignmentId !== 'string' ||
      !binding.assignmentId.startsWith(
        `${binding.scope}/providers/Microsoft.Authorization/roleAssignments/`,
      ) ||
      !uuid.test(binding.assignmentId.split('/').at(-1)) ||
      assignmentIds.has(binding.assignmentId) ||
      !isDeepStrictEqual(binding.queryScopes, [binding.scope])
    )
      invalid();
    assignmentIds.add(binding.assignmentId);
    if (!extraBindings.includes(binding) && !expectedBindings.delete(key))
      invalid();
  }
  if (expectedBindings.size) invalid();
  return value;
}

const outputKeys = new Set([
  'vault_guard',
  'vault_guard_generation',
  'guard_evidence_container_name',
  'guard_apply_evidence_container_name',
  'projection_inputs',
  'foundation_resource_group_name',
  'workload_resource_group_name',
  'aks_cluster_name',
  'aks_resource_id',
  'acr_login_server',
  'workload_key_vault_uri',
  'recovery_key_id',
  'recovery_key_version',
  'state_storage_account_name',
  'state_container_name',
  'environment_state_container_name',
  'recovery_storage_account_name',
  'recovery_container_name',
  'dns_zone_name',
  'dns_nameservers',
  'persistent_api_cidrs',
  'workload_client_ids',
  'tenant_id',
  'dns_zone_resource_group_name',
  'ingress_public_ip',
  'ingress_public_ip_resource_group_name',
  'argocd_client_id',
  'dashboard_client_id',
  'operator_group_object_id',
  'lease_container_name',
  'operation_container_name',
  'operation_storage_account_name',
  'plan_container_name',
  'github_client_ids',
  'github_principal_ids',
  'approved_operator_object_ids',
  'operator_client_ids',
  'operator_application_object_ids',
  'operation_role_ids',
  'aks_oidc_issuer_url',
  'workload_key_vault_name',
  'audit_workspace_resource_id',
  'audit_workspace_id',
  'audit_dcr_resource_id',
  'audit_transform_sha256',
  'audit_stream',
  'bootstrap_container_name',
  'qualification_container_names',
  'qualification_challenge_container_name',
]);
export function validateTerraformOutputs(raw, scope = 'environment') {
  if (
    !raw ||
    Array.isArray(raw) ||
    !['environment', 'foundation'].includes(scope)
  )
    fail('Terraform output projection is invalid.');
  const selected = {};
  for (const [key, entry] of Object.entries(raw))
    if (outputKeys.has(key)) {
      if (!entry || !('value' in entry) || entry.sensitive === true)
        fail('Terraform output projection is invalid.');
      const maps = [
        'workload_client_ids',
        'github_client_ids',
        'github_principal_ids',
        'operator_client_ids',
        'operator_application_object_ids',
      ];
      const arrays = [
        'dns_nameservers',
        'persistent_api_cidrs',
        'approved_operator_object_ids',
      ];
      if (key === 'vault_guard') {
        validateVaultGuardOutput(entry.value);
      } else if (key === 'vault_guard_generation') {
        validateGuardGenerationOutput(entry.value);
      } else if (key === 'projection_inputs') {
        validateGeneratorInput(entry.value);
      } else if (maps.includes(key)) {
        if (
          !entry.value ||
          Array.isArray(entry.value) ||
          typeof entry.value !== 'object' ||
          Object.values(entry.value).some(
            (value) => typeof value !== 'string' || !uuid.test(value),
          )
        )
          fail('Terraform identity output projection is invalid.');
      } else if (key === 'qualification_container_names') {
        if (
          !entry.value ||
          Object.keys(entry.value).sort().join(',') !== 'backup,restore' ||
          entry.value.backup !== 'qualification-backup' ||
          entry.value.restore !== 'qualification-restore'
        )
          fail('Terraform qualification container projection is invalid.');
      } else if (key === 'operation_role_ids') {
        if (
          Object.keys(entry.value ?? {})
            .sort()
            .join(',') !==
            'admission,continuity_backup,continuity_restore,guard_authority_read,guard_permissions_read,lifecycle,stop,workload_network' ||
          !entry.value ||
          Array.isArray(entry.value) ||
          typeof entry.value !== 'object' ||
          Object.values(entry.value).some(
            (value) =>
              typeof value !== 'string' ||
              !/^\/subscriptions\/[a-f0-9-]+\/providers\/Microsoft.Authorization\/roleDefinitions\/[a-f0-9-]+$/i.test(
                value,
              ),
          )
        )
          fail('Terraform role output projection is invalid.');
      } else if (arrays.includes(key)) {
        if (
          !Array.isArray(entry.value) ||
          !entry.value.length ||
          entry.value.some((value) => typeof value !== 'string' || !value)
        )
          fail('Terraform array output projection is invalid.');
        if (
          key === 'approved_operator_object_ids' &&
          entry.value.some((value) => !uuid.test(value))
        )
          fail('Terraform operator output projection is invalid.');
      } else if (
        typeof entry.value !== 'string' ||
        !entry.value ||
        /[\r\n\0]/.test(entry.value)
      )
        fail('Terraform string output projection is invalid.');
      selected[key] = entry.value;
    }
  const required =
    scope === 'foundation'
      ? [
          'foundation_resource_group_name',
          'state_storage_account_name',
          'operation_container_name',
          'recovery_key_id',
        ]
      : [
          'workload_resource_group_name',
          'aks_cluster_name',
          'aks_resource_id',
          'acr_login_server',
          'workload_key_vault_uri',
        ];
  for (const key of required)
    if (typeof selected[key] !== 'string' || !selected[key])
      fail('Required Terraform output is missing.');
  return selected;
}

export async function preflight(
  config,
  {
    run = runAzure,
    request = globalThis.fetch,
    prices,
    stage = 'environment',
    foundation,
    operation = 'apply',
  } = {},
) {
  validateAzureConfig(config, { stage });
  if (
    stage === 'environment' &&
    (!foundation ||
      typeof foundation.workload_resource_group_name !== 'string' ||
      !/^[a-zA-Z0-9._()-]{1,90}$/.test(foundation.workload_resource_group_name))
  )
    fail(
      'Validated foundation output prerequisite is required for scoped environment preflight.',
    );
  const deadline = Date.now() + 120000;
  const read = (args) => {
    if (Date.now() >= deadline)
      fail('Azure capability preflight exceeded its time budget.');
    return run(args, { timeout: Math.min(30000, deadline - Date.now()) });
  };
  const scope = `/subscriptions/${config.subscriptionId}${stage === 'environment' ? `/resourceGroups/${foundation.workload_resource_group_name}` : ''}`;
  const regionalSkus = async () => {
    const invalid = () =>
      fail('Regional Azure SKU discovery is incomplete or invalid.');
    const base = new URL(
      `https://management.azure.com/subscriptions/${config.subscriptionId}/providers/Microsoft.Compute/skus`,
    );
    const filter = `location eq '${config.region}'`;
    base.searchParams.set('api-version', '2021-07-01');
    base.searchParams.set('$filter', filter);
    const token = read([
      'account',
      'get-access-token',
      '--resource',
      'https://management.azure.com/',
      '--subscription',
      config.subscriptionId,
    ]);
    if (typeof token?.accessToken !== 'string' || !token.accessToken) invalid();
    const seen = new Set();
    const selected = [];
    let next = base.href;
    while (next !== undefined) {
      let url;
      try {
        url = new URL(next);
      } catch {
        invalid();
      }
      if (
        url.origin !== base.origin ||
        url.pathname !== base.pathname ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.get('api-version') !== '2021-07-01' ||
        url.searchParams.getAll('api-version').length !== 1 ||
        url.searchParams.get('$filter') !== filter ||
        url.searchParams.getAll('$filter').length !== 1 ||
        seen.has(url.href) ||
        seen.size >= 100 ||
        Date.now() >= deadline
      )
        invalid();
      seen.add(url.href);
      let body;
      try {
        const response = await request(url, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(
            Math.min(30000, deadline - Date.now()),
          ),
        });
        if (!response.ok)
          fail(
            `Regional Azure SKU discovery failed; HTTP status ${response.status}.`,
          );
        body = await response.json();
      } catch (error) {
        if (error instanceof OperationalFailure) throw error;
        fail(
          'Regional Azure SKU discovery failed; private transport details suppressed.',
        );
      }
      if (!body || !Array.isArray(body.value)) invalid();
      for (const sku of body.value) {
        if (
          !sku ||
          typeof sku.name !== 'string' ||
          !sku.name ||
          typeof sku.resourceType !== 'string' ||
          !sku.resourceType ||
          !Array.isArray(sku.locations) ||
          !sku.locations.length ||
          sku.locations.some(
            (location) => typeof location !== 'string' || !location,
          ) ||
          !Array.isArray(sku.restrictions)
        )
          invalid();
        if (
          sku.resourceType === 'virtualMachines' &&
          sku.name === config.nodeVmSize
        ) {
          if (!sku.locations.includes(config.region) || sku.restrictions.length)
            invalid();
          selected.push(sku);
        }
      }
      if (body.nextLink === undefined || body.nextLink === null)
        next = undefined;
      else if (typeof body.nextLink === 'string' && body.nextLink)
        next = body.nextLink;
      else invalid();
    }
    if (selected.length !== 1 || Date.now() >= deadline) invalid();
    return selected;
  };
  const data = {
    account: read(['account', 'show']),
    versions: read([
      'aks',
      'get-versions',
      '--location',
      config.region,
      '--subscription',
      config.subscriptionId,
    ]),
    skus: await regionalSkus(),
    usage: read([
      'vm',
      'list-usage',
      '--location',
      config.region,
      '--subscription',
      config.subscriptionId,
    ]),
    operatorGroup:
      stage === 'foundation-bootstrap'
        ? read(['ad', 'group', 'show', '--group', config.operatorGroupObjectId])
        : { id: foundation.operator_group_object_id },
    permissions: read([
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com${scope}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`,
    ]),
    directoryRoles:
      stage === 'foundation-bootstrap'
        ? read([
            'rest',
            '--method',
            'get',
            '--url',
            'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.directoryRole?$select=roleTemplateId',
          ])
        : undefined,
  };
  const quotaCount = (value) => {
    const count =
      typeof value === 'string' &&
      value.trim() === value &&
      /^(0|[1-9][0-9]*)$/.test(value)
        ? Number(value)
        : value;
    if (!Number.isSafeInteger(count) || count < 0 || Object.is(count, -0))
      fail('Azure quota response count is invalid.');
    return count;
  };
  if (!Array.isArray(data.usage)) fail('Azure quota response is invalid.');
  data.usage = data.usage.map((entry) => ({
    ...entry,
    limit: quotaCount(entry?.limit),
    currentValue: quotaCount(entry?.currentValue),
  }));
  data.permissions = data.permissions.value;
  const capabilities = evaluateCapabilities(config, data, { stage, operation });
  const cost = calculateCost(
    prices ?? (await retailBillOfMaterials({ deadline })),
    { taxRate: config.taxRate },
  );
  return { capabilities, cost, inputHash: configurationHash(config) };
}

export async function retailBillOfMaterials({
  request = globalThis.fetch,
  deadline = Date.now() + 120000,
} = {}) {
  const meters = [
    {
      id: 'compute',
      service: 'Virtual Machines',
      product: 'Virtual Machines Dsv5 Series',
      meter: 'D4s v5',
      region: 'westeurope',
      sku: 'Standard_D4s_v5',
      unit: '1 Hour',
      runningQuantity: 80,
      retainedQuantity: 0,
    },
    {
      id: 'load-balancer',
      service: 'Load Balancer',
      product: 'Load Balancer',
      meter: 'Standard Included LB Rules and Outbound Rules',
      region: 'Global',
      sku: 'Standard',
      unit: '1 Hour',
      runningQuantity: 0,
      retainedQuantity: 730,
    },
    {
      id: 'public-ip',
      service: 'Virtual Network',
      product: 'IP Addresses',
      meter: 'Standard IPv4 Static Public IP',
      region: 'westeurope',
      sku: 'Standard',
      unit: '1 Hour',
      runningQuantity: 0,
      retainedQuantity: 1460,
    },
    {
      id: 'registry',
      service: 'Container Registry',
      product: 'Container Registry',
      meter: 'Basic Registry Unit',
      region: 'westeurope',
      sku: 'Basic',
      unit: '1/Day',
      runningQuantity: 0,
      retainedQuantity: 730 / 24,
    },
    ...['P6', 'E4'].flatMap((size) => [
      {
        id: `disk-${size.toLowerCase()}`,
        service: 'Storage',
        product:
          size === 'P6'
            ? 'Premium SSD Managed Disks'
            : 'Standard SSD Managed Disks',
        meter: `${size} LRS Disk`,
        region: 'westeurope',
        sku: `${size} LRS`,
        unit: '1/Month',
        runningQuantity: 0,
        retainedQuantity: size === 'P6' ? 2 : 6,
      },
      {
        id: `mount-${size.toLowerCase()}`,
        service: 'Storage',
        product:
          size === 'P6'
            ? 'Premium SSD Managed Disks'
            : 'Standard SSD Managed Disks',
        meter: `${size} LRS Disk Mount`,
        region: 'westeurope',
        sku: `${size} LRS`,
        unit: '1/Month',
        runningQuantity: 0,
        retainedQuantity: size === 'P6' ? 2 : 6,
      },
    ]),
    {
      id: 'dns',
      service: 'Azure DNS',
      product: 'Azure DNS',
      meter: 'Public Zone',
      region: '',
      sku: 'Public',
      unit: '1',
      runningQuantity: 0,
      retainedQuantity: 1,
    },
    {
      id: 'blob',
      service: 'Storage',
      product: 'General Block Blob v2',
      meter: 'Hot LRS Data Stored',
      region: 'westeurope',
      sku: 'Hot LRS',
      unit: '1 GB/Month',
      runningQuantity: 0,
      retainedQuantity: 10,
    },
    {
      id: 'audit-ingestion',
      service: 'Log Analytics',
      product: 'Log Analytics',
      meter: 'Analytics Logs Data Ingestion',
      region: 'westeurope',
      sku: 'Analytics Logs',
      unit: '1 GB',
      tier: 5,
      runningQuantity: 0,
      retainedQuantity: (0.03 * 730) / 24,
    },
  ];
  const prices = await Promise.all(
    meters.map(async (meter) => {
      const filter = `serviceName eq '${meter.service}' and productName eq '${meter.product}' and meterName eq '${meter.meter}' and armRegionName eq '${meter.region}' and skuName eq '${meter.sku}' and priceType eq 'Consumption'`;
      const url = new URL('https://prices.azure.com/api/retail/prices');
      url.searchParams.set('currencyCode', 'EUR');
      url.searchParams.set('$filter', filter);
      let payload;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (Date.now() >= deadline)
          fail('Retail price preflight exceeded its time budget.');
        try {
          const response = await request(url, {
            signal: globalThis.AbortSignal.timeout(
              Math.min(30000, Math.max(1, deadline - Date.now())),
            ),
          });
          if (!response.ok) {
            if (
              [429, 500, 502, 503, 504].includes(response.status) &&
              attempt < 2
            ) {
              await delay(1000 + Math.random() * 4000);
              continue;
            }
            fail(
              `Retail price request failed; HTTP status ${response.status}.`,
            );
          }
          payload = await response.json();
          break;
        } catch (error) {
          if (error instanceof OperationalFailure) throw error;
          if (attempt === 2)
            fail(
              'Retail price request failed; private transport details suppressed.',
            );
          await delay(1000 + Math.random() * 4000);
        }
      }
      const matching = payload?.Items?.filter(
        (item) =>
          item.currencyCode === 'EUR' &&
          item.type === 'Consumption' &&
          item.unitOfMeasure === meter.unit &&
          item.tierMinimumUnits === (meter.tier ?? 0) &&
          item.productName === meter.product &&
          item.meterName === meter.meter &&
          item.skuName === meter.sku &&
          item.armRegionName === meter.region &&
          !item.reservationTerm &&
          Number.isFinite(item.retailPrice) &&
          item.retailPrice > 0,
      );
      if (
        !matching?.length ||
        payload.NextPageLink ||
        new Set(matching.map((item) => item.retailPrice)).size !== 1
      )
        fail(
          'Current cost meter is missing, ambiguous or paginated; review required.',
        );
      return {
        id: meter.id,
        rate: matching[0].retailPrice,
        runningQuantity: meter.runningQuantity,
        retainedQuantity: meter.retainedQuantity,
        meterId: matching[0].meterId,
      };
    }),
  );
  return [
    ...prices,
    {
      id: 'audit-query-processing-reserve',
      rate: 0.5,
      runningQuantity: 0,
      retainedQuantity: 1,
    },
    {
      id: 'usage-verification-reserve',
      rate: 16,
      runningQuantity: 0,
      retainedQuantity: 1,
    },
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = {
      '--config': 'config',
      '--stage': 'stage',
      '--purpose': 'purpose',
      '--family-handle': 'familyHandlePath',
      '--generation-handle': 'generationHandlePath',
      '--guard-stage': 'guardStage',
      '--foundation-outputs': 'foundationOutputs',
      '--bootstrap-locator': 'bootstrapLocator',
      '--recovery-config': 'recoveryConfigPath',
      '--input': 'projectionInput',
      '--scope': 'projectionScope',
      '--environment-outputs': 'environmentOutputs',
      '--revision': 'revision',
      '--review': 'reviewPath',
      '--audit-stage': 'auditStage',
      '--recovery-key-expiration-date': 'recoveryKeyExpirationDate',
      '--bootstrap-operator-object-id': 'bootstrapOperatorObjectId',
      '--network-gate-ready': 'networkGateReady',
      '--initial-foundation-preview': 'initialFoundationPreview',
      '--local-foundation': 'localFoundation',
      '--oidc-expiration-date': 'oidcExpirationDate',
      '--rotate': 'rotate',
      '--confirm-environment': 'confirmation',
    }[args[index]];
    if (!key || options[key] || !args[index + 1])
      fail('Private configuration command arguments are invalid.');
    options[key] = args[index + 1];
  }
  if (
    ![
      'preflight',
      'validate-config',
      'plan',
      'apply',
      'foundation-gate',
      'foundation-migration-finalize',
      'operator-credentials',
      'bootstrap',
      'guard-qualify',
      'validate-projection',
    ].includes(command) ||
    !options.config
  )
    fail(
      'Private configuration required: preflight|validate-config|plan|apply|foundation-gate --config PATH.',
    );
  const stage = options.stage ?? 'environment';
  if (
    command === 'foundation-migration-finalize' &&
    (stage !== 'foundation-bootstrap' ||
      options.localFoundation !== 'true' ||
      options.foundationOutputs ||
      options.bootstrapLocator ||
      options.environmentOutputs ||
      (options.networkGateReady !== undefined &&
        options.networkGateReady !== 'false'))
  )
    fail(
      'Local foundation migration finalization requires explicit local-human foundation scope.',
    );
  if (
    options.localFoundation &&
    (!['true', 'false'].includes(options.localFoundation) ||
      (options.localFoundation === 'true' &&
        (![
          'plan',
          'apply',
          'foundation-gate',
          'foundation-migration-finalize',
        ].includes(command) ||
          stage !== 'foundation-bootstrap' ||
          options.initialFoundationPreview === 'true' ||
          options.bootstrapLocator ||
          options.environmentOutputs)))
  )
    fail(
      'Local foundation mode requires an explicit boolean and eligible foundation operation.',
    );
  if (
    options.initialFoundationPreview &&
    (!['true', 'false'].includes(options.initialFoundationPreview) ||
      (options.initialFoundationPreview === 'true' &&
        (command !== 'plan' ||
          stage !== 'foundation-bootstrap' ||
          options.bootstrapLocator ||
          options.foundationOutputs ||
          options.environmentOutputs)))
  )
    fail(
      'Initial foundation preview requires an explicit boolean and a local initial foundation plan.',
    );
  const config = loadAzureConfig(options.config, { stage });
  if (command === 'validate-config')
    console.log('Private configuration valid.');
  else {
    let foundation;
    let hostedEnvironment;
    if (options.bootstrapLocator) {
      if (
        options.foundationOutputs ||
        options.environmentOutputs ||
        stage !== 'environment'
      )
        fail(
          'Hosted locator cannot be combined with manual projection files or foundation bootstrap stage.',
        );
      assertPrivatePath(resolve(options.bootstrapLocator), 0o600);
      const { loadHostedProjections } = await import('./azure-handoff.mjs');
      const { azureTokenProvider } = await import('./azure-terraform.mjs');
      const loaded = await loadHostedProjections({
        config,
        locator: JSON.parse(readFileSync(options.bootstrapLocator, 'utf8')),
        includeEnvironment:
          command === 'bootstrap' ||
          (['plan', 'apply'].includes(command) &&
            ['grant', 'active'].includes(options.guardStage)) ||
          (command === 'guard-qualify' &&
            options.purpose === 'workload-generation'),
        token: azureTokenProvider(config),
      });
      foundation = loaded.foundation;
      hostedEnvironment = loaded.environment;
      options.locatorHash = loaded.locatorHash;
    }
    if (options.foundationOutputs) {
      assertPrivatePath(resolve(options.foundationOutputs), 0o600);
      try {
        foundation = validateTerraformOutputs(
          JSON.parse(readFileSync(options.foundationOutputs, 'utf8')),
          'foundation',
        );
      } catch (error) {
        throw new OperationalFailure(
          safeFailure(
            error,
            'Private foundation output projection is invalid.',
          ),
        );
      }
    }
    let result;
    if (command === 'validate-projection') {
      if (
        !options.projectionInput ||
        !['foundation', 'environment'].includes(options.projectionScope)
      )
        fail(
          'Projection validation requires private input and explicit scope.',
        );
      assertPrivatePath(resolve(options.projectionInput), 0o600);
      const { validateProjection } = await import('./azure-handoff.mjs');
      const wrapper = JSON.parse(readFileSync(options.projectionInput, 'utf8'));
      validateProjection(wrapper, config, options.projectionScope);
      result = { phase: 'projection-valid', outputsHash: wrapper.outputsHash };
    } else if (command === 'guard-qualify') {
      if (
        !['human-policy-family', 'workload-generation'].includes(
          options.purpose,
        ) ||
        !foundation ||
        !options.revision ||
        (options.purpose === 'human-policy-family' &&
          stage !== 'foundation-bootstrap') ||
        (options.purpose === 'workload-generation' &&
          (stage !== 'environment' ||
            (!hostedEnvironment && !options.environmentOutputs) ||
            !options.familyHandlePath))
      )
        fail(
          'Guard qualification requires explicit purpose, reviewed revision and stage-appropriate validated private projections.',
        );
      let environment = hostedEnvironment;
      if (!environment && options.environmentOutputs) {
        assertPrivatePath(resolve(options.environmentOutputs), 0o600);
        environment = validateTerraformOutputs(
          JSON.parse(readFileSync(options.environmentOutputs, 'utf8')),
          'environment',
        );
      }
      const { executeGuardQualification } =
        await import('./azure-terraform.mjs');
      result = await executeGuardQualification({
        ...options,
        config,
        foundation,
        environment,
      });
    } else if (command === 'bootstrap') {
      if (
        stage !== 'environment' ||
        !foundation ||
        (!options.environmentOutputs && !hostedEnvironment)
      )
        fail(
          'Bootstrap requires environment stage and distinct private raw foundation/environment Terraform outputs.',
        );
      if (options.environmentOutputs)
        assertPrivatePath(resolve(options.environmentOutputs), 0o600);
      let environment = hostedEnvironment;
      try {
        if (!environment)
          environment = validateTerraformOutputs(
            JSON.parse(readFileSync(options.environmentOutputs, 'utf8')),
            'environment',
          );
      } catch (error) {
        throw new OperationalFailure(
          safeFailure(
            error,
            'Private environment output projection is invalid.',
          ),
        );
      }
      const { executeBootstrap } = await import('./azure-provisioning.mjs');
      result = await executeBootstrap({
        ...options,
        config,
        foundation,
        environment,
      });
    } else if (command === 'operator-credentials') {
      if (
        stage !== 'foundation-bootstrap' ||
        !foundation ||
        !options.oidcExpirationDate ||
        (options.rotate && options.rotate !== 'true')
      )
        fail(
          'Human operator maintenance requires explicit bootstrap stage, foundation outputs, reviewed expiry and explicit rotation confirmation.',
        );
      const { executeOperatorMaintenance } =
        await import('./azure-provisioning.mjs');
      result = await executeOperatorMaintenance({
        ...options,
        config,
        foundation,
        rotate: options.rotate === 'true',
      });
    } else if (command === 'foundation-migration-finalize') {
      const { finalizeFoundationMigration } =
        await import('./azure-terraform.mjs');
      result = await finalizeFoundationMigration(config, options.revision, {
        ...options,
        stage,
        localFoundation: true,
        initialFoundationPreview: options.initialFoundationPreview === 'true',
        networkGateReady: false,
      });
    } else if (command === 'foundation-gate') {
      if (stage !== 'foundation-bootstrap' || !foundation)
        fail(
          'Foundation gate requires explicit bootstrap stage and verified private foundation outputs.',
        );
      const { initializeFoundationGate } =
        await import('./azure-terraform.mjs');
      result = await initializeFoundationGate(
        config,
        options.revision,
        foundation,
        {
          ...options,
          localFoundation: options.localFoundation === 'true',
          initialFoundationPreview: options.initialFoundationPreview === 'true',
          networkGateReady: options.networkGateReady === 'true',
        },
      );
    } else if (['plan', 'apply'].includes(command)) {
      const { executeInfrastructure } = await import('./azure-terraform.mjs');
      if (
        options.networkGateReady &&
        !['true', 'false'].includes(options.networkGateReady)
      )
        fail('Network gate binding flag must be explicit true or false.');
      result = await executeInfrastructure(command, {
        ...options,
        config,
        stage,
        foundation,
        environment:
          hostedEnvironment ??
          (options.environmentOutputs
            ? (() => {
                assertPrivatePath(resolve(options.environmentOutputs), 0o600);
                return validateTerraformOutputs(
                  JSON.parse(readFileSync(options.environmentOutputs, 'utf8')),
                  'environment',
                );
              })()
            : undefined),
        networkGateReady: options.networkGateReady === 'true',
        initialFoundationPreview: options.initialFoundationPreview === 'true',
        localFoundation: options.localFoundation === 'true',
      });
    } else result = await preflight(config, { stage, foundation });
    console.log(JSON.stringify(result));
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(
      safeFailure(
        error,
        'Infrastructure operation failed; private details suppressed.',
      ),
    );
    process.exitCode = 1;
  });
