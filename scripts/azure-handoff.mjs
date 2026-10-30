import {
  createGeneratorInput,
  validateGeneratorInput,
} from './azure-generator-input.mjs';
import { isDeepStrictEqual } from 'node:util';
import { Buffer } from 'node:buffer';
import { OperationalFailure, safeFailure } from './process.mjs';
import {
  validateTerraformOutputs,
  validateGuardGenerationOutput,
  validateVaultGuardOutput,
} from './azure-infrastructure.mjs';
import { operationOutputsHash } from './azure-operations.mjs';
const fail = (message) => {
  throw new OperationalFailure(message);
};
export function createProjection(config, raw, scope) {
  const selected = validateTerraformOutputs(raw, scope);
  if (
    Object.keys(raw).sort().join(',') !== Object.keys(selected).sort().join(',')
  )
    fail('Durable projection contains unknown or unapproved outputs.');
  const outputs = Object.fromEntries(
    Object.entries(selected).map(([key, value]) => [
      key,
      { value, sensitive: false },
    ]),
  );
  const wrapper = {
    version: 1,
    environment: config.environment,
    generation: config.generation,
    subscriptionId: config.subscriptionId,
    tenantId: config.tenantId,
    sourceRevision: config.gitRevision,
    outputsHash: operationOutputsHash(selected),
    outputs,
  };
  validateProjection(wrapper, config, scope);
  return wrapper;
}
export function validateProjection(wrapper, config, scope) {
  if (
    !wrapper ||
    Object.keys(wrapper).sort().join(',') !==
      'environment,generation,outputs,outputsHash,sourceRevision,subscriptionId,tenantId,version' ||
    wrapper.version !== 1 ||
    ['environment', 'generation', 'subscriptionId', 'tenantId'].some(
      (key) => wrapper[key] !== config[key],
    ) ||
    wrapper.sourceRevision !== config.gitRevision
  )
    fail('Durable projection identity or schema is invalid.');
  const selected = validateTerraformOutputs(wrapper.outputs, scope);
  if (
    Object.keys(wrapper.outputs).sort().join(',') !==
      Object.keys(selected).sort().join(',') ||
    wrapper.outputsHash !== operationOutputsHash(selected)
  )
    fail('Durable projection output inventory or digest is invalid.');
  for (const entry of Object.values(wrapper.outputs))
    if (
      Object.keys(entry).sort().join(',') !== 'sensitive,value' ||
      entry.sensitive !== false
    )
      fail('Durable projection output metadata is invalid.');
  return selected;
}
export function createBlobJsonTransport({
  account,
  container,
  token,
  request = globalThis.fetch,
  signal,
}) {
  if (
    !/^[a-z0-9]{3,24}$/.test(account ?? '') ||
    !/^(bootstrap|operations|qualification-backup|qualification-restore|qualification-challenges|guard-apply-evidence)$/.test(
      container ?? '',
    )
  )
    fail('Private durable Blob scope is invalid.');
  const exchange = async (key, method, value, createOnly) => {
    if (
      typeof key !== 'string' ||
      !/^[a-zA-Z0-9_/-]+\.json$/.test(key) ||
      key.split('/').some((part) => part === '..' || !part)
    )
      fail('Private durable Blob path is invalid.');
    try {
      const body = value === undefined ? undefined : JSON.stringify(value);
      if (body && Buffer.byteLength(body, 'utf8') > 1048576)
        fail('Durable Blob object exceeds its size limit.');
      const response = await request(
        `https://${account}.blob.core.windows.net/${container}/${key}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${await token('https://storage.azure.com/')}`,
            'x-ms-version': '2023-11-03',
            'x-ms-date': new Date().toUTCString(),
            ...(body
              ? {
                  'x-ms-blob-type': 'BlockBlob',
                  'Content-Type': 'application/json',
                }
              : {}),
            ...(createOnly ? { 'If-None-Match': '*' } : {}),
          },
          body,
          redirect: 'error',
          signal: signal
            ? globalThis.AbortSignal.any([
                signal,
                globalThis.AbortSignal.timeout(30000),
              ])
            : globalThis.AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        fail(
          `Private durable Blob ${method} failed; HTTP status ${response.status}.`,
        );
      if (method === 'GET') {
        let text = '';
        let size = 0;
        const decoder = new globalThis.TextDecoder();
        for await (const part of response.body) {
          size += part.byteLength;
          text += decoder.decode(part, { stream: true });
          if (size > 1048576)
            fail('Durable Blob object exceeds its size limit.');
        }
        text += decoder.decode();
        return JSON.parse(text);
      }
    } catch (error) {
      throw new OperationalFailure(
        safeFailure(
          error,
          'Private durable Blob transport failed; provider details suppressed.',
        ),
      );
    }
  };
  return {
    read: (key) => exchange(key, 'GET'),
    write: (key, value) => exchange(key, 'PUT', value, false),
    createOnly: (key, value) => exchange(key, 'PUT', value, true),
  };
}

