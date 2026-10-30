import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { createServer } from 'node:http';

test('recovery secret bridge uses exact three objects and retains valid values across real HTTP calls', async (t) => {
  const { populateRecoverySecrets } = await import('./azure-provisioning.mjs');
  const values = new Map([
    [
      'backup-postgres-password',
      'EXISTING_PRIVATE_PASSWORD_12345678901234567890',
    ],
  ]);
  const paths = [];
  const server = createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.split('/')[2];
    paths.push({ method: req.method, name });
    if (req.method === 'PUT') {
      let body = '';
      for await (const part of req) body += part;
      values.set(name, JSON.parse(body).value);
    }
    res.writeHead(values.has(name) ? 200 : 404, {
      'Content-Type': 'application/json',
    });
    res.end(
      JSON.stringify(
        values.has(name)
          ? { value: values.get(name), attributes: { enabled: true } }
          : {},
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const options = {
    vaultUri: 'https://workload.vault.azure.net/',
    token: async () => 'PRIVATE_TOKEN',
    request: (url, settings) => {
      assert.equal(new URL(url).origin, 'https://workload.vault.azure.net');
      return globalThis.fetch(
        `http://127.0.0.1:${server.address().port}${new URL(url).pathname}${new URL(url).search}`,
        settings,
      );
    },
  };
  assert.deepEqual(await populateRecoverySecrets(options), {
    phase: 'secrets-populated',
    created: 2,
    retained: 1,
  });
  assert.deepEqual([...values.keys()].sort(), [
    'backup-postgres-password',
    'restore-postgres-password',
    'verification-postgres-password',
  ]);
  assert.equal(
    values.get('backup-postgres-password'),
    'EXISTING_PRIVATE_PASSWORD_12345678901234567890',
  );
  for (const name of [
    'restore-postgres-password',
    'verification-postgres-password',
  ])
    assert.match(values.get(name), /^[a-zA-Z0-9_-]{43}$/);
  assert.deepEqual(await populateRecoverySecrets(options), {
    phase: 'secrets-populated',
    created: 0,
    retained: 3,
  });
  assert.equal(paths.filter((x) => x.method === 'PUT').length, 2);
  values.set('backup-postgres-password', 'invalid');
  await assert.rejects(populateRecoverySecrets(options), /invalid|recovery/i);
  assert.equal(paths.filter((x) => x.method === 'PUT').length, 2);
});

test('secret population preserves existing values and creates only canonical object names', async () => {
  const { populateWorkloadSecrets } = await import('./azure-provisioning.mjs');
  const values = new Map([['postgres-admin', 'PERSISTED_PRIVATE_MARKER']]);
  const written = [];
  const request = async (url, options) => {
    assert.equal(url.origin, 'https://workload.vault.azure.net');
    const name = url.pathname.split('/')[2];
    if (options.method === 'GET')
      return {
        status: values.has(name) ? 200 : 404,
        ok: values.has(name),
        json: async () => ({ value: values.get(name) }),
      };
    const body = JSON.parse(options.body);
    values.set(name, body.value);
    written.push(name);
    return { status: 200, ok: true, json: async () => ({ value: body.value }) };
  };
  const result = await populateWorkloadSecrets({
    vaultUri: 'https://workload.vault.azure.net/',
    token: async () => 'PRIVATE_TOKEN',
    brokerMonitorPassword: 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
    oidcClientSecrets: { argocd: 'ARGOC_PRIVATE', dashboard: 'DASH_PRIVATE' },
    request,
  });
  assert.equal(values.get('postgres-admin'), 'PERSISTED_PRIVATE_MARKER');
  assert.ok(!written.includes('postgres-admin'));
  assert.equal(values.get('argocd-oidc-client-secret'), 'ARGOC_PRIVATE');
  assert.equal(new Set([...values.values()]).size, values.size);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  const before = written.length;
  await populateWorkloadSecrets({
    vaultUri: 'https://workload.vault.azure.net/',
    token: async () => 'PRIVATE_TOKEN',
    brokerMonitorPassword: 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
    oidcClientSecrets: { argocd: 'ARGOC_PRIVATE', dashboard: 'DASH_PRIVATE' },
    request,
  });
  assert.equal(written.length, before);
});

test('missing confidential client credentials and private provider failures never report success', async () => {
  const { populateWorkloadSecrets } = await import('./azure-provisioning.mjs');
  await assert.rejects(
    () =>
      populateWorkloadSecrets({
        vaultUri: 'https://workload.vault.azure.net/',
        brokerMonitorPassword: 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
        oidcClientSecrets: {},
        request: async () => {
          throw Error('must not call');
        },
      }),
    /confidential/i,
  );
  await assert.rejects(
    () =>
      populateWorkloadSecrets({
        vaultUri: 'https://workload.vault.azure.net/',
        brokerMonitorPassword: 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
        oidcClientSecrets: { argocd: 'a', dashboard: 'b' },
        token: async () => 'PRIVATE_TOKEN',
        request: async () => {
          throw Error('PRIVATE_PROVIDER_MARKER');
        },
      }),
    (error) => {
      assert.doesNotMatch(
        error.message + JSON.stringify(error),
        /PRIVATE_PROVIDER_MARKER|PRIVATE_TOKEN/,
      );
      return true;
    },
  );
});

test('bootstrap patch parser rejects secret objects, foreign targets and arbitrary patch modes', async () => {
  const { validateBootstrapPatches } = await import('./azure-provisioning.mjs');
  const patch = {
    kind: 'ConfigMap',
    name: 'argocd-cm',
    namespace: 'argocd',
    type: 'merge',
    patch: { data: { url: 'https://argocd.codingfunlab.com' } },
  };
  assert.equal(validateBootstrapPatches([patch]).length, 1);
  for (const change of [
    { kind: 'Secret' },
    { namespace: 'equipment' },
    { name: 'unrelated' },
    { type: 'json' },
  ])
    assert.throws(
      () => validateBootstrapPatches([{ ...patch, ...change }]),
      /bootstrap/i,
    );
});

test('retained OIDC reader requires exact live versioned source secrets and keeps provider details private', async () => {
  const { readOperatorCredentials } = await import('./azure-provisioning.mjs');
  const names = [];
  const result = await readOperatorCredentials({
    vaultUri: 'https://recovery-vault.vault.azure.net/',
    token: async () => 'PRIVATE_TOKEN',
    request: async (url) => {
      names.push(String(url));
      return {
        ok: true,
        json: async () => ({
          value: 'PRIVATE_CREDENTIAL',
          id: String(url).split('?')[0] + '/0123456789abcdef0123456789abcdef',
          attributes: {
            enabled: true,
            exp: Math.floor(Date.now() / 1000) + 86400 * 60,
          },
        }),
      };
    },
  });
  assert.equal(result.argocd, 'PRIVATE_CREDENTIAL');
  assert.equal(names.length, 2);
  assert.ok(
    names.every((url) =>
      /secrets\/(argocd|dashboard)-oidc-client-secret\?/.test(url),
    ),
  );
  await assert.rejects(
    () =>
      readOperatorCredentials({
        vaultUri: 'https://recovery-vault.vault.azure.net/',
        token: async () => 'PRIVATE_TOKEN',
        request: async () => ({
          ok: true,
          json: async () => ({
            value: 'PRIVATE_CREDENTIAL',
            attributes: { enabled: true, exp: 1 },
          }),
        }),
      }),
    /credential/i,
  );
  await assert.rejects(
    () =>
      readOperatorCredentials({
        vaultUri: 'https://recovery-vault.vault.azure.net/',
        token: async () => {
          throw Error('PRIVATE_MARKER');
        },
      }),
    (error) => !/PRIVATE_MARKER/.test(error.message),
  );
});

test('operator source credential changes replace stale workload copies instead of retaining expired client values', async () => {
  const { populateWorkloadSecrets, brokerMonitorDefinitions } =
    await import('./azure-provisioning.mjs');
  const writes = [];
  await populateWorkloadSecrets({
    vaultUri: 'https://workload.vault.azure.net/',
    token: async () => 'PRIVATE_TOKEN',
    brokerMonitorPassword: 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
    oidcClientSecrets: { argocd: 'NEW_ARGO', dashboard: 'NEW_DASHBOARD' },
    request: async (url, options) => {
      const name = url.pathname.split('/')[2];
      if (options.method === 'GET')
        return {
          ok: true,
          json: async () => ({
            value:
              name === 'broker-monitor-definitions'
                ? brokerMonitorDefinitions(
                    'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES',
                  )
                : 'OLD_PRIVATE_VALUE',
          }),
        };
      const body = JSON.parse(options.body);
      writes.push({ name, value: body.value });
      return { ok: true, json: async () => body };
    },
  });
  assert.deepEqual(writes.map((x) => x.name).sort(), [
    'argocd-oidc-client-secret',
    'dashboard-oidc-client-secret',
  ]);
  assert.equal(
    writes.find((x) => x.name.startsWith('argocd')).value,
    'NEW_ARGO',
  );
});

test('bootstrap requires exact reviewed generated runtime files', async () => {
  const { validateBootstrapRuntime } = await import('./azure-provisioning.mjs');
  const generated = {
    applicationFiles: { 'projection.json': 'approved' },
    platformFiles: { 'kustomization.yaml': 'platform' },
    recoveryFiles: { 'projection.json': 'recovery-approved' },
  };
  const files = new Map([
    ['deploy/environments/azure/runtime/projection.json', 'approved'],
    ['deploy/platform/azure/runtime/kustomization.yaml', 'platform'],
    [
      'deploy/platform/azure/recovery/runtime/projection.json',
      'recovery-approved',
    ],
  ]);
  assert.equal(
    validateBootstrapRuntime(generated, {
      read: (path) => files.get(path),
      list: (dir) =>
        [...files.keys()]
          .filter((path) => path.startsWith(dir + '/'))
          .map((path) => path.slice(dir.length + 1)),
    }),
    true,
  );
  files.set('deploy/environments/azure/runtime/projection.json', 'altered');
  assert.throws(
    () =>
      validateBootstrapRuntime(generated, {
        read: (path) => files.get(path),
        list: (dir) =>
          [...files.keys()]
            .filter((path) => path.startsWith(dir + '/'))
            .map((path) => path.slice(dir.length + 1)),
      }),
    /reviewed runtime/i,
  );
});

test('human credential creation writes Graph and exact retained object with reviewed expiry and never replaces by default', async () => {
  const { createOperatorCredentials } =
    await import('./azure-provisioning.mjs');
  const calls = [];
  const expiry = new Date(Date.now() + 90 * 86400000).toISOString();
  const options = {
    vaultUri: 'https://recovery.vault.azure.net/',
    applicationIds: {
      argocd: '11111111-1111-4111-8111-111111111111',
      dashboard: '22222222-2222-4222-8222-222222222222',
    },
    expiry,
    token: async () => 'PRIVATE_TOKEN',
    request: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === 'GET') return { status: 404, ok: false };
      if (String(url).includes('graph.microsoft.com'))
        return {
          ok: true,
          json: async () => ({
            secretText: 'PRIVATE_GRAPH_SECRET',
            keyId: '33333333-3333-4333-8333-333333333333',
            endDateTime: expiry,
          }),
        };
      return {
        ok: true,
        json: async () => ({
          ...JSON.parse(init.body),
          id: String(url).split('?')[0] + '/0123456789abcdef0123456789abcdef',
        }),
      };
    },
  };
  const result = await createOperatorCredentials(options);
  assert.equal(result.phase, 'operator-credentials-created');
  assert.equal(calls.filter((x) => x.init.method === 'POST').length, 2);
  assert.ok(
    calls
      .filter((x) => x.init.method === 'PUT')
      .every(
        (x) =>
          JSON.parse(x.init.body).attributes.exp ===
          Math.floor(Date.parse(expiry) / 1000),
      ),
  );
  await assert.rejects(
    () =>
      createOperatorCredentials({
        ...options,
        request: async () => ({
          ok: true,
          json: async () => ({ value: 'EXISTING_PRIVATE' }),
        }),
      }),
    /existing/i,
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE_GRAPH_SECRET|PRIVATE_TOKEN/,
  );
});

