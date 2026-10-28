import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

test('public qualification producer rejects local identity before private input reads or Azure execution', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/azure-qualification.mjs',
      'prove',
      '--config',
      'PRIVATE-UNREAD-CONFIG',
      '--locator',
      'PRIVATE-UNREAD-LOCATOR',
      '--actor',
      'backup',
      '--nonce',
      '11111111-1111-4111-8111-111111111111',
    ],
    { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hosted/i);
  assert.doesNotMatch(result.stderr, /PRIVATE-UNREAD|node:internal/);
});

test('qualification probe retains actual private subprocess status and rejects non-403 denial or absent upgrade', async () => {
  const { createKubectlQualificationProbe } =
    await import('./azure-qualification.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'qualification-'));
  const fixture = join(directory, 'kubectl.mjs');
  writeFileSync(
    fixture,
    `const args=process.argv.slice(2);let input='';for await(const chunk of process.stdin)input+=chunk;if(args.includes('exec')){console.error('I1026 "Request" verb="POST" url="https://cluster/api/v1/namespaces/equipment-recovery/pods/equipment-backup-client/exec?command=true"');console.error('I1026 round_trippers.go: Response Status: 101 Switching Protocols in 1 milliseconds');process.exit(0);}const path=args[args.indexOf('--raw')+1];console.error('I1026 "Request" verb="POST" url="https://cluster'+path+'"');if(args.some(x=>x.includes('wrong-status'))){console.error('I1026 "Response" status="404 Not Found"');process.exit(1);}console.error('I1026 "Response" status="403 Forbidden"');console.error('PRIVATE-TOKEN-MARKER');process.exit(1);`,
  );
  try {
    const probe = createKubectlQualificationProbe({
      kubeconfig: 'private',
      command: process.execPath,
      prefix: [fixture],
    });
    assert.equal((await probe.ownExec('backup')).httpStatus, 101);
    assert.equal(
      (
        await probe.deny(
          'POST',
          '/api/v1/namespaces/equipment-recovery/pods/equipment-restore-client/exec',
          {},
        )
      ).httpStatus,
      403,
    );
    await assert.rejects(
      probe.deny(
        'POST',
        '/api/v1/namespaces/equipment-recovery/secrets/wrong-status',
        {},
      ),
      (error) => {
        assert.doesNotMatch(error.message, /PRIVATE-TOKEN-MARKER/);
        return true;
      },
    );
    await assert.rejects(probe.ownExec('administrator'), /actor/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  'pinned kubectl emits actual PATCH scale/spec requests and qualification observes exact 200 and 403',
  { skip: !process.env.KUBECTL },
  async () => {
    const { createKubectlQualificationProbe } =
      await import('./azure-qualification.mjs');
    const calls = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      calls.push([request.method, url.pathname]);
      response.setHeader('content-type', 'application/json');
      let value;
      if (url.pathname === '/api')
        value = { kind: 'APIVersions', apiVersion: 'v1', versions: ['v1'] };
      else if (url.pathname === '/apis')
        value = {
          kind: 'APIGroupList',
          apiVersion: 'v1',
          groups: [
            {
              name: 'apps',
              versions: [{ groupVersion: 'apps/v1', version: 'v1' }],
              preferredVersion: { groupVersion: 'apps/v1', version: 'v1' },
            },
          ],
        };
      else if (url.pathname === '/apis/apps/v1')
        value = {
          kind: 'APIResourceList',
          apiVersion: 'v1',
          groupVersion: 'apps/v1',
          resources: [
            {
              name: 'deployments',
              singularName: 'deployment',
              namespaced: true,
              kind: 'Deployment',
              verbs: ['get', 'patch'],
            },
            {
              name: 'deployments/scale',
              namespaced: true,
              kind: 'Scale',
              verbs: ['get', 'patch'],
            },
          ],
        };
      else if (request.method === 'POST' && url.pathname.endsWith('/jobs')) {
        let body = '';
        for await (const chunk of request) body += chunk;
        const job = JSON.parse(body);
        assert.equal(url.searchParams.get('dryRun'), 'All');
        if (job.metadata.name === 'allowed') {
          response.statusCode = 201;
          value = job;
        } else {
          response.statusCode =
            job.metadata.name === 'authentication-denial' ? 403 : 422;
          value = {
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            code: response.statusCode,
            reason: 'Invalid',
            message:
              response.statusCode === 422
                ? 'ValidatingAdmissionPolicy equipment-verification-jobs with binding equipment-verification-jobs denied request'
                : 'cannot create jobs',
          };
        }
      } else if (
        request.method === 'PUT' &&
        url.pathname.includes('/secrets/')
      ) {
        let body = '';
        for await (const chunk of request) body += chunk;
        value = JSON.parse(body);
        if (value.metadata.resourceVersion === 'stale') {
          response.statusCode = 409;
          value = {
            apiVersion: 'v1',
            kind: 'Status',
            status: 'Failure',
            reason: 'Conflict',
            code: 409,
            message: 'PRIVATE-SECRET-CONFLICT',
          };
        } else {
          value.metadata.resourceVersion = 'new-version';
          response.statusCode = 200;
        }
      } else if (
        request.method === 'PATCH' &&
        url.pathname.endsWith('/scale')
      ) {
        let body = '';
        for await (const chunk of request) body += chunk;
        assert.deepEqual(JSON.parse(body), { spec: { replicas: 1 } });
        value = {
          apiVersion: 'autoscaling/v1',
          kind: 'Scale',
          metadata: {
            name: 'equipment-qualification-writer',
            namespace: 'equipment-recovery',
          },
          spec: { replicas: 1 },
        };
      } else {
        response.statusCode = 403;
        value = {
          kind: 'Status',
          apiVersion: 'v1',
          status: 'Failure',
          reason: 'Forbidden',
          code: 403,
          message: 'forbidden',
        };
      }
      response.end(JSON.stringify(value));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const directory = mkdtempSync(join(tmpdir(), 'qualification-native-'));
    const kubeconfig = join(directory, 'kubeconfig.json');
    writeFileSync(
      kubeconfig,
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [
          {
            name: 'fixture',
            cluster: { server: `http://127.0.0.1:${server.address().port}` },
          },
        ],
        users: [{ name: 'fixture', user: {} }],
        contexts: [
          { name: 'fixture', context: { cluster: 'fixture', user: 'fixture' } },
        ],
        'current-context': 'fixture',
      }),
      { mode: 0o600 },
    );
    try {
      const probe = createKubectlQualificationProbe({
        kubeconfig,
        command: process.env.KUBECTL,
      });
      assert.equal(
        (
          await probe.noOpScale(
            'equipment-recovery',
            'equipment-qualification-writer',
            1,
            true,
          )
        ).httpStatus,
        200,
      );
      assert.equal(
        (
          await probe.denySpecWrite(
            'deployment',
            'equipment-recovery',
            'equipment-qualification-writer',
          )
        ).httpStatus,
        403,
      );
      assert.equal(
        (
          await probe.admissionCheck(
            'jobs',
            { kind: 'Job', metadata: { name: 'allowed' } },
            true,
          )
        ).httpStatus,
        201,
      );
      assert.equal(
        (
          await probe.admissionCheck(
            'jobs',
            { kind: 'Job', metadata: { name: 'invalid' } },
            false,
          )
        ).httpStatus,
        422,
      );
      await assert.rejects(
        probe.admissionCheck(
          'jobs',
          { kind: 'Job', metadata: { name: 'authentication-denial' } },
          false,
        ),
        /qualification/i,
      );
      const replacement = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'letsencrypt-production-account',
          namespace: 'cert-manager',
          resourceVersion: 'current',
        },
        type: 'Opaque',
        data: { 'tls.key': 'UFJJVkFURQ==' },
      };
      assert.equal(
        (
          await probe.replaceContinuitySecret(
            'cert-manager',
            'letsencrypt-production-account',
            replacement,
          )
        ).value.metadata.resourceVersion,
        'new-version',
      );
      replacement.metadata.resourceVersion = 'stale';
      assert.deepEqual(
        await probe.replaceContinuitySecret(
          'cert-manager',
          'letsencrypt-production-account',
          replacement,
        ),
        { conflict: true },
      );
      await assert.rejects(
        probe.replaceContinuitySecret(
          'cert-manager',
          'internal-root-key',
          replacement,
        ),
        /qualification/i,
      );
      assert.ok(
        calls.some(
          ([method, path]) => method === 'PATCH' && path.endsWith('/scale'),
        ),
      );
      assert.equal(
        calls.some(
          ([method, path]) =>
            method === 'GET' && path.includes('/deployments/'),
        ),
        false,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test('initial v2 proof validation rejects ambiguous anchor/code identities and missing or forged actual request outcomes', async () => {
  const { validateInitialQualificationRecords } =
    await import('./azure-qualification.mjs');
  const { createHash } = await import('node:crypto');
  const canonical = (v) =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const digest = (v) =>
    createHash('sha256')
      .update(JSON.stringify(canonical(v)))
      .digest('hex');
  const revision = 'a'.repeat(40),
    code = 'b'.repeat(40),
    anchor = 'c'.repeat(40);
  const now = Date.now();
  const config = {
    environment: 'lab',
    generation: 'generation1',
    gitRevision: anchor,
    subscriptionId: 'subscription',
    tenantId: 'tenant',
  };
  const principals = {
    backup: '11111111-1111-4111-8111-111111111111',
    restore: '22222222-2222-4222-8222-222222222222',
  };
  const outputs = {
    aks_resource_id:
      '/subscriptions/subscription/resourceGroups/rg/providers/Microsoft.ContainerService/managedClusters/aks',
    github_principal_ids: principals,
  };
  const definitions = {
    probeDefinitionHash: 'd'.repeat(64),
    roleDefinitionHash: 'e'.repeat(64),
    productionRoleHash: 'f'.repeat(64),
    templateHash: '0'.repeat(64),
  };
  const installationState = {
    version: 1,
    generation: config.generation,
    outputHash: '3'.repeat(64),
    source: { files: [], hash: '4'.repeat(64) },
    target: { files: [], hash: '5'.repeat(64) },
  };
  const challenge = {
    installationState,
    definitionManifest: {
      version: 1,
      modules: [],
      assets: [],
      runtime: { node: '24.15.0', packages: [] },
    },
    version: 2,
    mode: 'activation',
    environment: 'lab',
    generation: 'generation1',
    subscriptionId: 'subscription',
    tenantId: 'tenant',
    infrastructureAnchorRevision: anchor,
    sourceRevision: revision,
    actualProbeCodeRevision: revision,
    clusterId: outputs.aks_resource_id,
    clusterCaHash: '1'.repeat(64),
    ...definitions,
    principals,
    nonce: '33333333-3333-4333-8333-333333333333',
    issued: new Date(now - 10000).toISOString(),
    expires: new Date(now + 60000).toISOString(),
    fixtures: {
      backup: { podUid: principals.backup, bindingUid: principals.backup },
      restore: { podUid: principals.restore, bindingUid: principals.restore },
    },
  };
  const requests = (actor) => [
    {
      verb: 'connect',
      resource: 'pods/exec',
      namespace: 'equipment-recovery',
      name: `equipment-${actor}-client`,
      httpStatus: 101,
      outcome: 'allowed',
    },
    {
      verb: 'create',
      resource: 'pods/exec',
      namespace: 'equipment-recovery',
      name: `equipment-${actor === 'backup' ? 'restore' : 'backup'}-client`,
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
      name: `equipment-${actor}-client`,
      httpStatus: 201,
      outcome: 'allowed',
    },
  ];
  const proofs = Object.fromEntries(
    ['backup', 'restore'].map((actor) => [
      actor,
      {
        ...globalThis.structuredClone(challenge),
        principalId: principals[actor],
        actualProbeCodeRevision: code,
        challengeHash: digest(challenge),
        started: new Date(now - 5000).toISOString(),
        completed: new Date(now - 1000).toISOString(),
        requests: requests(actor),
      },
    ]),
  );
  const settings = {
    challenge,
    proofs,
    config,
    outputs,
    definitions,
    clusterCaHash: challenge.clusterCaHash,
    installationState,
    now,
  };
  const result = validateInitialQualificationRecords(settings);
  assert.equal(result.challengeHash, digest(challenge));
  assert.equal(result.proofHashes.backup, digest(proofs.backup));
  const { createRecoveryActivationRecord, assertRecoveryActivationRecord } =
    await import('./azure-recovery-activation.mjs');
  const record = createRecoveryActivationRecord(settings);
  assertRecoveryActivationRecord(record, record);
  assert.equal(record.challengeHash, result.challengeHash);
  assert.equal(Object.hasOwn(record, 'activationRecordHash'), false);
  assert.throws(
    () =>
      assertRecoveryActivationRecord({ ...record, qualified: true }, record),
    /activation/i,
  );
  for (const mutate of [
    (x) => (x.challenge.version = 1),
    (x) => delete x.proofs.backup.actualProbeCodeRevision,
    (x) => delete x.proofs.restore.definitionManifest,
    (x) => delete x.proofs.restore.installationState,
    (x) => (x.proofs.restore.infrastructureAnchorRevision = revision),
    (x) => (x.proofs.backup.principalId = principals.restore),
    (x) => x.proofs.backup.requests.pop(),
    (x) => (x.proofs.restore.requests[1].httpStatus = 404),
    (x) => (x.challenge.expires = new Date(now - 1).toISOString()),
    (x) => (x.proofs.backup.completed = new Date(now + 10000).toISOString()),
    (x) => (x.proofs.restore.templateHash = '2'.repeat(64)),
    (x) => (x.proofs.restore.installationState.target.hash = '6'.repeat(64)),
  ]) {
    const changed = globalThis.structuredClone(settings);
    mutate(changed);
    assert.throws(
      () => validateInitialQualificationRecords(changed),
      /qualification/i,
    );
  }
});

test('recurring evidence reads exact current-generation actor proof and consumption paths without list or foreign fallback', async () => {
  const { readRecoveryActivationReceipts } =
    await import('./azure-qualification.mjs');
  const paths = [];
  let denied = false;
  const server = createServer((request, response) => {
    paths.push(request.url);
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer PRIVATE-TOKEN');
    if (denied && request.url.includes('qualification-restore')) {
      response.writeHead(403).end('PRIVATE-DENIAL');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const nonce = '11111111-1111-4111-8111-111111111111';
  const settings = {
    config: { environment: 'learning', generation: 'lab2026' },
    outputs: { recovery_storage_account_name: 'recoveryaccount' },
    nonce,
    token: async () => 'PRIVATE-TOKEN',
    request: (url, options) =>
      globalThis.fetch(
        'http://127.0.0.1:' + server.address().port + new URL(url).pathname,
        options,
      ),
  };
  try {
    const actual = await readRecoveryActivationReceipts(settings);
    assert.equal(
      actual.proofs.backup.path,
      `/qualification-backup/activation/learning/lab2026/${nonce}/backup.json`,
    );
    assert.equal(
      actual.proofs.restore.path,
      `/qualification-restore/activation/learning/lab2026/${nonce}/restore.json`,
    );
    assert.equal(
      actual.consumption.path,
      `/qualification-challenges/consumption/learning/lab2026/${nonce}.json`,
    );
    assert.equal(paths.length, 4);
    denied = true;
    await assert.rejects(readRecoveryActivationReceipts(settings), (error) => {
      assert.doesNotMatch(error.message, /PRIVATE-/);
      return true;
    });
    const before = paths.length;
    await assert.rejects(
      readRecoveryActivationReceipts({ ...settings, nonce: '../foreign' }),
      /qualification/i,
    );
    assert.equal(paths.length, before);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
