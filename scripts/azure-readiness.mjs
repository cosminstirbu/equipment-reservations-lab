import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { OperationalFailure, cleanupAll } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';

const failure = () =>
  new OperationalFailure(
    'Private diagnostic forward failed; process output and connection details suppressed.',
  );
const targets = [
  {
    namespace: 'equipment',
    service: 'dashboard',
    ports: [18888, 18890],
    keys: ['dashboardOrigin', 'otlpOrigin'],
  },
  ...['prometheus', 'loki', 'tempo'].map((service) => ({
    namespace: 'equipment-platform',
    service,
    ports: [8443],
    keys: [`${service}Origin`],
  })),
];

function forward(settings, target, controller) {
  let child;
  let closed = false;
  let stopRequested = false;
  let timer;
  let rejectReady;
  let closeResolve;
  const abort = () => {
    rejectReady?.(failure());
    child?.kill('SIGKILL');
  };
  const done = new Promise((resolve) => {
    closeResolve = resolve;
  });
  const ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    let pending = '';
    let bytes = 0;
    const ports = new Map();
    const failed = () => {
      reject(failure());
      if (!stopRequested) controller.abort(failure());
    };
    try {
      child = spawn(
        settings.command ?? 'kubectl',
        [
          ...(settings.prefix ?? []),
          '--kubeconfig',
          settings.kubeconfig,
          '--namespace',
          target.namespace,
          'port-forward',
          '--address',
          '127.0.0.1',
          `service/${target.service}`,
          ...target.ports.map((port) => `0:${port}`),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch {
      failed();
      closed = true;
      closeResolve();
      return;
    }
    timer = setTimeout(() => {
      failed();
      child.kill('SIGKILL');
    }, settings.startTimeoutMs ?? 30000);
    child.on('error', failed);
    child.on('close', () => {
      closed = true;
      controller.signal.removeEventListener('abort', abort);
      clearTimeout(timer);
      closeResolve();
      if (!stopRequested) failed();
    });
    controller.signal.addEventListener('abort', abort, { once: true });
    if (controller.signal.aborted) abort();
    child.stderr.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 65536) {
        failed();
        child.kill('SIGKILL');
      }
    });
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 65536) {
        failed();
        child.kill('SIGKILL');
        return;
      }
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) {
        const match = /^Forwarding from 127\.0\.0\.1:(\d+) -> (\d+)$/.exec(
          line,
        );
        if (!match) continue;
        const local = Number(match[1]);
        const remote = Number(match[2]);
        if (
          !target.ports.includes(remote) ||
          local < 1 ||
          local > 65535 ||
          ports.has(remote)
        ) {
          failed();
          child.kill('SIGKILL');
          return;
        }
        ports.set(remote, local);
      }
      if (ports.size === target.ports.length) {
        clearTimeout(timer);
        resolve(
          Object.fromEntries(
            target.keys.map((key, index) => [
              key,
              `${target.ports[index] === 18888 ? 'http' : 'https'}://127.0.0.1:${ports.get(target.ports[index])}`,
            ]),
          ),
        );
      }
    });
  });
  return {
    ready,
    async close() {
      stopRequested = true;
      clearTimeout(timer);
      rejectReady(failure());
      if (closed) return;
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
      let deadline;
      try {
        await Promise.race([
          done,
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(failure()), 6500);
          }),
        ]);
      } finally {
        clearTimeout(kill);
        clearTimeout(deadline);
      }
    },
  };
}

export async function withDiagnosticForwards(settings, action) {
  if (
    typeof settings.kubeconfig !== 'string' ||
    !settings.kubeconfig ||
    typeof action !== 'function'
  )
    throw failure();
  const controller = new globalThis.AbortController();
  const abort = () => controller.abort(failure());
  settings.signal?.addEventListener('abort', abort, { once: true });
  const processes = [];
  let primary;
  try {
    if (settings.signal?.aborted) throw failure();
    const origins = {};
    for (const target of targets) {
      controller.signal.throwIfAborted();
      const process = forward(settings, target, controller);
      processes.push(process);
      Object.assign(origins, await process.ready);
    }
    const result = await action({ ...origins, signal: controller.signal });
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    primary = error;
  } finally {
    settings.signal?.removeEventListener('abort', abort);
    await cleanupAll(
      processes.map((process) => ({
        operation: 'private diagnostic forward cleanup',
        run: () => process.close(),
      })),
      { primary },
    );
  }
}

