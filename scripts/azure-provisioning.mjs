import { createGeneratorInput } from './azure-generator-input.mjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { workloadSecrets } from './azure-runtime.mjs';
import {
  OperationalFailure,
  safeFailure,
  executeProcess,
  cleanupAllSync,
  cleanupAll,
} from './process.mjs';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArgoInstallation } from './argocd-installation.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import {
  assertPrivatePath,
  createPrivateDirectory,
} from './local-platform.mjs';

const fail = (message) => {
  throw new OperationalFailure(message);
};
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateBootstrapPatches(patches) {
  const targets = new Set([
    'ServiceAccount/argocd-server',
    'Deployment/argocd-server',
    'ConfigMap/argocd-cm',
    'ConfigMap/argocd-rbac-cm',
    'ConfigMap/argocd-cmd-params-cm',
  ]);
  if (
    !Array.isArray(patches) ||
    !patches.length ||
    patches.length > 10 ||
    patches.some(
      (entry) =>
        !entry ||
        Object.keys(entry).sort().join(',') !==
          'kind,name,namespace,patch,type' ||
        !targets.has(`${entry.kind}/${entry.name}`) ||
        entry.namespace !== 'argocd' ||
        !['merge', 'strategic'].includes(entry.type) ||
        !entry.patch ||
        Array.isArray(entry.patch) ||
        typeof entry.patch !== 'object',
    )
  )
    fail('Argo bootstrap patch projection is invalid.');
  return patches;
}

