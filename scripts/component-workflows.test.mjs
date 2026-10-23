import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';

const names = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const id = (name) => name.replaceAll('-', '_');
const workflow = (name) =>
  parsers.Yaml.parse(readFileSync(`.github/workflows/${name}.yaml`, 'utf8'))
    .data;

test('PR validation has no publication and main release waits for Kubernetes verification', () => {
  const pr = workflow('pull-request');
  const main = workflow('validate');
  assert.ok(Object.hasOwn(pr.on, 'pull_request'));
  assert.equal(pr.on.pull_request_target, undefined);
  assert.equal(pr.on.push, undefined);
  assert.equal(main.on.pull_request, undefined);
  assert.deepEqual(pr.permissions, { contents: 'read' });
  for (const parent of [pr, main]) {
    assert.deepEqual(parent.jobs.quality.needs, ['scope']);
    assert.deepEqual(parent.jobs.deployment.needs, ['scope']);
    assert.equal(
      parent.jobs.deployment.if,
      "needs.scope.outputs.mode == 'full'",
    );
    assert.equal(
      parent.jobs.deployment.uses,
      './.github/workflows/kubernetes-verification.yaml',
    );
    assert.ok(parent.jobs.summary.needs.includes('deployment'));
  }
  assert.equal(
    Object.keys(pr.jobs).some((name) => /^(pr_|component_)/.test(name)),
    false,
  );
  assert.deepEqual(main.jobs.select.needs, ['quality', 'deployment']);
  assert.match(main.jobs.select.if, /needs.deployment.result == 'success'/);
  assert.match(main.jobs.select.if, /needs.quality.outputs.mode == 'manifest'/);
  const kubernetes = workflow('kubernetes-verification');
  assert.ok(Object.hasOwn(kubernetes.on, 'workflow_call'));
  assert.deepEqual(kubernetes.permissions, { contents: 'read' });
});

test('required quality classifies before expensive setup and preserves an authenticated full-only marker', () => {
  const parent = workflow('validate');
  const quality = parent.jobs.quality;
  const steps = quality.steps;
  const scopeSteps = parent.jobs.scope.steps;
  const classify = scopeSteps.findIndex((step) => step.id === 'quality_scope');
  assert.ok(classify > 0, 'quality classifier must exist after checkout');
  assert.equal(quality.name, 'quality');
  assert.deepEqual(quality.permissions, { contents: 'read', actions: 'read' });
  assert.equal(steps[0].with.ref, '${{ github.sha }}');
  assert.equal(steps[0].with['fetch-depth'], 0);
  assert.match(
    scopeSteps[classify].run,
    /manifest-quality\.mjs select --output/,
  );
  assert.match(scopeSteps[classify].env.GH_TOKEN, /push/);
  assert.match(scopeSteps[classify].env.GH_TOKEN, /refs\/heads\/main/);
  for (const step of steps.filter(
    (step) =>
      step.uses?.includes('setup-dotnet') ||
      /src\/Web|npm run (format-check|lint|check)|node --test/.test(
        step.run ?? '',
      ),
  )) {
    assert.equal(step.if, "needs.scope.outputs.mode == 'full'");
  }
  const marker = steps.findIndex(
    (step) => step.name === 'Full application quality completed',
  );
  assert.ok(
    marker > steps.findIndex((step) => /node --test/.test(step.run ?? '')),
  );
  assert.equal(steps[marker].if, "needs.scope.outputs.mode == 'full'");
  assert.equal(quality.outputs.mode, '${{ needs.scope.outputs.mode }}');
  assert.equal(quality.outputs.reason, '${{ needs.scope.outputs.reason }}');
  const summary = workflow('validate').jobs.summary.steps;
  assert.ok(
    summary.some((step) =>
      /needs.quality.outputs.mode/.test(step.env?.QUALITY_MODE ?? ''),
    ),
  );
});

