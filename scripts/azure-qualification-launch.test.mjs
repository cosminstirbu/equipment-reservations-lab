import { createGeneratorInput } from './azure-generator-input.mjs';
// Design: real shell launch must sanitize preloads before Node starts; Git fixtures
// exercise independently parsed source closure without importing operational code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  rmSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import parsers from '@stoplight/spectral-parsers';
import { imagePatch } from './component-images.mjs';
import { renderRuntimeProjection } from './azure-runtime.mjs';
import { azureRuntimeFixtureInput } from './azure-runtime-fixture.mjs';

test('configured qualification workflow commands prevent ambient Node preload execution', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'qualification-workflow-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const marker = join(directory, 'escaped');
  const preload = join(directory, 'preload.cjs');
  const npmArguments = join(directory, 'npm-arguments');
  const shellPath = (path) => path.replaceAll('\\', '/');
  writeFileSync(
    preload,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped');`,
  );
  writeFileSync(
    join(directory, 'npm'),
    `#!/bin/sh\nexec '${shellPath(process.execPath)}' '${shellPath(join(directory, 'npm.cjs'))}' "$@"\n`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(directory, 'npm.cjs'),
    `require('node:fs').appendFileSync(${JSON.stringify(npmArguments)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
  );
  const environment = {
    ...process.env,
    PATH: `${directory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    NODE_OPTIONS: `--require="${shellPath(preload)}"`,
    NODE_PATH: directory,
    RUNNER_TEMP: shellPath(directory),
    AZURE_CONFIG_JSON: '{}',
    AZURE_BOOTSTRAP_LOCATOR_JSON: '{}',
    QUALIFICATION_ACTOR: 'backup',
    AZURE_QUALIFICATION_NONCE: 'synthetic',
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40),
  };
  const unsafe = spawnSync(process.execPath, ['-e', 'void 0'], {
    env: environment,
    timeout: 15000,
  });
  assert.equal(unsafe.status, 0);
  assert.equal(existsSync(marker), true);
  rmSync(marker);
  const definition = parsers.Yaml.parse(
    readFileSync('.github/workflows/azure-qualification.yaml', 'utf8'),
  ).data;
  const outcomes = [];
  for (const step of definition.jobs.prove.steps.filter((step) => step.run)) {
    const result = spawnSync(
      process.platform === 'win32'
        ? 'C:/Program Files/Git/bin/bash.exe'
        : 'bash',
      ['--noprofile', '--norc', '-c', step.run],
      { env: environment, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 },
    );
    outcomes.push({
      preload: existsSync(marker),
      terminal: result.status !== null,
      status: result.status,
    });
    rmSync(marker, { force: true });
  }
  assert.equal(outcomes.length, 5);
  assert.equal(
    outcomes.every((outcome) => outcome.terminal),
    true,
    'all configured commands must terminate',
  );
  assert.equal(
    outcomes.some((outcome) => outcome.preload),
    false,
    'configured workflow commands executed an ambient preload',
  );
  assert.deepEqual(
    outcomes.map((outcome) => outcome.status),
    [0, 0, 0, 1, 0],
  );
  assert.deepEqual(
    readFileSync(npmArguments, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [
      ['ci', '--ignore-scripts'],
      ['run', 'infra:tools'],
    ],
  );
  assert.equal(existsSync(join(directory, 'qualification-config.json')), false);
  assert.equal(
    existsSync(join(directory, 'qualification-locator.json')),
    false,
  );
  assert.equal(definition.jobs.prove.steps[0].with.ref, '${{ github.sha }}');
});