export async function installAzureArgo({
  config,
  foundation,
  outputs,
  revision,
  kubeconfig,
  signal,
  root = repository,
}) {
  const deadline = Date.now() + 1200000;
  if (!/^[a-f0-9]{40}$/.test(revision ?? ''))
    fail('Reviewed merged revision is required for Argo bootstrap.');
  assertPrivatePath(kubeconfig, 0o600);
  const tools = qualityContext();
  const kubectl = verifiedTool(tools, 'kubectl');
  const kubelogin = verifiedTool(tools, 'kubelogin');
  const env = {
    ...process.env,
    KUBECONFIG: kubeconfig,
    PATH: `${dirname(kubelogin)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
  };
  await runPrivateProcess(
    kubelogin,
    ['convert-kubeconfig', '-l', 'azurecli', '--kubeconfig', kubeconfig],
    {
      operation: 'AKS Entra authentication configuration',
      tool: 'kubelogin',
      env,
      signal,
      timeout: 30000,
    },
  );
  const run = (args, input) => {
    if (Date.now() >= deadline)
      fail('Argo bootstrap exceeded its total readiness budget.');
    return runPrivateProcess(kubectl, args, {
      operation: 'Verified Argo bootstrap',
      tool: 'kubectl',
      env,
      input,
      signal,
      timeout: Math.max(1, deadline - Date.now()),
    });
  };
  const rendered = await renderArgoInstallation({
    root,
    kubectl,
    run: (command, args, options) =>
      executeProcess(command, args, {
        ...options,
        env,
        timeout: 25000,
        output: 'private-capture',
      }),
  });
  const runtime = resolve(root, 'deploy/platform/azure/runtime');
  let patches;
  let resources;
  try {
    patches = validateBootstrapPatches(
      JSON.parse(
        readFileSync(join(runtime, 'argocd-bootstrap-patches.json'), 'utf8'),
      ),
    );
    resources = JSON.parse(
      readFileSync(join(runtime, 'argocd-bootstrap-resources.json'), 'utf8'),
    );
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Reviewed Argo runtime projection is missing or invalid.',
      ),
    );
  }
  if (
    resources.kind !== 'List' ||
    !Array.isArray(resources.items) ||
    resources.items.length !== 1 ||
    resources.items[0].kind !== 'SecretProviderClass' ||
    resources.items[0].metadata?.name !== 'argocd' ||
    resources.items[0].metadata?.namespace !== 'argocd'
  )
    fail('Argo bootstrap secret provider projection is invalid.');
  await run(
    ['apply', '-f', '-'],
    JSON.stringify({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'argocd' },
    }),
  );
  await run(['apply', '-f', '-'], rendered);
  await run(['apply', '-f', '-'], JSON.stringify(resources));
  const directory = resolve(
    root,
    '.local/azure',
    config.environment,
    'bootstrap',
  );
  createPrivateDirectory(directory);
  const patchPath = join(directory, 'argocd-patch.json');
  let primary;
  try {
    for (const entry of patches) {
      writeFileSync(patchPath, JSON.stringify(entry.patch), { mode: 0o600 });
      await run([
        '--namespace',
        'argocd',
        'patch',
        entry.kind,
        entry.name,
        '--type',
        entry.type,
        '--patch-file',
        patchPath,
      ]);
      rmSync(patchPath);
    }
    await run(['apply', '-k', resolve(root, 'deploy/argocd/azure/projects')]);
    await run(['apply', '-k', resolve(root, 'deploy/argocd/azure/platform')]);
    for (const condition of [
      '--for=jsonpath={.status.sync.status}=Synced',
      '--for=jsonpath={.status.health.status}=Healthy',
    ])
      await run([
        '--namespace',
        'argocd',
        'wait',
        'application/equipment-azure-platform',
        condition,
        '--timeout=20m',
      ]);
    const activationPath = resolve(
      root,
      'deploy/platform/azure/recovery-activation.json',
    );
    if (existsSync(activationPath)) {
      const parsed = JSON.parse(
        await run([
          '--kubeconfig',
          kubeconfig,
          'config',
          'view',
          '--raw',
          '-o',
          'json',
        ]),
      );
      const context = parsed.contexts?.find(
        (entry) => entry.name === parsed['current-context'],
      );
      const cluster = parsed.clusters?.find(
        (entry) => entry.name === context?.context?.cluster,
      );
      const certificate = cluster?.cluster?.['certificate-authority-data'];
      if (typeof certificate !== 'string' || !certificate)
        fail(
          'Actual cluster trust prerequisite for activation context is invalid.',
        );
      const { qualificationDefinition } =
        await import('./azure-qualification.mjs');
      validateActivationContext(
        JSON.parse(readFileSync(activationPath, 'utf8')),
        {
          config,
          outputs,
          clusterCaHash: createHash('sha256')
            .update(globalThis.Buffer.from(certificate, 'base64'))
            .digest('hex'),
          definitions: qualificationDefinition(),
        },
      );
    } else {
      const bindings = JSON.parse(
        readFileSync(
          join(runtime, 'recovery-qualification-bindings.json'),
          'utf8',
        ),
      );
      if (
        bindings.kind !== 'List' ||
        bindings.items?.length !== 2 ||
        ['backup', 'restore'].some((actor) => {
          const entry = bindings.items.find(
            (item) =>
              item.metadata?.name ===
              `equipment-recovery-qualification-${actor}`,
          );
          return (
            entry?.kind !== 'RoleBinding' ||
            entry.metadata.namespace !== 'equipment-recovery' ||
            entry.roleRef?.name !==
              `equipment-recovery-qualification-${actor}` ||
            entry.roleRef.kind !== 'Role' ||
            entry.subjects?.length !== 1 ||
            entry.subjects[0].kind !== 'User' ||
            entry.subjects[0].name !== foundation?.github_principal_ids?.[actor]
          );
        })
      )
        fail('Reviewed credential-free qualification bindings are invalid.');
      await run(['apply', '-f', '-'], JSON.stringify(bindings));
    }
    await run([
      'apply',
      '-k',
      resolve(root, 'deploy/argocd/azure/application'),
    ]);
    for (const condition of [
      '--for=jsonpath={.status.sync.status}=Synced',
      '--for=jsonpath={.status.health.status}=Healthy',
    ])
      await run([
        '--namespace',
        'argocd',
        'wait',
        'application/equipment-azure',
        condition,
        '--timeout=20m',
      ]);
    for (const target of [
      'statefulset/argocd-application-controller',
      'deployment/argocd-repo-server',
      'deployment/argocd-server',
    ])
      await run([
        '--namespace',
        'argocd',
        'rollout',
        'status',
        target,
        '--timeout=15m',
      ]);
    for (const name of ['equipment-azure-platform', 'equipment-azure']) {
      let application;
      try {
        application = JSON.parse(
          await run([
            '--namespace',
            'argocd',
            'get',
            'application',
            name,
            '-o',
            'json',
          ]),
        );
      } catch {
        fail('Argo application readiness projection is invalid.');
      }
      if (
        application.status?.health?.status !== 'Healthy' ||
        application.status?.sync?.status !== 'Synced' ||
        application.status.sync.revision !== revision
      )
        fail('Argo readiness does not match the reviewed merged revision.');
    }
    return { phase: 'argocd-installed', authentication: 'entra-oidc' };
  } catch (error) {
    primary = new OperationalFailure(
      safeFailure(error, 'Argo bootstrap failed; private details suppressed.'),
    );
    throw primary;
  } finally {
    cleanupAllSync(
      existsSync(patchPath)
        ? [
            {
              operation: 'Bootstrap patch cleanup',
              tool: 'filesystem',
              run: () => rmSync(patchPath),
            },
          ]
        : [],
      { primary },
    );
  }
}

export async function populateWorkloadSecrets({
  vaultUri,
  token,
  oidcClientSecrets,
  brokerMonitorPassword,
  request = globalThis.fetch,
  signal,
}) {
  if (
    !/^https:\/\/[a-zA-Z0-9-]{3,24}\.vault\.azure\.net\/$/.test(vaultUri ?? '')
  )
    fail('Workload vault endpoint prerequisite is invalid.');
  if (
    !oidcClientSecrets ||
    ['argocd', 'dashboard'].some(
      (key) =>
        typeof oidcClientSecrets[key] !== 'string' || !oidcClientSecrets[key],
    )
  )
    fail(
      'Actual confidential client credentials are required; random values cannot replace Entra credentials.',
    );
  const names = [
    ...new Set(
      Object.values(workloadSecrets).flatMap((mapping) =>
        Object.values(mapping),
      ),
    ),
  ].sort();
  if (names.includes('broker-monitor-definitions'))
    brokerMonitorDefinitions(brokerMonitorPassword);
  return populateCanonicalSecrets({
    vaultUri,
    token,
    request,
    signal,
    names,
    oidcClientSecrets,
    brokerMonitorPassword,
  });
}

export async function populateRecoverySecrets({
  vaultUri,
  token,
  signal,
  request = globalThis.fetch,
}) {
  if (
    !/^https:\/\/[a-zA-Z0-9-]{3,24}\.vault\.azure\.net\/$/.test(vaultUri ?? '')
  )
    fail('Recovery vault endpoint prerequisite is invalid.');
  return populateCanonicalSecrets({
    vaultUri,
    token,
    signal,
    request,
    names: [
      'backup-postgres-password',
      'restore-postgres-password',
      'verification-postgres-password',
    ],
    recovery: true,
  });
}

async function populateCanonicalSecrets({
  vaultUri,
  token,
  signal,
  request,
  names,
  oidcClientSecrets = {},
  brokerMonitorPassword,
  recovery = false,
}) {
  const deadline = Date.now() + 1200000;
  let created = 0;
  let retained = 0;
  try {
    for (const name of names) {
      if (Date.now() >= deadline)
        fail('Secret population exceeded its time budget.');
      const url = new URL(`secrets/${name}?api-version=7.4`, vaultUri);
      const headers = {
        Authorization: `Bearer ${await token('https://vault.azure.net')}`,
      };
      const read = await request(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: signal
          ? globalThis.AbortSignal.any([
              signal,
              globalThis.AbortSignal.timeout(30000),
            ])
          : globalThis.AbortSignal.timeout(30000),
      });
      if (read.ok) {
        const existing = await read.json();
        if (
          typeof existing.value !== 'string' ||
          !existing.value ||
          (recovery && !/^[a-zA-Z0-9_-]{32,256}$/.test(existing.value)) ||
          existing.attributes?.enabled === false
        )
          fail(
            'Existing vault secret is disabled or invalid; explicit recovery required.',
          );
        if (name === 'broker-monitor-definitions')
          brokerMonitorDefinitions(brokerMonitorPassword, existing.value);
        const desired =
          name === 'argocd-oidc-client-secret'
            ? oidcClientSecrets.argocd
            : name === 'dashboard-oidc-client-secret'
              ? oidcClientSecrets.dashboard
              : undefined;
        if (!desired || existing.value === desired) {
          retained++;
          continue;
        }
      }
      if (!read.ok && read.status !== 404)
        fail(`Vault secret read failed; HTTP status ${read.status}.`);
      const value =
        name === 'broker-monitor-definitions'
          ? brokerMonitorDefinitions(brokerMonitorPassword)
          : name === 'argocd-oidc-client-secret'
            ? oidcClientSecrets.argocd
            : name === 'dashboard-oidc-client-secret'
              ? oidcClientSecrets.dashboard
              : randomBytes(32).toString('base64url');
      const response = await request(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        redirect: 'error',
        body: JSON.stringify({ value, attributes: { enabled: true } }),
        signal: signal
          ? globalThis.AbortSignal.any([
              signal,
              globalThis.AbortSignal.timeout(30000),
            ])
          : globalThis.AbortSignal.timeout(30000),
      });
      if (!response.ok)
        fail(`Vault secret creation failed; HTTP status ${response.status}.`);
      const saved = await response.json();
      if (saved.value !== value)
        fail('Vault secret creation verification failed.');
      created++;
    }
    return { phase: 'secrets-populated', created, retained };
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Secret population failed; private provider details suppressed.',
      ),
    );
  }
}

export async function readOperatorCredentials({
  vaultUri,
  token,
  request = globalThis.fetch,
  signal,
  now = Date.now(),
}) {
  if (
    !/^https:\/\/[a-zA-Z0-9-]{3,24}\.vault\.azure\.net\/$/.test(vaultUri ?? '')
  )
    fail('Retained credential vault prerequisite is invalid.');
  const credentials = {};
  try {
    for (const key of ['argocd', 'dashboard']) {
      const name = `${key}-oidc-client-secret`;
      const url = new URL(`secrets/${name}?api-version=7.4`, vaultUri);
      const response = await request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await token('https://vault.azure.net')}`,
        },
        redirect: 'error',
        signal: signal
          ? globalThis.AbortSignal.any([
              signal,
              globalThis.AbortSignal.timeout(30000),
            ])
          : globalThis.AbortSignal.timeout(30000),
      });
      if (!response.ok)
        fail(
          `Retained OIDC credential read failed; HTTP status ${response.status}.`,
        );
      const secret = await response.json();
      const prefix = new URL(`secrets/${name}/`, vaultUri).href;
      if (
        typeof secret.value !== 'string' ||
        !secret.value ||
        secret.attributes?.enabled !== true ||
        !Number.isSafeInteger(secret.attributes?.exp) ||
        secret.attributes.exp * 1000 < now + 30 * 86400000 ||
        (secret.attributes.nbf && secret.attributes.nbf * 1000 > now) ||
        typeof secret.id !== 'string' ||
        !secret.id.startsWith(prefix) ||
        !/^[a-f0-9]{32}$/.test(secret.id.slice(prefix.length))
      )
        fail(
          'Retained OIDC credential is missing, disabled, unversioned or expires within thirty days; human rotation is required.',
        );
      credentials[key] = secret.value;
    }
    return credentials;
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Retained OIDC credential read failed; private provider details suppressed.',
      ),
    );
  }
}