function privateState(stateDirectory, operation) {
  try {
    const directory = resolve(stateDirectory);
    assertPrivatePath(directory, 0o700);
    const load = (name) => {
      const path = join(directory, name);
      assertPrivatePath(path, 0o600);
      return JSON.parse(readFileSync(path, 'utf8'));
    };
    const state = load('smoke-state.json');
    if (state.credentialsFile && state.credentialsFile !== 'credentials.json')
      throw new Error('credentials path');
    const credentials = load('credentials.json');
    for (const key of [
      'alice',
      'bob',
      'manager',
      'dashboardApi',
      'dashboardOtlp',
      'prometheusApi',
      'lokiApi',
      'tempoApi',
    ]) {
      if (typeof credentials[key] !== 'string' || credentials[key].length < 16)
        throw new Error('credentials');
    }
    for (const key of ['applicationOrigin', 'authority']) {
      const url = new URL(state[key]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.hostname.endsWith('.codingfunlab.com')
      )
        throw new Error('origin');
    }
    const ca = join(directory, 'internal-ca.crt');
    assertPrivatePath(ca, 0o600);
    if (!readFileSync(ca, 'utf8').includes('-----BEGIN CERTIFICATE-----'))
      throw new Error('ca');
    return {
      directory,
      state,
      credentials,
      ca,
      checkpoint:
        operation === 'start' ? load('persistence-checkpoint.json') : undefined,
    };
  } catch {
    throw new OperationalFailure(
      'Azure readiness requires valid private state, strong dedicated credentials, certificate trust and a retained start checkpoint; private values suppressed.',
    );
  }
}

export async function verifyAzureReadiness({
  stateDirectory,
  kubeconfig,
  operation,
  signal,
  kubectl = process.env.KUBECTL ?? 'kubectl',
}) {
  if (!['start', 'bootstrap'].includes(operation))
    throw new OperationalFailure('Azure readiness operation must be explicit.');
  const state = privateState(stateDirectory, operation);
  assertPrivatePath(resolve(kubeconfig), 0o600);
  const run = (args) =>
    runPrivateProcess(kubectl, ['--kubeconfig', kubeconfig, ...args], {
      tool: 'kubectl',
      operation: 'Azure readiness cluster checks',
      timeout: 300000,
      signal,
    });
  for (const namespace of [
    'equipment',
    'equipment-platform',
    'argocd',
    'cert-manager',
  ]) {
    await run([
      '--namespace',
      namespace,
      'wait',
      '--for=condition=Available',
      'deployment',
      '--all',
      '--timeout=240s',
    ]);
    if (namespace !== 'cert-manager')
      await run([
        '--namespace',
        namespace,
        'wait',
        '--for=condition=Ready',
        'certificate',
        '--all',
        '--timeout=240s',
      ]);
  }
  const pods = JSON.parse(
    await run(['--namespace', 'equipment', 'get', 'pods', '-o', 'json']),
  );
  const statuses = JSON.parse(
    await run([
      '--namespace',
      'equipment',
      'get',
      'secretproviderclasspodstatuses',
      '-o',
      'json',
    ]),
  );
  const consumers = pods.items?.filter((pod) =>
    pod.spec?.volumes?.some(
      (volume) => volume.csi?.driver === 'secrets-store.csi.k8s.io',
    ),
  );
  if (
    !consumers?.length ||
    consumers.some(
      (pod) =>
        !statuses.items?.some(
          (status) =>
            status.status?.podName === pod.metadata.name &&
            status.status?.mounted === true,
        ),
    )
  )
    throw new OperationalFailure(
      'Azure readiness CSI mounts have not converged.',
    );
  return withDiagnosticForwards(
    { kubeconfig, command: kubectl, signal },
    async (forwards) => {
      await runPrivateProcess(
        process.execPath,
        [fileURLToPath(import.meta.url), '--probe'],
        {
          tool: 'node',
          operation: 'Azure readiness deployed HTTP and native history checks',
          timeout: 600000,
          signal: forwards.signal,
          env: { ...process.env, NODE_EXTRA_CA_CERTS: state.ca },
          input: JSON.stringify({ ...state, ...forwards, signal: undefined }),
        },
      );
      return {
        certificates: true,
        secrets: true,
        login: true,
        persistence: true,
        messaging: true,
        deployed: true,
        history: true,
      };
    },
  );
}

