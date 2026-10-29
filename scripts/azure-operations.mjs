import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setInterval, clearInterval } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { OperationalFailure, cleanupAll, safeFailure } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';
import { isIP } from 'node:net';

const fail = (message) => {
  throw new OperationalFailure(message);
};
const same = (left, right) =>
  [...left].sort().join(',') === [...right].sort().join(',');
const safe = (error, phase) =>
  error instanceof OperationalFailure
    ? error
    : new OperationalFailure(
        `${phase}: operation failed; private details suppressed.`,
      );

const ownerPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validCidr = (cidr) =>
  typeof cidr === 'string' &&
  cidr.endsWith('/32') &&
  isIP(cidr.slice(0, -3)) === 4;
const utc = (value) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const networkQueues = new WeakMap();

async function serializeNetwork(provider, action) {
  const previous = networkQueues.get(provider) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  networkQueues.set(provider, next);
  try {
    return await next;
  } finally {
    if (networkQueues.get(provider) === next) networkQueues.delete(provider);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function operationOutputsHash(outputs) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(outputs)))
    .digest('hex');
}

export function validateOperationSnapshot(snapshot, config, validateOutputs) {
  if (
    !snapshot ||
    Object.keys(snapshot).sort().join(',') !==
      'environment,generation,outputs,outputsHash,sourceRevision,subscriptionId,tenantId,version' ||
    snapshot.version !== 1 ||
    ['environment', 'generation', 'subscriptionId', 'tenantId'].some(
      (field) => snapshot[field] !== config[field],
    ) ||
    snapshot.sourceRevision !== config.gitRevision ||
    !/^[a-f0-9]{40}$/.test(snapshot.sourceRevision)
  )
    fail(
      'Operational cache snapshot does not match the recorded deployment identity or revision.',
    );
  const selected = validateOutputs(snapshot.outputs);
  if (snapshot.outputsHash !== operationOutputsHash(selected))
    fail('Operational cache snapshot selected output digest is invalid.');
  return selected;
}

function gateMetadata(record) {
  if (
    !record?.etag ||
    record.properties?.TXTRecords?.length !== 1 ||
    record.properties.TXTRecords[0].value?.length !== 1 ||
    record.properties.TXTRecords[0].value[0] !== 'reserved'
  )
    fail('DNS network gate record is missing or has an unowned TXT value.');
  const metadata = record.properties.metadata ?? {};
  if (
    Object.keys(metadata).length &&
    (Object.keys(metadata).sort().join(',') !==
      'equipmentExpires,equipmentHeartbeat,equipmentOwner' ||
      !ownerPattern.test(metadata.equipmentOwner) ||
      !utc(metadata.equipmentExpires) ||
      !utc(metadata.equipmentHeartbeat))
  )
    fail('DNS network gate ownership metadata is malformed.');
  return metadata;
}

export async function withDnsNetworkGate(
  provider,
  action,
  {
    now = Date.now,
    wait = delay,
    owner = randomUUID(),
    report = console.error,
  } = {},
) {
  let record = await provider.readGate();
  let metadata = gateMetadata(record);
  if (metadata.equipmentOwner) {
    if (Date.parse(metadata.equipmentExpires) > now())
      fail('DNS network gate is held by an active operation.');
    await wait(30000);
    record = await provider.readGate();
    metadata = gateMetadata(record);
    if (
      metadata.equipmentOwner &&
      Date.parse(metadata.equipmentExpires) > now()
    )
      fail('DNS network gate was renewed during expired-owner settling.');
  }
  const owned = {
    ...record,
    properties: {
      ...record.properties,
      metadata: {
        equipmentOwner: owner,
        equipmentExpires: new Date(now() + 90000).toISOString(),
        equipmentHeartbeat: new Date(now()).toISOString(),
      },
    },
  };
  try {
    await provider.writeGate(owned, record.etag);
  } catch {
    fail('DNS network gate conditional acquisition failed.');
  }
  let primary;
  let pending = Promise.resolve();
  let heartbeatFailure;
  async function assertOwner() {
    const actual = await provider.readGate();
    const actualMetadata = gateMetadata(actual);
    if (
      actualMetadata.equipmentOwner !== owner ||
      Date.parse(actualMetadata.equipmentExpires) <= now()
    )
      fail('DNS network gate ownership was lost.');
    return actual;
  }
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      try {
        const actual = await assertOwner();
        await provider.writeGate(
          {
            ...actual,
            properties: {
              ...actual.properties,
              metadata: {
                equipmentOwner: owner,
                equipmentExpires: new Date(now() + 90000).toISOString(),
                equipmentHeartbeat: new Date(now()).toISOString(),
              },
            },
          },
          actual.etag,
        );
      } catch {
        heartbeatFailure = new OperationalFailure(
          'DNS network gate heartbeat failed.',
        );
      }
    });
  }, 20000);
  timer.unref();
  try {
    const result = await action({ owner, assertOwner });
    await pending;
    if (heartbeatFailure) throw heartbeatFailure;
    await assertOwner();
    return result;
  } catch (error) {
    primary = safe(error, 'DNS network gate');
  } finally {
    clearInterval(timer);
    await pending;
    if (primary?.uncertainNetworkWrite)
      await cleanupAll([], { primary, report });
    await cleanupAll(
      [
        {
          operation: 'DNS network gate release',
          tool: 'Azure DNS',
          run: async () => {
            const actual = await assertOwner();
            await provider.writeGate(
              { ...actual, properties: { ...actual.properties, metadata: {} } },
              actual.etag,
            );
          },
        },
      ],
      { primary, report },
    );
  }
}