test('public pre-Node launch never executes an ambient marker-writing preload', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'qualification-launch-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const marker = join(directory, 'escaped');
  const preload = join(directory, 'preload.cjs');
  writeFileSync(
    preload,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped');`,
  );
  const windows = process.platform === 'win32';
  const injected = {
    ...process.env,
    NODE_OPTIONS: `--require="${preload.replaceAll('\\', '/')}"`,
    NODE_PATH: directory,
  };
  const unsafe = spawnSync(process.execPath, ['-e', 'void 0'], {
    env: injected,
    timeout: 10000,
  });
  assert.equal(unsafe.status, 0);
  assert.equal(
    existsSync(marker),
    true,
    'the actual preload must execute without the shell boundary',
  );
  rmSync(marker);
  const result = spawnSync(
    windows ? 'powershell.exe' : 'sh',
    windows
      ? [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          resolve('scripts/azure-qualification-launch.ps1'),
          'verify',
        ]
      : [resolve('scripts/azure-qualification-launch.sh'), 'verify'],
    {
      env: injected,
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(marker), false);
  assert.match(
    result.stderr + result.stdout,
    /Qualification launch validation failed/,
  );
});

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, 'Git fixture command failed');
  return result.stdout.trim();
}
function checkout(t, { workspace = false } = {}) {
  const directory = mkdtempSync(
    join(workspace ? resolve('.cache') : tmpdir(), 'qualification-definition-'),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'repo');
  mkdirSync(root);
  const manifest = JSON.parse(
    readFileSync('infra/azure/qualification-definition.json'),
  );
  for (const path of [
    ...manifest.modules,
    ...manifest.assets,
    ...manifest.data.release,
    ...manifest.data.installation,
    manifest.data.activation,
  ]) {
    if (!existsSync(path)) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(path, join(root, path));
    if (manifest.data.release.includes(path) && path.endsWith('.yaml'))
      writeFileSync(
        join(root, path),
        readFileSync(path, 'utf8').replaceAll('\r\n', '\n'),
      );
  }
  git(root, 'init');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'user.name', 'Qualification fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Reviewed qualification definition');
  const revision = git(root, 'rev-parse', 'HEAD');
  return { root, revision, directory };
}

test('sanitized public prove dispatch reaches argument validation without an ESM launch cycle', (t) => {
  const { root, revision } = checkout(t, { workspace: true });
  const compiler = join(root, 'node_modules/typescript/lib/typescript.js');
  mkdirSync(dirname(compiler), { recursive: true });
  copyFileSync('node_modules/typescript/lib/typescript.js', compiler);
  copyFileSync(
    'node_modules/typescript/package.json',
    join(root, 'node_modules/typescript/package.json'),
  );
  writeFileSync(join(root, '.git/info/exclude'), '/node_modules/\n');
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'powershell.exe' : 'sh',
    windows
      ? [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          join(root, 'scripts/azure-qualification-launch.ps1'),
          'prove',
          '--unsupported',
          'value',
        ]
      : [
          join(root, 'scripts/azure-qualification-launch.sh'),
          'prove',
          '--unsupported',
          'value',
        ],
    {
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: revision,
      },
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.equal(result.status, 1);
  assert.doesNotMatch(
    result.stderr,
    /unsettled top-level await|Detected unsettled/i,
  );
  assert.match(result.stderr, /qualification|Qualification/);
});

test('actual repository qualification definition includes every tracked workflow in its source closure', async () => {
  const { qualificationSourceDefinition } =
    await import('./azure-qualification-launch.mjs');
  const definition = qualificationSourceDefinition({ root: resolve('.') });
  for (const path of [
    '.github/workflows/azure-provider-qualification.yaml',
    '.github/workflows/broker-trace-diagnostic.yaml',
  ])
    assert.match(
      definition.manifest.assets.find((entry) => entry.path === path)?.sha256 ??
        '',
      /^[a-f0-9]{64}$/,
    );
});

