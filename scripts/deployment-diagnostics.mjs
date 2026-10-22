import { setTimeout as delay } from 'node:timers/promises';
import { TextDecoder } from 'node:util';
import { OperationalFailure } from './process.mjs';

const maximumBody = 2 * 1024 * 1024;
const requiredResources = [
  'inventory',
  'reservations',
  'notifications',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const bootstrapNames = {
  'database-bootstrap': 'database.bootstrap',
  'identity-bootstrap': 'identity.bootstrap',
  'broker-bootstrap': 'broker.definitions.prepare',
};
const forbiddenAttribute =
  /^(?:url\.(?:full|query)|http\.(?:url|target)|(?:http\.)?request\.body|http\.request\.header\.(?:authorization|cookie)|db\.(?:connection_string|query\.parameter(?:\..*)?|sql\.parameter(?:\..*)?)|(?:enduser|user)\.(?:email|name)|authorization|password|(?:access|refresh)_token|client_secret)$/i;

function privacy(value, privateValues) {
  if (typeof value === 'string') {
    if (
      privateValues.some(
        (secret) => secret.length > 0 && value.includes(secret),
      ) ||
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value) ||
      /https?:\/\/[^\s"'<>]*\?/i.test(value)
    )
      throw new OperationalFailure(
        'Telemetry privacy rule rejected private material.',
      );
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.key === 'string') {
    if (forbiddenAttribute.test(value.key))
      throw new OperationalFailure(
        'Telemetry privacy rule rejected a forbidden attribute.',
      );
    if (
      value.key === 'exception.message' &&
      value.value?.stringValue !== 'Database operation failed'
    )
      throw new OperationalFailure(
        'Telemetry privacy rule rejected an unsafe exception message.',
      );
    if (
      value.key === 'exception.stacktrace' &&
      value.value?.stringValue !== '[redacted]'
    )
      throw new OperationalFailure(
        'Telemetry privacy rule rejected an unsafe exception stack.',
      );
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenAttribute.test(key))
      throw new OperationalFailure(
        'Telemetry privacy rule rejected a forbidden field.',
      );
    privacy(child, privateValues);
  }
}

async function boundedJson(url, apiKey, deadline, privateValues) {
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    throw new OperationalFailure('Telemetry observation deadline expired.');
  let response;
  try {
    response = await globalThis.fetch(url, {
      headers: { 'x-api-key': apiKey },
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(Math.min(5000, remaining)),
    });
  } catch {
    throw new OperationalFailure(
      'Telemetry API request failed or exceeded its bounded deadline.',
    );
  }
  if (response.status !== 200)
    throw new OperationalFailure(
      `Telemetry API access failed (HTTP ${response.status}).`,
    );
  if (Number(response.headers.get('content-length')) > maximumBody)
    throw new OperationalFailure(
      'Telemetry payload exceeds the response body bound.',
    );
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBody)
        throw new OperationalFailure(
          'Telemetry payload exceeds the response body bound.',
        );
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    throw new OperationalFailure(
      'Telemetry API body read failed or exceeded its bounded deadline.',
    );
  } finally {
    // Cancellation can reject again after the observation signal already aborted the stream.
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OperationalFailure('Telemetry API payload is not valid JSON.');
  }
  privacy(data, privateValues);
  return data;
}

