import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { clearTimeout } from 'node:timers';
import { cleanupAll, executeProcess, processFailure } from './process.mjs';
import { performance } from 'node:perf_hooks';
import { verifyConfigRollout } from './deployment-config-rollout-live.mjs';

const root = resolve(import.meta.dirname, '..');
const cluster = 'equipment-compat-012';
const provider = process.env.CONTAINER_RUNTIME ?? 'podman';
assert.ok(['podman', 'docker'].includes(provider));
const environment = { ...process.env, KIND_EXPERIMENTAL_PROVIDER: provider };
const nodeImage =
  'docker.io/library/node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d';
const nginxImage =
  'docker.io/library/nginx:1.28.0-alpine@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284';

function run(command, args, options = {}) {
  let output = 'private-capture';
  if (command === 'kind')
    output = args[0] === 'get' ? 'public-capture' : 'stream';
  if (command === 'kubectl' && !args.includes('secret') && !options.input) {
    output =
      args.includes('get') || args.includes('kustomize')
        ? 'public-capture'
        : 'stream';
  }
  return executeProcess(command, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 180_000,
    killSignal: 'SIGKILL',
    operation: 'Ingress fixture operation',
    tool: command,
    output,
    ...options,
  }).trim();
}

function forward(kubectl, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'kubectl',
      [
        ...kubectl,
        '-n',
        'equipment-platform',
        'port-forward',
        '--address',
        '127.0.0.1',
        'service/traefik',
        `0:${port}`,
      ],
      { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      child.stopping = true;
      reject(
        processFailure(
          { code: 'ETIMEDOUT' },
          {
            operation: 'start ingress forward',
            tool: 'kubectl',
            durationMs: 15000,
          },
        ),
      );
    }, 15_000);
    const started = performance.now();
    let output = '';
    child.forwardFailure = undefined;
    child.stdout.on('data', (data) => {
      output = (output + data).slice(-4000);
      const match = output.match(/Forwarding from 127[.]0[.]0[.]1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        console.log('Ingress forward ready on loopback.');
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      const failure = processFailure(error, {
        operation: 'start ingress forward',
        tool: 'kubectl',
        durationMs: performance.now() - started,
      });
      child.forwardFailure = failure;
      reject(failure);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (!child.stopping) {
        const failure = processFailure(
          { status: code, signal },
          {
            operation: 'ingress forward exited',
            tool: 'kubectl',
            durationMs: performance.now() - started,
          },
        );
        child.forwardFailure = failure;
        if (!output.includes('Forwarding from')) reject(failure);
        else console.error(failure.message);
      }
    });
    child.stderr.resume();
  });
}

async function stopForward(child) {
  child.stopping = true;
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          processFailure(
            { code: 'ETIMEDOUT' },
            {
              operation: 'stop ingress forward',
              tool: 'kubectl',
              durationMs: 5000,
            },
          ),
        );
      }, 5000);
      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
  if (child.forwardFailure) throw child.forwardFailure;
}

