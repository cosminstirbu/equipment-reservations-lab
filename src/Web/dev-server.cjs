const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { publicConfiguration } = require('./auth-config.cjs');
const port = process.env.PORT;
if (!port || !/^\d+$/.test(port))
  throw new Error('Aspire must supply the Web PORT.');
writeFileSync(
  'auth-config.json',
  JSON.stringify(publicConfiguration(process.env)),
  { mode: 0o600 },
);

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