export function validateBootstrapLocator(locator) {
  if (
    !locator ||
    Object.keys(locator).sort().join(',') !==
      'recoveryStorageAccountName,version' ||
    locator.version !== 1 ||
    !/^[a-z0-9]{3,24}$/.test(locator.recoveryStorageAccountName ?? '')
  )
    fail('Protected bootstrap locator is invalid.');
  return locator;
}
export async function withBootstrapAccess(
  { config, locator, token, signal },
  action,
) {
  validateBootstrapLocator(locator);
  const operations = await import('./azure-operations.mjs');
  const networkSettings = operations.configuredNetworkResources(
    config,
    {
      recovery_storage_account_name: locator.recoveryStorageAccountName,
      operation_storage_account_name: locator.recoveryStorageAccountName,
      operation_container_name: 'operations',
    },
    { resources: ['recoveryStorage'] },
  );
  const networkProvider = operations.createArmNetworkProvider({
    ...networkSettings,
    token: () => token('https://management.azure.com/'),
  });
  await networkProvider.readResource('recoveryStorage');
  const provider = operations.createRestProvider({
    account: locator.recoveryStorageAccountName,
    container: 'operations',
    environment: config.environment,
    token,
  });
  const response = await globalThis.fetch('https://api.ipify.org?format=json', {
    redirect: 'error',
    signal: signal
      ? globalThis.AbortSignal.any([
          signal,
          globalThis.AbortSignal.timeout(10000),
        ])
      : globalThis.AbortSignal.timeout(10000),
  });
  if (!response.ok) fail('Runner public address discovery failed.');
  const { ip } = await response.json();
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip ?? '') ||
    ip.split('.').some((value) => Number(value) > 255)
  )
    fail('Runner public address is invalid.');
  return operations.withAzureOperation(
    config,
    {
      provider,
      networkProvider,
      backendResources: [
        {
          id: 'recoveryStorage',
          baseline: config.operatorCidrs,
          cidr: `${ip}/32`,
          durationMs: 1800000,
        },
      ],
      operation: 'load-projections',
      durationMs: 1800000,
    },
    async (context) => {
      const store = createBlobJsonTransport({
        account: locator.recoveryStorageAccountName,
        container: 'bootstrap',
        token,
        signal: context.signal,
      });
      return action({ store, signal: context.signal });
    },
  );
}
export async function loadHostedProjections({
  config,
  locator,
  includeEnvironment = false,
  includeFoundation = true,
  token,
  signal,
}) {
  return withBootstrapAccess(
    { config, locator, token, signal },
    async ({ store }) => {
      const foundation = includeFoundation
        ? validateProjection(
            await store.read(`foundation/${config.environment}.json`),
            config,
            'foundation',
          )
        : undefined;
      if (
        foundation &&
        (foundation.recovery_storage_account_name !==
          locator.recoveryStorageAccountName ||
          foundation.operation_storage_account_name !==
            locator.recoveryStorageAccountName ||
          foundation.foundation_resource_group_name !==
            config.foundationBackend.resourceGroupName ||
          foundation.state_storage_account_name !==
            config.foundationBackend.storageAccountName ||
          foundation.state_container_name !==
            config.foundationBackend.containerName ||
          foundation.environment_state_container_name !==
            config.environmentBackend.containerName ||
          foundation.bootstrap_container_name !== 'bootstrap')
      )
        fail(
          'Durable foundation projection does not match protected locator/configuration.',
        );
      const outputs = includeEnvironment
        ? validateOperationalProjection(
            await store.read(
              `environment/${config.environment}/${config.generation}.json`,
            ),
            config,
          )
        : undefined;
      if (
        outputs &&
        (outputs.recovery_storage_account_name !==
          locator.recoveryStorageAccountName ||
          (foundation &&
            operationalRetainedKeys.some(
              (key) =>
                key !== 'vault_guard' &&
                JSON.stringify(outputs[key]) !==
                  JSON.stringify(foundation[key]),
            )))
      )
        fail(
          'Operational projection does not match foundation/locator context.',
        );
      if (outputs) {
        const ops = await import('./azure-operations.mjs');
        const network = ops.createArmNetworkProvider({
          ...ops.configuredNetworkResources(config, outputs, {
            resources: ['aks'],
          }),
          token: () => token('https://management.azure.com/'),
        });
        await network.readResource('aks');
      }
      const environment = outputs
        ? Object.fromEntries(
            environmentOutputKeys
              .filter((key) => Object.hasOwn(outputs, key))
              .map((key) => [key, outputs[key]]),
          )
        : undefined;
      if (environment) {
        environment.vault_guard_generation = generationGuardDelta(
          outputs.vault_guard,
        );
        if (
          foundation &&
          !isDeepStrictEqual(
            outputs.vault_guard,
            mergeGuardOutput(config, foundation, environment),
          )
        )
          fail(
            'Operational guard projection differs from retained and generation roots.',
          );
      }
      return {
        foundation,
        environment,
        outputs,
        locatorHash: operationOutputsHash(locator),
      };
    },
  );
}

