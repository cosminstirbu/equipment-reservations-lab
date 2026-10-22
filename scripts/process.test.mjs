import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { clearTimeout } from 'node:timers';
import test from 'node:test';
import { executeProcess, ProcessFailure, cleanupAll } from './process.mjs';

const settings = { operation: 'fixture', tool: 'node', timeout: 5000 };
const child = (source, options = {}) =>
  executeProcess(process.execPath, ['-e', source], { ...settings, ...options });

test('machine stdout remains available without wrapper output', () => {
  assert.deepEqual(
    JSON.parse(
      child('process.stdout.write(JSON.stringify({ready:true}))', {
        output: 'public-capture',
      }),
    ),
    { ready: true },
  );
});

test('public captured failures retain separate bounded tails from both streams', () => {
  assert.throws(
    () =>
      child(
        "process.stdout.write('a'.repeat(5000)+'stdout-end');process.stderr.write('b'.repeat(5000)+'stderr-end');process.exit(7)",
        { output: 'public-capture' },
      ),
    (error) => {
      assert.ok(error instanceof ProcessFailure);
      assert.equal(error.details.category, 'exit');
      assert.equal(error.details.status, 7);
      assert.equal(error.details.operation, 'fixture');
      assert.ok(error.details.durationMs >= 0);
      assert.equal(error.details.stdout.length, 4000);
      assert.equal(error.details.stderr.length, 4000);
      assert.equal(error.details.stdoutTruncated, true);
      assert.equal(error.details.stderrTruncated, true);
      assert.match(error.message, /stdout \(truncated\)/);
      assert.match(error.message, /stderr \(truncated\)/);
      assert.match(error.message, /stdout-end/);
      assert.match(error.message, /stderr-end/);
      return true;
    },
  );
});

test('private default excludes provider secrets from failures and cannot be overridden with stdio', () => {
  const marker = 'PRIVATE_PROVIDER_MARKER';
  assert.throws(
    () =>
      executeProcess(
        process.execPath,
        [
          '-e',
          `process.stdin.resume();process.stdout.write('${marker}');process.stderr.write(process.env.PRIVATE_MARKER);process.exit(9)`,
          marker,
        ],
        {
          ...settings,
          env: { ...process.env, PRIVATE_MARKER: marker },
          input: marker,
          stdio: 'inherit',
        },
      ),
    (error) => {
      assert.equal(error.details.status, 9);
      assert.doesNotMatch(
        error.message + inspect(error, { depth: 10 }) + JSON.stringify(error),
        new RegExp(marker),
      );
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test('process failures distinguish spawn, timeout and output limits', () => {
  assert.throws(
    () => executeProcess('equipment-missing-executable-85923', [], settings),
    (error) => error.details.category === 'spawn',
  );
  assert.throws(
    () => child('setInterval(()=>{},1000)', { timeout: 100 }),
    (error) => error.details.category === 'timeout',
  );
  assert.throws(
    () =>
      child("process.stdout.write('x'.repeat(100000))", { maxBuffer: 1000 }),
    (error) => error.details.category === 'output-limit',
  );
});

test(
  'signal termination remains distinct',
  {
    skip:
      process.platform === 'win32'
        ? 'POSIX signal semantics require a POSIX host'
        : false,
  },
  () => {
    assert.throws(
      () => child("process.kill(process.pid,'SIGTERM')"),
      (error) =>
        error.details.category === 'termination' &&
        error.details.signal === 'SIGTERM',
    );
  },
);

test('ordinary stdout and stderr are visible before the process exits', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'process-progress-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const release = join(directory, 'release');
  const driver = join(directory, 'driver.mjs');
  const source = `const fs=require('node:fs');process.stdout.write('stdout-ready');process.stderr.write('stderr-ready');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);process.stdout.write('completed')}},10);`;
  writeFileSync(
    driver,
    `import {executeProcess} from ${JSON.stringify(new URL('./process.mjs', import.meta.url).href)};executeProcess(process.execPath,['-e',${JSON.stringify(source)}],{operation:'progress',tool:'node',output:'stream',timeout:5000});`,
  );
  const running = spawn(process.execPath, [driver], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => running.kill('SIGKILL'));
  let stdout = '';
  let stderr = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error('both progress streams were not observed before exit'),
        ),
      4000,
    );
    const observe = () => {
      if (stdout.includes('stdout-ready') && stderr.includes('stderr-ready')) {
        clearTimeout(timer);
        assert.equal(running.exitCode, null);
        writeFileSync(release, 'release');
      }
    };
    running.stdout.on('data', (data) => {
      stdout += data;
      observe();
    });
    running.stderr.on('data', (data) => {
      stderr += data;
      observe();
    });
    running.on('error', reject);
    running.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`driver exited ${code}: ${stderr}`));
    });
  });
  assert.match(stdout, /completed/);
});

test('cleanup attempts every resource and reports success and combined failures separately', async () => {
  for (const primary of [undefined, new Error('original operation failed')]) {
    const visited = [];
    const failures = [];
    await assert.rejects(
      cleanupAll(
        [
          {
            operation: 'first cleanup',
            run: () => {
              visited.push('first');
              throw new Error('PRIVATE_CLEANUP');
            },
          },
          {
            operation: 'second cleanup',
            run: () => {
              visited.push('second');
            },
          },
        ],
        { primary, report: (message) => failures.push(message) },
      ),
      (error) => {
        assert.doesNotMatch(
          inspect(error) + failures.join(''),
          /PRIVATE_CLEANUP/,
        );
        return primary ? error === primary : /cleanup/i.test(error.message);
      },
    );
    assert.deepEqual(visited, ['first', 'second']);
    assert.match(failures.join(''), /first cleanup/);
  }
});
