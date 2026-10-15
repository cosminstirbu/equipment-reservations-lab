import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set([
  '.git',
  '.agents',
  '.specify',
  'specs',
  'docs',
  'node_modules',
  'bin',
  'obj',
  'dist',
  '.angular',
  'coverage',
  'test-results',
  'TestResults',
  'playwright-report',
  '.cache',
]);
const extensions = new Set([
  '.cs',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.css',
  '.json',
  '.jsonc',
  '.xml',
  '.csproj',
  '.props',
  '.targets',
  '.slnx',
]);

export function sourcePath(path) {
  let absolute;
  try {
    absolute = realpathSync(resolve(root, path));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const name = relative(root, absolute);
  if (
    isAbsolute(name) ||
    name.startsWith('..') ||
    name.split(/[\\/]/).some((part) => excluded.has(part))
  )
    return null;
  if (
    !extensions.has(extname(name)) ||
    name.endsWith('package-lock.json') ||
    name.endsWith('packages.lock.json')
  )
    return null;
  return name;
}

function sources(directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (excluded.has(entry.name) || entry.isSymbolicLink()) return [];
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sources(path);
      const name = sourcePath(path);
      return name ? [name] : [];
    })
    .sort();
}

function run(command, args, quiet = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} exited ${result.status ?? result.signal}\n${quiet ? (result.stdout + result.stderr).slice(-2000) : ''}`,
    );
}

function runAsync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(' ')} exited ${code ?? signal}`),
      );
    });
  });
}

async function testBackendAndSmoke() {
  // lint() already built the solution. Avoid concurrent writes to shared build outputs.
  const results = await Promise.allSettled(
    ['Backend.Tests', 'Smoke.Tests'].map((project) =>
      runAsync('dotnet', [
        'test',
        `tests/${project}/${project}.csproj`,
        '--no-build',
        '-m:1',
      ]),
    ),
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      failures.map((result) => result.reason.message).join('\n'),
    );
  }
}

async function withFormattingLock(action) {
  const cache = resolve(root, '.cache');
  const lock = resolve(cache, 'quality-format.lock');
  mkdirSync(cache, { recursive: true });
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline)
        throw new Error(
          'Formatting lock timed out. Check for an active formatter before removing .cache/quality-format.lock.',
          { cause: error },
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    action();
  } finally {
    rmSync(lock, { recursive: true });
  }
}

export async function format(files, check = false, quiet = false) {
  const paths = files
    ? [...new Set(files.map(sourcePath).filter(Boolean))]
    : sources();
  if (paths.length === 0) return;
  await withFormattingLock(() => {
    const csharp = paths.filter((path) => extname(path) === '.cs');
    const webAndXml = paths.filter((path) => extname(path) !== '.cs');
    if (csharp.length)
      run(
        'dotnet',
        [
          'format',
          'whitespace',
          'EquipmentReservation.slnx',
          '--no-restore',
          '--include',
          ...csharp,
          ...(check ? ['--verify-no-changes'] : []),
        ],
        quiet,
      );
    if (webAndXml.length)
      run(
        process.execPath,
        [
          resolve(root, 'node_modules/prettier/bin/prettier.cjs'),
          check ? '--check' : '--write',
          ...webAndXml,
        ],
        quiet,
      );
  });
}

function lint() {
  run(process.execPath, [
    resolve(root, 'node_modules/eslint/bin/eslint.js'),
    'src/Web',
    'scripts',
    '.codex/hooks',
    'eslint.config.mjs',
    '--max-warnings',
    '0',
  ]);
  run('dotnet', ['build', 'EquipmentReservation.slnx', '-warnaserror', '-m:1']);
  run('dotnet', [
    'format',
    'style',
    'EquipmentReservation.slnx',
    '--no-restore',
    '--severity',
    'info',
    '--verify-no-changes',
  ]);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, ...paths] = process.argv.slice(2);
    if (command === 'format' || command === 'format-check')
      await format(
        paths.length ? paths : undefined,
        command === 'format-check',
      );
    else if (command === 'lint') lint();
    else if (command === 'check') {
      await format(undefined, true);
      lint();
      run('npm', ['run', 'test:tooling']);
      run('npm', ['--prefix', 'src/Web', 'run', 'build']);
      run('npm', ['--prefix', 'src/Web', 'test']);
      await testBackendAndSmoke();
    } else
      throw new Error(
        'Usage: npm run format|format-check|lint|check [-- files...]',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
