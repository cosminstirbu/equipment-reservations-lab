import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, URLSearchParams } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyDeployedTelemetry } from './deployment-diagnostics.mjs';
import { OperationalFailure, safeFailure, cleanupAll } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';

const services = ['inventory', 'reservations', 'notifications'];

async function request(url, options = {}) {
  try {
    const response = await globalThis.fetch(url, {
      ...options,
      redirect: 'manual',
      signal: globalThis.AbortSignal.timeout(5000),
    });
    const readJson = response.json.bind(response);
    response.json = async () => {
      try {
        return await readJson();
      } catch {
        throw new OperationalFailure(
          'Smoke HTTP response payload is invalid; private body suppressed.',
        );
      }
    };
    return response;
  } catch {
    throw new OperationalFailure(
      'Smoke HTTP request failed: transport or timeout; private URL and response suppressed.',
    );
  }
}

function expect(response, statuses, operation) {
  if (!statuses.includes(response.status))
    throw new OperationalFailure(
      `${operation} failed (HTTP ${response.status}).`,
    );
  return response;
}

export async function verifyDeploymentSurface({
  applicationOrigin,
  authority,
}) {
  expect(await request(applicationOrigin), [200], 'Application');
  for (const service of services) {
    const prefix = `/services/${service}`;
    const response = expect(
      await request(`${applicationOrigin}${prefix}/openapi/v1.json`),
      [200],
      `${service} document`,
    );
    const document = await response.json();
    if (
      !document.openapi?.startsWith('3.1.') ||
      !document.servers?.some((server) => server.url === prefix) ||
      !Object.keys(document.paths ?? {}).some((path) =>
        path.startsWith('/api/'),
      ) ||
      Object.keys(document.paths ?? {}).some((path) =>
        /health|alive|metrics/.test(path),
      )
    )
      throw new OperationalFailure(`${service} document contract failed.`);
    expect(
      await request(`${applicationOrigin}${prefix}/scalar/v1`),
      [200],
      `${service} Scalar UI`,
    );
    for (const asset of ['scalar.js', 'scalar.aspnetcore.js', 'favicon.svg']) {
      expect(
        await request(`${applicationOrigin}${prefix}/scalar/${asset}`),
        [200],
        `${service} Scalar asset`,
      );
    }
  }
  for (const path of [
    '/health',
    '/alive',
    '/metrics',
    '/services/inventory/health',
    '/services/reservations/admin',
  ]) {
    expect(
      await request(`${applicationOrigin}${path}`),
      [400, 404],
      'Public operational path denial',
    );
  }
  const identityOrigin = new URL(authority).origin;
  for (const path of [
    '/admin/',
    '/realms/master/.well-known/openid-configuration',
    '/health',
  ]) {
    expect(
      await request(`${identityOrigin}${path}`),
      [400, 404],
      'Identity administration denial',
    );
  }
}

