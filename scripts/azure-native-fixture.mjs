import { get as httpsGet } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { isAbsolute } from 'node:path';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import assert from 'node:assert/strict';
import { cleanupAll, ProcessFailure, processFailure } from './process.mjs';

export const nativePrerequisitePhases = Object.freeze([
  'prereq-namespace-equipment',
  'prereq-namespace-equipment-recovery',
  'prereq-namespace-cert-manager',
  'prereq-namespace-argocd',
  'prereq-clusterissuer-crd-apply',
  'prereq-clusterissuer-established',
  'prereq-role-definitions',
  'prereq-recovery-bindings',
  'prereq-continuity-bindings',
]);

const phases = new Set([
  ...nativePrerequisitePhases,
  'setup',
  'kind-create',
  'prerequisites-install',
  'issuer-seed',
  'account-register',
  'account-key-replace',
  'account-reconcile',
  'capture-inventory',
  'source-validation',
  'secret-restore',
  'stale-version-negative',
  'actor-authority-negative',
  'tls-generate',
  'tls-start',
  'tls-health',
  'tls-query-missing-auth',
  'tls-query-wrong-auth',
  'tls-query-valid-auth',
  'cluster-delete',
  'pod-delete',
  'tls-close',
  'private-directory-remove',
  'native-admission',
  'native-authorization',
  'missing-secret-negative',
  'stale-ready-negative',
  'untrusted-tls-negative',
]);
const tools = new Set([
  'node',
  'kind',
  'kubectl',
  'podman',
  'openssl',
  'fixture',
]);

export function nativeFixtureFailure(error, phase, tool = 'fixture') {
  const details = error instanceof ProcessFailure ? error.details : error;
  const code = {
    timeout: 'ETIMEDOUT',
    'output-limit': 'ENOBUFS',
    spawn: 'ENOENT',
  }[details?.category];
  const safe = processFailure(
    {
      status: details?.status,
      signal: details?.signal,
      code:
        code ??
        ([
          'ETIMEDOUT',
          'ENOBUFS',
          'ENOENT',
          'EACCES',
          'ENOEXEC',
          'EPERM',
        ].includes(details?.code)
          ? details.code
          : undefined),
    },
    {
      operation: `Native fixture ${phases.has(phase) ? phase : 'setup'}`,
      tool: tools.has(details?.tool)
        ? details.tool
        : tools.has(tool)
          ? tool
          : 'fixture',
      durationMs: details?.durationMs,
      output: 'private-capture',
    },
  );
  if (error && Object.hasOwn(error, 'providerCategory')) {
    const providerCategory = ['connection-refused', 'unclassified'].includes(
      error.providerCategory,
    )
      ? error.providerCategory
      : 'unclassified';
    safe.providerCategory = providerCategory;
    safe.message += `; providerCategory=${providerCategory}`;
  }
  return safe;
}

export function finishNativeFixture({ primary, phase, cleanups, report }) {
  const safePrimary = primary
    ? nativeFixtureFailure(primary, phase)
    : undefined;
  return cleanupAll(
    cleanups.map((cleanup) => ({
      operation: 'Native fixture cleanup',
      tool: 'fixture',
      run: async () => {
        try {
          await cleanup.run();
        } catch (error) {
          throw nativeFixtureFailure(error, cleanup.phase, cleanup.tool);
        }
      },
    })),
    { primary: safePrimary, report },
  );
}

export function assertNativeProcessStarted({ error, phase, tool, durationMs }) {
  assert.equal(
    error,
    undefined,
    nativeFixtureFailure({ code: error?.code, durationMs }, phase, tool),
  );
}

