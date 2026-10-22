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

test('quality gates fourteen independent static component workflow calls with readonly PR lanes', () => {
  const parent = workflow('validate');
  const calls = Object.entries(parent.jobs).filter(([, job]) => job.uses);
  assert.equal(
    calls.length,
    14,
    'seven readonly PR calls and seven trusted component pipelines are required',
  );
  assert.deepEqual(parent.on.push.branches, ['main']);
  assert.ok(Object.hasOwn(parent.on, 'pull_request'));
  assert.ok(Object.hasOwn(parent.on, 'workflow_dispatch'));
  assert.equal(parent.on.pull_request_target, undefined);
  assert.equal(
    parent.concurrency,
    undefined,
    'image builds must not share release-wide serialization',
  );
  assert.deepEqual(parent.jobs.select.needs, ['quality']);
  for (const name of names) {
    const pr = parent.jobs[`pr_${id(name)}`];
    const trusted = parent.jobs[`component_${id(name)}`];
    assert.equal(pr.uses, './.github/workflows/component-build.yaml');
    assert.deepEqual(pr.permissions, { contents: 'read' });
    assert.equal(pr.with.component, name);
    assert.equal(pr.with.publish, false);
    assert.equal(pr.secrets, undefined);
    assert.match(pr.if, /pull_request/);
    assert.deepEqual(pr.needs, ['quality', 'select']);
    assert.equal(trusted.uses, `./.github/workflows/component-${name}.yaml`);
    assert.deepEqual(trusted.needs, ['quality', 'select']);
    assert.match(trusted.if, /pull_request/);
    assert.equal(trusted.secrets, undefined);
    assert.deepEqual(trusted.permissions, {
      contents: 'write',
      packages: 'write',
      'pull-requests': 'write',
      actions: 'read',
    });
  }
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
      'pull-requests': 'write',
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
      'select',
      ...names.flatMap((name) => [`pr_${id(name)}`, `component_${id(name)}`]),
    ]),
  );
  assert.ok(
    parent.jobs.summary.steps.some(
      (step) => step.run === 'node scripts/deployment-ci.mjs summary',
    ),
  );
});

function summary(selected, results, event = 'workflow_dispatch') {
  return spawnSync(process.execPath, ['scripts/deployment-ci.mjs', 'summary'], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: event,
      SELECTED_COMPONENTS: JSON.stringify(selected),
      PIPELINE_NEEDS: JSON.stringify(results),
    },
  });
}

test('required summary reports a healthy empty selection without inventing component work', () => {
  const result = summary([], {
    quality: { result: 'success' },
    select: { result: 'success' },
  });
  assert.equal(result.status, 0, result.stderr);
  for (const name of names)
    assert.match(result.stdout, new RegExp(`${name}: not selected`));
});

test('selected canceled or missing components fail visibly while unrelated successes remain reported', () => {
  for (const outcome of ['cancelled', 'failure', 'skipped', undefined]) {
    const results = {
      quality: { result: 'success' },
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
