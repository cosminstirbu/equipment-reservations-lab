const { spawn } = require('node:child_process');
const port = process.env.PORT;
if (!port || !/^\d+$/.test(port))
  throw new Error('Aspire must supply the Web PORT.');
const child = spawn(
  process.execPath,
  [
    'node_modules/@angular/cli/bin/ng.js',
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--proxy-config',
    'proxy.conf.cjs',
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
