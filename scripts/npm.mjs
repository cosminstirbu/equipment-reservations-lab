import { executeProcess } from './process.mjs';
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
  executeProcess(process.execPath, [cli, ...args], {
    cwd,
    tool: 'node',
    operation: 'npm',
    output: 'stream',
    timeout: 900000,
  });
}