function request(port, host, path, ca, servername = host, headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = (ca ? httpsRequest : httpRequest)(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { Host: host, ...headers },
        ...(ca ? { ca, servername } : {}),
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (data) => {
          body += data;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode, body }),
        );
      },
    );
    outgoing.setTimeout(5000, () =>
      outgoing.destroy(new Error('Ingress HTTP deadline exceeded')),
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test(
  'production Traefik Ingress requires trusted HTTPS on both hosts and denies operational paths',
  { timeout: 600_000 },
  async (t) => {
    const existing = run('kind', ['get', 'clusters']).split(/\s+/);
    assert.ok(
      !existing.includes(cluster),
      `Refusing existing ${cluster}; fixture ownership is unknown. Remove only an explicitly authorized owned temporary cluster before retrying.`,
    );
    const directory = mkdtempSync(join(tmpdir(), 'equipment-ingress-'));
    const kubeconfig = join(directory, 'kubeconfig');
    const kubectl = [
      '--kubeconfig',
      kubeconfig,
      '--context',
      `kind-${cluster}`,
    ];
    let owned = false;
    const forwards = [];
    t.after(() =>
      cleanupAll([
        ...forwards.map((child) => ({
          operation: 'stop ingress forward',
          run: () => stopForward(child),
        })),
        ...(owned
          ? [
              {
                operation: 'delete owned ingress cluster',
                run: () =>
                  run('kind', [
                    'delete',
                    'cluster',
                    '--name',
                    cluster,
                    '--kubeconfig',
                    kubeconfig,
                  ]),
              },
            ]
          : []),
        {
          operation: 'remove ingress private fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ]),
    );
    const previousUmask = process.umask(0o077);
    try {
      for (const name of ['ca', 'wrong-ca']) {
        writeFileSync(
          join(directory, `${name}.cnf`),
          `[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=equipment-ingress-${name}\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n`,
        );
        run('openssl', [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-config',
          join(directory, `${name}.cnf`),
          '-keyout',
          join(directory, `${name}.key`),
          '-out',
          join(directory, `${name}.crt`),
        ]);
      }
      run('openssl', [
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=app.equipment.test',
        '-keyout',
        join(directory, 'server.key'),
        '-out',
        join(directory, 'server.csr'),
      ]);
      writeFileSync(
        join(directory, 'server.ext'),
        'subjectAltName=DNS:app.equipment.test,DNS:identity.equipment.test\nbasicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
      );
      run('openssl', [
        'x509',
        '-req',
        '-in',
        join(directory, 'server.csr'),
        '-CA',
        join(directory, 'ca.crt'),
        '-CAkey',
        join(directory, 'ca.key'),
        '-CAcreateserial',
        '-days',
        '1',
        '-extfile',
        join(directory, 'server.ext'),
        '-out',
        join(directory, 'server.crt'),
      ]);
    } finally {
      process.umask(previousUmask);
    }
    const config = join(directory, 'kind.yaml');
    writeFileSync(
      config,
      `kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nname: ${cluster}\nnodes:\n  - role: control-plane\n    image: kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0\n`,
    );
    run('kind', [
      'create',
      'cluster',
      '--name',
      cluster,
      '--config',
      config,
      '--kubeconfig',
      kubeconfig,
      '--wait',
      '120s',
    ]);
    owned = true;
    const kube = (...args) => run('kubectl', [...kubectl, ...args]);
    kube('create', 'namespace', 'equipment');
    kube('create', 'namespace', 'equipment-platform');
    kube('apply', '-k', 'deploy/platform');
    kube('-n', 'kube-system', 'rollout', 'restart', 'deployment/coredns');
    kube(
      '-n',
      'kube-system',
      'rollout',
      'status',
      'deployment/coredns',
      '--timeout=90s',
    );
    kube(
      '-n',
      'equipment',
      'create',
      'secret',
      'tls',
      'equipment-tls',
      '--cert',
      join(directory, 'server.crt'),
      '--key',
      join(directory, 'server.key'),
    );
    const backend = join(directory, 'backend.cjs');
    writeFileSync(
      backend,
      `require('node:http').createServer((request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({path:request.url,host:request.headers.host,proto:request.headers['x-forwarded-proto']}));}).listen(8080,'0.0.0.0');`,
    );
    kube(
      '-n',
      'equipment',
      'create',
      'configmap',
      'ingress-provider-fixture',
      '--from-file',
      `backend.cjs=${backend}`,
    );
    kube(
      '-n',
      'equipment',
      'create',
      'configmap',
      'ingress-web-fixture',
      '--from-file',
      `nginx.conf=${join(root, 'deploy/images/nginx.conf')}`,
      '--from-literal',
      'index.html=<html>equipment trusted ingress fixture</html>',
    );
    const fixtures = [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'ingress-provider-fixture', namespace: 'equipment' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'ingress-provider-fixture' } },
          template: {
            metadata: { labels: { app: 'ingress-provider-fixture' } },
            spec: {
              automountServiceAccountToken: false,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                runAsGroup: 1000,
              },
              containers: [
                {
                  name: 'provider',
                  image: nodeImage,
                  command: ['node', '/fixture/backend.cjs'],
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: '50m', memory: '32Mi' },
                    limits: { cpu: '250m', memory: '128Mi' },
                  },
                  volumeMounts: [
                    { name: 'fixture', mountPath: '/fixture', readOnly: true },
                  ],
                },
              ],
              volumes: [
                {
                  name: 'fixture',
                  configMap: { name: 'ingress-provider-fixture' },
                },
              ],
            },
          },
        },
      },
      ...['inventory', 'reservations', 'notifications', 'keycloak'].map(
        (name) => ({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name, namespace: 'equipment' },
          spec: {
            selector: { app: 'ingress-provider-fixture' },
            ports: [{ port: 8080, targetPort: 8080 }],
          },
        }),
      ),
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'ingress-web-fixture', namespace: 'equipment' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'ingress-web-fixture' } },
          template: {
            metadata: { labels: { app: 'ingress-web-fixture' } },
            spec: {
              automountServiceAccountToken: false,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 101,
                runAsGroup: 101,
                fsGroup: 101,
              },
              containers: [
                {
                  name: 'web',
                  image: nginxImage,
                  command: ['nginx', '-g', 'daemon off;'],
                  securityContext: {
                    readOnlyRootFilesystem: true,
                    allowPrivilegeEscalation: false,
                  },
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: '50m', memory: '32Mi' },
                    limits: { cpu: '250m', memory: '128Mi' },
                  },
                  volumeMounts: [
                    {
                      name: 'fixture',
                      mountPath: '/etc/nginx/nginx.conf',
                      subPath: 'nginx.conf',
                      readOnly: true,
                    },
                    {
                      name: 'fixture',
                      mountPath: '/usr/share/nginx/html/index.html',
                      subPath: 'index.html',
                      readOnly: true,
                    },
                    { name: 'tmp', mountPath: '/tmp' },
                  ],
                },
              ],
              volumes: [
                { name: 'fixture', configMap: { name: 'ingress-web-fixture' } },
                { name: 'tmp', emptyDir: { sizeLimit: '16Mi' } },
              ],
            },
          },
        },
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'web', namespace: 'equipment' },
        spec: {
          selector: { app: 'ingress-web-fixture' },
          ports: [{ port: 8080, targetPort: 8080 }],
        },
      },
    ];
    run('kubectl', [...kubectl, 'apply', '-f', '-'], {
      input: JSON.stringify({
        apiVersion: 'v1',
        kind: 'List',
        items: fixtures,
      }),
    });
    kube(
      '-n',
      'equipment',
      'apply',
      '-f',
      'deploy/environments/local/ingress.yaml',
    );
    for (const [namespace, name] of [
      ['equipment', 'ingress-provider-fixture'],
      ['equipment', 'ingress-web-fixture'],
      ['equipment-platform', 'traefik'],
    ])
      kube(
        '-n',
        namespace,
        'rollout',
        'status',
        `deployment/${name}`,
        '--timeout=180s',
      );
    const plain = await forward(kubectl, 80);
    forwards.push(plain.child);
    const secure = await forward(kubectl, 443);
    forwards.push(secure.child);
    const ca = readFileSync(join(directory, 'ca.crt'));
    let configured = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        if (
          (await request(secure.port, 'app.equipment.test', '/', ca)).status ===
          200
        ) {
          configured = true;
          break;
        }
      } catch {
        /* An unconfigured TLS router may present its untrusted default certificate. */
      }
      if (
        (await request(plain.port, 'app.equipment.test', '/')).body.includes(
          'equipment trusted ingress fixture',
        )
      ) {
        configured = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(configured, 'actual ingress routers become observable');
    for (const host of ['app.equipment.test', 'identity.equipment.test']) {
      const path = host.startsWith('app.')
        ? '/'
        : '/realms/equipment/.well-known/openid-configuration';
      assert.equal(
        (await request(plain.port, host, path)).status,
        404,
        `${host} must deny clear HTTP`,
      );
      const response = await request(secure.port, host, path, ca);
      assert.equal(response.status, 200, `${host} serves trusted HTTPS`);
      if (host.startsWith('identity.'))
        assert.deepEqual(JSON.parse(response.body), {
          path,
          host,
          proto: 'https',
        });
      else assert.match(response.body, /equipment trusted ingress fixture/);
      await assert.rejects(
        request(
          secure.port,
          host,
          path,
          readFileSync(join(directory, 'wrong-ca.crt')),
        ),
        { code: /CERT|ISSUER|VERIFY/ },
      );
      await assert.rejects(
        request(secure.port, host, path, ca, 'wrong.equipment.test'),
        { code: /CERT|ISSUER|VERIFY/ },
      );
    }
    const equipment = await request(
      secure.port,
      'app.equipment.test',
      '/api/equipment',
      ca,
      'app.equipment.test',
      { 'X-Forwarded-Proto': 'http' },
    );
    assert.deepEqual(JSON.parse(equipment.body), {
      path: '/api/equipment',
      host: 'app.equipment.test',
      proto: 'https',
    });
    for (const [host, paths] of [
      ['app.equipment.test', ['/admin', '/health', '/alive']],
      [
        'identity.equipment.test',
        ['/admin/', '/realms/master/', '/health', '/metrics'],
      ],
    ]) {
      for (const path of paths)
        assert.equal(
          (await request(secure.port, host, path, ca)).status,
          404,
          `${host}${path} remains denied`,
        );
    }
    await t.test(
      'public configuration updates roll consuming Pods and preserve fixture PVC data',
      async () => {
        await verifyConfigRollout({
          root,
          kubectl: kube,
          apply: (items) =>
            run('kubectl', [...kubectl, 'apply', '-f', '-'], {
              input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items }),
            }),
          request: (host, path) => request(secure.port, host, path, ca),
          namespace: 'equipment',
        });
      },
    );
  },
);
