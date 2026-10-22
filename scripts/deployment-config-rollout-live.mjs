import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import parsers from '@stoplight/spectral-parsers';
import { cleanupAll } from './process.mjs';

const nodeImage =
  'docker.io/library/node@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d';
const nginxImage =
  'docker.io/library/nginx@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284';
function documents(text) {
  return text
    .split(/^---\s*$/m)
    .filter((part) => part.trim())
    .map((part) => parsers.Yaml.parse(part).data);
}
function updateLiteral(path, key, change) {
  const source = parsers.Yaml.parse(readFileSync(path, 'utf8')).data;
  let found = false;
  source.literals = source.literals.map((entry) => {
    if (!entry.startsWith(`${key}=`)) return entry;
    found = true;
    return `${key}=${change(entry.slice(key.length + 1))}`;
  });
  assert.ok(found, `public fixture configuration ${key} exists`);
  writeFileSync(path, JSON.stringify(source, null, 2) + '\n');
}

export async function verifyConfigRollout({
  root,
  kubectl,
  apply,
  request,
  namespace = 'equipment',
}) {
  const directory = mkdtempSync(join(tmpdir(), 'equipment-live-rollout-'));
  let primary;
  try {
    cpSync(join(root, 'deploy'), join(directory, 'deploy'), {
      recursive: true,
    });
    const local = join(directory, 'deploy/environments/local');
    const proxyPath = join(local, 'proxy-configuration.yaml');
    updateLiteral(proxyPath, 'nginx.conf', (value) =>
      value.replace(
        'server {',
        'server {\n        location = /config-version { return 200 "generation-one"; }',
      ),
    );
    const claim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: 'config-rollout-marker', namespace },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '16Mi' } },
      },
    };
    apply([claim]);
    let previousWeb;
    let previousApi;
    const deploy = () => {
      const resources = documents(kubectl('kustomize', local));
      const configmaps = resources.filter(
        (entry) =>
          entry.kind === 'ConfigMap' &&
          /^(equipment-runtime|equipment-web|equipment-proxy)-/.test(
            entry.metadata.name,
          ),
      );
      const originalWeb = resources.find(
        (entry) => entry.kind === 'Deployment' && entry.metadata.name === 'web',
      );
      const web = JSON.parse(JSON.stringify(originalWeb));
      web.metadata = { name: 'config-rollout-web', namespace };
      web.spec.selector.matchLabels = { 'equipment.test/rollout': 'web' };
      web.spec.template.metadata = {
        labels: { 'equipment.test/rollout': 'web' },
      };
      const pod = web.spec.template.spec;
      const container = pod.containers[0];
      container.image = nginxImage;
      container.command = ['nginx', '-g', 'daemon off;'];
      pod.volumes.push({
        name: 'marker',
        persistentVolumeClaim: { claimName: 'config-rollout-marker' },
      });
      container.volumeMounts.unshift({
        name: 'marker',
        mountPath: '/usr/share/nginx/html',
      });
      pod.initContainers = [
        {
          name: 'marker',
          image: nginxImage,
          command: [
            'sh',
            '-ec',
            'if [ ! -f /data/index.html ]; then printf retained-marker > /data/index.html; fi; if [ ! -f /data/auth-config.json ]; then touch /data/auth-config.json; fi; chown -R 101:101 /data',
          ],
          securityContext: {
            runAsUser: 0,
            runAsNonRoot: false,
            allowPrivilegeEscalation: false,
            capabilities: { drop: ['ALL'], add: ['CHOWN'] },
          },
          resources: {
            requests: { cpu: '10m', memory: '16Mi' },
            limits: { cpu: '100m', memory: '64Mi' },
          },
          volumeMounts: [{ name: 'marker', mountPath: '/data' }],
        },
      ];
      const inventory = resources.find(
        (entry) =>
          entry.kind === 'Deployment' && entry.metadata.name === 'inventory',
      );
      const api = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'config-rollout-api', namespace },
        spec: {
          replicas: 1,
          strategy: { type: 'Recreate' },
          selector: { matchLabels: { 'equipment.test/rollout': 'api' } },
          template: {
            metadata: { labels: { 'equipment.test/rollout': 'api' } },
            spec: {
              automountServiceAccountToken: false,
              containers: [
                {
                  name: 'runtime-config',
                  image: nodeImage,
                  command: [
                    'node',
                    '-e',
                    `require('node:http').createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({issuer:process.env.Identity__Authority}));}).listen(8080,'0.0.0.0')`,
                  ],
                  envFrom: inventory.spec.template.spec.containers[0].envFrom,
                  ports: [{ containerPort: 8080 }],
                  readinessProbe: {
                    httpGet: { path: '/', port: 8080 },
                    periodSeconds: 1,
                    timeoutSeconds: 2,
                    failureThreshold: 30,
                  },
                  resources: {
                    requests: { cpu: '10m', memory: '32Mi' },
                    limits: { cpu: '250m', memory: '128Mi' },
                  },
                },
              ],
            },
          },
        },
      };
      const service = (name, target) => ({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name, namespace },
        spec: {
          selector: { 'equipment.test/rollout': target },
          ports: [{ port: 8080, targetPort: 8080 }],
        },
      });
      apply([
        ...configmaps,
        web,
        api,
        service('web', 'web'),
        service('inventory', 'api'),
      ]);
      for (const name of ['config-rollout-api', 'config-rollout-web'])
        kubectl(
          '--namespace',
          namespace,
          'rollout',
          'status',
          `deployment/${name}`,
          '--timeout=180s',
        );
      const pods = JSON.parse(
        kubectl(
          '--namespace',
          namespace,
          'get',
          'pods',
          '-l',
          'equipment.test/rollout',
          '-o',
          'json',
        ),
      ).items.filter((entry) => !entry.metadata.deletionTimestamp);
      const webUid = pods.find(
        (entry) => entry.metadata.labels['equipment.test/rollout'] === 'web',
      ).metadata.uid;
      const apiUid = pods.find(
        (entry) => entry.metadata.labels['equipment.test/rollout'] === 'api',
      ).metadata.uid;
      if (previousWeb)
        assert.notEqual(
          webUid,
          previousWeb,
          'public web/proxy update must replace its consuming Pod',
        );
      if (previousApi)
        assert.notEqual(
          apiUid,
          previousApi,
          'public API runtime update must replace its consuming Pod',
        );
      previousWeb = webUid;
      previousApi = apiUid;
      return configmaps;
    };
    const observe = async (path, matches) => {
      const deadline = Date.now() + 15000;
      while (true) {
        try {
          const response = await request('app.equipment.test', path);
          if (response.status === 200 && matches(response.body))
            return response;
        } catch {
          // EndpointSlice changes can briefly leave the ingress without a ready upstream.
        }
        if (Date.now() >= deadline)
          throw new Error(
            'Configuration rollout HTTP observation exceeded15seconds.',
          );
        await delay(100);
      }
    };
    const first = deploy();
    assert.equal(
      (await observe('/', (body) => body === 'retained-marker')).body,
      'retained-marker',
    );
    assert.equal(
      (await observe('/config-version', (body) => body === 'generation-one'))
        .body,
      'generation-one',
    );
    const beforeAuth = JSON.parse(
      (
        await observe(
          '/auth-config.json',
          (body) =>
            JSON.parse(body).issuer ===
            'https://identity.equipment.test/realms/equipment',
        )
      ).body,
    );
    assert.equal(
      beforeAuth.issuer,
      'https://identity.equipment.test/realms/equipment',
    );
    assert.equal(
      JSON.parse(
        (
          await observe(
            '/api/equipment',
            (body) => JSON.parse(body).issuer === beforeAuth.issuer,
          )
        ).body,
      ).issuer,
      beforeAuth.issuer,
    );
    const oldClaim = JSON.parse(
      kubectl(
        '--namespace',
        namespace,
        'get',
        'pvc',
        'config-rollout-marker',
        '-o',
        'json',
      ),
    );
    const issuer = 'https://identity.updated.test/realms/equipment';
    updateLiteral(
      join(local, 'configuration.yaml'),
      'Identity__Authority',
      () => issuer,
    );
    updateLiteral(
      join(local, 'web-configuration.yaml'),
      'auth-config.json',
      (value) => JSON.stringify({ ...JSON.parse(value), issuer }),
    );
    updateLiteral(proxyPath, 'nginx.conf', (value) =>
      value.replace('generation-one', 'generation-two'),
    );
    const second = deploy();
    assert.notDeepEqual(
      first.map((entry) => entry.metadata.name),
      second.map((entry) => entry.metadata.name),
    );
    assert.equal(
      (await observe('/config-version', (body) => body === 'generation-two'))
        .body,
      'generation-two',
    );
    assert.equal(
      JSON.parse(
        (
          await observe(
            '/auth-config.json',
            (body) => JSON.parse(body).issuer === issuer,
          )
        ).body,
      ).issuer,
      issuer,
    );
    assert.equal(
      JSON.parse(
        (
          await observe(
            '/api/equipment',
            (body) => JSON.parse(body).issuer === issuer,
          )
        ).body,
      ).issuer,
      issuer,
    );
    assert.equal(
      (await observe('/', (body) => body === 'retained-marker')).body,
      'retained-marker',
      'public config rollout retains fixture PVC data',
    );
    const currentClaim = JSON.parse(
      kubectl(
        '--namespace',
        namespace,
        'get',
        'pvc',
        'config-rollout-marker',
        '-o',
        'json',
      ),
    );
    assert.equal(currentClaim.metadata.uid, oldClaim.metadata.uid);
    assert.equal(currentClaim.spec.volumeName, oldClaim.spec.volumeName);
  } catch (error) {
    primary = error;
  } finally {
    await cleanupAll(
      [
        {
          operation: 'remove rollout fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ],
      { primary },
    );
  }
}
