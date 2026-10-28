import assert from 'node:assert/strict';
import test from 'node:test';

test('unfinished protected guard operations fail the mandatory G3 prerequisite before provider access', async () => {
  const { executeGuardQualification } = await import('./azure-terraform.mjs');
  await assert.rejects(
    executeGuardQualification({
      purpose: 'human-policy-family',
      config: {},
      foundation: { vault_guard: {} },
    }),
    /Mandatory reviewed G3.*blocked/,
  );
});

test('normalized creation and grant plans cannot cross the unqualified operational grant gap', async () => {
  const { validateGuardPlan } = await import('./azure-terraform.mjs');
  const expected = {
    workloadVaultId:
      '/subscriptions/sub/resourceGroups/workload/providers/Microsoft.KeyVault/vaults/actual',
    networkRoleId:
      '/subscriptions/sub/providers/Microsoft.Authorization/roleDefinitions/network',
    principals: {
      backup: 'backup-id',
      restore: 'restore-id',
      reaper: 'reaper-id',
    },
  };
  const entry = (actor) => ({
    address: `azurerm_role_assignment.workload_vault_network["${actor}"]`,
    type: 'azurerm_role_assignment',
    change: {
      actions: ['create'],
      after: {
        scope: expected.workloadVaultId,
        role_definition_id: expected.networkRoleId,
        principal_id: expected.principals[actor],
        principal_type: 'ServicePrincipal',
      },
    },
  });
  const creation = {
    format_version: '1.2',
    resource_changes: [
      {
        address: 'azurerm_key_vault.workload',
        type: 'azurerm_key_vault',
        change: { actions: ['create'], after: {} },
      },
    ],
  };
  assert.doesNotThrow(() =>
    validateGuardPlan(creation, { ...expected, phase: 'creation' }),
  );
  assert.throws(
    () =>
      validateGuardPlan(
        {
          ...creation,
          resource_changes: [...creation.resource_changes, entry('backup')],
        },
        { ...expected, phase: 'creation' },
      ),
    /guard plan/,
  );
  const grant = {
    format_version: '1.2',
    resource_changes: ['backup', 'restore', 'reaper'].map(entry),
  };
  assert.doesNotThrow(() =>
    validateGuardPlan(grant, { ...expected, phase: 'grant' }),
  );
  assert.throws(
    () =>
      validateGuardPlan(
        {
          ...grant,
          resource_changes: [
            ...grant.resource_changes,
            ...creation.resource_changes,
          ],
        },
        { ...expected, phase: 'grant' },
      ),
    /guard plan/,
  );
  const foreign = entry('backup');
  foreign.change.after.principal_id = 'foreign';
  assert.throws(
    () =>
      validateGuardPlan(
        { ...grant, resource_changes: [foreign] },
        { ...expected, phase: 'grant' },
      ),
    /guard plan/,
  );
  const renamed = entry('backup');
  renamed.address = 'azurerm_role_assignment.disguised';
  assert.throws(
    () =>
      validateGuardPlan(
        { ...grant, resource_changes: [renamed] },
        { ...expected, phase: 'creation' },
      ),
    /guard plan/,
  );
  const computed = entry('backup');
  computed.change.after_unknown = { id: true, name: true };
  assert.doesNotThrow(() =>
    validateGuardPlan(
      { ...grant, resource_changes: [computed] },
      { ...expected, phase: 'grant' },
    ),
  );
  computed.change.after_unknown.principal_id = true;
  assert.throws(
    () =>
      validateGuardPlan(
        { ...grant, resource_changes: [computed] },
        { ...expected, phase: 'grant' },
      ),
    /guard plan/,
  );
  assert.throws(
    () =>
      validateGuardPlan(
        {
          ...creation,
          planned_values: {
            root_module: {
              resources: [
                {
                  address: renamed.address,
                  type: renamed.type,
                  values: renamed.change.after,
                },
              ],
            },
          },
        },
        { ...expected, phase: 'creation' },
      ),
    /guard plan/,
  );
});
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('saved plan binds inputs, tool policy, state and reviewed revision before exact apply', async (t) => {
  const { planDeployment, applyDeployment } =
    await import('./azure-terraform.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-plan-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let state = { lineage: 'isolated-state', serial: 1 };
  const calls = [];
  let normalized = 0;
  let consumed = 0;
  const context = {
    directory,
    revision: 'a'.repeat(40),
    inputHash: 'b'.repeat(64),
    policyHash: 'c'.repeat(64),
    state: async () => state,
    run: async (args) => {
      calls.push(args[0]);
      if (args[0] === 'plan')
        writeFileSync(
          args.find((arg) => arg.startsWith('-out=')).slice(5),
          'PRIVATE_PLAN',
        );
      if (args[0] === 'show')
        return JSON.stringify({
          format_version: '1.2',
          resource_changes: [
            { type: 'azurerm_resource_group', change: { actions: ['create'] } },
          ],
        });
      return '';
    },
    scan: async () => {},
    persist: async () => {},
    validatePlan: async () => {
      normalized++;
    },
    beforeApply: async ({ review, savedPlanPath }) => {
      assert.equal(readFileSync(savedPlanPath, 'utf8'), 'PRIVATE_PLAN');
      assert.match(review.planHash, /^[a-f0-9]{64}$/);
      consumed++;
    },
    assertRevision: async () => {},
  };
  const review = await planDeployment(context);
  assert.equal(review.stateSerial, 1);
  assert.equal(review.actions.create, 1);
  assert.ok(!JSON.stringify(review).includes('PRIVATE_PLAN'));
  state = { ...state, serial: 2 };
  await assert.rejects(() => applyDeployment(context, review), /review/i);
  assert.equal(calls.includes('apply'), false);
  state.serial = 1;
  context.requalify = async () => {
    const { OperationalFailure } = await import('./process.mjs');
    throw new OperationalFailure(
      'Audit observation expired; re-plan required.',
    );
  };
  await assert.rejects(
    () => applyDeployment(context, review),
    /Audit observation expired/,
  );
  assert.equal(calls.includes('apply'), false);
  context.requalify = undefined;
  await applyDeployment(context, review);
  assert.equal(calls.at(-1), 'apply');
  assert.equal(normalized, 2);
  assert.equal(consumed, 1);
  assert.equal(
    readFileSync(join(directory, 'saved.tfplan'), 'utf8'),
    'PRIVATE_PLAN',
  );
});

test('scanner failure never publishes a saved plan or permits apply', async (t) => {
  const { planDeployment } = await import('./azure-terraform.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-plan-fail-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let published = false;
  await assert.rejects(
    () =>
      planDeployment({
        directory,
        revision: 'a'.repeat(40),
        inputHash: 'b'.repeat(64),
        policyHash: 'c'.repeat(64),
        assertRevision: async () => {},
        state: async () => ({ lineage: 'state', serial: 0 }),
        run: async (args) => {
          if (args[0] === 'plan')
            writeFileSync(join(directory, 'saved.tfplan'), 'PRIVATE_PLAN');
          return '{}';
        },
        scan: async () => {
          throw Error('PRIVATE_SCANNER_MARKER');
        },
        persist: async () => {
          published = true;
        },
      }),
    /scan|plan/i,
  );
  assert.equal(published, false);
});

test('verified remote foundation authority survives later binding and missing markers never reset state', async () => {
  const { foundationBackendMode } = await import('./azure-terraform.mjs');
  const marker = {
    version: 1,
    backendHash: 'a'.repeat(64),
    lineage: 'retained-state',
    serial: 2,
  };
  const remote = { lineage: 'retained-state', serial: 3 };
  assert.equal(
    foundationBackendMode({
      marker,
      backendHash: marker.backendHash,
      remote,
      accountExists: true,
    }),
    'remote',
  );
  assert.throws(
    () =>
      foundationBackendMode({
        backendHash: marker.backendHash,
        remote,
        accountExists: true,
      }),
    /recover|authority/i,
  );
  assert.throws(
    () =>
      foundationBackendMode({
        marker,
        backendHash: 'b'.repeat(64),
        remote,
        accountExists: true,
      }),
    /authority/i,
  );
  assert.equal(
    foundationBackendMode({
      backendHash: marker.backendHash,
      accountExists: false,
    }),
    'local',
  );
});

test('controlled Terraform CLI ignores ambient debug, reattach, user overrides and case variants in a real child', async () => {
  const { controlledTerraformEnvironment, qualityContext, verifiedTool } =
    await import('./azure-quality.mjs');
  const { spawnSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-cli-security-'));
  try {
    const hostile = join(directory, 'hostile.tfrc');
    writeFileSync(
      hostile,
      'provider_installation { dev_overrides { "hashicorp/azurerm" = "PRIVATE_OVERRIDE_MARKER" } }',
    );
    const leaked = join(directory, 'provider-debug.log');
    const environment = controlledTerraformEnvironment(
      {
        ...process.env,
        TF_CLI_CONFIG_FILE: hostile,
        tf_log: 'TRACE',
        TF_LOG_PATH: leaked,
        TF_REATTACH_PROVIDERS: 'PRIVATE_REATTACH_MARKER',
        TF_VAR_private: 'PRIVATE_SECRET_MARKER',
      },
      qualityContext(),
    );
    const actual = spawnSync(
      verifiedTool(qualityContext(), 'terraform'),
      ['version', '-json'],
      { cwd: directory, env: environment, encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(actual.status, 0, actual.stderr);
    assert.equal(existsSync(leaked), false);
    assert.ok(
      !Object.keys(environment).some((key) =>
        /^TF_(LOG|REATTACH|VAR_)/i.test(key),
      ),
    );
    assert.doesNotMatch(actual.stdout + actual.stderr, /PRIVATE_/);
    assert.notEqual(environment.TF_CLI_CONFIG_FILE, hostile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('foundation source synchronization removes stale executable configuration while retaining authoritative state', async () => {
  const { synchronizeTerraformSource, assertTerraformSource } =
    await import('./azure-terraform.mjs');
  const { mkdirSync, existsSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-stage-security-'));
  const original = join(directory, 'original');
  const staged = join(directory, 'staged');
  mkdirSync(original);
  mkdirSync(staged);
  try {
    writeFileSync(
      join(original, 'main.tf'),
      'output "current" { value = "reviewed" }',
    );
    for (const file of ['removed.tf', 'override.tf', 'injected.tf.json'])
      writeFileSync(join(staged, file), 'PRIVATE_STALE_CONFIGURATION');
    writeFileSync(join(staged, 'terraform.tfstate'), 'AUTHORITATIVE_STATE');
    writeFileSync(join(staged, 'remote-authority.json'), 'MIGRATION_EVIDENCE');
    const inventory = synchronizeTerraformSource(original, staged);
    assert.equal(existsSync(join(staged, 'removed.tf')), false);
    assert.equal(
      readFileSync(join(staged, 'terraform.tfstate'), 'utf8'),
      'AUTHORITATIVE_STATE',
    );
    assertTerraformSource(staged, inventory);
    writeFileSync(join(staged, 'override.tf'), 'injected');
    assert.throws(
      () => assertTerraformSource(staged, inventory),
      /configuration/i,
    );
    assert.equal(
      readFileSync(join(staged, 'remote-authority.json'), 'utf8'),
      'MIGRATION_EVIDENCE',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('real Terraform next plan excludes deleted staged source and leaves existing state byte-for-byte intact', async () => {
  const { synchronizeTerraformSource } = await import('./azure-terraform.mjs');
  const { qualityContext, verifiedTool, controlledTerraformEnvironment } =
    await import('./azure-quality.mjs');
  const { spawnSync } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-stage-plan-'));
  const original = join(directory, 'source');
  const staged = join(directory, 'staged');
  mkdirSync(original);
  mkdirSync(staged);
  try {
    writeFileSync(
      join(original, 'main.tf'),
      'output "current" { value = "approved" }',
    );
    writeFileSync(
      join(staged, 'removed.tf'),
      'output "unreviewed" { value = "PRIVATE_STALE_MARKER" }',
    );
    writeFileSync(join(staged, 'override.tf.json'), 'INVALID_STALE_JSON');
    const state = JSON.stringify({
      version: 4,
      terraform_version: '1.17.0',
      serial: 3,
      lineage: '11111111-1111-4111-8111-111111111111',
      outputs: {},
      resources: [],
    });
    writeFileSync(join(staged, 'terraform.tfstate'), state);
    synchronizeTerraformSource(original, staged);
    const executable = verifiedTool(qualityContext(), 'terraform');
    const env = controlledTerraformEnvironment();
    for (const args of [
      ['init', '-backend=false', '-input=false'],
      [
        'plan',
        '-refresh=false',
        '-lock=false',
        '-input=false',
        '-out=approved.tfplan',
      ],
    ]) {
      const result = spawnSync(executable, args, {
        cwd: staged,
        env,
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /PRIVATE_STALE_MARKER/,
      );
    }
    const shown = spawnSync(executable, ['show', '-json', 'approved.tfplan'], {
      cwd: staged,
      env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(shown.status, 0, shown.stderr);
    const plan = JSON.parse(shown.stdout);
    assert.equal(plan.planned_values.outputs.current.value, 'approved');
    assert.equal(plan.planned_values.outputs.unreviewed, undefined);
    assert.equal(
      readFileSync(join(staged, 'terraform.tfstate'), 'utf8'),
      state,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('foundation maintenance requires permanent admitted runner and unchanged ACLs while using only the global lease', async () => {
  const { withPermanentFoundationAccess } =
    await import('./azure-terraform.mjs');
  const config = {
    environment: 'learning',
    gitRevision: 'a'.repeat(40),
    operatorCidrs: ['8.8.8.0/24'],
  };
  const events = [];
  const provider = {
    acquire: async () => events.push('acquire'),
    renew: async () => {},
    release: async () => events.push('release'),
    readRecord: async () => ({}),
    writeRecord: async () => {},
  };
  let changed = false;
  let tagged = false;
  const foreignTags = {
    'equipment-admission-11111111-1111-4111-8111-111111111111': JSON.stringify({
      cidr: '9.9.9.9/32',
      expires: new Date(Date.now() + 60000).toISOString(),
    }),
  };
  const networkProvider = {
    readResource: async () => ({
      ranges: changed ? ['8.8.8.0/24', '9.9.9.9/32'] : ['8.8.8.0/24'],
      tags: tagged ? foreignTags : {},
      raw: {
        properties: { networkAcls: { defaultAction: 'Deny', bypass: 'None' } },
      },
    }),
    writeResource: async () => {
      throw Error('NETWORK_MUTATION_FORBIDDEN');
    },
    writeGate: async () => {
      throw Error('DNS_MUTATION_FORBIDDEN');
    },
  };
  let entered = false;
  await assert.rejects(
    () =>
      withPermanentFoundationAccess(
        {
          config,
          provider,
          networkProvider,
          runnerCidr: '9.9.9.9/32',
          operation: 'apply',
        },
        async () => {
          entered = true;
        },
      ),
    /persistent|permanent/i,
  );
  assert.equal(entered, false);
  assert.deepEqual(events, []);
  await withPermanentFoundationAccess(
    {
      config,
      provider,
      networkProvider,
      runnerCidr: '8.8.8.8/32',
      operation: 'plan',
    },
    async ({ verify }) => {
      entered = true;
      await verify();
    },
  );
  assert.deepEqual(events, ['acquire', 'release']);
  await assert.rejects(
    () =>
      withPermanentFoundationAccess(
        {
          config,
          provider,
          networkProvider,
          runnerCidr: '8.8.8.8/32',
          operation: 'apply',
        },
        async ({ verify }) => {
          tagged = true;
          await verify();
        },
      ),
    /baseline|admission/i,
  );
  assert.deepEqual(events, ['acquire', 'release', 'acquire', 'release']);
  tagged = false;
  assert.equal(Object.keys(foreignTags).length, 1);
  changed = false;
  entered = false;
  await assert.rejects(
    () =>
      withPermanentFoundationAccess(
        {
          config,
          provider: {
            ...provider,
            acquire: async () => {
              throw Error('PRIVATE_LEASE_CONFLICT');
            },
          },
          networkProvider,
          runnerCidr: '8.8.8.8/32',
          operation: 'apply',
        },
        async () => {
          entered = true;
        },
      ),
    /lease acquire failed/,
  );
  assert.equal(entered, false);
  assert.deepEqual(events, ['acquire', 'release', 'acquire', 'release']);
  changed = true;
  await assert.rejects(
    () =>
      withPermanentFoundationAccess(
        {
          config,
          provider,
          networkProvider,
          runnerCidr: '8.8.8.8/32',
          operation: 'apply',
        },
        async () => {},
      ),
    /baseline|admission/i,
  );
});

test('real Git phase revisions advance through runtime and app commits while the generation anchor stays fixed', async () => {
  const {
    assertPhaseRevision,
    verifyTrustedMainRevision,
    verifyInfrastructureRevision,
  } = await import('./azure-terraform.mjs');
  const { spawnSync } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-phase-revision-'));
  mkdirSync(join(directory, 'deploy'));
  mkdirSync(join(directory, 'src'));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=', ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '--quiet');
    writeFileSync(join(directory, 'deploy', 'initial.json'), '{}');
    git('add', '.');
    git(
      '-c',
      'user.name=Contract',
      '-c',
      'user.email=contract@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'initial infra',
    );
    const anchor = git('rev-parse', 'HEAD');
    const config = {
      gitRevision: anchor,
      githubRepository: 'owner/project',
      subscriptionId: '22222222-2222-4222-8222-222222222222',
      tenantId: '33333333-3333-4333-8333-333333333333',
    };
    assertPhaseRevision(config, anchor, { root: directory });
    // Real Git cleanliness stays in the boundary; only CLI identity and GitHub
    // responses are doubled. Backend eligibility is covered by its existing API.
    const preview = {
      config,
      revision: anchor,
      initialFoundationPreview: true,
      stage: 'foundation-bootstrap',
      auditStage: 'create',
      networkGateReady: false,
      bootstrapOperatorObjectId: '11111111-1111-4111-8111-111111111111',
    };
    const options = {
      root: directory,
      environment: {},
      run: (args) =>
        args[0] === 'account'
          ? {
              user: { type: 'user' },
              id: config.subscriptionId,
              tenantId: config.tenantId,
            }
          : { id: preview.bootstrapOperatorObjectId },
      request: async () => ({
        ok: true,
        json: async () => ({ sha: '0'.repeat(40) }),
      }),
    };
    await verifyInfrastructureRevision('plan', preview, options);
    for (const change of [
      { initialFoundationPreview: 'true' },
      { initialFoundationPreview: null },
      { stage: 'environment' },
      { auditStage: 'bind' },
      { auditStage: 'enable' },
      { networkGateReady: true },
      { networkGateReady: null },
      { auditStage: null },
      { familyHandlePath: 'family.json' },
      { familyHandlePath: '' },
      { generationHandlePath: 'generation.json' },
      { bootstrapLocator: 'locator.json' },
      { foundation: {} },
      { environment: {} },
    ])
      await assert.rejects(
        () =>
          verifyInfrastructureRevision(
            'plan',
            { ...preview, ...change },
            options,
          ),
        /preview/i,
      );
    await assert.rejects(
      () => verifyInfrastructureRevision('apply', preview, options),
      /preview/i,
    );
    await assert.rejects(
      () =>
        verifyInfrastructureRevision(
          'plan',
          { ...preview, initialFoundationPreview: false },
          options,
        ),
      /reviewed main/i,
    );
    for (const environment of [
      { CI: 'true' },
      { GITHUB_ACTIONS: 'true' },
      { GITHUB_RUN_ID: '123' },
      { ACTIONS_ID_TOKEN_REQUEST_URL: 'private' },
      { ARM_CLIENT_SECRET: 'private' },
      { AZURE_CLIENT_ID: 'private' },
    ])
      await assert.rejects(
        () =>
          verifyInfrastructureRevision('plan', preview, {
            ...options,
            environment,
          }),
        /preview/i,
      );
    for (const run of [
      () => ({}),
      () => ({ user: { type: 'servicePrincipal' } }),
      (args) =>
        args[0] === 'account'
          ? {
              user: { type: 'user' },
              id: config.subscriptionId,
              tenantId: config.tenantId,
            }
          : { id: 'foreign' },
    ])
      await assert.rejects(
        () =>
          verifyInfrastructureRevision('plan', preview, { ...options, run }),
        /human|preview/i,
      );
    await assert.rejects(
      () =>
        verifyInfrastructureRevision(
          'plan',
          { ...preview, revision: '0'.repeat(40) },
          options,
        ),
      /revision/i,
    );
    writeFileSync(join(directory, 'deploy', 'initial.json'), 'dirty');
    await assert.rejects(
      () => verifyInfrastructureRevision('plan', preview, options),
      /revision/i,
    );
    writeFileSync(join(directory, 'deploy', 'initial.json'), '{}');

    writeFileSync(join(directory, 'deploy', 'runtime.json'), '{}');
    git('add', '.');
    git(
      '-c',
      'user.name=Contract',
      '-c',
      'user.email=contract@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'reviewed runtime merge',
    );
    const runtime = git('rev-parse', 'HEAD');
    assertPhaseRevision(config, runtime, { root: directory });
    writeFileSync(join(directory, 'src', 'app.txt'), 'reviewed app');
    git('add', '.');
    git(
      '-c',
      'user.name=Contract',
      '-c',
      'user.email=contract@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'later app release',
    );
    const application = git('rev-parse', 'HEAD');
    assertPhaseRevision(config, application, { root: directory });
    await verifyTrustedMainRevision(config, application, {
      request: async () => ({
        ok: true,
        json: async () => ({ sha: application }),
      }),
    });
    await assert.rejects(
      () =>
        verifyTrustedMainRevision(config, application, {
          request: async () => ({
            ok: true,
            json: async () => ({ sha: runtime }),
          }),
        }),
      /reviewed main/,
    );
    assert.equal(config.gitRevision, anchor);
    assert.throws(
      () => assertPhaseRevision(config, anchor, { root: directory }),
      /revision/i,
    );
    writeFileSync(join(directory, 'deploy', 'runtime.json'), 'dirty');
    assert.throws(
      () => assertPhaseRevision(config, application, { root: directory }),
      /revision/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('initial foundation preview requires uncreated backend and cannot become an apply review', async (t) => {
  const { foundationBackendMode, planDeployment, applyDeployment } =
    await import('./azure-terraform.mjs');
  const backend = {
    initialFoundationPreview: true,
    backendHash: 'backend',
    accountExists: false,
  };
  assert.equal(foundationBackendMode(backend), 'local');
  for (const change of [
    { local: { lineage: 'local', serial: 0 } },
    { accountExists: true },
    { remote: { lineage: 'remote', serial: 0 } },
    {
      marker: {
        version: 1,
        backendHash: 'backend',
        lineage: 'remote',
        serial: 0,
      },
      remote: { lineage: 'remote', serial: 0 },
    },
  ])
    assert.throws(
      () => foundationBackendMode({ ...backend, ...change }),
      /preview/i,
    );
  const directory = mkdtempSync(join(tmpdir(), 'azure-preview-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const context = {
    directory,
    initialFoundationPreview: true,
    revision: 'a'.repeat(40),
    inputHash: 'b'.repeat(64),
    policyHash: 'c'.repeat(64),
    assertRevision: async () => {},
    state: async () => ({ lineage: 'uncreated', serial: 0 }),
    run: async (args) => {
      calls.push(args[0]);
      if (args[0] === 'plan')
        writeFileSync(
          args.find((arg) => arg.startsWith('-out=')).slice(5),
          'PRIVATE_PREVIEW',
        );
      return JSON.stringify({ format_version: '1.2', resource_changes: [] });
    },
    scan: async () => {},
    persist: async () => {},
  };
  const review = await planDeployment(context);
  assert.equal(review.initialFoundationPreview, true);
  await assert.rejects(() => applyDeployment(context, review), /preview/i);
  await assert.rejects(
    () =>
      applyDeployment({ ...context, initialFoundationPreview: false }, review),
    /preview/i,
  );
  assert.equal(calls.includes('apply'), false);
  const createdDirectory = mkdtempSync(
    join(tmpdir(), 'azure-preview-created-'),
  );
  t.after(() => rmSync(createdDirectory, { recursive: true, force: true }));
  await assert.rejects(
    () =>
      planDeployment({
        ...context,
        directory: createdDirectory,
        state: async () => ({ lineage: 'created', serial: 0 }),
      }),
    /preview/i,
  );
});