test(
  'manifest quality shell lane invokes only pinned static validation while full lane keeps application checks',
  { skip: process.platform === 'win32' },
  (t) => {
    const steps = workflow('validate').jobs.quality.steps;
    const staticStep = steps.find((step) =>
      /manifest-quality\.mjs validate/.test(step.run ?? ''),
    );
    assert.ok(staticStep, 'manifest validation shell must exist');
    assert.equal(staticStep.if, "needs.scope.outputs.mode == 'manifest'");
    const directory = mkdtempSync(join(tmpdir(), 'quality-shell-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const log = join(directory, 'calls');
    for (const tool of ['node', 'npm']) {
      writeFileSync(
        join(directory, tool),
        '#!/bin/sh\nprintf "%s\\n" "' + tool + ' $*" >> "$QUALITY_CALLS"\n',
        { mode: 0o755 },
      );
    }
    const result = spawnSync(
      'bash',
      ['-e', '-o', 'pipefail', '-c', staticStep.run],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: directory + ':' + process.env.PATH,
          RUNNER_TEMP: directory,
          QUALITY_CALLS: log,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, 'utf8');
    assert.match(
      calls,
      /node scripts\/manifest-quality.mjs validate --selection .* --kubectl .*\/manifest-tools\/kubectl/,
    );
    assert.doesNotMatch(
      calls,
      /src\/Web|dotnet|docker|kind|npm run check|--test/,
    );
    const fullScript = steps
      .filter(
        (step) =>
          step.if === "needs.scope.outputs.mode == 'full'" &&
          step.run &&
          step.name !== 'Install pinned promotion validation tool',
      )
      .map((step) => step.run)
      .join('\n');
    writeFileSync(log, '');
    const full = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', fullScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: directory + ':' + process.env.PATH,
        QUALITY_CALLS: log,
      },
    });
    assert.equal(full.status, 0, full.stderr);
    const fullCalls = readFileSync(log, 'utf8');
    assert.match(fullCalls, /npm --prefix src\/Web ci/);
    assert.doesNotMatch(fullCalls, /npm run (format-check|lint)/);
    assert.match(fullCalls, /npm run check/);
    assert.match(fullCalls, /node --test/);
    assert.match(full.stdout, /Full application quality completed/);
    writeFileSync(join(directory, 'node'), '#!/bin/sh\nexit 19\n', {
      mode: 0o755,
    });
    const failed = spawnSync(
      'bash',
      ['-e', '-o', 'pipefail', '-c', staticStep.run],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: directory + ':' + process.env.PATH,
          RUNNER_TEMP: directory,
        },
      },
    );
    assert.equal(
      failed.status,
      19,
      'static validation failure must fail the required gate',
    );
    const install = steps.find(
      (step) => step.name === 'Install pinned static manifest tool',
    );
    assert.ok(install);
    assert.equal(install.if, "needs.scope.outputs.mode == 'manifest'");
    assert.match(install.run, /v1\.35\.8/);
    assert.match(
      install.run,
      /874d5e72dbb819f43cff16bcd1e4f8bac5b7f2361fe1e55049b0a6c676fb0cbf/,
    );
    assert.match(install.run, /--connect-timeout 5 --max-time 15/);
    assert.doesNotMatch(install.run, /kind|kubeconfig|docker/);
  },
);

test('main release keeps seven independently gated component publications', () => {
  const parent = workflow('validate');
  const calls = Object.entries(parent.jobs).filter(
    ([, job]) => job.uses && job.uses.includes('component-'),
  );
  assert.equal(calls.length, 7);
  assert.deepEqual(parent.on.push.branches, ['main']);
  assert.ok(Object.hasOwn(parent.on, 'workflow_dispatch'));
  assert.equal(parent.on.pull_request_target, undefined);
  assert.equal(parent.concurrency, undefined);
  for (const name of names) {
    const trusted = parent.jobs[`component_${id(name)}`];
    assert.equal(trusted.uses, `./.github/workflows/component-${name}.yaml`);
    assert.deepEqual(trusted.needs, ['quality', 'select']);
    assert.match(trusted.if, /!cancelled\(\)/);
    assert.match(trusted.if, /needs.select.result == 'success'/);
    assert.equal(trusted.secrets, undefined);
    assert.deepEqual(trusted.permissions, {
      contents: 'write',
      packages: 'write',
      actions: 'read',
    });
  }
});

test('full quality installs the pinned renderer before actual promotion regressions', () => {
  const steps = workflow('validate').jobs.quality.steps;
  const install = steps.findIndex(
    (step) => step.name === 'Install pinned promotion validation tool',
  );
  const checks = steps.findIndex((step) =>
    /^npm run check(?: -- --reports)?$/.test(step.run ?? ''),
  );
  assert.ok(install > 0 && install < checks);
  assert.match(
    steps[install].run,
    /874d5e72dbb819f43cff16bcd1e4f8bac5b7f2361fe1e55049b0a6c676fb0cbf/,
  );
  assert.equal(
    steps[checks].env.MANIFEST_KUBECTL,
    '${{ runner.temp }}/manifest-tools/kubectl',
  );
});

test('component parent replaces the duplicate all-image release entrypoint', () => {
  assert.equal(
    existsSync('.github/workflows/release.yaml'),
    false,
    'one parent must own quality and component publication',
  );
});

