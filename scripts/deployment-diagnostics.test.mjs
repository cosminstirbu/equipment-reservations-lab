import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { verifyDeployedTelemetry } from './deployment-diagnostics.mjs';

test('private telemetry body-read failure never retains the raw transport cause', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    headers: new Map(),
    body: {
      getReader: () => ({
        read: async () => {
          throw new Error('PRIVATE_TRANSPORT_MARKER');
        },
        cancel: async () => {},
      }),
    },
  });
  try {
    await assert.rejects(
      verifyDeployedTelemetry({
        dashboardOrigin: 'https://dashboard.invalid',
        apiKey: 'PRIVATE_KEY',
        traceIds,
        privateValues: [],
        timeoutMs: 10,
      }),
      (error) => {
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE_TRANSPORT_MARKER/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

const traceIds = {
  book: '1'.repeat(32),
  cancel: '2'.repeat(32),
  invalid: '3'.repeat(32),
};
const value = (key, stringValue) => ({ key, value: { stringValue } });
function bundle(records, kind = 'spans', resource = 'reservations') {
  const isSpan = kind === 'spans';
  return {
    data: {
      [isSpan ? 'resourceSpans' : 'resourceLogs']: [
        {
          resource: { attributes: [value('service.name', resource)] },
          [isSpan ? 'scopeSpans' : 'scopeLogs']: [
            {
              scope: { name: 'fixture' },
              [isSpan ? 'spans' : 'logRecords']: records,
            },
          ],
        },
      ],
    },
    totalCount: records.length,
    returnedCount: records.length,
  };
}
function exportsFor(url) {
  if (url.pathname.endsWith('/resources'))
    return [
      'inventory',
      'reservations',
      'notifications',
      'database-bootstrap',
      'identity-bootstrap',
      'broker-bootstrap',
    ].map((name) => ({
      name,
      displayName: name,
      instanceId: null,
      hasLogs: true,
      hasTraces: true,
      hasMetrics: true,
    }));
  const traceId = url.searchParams.get('traceId');
  const resource = url.searchParams.get('resource');
  const logs = url.pathname.endsWith('/logs');
  if (resource) {
    const name = {
      'database-bootstrap': 'database.bootstrap',
      'identity-bootstrap': 'identity.bootstrap',
      'broker-bootstrap': 'broker.definitions.prepare',
    }[resource];
    const spans = [
      {
        traceId: '4'.repeat(32),
        spanId: '4'.repeat(16),
        name,
        attributes: [],
        status: { code: 1 },
      },
    ];
    if (resource === 'identity-bootstrap')
      spans.push({
        traceId: '4'.repeat(32),
        spanId: '5'.repeat(16),
        parentSpanId: '4'.repeat(16),
        name: 'GET',
        attributes: [value('http.request.method', 'GET')],
        status: { code: 1 },
      });
    return bundle(
      logs
        ? [
            {
              traceId: '4'.repeat(32),
              spanId: '4'.repeat(16),
              body: { stringValue: 'Bootstrap completed' },
              attributes: [],
            },
          ]
        : spans,
      logs ? 'logs' : 'spans',
      resource,
    );
  }
  const invalid = traceId === traceIds.invalid;
  const workflow = {
    traceId,
    spanId: '1'.repeat(16),
    name: invalid
      ? 'reservation.get'
      : traceId === traceIds.book
        ? 'reservation.book'
        : 'reservation.cancel',
    attributes: [],
    status: {
      code: invalid ? 2 : 0,
      message: invalid ? 'invalid_request' : '',
    },
  };
  const spans = [workflow];
  if (!invalid) {
    spans.push({
      traceId,
      spanId: '2'.repeat(16),
      parentSpanId: workflow.spanId,
      name: 'postgresql.query',
      attributes: [value('db.system.name', 'postgresql')],
      status: { code: 1 },
    });
    spans.push({
      traceId,
      spanId: '3'.repeat(16),
      parentSpanId: workflow.spanId,
      name: 'reservation.publish',
      attributes: [],
      status: { code: 1 },
    });
    spans.push({
      traceId,
      spanId: '4'.repeat(16),
      parentSpanId: workflow.spanId,
      name: 'reservation.consume',
      attributes: [],
      status: { code: 1 },
    });
  }
  return bundle(
    logs
      ? [
          {
            traceId,
            spanId: workflow.spanId,
            body: {
              stringValue: invalid
                ? 'Reservation get rejected invalid_request'
                : `Reservation ${traceId === traceIds.book ? 'book' : 'cancel'} completed (${traceId === traceIds.book ? 'created' : 'cancelled'})`,
            },
            attributes: [],
          },
        ]
      : spans,
    logs ? 'logs' : 'spans',
  );
}

async function fixture(t, mutate = (body) => body) {
  const server = createServer((request, response) => {
    assert.equal(request.headers['x-api-key'], 'private-api');
    const url = new URL(request.url, 'http://fixture');
    if (!url.pathname.endsWith('/resources'))
      assert.equal(url.searchParams.get('limit'), '500');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(mutate(exportsFor(url), url)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    dashboardOrigin: `http://127.0.0.1:${server.address().port}`,
    apiKey: 'private-api',
    traceIds,
    privateValues: ['private-api', 'private-password'],
    timeoutMs: 1000,
    intervalMs: 5,
  };
}

test('deployed telemetry requires actual workflow SQL messaging logs bootstrap and metric presence', async (t) => {
  const configuration = await fixture(t);
  await verifyDeployedTelemetry(configuration);
});

function removeSpans(body, predicate) {
  if (!body.data?.resourceSpans) return body;
  let count = 0;
  for (const resource of body.data.resourceSpans)
    for (const scope of resource.scopeSpans) {
      scope.spans = scope.spans.filter((span) => !predicate(span));
      count += scope.spans.length;
    }
  body.returnedCount = count;
  body.totalCount = count;
  return body;
}

test('missing dependency, stale trace, incorrect parent, missing logs and metric absence cannot pass', async (t) => {
  const mutations = [
    (body) => removeSpans(body, (span) => span.name === 'postgresql.query'),
    (body) => removeSpans(body, (span) => span.name === 'reservation.publish'),
    (body) => removeSpans(body, (span) => span.name === 'reservation.book'),
    (body) => removeSpans(body, (span) => span.name === 'identity.bootstrap'),
    (body) => removeSpans(body, (span) => span.name === 'GET'),
    (body) => {
      for (const resource of body.data?.resourceSpans ?? [])
        for (const scope of resource.scopeSpans)
          for (const span of scope.spans)
            if (span.name === 'reservation.get') span.status = { code: 0 };
      return body;
    },
    (body) => {
      for (const resource of body.data?.resourceSpans ?? [])
        for (const scope of resource.scopeSpans)
          for (const span of scope.spans) span.traceId = '9'.repeat(32);
      return body;
    },
    (body) => {
      for (const resource of body.data?.resourceSpans ?? [])
        for (const scope of resource.scopeSpans)
          for (const span of scope.spans)
            if (span.name === 'reservation.consume')
              span.parentSpanId = '9'.repeat(16);
      return body;
    },
    (body) => (body.data?.resourceLogs ? bundle([], 'logs') : body),
    (body) =>
      Array.isArray(body)
        ? body.map((entry) => ({ ...entry, hasMetrics: false }))
        : body,
  ];
  for (const mutate of mutations) {
    const configuration = await fixture(t, mutate);
    await assert.rejects(
      verifyDeployedTelemetry({ ...configuration, timeoutMs: 250 }),
      /telemetry|trace|count|correlat/i,
    );
  }
});

test('private values, JWTs, unsafe attributes and oversized or truncated payloads fail safely', async (t) => {
  const mutations = [
    (body) => {
      body.leak = 'private-password';
      return body;
    },
    (body) => {
      body.leak = 'HTTP https://identity.test/authorize?code=fixture-code';
      return body;
    },
    (body) => {
      body.leak = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature';
      return body;
    },
    (body) => {
      body.attributes = [
        value('url.full', 'https://identity.test/?code=hidden'),
      ];
      return body;
    },
    (body) =>
      Array.isArray(body)
        ? body
        : { ...body, returnedCount: 501, totalCount: 501 },
    (body) => (Array.isArray(body) ? body : { ...body, totalCount: 9999 }),
    (body) => {
      body.padding = 'x'.repeat(2 * 1024 * 1024);
      return body;
    },
  ];
  for (const mutate of mutations) {
    const configuration = await fixture(t, mutate);
    await assert.rejects(
      verifyDeployedTelemetry(configuration),
      /privacy|bound|count|truncat|payload/i,
    );
  }
});

test('stalled telemetry response body cannot exceed the total observation budget', async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.write('{"data":');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  await assert.rejects(
    verifyDeployedTelemetry({
      dashboardOrigin: `http://127.0.0.1:${server.address().port}`,
      apiKey: 'private-api',
      traceIds,
      timeoutMs: 40,
      intervalMs: 5,
    }),
    /Telemetry API body.*bound/i,
  );
});

test('bootstrap resource logs may include uncorrelated lifecycle records alongside correlated workflow records', async (t) => {
  const configuration = await fixture(t, (body, url) => {
    if (url.searchParams.has('resource') && body.data?.resourceLogs) {
      body.data.resourceLogs[0].scopeLogs[0].logRecords.push(
        { body: { stringValue: 'Host starting' }, attributes: [] },
        {
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          body: { stringValue: 'Host stopping' },
          attributes: [],
        },
      );
      body.totalCount += 2;
      body.returnedCount += 2;
    }
    return body;
  });
  await verifyDeployedTelemetry(configuration);
});