export async function observeNotifications({
  applicationOrigin,
  token,
  reservationId,
  expectedTypes,
  timeoutMs = 30000,
  intervalMs = 250,
}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const response = expect(
      await request(`${applicationOrigin}/api/notifications`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      [200],
      'Notifications',
    );
    const entries = (await response.json()).filter(
      (entry) => entry.reservationId === reservationId,
    );
    if (
      expectedTypes.some(
        (type) =>
          entries.filter((entry) => entry.eventType === type).length > 1,
      )
    )
      throw new OperationalFailure('Duplicate notification effect.');
    if (
      expectedTypes.every(
        (type) =>
          entries.filter((entry) => entry.eventType === type).length === 1,
      )
    )
      return entries;
    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new OperationalFailure('Notification observation deadline expired.');
}

async function verifyDashboardBrowserDenial(origin) {
  let url = new URL('/', origin);
  for (let redirects = 0; redirects < 3; redirects++) {
    const response = await request(url);
    if ([401, 403].includes(response.status)) return;
    if (![302, 303].includes(response.status))
      throw new OperationalFailure(
        'Unauthenticated dashboard browser access was admitted.',
      );
    let next;
    try {
      next = new URL(response.headers.get('location'), url);
      if (
        next.origin !== new URL(origin).origin ||
        next.username ||
        next.password ||
        /token=/i.test(decodeURIComponent(next.search)) ||
        !['/structuredlogs', '/login'].includes(next.pathname)
      )
        throw new Error();
      for (const [name, value] of next.searchParams)
        if (
          name.toLowerCase() === 'returnurl' &&
          new URL(value, origin).origin !== new URL(origin).origin
        )
          throw new Error();
    } catch {
      throw new OperationalFailure(
        'Unauthenticated dashboard redirect is unsafe.',
      );
    }
    if (next.pathname === '/login') return;
    url = next;
  }
  throw new OperationalFailure(
    'Unauthenticated dashboard redirect limit exceeded.',
  );
}

export async function verifyDiagnosticAuthentication({
  dashboardOrigin,
  otlpOrigin,
  dashboardApiKey,
  dashboardOtlpKey,
}) {
  await verifyDashboardBrowserDenial(dashboardOrigin);
  const api = await request(`${dashboardOrigin}/api/telemetry/traces`);
  if (![401, 403].includes(api.status))
    throw new OperationalFailure(
      'Unauthenticated dashboard API access was admitted.',
    );
  const response = await request(`${otlpOrigin}/v1/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (![401, 403].includes(response.status))
    throw new OperationalFailure(
      'Unauthenticated OTLP ingestion was admitted.',
    );
  if (dashboardApiKey)
    expect(
      await request(`${dashboardOrigin}/api/telemetry/traces`, {
        headers: { 'x-api-key': dashboardApiKey },
      }),
      [200],
      'Authenticated dashboard API',
    );
  if (dashboardOtlpKey)
    expect(
      await request(`${otlpOrigin}/v1/traces`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-otlp-api-key': dashboardOtlpKey,
        },
        body: '{}',
      }),
      [200],
      'Authenticated OTLP ingestion',
    );
}

export async function capturePersistenceCheckpoint({
  applicationOrigin,
  token,
  reservationId,
}) {
  const headers = { authorization: `Bearer ${token}` };
  const reservation = await expect(
    await request(
      `${applicationOrigin}/api/reservations/${encodeURIComponent(reservationId)}`,
      { headers },
    ),
    [200],
    'Persistence reservation',
  ).json();
  const fields = [
    'id',
    'userKey',
    'status',
    'equipmentId',
    'startAt',
    'endAt',
    'confirmationEventId',
    'cancellationEventId',
  ];
  if (
    reservation.id !== reservationId ||
    reservation.status !== 'Cancelled' ||
    fields.some(
      (field) => typeof reservation[field] !== 'string' || !reservation[field],
    )
  )
    throw new OperationalFailure('Persistence reservation contract failed.');
  const events = await expect(
    await request(`${applicationOrigin}/api/notifications`, { headers }),
    [200],
    'Persistence notifications',
  ).json();
  const relevant = events.filter(
    (entry) => entry.reservationId === reservationId,
  );
  for (const type of ['ReservationConfirmed', 'ReservationCancelled']) {
    if (relevant.filter((entry) => entry.eventType === type).length > 1)
      throw new OperationalFailure('Duplicate persisted notification effect.');
  }
  if (
    relevant.length !== 2 ||
    !relevant.some(
      (entry) =>
        entry.eventType === 'ReservationConfirmed' &&
        entry.eventId === reservation.confirmationEventId,
    ) ||
    !relevant.some(
      (entry) =>
        entry.eventType === 'ReservationCancelled' &&
        entry.eventId === reservation.cancellationEventId,
    ) ||
    relevant.some((entry) => entry.userKey !== reservation.userKey)
  )
    throw new OperationalFailure('Persistence notification contract failed.');
  return {
    schemaVersion: 1,
    reservation: Object.fromEntries(
      fields.map((field) => [field, reservation[field]]),
    ),
    notifications: relevant
      .map((entry) => ({
        eventId: entry.eventId,
        reservationId: entry.reservationId,
        userKey: entry.userKey,
        eventType: entry.eventType,
      }))
      .sort((left, right) => left.eventId.localeCompare(right.eventId)),
  };
}

export async function verifyPersistenceCheckpoint({
  applicationOrigin,
  token,
  checkpoint,
}) {
  if (
    checkpoint?.schemaVersion !== 1 ||
    typeof checkpoint.reservation?.id !== 'string'
  )
    throw new OperationalFailure('Persistence checkpoint is invalid.');
  const actual = await capturePersistenceCheckpoint({
    applicationOrigin,
    token,
    reservationId: checkpoint.reservation.id,
  });
  if (JSON.stringify(actual) !== JSON.stringify(checkpoint))
    throw new OperationalFailure(
      'Persisted reservation, identity or notification effects changed.',
    );
  return actual;
}

export function savePersistenceCheckpoint(path, checkpoint) {
  writeFileSync(path, JSON.stringify(checkpoint) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export async function authenticateCodeFlow({
  authority,
  applicationOrigin,
  username,
  password,
  clientId = 'equipment-web',
  callback = `${applicationOrigin}/`,
}) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('hex');
  const url = new URL(`${authority}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const cookies = new Map();
  const remember = (response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const first = expect(await request(url), [200], 'Identity login page');
  remember(first);
  const html = await first.text();
  const action = html.match(/<form\b[^>]*\baction=["']([^"']+)["']/i)?.[1];
  if (!action)
    throw new OperationalFailure('Identity login form is unavailable.');
  const destination = new URL(decodeHtml(action), url);
  if (destination.origin !== url.origin)
    throw new OperationalFailure(
      'Identity login form leaves the approved provider.',
    );
  const fields = new URLSearchParams({ username, password, credentialId: '' });
  const signed = expect(
    await request(destination, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: [...cookies]
          .map(([key, value]) => `${key}=${value}`)
          .join('; '),
      },
      body: fields,
    }),
    [302, 303],
    'Identity login',
  );
  const redirect = new URL(signed.headers.get('location') ?? '', url);
  if (
    redirect.origin + redirect.pathname !== callback ||
    redirect.searchParams.get('state') !== state ||
    !redirect.searchParams.get('code')
  )
    throw new OperationalFailure('Identity callback/state validation failed.');
  const token = expect(
    await request(`${authority}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: callback,
        code: redirect.searchParams.get('code'),
        code_verifier: verifier,
      }),
    }),
    [200],
    'Identity code exchange',
  );
  const result = await token.json();
  if (typeof result.access_token !== 'string' || !result.access_token)
    throw new OperationalFailure('Identity token response is invalid.');
  return result.access_token;
}

async function deployedSession({ applicationOrigin, authority, credentials }) {
  const traceIds = Object.fromEntries(
    ['book', 'cancel', 'invalid'].map((kind) => [
      kind,
      randomBytes(16).toString('hex'),
    ]),
  );
  const acquiredTokens = [];
  const alice = await authenticateCodeFlow({
    authority,
    applicationOrigin,
    username: 'employee-a',
    password: credentials.alice,
  });
  const bob = await authenticateCodeFlow({
    authority,
    applicationOrigin,
    username: 'employee-b',
    password: credentials.bob,
  });
  const manager = await authenticateCodeFlow({
    authority,
    applicationOrigin,
    username: 'approver',
    password: credentials.manager,
  });
  acquiredTokens.push(alice, bob, manager);
  const headers = (token, kind) => ({
    authorization: `Bearer ${token}`,
    origin: applicationOrigin,
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    ...(kind
      ? {
          traceparent: `00-${traceIds[kind]}-${randomBytes(8).toString('hex')}-01`,
        }
      : {}),
  });

  return {
    applicationOrigin,
    authority,
    credentials,
    traceIds,
    acquiredTokens,
    alice,
    bob,
    manager,
    headers,
  };
}

async function reservationBody({ applicationOrigin, alice, headers }) {
  const equipment = await expect(
    await request(`${applicationOrigin}/api/equipment`, {
      headers: headers(alice),
    }),
    [200],
    'Equipment',
  ).json();
  const item = equipment.find((entry) => entry.operational);
  if (!item)
    throw new OperationalFailure(
      'No operational equipment available for smoke.',
    );
  const start = Date.now() + 86400000 + randomInt(1, 525600) * 60000;
  const body = JSON.stringify({
    equipmentId: item.id,
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + 60000).toISOString(),
  });
  return body;
}

export async function verifyDeployedIdentity(options) {
  const { applicationOrigin, authority, credentials, acquiredTokens } =
    await deployedSession(options);
  const discovery = await expect(
    await request(`${authority}/.well-known/openid-configuration`),
    [200],
    'Identity discovery',
  ).json();
  if (discovery.issuer !== authority)
    throw new OperationalFailure('Identity discovery issuer mismatch.');
  for (const service of services) {
    const callback = `${applicationOrigin}/services/${service}/oauth/callback`;
    expect(await request(callback), [200], 'Documentation callback');
    const token = await authenticateCodeFlow({
      authority,
      applicationOrigin,
      username: 'employee-a',
      password: credentials.alice,
      clientId: 'equipment-docs',
      callback,
    });
    acquiredTokens.push(token);
    const path = service === 'inventory' ? 'equipment' : service;
    expect(
      await request(`${applicationOrigin}/services/${service}/api/${path}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      [200],
      'Documentation authenticated request',
    );
  }
  return acquiredTokens;
}

export async function verifyDeployedAuthorization(options) {
  const session = await deployedSession(options);
  const { applicationOrigin, alice, manager, headers } = session;
  const body = await reservationBody(session);
  expect(
    await request(`${applicationOrigin}/api/reservations`, {
      method: 'POST',
      headers: headers(manager),
      body,
    }),
    [403],
    'Role denial',
  );
  expect(
    await request(`${applicationOrigin}/api/reservations`, {
      method: 'POST',
      headers: { ...headers(alice), origin: 'https://forged.invalid' },
      body,
    }),
    [403],
    'Origin denial',
  );
}

export async function verifyDeployedLifecycle(options) {
  const session = await deployedSession(options);
  const { applicationOrigin, alice, bob, headers } = session;
  const body = await reservationBody(session);
  let id;
  let cancelled = false;
  let primary;
  try {
    const created = await expect(
      await request(
        `${applicationOrigin}/services/reservations/api/reservations`,
        { method: 'POST', headers: headers(alice, 'book'), body },
      ),
      [201],
      'Documentation reservation write',
    ).json();
    id = created.id;
    expect(
      await request(`${applicationOrigin}/api/reservations/${id}`, {
        headers: headers(bob),
      }),
      [404],
      'Ownership denial',
    );
    await observeNotifications({
      applicationOrigin,
      token: alice,
      reservationId: id,
      expectedTypes: ['ReservationConfirmed'],
    });
    expect(
      await request(`${applicationOrigin}/api/reservations/${id}/cancel`, {
        method: 'POST',
        headers: headers(alice, 'cancel'),
        body: 'null',
      }),
      [200],
      'Reservation cancellation',
    );
    cancelled = true;
    await observeNotifications({
      applicationOrigin,
      token: alice,
      reservationId: id,
      expectedTypes: ['ReservationConfirmed', 'ReservationCancelled'],
    });
    // A second read after a bounded quiet period catches late duplicate delivery effects.
    await delay(1000);
    await observeNotifications({
      applicationOrigin,
      token: alice,
      reservationId: id,
      expectedTypes: ['ReservationConfirmed', 'ReservationCancelled'],
    });
    expect(
      await request(`${applicationOrigin}/api/reservations/not-a-guid`, {
        headers: headers(alice, 'invalid'),
      }),
      [400],
      'Controlled reservation validation failure',
    );
  } catch (error) {
    primary = error;
  } finally {
    await cleanupAll(
      [
        {
          operation: 'cancel owned deployed-test reservation',
          run: async () => {
            if (!id || cancelled) return;
            expect(
              await request(
                `${applicationOrigin}/api/reservations/${id}/cancel`,
                {
                  method: 'POST',
                  headers: headers(alice),
                  body: 'null',
                },
              ),
              [200],
              'Owned reservation cleanup',
            );
          },
        },
      ],
      { primary },
    );
  }
  return {
    reservationId: id,
    traceIds: session.traceIds,
    acquiredTokens: session.acquiredTokens,
  };
}

export async function verifyDeployedDiagnostics(options) {
  if (!options.dashboardOrigin || !options.otlpOrigin)
    throw new OperationalFailure(
      'Explicit private dashboard/OTLP probe endpoints required.',
    );
  await verifyDiagnosticAuthentication({
    dashboardOrigin: options.dashboardOrigin,
    otlpOrigin: options.otlpOrigin,
    dashboardApiKey: options.credentials.dashboardApi,
    dashboardOtlpKey: options.credentials.dashboardOtlp,
  });
}

async function verifyLifecycleTelemetry(
  options,
  result,
  additionalTokens = [],
) {
  if (!options.dashboardOrigin || !options.otlpOrigin)
    throw new OperationalFailure(
      'Explicit private dashboard/OTLP probe endpoints required.',
    );
  await verifyDeployedTelemetry({
    dashboardOrigin: options.dashboardOrigin,
    apiKey: options.credentials.dashboardApi,
    traceIds: result.traceIds,
    privateValues: [
      ...Object.values(options.credentials),
      ...result.acquiredTokens,
      ...additionalTokens,
    ],
  });
}

export async function verifyDeployedTelemetryScenario(options) {
  const result = await verifyDeployedLifecycle(options);
  await verifyLifecycleTelemetry(options, result);
}

export async function runDeployedSmoke({
  applicationOrigin = 'https://app.equipment.test',
  authority = 'https://identity.equipment.test/realms/equipment',
  ...settings
}) {
  const options = { applicationOrigin, authority, ...settings };
  await verifyDeploymentSurface(options);
  const tokens = await verifyDeployedIdentity(options);
  await verifyDeployedAuthorization(options);
  const result = await verifyDeployedLifecycle(options);
  await verifyDeployedDiagnostics(options);
  await verifyLifecycleTelemetry(options, result, tokens);
  return {
    reservationId: result.reservationId,
    checks: [
      'documents',
      'pkce',
      'callback',
      'write',
      'ownership',
      'origin',
      'notifications',
      'diagnostic-authentication',
      'correlated-private-telemetry',
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let phase = 'prerequisites';
  try {
    const args = process.argv.slice(2);
    const index = args.indexOf('--state');
    const directory = resolve(
      index >= 0
        ? args[index + 1]
        : (process.env.EQUIPMENT_CI_STATE ?? '.local/kubernetes'),
    );
    assertPrivatePath(directory, 0o700);
    const statePath = join(directory, 'smoke-state.json');
    let state = {};
    if (existsSync(statePath)) {
      assertPrivatePath(statePath, 0o600);
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    }
    if (args.includes('--ci') && state.context !== 'kind-equipment-ci')
      throw new OperationalFailure(
        'CI smoke requires its explicit disposable context.',
      );
    const path = resolve(
      directory,
      state.credentialsFile ?? 'credentials.json',
    );
    assertPrivatePath(path, 0o600);
    const credentials = JSON.parse(readFileSync(path, 'utf8'));
    const capture = args.includes('--capture-persistence');
    const verify = args.includes('--verify-persistence');
    if (capture && verify)
      throw new OperationalFailure('Choose one persistence operation.');
    const checkpointPath = join(directory, 'persistence-checkpoint.json');
    const applicationOrigin =
      state.applicationOrigin ?? 'https://app.equipment.test';
    const authority =
      state.authority ?? 'https://identity.equipment.test/realms/equipment';
    if (capture && existsSync(checkpointPath))
      throw new OperationalFailure(
        'Existing persistence checkpoint must be retained; choose a new private state directory for another capture.',
      );
    phase = verify ? 'persistence verification' : 'deployed HTTP smoke';
    if (verify) {
      assertPrivatePath(checkpointPath, 0o600);
      const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
      const token = await authenticateCodeFlow({
        applicationOrigin,
        authority,
        username: 'employee-a',
        password: credentials.alice,
      });
      await verifyPersistenceCheckpoint({
        applicationOrigin,
        token,
        checkpoint,
      });
      console.log(
        'Persisted reservation, identity and notification effects verified.',
      );
    } else {
      const result = await runDeployedSmoke({
        credentials,
        applicationOrigin,
        authority,
        dashboardOrigin:
          process.env.EQUIPMENT_DASHBOARD_ORIGIN ?? state.dashboardOrigin,
        otlpOrigin: process.env.EQUIPMENT_OTLP_ORIGIN ?? state.otlpOrigin,
      });
      if (capture) {
        const token = await authenticateCodeFlow({
          applicationOrigin,
          authority,
          username: 'employee-a',
          password: credentials.alice,
        });
        const checkpoint = await capturePersistenceCheckpoint({
          applicationOrigin,
          token,
          reservationId: result.reservationId,
        });
        savePersistenceCheckpoint(checkpointPath, checkpoint);
      }
      console.log('Deployed HTTP smoke passed.');
    }
  } catch (error) {
    console.error(
      `Smoke ${phase} failed. ${safeFailure(error, 'Private operation failed; credentials, transport details and HTTP bodies are suppressed.')}`,
    );
    process.exitCode = 1;
  }
}
