import { createHash, createPrivateKey } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { OperationalFailure, cleanupAll } from './process.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { renderVerificationResources } from './azure-runtime.mjs';
import { createKubectlQualificationProbe } from './azure-qualification.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';

const fail = (message) => {
  throw new OperationalFailure(message);
};

export function createVerificationProvider({
  kubeconfig,
  pointId,
  signal,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
  saveOwnership,
}) {
  if (
    !/^[a-zA-Z0-9-]{1,80}$/.test(pointId) ||
    typeof saveOwnership !== 'function'
  )
    fail('Verification point and durable ownership writer are required.');
  const pointHash = createHash('sha256')
    .update(pointId)
    .digest('hex')
    .slice(0, 16);
  const expected = renderVerificationResources(pointHash);
  const name = expected.job.metadata.name;
  const collections = {
    job: '/apis/batch/v1/namespaces/equipment-recovery/jobs',
    service: '/api/v1/namespaces/equipment-recovery/services',
  };
  const owned = new Map();
  const uncertain = new Set();
  const validate = (value) => {
    if (!isDeepStrictEqual(value, expected))
      fail(
        'Verification template differs from the fixed reviewed Job/Service.',
      );
  };
  const context = (options) => ({ signal: options?.signal ?? signal });
  const probe = (options) =>
    createKubectlQualificationProbe({
      kubeconfig,
      command: kubectl,
      ...context(options),
    });
  const check = (kind, value) => {
    if (
      value?.metadata?.name !== name ||
      value.metadata.namespace !== 'equipment-recovery' ||
      value.metadata.labels?.['equipment.verify/point'] !== pointHash ||
      value.metadata.uid !== owned.get(kind)
    )
      fail('Verification resource ownership changed; refusing mutation.');
    if (
      kind === 'service' &&
      (!isDeepStrictEqual(
        value.spec.selector,
        expected.service.spec.selector,
      ) ||
        value.spec.type !== 'ClusterIP' ||
        !isDeepStrictEqual(
          value.spec.ports.map((port) => ({
            name: port.name,
            port: port.port,
            targetPort: port.targetPort,
            protocol: port.protocol,
          })),
          expected.service.spec.ports,
        ))
    )
      fail('Verification Service route differs from the fixed template.');
  };
  return {
    async create(templates, options) {
      validate(templates);
      for (const kind of ['service', 'job']) {
        const api = probe(options);
        if (await api.getOptional(`${collections[kind]}/${name}`))
          fail(
            'Verification point resource already exists; it is not owned by this attempt.',
          );
        uncertain.add(kind);
        const { value } = await api.json(
          'POST',
          collections[kind],
          expected[kind],
        );
        if (!/^[a-f0-9-]{36}$/.test(value.metadata?.uid ?? ''))
          fail('Verification creation returned no valid owner UID.');
        owned.set(kind, value.metadata.uid);
        check(kind, value);
        uncertain.delete(kind);
        await saveOwnership({ pointId, kind, name, uid: value.metadata.uid });
      }
    },
    async wait(templates, timeoutMs, options) {
      validate(templates);
      if (
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 1800000
      )
        fail('Verification readiness timeout is invalid.');
      const waitSignal = globalThis.AbortSignal.any([
        ...(context(options).signal ? [context(options).signal] : []),
        globalThis.AbortSignal.timeout(timeoutMs),
      ]);
      const api = probe({ signal: waitSignal });
      while (true) {
        const job = await api.getOptional(`${collections.job}/${name}`);
        const service = await api.getOptional(`${collections.service}/${name}`);
        check('job', job);
        check('service', service);
        if (
          job.status?.conditions?.some(
            (condition) =>
              condition.type === 'Failed' && condition.status === 'True',
          ) ||
          job.status?.failed > 0
        )
          fail('Isolated verification server failed before restoration.');
        if (job.status?.active === 1 && job.status.ready === 1) return;
        await delay(1000, undefined, { signal: waitSignal });
      }
    },
    async remove(templates, options) {
      validate(templates);
      const cleanupSignal =
        context(options).signal ?? globalThis.AbortSignal.timeout(120000);
      await cleanupAll(
        ['service', 'job'].map((kind) => ({
          operation: 'UID-owned verification resource cleanup',
          run: async () => {
            if (uncertain.has(kind))
              fail(
                'Verification create outcome is uncertain; ownership reconciliation is required.',
              );
            if (!owned.has(kind)) return;
            const api = probe({ signal: cleanupSignal });
            const path = `${collections[kind]}/${name}`;
            const actual = await api.getOptional(path);
            if (!actual) return;
            check(kind, actual);
            await runPrivateProcess(
              kubectl,
              [
                '--kubeconfig',
                kubeconfig,
                '--request-timeout=25s',
                'delete',
                '--raw',
                path,
                '-f',
                '-',
              ],
              {
                operation: 'Delete exact UID-owned verification resource',
                tool: 'kubectl',
                input: JSON.stringify({
                  apiVersion: 'v1',
                  kind: 'DeleteOptions',
                  preconditions: { uid: owned.get(kind) },
                  propagationPolicy: 'Foreground',
                }),
                signal: cleanupSignal,
                timeout: 30000,
              },
            );
            while (true) {
              const current = await api.getOptional(path);
              if (!current) return;
              check(kind, current);
              await delay(1000, undefined, { signal: cleanupSignal });
            }
          },
        })),
      );
    },
  };
}