export async function publishProjection({
  config,
  raw,
  scope,
  foundation,
  token,
  signal,
}) {
  const wrapper = createProjection(config, raw, scope);
  const store = createBlobJsonTransport({
    account: foundation.recovery_storage_account_name,
    container: 'bootstrap',
    token,
    signal,
  });
  const key =
    scope === 'foundation'
      ? `foundation/${config.environment}.json`
      : `environment/${config.environment}/${config.generation}.json`;
  await store.write(key, wrapper);
  return {
    phase: `${scope}-projection-published`,
    outputsHash: wrapper.outputsHash,
  };
}

export const environmentOutputKeys = [
  'workload_resource_group_name',
  'aks_cluster_name',
  'aks_resource_id',
  'aks_oidc_issuer_url',
  'acr_login_server',
  'workload_key_vault_name',
  'workload_key_vault_uri',
  'ingress_public_ip',
  'ingress_public_ip_resource_group_name',
  'persistent_api_cidrs',
  'workload_client_ids',
  'tenant_id',
];
export const operationalRetainedKeys = [
  'vault_guard',
  'recovery_key_id',
  'recovery_key_version',
  'recovery_storage_account_name',
  'recovery_container_name',
  'operation_storage_account_name',
  'operation_container_name',
  'bootstrap_container_name',
  'qualification_container_names',
  'qualification_challenge_container_name',
  'github_principal_ids',
  'tenant_id',
  'operator_group_object_id',
];
function generationGuardDelta(guard) {
  const bindings = guard.inspection_bindings.filter(
    (binding) =>
      binding.roleKey === 'permissions' &&
      binding.scope.startsWith(
        `${guard.scope_ids.workload}/providers/Microsoft.KeyVault/vaults/`,
      ),
  );
  return validateGuardGenerationOutput({
    current_activation_reference: guard.current_activation_reference,
    inspection_bindings: bindings,
  });
}
function mergeGuardOutput(config, foundation, environment) {
  const delta = validateGuardGenerationOutput(
    environment.vault_guard_generation,
  );
  const base = validateVaultGuardOutput(foundation.vault_guard);
  if (Object.hasOwn(base, 'current_activation_reference'))
    fail(
      'Foundation guard projection cannot contain generation activation context.',
    );
  const merged = validateVaultGuardOutput({
    ...base,
    ...delta,
    inspection_bindings: [
      ...base.inspection_bindings,
      ...delta.inspection_bindings,
    ],
  });
  validateGuardContext(
    merged,
    config,
    foundation.github_principal_ids,
    environment,
  );
  return merged;
}
function validateGuardContext(guard, config, principals, environment) {
  const vaultId = `/subscriptions/${config.subscriptionId}/resourceGroups/${environment.workload_resource_group_name}/providers/Microsoft.KeyVault/vaults/${new URL(environment.workload_key_vault_uri).hostname.split('.')[0]}`;
  const delta = generationGuardDelta(guard);
  if (
    guard.current_family_reference !== `current/${config.environment}.json` ||
    delta.current_activation_reference !==
      `current/${config.environment}/${config.generation}.json` ||
    Object.entries(guard.canary.role_assignments).some(
      ([actor, descriptor]) =>
        descriptor.properties.principalId !== principals[actor],
    ) ||
    delta.inspection_bindings.some((binding) => binding.scope !== vaultId)
  )
    fail(
      'Operational guard projection has foreign actors, vault or generation locator.',
    );
}
const asRaw = (selected) =>
  Object.fromEntries(
    Object.entries(selected).map(([key, value]) => [
      key,
      { value, sensitive: false },
    ]),
  );
