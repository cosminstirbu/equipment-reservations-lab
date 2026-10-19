import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { root, sourcePath } from './quality.mjs';

test('post-edit hook formats only its named file and is idempotent', () => {
  const directory = mkdtempSync(resolve(root, '.formatter-fixture-'));
  const selected = resolve(directory, 'selected.ts');
  const untouched = resolve(directory, 'untouched.ts');
  const original = 'export interface Equipment{id:string;name:string;}';
  writeFileSync(selected, original);
  writeFileSync(untouched, original);
  const event = {
    cwd: root,
    permission_mode: 'default',
    tool_input: {
      input: `*** Begin Patch\n*** Update File: ${selected}\n*** End Patch`,
    },
  };
  const invoke = () =>
    spawnSync(
      process.execPath,
      [resolve(root, '.codex/hooks/format-after-edit.mjs')],
      { input: JSON.stringify(event), encoding: 'utf8' },
    );
  try {
    const result = invoke();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.hookEventName,
      'PostToolUse',
    );
    const formatted = readFileSync(selected, 'utf8');
    assert.match(formatted, /\n {2}id: string;\n {2}name: string;\n/);
    assert.equal(readFileSync(untouched, 'utf8'), original);
    assert.equal(invoke().status, 0);
    assert.equal(readFileSync(selected, 'utf8'), formatted);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('hook excludes generated files and paths outside the repository, including symlinks', () => {
  const outside = mkdtempSync(resolve(tmpdir(), 'format-outside-'));
  const directory = mkdtempSync(resolve(root, '.formatter-fixture-'));
  try {
    const target = resolve(outside, 'external.ts');
    const link = resolve(directory, 'linked.ts');
    writeFileSync(target, 'export const x=1;');
    symlinkSync(target, link);
    assert.equal(sourcePath(target), null);
    assert.equal(sourcePath(link), null);
    assert.equal(
      sourcePath('src/Web/node_modules/typescript/package.json'),
      null,
    );
    assert.equal(sourcePath('package-lock.json'), null);
    assert.equal(
      sourcePath('specs/001-hello-world-skeleton/team/run-state.json'),
      null,
    );
  } finally {
    rmSync(outside, { recursive: true });
    rmSync(directory, { recursive: true });
  }
});

test('unrecognized hook payload fails visibly rather than silently skipping an edit', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(root, '.codex/hooks/format-after-edit.mjs')],
    {
      input: JSON.stringify({ cwd: root, tool_input: { unexpected: true } }),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Post-edit formatting failed/);
});

test('C# edits use Allman braces and four-space indentation', () => {
  const path = resolve(
    root,
    `tests/TestSupport/FormatterFixture${process.pid}.cs`,
  );
  writeFileSync(
    path,
    'namespace TestSupport;\ninternal static class FormatterFixture{\ninternal static void Run(){\nSystem.Console.WriteLine("one");\nSystem.Console.WriteLine("two");\n}\n}',
    { flag: 'wx' },
  );
  const event = {
    cwd: root,
    permission_mode: 'default',
    tool_input: { file_path: path },
  };
  try {
    const result = spawnSync(
      process.execPath,
      [resolve(root, '.codex/hooks/format-after-edit.mjs')],
      { input: JSON.stringify(event), encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const formatted = readFileSync(path, 'utf8');
    assert.match(formatted, /Run\(\)\n {4}\{/);
    assert.match(
      formatted,
      /WriteLine\("one"\);\n {8}System.Console.WriteLine\("two"\);/,
    );
  } finally {
    rmSync(path);
  }
});