const writerNames = [
  'web',
  'inventory',
  'reservations',
  'notifications',
  'keycloak',
];

export function createWriterObservation({
  kubeconfig,
  actor,
  signal,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
}) {
  if (!['backup', 'restore'].includes(actor))
    fail('Recovery actor is invalid.');
  const path = (name) => {
    if (!writerNames.includes(name))
      fail('Writer name is outside the reviewed inventory.');
    return `/apis/apps/v1/namespaces/equipment/deployments/${name}`;
  };
  const probe = (options) =>
    createKubectlQualificationProbe({
      kubeconfig,
      command: kubectl,
      signal: options?.signal ?? signal,
    });
  const observe = async (name, options) => {
    const api = probe(options);
    const deployment = (await api.json('GET', path(name))).value;
    if (
      deployment.metadata?.name !== name ||
      deployment.metadata.namespace !== 'equipment' ||
      !isDeepStrictEqual(deployment.spec?.selector, {
        matchLabels: { 'app.kubernetes.io/name': name },
      })
    )
      fail(
        'Writer Deployment selector differs from the reviewed fixed labels.',
      );
    const scale = (await api.json('GET', `${path(name)}/scale`)).value;
    if (
      !Number.isSafeInteger(scale.spec?.replicas) ||
      scale.spec.replicas < 0 ||
      scale.spec.replicas > 10
    )
      fail('Writer replica observation is invalid.');
    return { deployment, scale };
  };
  return {
    async readScale(name, options) {
      return (await observe(name, options)).scale.spec.replicas;
    },
    async scale(name, replicas, options) {
      if (actor !== 'backup') fail('Restore cannot mutate writer scale.');
      if (!Number.isSafeInteger(replicas) || replicas < 0 || replicas > 10)
        fail('Writer replicas are invalid.');
      await observe(name, options);
      await probe(options).noOpScale('equipment', name, replicas, true);
    },
    async waitScale(name, replicas, timeoutMs, options) {
      if (
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 300000 ||
        !Number.isSafeInteger(replicas) ||
        replicas < 0 ||
        replicas > 10
      )
        fail('Writer readiness bounds are invalid.');
      const waitSignal = globalThis.AbortSignal.any([
        ...((options?.signal ?? signal) ? [options?.signal ?? signal] : []),
        globalThis.AbortSignal.timeout(timeoutMs),
      ]);
      while (true) {
        const { deployment, scale } = await observe(name, {
          signal: waitSignal,
        });
        if (scale.spec.replicas === replicas) {
          if (replicas === 0) {
            const list = (
              await probe({ signal: waitSignal }).json(
                'GET',
                '/api/v1/namespaces/equipment/pods?limit=500',
              )
            ).value;
            if (
              list.kind !== 'PodList' ||
              !Array.isArray(list.items) ||
              list.items.length > 500 ||
              list.metadata?.continue
            )
              fail(
                'Writer Pod inventory is malformed or exceeds its bounded observation.',
              );
            let count = 0;
            for (const pod of list.items) {
              if (!pod.metadata || typeof pod.metadata.name !== 'string')
                fail('Writer Pod metadata is invalid.');
              if (pod.metadata.labels?.['app.kubernetes.io/name'] === name)
                count++;
            }
            if (count === 0) return;
          } else if (
            deployment.metadata.generation ===
              deployment.status?.observedGeneration &&
            deployment.status?.availableReplicas === replicas &&
            scale.status?.replicas === replicas
          )
            return;
        }
        await delay(1000, undefined, { signal: waitSignal });
      }
    },
  };
}

export function assertAcmeReconciliation({
  issuer,
  secret,
  expected,
  restoredResourceVersion,
}) {
  try {
    const directory = new URL(expected.directory),
      account = new URL(expected.accountUri);
    if (
      directory.protocol !== 'https:' ||
      directory.username ||
      directory.password ||
      account.origin !== directory.origin ||
      account.username ||
      account.password ||
      account.search ||
      account.hash ||
      typeof restoredResourceVersion !== 'string' ||
      !restoredResourceVersion ||
      secret.metadata?.resourceVersion !== restoredResourceVersion ||
      typeof secret.data?.['tls.key'] !== 'string'
    )
      throw Error();
    const privateKey = createPrivateKey(
      Buffer.from(secret.data['tls.key'], 'base64'),
    );
    if (privateKey.asymmetricKeyType !== 'rsa') throw Error();
    const checksum = createHash('sha256')
      .update(privateKey.export({ type: 'pkcs1', format: 'der' }))
      .digest('base64');
    if (
      checksum !== expected.keyChecksum ||
      issuer.spec?.acme?.server !== expected.directory ||
      issuer.status?.acme?.uri !== expected.accountUri ||
      issuer.status.acme.lastPrivateKeyHash !== checksum ||
      !issuer.status.conditions?.some(
        (condition) =>
          condition.type === 'Ready' && condition.status === 'True',
      )
    )
      throw Error();
  } catch {
    fail(
      'ACME account reconciliation has not established the restored key, original account and current Secret version.',
    );
  }
}
