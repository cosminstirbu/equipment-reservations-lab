import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

for (const [file, tool] of [
  ['deployment-dashboard.test.mjs', 'podman'],
  ['deployment-ingress.test.mjs', 'openssl'],
  ['deployment-ingress.test.mjs', 'forward'],
  ['deployment-broker-retention.test.mjs', 'podman'],
  ['deployment-database-bootstrap.test.mjs', 'git'],
  ['deployment-config-rollout.test.mjs', 'kubectl'],
  ['deployment-ci-contract.test.mjs', 'kubectl'],
])
  test(`provider CLI ${file} reports safe exit metadata for ${tool}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'provider-diagnostics-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const preload = join(directory, 'provider.mjs');
    writeFileSync(
      preload,
      `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const spawn = childProcess.spawnSync;
const spawnAsync = childProcess.spawn;
const execute = childProcess.execFileSync;
const fixture = ['-e', 'process.stdout.write("PRIVATE_PROVIDER_PAYLOAD"); process.stderr.write("PRIVATE_PROVIDER_PAYLOAD"); process.exit(23)'];
const broker = ${JSON.stringify(file)} === 'deployment-broker-retention.test.mjs';
const forwarding = ${JSON.stringify(tool)} === 'forward';
function commandArgs(command, args) {
  if (forwarding && ['kind', 'openssl', 'kubectl'].includes(command)) return ['-e', ''];
  if (broker && command === 'podman' && args[0] !== 'run') {
    if (args[0] === 'rm') return ['-e', 'process.exit(29)'];
    if (args[0] === 'volume' && args[1] === 'rm') return ['-e', 'process.exit(31)'];
    return ['-e', 'process.stdout.write("PUBLIC_RESOURCE_STDOUT");process.stderr.write("PUBLIC_RESOURCE_STDERR")'];
  }
  if (command === ${JSON.stringify(tool)}) return fixture;
  if (command === 'kind') return ['-e', ''];
  return args;
}
const executable = (command) => [${JSON.stringify(tool)}, 'kind', ...(forwarding ? ['openssl','kubectl'] : [])].includes(command) ? process.execPath : command;
childProcess.spawnSync = (command, args, options) => spawn(executable(command), commandArgs(command, args), options);
childProcess.execFileSync = (command, args, options) => execute(executable(command), commandArgs(command, args), options);
childProcess.spawn = (command, args, options) => forwarding && command === 'kubectl' ? spawnAsync(process.execPath, fixture, options) : spawnAsync(command, args, options);
syncBuiltinESMExports();
`,
    );
    const result = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(preload).href, `scripts/${file}`],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...process.env,
          CONTAINER_RUNTIME: 'podman',
          EQUIPMENT_KUBECTL: 'kubectl',
          NODE_TEST_CONTEXT: '',
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 1);
    assert.match(output, /status=23/);
    assert.match(output, /duration=\d+ms/);
    if (file === 'deployment-broker-retention.test.mjs') {
      assert.match(result.stdout, /PUBLIC_RESOURCE_STDOUT/);
      assert.match(output, /PUBLIC_RESOURCE_STDERR/);
      assert.match(output, /Cleanup failure:/);
      assert.match(output, /status=29/);
      assert.match(output, /status=31/);
    }
    if (['git', 'kubectl'].includes(tool))
      assert.match(output, /PRIVATE_PROVIDER_PAYLOAD/);
    else assert.doesNotMatch(output, /PRIVATE_PROVIDER_PAYLOAD/);
  });

test('live rollout preserves primary failure and separately reports a real filesystem cleanup failure', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rollout-diagnostics-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const entry = join(directory, 'rollout.mjs');
  const module = pathToFileURL(
    join(process.cwd(), 'scripts/deployment-config-rollout-live.mjs'),
  ).href;
  const processModule = pathToFileURL(
    join(process.cwd(), 'scripts/process.mjs'),
  ).href;
  writeFileSync(
    entry,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { OperationalFailure } from ${JSON.stringify(processModule)};
const remove = fs.rmSync;
fs.mkdtempSync = () => ${JSON.stringify(join(directory, 'owned-rollout'))};
fs.mkdirSync(${JSON.stringify(join(directory, 'owned-rollout'))});
fs.rmSync = (path, options) => remove(path, { ...options, recursive: false });
syncBuiltinESMExports();
const { verifyConfigRollout } = await import(${JSON.stringify(module)});
try {
  await verifyConfigRollout({root: ${JSON.stringify(process.cwd())}, apply: () => { throw new OperationalFailure('rollout primary failure'); }});
} catch (error) { console.error(error.message); process.exitCode = 1; }
`,
  );
  const result = spawnSync(process.execPath, [entry], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /rollout primary failure/);
  assert.match(result.stderr, /Cleanup failure:.*remove rollout fixture/);
  assert.doesNotMatch(result.stderr, /owned-rollout|EISDIR/);
});