test('actual Git definition accepts an app-only commit but changes transitive and package identity', async (t) => {
  const { qualificationSourceDefinition } =
    await import('./azure-qualification-launch.mjs');
  const { root, revision } = checkout(t);
  const initial = qualificationSourceDefinition({ root, revision });
  assert.deepEqual(initial, qualificationSourceDefinition({ root }));
  const unlistedWorkflow = join(root, '.github/workflows/unlisted.yaml');
  writeFileSync(unlistedWorkflow, 'name: Unreviewed\n');
  assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
  rmSync(unlistedWorkflow);
  const workflow = '.github/workflows/azure-provider-qualification.yaml';
  writeFileSync(
    join(root, workflow),
    readFileSync(join(root, workflow), 'utf8') +
      '\n# changed reviewed workflow\n',
  );
  assert.notEqual(
    initial.probeDefinitionHash,
    qualificationSourceDefinition({ root }).probeDefinitionHash,
  );
  git(root, 'checkout', '--', workflow);
  writeFileSync(join(root, 'app-only.txt'), 'application content');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Application-only change');
  assert.notEqual(git(root, 'rev-parse', 'HEAD'), revision);
  assert.deepEqual(
    initial,
    qualificationSourceDefinition({
      root,
      revision: git(root, 'rev-parse', 'HEAD'),
    }),
  );
  for (const component of [
    'web',
    'inventory',
    'reservations',
    'notifications',
    'database-bootstrap',
    'identity-bootstrap',
    'broker-bootstrap',
  ]) {
    const path = join(
      root,
      `deploy/environments/local/releases/${component}.json`,
    );
    const release = JSON.parse(readFileSync(path));
    release.digest = `sha256:${'c'.repeat(64)}`;
    release.sourceRevision = 'b'.repeat(40);
    release.runId++;
    writeFileSync(path, JSON.stringify(release));
    writeFileSync(
      join(root, `deploy/environments/local/images/${component}.yaml`),
      imagePatch(component, `${release.image}@${release.digest}`),
    );
  }
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Reviewed seven-component application promotion');
  assert.deepEqual(
    initial,
    qualificationSourceDefinition({
      root,
      revision: git(root, 'rev-parse', 'HEAD'),
    }),
  );
  writeFileSync(
    join(root, 'scripts/process.mjs'),
    readFileSync(join(root, 'scripts/process.mjs'), 'utf8') +
      '\n// changed transport\n',
  );
  assert.notEqual(
    initial.probeDefinitionHash,
    qualificationSourceDefinition({ root }).probeDefinitionHash,
  );
  writeFileSync(join(root, 'scripts/process.mjs'), "import './omitted.mjs';\n");
  writeFileSync(
    join(root, 'scripts/omitted.mjs'),
    'export const omitted = true;',
  );
  assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
  rmSync(join(root, 'scripts/omitted.mjs'));
  git(root, 'checkout', '--', 'scripts/process.mjs');
  writeFileSync(
    join(root, 'scripts/process.mjs'),
    'const target = "./unknown.mjs"; await import(target);',
  );
  assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
  writeFileSync(
    join(root, 'scripts/process.mjs'),
    'import "unreviewed-package";',
  );
  assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
  for (const source of [
    'export * from "./omitted.mjs";',
    'await import("./omitted.mjs");',
    'const execute = eval; execute("PRIVATE_EXECUTION_MARKER");',
    'new Function("PRIVATE_EXECUTION_MARKER")();',
    'import "../deploy/platform/azure/recovery-activation.json";',
  ]) {
    writeFileSync(join(root, 'scripts/process.mjs'), source);
    assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
  }
  git(root, 'checkout', '--', 'scripts/process.mjs');
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  delete lock.packages['node_modules/typescript'].integrity;
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => qualificationSourceDefinition({ root }), /invalid/);
});