export function validateAzureReadinessInputs({
  stateDirectory,
  kubeconfig,
  operation,
}) {
  if (!['start', 'bootstrap'].includes(operation))
    throw new OperationalFailure('Azure readiness operation must be explicit.');
  privateState(stateDirectory, operation);
  assertPrivatePath(resolve(kubeconfig), 0o600);
}

async function probe(options) {
  const {
    verifyDeploymentSurface,
    verifyDeployedIdentity,
    verifyDeployedAuthorization,
    verifyDeployedLifecycle,
    verifyDeployedDiagnostics,
    verifyDeployedTelemetryScenario,
    authenticateCodeFlow,
    verifyPersistenceCheckpoint,
  } = await import('../tests/DeployedApplication/scenarios.mjs');
  const settings = {
    ...options.state,
    credentials: options.credentials,
    dashboardOrigin: options.dashboardOrigin,
    otlpOrigin: options.otlpOrigin,
  };
  await verifyDeploymentSurface(settings);
  await verifyDeployedIdentity(settings);
  await verifyDeployedAuthorization(settings);
  const lifecycle = await verifyDeployedLifecycle(settings);
  await verifyDeployedDiagnostics(settings);
  await verifyDeployedTelemetryScenario(settings);
  if (options.checkpoint) {
    const token = await authenticateCodeFlow({
      ...settings,
      username: 'employee-a',
      password: options.credentials.alice,
    });
    await verifyPersistenceCheckpoint({
      applicationOrigin: settings.applicationOrigin,
      token,
      checkpoint: options.checkpoint,
    });
  }
  await verifyNativeHistory(options, lifecycle.traceIds);
}

export async function verifyNativeHistory(
  options,
  traceIds,
  { timeoutMs = 60000, pollMs = 2000 } = {},
) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 1
  )
    throw failure();
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      return await nativeHistoryAttempt(options, traceIds);
    } catch {
      if (Date.now() >= deadline) throw failure();
      await delay(Math.min(pollMs, deadline - Date.now()), undefined, {
        signal: options.signal,
      });
    }
  }
}

async function nativeHistoryAttempt(options, traceIds) {
  const query = async (origin, path, key) => {
    const response = await globalThis.fetch(`${origin}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: globalThis.AbortSignal.timeout(15000),
    });
    if (!response.ok) throw failure();
    const text = await response.text();
    if (
      text.length > 8388608 ||
      Object.values(options.credentials).some((value) => text.includes(value))
    )
      throw failure();
    return { value: JSON.parse(text), text };
  };
  const metrics = await query(
    options.prometheusOrigin,
    '/api/v1/query?query=' +
      encodeURIComponent(
        '{service_name=~"inventory|reservations|notifications"}',
      ),
    options.credentials.prometheusApi,
  );
  if (metrics.value.status !== 'success' || !metrics.value.data?.result?.length)
    throw failure();
  const logs = await query(
    options.lokiOrigin,
    '/loki/api/v1/query_range?query=' +
      encodeURIComponent(
        '{service_name=~"inventory|reservations|notifications"}',
      ) +
      '&limit=1000',
    options.credentials.lokiApi,
  );
  if (logs.value.status !== 'success' || !logs.value.data?.result?.length)
    throw failure();
  if (
    !traceIds ||
    typeof traceIds !== 'object' ||
    !Object.values(traceIds).length
  )
    throw failure();
  let correlated = false;
  for (const traceId of Object.values(traceIds)) {
    if (!/^[a-f0-9]{32}$/.test(traceId)) throw failure();
    if (!logs.text.includes(traceId)) continue;
    const trace = await query(
      options.tempoOrigin,
      `/api/traces/${traceId}`,
      options.credentials.tempoApi,
    );
    if (trace.value.batches?.length || trace.value.resourceSpans?.length)
      correlated = true;
  }
  if (!correlated) throw failure();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--probe')
      throw failure();
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 1048576) throw failure();
    }
    await probe(JSON.parse(input));
  } catch {
    console.error(
      'Azure readiness HTTP, persistence or native history verification failed; private details suppressed.',
    );
    process.exitCode = 1;
  }
}
