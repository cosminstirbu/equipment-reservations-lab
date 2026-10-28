import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import parsers from '@stoplight/spectral-parsers';

const workflow = (name) =>
  parsers.Yaml.parse(readFileSync(`.github/workflows/${name}.yaml`, 'utf8'))
    .data;

test('pipeline summary accepts only proven infrastructure gates and no component publication', () => {
  const summary = (needs, event = 'pull_request') =>
    spawnSync(process.execPath, ['scripts/deployment-ci.mjs', 'summary'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: event,
        PIPELINE_NEEDS: JSON.stringify(needs),
        SELECTED_COMPONENTS: '[]',
      },
    });
  const needs = {
    quality: {
      result: 'success',
      outputs: {
        mode: 'infrastructure',
        reason: 'azure-only-changes',
        infrastructure_validated: 'true',
      },
    },
    deployment: { result: 'skipped' },
  };
  assert.equal(summary(needs).status, 0);
  assert.notEqual(
    summary({
      ...needs,
      quality: {
        result: 'success',
        outputs: { mode: 'infrastructure', reason: 'azure-only-changes' },
      },
    }).status,
    0,
  );
  assert.notEqual(
    summary({ ...needs, deployment: { result: 'success' } }).status,
    0,
  );
  const main = {
    ...needs,
    select: { result: 'skipped' },
    ...Object.fromEntries(
      [
        'inventory',
        'reservations',
        'notifications',
        'web',
        'database_bootstrap',
        'identity_bootstrap',
        'broker_bootstrap',
      ].map((name) => [`component_${name}`, { result: 'skipped' }]),
    ),
  };
  assert.equal(summary(main, 'push').status, 0);
  assert.notEqual(
    summary({ ...main, component_inventory: { result: 'success' } }, 'push')
      .status,
    0,
  );
});

test('required PR quality executes the infrastructure lane without application build or cloud identity', () => {
  const definition = workflow('pull-request');
  const steps = definition.jobs.quality.steps.filter((step) =>
    step.if?.includes("needs.scope.outputs.mode == 'infrastructure'"),
  );
  for (const command of [
    'npm run infra:tools',
    'npm run infra:check',
    'npm run infra:test',
    'node scripts/manifest-quality.mjs azure',
  ])
    assert.ok(
      steps.some((step) => step.run === command),
      command,
    );
  assert.ok(
    steps.some(
      (step) =>
        step.run?.includes('eslint') && step.run.includes('scripts/azure-'),
    ),
  );
  assert.ok(
    steps.some((step) =>
      step.run?.includes('node --test scripts/azure-*.test.mjs'),
    ),
  );
  assert.ok(
    steps.some((step) =>
      step.run?.includes('scripts/manifest-quality.test.mjs'),
    ),
  );
  assert.equal(
    steps.some((step) =>
      /azure\/login|docker\/|npm run check|dotnet build EquipmentReservation/.test(
        step.uses ?? step.run ?? '',
      ),
    ),
    false,
  );
  assert.equal(definition.jobs.quality.permissions['id-token'], undefined);
  assert.equal(
    definition.jobs.deployment.if,
    "needs.scope.outputs.mode == 'full'",
  );
});

test('PR and main publish infrastructure proof only after the complete source and manifest gates', () => {
  for (const name of ['pull-request', 'validate']) {
    const quality = workflow(name).jobs.quality;
    assert.equal(
      quality.outputs.infrastructure_validated,
      '${{ steps.azure_infrastructure_done.outputs.validated }}',
    );
    const marker = quality.steps.findIndex(
      (step) => step.id === 'azure_infrastructure_done',
    );
    const manifests = quality.steps.findIndex(
      (step) => step.run === 'node scripts/manifest-quality.mjs azure',
    );
    assert.ok(marker > manifests && manifests > 0);
    assert.equal(
      quality.steps[marker].if,
      "needs.scope.outputs.mode == 'infrastructure'",
    );
  }
});

test('Azure source checks expose no cloud identity to fork or same-repository pull requests', () => {
  const definition = workflow('azure-infrastructure');
  assert.ok(definition.on.pull_request);
  assert.equal(definition.on.pull_request_target, undefined);
  assert.deepEqual(definition.permissions, { contents: 'read' });
  const source = definition.jobs.source;
  assert.deepEqual(source.permissions, { contents: 'read' });
  assert.equal(
    source.steps.some((step) =>
      /azure\/login|infra:(apply|destroy)/.test(step.uses ?? step.run ?? ''),
    ),
    false,
  );
  assert.ok(source.steps.some((step) => step.run === 'npm run infra:check'));
  assert.ok(source.steps.some((step) => step.run === 'npm run infra:tools'));
  for (const step of source.steps.filter((step) => step.uses))
    assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.equal(source.steps[0].with['persist-credentials'], false);
});

