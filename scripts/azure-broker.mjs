import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { ProcessFailure, cleanupAll } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
const failure = ({
  phase = 'drain',
  tool = 'broker-monitor',
  category = 'invalid-observation',
  status,
  signal,
  started = Date.now(),
} = {}) =>
  new ProcessFailure({
    operation: `Messaging drain ${phase}`,
    tool,
    category,
    status:
      Number.isInteger(status) && status >= 0 && status <= 599
        ? status
        : undefined,
    signal:
      typeof signal === 'string' && /^SIG[A-Z]{1,12}$/.test(signal)
        ? signal
        : undefined,
    durationMs: Math.max(0, Date.now() - started),
  });
const path = '/api/queues/equipment/reservation-notifications';
function bounded(promise, signal, context = {}) {
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () =>
      reject(
        signal.reason instanceof ProcessFailure
          ? signal.reason
          : failure({
              ...context,
              category:
                signal.reason?.name === 'TimeoutError'
                  ? 'timeout'
                  : 'cancelled',
            }),
      );
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([promise, cancelled]).finally(() =>
    signal.removeEventListener('abort', abort),
  );
}
export async function withBrokerMonitorForward(
  settings,
  action,
  { spawnProcess = spawn, report } = {},
) {
  const started = Date.now();
  const timeoutMs = settings.timeoutMs ?? 300000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000 ||
    typeof action !== 'function' ||
    settings.signal?.aborted
  )
    throw failure();
  let executable;
  try {
    assertPrivatePath(resolve(settings.kubeconfig), 0o600);
    executable = verifiedTool(qualityContext(), 'kubectl');
    if (settings.kubectl && resolve(settings.kubectl) !== resolve(executable))
      throw failure();
  } catch {
    throw failure();
  }
  const controller = new globalThis.AbortController();
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0) throw failure();
  const timeout = globalThis.AbortSignal.timeout(remaining);
  const cancel = (reason) =>
    controller.abort(
      reason instanceof ProcessFailure
        ? reason
        : failure({
            phase: 'forward',
            tool: 'kubectl',
            category: timeout.aborted ? 'timeout' : 'cancelled',
            started,
          }),
    );
  settings.signal?.addEventListener('abort', cancel, { once: true });
  timeout.addEventListener('abort', cancel, { once: true });
  let child,
    ended = false,
    stopping = false,
    settle,
    readyReject;
  let total = 0,
    pending = '';
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  const ready = new Promise((resolve, reject) => {
    readyReject = reject;
    try {
      child = spawnProcess(
        executable,
        [
          '--kubeconfig',
          settings.kubeconfig,
          '--namespace',
          'equipment-recovery',
          'port-forward',
          'pod/equipment-broker-monitor',
          '--address',
          '127.0.0.1',
          '0:8080',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false },
      );
      const collect = (chunk, stdout) => {
        total += chunk.length;
        if (total > 65536) {
          const exhausted = failure({
            phase: 'forward',
            tool: 'kubectl',
            category: 'output-limit',
            started,
          });
          readyReject(exhausted);
          cancel(exhausted);
          return;
        }
        if (!stdout) return;
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) {
          const match = /^Forwarding from 127\.0\.0\.1:(\d{1,5}) -> 8080$/.exec(
            line,
          );
          if (match) {
            const port = Number(match[1]);
            if (port < 1 || port > 65535) {
              cancel();
              return;
            }
            resolve(`http://127.0.0.1:${port}`);
          }
        }
      };
      child.stdout.on('data', (chunk) => collect(chunk, true));
      child.stderr.on('data', (chunk) => collect(chunk, false));
      child.on('error', () => {
        readyReject(
          failure({
            phase: 'forward',
            tool: 'kubectl',
            category: 'spawn',
            started,
          }),
        );
        cancel(
          failure({
            phase: 'forward',
            tool: 'kubectl',
            category: 'spawn',
            started,
          }),
        );
      });
      child.on('close', (status, signal) => {
        ended = true;
        settle();
        if (!stopping) {
          readyReject(
            failure({
              phase: 'forward',
              tool: 'kubectl',
              category: 'exit',
              status,
              signal,
              started,
            }),
          );
          cancel(
            failure({
              phase: 'forward',
              tool: 'kubectl',
              category: 'exit',
              status,
              signal,
              started,
            }),
          );
        }
      });
    } catch {
      ended = true;
      settle();
      reject(
        failure({
          phase: 'forward',
          tool: 'kubectl',
          category: 'spawn',
          started,
        }),
      );
    }
  });
  const terminate = () => {
    readyReject?.(
      controller.signal.reason instanceof ProcessFailure
        ? controller.signal.reason
        : failure({
            phase: 'forward',
            tool: 'kubectl',
            category: 'cancelled',
            started,
          }),
    );
    try {
      child?.kill('SIGTERM');
    } catch {
      // Owned cleanup below verifies exit and reports a termination failure.
    }
  };
  controller.signal.addEventListener('abort', terminate, { once: true });
  let primary, result;
  const close = async () => {
    stopping = true;
    if (!ended) {
      try {
        child?.kill('SIGTERM');
      } catch {
        throw failure({
          phase: 'cleanup',
          tool: 'kubectl',
          category: 'cleanup',
          started,
        });
      }
      await Promise.race([done, delay(2000)]);
      if (!ended) {
        try {
          child?.kill('SIGKILL');
        } catch {
          throw failure({
            phase: 'cleanup',
            tool: 'kubectl',
            category: 'cleanup',
            started,
          });
        }
        await Promise.race([done, delay(2000)]);
        if (!ended)
          throw failure({
            phase: 'cleanup',
            tool: 'kubectl',
            category: 'timeout',
            started,
          });
      }
    }
  };
  try {
    const origin = await bounded(
      ready,
      globalThis.AbortSignal.any([
        controller.signal,
        globalThis.AbortSignal.timeout(Math.min(30000, remaining)),
      ]),
      { phase: 'forward', tool: 'kubectl', started },
    );
    result = await bounded(
      action({ origin, signal: controller.signal }),
      controller.signal,
    );
    controller.signal.throwIfAborted();
  } catch (error) {
    primary =
      error instanceof ProcessFailure
        ? error
        : failure({
            phase: 'drain',
            category: timeout.aborted
              ? 'timeout'
              : settings.signal?.aborted
                ? 'cancelled'
                : 'transport',
            started,
          });
  } finally {
    settings.signal?.removeEventListener('abort', cancel);
    timeout.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', terminate);
    await cleanupAll(
      [{ operation: 'owned broker monitor forward cleanup', run: close }],
      { primary, report },
    );
  }
  return result;
}
async function queueSnapshot(origin, password, signal) {
  const started = Date.now();
  const localTimeout = globalThis.AbortSignal.timeout(10000);
  const requestSignal = globalThis.AbortSignal.any([signal, localTimeout]);
  let response;
  try {
    response = await queueRequest(origin, password, requestSignal);
  } catch {
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: localTimeout.aborted
        ? 'timeout'
        : signal.aborted
          ? 'cancelled'
          : 'transport',
      started,
    });
  }
  if (!response.ok || response.redirected)
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: 'http-status',
      status: response.status,
      started,
    });
  try {
    return await parseQueue(response, started);
  } catch (error) {
    if (error instanceof ProcessFailure) throw error;
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: localTimeout.aborted
        ? 'timeout'
        : signal.aborted
          ? 'cancelled'
          : 'transport',
      started,
    });
  }
}
async function queueRequest(origin, password, signal) {
  const response = await globalThis.fetch(origin + path, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`equipment_backup_monitor:${password}`).toString('base64')}`,
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  return response;
}
async function parseQueue(response, started) {
  const observedAt = Date.parse(response.headers.get('date'));
  const age = response.headers.get('age');
  if (
    !Number.isFinite(observedAt) ||
    Date.now() - observedAt > 30000 ||
    observedAt - Date.now() > 5000 ||
    (age !== null && (!/^\d+$/.test(age) || Number(age) !== 0)) ||
    /\b11[01]\b/.test(response.headers.get('warning') ?? '')
  )
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: 'invalid-observation',
      started,
    });
  let bytes = 0,
    text = '';
  const decoder = new globalThis.TextDecoder();
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 65536)
      throw failure({
        phase: 'queue observation',
        tool: 'http',
        category: 'invalid-observation',
        started,
      });
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: 'invalid-observation',
      started,
    });
  }
  if (
    value.name !== 'reservation-notifications' ||
    value.vhost !== 'equipment' ||
    value.state !== 'running' ||
    value.type !== 'classic' ||
    ['messages_ready', 'messages_unacknowledged', 'messages'].some(
      (key) => !Number.isSafeInteger(value[key]) || value[key] < 0,
    ) ||
    value.messages !== value.messages_ready + value.messages_unacknowledged
  )
    throw failure({
      phase: 'queue observation',
      tool: 'http',
      category: 'invalid-observation',
      started,
    });
  return { ...value, observedAt };
}
async function observeOutbox(database, signal) {
  const started = Date.now();
  try {
    return await database.outboxCount({ signal });
  } catch (error) {
    if (error instanceof ProcessFailure) throw error;
    throw failure({
      phase: 'outbox observation',
      tool: 'postgres',
      category: signal.aborted ? 'cancelled' : 'transport',
      started,
    });
  }
}
export async function drainRecoveryMessaging(settings, dependencies = {}) {
  if (
    typeof settings.brokerMonitorPassword !== 'string' ||
    settings.brokerMonitorPassword.length < 32 ||
    settings.brokerMonitorPassword.length > 256 ||
    /[\r\n\0]/.test(settings.brokerMonitorPassword) ||
    typeof settings.database?.outboxCount !== 'function' ||
    settings.signal?.aborted
  )
    throw failure();
  return withBrokerMonitorForward(
    settings,
    async ({ origin, signal }) => {
      for (;;) {
        signal.throwIfAborted();
        const started = Date.now();
        // Web ingress is already quiesced by the caller. The application commits
        // published_at only after confirmed publish, so sample current queue totals
        // after the fresh outbox read instead of pairing concurrent observations.
        const outbox = await bounded(
          observeOutbox(settings.database, signal),
          signal,
        );
        const queue = await bounded(
          queueSnapshot(origin, settings.brokerMonitorPassword, signal),
          signal,
        );
        const now = Date.now(),
          observed = Date.parse(outbox?.observedAt);
        if (
          !Number.isSafeInteger(outbox?.count) ||
          outbox.count < 0 ||
          typeof outbox.observedAt !== 'string' ||
          !/Z$/.test(outbox.observedAt) ||
          !Number.isFinite(observed) ||
          [observed, queue.observedAt].some(
            (value) => now - value > 30000 || value - now > 5000,
          )
        )
          throw failure({
            phase: 'outbox observation',
            tool: 'postgres',
            category: 'invalid-observation',
            started,
          });
        if (
          outbox.count === 0 &&
          queue.messages_ready === 0 &&
          queue.messages_unacknowledged === 0
        )
          return {
            outcome: 'drained',
            observedAt: new Date(now).toISOString(),
          };
        await delay(1000, undefined, { signal });
      }
    },
    dependencies,
  );
}