function records(payload, kind) {
  if (
    !Number.isSafeInteger(payload?.totalCount) ||
    !Number.isSafeInteger(payload?.returnedCount) ||
    payload.returnedCount < 0 ||
    payload.returnedCount > 500 ||
    payload.totalCount !== payload.returnedCount
  )
    throw new OperationalFailure(
      'Telemetry response counts are invalid or truncated. Obtain a safe fresh capture.',
    );
  const resourceKey = kind === 'spans' ? 'resourceSpans' : 'resourceLogs';
  const scopeKey = kind === 'spans' ? 'scopeSpans' : 'scopeLogs';
  const itemKey = kind === 'spans' ? 'spans' : 'logRecords';
  const resources = payload.data?.[resourceKey];
  if (!Array.isArray(resources))
    throw new OperationalFailure(
      'Telemetry payload resource collection is invalid.',
    );
  const result = [];
  for (const resource of resources) {
    if (!Array.isArray(resource[scopeKey]))
      throw new OperationalFailure(
        'Telemetry payload scope collection is invalid.',
      );
    for (const scope of resource[scopeKey]) {
      if (!Array.isArray(scope[itemKey]))
        throw new OperationalFailure(
          'Telemetry payload record collection is invalid.',
        );
      for (const record of scope[itemKey]) {
        const validIds =
          /^[a-f0-9]{32}$/.test(record.traceId ?? '') &&
          !/^0+$/.test(record.traceId) &&
          /^[a-f0-9]{16}$/.test(record.spanId ?? '') &&
          !/^0+$/.test(record.spanId);
        const uncorrelated = [record.traceId, record.spanId].every(
          (id) =>
            id === undefined || id === null || id === '' || /^0+$/.test(id),
        );
        if (!validIds && !(kind === 'logs' && uncorrelated))
          throw new OperationalFailure(
            'Telemetry trace/span identifiers are invalid.',
          );
        result.push({
          ...record,
          resource: resource.resource,
          scope: scope.scope,
        });
      }
    }
  }
  if (result.length !== payload.returnedCount)
    throw new OperationalFailure(
      'Telemetry response record count is inconsistent.',
    );
  if (
    kind === 'spans' &&
    new Set(result.map((record) => `${record.traceId}:${record.spanId}`))
      .size !== result.length
  )
    throw new OperationalFailure(
      'Telemetry trace/span identifiers are duplicated.',
    );
  return result;
}
function attribute(record, key) {
  return record.attributes?.find((entry) => entry.key === key)?.value
    ?.stringValue;
}
function descendant(record, ancestor, spans) {
  let current = record;
  const visited = new Set();
  while (current && !visited.has(current.spanId)) {
    if (current.spanId === ancestor.spanId) return true;
    visited.add(current.spanId);
    current = spans.find(
      (span) =>
        span.traceId === record.traceId && span.spanId === current.parentSpanId,
    );
  }
  return false;
}
function requireObservation(condition, message) {
  if (!condition)
    throw new OperationalFailure(
      `Telemetry observation incomplete: ${message}`,
    );
}