export function validateBootstrapRuntime(projection, { read, list }) {
  for (const [directory, files] of [
    ['deploy/environments/azure/runtime', projection.applicationFiles],
    ['deploy/platform/azure/runtime', projection.platformFiles],
    ['deploy/platform/azure/recovery/runtime', projection.recoveryFiles],
  ]) {
    if (
      !files ||
      Object.keys(files).sort().join('\0') !== list(directory).sort().join('\0')
    )
      fail('Reviewed runtime file inventory is missing or stale.');
    for (const [name, expected] of Object.entries(files)) {
      if (
        !/^[a-zA-Z0-9_.-]+\.(json|yaml)$/.test(name) ||
        read(`${directory}/${name}`) !== expected
      )
        fail(
          'Reviewed runtime differs from the validated infrastructure projection.',
        );
    }
  }
  return true;
}

export async function createOperatorCredentials({
  vaultUri,
  applicationIds,
  expiry,
  token,
  request = globalThis.fetch,
  signal,
  rotate = false,
  environment,
  confirmation,
  record = () => {},
}) {
  const expires = Date.parse(expiry);
  if (
    !/^https:\/\/[a-zA-Z0-9-]{3,24}\.vault\.azure\.net\/$/.test(
      vaultUri ?? '',
    ) ||
    !Number.isFinite(expires) ||
    !/Z$/.test(expiry) ||
    expires <= Date.now() + 30 * 86400000 ||
    expires > Date.now() + 365 * 86400000 ||
    ['argocd', 'dashboard'].some(
      (key) =>
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
          applicationIds?.[key] ?? '',
        ),
    )
  )
    fail(
      'Reviewed operator credential expiry and application prerequisites are invalid.',
    );
  if (rotate && (!environment || confirmation !== environment))
    fail(
      'Operator credential rotation requires exact environment confirmation.',
    );
  const entries = [];
  const send = async (url, method, body, audience) => {
    const response = await request(url, {
      method,
      headers: {
        Authorization: `Bearer ${await token(audience)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: signal
        ? globalThis.AbortSignal.any([
            signal,
            globalThis.AbortSignal.timeout(30000),
          ])
        : globalThis.AbortSignal.timeout(30000),
    });
    return response;
  };
  try {
    const existing = {};
    for (const key of ['argocd', 'dashboard']) {
      const url = new URL(
        `secrets/${key}-oidc-client-secret?api-version=7.4`,
        vaultUri,
      );
      const response = await send(
        url,
        'GET',
        undefined,
        'https://vault.azure.net',
      );
      if (response.ok) {
        const current = await response.json();
        if (!rotate)
          fail(
            'Existing retained operator credential requires explicit human rotation.',
          );
        if (
          typeof current.id !== 'string' ||
          !current.id.startsWith(
            new URL(`secrets/${key}-oidc-client-secret/`, vaultUri).href,
          )
        )
          fail('Existing operator credential version is invalid.');
        existing[key] = current.id;
      } else if (response.status !== 404)
        fail(
          `Retained credential prerequisite read failed; HTTP status ${response.status}.`,
        );
    }
    for (const key of ['argocd', 'dashboard']) {
      const response = await send(
        `https://graph.microsoft.com/v1.0/applications/${applicationIds[key]}/addPassword`,
        'POST',
        {
          passwordCredential: {
            displayName: `equipment-${key}`,
            endDateTime: expiry,
          },
        },
        'https://graph.microsoft.com/',
      );
      if (!response.ok)
        fail(
          `Human operator credential creation failed; HTTP status ${response.status}.`,
        );
      const value = await response.json();
      if (
        typeof value.secretText !== 'string' ||
        !value.secretText ||
        !/^[a-f0-9-]{36}$/i.test(value.keyId ?? '') ||
        Date.parse(value.endDateTime) !== expires
      )
        fail('Graph credential creation verification failed.');
      await record({
        key,
        applicationId: applicationIds[key],
        keyId: value.keyId,
        value: value.secretText,
        expiry,
        previousVersion: existing[key] ?? null,
      });
      const saved = await send(
        new URL(`secrets/${key}-oidc-client-secret?api-version=7.4`, vaultUri),
        'PUT',
        {
          value: value.secretText,
          attributes: { enabled: true, exp: Math.floor(expires / 1000) },
          tags: { graphKeyId: value.keyId },
        },
        'https://vault.azure.net',
      );
      if (!saved.ok)
        fail(
          `Retained credential write failed; HTTP status ${saved.status}; private journal recovery required.`,
        );
      const secret = await saved.json();
      if (
        secret.value !== value.secretText ||
        secret.attributes?.exp !== Math.floor(expires / 1000) ||
        typeof secret.id !== 'string'
      )
        fail(
          'Retained credential write verification failed; private journal recovery required.',
        );
      entries.push({
        key,
        keyId: value.keyId,
        version: secret.id,
        previousVersion: existing[key] ?? null,
      });
    }
    return {
      phase: rotate
        ? 'operator-credentials-rotated-login-required'
        : 'operator-credentials-created',
      credentials: entries,
      oldCredentialRetirement: 'human-after-successful-operator-login',
    };
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Human operator credential maintenance failed; private journal recovery may be required.',
      ),
    );
  }
}