function admissionInventory(resource) {
  const admissions = [];
  for (const [tag, value] of Object.entries(resource.tags ?? {})) {
    if (!tag.startsWith('equipment-admission-')) continue;
    if (!ownerPattern.test(tag.slice('equipment-admission-'.length)))
      fail('Malformed network admission owner tag.');
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      fail('Malformed network admission tag JSON.');
    }
    if (
      !parsed ||
      Object.keys(parsed).sort().join(',') !== 'cidr,expires' ||
      !validCidr(parsed.cidr) ||
      !utc(parsed.expires)
    )
      fail('Malformed network admission tag schema.');
    admissions.push({ tag, ...parsed });
  }
  if (admissions.length > 10) fail('Network admission tag capacity exceeded.');
  return admissions;
}

export async function updateNetworkAdmissions(provider, settings) {
  const {
    id,
    baseline,
    owner,
    cidr,
    expires,
    remove = false,
    reap = false,
    now = Date.now(),
    report = console.error,
  } = settings;
  if (
    !Array.isArray(baseline) ||
    !baseline.length ||
    (!reap && !ownerPattern.test(owner)) ||
    (!reap &&
      !remove &&
      (!validCidr(cidr) ||
        !utc(expires) ||
        Date.parse(expires) <= now ||
        Date.parse(expires) - now > 1800000))
  )
    fail('Network admission request is invalid.');
  return serializeNetwork(provider, () =>
    withDnsNetworkGate(
      provider,
      async (gate) => {
        const resource = await provider.readResource(id);
        const admissions = admissionInventory(resource);
        if (
          !same(resource.ranges, [
            ...new Set([...baseline, ...admissions.map((item) => item.cidr)]),
          ])
        )
          fail('Unexplained network baseline drift blocks admission.');
        const tags = { ...resource.tags };
        for (const admission of admissions)
          if (
            Date.parse(admission.expires) <= now ||
            (remove && admission.tag === `equipment-admission-${owner}`)
          )
            delete tags[admission.tag];
        if (!reap && !remove && !baseline.includes(cidr))
          tags[`equipment-admission-${owner}`] = JSON.stringify({
            cidr,
            expires,
          });
        const nextAdmissions = admissionInventory({ tags });
        const ranges = [
          ...new Set([...baseline, ...nextAdmissions.map((item) => item.cidr)]),
        ];
        if (
          same(resource.ranges, ranges) &&
          JSON.stringify(Object.entries(resource.tags).sort()) ===
            JSON.stringify(Object.entries(tags).sort())
        )
          return { owner, cidr, expires };
        await gate.assertOwner();
        await provider.writeResource(id, { ...resource, tags, ranges });
        const actual = await provider.readResource(id);
        if (
          !same(actual.ranges, ranges) ||
          JSON.stringify(Object.entries(actual.tags).sort()) !==
            JSON.stringify(Object.entries(tags).sort())
        )
          fail('Network admission update verification failed.');
        return { owner, cidr, expires };
      },
      { report },
    ),
  );
}

export async function reapNetworkAdmissions(
  provider,
  resources,
  baseline,
  report = console.error,
) {
  await cleanupAll(
    resources.map((id) => ({
      operation: 'expired network admission reconciliation',
      tool: 'Azure ARM',
      run: () =>
        updateNetworkAdmissions(provider, {
          id,
          baseline: Array.isArray(baseline) ? baseline : baseline[id],
          reap: true,
        }),
    })),
    { report },
  );
}

export async function withBackendAccess(provider, settings, action) {
  const owner = randomUUID();
  const now = settings.now ?? Date.now;
  const durationMs = settings.durationMs ?? 3600000;
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 7200000
  )
    fail('Backend operation budget is invalid.');
  const deadline = now() + durationMs;
  const expires = new Date(Math.min(deadline, now() + 1800000)).toISOString();
  const admission = { ...settings, now: now(), owner, expires };
  await updateNetworkAdmissions(provider, admission);
  let primary;
  let cleaned = false;
  let renewalFailure;
  let pending = Promise.resolve();
  const controller = new globalThis.AbortController();
  async function renew() {
    if (now() >= deadline) fail('Backend operation budget expired.');
    await updateNetworkAdmissions(provider, {
      ...admission,
      now: now(),
      expires: new Date(Math.min(deadline, now() + 1800000)).toISOString(),
    });
  }
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      try {
        if (!cleaned) await renew();
      } catch {
        renewalFailure = new OperationalFailure(
          'Backend admission renewal failed.',
        );
        controller.abort();
      }
    });
  }, 300000);
  timer.unref();
  async function cleanup() {
    if (cleaned) return;
    clearInterval(timer);
    await pending;
    await updateNetworkAdmissions(provider, {
      ...admission,
      now: now(),
      remove: true,
    });
    cleaned = true;
  }
  try {
    const result = await action({
      owner,
      cleanup,
      renew,
      signal: controller.signal,
      verify: async () => {
        if (renewalFailure) throw renewalFailure;
        const resource = await provider.readResource(settings.id);
        const own = admissionInventory(resource).find(
          (item) => item.tag === `equipment-admission-${owner}`,
        );
        if (
          !settings.baseline.includes(settings.cidr) &&
          (!own ||
            own.cidr !== settings.cidr ||
            Date.parse(own.expires) <= now())
        )
          fail('Backend admission expired before Blob acquisition completed.');
        if (!resource.ranges.includes(settings.cidr))
          fail('Backend runner admission is not effective.');
      },
    });
    if (renewalFailure) throw renewalFailure;
    return result;
  } catch (error) {
    primary = safe(error, 'backend admission operation');
  } finally {
    await cleanupAll(
      [
        {
          operation: 'backend admission cleanup',
          tool: 'Azure network',
          run: cleanup,
        },
      ],
      { primary, report: settings.report ?? console.error },
    );
  }
}