export async function waitForNativeClusterIssuer({
  kubeconfig,
  context,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
  timeoutMs = 60000,
  signal,
}) {
  const phase = 'prereq-clusterissuer-established';
  const started = globalThis.performance.now();
  const deadline = started + timeoutMs;
  const fail = (timeout = false) =>
    nativeFixtureFailure(
      {
        ...(timeout ? { code: 'ETIMEDOUT' } : {}),
        durationMs: globalThis.performance.now() - started,
      },
      phase,
      'kubectl',
    );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000 ||
    typeof kubeconfig !== 'string' ||
    !isAbsolute(kubeconfig) ||
    typeof context !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,120}$/.test(context)
  )
    throw fail();
  let backoff = 50;
  while (true) {
    const remaining = Math.floor(deadline - globalThis.performance.now());
    if (remaining <= 0) throw fail(true);
    let output;
    try {
      output = await runPrivateProcess(
        kubectl,
        [
          '--kubeconfig',
          kubeconfig,
          '--context',
          context,
          `--request-timeout=${remaining}ms`,
          'get',
          '--raw',
          '/apis/apiextensions.k8s.io/v1/customresourcedefinitions/clusterissuers.cert-manager.io',
        ],
        {
          operation: `Native fixture ${phase}`,
          tool: 'kubectl',
          timeout: remaining,
          signal,
          maxBuffer: 2 * 1024 * 1024,
          failurePolicy: 'kubectl-prerequisite',
        },
      );
    } catch (error) {
      if (globalThis.performance.now() >= deadline) throw fail(true);
      throw error;
    }
    if (globalThis.performance.now() >= deadline) throw fail(true);
    let value;
    try {
      value = JSON.parse(output);
    } catch {
      throw fail();
    }
    if (
      value?.apiVersion !== 'apiextensions.k8s.io/v1' ||
      value.kind !== 'CustomResourceDefinition' ||
      value.metadata?.name !== 'clusterissuers.cert-manager.io' ||
      value.spec?.group !== 'cert-manager.io' ||
      value.spec?.scope !== 'Cluster' ||
      value.spec?.names?.kind !== 'ClusterIssuer' ||
      value.spec?.names?.plural !== 'clusterissuers' ||
      (value.status != null &&
        (typeof value.status !== 'object' || Array.isArray(value.status)))
    )
      throw fail();
    const conditions = value.status?.conditions;
    if (
      conditions != null &&
      (!Array.isArray(conditions) ||
        conditions.some(
          (condition) =>
            !condition ||
            typeof condition.type !== 'string' ||
            !['True', 'False', 'Unknown'].includes(condition.status),
        ))
    )
      throw fail();
    const established =
      conditions?.filter((condition) => condition.type === 'Established') ?? [];
    if (established.length > 1) throw fail();
    if (globalThis.performance.now() >= deadline) throw fail(true);
    if (established[0]?.status === 'True') return;
    const wait = Math.min(
      backoff + Math.floor(Math.random() * 25),
      Math.max(0, deadline - globalThis.performance.now()),
    );
    try {
      await delay(wait, undefined, { signal });
    } catch {
      throw fail();
    }
    backoff = Math.min(backoff * 2, 250);
  }
}

export function nativeHttpsStatus({
  url,
  ca,
  token,
  signal,
  timeoutMs = 3000,
}) {
  const started = globalThis.performance.now();
  return new Promise((resolveStatus, reject) => {
    let request;
    let response;
    let settled = false;
    let timer;
    const settle = (status, timeout = false) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      response?.destroy();
      request?.destroy();
      if (
        status !== undefined &&
        globalThis.performance.now() - started >= timeoutMs
      ) {
        status = undefined;
        timeout = true;
      }
      if (status !== undefined) resolveStatus(status);
      else
        reject(
          nativeFixtureFailure(
            {
              code: timeout ? 'ETIMEDOUT' : undefined,
              durationMs: Math.round(globalThis.performance.now() - started),
            },
            'tls-health',
          ),
        );
    };
    const abort = () => settle();
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3000) {
      settle();
      return;
    }
    timer = globalThis.setTimeout(() => settle(undefined, true), timeoutMs);
    if (signal?.aborted) {
      settle();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      request = httpsGet(
        url,
        {
          ca,
          rejectUnauthorized: true,
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        },
        (incoming) => {
          response = incoming;
          // Keep guarded error listeners attached while destroying owned transports.
          response.on('error', () => settle());
          response.on('aborted', () => settle());
          response.on('close', () => {
            if (!response.complete) settle();
          });
          response.on('end', () => {
            if (response.complete) settle(response.statusCode);
            else settle();
          });
          if (settled) response.destroy();
          else response.resume();
        },
      );
      request.on('error', () => settle());
    } catch {
      settle();
    }
  });
}
