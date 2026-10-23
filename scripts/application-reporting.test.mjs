import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  prepareReports,
  publishReports,
  runApplicationSuites,
} from './application-reporting.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'application-reporting-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  write('tests/Example.Tests/Example.Tests.csproj', '<Project />');
  write(
    'tests/Example.Tests/BehaviorTests.cs',
    'public class BehaviorTests { public void SafeBehavior() {} }',
  );
  write('src/Example/Program.cs', 'public class Program {}');
  write('src/Web/src/app/example.ts', 'export const example = 1;');
  write(
    'src/Web/src/app/example.spec.ts',
    "it.each(['value'])('shows %s equipment', () => {});",
  );
  return { root, write };
}

const privateMarker = 'PRIVATE-REPORT-MARKER';
const coverage = (filename) =>
  `<coverage><sources><source>/private/${privateMarker}</source></sources><packages><package name="${privateMarker}"><classes><class name="${privateMarker}" filename="${filename}"><lines><line number="1" hits="0" /></lines></class></classes></package></packages></coverage>`;

test('publishes assessed test identities and uncovered lines while discarding raw output and private inputs', (t) => {
  const { root, write } = fixture(t);
  prepareReports(root);
  write(
    '.cache/application-reporting/raw/backend/example.trx',
    `<TestRun><TestDefinitions><UnitTest id="id"><TestMethod className="Example.Tests.BehaviorTests" name="SafeBehavior" /></UnitTest></TestDefinitions><Results><UnitTestResult testId="id" testName="${privateMarker}" outcome="Failed" duration="00:00:00.100"><Output><ErrorInfo><Message>${privateMarker}</Message></ErrorInfo><StdOut>${privateMarker}</StdOut></Output></UnitTestResult></Results></TestRun>`,
  );
  write(
    '.cache/application-reporting/raw/backend/example.cobertura.xml',
    coverage('src/Example/Program.cs'),
  );
  write(
    '.cache/application-reporting/raw/frontend/results.xml',
    `<testsuites><testsuite name="${privateMarker}"><testcase classname="src/app/example.spec.ts" name="shows ${privateMarker} equipment" time="0.1"><failure>${privateMarker}</failure><system-out>${privateMarker}</system-out></testcase></testsuite></testsuites>`,
  );
  write(
    '.cache/application-reporting/raw/frontend/cobertura-coverage.xml',
    '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">' +
      coverage('src/app/example.ts'),
  );
  publishReports(root);
  for (const file of [
    'backend.xml',
    'frontend.xml',
    'coverage/backend/example.cobertura.xml',
    'coverage/frontend/cobertura-coverage.xml',
  ]) {
    const xml = readFileSync(
      join(root, 'test-results/application', file),
      'utf8',
    );
    assert.doesNotMatch(xml, new RegExp(privateMarker));
    assert.doesNotMatch(xml, /system-out|StdOut|ErrorInfo/);
    if (file.includes('coverage')) assert.match(xml, /hits="0"/);
  }
  assert.match(
    readFileSync(join(root, 'test-results/application/backend.xml'), 'utf8'),
    /SafeBehavior/,
  );
  assert.equal(
    existsSync(join(root, '.cache/application-reporting/raw')),
    false,
  );
});

test('incomplete reporting fails, preserves available assessed reports and cleans private scratch', (t) => {
  const { root, write } = fixture(t);
  prepareReports(root);
  write(
    '.cache/application-reporting/raw/frontend/results.xml',
    '<testsuites><testsuite><testcase classname="src/app/example.spec.ts" name="shows public equipment" time="0" /></testsuite></testsuites>',
  );
  assert.throws(() => publishReports(root), /incomplete/i);
  assert.equal(
    JSON.parse(
      readFileSync(join(root, 'test-results/application/status.json'), 'utf8'),
    ).complete,
    false,
  );
  assert.ok(existsSync(join(root, 'test-results/application/frontend.xml')));
  assert.equal(
    existsSync(join(root, '.cache/application-reporting/raw')),
    false,
  );
  prepareReports(root);
  assert.equal(
    existsSync(join(root, 'test-results/application/frontend.xml')),
    false,
  );
});

test('both real process lanes run after test failure and their failure remains observable', () => {
  const attempted = [];
  assert.throws(
    () =>
      runApplicationSuites([
        () => {
          attempted.push('frontend');
          const result = spawnSync(process.execPath, ['-e', 'process.exit(7)']);
          if (result.status) throw new Error('Frontend status=7');
        },
        () => {
          attempted.push('backend');
          const result = spawnSync(process.execPath, ['-e', 'process.exit(9)']);
          if (result.status) throw new Error('Backend status=9');
        },
      ]),
    /Frontend status=7[\s\S]*Backend status=9/,
  );
  assert.deepEqual(attempted, ['frontend', 'backend']);
});
