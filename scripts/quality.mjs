import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { runNpm } from './npm.mjs';
import {
  executeProcess,
  processFailure,
  cleanupAll,
  OperationalFailure,
} from './process.mjs';

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
  '.local',
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
  '.yaml',
  '.yml',
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
  // Preserve the reviewed upstream checksum; authored Argo overlays remain format targets.
  if (absolute === resolve(root, 'deploy/argocd/install.yaml')) return null;
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
  return name.replaceAll('\\', '/');
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
  return executeProcess(command, args, {
    cwd: root,
    tool: command === process.execPath ? 'node' : command,
    operation: quiet ? 'format verification' : 'quality check',
    output: quiet ? 'public-capture' : 'stream',
    timeout: 900000,
  });
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
        throw new OperationalFailure(
          'Formatting lock timed out. Check for an active formatter before removing .cache/quality-format.lock.',
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  let primary;
  try {
    action();
  } catch (error) {
    primary = error;
  } finally {
    await cleanupAll(
      [
        {
          operation: 'format lock cleanup',
          run: () => rmSync(lock, { recursive: true }),
        },
      ],
      { primary },
    );
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

async function checkOpenApi() {
  run('dotnet', ['build', 'EquipmentReservation.slnx', '-m:1']);
  const results = await Promise.all(
    ['Inventory', 'Reservations', 'Notifications'].map(
      (service) =>
        new Promise((resolve, reject) => {
          const started = Date.now();
          const child = spawn(
            'dotnet',
            [
              'test',
              '--project',
              `tests/${service}.Tests/${service}.Tests.csproj`,
              '--no-build',
              '--filter-class',
              `${service}.Tests.OpenApiTests`,
            ],
            { cwd: root, stdio: 'inherit' },
          );
          let expired = false;
          const timer = setTimeout(() => {
            expired = true;
            child.kill('SIGKILL');
          }, 900000);
          child.on('error', (error) => {
            clearTimeout(timer);
            reject(
              processFailure(error, {
                operation: 'OpenAPI contract tests',
                tool: 'dotnet',
                durationMs: Date.now() - started,
              }),
            );
          });
          child.on('close', (code, signal) => {
            clearTimeout(timer);
            resolve({
              code,
              signal,
              durationMs: Date.now() - started,
              expired,
            });
          });
        }),
    ),
  );
  const failure = results.find((result) => result.code !== 0);
  if (failure)
    throw processFailure(
      {
        status: failure.code,
        signal: failure.signal,
        code: failure.expired ? 'ETIMEDOUT' : undefined,
      },
      {
        operation: 'OpenAPI contract tests',
        tool: 'dotnet',
        durationMs: failure.durationMs,
      },
    );
}

async function testDeployment(paths) {
  const files = paths.length
    ? paths.map(sourcePath)
    : sources().filter((path) =>
        /^scripts\/(deployment-.*|promote-images|local-kubernetes)\.test\.mjs$/.test(
          path,
        ),
      );
  if (!files.length || files.some((path) => !path?.endsWith('.test.mjs')))
    throw new Error('Select existing repository deployment test modules');
  const timeout = Number(process.env.DEPLOYMENT_TEST_TIMEOUT_MS ?? 900000);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 900000)
    throw new Error('Deployment file timeout must be 1..900000 ms');
  // Provider lanes share the existing VM budget; a parent deadline also bounds blocked child event loops.
  for (const file of files) {
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn(process.execPath, [file], {
        cwd: root,
        stdio: 'inherit',
      });
      let expired = false;
      let force;
      const timer = setTimeout(() => {
        expired = true;
        child.kill('SIGTERM');
        force = setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeout);
      child.once('error', (error) => {
        clearTimeout(timer);
        clearTimeout(force);
        reject(
          processFailure(error, {
            operation: 'deployment test execution',
            tool: 'node',
            durationMs: Date.now() - started,
          }),
        );
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        clearTimeout(force);
        if (expired)
          reject(
            new Error(
              `Deployment test file ${file} exceeded ${timeout} ms. ${processFailure({ code: 'ETIMEDOUT', status: code, signal }, { operation: 'deployment test execution', tool: 'node', durationMs: Date.now() - started }).message}`,
            ),
          );
        else if (code !== 0)
          reject(
            processFailure(
              { status: code, signal },
              {
                operation: 'deployment test execution',
                tool: 'node',
                durationMs: Date.now() - started,
              },
            ),
          );
        else resolve();
      });
    });
  }
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
    else if (command === 'test:deployment') await testDeployment(paths);
    else if (command === 'check:openapi') await checkOpenApi();
    else if (command === 'check') {
      await format(undefined, true);
      lint();
      runNpm(['run', 'test:tooling'], root);
      runNpm(['--prefix', 'src/Web', 'run', 'build'], root);
      runNpm(['--prefix', 'src/Web', 'test'], root);

      const testModuleCount = sources().filter((path) =>
        path.endsWith('.Tests.csproj'),
      ).length;

      run('dotnet', [
        'test',
        '--solution',
        'EquipmentReservation.slnx',
        '--max-parallel-test-modules',
        String(testModuleCount),
        '--no-build',
      ]);
    } else
      throw new Error(
        'Usage: npm run format|format-check|lint|check|check:openapi|test:deployment [-- files...]',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