export async function executeOperatorMaintenance({
  config,
  foundation,
  revision,
  oidcExpirationDate,
  rotate = false,
  confirmation,
}) {
  const { assertSourceRevision, azureTokenProvider } =
    await import('./azure-terraform.mjs');
  const { preflight, runAzure } = await import('./azure-infrastructure.mjs');
  const {
    createRestProvider,
    configuredNetworkResources,
    createArmNetworkProvider,
    withAzureOperation,
    updateNetworkAdmissions,
  } = await import('./azure-operations.mjs');
  const { randomUUID } = await import('node:crypto');
  assertSourceRevision(revision);
  await preflight(config, { stage: 'foundation-bootstrap', foundation });
  const human = runAzure(['ad', 'signed-in-user', 'show']);
  if (!foundation.approved_operator_object_ids?.includes(human?.id))
    fail(
      'Explicit approved human operator identity is required for Graph credential maintenance.',
    );
  const token = azureTokenProvider(config);
  const selected = configuredNetworkResources(config, foundation, {
    retainedOnly: true,
  });
  const networkProvider = createArmNetworkProvider({
    ...selected,
    token: () => token('https://management.azure.com/'),
  });
  const provider = createRestProvider({
    account: foundation.operation_storage_account_name,
    container: foundation.operation_container_name,
    environment: config.environment,
    token,
  });
  const response = await globalThis.fetch('https://api.ipify.org?format=json', {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(10000),
  });
  if (!response.ok)
    fail('Actual runner public address prerequisite is unavailable.');
  const { ip } = await response.json();
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip ?? '') ||
    ip.split('.').some((value) => Number(value) > 255)
  )
    fail('Actual runner public address prerequisite is invalid.');
  const cidr = `${ip}/32`;
  const directory = resolve(
    repository,
    '.local',
    'azure',
    config.environment,
    'operator-credentials',
  );
  createPrivateDirectory(directory);
  const journal = join(directory, `${randomUUID()}.json`);
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
      operation: 'operator-credentials',
      durationMs: 1800000,
    },
    async ({ signal }) => {
      const owner = randomUUID();
      let primary;
      let admitted = false;
      try {
        await updateNetworkAdmissions(networkProvider, {
          id: 'recoveryVault',
          baseline: config.operatorCidrs,
          owner,
          cidr,
          expires: new Date(Date.now() + 1800000).toISOString(),
        });
        admitted = true;
        const records = [];
        return await createOperatorCredentials({
          vaultUri: `https://${foundation.recovery_key_id.split('/')[2]}/`,
          applicationIds: foundation.operator_application_object_ids,
          expiry: oidcExpirationDate,
          token,
          signal,
          rotate,
          environment: config.environment,
          confirmation,
          record: (entry) => {
            records.push(entry);
            writeFileSync(
              journal,
              JSON.stringify({
                environment: config.environment,
                revision,
                records,
              }),
              { mode: 0o600 },
            );
            assertPrivatePath(journal, 0o600);
          },
        });
      } catch (error) {
        primary = error;
        throw error;
      } finally {
        await cleanupAll(
          admitted
            ? [
                () =>
                  updateNetworkAdmissions(networkProvider, {
                    id: 'recoveryVault',
                    baseline: config.operatorCidrs,
                    owner,
                    remove: true,
                  }),
              ]
            : [],
          { primary },
        );
      }
    },
  );
}