test('selection precedes immutable intent capture and the original selected set is bound into intent', () => {
  const steps = workflow('validate').jobs.select.steps;
  const selection = steps.findIndex((step) => step.id === 'select');
  const intent = steps.findIndex((step) => step.id === 'intent');
  assert.ok(
    selection < intent,
    'first-attempt selection must be captured before the immutable intent upload',
  );
  assert.equal(
    steps[selection].run,
    'node scripts/component-pipelines.mjs select --output "$RUNNER_TEMP/component-selection.json"',
  );
  assert.equal(
    steps[intent].run,
    'node scripts/component-pipelines.mjs intent --selection "$RUNNER_TEMP/component-selection.json" --output "$RUNNER_TEMP/run-intent.json"',
  );
});

test('selection producer identity matches the verified intent artifact contract', () => {
  assert.equal(workflow('validate').jobs.select.name, 'Select components');
});

test('all seven trusted wrappers own independent build promotion and queued mutation', () => {
  const available = names.filter((name) =>
    existsSync(`.github/workflows/component-${name}.yaml`),
  );
  assert.deepEqual(
    available,
    names,
    'every deployable component needs its own reusable workflow',
  );
  for (const name of names) {
    const wrapper = workflow(`component-${name}`);
    assert.ok(Object.hasOwn(wrapper.on, 'workflow_call'));
    assert.equal(
      wrapper.jobs.build.uses,
      './.github/workflows/component-build.yaml',
    );
    assert.equal(wrapper.jobs.build.with.component, name);
    assert.equal(wrapper.jobs.build.with.publish, true);
    assert.deepEqual(wrapper.jobs.build.permissions, {
      contents: 'read',
      packages: 'write',
      actions: 'read',
    });
    assert.deepEqual(wrapper.jobs.promote.needs, ['build']);
    assert.deepEqual(wrapper.jobs.promote.permissions, {
      contents: 'write',
      actions: 'read',
    });
    assert.deepEqual(wrapper.jobs.promote.concurrency, {
      group: 'local-component-promotion',
      queue: 'max',
      'cancel-in-progress': false,
    });
    assert.ok(
      wrapper.jobs.promote.steps.some((step) =>
        step.run?.includes('load-intent'),
      ),
    );
    assert.ok(
      wrapper.jobs.promote.steps.some((step) =>
        step.run?.includes(`load-result --component ${name}`),
      ),
    );
    assert.ok(
      wrapper.jobs.promote.steps.some((step) =>
        step.run?.includes('scripts/promote-images.mjs'),
      ),
    );
    for (const step of wrapper.jobs.promote.steps)
      if (step.uses) assert.match(step.uses, /^[\w/-]+@[a-f0-9]{40}$/);
  }
  const common = workflow('component-build');
  assert.equal(
    common.permissions,
    undefined,
    'common core inherits readonly or narrowed trusted caller permissions',
  );
  assert.equal(common.jobs.build.permissions, undefined);
  assert.equal(common.on.workflow_call.inputs.component.type, 'string');
  assert.equal(common.on.workflow_call.inputs.publish.type, 'boolean');
  assert.ok(
    common.jobs.build.steps.some((step) => step.run?.includes('load-result')),
  );
  for (const step of common.jobs.build.steps) {
    if (step.uses?.includes('login-action'))
      assert.match(step.if, /inputs.publish/);
    if (step.uses?.includes('upload-artifact')) {
      assert.match(step.if, /inputs.publish/);
      assert.equal(step.with['if-no-files-found'], 'error');
      assert.equal(step.with['retention-days'], 30);
      assert.equal(step.with.overwrite, undefined);
    }
    if (step.uses) assert.match(step.uses, /^[\w/-]+@[a-f0-9]{40}$/);
  }
});

test('summary always depends on quality selection and all component outcomes', () => {
  const parent = workflow('validate');
  assert.ok(parent.jobs.summary, 'an always-run required summary must exist');
  assert.equal(parent.jobs.summary.if, 'always()');
  assert.deepEqual(
    new Set(parent.jobs.summary.needs),
    new Set([
      'quality',
      'deployment',
      'select',
      ...names.map((name) => `component_${id(name)}`),
    ]),
  );
  assert.ok(
    parent.jobs.summary.steps.some(
      (step) => step.run === 'node scripts/deployment-ci.mjs summary',
    ),
  );
});

function summary(
  selected,
  results,
  event = 'workflow_dispatch',
  environment = process.env,
) {
  return spawnSync(process.execPath, ['scripts/deployment-ci.mjs', 'summary'], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...environment,
      GITHUB_STEP_SUMMARY: '',
      GITHUB_EVENT_NAME: event,
      SELECTED_COMPONENTS: JSON.stringify(selected),
      PIPELINE_NEEDS: JSON.stringify(results),
    },
  });
}

