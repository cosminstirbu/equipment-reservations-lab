import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { URLSearchParams } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import {
  assertPrivatePath,
  createPrivateDirectory,
} from './local-platform.mjs';
import {
  verifyDeploymentSurface,
  observeNotifications,
  verifyDiagnosticAuthentication,
} from './deployment-smoke.mjs';

test('smoke CLI reports safe prerequisite phase without echoing private paths', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/deployment-smoke.mjs', '--state', 'missing-PRIVATE_STATE_MARKER'],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prerequisites.*failed/i);
  assert.doesNotMatch(
    result.stderr + result.stdout,
    /PRIVATE_STATE_MARKER|ENOENT|node:fs/,
  );
});

test('HTTP transport failures expose a safe phase without raw transport causes', async () => {
  await assert.rejects(
    verifyDeploymentSurface({
      applicationOrigin: 'http://127.0.0.1:1/?PRIVATE_URL_MARKER',
      authority: 'http://127.0.0.1:1',
    }),
    (error) => {
      assert.match(error.message, /HTTP.*transport|HTTP.*timeout/i);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(
        JSON.stringify(error) + error.message,
        /PRIVATE_URL_MARKER|fetch failed/,
      );
      return true;
    },
  );
});

async function provider(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('malformed private HTTP JSON retains only the safe payload category', async (t) => {
  const origin = await provider(t, (request, response) => {
    if (request.url.endsWith('/openapi/v1.json')) {
      response.setHeader('content-type', 'application/json');
      response.end('{"PRIVATE_HTTP_JSON_MARKER":');
    } else response.end('<html>Application</html>');
  });
  await assert.rejects(
    verifyDeploymentSurface({
      applicationOrigin: origin,
      authority: `${origin}/realms/equipment`,
    }),
    (error) => {
      assert.match(error.message, /Smoke HTTP response payload is invalid/);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(
        error.message + JSON.stringify(error) + inspect(error, { depth: 10 }),
        /PRIVATE_|Unexpected token|JSON at position/,
      );
      return true;
    },
  );
});

test('deployed surface checks actual HTTP documents and rejects exposed administration', async (t) => {
  let exposed = false;
  let assetsMissing = false;
  const origin = await provider(t, (request, response) => {
    if (request.url.endsWith('/openapi/v1.json')) {
      const service = request.url.split('/')[2];
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          openapi: '3.1.0',
          servers: [{ url: `/services/${service}` }],
          paths: { '/api/example': {} },
        }),
      );
    } else if (
      /\/scalar\/(?:scalar\.js|scalar\.aspnetcore\.js|favicon\.svg)$/.test(
        request.url,
      )
    ) {
      response.statusCode = assetsMissing ? 404 : 200;
      response.end('asset');
    } else if (request.url.includes('/scalar/v1'))
      response.end('<html>Scalar</html>');
    else if (request.url === '/') response.end('<html>Application</html>');
    else {
      response.statusCode = exposed ? 200 : 404;
      response.end();
    }
  });
  await verifyDeploymentSurface({
    applicationOrigin: origin,
    authority: `${origin}/realms/equipment`,
  });
  assetsMissing = true;
  await assert.rejects(
    verifyDeploymentSurface({
      applicationOrigin: origin,
      authority: `${origin}/realms/equipment`,
    }),
    /asset/i,
  );
  assetsMissing = false;
  exposed = true;
  await assert.rejects(
    verifyDeploymentSurface({
      applicationOrigin: origin,
      authority: `${origin}/realms/equipment`,
    }),
    /operational|administration/i,
  );
});

test('notification observation requires exactly one effect and has a finite deadline', async (t) => {
  let entries = [];
  const origin = await provider(t, (_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(entries));
  });
  await assert.rejects(
    observeNotifications({
      applicationOrigin: origin,
      token: 'private',
      reservationId: 'r1',
      expectedTypes: ['ReservationConfirmed'],
      timeoutMs: 30,
      intervalMs: 5,
    }),
    /notification/i,
  );
  entries = [
    { reservationId: 'r1', eventType: 'ReservationConfirmed' },
    { reservationId: 'r1', eventType: 'ReservationConfirmed' },
  ];
  await assert.rejects(
    observeNotifications({
      applicationOrigin: origin,
      token: 'private',
      reservationId: 'r1',
      expectedTypes: ['ReservationConfirmed'],
      timeoutMs: 30,
      intervalMs: 5,
    }),
    /duplicate/i,
  );
  entries.pop();
  await observeNotifications({
    applicationOrigin: origin,
    token: 'private',
    reservationId: 'r1',
    expectedTypes: ['ReservationConfirmed'],
    timeoutMs: 30,
    intervalMs: 5,
  });
});

test('diagnostic probes fail if anonymous ingestion or browser access is admitted', async (t) => {
  let admitted = false;
  const origin = await provider(t, (_request, response) => {
    response.statusCode = admitted ? 200 : 401;
    response.end();
  });
  await verifyDiagnosticAuthentication({
    dashboardOrigin: origin,
    otlpOrigin: origin,
  });
  admitted = true;
  await assert.rejects(
    verifyDiagnosticAuthentication({
      dashboardOrigin: origin,
      otlpOrigin: origin,
    }),
    /unauthenticated/i,
  );
});