export async function executeBootstrap({
  config,
  foundation,
  environment,
  revision,
  recoveryConfigPath,
}) {
  const { assertSourceRevision, azureTokenProvider } =
    await import('./azure-terraform.mjs');
  const { preflight } = await import('./azure-infrastructure.mjs');
  const { renderRuntimeProjection } = await import('./azure-runtime.mjs');
  const { verifyAzurePublication } = await import('./promote-images.mjs');
  const { readdirSync } = await import('node:fs');
  const { randomUUID } = await import('node:crypto');
  const { Buffer } = await import('node:buffer');
  const operations = await import('./azure-operations.mjs');
  const { loadRecoveryConfig } = await import('./azure-recovery.mjs');
  const { brokerMonitorPassword } = loadRecoveryConfig(recoveryConfigPath);
  assertSourceRevision(revision);
  await preflight(config, { stage: 'environment', foundation });
  const projection = renderRuntimeProjection(
    createGeneratorInput({
      config,
      foundation,
      environment,
    }),
  );
  validateBootstrapRuntime(projection, {
    read: (path) => readFileSync(resolve(repository, path), 'utf8'),
    list: (path) => readdirSync(resolve(repository, path)),
  });
  if (!process.env.DOCKER_CONFIG)
    fail(
      'Private authenticated DOCKER_CONFIG prerequisite is required for independent publication verification.',
    );
  assertPrivatePath(resolve(process.env.DOCKER_CONFIG), 0o700);
  const registryEnvironment = { ...process.env };
  const mainResponse = await globalThis.fetch(
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
  if (!mainResponse.ok || (await mainResponse.json()).sha !== revision)
    fail('Bootstrap requires the exact currently reviewed main revision.');
  const repositoryResponse = await globalThis.fetch(
    `https://api.github.com/repos/${config.githubRepository}`,
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
  if (!repositoryResponse.ok)
    fail(
      'Authoritative GitHub repository identity prerequisite is unavailable.',
    );
  const repositoryIdentity = await repositoryResponse.json();
  if (
    !Number.isSafeInteger(repositoryIdentity.id) ||
    repositoryIdentity.full_name !== config.githubRepository
  )
    fail('Authoritative GitHub repository identity prerequisite is invalid.');
  const { imageNames } = await import('./deployment-validation.mjs');
  for (const component of imageNames) {
    const publication = JSON.parse(
      readFileSync(
        resolve(
          repository,
          'deploy/environments/azure/releases',
          `${component}.json`,
        ),
        'utf8',
      ),
    );
    if (publication.source?.component !== component)
      fail(
        'Azure publication component prerequisite does not match its reviewed file.',
      );
    await verifyAzurePublication(publication, {
      acrLoginServer: environment.acr_login_server,
      repository: {
        id: repositoryIdentity.id,
        name: repositoryIdentity.full_name,
      },
      patch: readFileSync(
        resolve(
          repository,
          'deploy/environments/azure/images',
          `${component}.yaml`,
        ),
        'utf8',
      ),
      env: registryEnvironment,
    });
  }
  const token = azureTokenProvider(config);
  const networkSettings = operations.configuredNetworkResources(config, {
    ...foundation,
    ...environment,
  });
  const networkProvider = operations.createArmNetworkProvider({
    ...networkSettings,
    token: () => token('https://management.azure.com/'),
  });
  const provider = operations.createRestProvider({
    account: foundation.operation_storage_account_name,
    container: foundation.operation_container_name,
    environment: config.environment,
    clusterId: environment.aks_resource_id,
    token,
  });
  const addressResponse = await globalThis.fetch(
    'https://api.ipify.org?format=json',
    { redirect: 'error', signal: globalThis.AbortSignal.timeout(10000) },
  );
  if (!addressResponse.ok)
    fail('Actual runner address prerequisite is unavailable.');
  const { ip } = await addressResponse.json();
  if (
    !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip ?? '') ||
    ip.split('.').some((value) => Number(value) > 255)
  )
    fail('Actual runner address prerequisite is invalid.');
  const cidr = `${ip}/32`;
  return operations.withAzureOperation(
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
        {
          id: 'state',
          baseline: config.operatorCidrs,
          cidr,
          durationMs: 1800000,
        },
      ],
      operation: 'bootstrap',
      durationMs: 1800000,
    },
    async (operation) => {
      const { signal } = operation;
      const { privateBlobStore } = await import('./azure-terraform.mjs');
      const actual = await privateBlobStore(
        config,
        foundation,
        token,
      ).previousOutputs();
      if (
        !actual ||
        operations.operationOutputsHash(actual) !==
          operations.operationOutputsHash(environment)
      )
        fail(
          'Durable environment projection is stale or differs from actual authorized environment state.',
        );
      const owner = randomUUID();
      const admitted = [];
      let primary;
      const directory = resolve(
        repository,
        '.local',
        'azure',
        config.environment,
        'deployed',
      );
      createPrivateDirectory(directory);
      const kubeconfig = join(directory, 'kubeconfig');
      try {
        for (const [id, baseline] of [
          ['recoveryVault', config.operatorCidrs],
          ['workloadVault', config.operatorCidrs],
          ['aks', environment.persistent_api_cidrs],
        ]) {
          await operations.updateNetworkAdmissions(networkProvider, {
            id,
            baseline,
            owner,
            cidr,
            expires: new Date(Date.now() + 1800000).toISOString(),
          });
          admitted.push({ id, baseline });
        }
        const credentials = await readOperatorCredentials({
          vaultUri: `https://${foundation.recovery_key_id.split('/')[2]}/`,
          token,
          signal,
        });
        await populateWorkloadSecrets({
          vaultUri: environment.workload_key_vault_uri,
          token,
          oidcClientSecrets: credentials,
          brokerMonitorPassword,
          signal,
        });
        await prepareUserKubeconfig({
          config,
          outputs: { ...foundation, ...environment },
          token,
          stateDirectory: directory,
          signal,
        });
        await installAzureArgo({
          config,
          foundation,
          outputs: { ...foundation, ...environment },
          revision,
          kubeconfig,
          signal,
        });
        const ctx = qualityContext();
        const kubectl = verifiedTool(ctx, 'kubectl');
        const kubelogin = verifiedTool(ctx, 'kubelogin');
        const pathKey =
          Object.keys(process.env).find(
            (key) => key.toLowerCase() === 'path',
          ) ?? 'PATH';
        const env = {
          ...process.env,
          KUBECONFIG: kubeconfig,
          [pathKey]: `${dirname(kubelogin)}${process.platform === 'win32' ? ';' : ':'}${process.env[pathKey] ?? ''}`,
        };
        const ca = await runPrivateProcess(
          kubectl,
          [
            '--kubeconfig',
            kubeconfig,
            'get',
            'secret',
            'equipment-internal-root',
            '-n',
            'cert-manager',
            '-o',
            'jsonpath={.data.tls\\.crt}',
          ],
          {
            tool: 'kubectl',
            operation: 'Read internal public trust certificate',
            timeout: 30000,
            env,
            signal,
          },
        );
        const certificate = Buffer.from(ca, 'base64').toString('utf8');
        if (!certificate.includes('-----BEGIN CERTIFICATE-----'))
          fail('Internal public CA prerequisite is invalid.');
        writeFileSync(join(directory, 'internal-ca.crt'), certificate, {
          mode: 0o600,
        });
        assertPrivatePath(join(directory, 'internal-ca.crt'), 0o600);
        const smokeCredentials = {};
        for (const [key, name] of Object.entries({
          alice: 'alice',
          bob: 'bob',
          manager: 'manager',
          dashboardApi: 'dashboard-api',
          dashboardOtlp: 'dashboard-otlp',
          prometheusApi: 'prometheus-api-token',
          lokiApi: 'loki-api-token',
          tempoApi: 'tempo-api-token',
        })) {
          const response = await globalThis.fetch(
            new URL(
              `secrets/${name}?api-version=7.4`,
              environment.workload_key_vault_uri,
            ),
            {
              headers: {
                Authorization: `Bearer ${await token('https://vault.azure.net')}`,
              },
              redirect: 'error',
              signal: globalThis.AbortSignal.any([
                signal,
                globalThis.AbortSignal.timeout(30000),
              ]),
            },
          );
          if (!response.ok)
            fail(
              `Readiness credential prerequisite failed; HTTP status ${response.status}.`,
            );
          const secret = await response.json();
          if (typeof secret.value !== 'string' || !secret.value)
            fail('Readiness credential prerequisite is invalid.');
          smokeCredentials[key] = secret.value;
        }
        const context = await runPrivateProcess(
          kubectl,
          ['--kubeconfig', kubeconfig, 'config', 'current-context'],
          {
            tool: 'kubectl',
            operation: 'Read scoped Kubernetes context',
            timeout: 30000,
            env,
            signal,
          },
        );
        for (const [name, value] of Object.entries({
          'credentials.json': smokeCredentials,
          'smoke-state.json': {
            applicationOrigin: `https://app.${config.domain}`,
            authority: `https://identity.${config.domain}/realms/equipment`,
            credentialsFile: 'credentials.json',
            caFile: 'internal-ca.crt',
            kubeconfig,
            context: context.trim(),
          },
        })) {
          writeFileSync(join(directory, name), JSON.stringify(value), {
            mode: 0o600,
          });
          assertPrivatePath(join(directory, name), 0o600);
        }
        const { verifyAzureReadiness } = await import('./azure-readiness.mjs');
        await verifyAzureReadiness({
          config,
          outputs: { ...foundation, ...environment },
          stateDirectory: directory,
          kubeconfig,
          signal,
          operation: 'bootstrap',
        });
        const { createOperationalProjection } =
          await import('./azure-handoff.mjs');
        const asRaw = (values) =>
          Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              { value, sensitive: false },
            ]),
          );
        const snapshot = createOperationalProjection(
          config,
          asRaw(foundation),
          asRaw(environment),
        );
        const body = JSON.stringify(snapshot);
        const cache = await globalThis.fetch(
          `https://${foundation.operation_storage_account_name}.blob.core.windows.net/${foundation.operation_container_name}/outputs/${config.environment}.json`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${await token('https://storage.azure.com/')}`,
              'x-ms-version': '2023-11-03',
              'x-ms-date': new Date().toUTCString(),
              'x-ms-blob-type': 'BlockBlob',
              'Content-Type': 'application/json',
            },
            body,
            redirect: 'error',
            signal: globalThis.AbortSignal.any([
              signal,
              globalThis.AbortSignal.timeout(30000),
            ]),
          },
        );
        if (!cache.ok)
          fail(
            `Operational output snapshot publication failed; HTTP status ${cache.status}.`,
          );
        writeFileSync(join(directory, 'operational-outputs.json'), body, {
          mode: 0o600,
        });
        assertPrivatePath(join(directory, 'operational-outputs.json'), 0o600);
        if (
          !existsSync(
            resolve(
              repository,
              'deploy/platform/azure/recovery-activation.json',
            ),
          )
        ) {
          const { publishInitialQualificationChallenge } =
            await import('./azure-qualification.mjs');
          await publishInitialQualificationChallenge({
            config,
            installationInput: { config, foundation, environment },
            outputs: { ...foundation, ...environment },
            kubeconfig,
            token,
            signal,
            operation,
          });
        }
        return {
          phase: 'application-ready-recovery-qualification-pending',
          generation: config.generation,
          outputHash: projection.outputHash,
        };
      } catch (error) {
        primary = error;
        throw error;
      } finally {
        await cleanupAll(
          admitted.reverse().map(
            ({ id, baseline }) =>
              () =>
                operations.updateNetworkAdmissions(networkProvider, {
                  id,
                  baseline,
                  owner,
                  remove: true,
                }),
          ),
          { primary },
        );
      }
    },
  );
}

export function brokerMonitorDefinitions(password, existing) {
  if (
    typeof password !== 'string' ||
    password.length < 32 ||
    password.length > 256 ||
    /[\r\n\0]/.test(password)
  )
    fail('Explicit reused private broker monitoring password is required.');
  const salt = randomBytes(4);
  const hash = globalThis.Buffer.concat([
    salt,
    createHash('sha256').update(salt).update(password, 'utf8').digest(),
  ]);
  const definition = {
    users: [
      {
        name: 'equipment_backup_monitor',
        password_hash: hash.toString('base64'),
        hashing_algorithm: 'rabbit_password_hashing_sha256',
        tags: ['monitoring'],
      },
    ],
    permissions: [
      {
        user: 'equipment_backup_monitor',
        vhost: 'equipment',
        configure: '^$',
        write: '^$',
        read: '^$',
      },
    ],
  };
  if (existing) {
    try {
      const value = JSON.parse(existing);
      const encoded = globalThis.Buffer.from(
        value.users?.[0]?.password_hash ?? '',
        'base64',
      );
      if (encoded.length !== 36)
        fail('Broker monitoring definition requires paired manual rotation.');
      const expected = globalThis.Buffer.concat([
        encoded.subarray(0, 4),
        createHash('sha256')
          .update(encoded.subarray(0, 4))
          .update(password, 'utf8')
          .digest(),
      ]);
      definition.users[0].password_hash = encoded.toString('base64');
      if (
        !timingSafeEqual(encoded, expected) ||
        JSON.stringify(value) !== JSON.stringify(definition)
      )
        fail(
          'Broker monitoring password/configuration mismatch requires paired manual rotation.',
        );
      return existing;
    } catch (error) {
      throw new OperationalFailure(
        safeFailure(
          error,
          'Broker monitoring definition is invalid; paired manual rotation required.',
        ),
      );
    }
  }
  return JSON.stringify(definition);
}

export async function prepareUserKubeconfig({
  config,
  outputs,
  token,
  stateDirectory,
  signal,
}) {
  const { Buffer } = await import('node:buffer');
  if (
    outputs.workload_resource_group_name !==
      `er-${config.environment}-workload` ||
    !/^[a-zA-Z0-9_-]+$/.test(outputs.aks_cluster_name ?? '') ||
    outputs.aks_resource_id !==
      `/subscriptions/${config.subscriptionId}/resourceGroups/${outputs.workload_resource_group_name}/providers/Microsoft.ContainerService/managedClusters/${outputs.aks_cluster_name}`
  )
    fail('Exact configured user Kubernetes credential scope is invalid.');
  createPrivateDirectory(stateDirectory);
  const kubeconfig = join(stateDirectory, 'kubeconfig');
  const tools = qualityContext();
  const kubectl = verifiedTool(tools, 'kubectl');
  const kubelogin = verifiedTool(tools, 'kubelogin');
  const response = await globalThis.fetch(
    `https://management.azure.com${outputs.aks_resource_id}/listClusterUserCredential?api-version=2025-07-01&format=exec`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token('https://management.azure.com/')}`,
      },
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
      `Nonadmin user Kubernetes credential request failed; HTTP status ${response.status}.`,
    );
  const result = await response.json();
  if (
    result.kubeconfigs?.length !== 1 ||
    typeof result.kubeconfigs[0].value !== 'string'
  )
    fail('Nonadmin Kubernetes credential response is invalid.');
  writeFileSync(
    kubeconfig,
    Buffer.from(result.kubeconfigs[0].value, 'base64'),
    { mode: 0o600 },
  );
  assertPrivatePath(kubeconfig, 0o600);
  await runPrivateProcess(
    kubelogin,
    ['convert-kubeconfig', '--kubeconfig', kubeconfig, '--login', 'azurecli'],
    {
      tool: 'kubelogin',
      operation: 'Convert scoped user authentication',
      timeout: 30000,
      signal,
    },
  );
  const raw = await runPrivateProcess(
    kubectl,
    ['--kubeconfig', kubeconfig, 'config', 'view', '--raw', '-o', 'json'],
    {
      tool: 'kubectl',
      operation: 'Read scoped user credential metadata',
      timeout: 30000,
      signal,
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('Scoped user kubeconfig is invalid.');
  }
  if (
    !Array.isArray(parsed.users) ||
    !parsed.users.length ||
    parsed.users.some(
      (user) =>
        !user.user?.exec ||
        user.user.token ||
        user.user['client-key-data'] ||
        user.user['client-certificate-data'] ||
        user.user['auth-provider'],
    )
  )
    fail('Only nonadmin exec-authenticated user kubeconfig is supported.');
  for (const user of parsed.users) user.user.exec.command = kubelogin;
  writeFileSync(kubeconfig, JSON.stringify(parsed), { mode: 0o600 });
  assertPrivatePath(kubeconfig, 0o600);
  return { kubeconfig, kubectl };
}

export function validateActivationContext(
  record,
  { config, outputs, clusterCaHash, definitions },
) {
  if (
    !record ||
    record.version !== 1 ||
    record.environment !== config.environment ||
    record.generation !== config.generation ||
    record.sourceRevision !== config.gitRevision ||
    record.clusterId !== outputs.aks_resource_id ||
    record.clusterCaHash !== clusterCaHash ||
    !/^[a-f0-9-]{36}$/.test(record.nonce ?? '') ||
    !/^[a-f0-9]{64}$/.test(record.challengeHash ?? '') ||
    !record.proofHashes ||
    Object.keys(record.proofHashes).sort().join(',') !== 'backup,restore' ||
    Object.values(record.proofHashes).some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    ) ||
    Object.entries(definitions).some(([key, value]) => record[key] !== value)
  )
    fail(
      'Established recovery activation context is stale, foreign or incomplete; protected activation reconciliation required.',
    );
  return record;
}