export async function verifyDeployedTelemetry({
  dashboardOrigin,
  apiKey,
  traceIds,
  privateValues = [],
  timeoutMs = 60000,
  intervalMs = 250,
}) {
  if (
    !apiKey ||
    !traceIds ||
    ['book', 'cancel', 'invalid'].some(
      (kind) => !/^[a-f0-9]{32}$/.test(traceIds[kind] ?? ''),
    ) ||
    new Set(Object.values(traceIds)).size !== 3
  )
    throw new OperationalFailure(
      'Telemetry verification requires three fresh distinct workflow trace IDs and private API authentication.',
    );
  if (timeoutMs <= 0 || timeoutMs > 60000 || intervalMs < 0)
    throw new OperationalFailure('Telemetry observation budget is invalid.');
  const deadline = Date.now() + timeoutMs;
  const known = privateValues.filter((value) => typeof value === 'string');
  const get = async (kind, filter) => {
    const url = new URL(`/api/telemetry/${kind}`, dashboardOrigin);
    url.searchParams.set('limit', '500');
    for (const [key, value] of Object.entries(filter))
      url.searchParams.set(key, value);
    return records(await boundedJson(url, apiKey, deadline, known), kind);
  };
  while (true) {
    try {
      const resources = await boundedJson(
        new URL('/api/telemetry/resources', dashboardOrigin),
        apiKey,
        deadline,
        known,
      );
      if (
        !Array.isArray(resources) ||
        resources.length > 500 ||
        resources.some(
          (entry) =>
            typeof entry.name !== 'string' ||
            !entry.name ||
            typeof entry.hasMetrics !== 'boolean' ||
            typeof entry.hasLogs !== 'boolean' ||
            typeof entry.hasTraces !== 'boolean',
        )
      )
        throw new OperationalFailure('Telemetry resource payload is invalid.');
      for (const name of requiredResources)
        requireObservation(
          resources.some(
            (entry) =>
              entry.name === name &&
              entry.hasMetrics &&
              entry.hasLogs &&
              entry.hasTraces,
          ),
          `${name} traces/logs/metric-presence missing`,
        );
      for (const kind of ['book', 'cancel', 'invalid']) {
        const traceId = traceIds[kind];
        const spans = await get('spans', { traceId });
        const logs = await get('logs', { traceId });
        requireObservation(
          spans.length > 0 &&
            spans.every((span) => span.traceId === traceId) &&
            logs.every(
              (log) =>
                !log.traceId ||
                /^0+$/.test(log.traceId) ||
                log.traceId === traceId,
            ),
          'fresh trace selection is empty or stale',
        );
        const name =
          kind === 'invalid' ? 'reservation.get' : `reservation.${kind}`;
        const workflow = spans.find((span) => span.name === name);
        requireObservation(workflow, `${name} workflow missing`);
        requireObservation(
          logs.some((log) => log.spanId === workflow.spanId),
          'workflow structured log correlation missing',
        );
        if (kind === 'invalid') {
          requireObservation(
            workflow.status?.code === 2 &&
              workflow.status.message === 'invalid_request',
            'controlled failure Error status missing',
          );
          requireObservation(
            logs.some(
              (log) =>
                log.spanId === workflow.spanId &&
                JSON.stringify(log).includes('invalid_request'),
            ),
            'controlled failure outcome log missing',
          );
        } else {
          requireObservation(
            [0, 1].includes(workflow.status?.code ?? 0),
            'successful workflow status missing',
          );
          const outcome = kind === 'book' ? 'created' : 'cancelled';
          requireObservation(
            logs.some(
              (log) =>
                log.spanId === workflow.spanId &&
                log.body?.stringValue ===
                  `Reservation ${kind} completed (${outcome})`,
            ),
            'successful workflow completed outcome log missing',
          );
          requireObservation(
            spans.some(
              (span) =>
                attribute(span, 'db.system.name') === 'postgresql' &&
                descendant(span, workflow, spans),
            ),
            'correlated PostgreSQL dependency missing',
          );
          for (const operation of [
            'reservation.publish',
            'reservation.consume',
          ])
            requireObservation(
              spans.some(
                (span) =>
                  span.name === operation &&
                  span.spanId !== workflow.spanId &&
                  descendant(span, workflow, spans),
              ),
              `${operation} trace propagation missing`,
            );
        }
      }
      for (const [resource, name] of Object.entries(bootstrapNames)) {
        const spans = await get('spans', { resource });
        const logs = await get('logs', { resource });
        const workflow = spans.find(
          (span) =>
            span.name === name &&
            span.status?.code === 1 &&
            attribute(span.resource ?? {}, 'service.name') === resource,
        );
        requireObservation(
          workflow,
          `${resource} retained startup workflow missing; obtain a safe fresh bootstrap capture`,
        );
        requireObservation(
          logs.some(
            (log) =>
              log.traceId === workflow.traceId &&
              log.spanId === workflow.spanId,
          ),
          `${resource} startup log correlation missing`,
        );
        if (resource === 'identity-bootstrap')
          requireObservation(
            spans.some(
              (span) =>
                attribute(span, 'http.request.method') &&
                descendant(span, workflow, spans),
            ),
            'identity administration HTTP export missing',
          );
      }
      return {
        workflowTraces: 3,
        bootstrapWorkflows: 3,
        metricEvidence: 'resource-presence-only',
      };
    } catch (error) {
      if (!error.message.startsWith('Telemetry observation incomplete:'))
        throw error;
      if (Date.now() + intervalMs >= deadline)
        throw new OperationalFailure(
          'Telemetry observation deadline expired; required fresh workflow/dependency/bootstrap exports are incomplete.',
          { cause: error },
        );
      await delay(intervalMs);
    }
  }
}
