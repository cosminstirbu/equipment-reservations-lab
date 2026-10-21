import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

export function runNpm(args, cwd) {
  const cli =
    process.env.npm_execpath ??
    resolve(
      dirname(
        require.resolve('npm/package.json', {
          paths: [
            dirname(process.execPath),
            resolve(dirname(process.execPath), '../lib'),
          ],
        }),
      ),
      'bin/npm-cli.js',
    );
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`npm exited ${result.status ?? result.signal}`);
}