test('required summary reports a healthy empty selection without publishing test scenarios to the enclosing job', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'component-summary-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const jobSummary = join(directory, 'job-summary.md');
  writeFileSync(jobSummary, 'Existing job summary\n');
  const result = summary(
    [],
    {
      quality: { result: 'success', outputs: { mode: 'full' } },
      deployment: { result: 'success' },
      select: { result: 'success' },
    },
    'workflow_dispatch',
    { ...process.env, GITHUB_STEP_SUMMARY: jobSummary },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(jobSummary, 'utf8'), 'Existing job summary\n');
  for (const name of names)
    assert.match(result.stdout, new RegExp(`${name}: not selected`));
});

test('selected canceled or missing components fail visibly while unrelated successes remain reported', () => {
  for (const outcome of ['cancelled', 'failure', 'skipped', undefined]) {
    const results = {
      quality: { result: 'success', outputs: { mode: 'full' } },
      deployment: { result: 'success' },
      select: { result: 'success' },
      component_inventory: { result: 'success' },
    };
    if (outcome) results.component_web = { result: outcome };
    const result = summary(['inventory', 'web'], results);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /inventory: success/);
    assert.match(result.stdout, new RegExp(`web: ${outcome ?? 'missing'}`));
    assert.match(result.stderr, /rerun|fresh run/i);
  }
});

test('summary reports failed quality and missing selection instead of a successful empty run', () => {
  const result = summary([], { quality: { result: 'failure' } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /quality: failure/);
  assert.match(result.stdout, /selection: missing/);
});

test('validation summary requires deployed success except for proven manifest-only runs', () => {
  for (const event of ['pull_request', 'push', 'workflow_dispatch']) {
    for (const mode of ['full', 'manifest', undefined]) {
      for (const outcome of [
        'success',
        'failure',
        'cancelled',
        'skipped',
        undefined,
      ]) {
        const results = {
          quality: { result: 'success', outputs: { mode } },
          select: { result: 'success' },
        };
        if (outcome) results.deployment = { result: outcome };
        const result = summary([], results, event);
        const accepted =
          mode === 'full'
            ? outcome === 'success'
            : mode === 'manifest' && outcome === 'skipped';
        assert.equal(
          result.status,
          accepted ? 0 : 1,
          `${event}/${mode}/${outcome}: ${result.stderr}`,
        );
      }
    }
  }
});

test('reusable build Bash runs readonly PR validation and trusted single-component publication', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'component-bash-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const preload = join(directory, 'provider.mjs');
  const calls = join(directory, 'calls');
  writeFileSync(
    preload,
    `import cp from'node:child_process';import{appendFileSync,writeFileSync}from'node:fs';import{syncBuiltinESMExports}from'node:module';cp.execFileSync=(command,args)=>{if(command!=='docker')throw new Error('Unexpected external command');appendFileSync(process.env.COMPONENT_CALLS,JSON.stringify(args)+'\\n');const digest='sha256:'+'a'.repeat(64);if(args.includes('--metadata-file')){writeFileSync(args[args.indexOf('--metadata-file')+1],JSON.stringify({'containerimage.digest':digest}));return '';}return JSON.stringify({mediaType:'application/vnd.oci.image.index.v1+json',manifests:['amd64','arm64'].map(architecture=>({digest,platform:{os:'linux',architecture}}))});};syncBuiltinESMExports();`,
  );
  const script = workflow('component-build').jobs.build.steps.find(
    (step) => step.name === 'Build one immutable component',
  ).run;
  const bash =
    process.platform === 'win32' &&
    existsSync('C:/Program Files/Git/bin/bash.exe')
      ? 'C:/Program Files/Git/bin/bash.exe'
      : 'bash';
  for (const publish of [false, true]) {
    writeFileSync(calls, '');
    const result = spawnSync(bash, ['-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PUBLISH: String(publish),
        COMPONENT: 'web',
        RUNNER_TEMP: directory,
        COMPONENT_CALLS: calls,
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
        GITHUB_EVENT_NAME: publish ? 'workflow_dispatch' : 'pull_request',
        GITHUB_REF: publish ? 'refs/heads/feature' : 'refs/pull/1/merge',
        GITHUB_SHA: 'b'.repeat(40),
        GITHUB_REPOSITORY: 'example/equipment',
        GITHUB_REPOSITORY_ID: '7',
        GITHUB_RUN_ID: '101',
        GITHUB_RUN_ATTEMPT: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const commands = readFileSync(calls, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(commands.length, publish ? 2 : 1);
    assert.equal(commands[0].includes('--push'), publish);
    assert.equal(existsSync(join(directory, 'component-result.json')), publish);
    if (publish)
      assert.equal(
        JSON.parse(
          readFileSync(join(directory, 'component-result.json'), 'utf8'),
        ).record.component,
        'web',
      );
    else assert.ok(commands[0].includes('type=cacheonly'));
  }
});