test('credential journal parent supplies protected file inheritance and owner verification on the actual platform', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { createPrivateDirectory, assertPrivatePath } =
    await import('./local-platform.mjs');
  const directory = mkdtempSync(
    resolve('.cache', 'credential-journal-contract-'),
  );
  try {
    createPrivateDirectory(directory);
    const file = join(directory, 'journal.json');
    writeFileSync(file, JSON.stringify({ value: 'PRIVATE_TEST_SENTINEL' }), {
      mode: 0o600,
    });
    assertPrivatePath(file, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('broker monitoring definition stores a verifiable salted hash with monitoring-only empty permissions', async () => {
  const { brokerMonitorDefinitions } = await import('./azure-provisioning.mjs');
  const password = 'PRIVATE_BROKER_MONITOR_PASSWORD_32_BYTES';
  const encoded = brokerMonitorDefinitions(password);
  const value = JSON.parse(encoded);
  assert.equal(value.users[0].name, 'equipment_backup_monitor');
  assert.deepEqual(value.users[0].tags, ['monitoring']);
  assert.deepEqual(value.permissions, [
    {
      user: 'equipment_backup_monitor',
      vhost: 'equipment',
      configure: '^$',
      write: '^$',
      read: '^$',
    },
  ]);
  assert.doesNotMatch(encoded, /PRIVATE_BROKER/);
  assert.equal(brokerMonitorDefinitions(password, encoded), encoded);
  assert.throws(
    () =>
      brokerMonitorDefinitions(
        'other-private-password-with-long-value',
        encoded,
      ),
    /paired|rotation/i,
  );
});

test('ordinary bootstrap skips credential-free fixtures only for matching established activation context', async () => {
  const { validateActivationContext } =
    await import('./azure-provisioning.mjs');
  const config = {
    environment: 'learning',
    generation: 'lab2026',
    gitRevision: 'a'.repeat(40),
  };
  const outputs = {
    aks_resource_id:
      '/subscriptions/sub/resourceGroups/workload/providers/Microsoft.ContainerService/managedClusters/aks',
  };
  const hashes = {
    probeDefinitionHash: 'b'.repeat(64),
    roleDefinitionHash: 'c'.repeat(64),
    productionRoleHash: 'd'.repeat(64),
    templateHash: 'e'.repeat(64),
  };
  const record = {
    version: 1,
    environment: config.environment,
    generation: config.generation,
    sourceRevision: config.gitRevision,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: 'f'.repeat(64),
    ...hashes,
    nonce: '11111111-1111-4111-8111-111111111111',
    challengeHash: '1'.repeat(64),
    proofHashes: { backup: '2'.repeat(64), restore: '3'.repeat(64) },
  };
  assert.equal(
    validateActivationContext(record, {
      config,
      outputs,
      clusterCaHash: 'f'.repeat(64),
      definitions: hashes,
    }),
    record,
  );
  assert.throws(
    () =>
      validateActivationContext(
        { ...record, generation: 'foreign' },
        { config, outputs, clusterCaHash: 'f'.repeat(64), definitions: hashes },
      ),
    /activation/i,
  );
});

test('nonadmin kubeconfig preparation uses real pinned conversion tools and absolute verified exec path', async () => {
  const { prepareUserKubeconfig } = await import('./azure-provisioning.mjs');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { verifiedTool, qualityContext } = await import('./azure-quality.mjs');
  const directory = mkdtempSync(resolve('.cache', 'azure-user-kubeconfig-'));
  assert.ok(directory.startsWith(resolve('.cache')));
  const original = globalThis.fetch;
  const config = {
    environment: 'learning',
    subscriptionId: '11111111-1111-4111-8111-111111111111',
  };
  const outputs = {
    workload_resource_group_name: 'er-learning-workload',
    aks_cluster_name: 'er-learning-aks',
    aks_resource_id: `/subscriptions/${config.subscriptionId}/resourceGroups/er-learning-workload/providers/Microsoft.ContainerService/managedClusters/er-learning-aks`,
  };
  const kube = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [
      {
        name: 'test',
        cluster: {
          server: 'https://example.invalid',
          'certificate-authority-data':
            globalThis.Buffer.from('public-test-ca').toString('base64'),
        },
      },
    ],
    contexts: [{ name: 'test', context: { cluster: 'test', user: 'test' } }],
    'current-context': 'test',
    users: [
      {
        name: 'test',
        user: {
          exec: {
            apiVersion: 'client.authentication.k8s.io/v1beta1',
            command: 'kubelogin',
            args: [
              'get-token',
              '--server-id',
              '6dae42f8-4368-4678-94ff-3960e28e3630',
              '--login',
              'azurecli',
            ],
            interactiveMode: 'IfAvailable',
          },
        },
      },
    ],
  };
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(url, /listClusterUserCredential\?/);
      assert.doesNotMatch(url, /Admin/);
      assert.equal(init.method, 'POST');
      return {
        ok: true,
        json: async () => ({
          kubeconfigs: [
            {
              value: globalThis.Buffer.from(JSON.stringify(kube)).toString(
                'base64',
              ),
            },
          ],
        }),
      };
    };
    const result = await prepareUserKubeconfig({
      config,
      outputs,
      token: async () => 'PRIVATE_TOKEN',
      stateDirectory: directory,
    });
    const actual = JSON.parse(readFileSync(result.kubeconfig, 'utf8'));
    assert.equal(
      actual.users[0].user.exec.command,
      verifiedTool(qualityContext(), 'kubelogin'),
    );
    assert.doesNotMatch(
      readFileSync(result.kubeconfig, 'utf8'),
      /PRIVATE_TOKEN/,
    );
  } finally {
    globalThis.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
test('bootstrap forwards validated full installation inputs only to the qualification publisher', async () => {
  const { readFileSync } = await import('node:fs');
  const source = ts.createSourceFile(
    'azure-provisioning.mjs',
    readFileSync(new URL('./azure-provisioning.mjs', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const calls = [];
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'publishInitialQualificationChallenge'
    )
      calls.push(node);
    ts.forEachChild(node, walk);
  };
  walk(source);
  assert.equal(calls.length, 1);
  const argument = calls[0].arguments[0];
  assert.ok(ts.isObjectLiteralExpression(argument));
  const input = argument.properties.find(
    (property) => property.name?.getText(source) === 'installationInput',
  );
  assert.ok(
    input &&
      ts.isPropertyAssignment(input) &&
      ts.isObjectLiteralExpression(input.initializer),
    'validated installation inputs must reach the actual publisher',
  );
  assert.deepEqual(
    input.initializer.properties.map((property) => property.getText(source)),
    ['config', 'foundation', 'environment'],
  );
});