test('dashboard navigation is followed to a safe login, never mistaken for authentication denial', async (t) => {
  let target = '/login';
  let admitted = false;
  const origin = await provider(t, (request, response) => {
    if (request.url === '/') {
      response.writeHead(302, { location: '/structuredlogs' });
    } else if (request.url === '/structuredlogs') {
      response.writeHead(admitted ? 200 : 302, { location: target });
    } else response.statusCode = 401;
    response.end();
  });
  const configuration = { dashboardOrigin: origin, otlpOrigin: origin };
  await verifyDiagnosticAuthentication(configuration);
  admitted = true;
  await assert.rejects(
    verifyDiagnosticAuthentication(configuration),
    /admitted/i,
  );
  admitted = false;
  for (target of [
    'https://elsewhere.test/login',
    '/login?token=PRIVATE_MARKER',
    '/',
    '/login?returnUrl=%2F%3Ftoken%3DPRIVATE_MARKER',
  ]) {
    await assert.rejects(
      verifyDiagnosticAuthentication(configuration),
      (error) => {
        assert.match(error.message, /unsafe|redirect/i);
        assert.doesNotMatch(error.message, /PRIVATE_MARKER/);
        return true;
      },
    );
  }
});

test('code login retains PKCE, exact callback/state and never uses password grant', async (t) => {
  const { authenticateCodeFlow } = await import('./deployment-smoke.mjs');
  let challenge;
  let state;
  let callback;
  const authority = await provider(t, async (request, response) => {
    const url = new URL(request.url, 'http://provider');
    if (url.pathname.endsWith('/auth')) {
      challenge = url.searchParams.get('code_challenge');
      state = url.searchParams.get('state');
      callback = url.searchParams.get('redirect_uri');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      response.setHeader('set-cookie', 'session=example; HttpOnly');
      response.end(
        '<form id="kc-form-login" action="/login"><input name="username"><input name="password"></form>',
      );
    } else if (url.pathname === '/login') {
      assert.match(request.headers.cookie, /session=example/);
      response.statusCode = 302;
      response.setHeader('location', `${callback}?code=example&state=${state}`);
      response.end();
    } else if (url.pathname.endsWith('/token')) {
      let body = '';
      for await (const part of request) body += part;
      const values = new URLSearchParams(body);
      assert.equal(values.get('grant_type'), 'authorization_code');
      const { createHash } = await import('node:crypto');
      assert.equal(
        createHash('sha256')
          .update(values.get('code_verifier'))
          .digest('base64url'),
        challenge,
      );
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ access_token: 'private-token' }));
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  assert.equal(
    await authenticateCodeFlow({
      authority,
      applicationOrigin: 'https://app.equipment.test',
      username: 'employee-a',
      password: 'private',
    }),
    'private-token',
  );
});

test('diagnostic checks prove supplied API and OTLP credentials are usable', async (t) => {
  let credentialsWork = false;
  const origin = await provider(t, (request, response) => {
    const authenticated =
      request.url === '/api/telemetry/traces'
        ? request.headers['x-api-key'] === 'private-api'
        : request.url === '/v1/traces' &&
          request.headers['x-otlp-api-key'] === 'private-otlp';
    response.statusCode = credentialsWork && authenticated ? 200 : 401;
    response.end();
  });
  const configuration = {
    dashboardOrigin: origin,
    otlpOrigin: origin,
    dashboardApiKey: 'private-api',
    dashboardOtlpKey: 'private-otlp',
  };
  await assert.rejects(
    verifyDiagnosticAuthentication(configuration),
    /authenticated/i,
  );
  credentialsWork = true;
  await verifyDiagnosticAuthentication(configuration);
});

test('persistence probe preserves reservation ownership and exact notification effects', async (t) => {
  const { capturePersistenceCheckpoint, verifyPersistenceCheckpoint } =
    await import('./deployment-smoke.mjs');
  const reservation = {
    id: 'r1',
    userKey: 'subject-original',
    status: 'Cancelled',
    equipmentId: 'camera-001',
    startAt: '2026-10-21T10:00:00Z',
    endAt: '2026-10-21T11:00:00Z',
    confirmationEventId: 'e1',
    cancellationEventId: 'e2',
  };
  let duplicate = false;
  const origin = await provider(t, (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer private');
    response.setHeader('content-type', 'application/json');
    const events = [
      {
        eventId: 'e1',
        reservationId: 'r1',
        userKey: reservation.userKey,
        eventType: 'ReservationConfirmed',
      },
      {
        eventId: 'e2',
        reservationId: 'r1',
        userKey: reservation.userKey,
        eventType: 'ReservationCancelled',
      },
    ];
    if (duplicate) events.push({ ...events[0] });
    response.end(
      JSON.stringify(
        request.url === '/api/reservations/r1' ? reservation : events,
      ),
    );
  });
  const settings = {
    applicationOrigin: origin,
    token: 'private',
    reservationId: 'r1',
  };
  const checkpoint = await capturePersistenceCheckpoint(settings);
  assert.equal(JSON.stringify(checkpoint).includes('private'), false);
  await verifyPersistenceCheckpoint({ ...settings, checkpoint });
  reservation.userKey = 'subject-recreated';
  await assert.rejects(
    verifyPersistenceCheckpoint({ ...settings, checkpoint }),
    /persist|identity/i,
  );
  reservation.userKey = 'subject-original';
  duplicate = true;
  await assert.rejects(
    verifyPersistenceCheckpoint({ ...settings, checkpoint }),
    /duplicate/i,
  );
});

test('persistence checkpoint is created privately without replacing an earlier record', async (t) => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { savePersistenceCheckpoint } = await import('./deployment-smoke.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'equipment-checkpoint-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  createPrivateDirectory(directory);
  const path = join(directory, 'checkpoint.json');
  const checkpoint = { schemaVersion: 1, reservation: { id: 'r1' } };
  savePersistenceCheckpoint(path, checkpoint);
  assertPrivatePath(path, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), checkpoint);
  assert.throws(() =>
    savePersistenceCheckpoint(path, {
      schemaVersion: 1,
      reservation: { id: 'replacement' },
    }),
  );
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), checkpoint);
});