export async function withAzureOperation(config, settings, action) {
  const resources = settings.backendResources ?? [settings.backend];
  if (
    !resources.length ||
    resources.length > 4 ||
    resources.some((resource) => !resource)
  )
    fail('Explicit retained backend resource admissions are required.');
  async function admit(index, accesses) {
    if (index < resources.length)
      return withBackendAccess(
        settings.networkProvider,
        resources[index],
        (access) => admit(index + 1, [...accesses, access]),
      );
    return withOperationLease(config, settings, async (context) => {
      let primary;
      try {
        for (const access of accesses) await access.verify();
        return await action({
          ...context,
          signal: globalThis.AbortSignal.any([
            context.signal,
            ...accesses.map((access) => access.signal),
          ]),
        });
      } catch (error) {
        primary = safe(error, settings.operation);
      } finally {
        await cleanupAll(
          accesses.map((access) => ({
            operation: 'owned backend admission removal',
            tool: 'Azure network',
            run: access.cleanup,
          })),
          { primary, report: settings.report ?? console.error },
        );
      }
    });
  }
  return admit(0, []);
}

export function createArmNetworkProvider({
  gateId,
  resources,
  token,
  fetch = globalThis.fetch,
  origin = 'https://management.azure.com',
}) {
  if (
    !/^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[a-zA-Z0-9._()-]+\/providers\/Microsoft.Network\/dnsZones\/codingfunlab\.com\/TXT\/_azure-network-lease$/.test(
      gateId,
    )
  )
    fail('Configured DNS gate resource ID is invalid.');
  const versions = {
    storage: '2025-06-01',
    vault: '2024-11-01',
    aks: '2025-07-01',
  };
  const types = {
    storage: 'Microsoft.Storage/storageAccounts',
    vault: 'Microsoft.KeyVault/vaults',
    aks: 'Microsoft.ContainerService/managedClusters',
  };
  for (const resource of Object.values(resources))
    if (
      !versions[resource.kind] ||
      !resource.id?.startsWith(
        gateId.slice(0, gateId.indexOf('/resourceGroups/')),
      ) ||
      !resource.id.includes(`/providers/${types[resource.kind]}/`)
    )
      fail('Configured network resource is invalid.');
  async function request(id, version, method = 'GET', body, headers = {}) {
    let response;
    try {
      response = await fetch(`${origin}${id}?api-version=${version}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: globalThis.AbortSignal.timeout(30000),
      });
    } catch {
      const error = new OperationalFailure(
        `Azure network ${method === 'GET' ? 'read' : 'write completion is uncertain'}; transport or timeout.`,
      );
      error.uncertainNetworkWrite = method !== 'GET';
      throw error;
    }
    if (!response.ok)
      fail(`Azure network request failed; status=${response.status}.`);
    if (response.status === 202) {
      const statusUrl =
        response.headers.get('azure-asyncoperation') ??
        response.headers.get('location');
      if (!statusUrl || !statusUrl.startsWith(`${origin}/subscriptions/`)) {
        const error = new OperationalFailure(
          'Azure network write completion is uncertain; asynchronous status missing.',
        );
        error.uncertainNetworkWrite = true;
        throw error;
      }
      const until = Date.now() + 120000;
      while (Date.now() < until) {
        let result;
        try {
          result = await fetch(statusUrl, {
            headers: { Authorization: `Bearer ${await token()}` },
            signal: globalThis.AbortSignal.timeout(30000),
          });
        } catch {
          break;
        }
        if (!result.ok) break;
        const status = await result.json();
        if (status.status === 'Succeeded') return null;
        if (['Failed', 'Canceled'].includes(status.status))
          fail('Azure asynchronous network update failed.');
        await delay(2000);
      }
      const error = new OperationalFailure(
        'Azure network write completion is uncertain; asynchronous wait exceeded.',
      );
      error.uncertainNetworkWrite = true;
      throw error;
    }
    return response.json();
  }
  function configured(name) {
    const value = resources[name];
    if (!value) fail('Network operation is not configured for this resource.');
    return value;
  }
  return {
    async readGate() {
      return request(gateId, '2018-05-01');
    },
    async writeGate(record, etag) {
      return request(
        gateId,
        '2018-05-01',
        'PUT',
        { properties: record.properties },
        { 'If-Match': etag },
      );
    },
    async readResource(name) {
      const resource = configured(name);
      const raw = await request(resource.id, versions[resource.kind]);
      if (
        resource.expectedTags &&
        Object.entries(resource.expectedTags).some(
          ([key, value]) => raw.tags?.[key] !== value,
        )
      )
        fail(
          'Configured network resource ownership tags do not match this deployment.',
        );
      const rules =
        resource.kind === 'aks'
          ? raw.properties?.apiServerAccessProfile?.authorizedIPRanges
          : raw.properties?.networkAcls?.ipRules?.map((entry) => entry.value);
      if (!Array.isArray(rules))
        fail('Azure network rule response is invalid.');
      return {
        tags: raw.tags ?? {},
        ranges: rules.map((value) =>
          value.includes('/') ? value : `${value}/32`,
        ),
        raw,
        kind: resource.kind,
      };
    },
    async writeResource(name, value) {
      const resource = configured(name);
      let body;
      if (resource.kind === 'aks') {
        if (!value.raw.etag) fail('AKS network update requires a fresh ETag.');
        body = {
          location: value.raw.location,
          identity: value.raw.identity,
          sku: value.raw.sku,
          tags: value.tags,
          properties: {
            ...value.raw.properties,
            apiServerAccessProfile: {
              ...value.raw.properties.apiServerAccessProfile,
              authorizedIPRanges: value.ranges,
            },
          },
        };
      } else
        body = {
          tags: value.tags,
          properties: {
            networkAcls: {
              ...value.raw.properties.networkAcls,
              ipRules: value.ranges.map((cidr) => ({
                value: cidr.endsWith('/32') ? cidr.slice(0, -3) : cidr,
                ...(resource.kind === 'storage' ? { action: 'Allow' } : {}),
              })),
            },
          },
        };
      await request(
        resource.id,
        versions[resource.kind],
        resource.kind === 'aks' ? 'PUT' : 'PATCH',
        body,
        resource.kind === 'aks' ? { 'If-Match': value.raw.etag } : {},
      );
      const until = Date.now() + 120000;
      do {
        const current = await this.readResource(name);
        if (
          same(current.ranges, value.ranges) &&
          JSON.stringify(Object.entries(current.tags).sort()) ===
            JSON.stringify(Object.entries(value.tags).sort())
        )
          return;
        await delay(2000);
      } while (Date.now() < until);
      const error = new OperationalFailure(
        'Azure network update propagation is uncertain.',
      );
      error.uncertainNetworkWrite = true;
      throw error;
    },
  };
}

export function configuredNetworkResources(config, outputs, options = {}) {
  const names =
    options.resources ??
    (options.retainedOnly
      ? ['state', 'recoveryStorage', 'recoveryVault']
      : ['state', 'recoveryStorage', 'recoveryVault', 'workloadVault', 'aks']);
  const prefix =
    '/subscriptions/' +
    config.subscriptionId +
    '/resourceGroups/' +
    config.foundationBackend.resourceGroupName +
    '/providers/';
  const retainedTags = {
    application: 'equipment-reservations',
    environment: config.environment,
  };
  const workloadTags = { ...retainedTags, generation: config.generation };
  const resources = {};
  function vaultName(uri) {
    try {
      const url = new URL(uri);
      if (
        url.protocol !== 'https:' ||
        !/^[a-zA-Z0-9-]{3,24}\.vault\.azure\.net$/.test(url.hostname)
      )
        fail('Configured vault URI is invalid.');
      return url.hostname.replace('.vault.azure.net', '');
    } catch {
      fail('Configured vault output is missing or invalid.');
    }
  }
  for (const name of names) {
    let resource;
    if (name === 'state')
      resource = {
        id:
          prefix +
          'Microsoft.Storage/storageAccounts/' +
          config.foundationBackend.storageAccountName,
        kind: 'storage',
        expectedTags: retainedTags,
      };
    else if (name === 'recoveryStorage') {
      if (
        !/^[a-z0-9]{3,24}$/.test(outputs.recovery_storage_account_name) ||
        outputs.operation_storage_account_name !==
          outputs.recovery_storage_account_name ||
        outputs.operation_container_name !== 'operations'
      )
        fail('Operational recovery storage output scope is invalid.');
      resource = {
        id:
          prefix +
          'Microsoft.Storage/storageAccounts/' +
          outputs.recovery_storage_account_name,
        kind: 'storage',
        expectedTags: retainedTags,
      };
    } else if (name === 'recoveryVault')
      resource = {
        id:
          prefix +
          'Microsoft.KeyVault/vaults/' +
          vaultName(outputs.recovery_key_id),
        kind: 'vault',
        expectedTags: retainedTags,
      };
    else if (['workloadVault', 'aks'].includes(name)) {
      if (
        outputs.workload_resource_group_name !==
        'er-' + config.environment + '-workload'
      )
        fail('Workload resource group output is outside the configured scope.');
      const workloadPrefix =
        '/subscriptions/' +
        config.subscriptionId +
        '/resourceGroups/' +
        outputs.workload_resource_group_name +
        '/providers/';
      if (name === 'workloadVault')
        resource = {
          id:
            workloadPrefix +
            'Microsoft.KeyVault/vaults/' +
            vaultName(outputs.workload_key_vault_uri),
          kind: 'vault',
          expectedTags: workloadTags,
        };
      else {
        if (
          typeof outputs.aks_resource_id !== 'string' ||
          !outputs.aks_resource_id.startsWith(
            workloadPrefix + 'Microsoft.ContainerService/managedClusters/',
          ) ||
          !Array.isArray(outputs.persistent_api_cidrs) ||
          config.operatorCidrs.some(
            (cidr) => !outputs.persistent_api_cidrs.includes(cidr),
          )
        )
          fail('AKS persistent baseline or resource scope output is invalid.');
        resource = {
          id: outputs.aks_resource_id,
          kind: 'aks',
          expectedTags: workloadTags,
          baseline: outputs.persistent_api_cidrs,
        };
      }
    } else fail('Unsupported configured network resource selection.');
    resources[name] = { baseline: config.operatorCidrs, ...resource };
  }
  return {
    gateId:
      prefix +
      'Microsoft.Network/dnsZones/' +
      config.domain +
      '/TXT/_azure-network-lease',
    resources,
  };
}

async function loadOperationalContext(
  { configPath, outputsPath },
  resourceNames,
  { azureTokenProcess } = {},
) {
  const { loadAzureConfig, validateTerraformOutputs, runPrivateProcess } =
    await import('./azure-infrastructure.mjs');
  const config = loadAzureConfig(configPath);
  let outputs;
  try {
    assertPrivatePath(resolve(outputsPath), 0o600);
    outputs = validateOperationSnapshot(
      JSON.parse(readFileSync(outputsPath, 'utf8')),
      config,
      validateTerraformOutputs,
    );
  } catch {
    fail('Private operational output snapshot is missing or invalid.');
  }
  const all = configuredNetworkResources(config, outputs, {
    resources: resourceNames,
  });
  const resources = Object.fromEntries(
    resourceNames.map((name) => {
      if (!all.resources[name])
        fail('Operational resource scope is unsupported.');
      return [name, all.resources[name]];
    }),
  );
  const tokens = new Map();
  async function token(resource) {
    if (
      ![
        'https://management.azure.com/',
        'https://storage.azure.com/',
        'https://vault.azure.net',
      ].includes(resource)
    )
      fail('Unsupported operational Azure token audience.');
    let cached = tokens.get(resource);
    if (!cached || cached.expires < Date.now() + 60000) {
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
      const raw = await runPrivateProcess(
        azureTokenProcess?.command ??
          (process.platform === 'win32' ? 'cmd.exe' : 'az'),
        azureTokenProcess
          ? [...azureTokenProcess.prefix, ...args]
          : process.platform === 'win32'
            ? [
                '/d',
                '/s',
                '/c',
                `az ${args.map((arg) => `"${arg}"`).join(' ')}`,
              ]
            : args,
        {
          operation: 'Azure operational token acquisition',
          tool: 'az',
          timeout: 30000,
        },
      );
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        fail('Operational token response is invalid.');
      }
      if (typeof value.accessToken !== 'string' || !value.accessToken)
        fail('Operational token response is missing access token.');
      cached = { token: value.accessToken, expires: Date.now() + 1200000 };
      tokens.set(resource, cached);
    }
    return cached.token;
  }
  const networkProvider = createArmNetworkProvider({
    gateId: all.gateId,
    resources,
    token: () => token('https://management.azure.com/'),
  });
  const provider = createRestProvider({
    account: outputs.operation_storage_account_name,
    container: outputs.operation_container_name,
    environment: config.environment,
    clusterId: outputs.aks_resource_id,
    token,
  });
  let cidr;
  try {
    const response = await globalThis.fetch(
      'https://api.ipify.org?format=json',
      { signal: globalThis.AbortSignal.timeout(10000) },
    );
    if (!response.ok) fail('Runner address discovery failed.');
    cidr = `${(await response.json()).ip}/32`;
    if (!validCidr(cidr)) fail('Runner address is not IPv4.');
  } catch {
    fail('Operational runner IPv4 discovery failed before admission.');
  }
  return { config, outputs, provider, networkProvider, cidr, token };
}

export async function withRegistryPublication(paths, action, boundaries) {
  const context = await loadOperationalContext(
    paths,
    ['recoveryStorage'],
    boundaries,
  );
  const { config, provider, networkProvider, cidr, outputs } = context;
  return withAzureOperation(
    config,
    {
      provider,
      networkProvider,
      operation: 'registry-publication',
      durationMs: 1200000,
      backendResources: [
        {
          id: 'recoveryStorage',
          baseline: config.operatorCidrs,
          cidr,
          durationMs: 1200000,
        },
      ],
    },
    async ({ signal }) => action({ signal, outputs }),
  );
}

export async function withQualificationOperation(
  { config, outputs, token, cidr },
  actor,
  action,
) {
  if (
    !['backup', 'restore'].includes(actor) ||
    !validCidr(cidr) ||
    typeof action !== 'function'
  )
    fail('Qualification operation input is invalid.');
  const settings = configuredNetworkResources(config, outputs, {
    resources: ['recoveryStorage', 'aks'],
  });
  const networkProvider = createArmNetworkProvider({
    ...settings,
    token: () => token('https://management.azure.com/'),
  });
  const provider = createRestProvider({
    account: outputs.operation_storage_account_name,
    container: outputs.operation_container_name,
    environment: config.environment,
    clusterId: outputs.aks_resource_id,
    token,
  });
  return withAzureOperation(
    config,
    {
      provider,
      networkProvider,
      operation: `qualification-${actor}`,
      durationMs: 1200000,
      backendResources: [
        {
          id: 'recoveryStorage',
          baseline: config.operatorCidrs,
          cidr,
          durationMs: 1200000,
        },
      ],
    },
    async (operation) => {
      await networkProvider.readResource('aks');
      const cluster = await provider.cluster();
      if (
        cluster.properties?.powerState?.code !== 'Running' ||
        cluster.properties?.provisioningState !== 'Succeeded'
      )
        fail(
          'Qualification requires settled running AKS; it never starts a cluster.',
        );
      return withBackendAccess(
        networkProvider,
        {
          id: 'aks',
          baseline: outputs.persistent_api_cidrs,
          cidr,
          durationMs: 1200000,
        },
        async (access) =>
          action({
            ...operation,
            signal: globalThis.AbortSignal.any([
              operation.signal,
              access.signal,
            ]),
          }),
      );
    },
  );
}

export function safetyStopDue(now, override) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) fail('Invalid safety-stop time.');
  if (override) {
    const issued = Date.parse(override.issued);
    const expires = Date.parse(override.expires);
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      expires <= issued ||
      expires - issued > 86400000 ||
      issued > instant ||
      typeof override.actor !== 'string' ||
      !override.actor ||
      typeof override.reason !== 'string' ||
      !override.reason
    )
      fail(
        'Safety-stop override is missing or exceeds its twenty-four-hour bound.',
      );
    if (expires > instant) return false;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
  return Number(parts) >= 23;
}

export async function runLifecycle(
  provider,
  action,
  {
    lastStop,
    readiness,
    wait = delay,
    now = Date.now,
    signal,
    timeoutMs = action === 'start' ? 2700000 : 1800000,
  } = {},
) {
  if (!['start', 'stop'].includes(action))
    fail('Unsupported lifecycle action.');
  const started = now();
  const desired = action === 'start' ? 'Running' : 'Stopped';
  let state = await provider.cluster();
  if (state.properties?.provisioningState !== 'Succeeded')
    fail('AKS provider transition prerequisite failed or is unsettled.');
  if (action === 'start' && state.properties?.powerState?.code !== 'Running') {
    const stopped = Date.parse(lastStop);
    if (!Number.isFinite(stopped))
      fail('Recorded stop time is required for the AKS settling interval.');
    const remaining = stopped + 1800000 - now();
    if (remaining > 0) await wait(remaining, undefined, { signal });
  }
  if (state.properties?.powerState?.code !== desired) {
    await provider.transition(action);
    while (now() - started < timeoutMs) {
      if (signal?.aborted)
        fail('AKS transition cancelled after lost operation lease.');
      state = await provider.cluster();
      if (state.properties?.provisioningState === 'Failed')
        fail('AKS provider transition failed.');
      if (
        state.properties?.powerState?.code === desired &&
        state.properties?.provisioningState === 'Succeeded'
      )
        break;
      if (now() - started >= timeoutMs)
        fail('AKS provider transition timed out.');
      await wait(10000, undefined, { signal });
    }
    if (
      state.properties?.powerState?.code !== desired ||
      state.properties?.provisioningState !== 'Succeeded'
    )
      fail('AKS provider transition timed out.');
  }
  if (action === 'start') {
    if (typeof readiness !== 'function')
      fail('Startup readiness verification is required.');
    const result = await readiness();
    if (
      [
        'certificates',
        'secrets',
        'login',
        'persistence',
        'messaging',
        'deployed',
        'history',
      ].some((key) => result?.[key] !== true)
    )
      fail('Startup readiness verification is incomplete or failed.');
  }
  return { state: desired, elapsedMs: now() - started };
}

export async function withOperationLease(config, options, action) {
  const { provider, operation, report = console.error } = options;
  const durationMs = options.durationMs ?? 3600000;
  if (
    !provider ||
    !/^[a-z][a-z-]{1,30}$/.test(operation) ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 7200000
  )
    fail('Invalid operation lease request.');
  const leaseId = randomUUID();
  try {
    await provider.acquire(leaseId, 60);
  } catch {
    fail(
      'Global operation lease acquire failed; concurrent work or provider failure.',
    );
  }
  let primary;
  let renewalFailure;
  let pending = Promise.resolve();
  const expires = Date.now() + durationMs;
  const controller = new globalThis.AbortController();
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      if (renewalFailure) return;
      try {
        if (Date.now() >= expires) fail('Operation lease budget expired.');
        await provider.renew(leaseId);
      } catch {
        renewalFailure = new OperationalFailure(
          'Global operation lease heartbeat failed.',
        );
        controller.abort();
      }
    });
  }, 20000);
  timer.unref();
  try {
    const previous = await provider.readRecord();
    await provider.writeRecord(
      {
        ...previous,
        environment: config.environment,
        operation,
        revision: config.gitRevision,
        owner: leaseId,
        issued: new Date().toISOString(),
        expires: new Date(expires).toISOString(),
      },
      leaseId,
    );
    const result = await action({
      signal: controller.signal,
      leaseId,
      provider,
    });
    await pending;
    if (renewalFailure) throw renewalFailure;
    if (Date.now() >= expires) fail('Operation lease budget expired.');
    return result;
  } catch (error) {
    primary = safe(error, operation);
  } finally {
    clearInterval(timer);
    await pending;
    await cleanupAll(
      [
        {
          operation: 'global lease release',
          tool: 'Azure Blob',
          run: () => provider.release(leaseId),
        },
      ],
      { primary, report },
    );
  }
}

export async function assertAzureOperationLease({
  config,
  outputs,
  token,
  operation,
  allowedOperations,
  request,
}) {
  if (
    !ownerPattern.test(operation?.leaseId ?? '') ||
    operation.signal?.aborted ||
    typeof token !== 'function' ||
    !Array.isArray(allowedOperations) ||
    !allowedOperations.length ||
    allowedOperations.some((value) => !/^[a-z][a-z-]{1,30}$/.test(value)) ||
    !/^[a-z0-9]{3,24}$/.test(outputs?.operation_storage_account_name ?? '') ||
    outputs.operation_storage_account_name !==
      outputs.recovery_storage_account_name ||
    outputs.operation_container_name !== 'operations'
  )
    fail('Actual operation lease scope or handle is invalid.');
  const provider = createRestProvider({
    account: outputs.operation_storage_account_name,
    container: 'operations',
    environment: config.environment,
    token,
    ...(request ? { fetch: request } : {}),
  });
  const record = await provider.readRecord();
  const now = Date.now();
  if (
    record.owner !== operation.leaseId ||
    record.environment !== config.environment ||
    record.revision !== config.gitRevision ||
    !allowedOperations.includes(record.operation) ||
    !utc(record.issued) ||
    !utc(record.expires) ||
    Date.parse(record.issued) > now ||
    Date.parse(record.expires) <= now ||
    Date.parse(record.expires) - Date.parse(record.issued) > 7200000
  )
    fail('Actual operation lease ownership, phase or lifetime does not match.');
  await provider.renew(operation.leaseId);
  operation.signal?.throwIfAborted();
  return Object.freeze({
    owner: operation.leaseId,
    nonce: operation.leaseId,
    expires: record.expires,
    operation: record.operation,
  });
}

export function createRestProvider({
  account,
  container = 'operations',
  environment,
  clusterId,
  token,
  fetch = globalThis.fetch,
  blobOrigin = `https://${account}.blob.core.windows.net`,
  armOrigin = 'https://management.azure.com',
}) {
  let lease;
  const blob = `${blobOrigin}/${container}/operations/${environment}.json`;
  const cluster = `${armOrigin}${clusterId}?api-version=2025-07-01`;
  async function request(url, method, headers = {}, body) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await token(url.startsWith(blobOrigin) ? 'https://storage.azure.com/' : 'https://management.azure.com/')}`,
          'x-ms-version': '2023-11-03',
          'x-ms-date': new Date().toUTCString(),
          ...headers,
        },
        body,
        signal: globalThis.AbortSignal.timeout(30000),
      });
    } catch {
      fail('Azure operational request failed; transport or timeout.');
    }
    if (!response.ok) {
      const error = new OperationalFailure(
        `Azure operational request failed; status=${response.status}.`,
      );
      error.httpStatus = response.status;
      error.blobAlreadyExists =
        response.headers.get('x-ms-error-code') === 'BlobAlreadyExists';
      throw error;
    }
    return response;
  }
  return {
    async acquire(id, seconds) {
      try {
        await request(
          blob,
          'PUT',
          { 'x-ms-blob-type': 'BlockBlob', 'If-None-Match': '*' },
          '{}',
        );
      } catch (error) {
        if (
          !error.message.endsWith('status=412.') &&
          !(error.httpStatus === 409 && error.blobAlreadyExists === true)
        )
          throw error;
      }
      await request(`${blob}?comp=lease`, 'PUT', {
        'x-ms-lease-action': 'acquire',
        'x-ms-lease-duration': String(seconds),
        'x-ms-proposed-lease-id': id,
      });
      lease = id;
    },
    async renew(id) {
      await request(`${blob}?comp=lease`, 'PUT', {
        'x-ms-lease-action': 'renew',
        'x-ms-lease-id': id,
      });
    },
    async release(id) {
      await request(`${blob}?comp=lease`, 'PUT', {
        'x-ms-lease-action': 'release',
        'x-ms-lease-id': id,
      });
      lease = undefined;
    },
    async readRecord() {
      return (await request(blob, 'GET')).json();
    },
    async writeRecord(record) {
      await request(
        blob,
        'PUT',
        {
          'x-ms-blob-type': 'BlockBlob',
          ...(lease ? { 'x-ms-lease-id': lease } : {}),
        },
        JSON.stringify(record),
      );
    },
    async cluster() {
      return (await request(cluster, 'GET')).json();
    },
    async transition(action) {
      if (!['start', 'stop'].includes(action))
        fail('Unsupported AKS transition.');
      await request(
        `${armOrigin}${clusterId}/${action}?api-version=2025-07-01`,
        'POST',
      );
    },
    async ranges() {
      const value = await this.cluster();
      const ranges =
        value.properties?.apiServerAccessProfile?.authorizedIPRanges;
      if (!Array.isArray(ranges)) fail('AKS API baseline response is invalid.');
      return ranges;
    },
  };
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (!['start', 'stop', 'reaper', 'safety-stop'].includes(action))
    fail('Unsupported Azure operation.');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (
      !(
        action === 'start'
          ? ['--config', '--outputs', '--state', '--kubeconfig']
          : ['--config', '--outputs']
      ).includes(flag) ||
      !args[index + 1] ||
      options[flag]
    )
      fail('Azure operation requires --config PATH --outputs PATH.');
    options[flag] = args[index + 1];
  }
  if (action === 'start') {
    const { validateAzureReadinessInputs } =
      await import('./azure-readiness.mjs');
    validateAzureReadinessInputs({
      stateDirectory: options['--state'],
      kubeconfig: options['--kubeconfig'],
      operation: 'start',
    });
  }
  const { loadAzureConfig, validateTerraformOutputs, runPrivateProcess } =
    await import('./azure-infrastructure.mjs');
  const config = loadAzureConfig(options['--config']);
  let outputs;
  try {
    assertPrivatePath(resolve(options['--outputs']), 0o600);
    outputs = validateOperationSnapshot(
      JSON.parse(readFileSync(options['--outputs'], 'utf8')),
      config,
      validateTerraformOutputs,
    );
  } catch {
    fail('Private Terraform output projection is missing or invalid.');
  }
  const clusterId = outputs.aks_resource_id;
  if (
    typeof clusterId !== 'string' ||
    !clusterId.startsWith(
      `/subscriptions/${config.subscriptionId}/resourceGroups/`,
    ) ||
    !/^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[a-zA-Z0-9._()-]+\/providers\/Microsoft.ContainerService\/managedClusters\/[a-zA-Z0-9_-]+$/.test(
      clusterId,
    )
  )
    fail('AKS resource output does not match the configured subscription.');
  const tokens = new Map();
  async function token(resource) {
    let cached = tokens.get(resource);
    if (!cached || cached.expires < Date.now() + 60000) {
      const result = JSON.parse(
        await runPrivateProcess(
          process.env.AZURE_CLI ?? 'az',
          [
            'account',
            'get-access-token',
            '--resource',
            resource,
            '--subscription',
            config.subscriptionId,
            '--output',
            'json',
            '--only-show-errors',
          ],
          {
            tool: 'azure',
            operation: 'Azure operations private token',
            timeout: 30000,
          },
        ),
      );
      if (typeof result.accessToken !== 'string' || !result.accessToken)
        fail('Azure access token acquisition failed.');
      cached = { token: result.accessToken, expires: Date.now() + 1200000 };
      tokens.set(resource, cached);
    }
    return cached.token;
  }
  const networkSettings = configuredNetworkResources(config, outputs);
  const network = createArmNetworkProvider({
    ...networkSettings,
    token: () => token('https://management.azure.com/'),
  });
  if (action === 'reaper') {
    await reapNetworkAdmissions(
      network,
      Object.keys(networkSettings.resources),
      Object.fromEntries(
        Object.entries(networkSettings.resources).map(([name, resource]) => [
          name,
          resource.baseline,
        ]),
      ),
    );
    console.log('admission reaper: configured ARM baselines verified');
    return;
  }
  const provider = createRestProvider({
    account: outputs.operation_storage_account_name,
    container: outputs.operation_container_name,
    environment: config.environment,
    clusterId,
    token,
  });
  let runnerCidr;
  try {
    const response = await globalThis.fetch(
      'https://api.ipify.org?format=json',
      { signal: globalThis.AbortSignal.timeout(10000) },
    );
    if (!response.ok) fail('Runner address discovery failed.');
    const value = await response.json();
    runnerCidr = `${value.ip}/32`;
    if (!validCidr(runnerCidr))
      fail('Runner address discovery returned invalid IPv4.');
  } catch {
    fail(
      'Trusted runner public IPv4 discovery failed; no admission attempted.',
    );
  }
  await withAzureOperation(
    config,
    {
      provider,
      operation: action,
      networkProvider: network,
      backendResources: [
        {
          id: 'recoveryStorage',
          baseline: config.operatorCidrs,
          cidr: runnerCidr,
          durationMs: action === 'start' ? 5400000 : 2400000,
        },
      ],
      durationMs: action === 'start' ? 5400000 : 2400000,
    },
    async ({ signal }) => {
      await network.readResource('aks');
      const record = await provider.readRecord();
      if (action === 'start') {
        const { verifyAzureReadiness } = await import('./azure-readiness.mjs');
        const outcome = await runLifecycle(provider, 'start', {
          signal,
          lastStop: record.lastStop,
          readiness: () =>
            withBackendAccess(
              network,
              {
                id: 'aks',
                baseline: outputs.persistent_api_cidrs,
                cidr: runnerCidr,
                durationMs: 1200000,
              },
              async (access) =>
                verifyAzureReadiness({
                  stateDirectory: options['--state'],
                  kubeconfig: options['--kubeconfig'],
                  operation: 'start',
                  signal: globalThis.AbortSignal.any([signal, access.signal]),
                }),
            ),
        });
        await provider.writeRecord({
          ...(await provider.readRecord()),
          lastStart: new Date().toISOString(),
          readiness: 'verified',
        });
        console.log(
          `AKS start: state=${outcome.state}; readiness=verified; elapsed=${outcome.elapsedMs}ms`,
        );
        return;
      }
      if (
        action === 'safety-stop' &&
        !safetyStopDue(new Date().toISOString(), record.override)
      ) {
        await provider.writeRecord({
          ...record,
          lastSafetyRun: new Date().toISOString(),
          safetyOutcome: 'not-due-or-overridden',
        });
        console.log('safety stop: not due or bounded override active');
        return;
      }
      if (!same(await provider.ranges(), outputs.persistent_api_cidrs))
        fail(
          'API baseline drift blocks stop; reaper or operator reconciliation required.',
        );
      const outcome = await runLifecycle(provider, 'stop', { signal });
      await provider.writeRecord({
        ...(await provider.readRecord()),
        lastStop: new Date().toISOString(),
        ...(action === 'safety-stop'
          ? {
              lastSafetyRun: new Date().toISOString(),
              safetyOutcome: 'stopped',
            }
          : {}),
      });
      console.log(
        `AKS stop: state=${outcome.state}; elapsed=${outcome.elapsedMs}ms`,
      );
    },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      safeFailure(error, 'Azure operation failed; private details suppressed.'),
    );
    process.exitCode = 1;
  });
}