test('unattended reaper and safety stop run trusted main with separate fixed identities and shared serialization', () => {
  const definition = workflow('azure-operations');
  assert.equal(definition.on.pull_request, undefined);
  assert.deepEqual(definition.permissions, { contents: 'read' });
  assert.equal(definition.concurrency['cancel-in-progress'], false);
  assert.ok(definition.on.schedule.some((item) => item.cron === '*/5 * * * *'));
  assert.ok(
    definition.on.schedule.some(
      (item) =>
        item.cron === '0 23 * * *' && item.timezone === 'Europe/Bucharest',
    ),
  );
  for (const [id, environment, action] of [
    ['reaper', 'azure-admission-reaper', 'reaper'],
    ['safety_stop', 'azure-safety-stop', 'safety-stop'],
  ]) {
    const job = definition.jobs[id];
    assert.equal(job.environment, environment);
    assert.match(job.if, /refs\/heads\/main/);
    assert.deepEqual(job.permissions, {
      contents: 'read',
      'id-token': 'write',
    });
    assert.equal(job.steps[0].with.ref, 'refs/heads/main');
    assert.ok(
      job.steps.some((step) =>
        step.run?.includes(`azure-operations.mjs ${action}`),
      ),
    );
    assert.ok(
      job.steps.some(
        (step) =>
          step.if === 'always()' && step.name === 'Remove private inputs',
      ),
    );
    for (const step of job.steps.filter((step) => step.uses))
      assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
});

test('initial qualification uses actual separate protected actor identities on main and a private nonce', () => {
  const definition = workflow('azure-qualification');
  assert.equal(definition.on.pull_request, undefined);
  assert.deepEqual(definition.permissions, { contents: 'read' });
  assert.equal(definition.on.workflow_dispatch.inputs.nonce, undefined);
  const job = definition.jobs.prove;
  assert.equal(job.environment, 'azure-${{ matrix.actor }}');
  assert.match(job.if, /refs\/heads\/main/);
  assert.equal(job.strategy['max-parallel'], 1);
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.ok(
    job.steps.some((step) => step.run?.includes('npm run infra:tools')),
  );
  assert.ok(
    job.steps.some(
      (step) =>
        step.run?.includes('azure-qualification-launch.sh prove') &&
        step.env?.AZURE_QUALIFICATION_NONCE ===
          '${{ secrets.AZURE_QUALIFICATION_NONCE }}',
    ),
  );
  assert.ok(
    job.steps.some(
      (step) =>
        step.if === 'always()' &&
        step.name === 'Remove private qualification inputs',
    ),
  );
});

test('Q-CI014-001 full mixed runs preserve application checks and execute every Azure gate cumulatively', () => {
  for (const name of ['pull-request', 'validate']) {
    const steps = workflow(name).jobs.quality.steps;
    for (const command of [
      'npm run infra:tools',
      'npm run infra:check',
      'npm run infra:test',
      'node scripts/manifest-quality.mjs azure',
    ]) {
      const step = steps.find((step) => step.run === command);
      assert.ok(step, `${name}: ${command}`);
      assert.equal(
        step.if,
        "needs.scope.outputs.mode == 'infrastructure' || needs.scope.outputs.mode == 'full'",
        `${name}: mixed full must run ${command}`,
      );
    }
    assert.ok(
      steps.some(
        (step) =>
          step.run === 'npm run check -- --reports' &&
          step.if === "needs.scope.outputs.mode == 'full'",
      ),
    );
  }
});

test('hosted Azure provider contracts require native Podman, pinned kind and .NET before executing without provider skips', () => {
  for (const name of ['pull-request', 'validate']) {
    const steps = workflow(name).jobs.quality.steps;
    const contracts = steps.findIndex(
      (step) => step.name === 'Azure tooling and provider contracts',
    );
    const setup = steps.findIndex(
      (step) => step.name === 'Prepare native Azure provider runtime',
    );
    assert.ok(
      setup >= 0 && setup < contracts,
      `${name}: native runtime before contracts`,
    );
    assert.equal(
      steps[setup].if,
      "needs.scope.outputs.mode == 'infrastructure' || needs.scope.outputs.mode == 'full'",
    );
    assert.match(steps[setup].run, /sudo apt-get install --yes podman/);
    assert.match(
      steps[setup].run,
      /exec sudo --non-interactive \/usr\/bin\/podman/,
    );
    assert.ok(
      steps
        .slice(0, contracts)
        .some(
          (step) =>
            step.uses?.startsWith('actions/setup-dotnet@') &&
            step.if === steps[setup].if,
        ),
    );
    assert.equal(steps[contracts].env.AZURE_PROVIDER_CONTRACTS, '1');
    assert.equal(steps[contracts].env.CONTAINER_RUNTIME, 'podman');
    assert.equal(
      steps[contracts].env.KIND,
      '${{ github.workspace }}/.cache/azure-toolchain/kind/kind',
    );
  }
});
