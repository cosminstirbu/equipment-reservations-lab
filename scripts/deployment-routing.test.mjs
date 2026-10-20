import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
assert.ok(
  ['podman', 'docker'].includes(runtime),
  'CONTAINER_RUNTIME must be podman or docker',
);
const nginx =
  'docker.io/library/nginx:1.28.0-alpine@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284';
const node =
  'docker.io/library/node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d';

function container(...args) {
  const result = spawnSync(runtime, args, {
    encoding: 'utf8',
    timeout: 180_000,
    killSignal: 'SIGKILL',
  });
  assert.equal(
    result.status,
    0,
    `${args[0]}: ${result.stderr || result.error}`,
  );
  return result.stdout.trim();
}

test(
  'production frontend serves navigation and only the contractual service routes',
  { timeout: 300_000 },
  async (t) => {
    const configuration = resolve(root, 'deploy/images/nginx.conf');
    assert.ok(
      existsSync(configuration),
      'production nginx configuration exists',
    );
    const directory = mkdtempSync(resolve(tmpdir(), 'equipment-routing-'));
    chmodSync(directory, 0o755);
    const network = `equipment-routing-${process.pid}`;
    const services = ['inventory', 'reservations', 'notifications'];
    const upstreams = services.map((service) => `${network}-${service}`);
    const frontend = `${network}-frontend`;
    t.after(() => {
      for (const container of [frontend, ...upstreams])
        spawnSync(runtime, ['rm', '-f', container], {
          encoding: 'utf8',
          timeout: 30_000,
          killSignal: 'SIGKILL',
        });
      spawnSync(runtime, ['network', 'rm', network], {
        encoding: 'utf8',
        timeout: 30_000,
        killSignal: 'SIGKILL',
      });
      rmSync(directory, { recursive: true, force: true });
    });
    writeFileSync(
      resolve(directory, 'index.html'),
      '<html>production application</html>',
    );
    writeFileSync(resolve(directory, 'main.js'), 'console.log("asset");');
    writeFileSync(
      resolve(directory, 'upstream.cjs'),
      `require('node:http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({service:process.env.SERVICE,path:req.url,host:req.headers.host,origin:req.headers.origin,forwardedHost:req.headers['x-forwarded-host'],forwardedProto:req.headers['x-forwarded-proto'],forwarded:req.headers.forwarded}));}).listen(8080,'0.0.0.0');`,
    );
    container('network', 'create', network);
    for (const service of services) {
      container(
        'run',
        '-d',
        '--name',
        `${network}-${service}`,
        '--network',
        network,
        '--network-alias',
        service,
        '-e',
        `SERVICE=${service}`,
        '-v',
        `${directory}:/fixture:ro`,
        node,
        'node',
        '/fixture/upstream.cjs',
      );
    }
    container(
      'run',
      '-d',
      '--name',
      frontend,
      '--network',
      network,
      '--user',
      '101:101',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '-p',
      '127.0.0.1::8080',
      '-v',
      `${configuration}:/etc/nginx/nginx.conf:ro`,
      '-v',
      `${directory}:/usr/share/nginx/html:ro`,
      '--entrypoint',
      'nginx',
      nginx,
      '-g',
      'daemon off;',
    );
    const port = container('port', frontend, '8080/tcp').split(':').at(-1);
    const request = (path, headers = {}) =>
      new Promise((resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path,
            headers: { Host: 'app.equipment.test', ...headers },
          },
          (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              body += chunk;
            });
            response.on('end', () =>
              resolve({ status: response.statusCode, body }),
            );
          },
        );
        outgoing.setTimeout(5000, () =>
          outgoing.destroy(new Error('HTTP request timed out')),
        );
        outgoing.on('error', reject);
        outgoing.end();
      });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await request('/')).status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* Startup has a bounded observation window. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'production nginx becomes ready');
    assert.match(
      (await request('/reservations/upcoming')).body,
      /production application/,
    );
    assert.equal((await request('/main.js')).status, 200);
    assert.equal((await request('/missing.js')).status, 404);
    for (const [path, service] of [
      ['/api/equipment', 'inventory'],
      ['/api/equipment/123', 'inventory'],
      ['/api/availability', 'reservations'],
      ['/api/reservations/123', 'reservations'],
      ['/api/notifications', 'notifications'],
    ]) {
      const response = await request(path, {
        Origin: 'https://app.equipment.test',
        'X-Forwarded-Host': 'evil.test',
        'X-Forwarded-Proto': 'http',
        Forwarded: 'host=evil.test',
      });
      assert.equal(response.status, 200, path);
      assert.deepEqual(JSON.parse(response.body), {
        service,
        path,
        host: 'app.equipment.test',
        origin: 'https://app.equipment.test',
        forwardedHost: 'app.equipment.test',
        forwardedProto: 'https',
      });
    }
    for (const [service, api] of [
      ['inventory', 'equipment'],
      ['reservations', 'reservations'],
      ['notifications', 'notifications'],
    ]) {
      for (const suffix of [
        '/openapi/v1.json',
        '/scalar/v1',
        '/scalar/scalar.js',
        '/scalar/scalar.aspnetcore.js',
        '/scalar/favicon.svg',
        '/oauth/callback',
        `/api/${api}/123`,
      ]) {
        const response = await request(
          `/services/${service}${suffix}?test=value`,
        );
        assert.equal(response.status, 200, `${service}${suffix}`);
        assert.equal(JSON.parse(response.body).path, `${suffix}?test=value`);
        assert.equal(JSON.parse(response.body).service, service);
      }
    }
    for (const path of [
      '/health',
      '/alive',
      '/metrics',
      '/api',
      '/api/admin',
      '/api/equipment-admin',
      '/services/inventory/health',
      '/services/inventory/api/reservations',
      '/services/other/scalar/v1',
      '/services/inventory/scalar/v1/extra',
      '/services/inventory/openapi/v2.json',
    ]) {
      assert.equal((await request(path)).status, 404, path);
    }
    for (const path of [
      '/services%2finventory/scalar/v1',
      '/services/inventory/%2e%2e/health',
      '/services//inventory/scalar/v1',
    ]) {
      assert.equal((await request(path)).status, 400, path);
    }
    for (const host of ['evil.test', 'app.equipment.test:123']) {
      assert.equal(
        (await request('/api/equipment', { Host: host })).status,
        421,
      );
    }
  },
);
