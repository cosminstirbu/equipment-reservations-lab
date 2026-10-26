import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('deployed runner reports all missing-prerequisite cases safely without coverage', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'deployed-runner-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./deployed-tests.mjs', import.meta.url)),
      '--reports',
      '--state',
      '.cache/PRIVATE_DEPLOYED_STATE_MISSING',
    ],
    { encoding: 'utf8', timeout: 30000, cwd: directory, env },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(
    existsSync(join(directory, 'test-results/deployed/results.xml')),
    true,
    result.stdout + result.stderr,
  );
  const xml = readFileSync(
    join(directory, 'test-results/deployed/results.xml'),
    'utf8',
  );
  assert.match(xml, /tests="6"/);
  assert.match(xml, /failures="6"/);
  assert.doesNotMatch(
    xml + result.stdout + result.stderr,
    /PRIVATE_DEPLOYED_STATE_MISSING|ENOENT|password|access_token/,
  );
  assert.equal(
    existsSync(join(directory, 'test-results/deployed/coverage')),
    false,
  );
});

test('deployed reporter omits private event payloads and fails missing or skipped cases', async () => {
  const { default: report, deployedTestNames } =
    await import('./deployed-test-reporter.mjs');
  const names = deployedTestNames();
  async function* events() {
    yield {
      type: 'test:pass',
      data: {
        name: names[0],
        skip: 'PRIVATE_EVENT_MARKER',
        details: { duration_ms: 2, error: { message: 'PRIVATE_EVENT_MARKER' } },
      },
    };
    yield {
      type: 'test:fail',
      data: {
        name: names[1],
        details: {
          duration_ms: 3,
          error: {
            message: 'PRIVATE_EVENT_MARKER',
            stack: 'PRIVATE_EVENT_MARKER',
          },
        },
      },
    };
    yield {
      type: 'test:pass',
      data: { name: 'PRIVATE_EVENT_MARKER', details: { duration_ms: 4 } },
    };
  }
  let xml = '';
  for await (const part of report(events())) xml += part;
  assert.match(xml, /tests="6"/);
  assert.match(xml, /failures="6"/);
  assert.match(xml, /Expected deployed test result is missing/);
  assert.doesNotMatch(xml, /PRIVATE_EVENT_MARKER|stack|system-out/);
});