export function validateOperationalProjection(wrapper, config) {
  const selected = validateProjection(wrapper, config, 'environment');
  const allowed = new Set([
    ...environmentOutputKeys,
    'projection_inputs',
    ...operationalRetainedKeys,
  ]);
  if (
    Object.keys(selected).some((key) => !allowed.has(key)) ||
    operationalRetainedKeys.some((key) => !Object.hasOwn(selected, key)) ||
    selected.tenant_id !== config.tenantId ||
    selected.operator_group_object_id !== config.operatorGroupObjectId ||
    selected.workload_resource_group_name !==
      `er-${config.environment}-workload` ||
    selected.aks_resource_id !==
      `/subscriptions/${config.subscriptionId}/resourceGroups/${selected.workload_resource_group_name}/providers/Microsoft.ContainerService/managedClusters/${selected.aks_cluster_name}` ||
    selected.operation_storage_account_name !==
      selected.recovery_storage_account_name ||
    selected.operation_container_name !== 'operations' ||
    selected.bootstrap_container_name !== 'bootstrap' ||
    selected.qualification_challenge_container_name !==
      'qualification-challenges'
  )
    fail(
      'Operational projection field scope or configured identity is invalid.',
    );
  const tuple = validateGeneratorInput(selected.projection_inputs);
  const guard = selected.vault_guard;
  validateGuardContext(guard, config, selected.github_principal_ids, selected);
  const prefix = `/subscriptions/${config.subscriptionId}`;
  const recoveryScope = `${prefix}/resourceGroups/${config.foundationBackend.resourceGroupName}`;
  const workloadScope = `${prefix}/resourceGroups/${selected.workload_resource_group_name}`;
  const recoveryName = new URL(selected.recovery_key_id).hostname.split('.')[0];
  if (
    !guard.definition_id.startsWith(
      `${prefix}/providers/Microsoft.Authorization/policyDefinitions/`,
    ) ||
    guard.scope_ids.recovery !== recoveryScope ||
    guard.scope_ids.workload !== workloadScope ||
    guard.recovery_vault_id !==
      `${recoveryScope}/providers/Microsoft.KeyVault/vaults/${recoveryName}` ||
    guard.evidence_storage_account_name !==
      selected.recovery_storage_account_name ||
    guard.producer_principal_ids.apply !==
      selected.github_principal_ids.apply ||
    ['recovery', 'workload'].some(
      (family) =>
        guard.parameters[family].expectedTenantId.value !== config.tenantId,
    )
  )
    fail(
      'Operational guard projection does not match configured resource or principal context.',
    );
  if (
    !isDeepStrictEqual(
      tuple.config,
      createGeneratorInput({
        config,
        foundation: tuple.foundation,
        environment: tuple.environment,
      }).config,
    ) ||
    tuple.foundation.operator_group_object_id !==
      config.operatorGroupObjectId ||
    !isDeepStrictEqual(tuple.foundation.github_principal_ids, {
      backup: selected.github_principal_ids.backup,
      restore: selected.github_principal_ids.restore,
    }) ||
    Object.entries(tuple.environment).some(
      ([key, value]) => !isDeepStrictEqual(value, selected[key]),
    )
  )
    fail(
      'Operational generator inputs do not match the configured output context.',
    );
  return selected;
}
export function createOperationalProjection(
  config,
  foundationRaw,
  environmentRaw,
) {
  const foundation = validateProjection(
    createProjection(config, foundationRaw, 'foundation'),
    config,
    'foundation',
  );
  const environment = validateProjection(
    createProjection(config, environmentRaw, 'environment'),
    config,
    'environment',
  );
  if (
    !foundation.approved_operator_object_ids?.includes(
      foundation.vault_guard?.producer_principal_ids.human,
    )
  )
    fail(
      'Operational guard human producer is not an approved foundation operator.',
    );
  if (
    Object.keys(environment).some(
      (key) =>
        !environmentOutputKeys.includes(key) &&
        key !== 'vault_guard_generation',
    )
  )
    fail('Environment root contains unsupported operational fields.');
  const selected = {
    projection_inputs: createGeneratorInput({
      config,
      foundation,
      environment,
    }),
    ...Object.fromEntries(
      operationalRetainedKeys.map((key) => [key, foundation[key]]),
    ),
    ...Object.fromEntries(
      Object.entries(environment).filter(
        ([key]) => key !== 'vault_guard_generation',
      ),
    ),
    vault_guard: mergeGuardOutput(config, foundation, environment),
  };
  const wrapper = createProjection(config, asRaw(selected), 'environment');
  validateOperationalProjection(wrapper, config);
  return wrapper;
}
export async function publishOperationalProjection({
  config,
  foundation,
  raw,
  token,
  signal,
}) {
  const wrapper = createOperationalProjection(config, asRaw(foundation), raw);
  const store = createBlobJsonTransport({
    account: foundation.recovery_storage_account_name,
    container: 'bootstrap',
    token,
    signal,
  });
  await store.write(
    `environment/${config.environment}/${config.generation}.json`,
    wrapper,
  );
  return {
    phase: 'environment-projection-published',
    outputsHash: wrapper.outputsHash,
  };
}