test('public qualified installation builder checks actual Git source and target trees with pinned native schema tools', (t) => {
  const { root, directory } = checkout(t);
  const input = azureRuntimeFixtureInput();
  input.config.githubRepository = 'cosminstirbu/equipment-reservations-lab';
  const projection = renderRuntimeProjection(createGeneratorInput(input));
  for (const [key, prefix] of [
    ['applicationFiles', 'deploy/environments/azure/runtime'],
    ['platformFiles', 'deploy/platform/azure/runtime'],
    ['recoveryFiles', 'deploy/platform/azure/recovery/runtime'],
  ])
    for (const [name, value] of Object.entries(projection[key])) {
      const path = join(root, prefix, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, value);
    }
  const state = 'deploy/platform/azure/recovery-controls/kustomization.yaml';
  writeFileSync(
    join(root, state),
    readFileSync(join(root, state), 'utf8').replaceAll('\r\n', '\n'),
  );
  for (const component of [
    'web',
    'inventory',
    'reservations',
    'notifications',
    'database-bootstrap',
    'identity-bootstrap',
    'broker-bootstrap',
  ]) {
    const source = JSON.parse(
      readFileSync(
        join(root, `deploy/environments/local/releases/${component}.json`),
      ),
    );
    const image = `${input.environment.acr_login_server}/equipment-reservations-lab-${component}`;
    for (const [suffix, text] of [
      [
        `releases/${component}.json`,
        JSON.stringify({
          schemaVersion: 1,
          source,
          image,
          digest: source.digest,
        }),
      ],
      [
        `images/${component}.yaml`,
        imagePatch(component, `${image}@${source.digest}`),
      ],
    ]) {
      const path = join(root, 'deploy/environments/azure', suffix);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  git(root, 'add', '.');
  git(
    root,
    'commit',
    '-m',
    'Reviewed generated installation and complete publication',
  );
  const inputPath = join(directory, 'input.json'),
    resultPath = join(directory, 'result.json'),
    runner = join(directory, 'installation-runner.mjs');
  writeFileSync(inputPath, JSON.stringify(input));
  writeFileSync(
    runner,
    `import {readFileSync,writeFileSync} from 'node:fs';import {qualificationInstallationContext,validateQualificationInstallationContext,verifyQualificationReleaseContext} from ${JSON.stringify(pathToFileURL(resolve('scripts/azure-qualification-launch.mjs')).href)};try{const full=JSON.parse(readFileSync(process.argv[3]));const {createGeneratorInput}=await import(${JSON.stringify(pathToFileURL(resolve('scripts/azure-generator-input.mjs')).href)});const input=createGeneratorInput(full),acrLoginServer=full.environment.acr_login_server;if(process.argv[5]==='verify'){await verifyQualificationReleaseContext({root:process.argv[2],acrLoginServer});}else if(process.argv[5]==='build'){writeFileSync(process.argv[4],JSON.stringify(await qualificationInstallationContext({root:process.argv[2],input,acrLoginServer})));}else{const {binding}=JSON.parse(readFileSync(process.argv[4]));await validateQualificationInstallationContext({root:process.argv[2],input,acrLoginServer,binding,phase:'target'});}}catch(error){console.error(error.message);process.exitCode=1;}`,
  );
  const run = (mode) =>
    spawnSync(process.execPath, [runner, root, inputPath, resultPath, mode], {
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: git(root, 'rev-parse', 'HEAD'),
        GITHUB_TOKEN: '',
      },
      encoding: 'utf8',
      timeout: 120000,
    });
  const built = run('build');
  assert.equal(built.status, 0, built.stderr);
  const unavailable = run('verify');
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /release|publication/i);
  const result = JSON.parse(readFileSync(resultPath));
  assert.equal(result.binding.source.files.length, 15);
  for (const [path, content] of Object.entries(result.targetFiles))
    writeFileSync(join(root, path), content);
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Reviewed exact qualification reference removal');
  const target = run('target');
  assert.equal(target.status, 0, target.stderr);
  const identity = join(
    root,
    'deploy/platform/azure/recovery/runtime/bindings.json',
  );
  writeFileSync(identity, '{}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Invalid generated target');
  assert.notEqual(run('target').status, 0);
});

test('real clean hosted launch binds actual HEAD and rejects dirty, false SHA and loader context', (t) => {
  const { root, revision, directory } = checkout(t);
  const runner = join(directory, 'runner.mjs');
  writeFileSync(
    runner,
    `import {validateQualificationLaunch} from ${JSON.stringify(pathToFileURL(resolve('scripts/azure-qualification-launch.mjs')).href)}; try {const r=await validateQualificationLaunch({root:process.argv[2]}); console.log(r.actualProbeCodeRevision);} catch {process.exitCode=1;}`,
  );
  const run = (extra = {}) =>
    spawnSync(process.execPath, [runner, root], {
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: revision,
        ...extra,
      },
      encoding: 'utf8',
      timeout: 30000,
    });
  assert.equal(run().status, 0);
  writeFileSync(join(root, 'app-only.txt'), 'application only');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Later application-only commit');
  const later = git(root, 'rev-parse', 'HEAD');
  assert.equal(run({ GITHUB_SHA: later }).status, 0);
  writeFileSync(
    join(root, 'scripts/process.mjs'),
    readFileSync(join(root, 'scripts/process.mjs'), 'utf8') +
      '\n// dirty tracked execution input\n',
  );
  assert.equal(run({ GITHUB_SHA: later }).status, 1);
  git(root, 'checkout', '--', 'scripts/process.mjs');
  assert.equal(run({ GITHUB_SHA: 'a'.repeat(40) }).status, 1);
  assert.equal(run({ GITHUB_SHA: later, NODE_PATH: directory }).status, 1);
  writeFileSync(join(root, 'untracked.mjs'), '// unknown executable');
  assert.equal(run({ GITHUB_SHA: later }).status, 1);
});
