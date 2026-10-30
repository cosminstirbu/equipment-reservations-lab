import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { OperationalFailure, cleanupAll } from './process.mjs';
import { Buffer } from 'node:buffer';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { renderVerificationResources } from './azure-runtime.mjs';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPrivatePath } from './local-platform.mjs';
import { identityContinuityMetadata } from './azure-recovery-identity.mjs';
import { isDeepStrictEqual } from 'node:util';

export function loadRecoveryConfig(path) {
  try {
    assertPrivatePath(resolve(path), 0o600);
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (
      Object.keys(value).sort().join(',') !== 'brokerMonitorPassword,version' ||
      value.version !== 1 ||
      typeof value.brokerMonitorPassword !== 'string' ||
      value.brokerMonitorPassword.length < 32 ||
      value.brokerMonitorPassword.length > 256 ||
      /[\r\n\0]/.test(value.brokerMonitorPassword)
    )
      fail('Invalid recovery configuration.');
    return value;
  } catch {
    fail(
      'Private recovery configuration is missing or invalid; monitor credential and private values suppressed.',
    );
  }
}

export function createRecoveryBlobStore({
  account,
  container,
  token,
  origin = `https://${account}.blob.core.windows.net`,
  fetch = globalThis.fetch,
  signal,
}) {
  if (
    !/^[a-z0-9]{3,24}$/.test(account) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(container)
  )
    fail('Recovery Blob scope is invalid.');
  const names = [
    'inventory',
    'reservations',
    'notifications',
    'keycloak',
    'credentials',
    'metadata',
  ];
  const path = (point, name) => {
    if (!validPoint(point) || ![...names, 'complete'].includes(name))
      fail('Recovery point or object path is invalid.');
    return `${container}/points/${point}/${name}.json`;
  };
  const request = async (target, method = 'GET', value, properties = false) => {
    let response;
    try {
      response = await fetch(`${origin}/${target}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          'x-ms-version': '2023-11-03',
          ...(method === 'PUT'
            ? {
                'x-ms-blob-type': 'BlockBlob',
                'If-None-Match': '*',
                'Content-Type': 'application/json',
              }
            : {}),
        },
        body: value === undefined ? undefined : JSON.stringify(value),
        signal: globalThis.AbortSignal.any([
          ...(signal ? [signal] : []),
          globalThis.AbortSignal.timeout(60000),
        ]),
      });
    } catch {
      fail('Recovery Blob transport failed; private details suppressed.');
    }
    if (!response.ok && !(method === 'DELETE' && response.status === 404))
      fail(`Recovery Blob request failed; status=${response.status}.`);
    if (method !== 'GET') {
      await response.body?.cancel();
      return;
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 180 * 1024 * 1024)
        fail('Recovery Blob response exceeds its bounded size.');
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return properties
      ? {
          text,
          etag: response.headers.get('etag'),
          versionId: response.headers.get('x-ms-version-id'),
        }
      : text;
  };
  const readJson = async (target) => {
    try {
      return JSON.parse(await request(target));
    } catch (error) {
      if (error instanceof OperationalFailure) throw error;
      fail('Recovery Blob JSON is malformed; private body suppressed.');
    }
  };
  return {
    async putObject(point, name, value) {
      if (
        !Buffer.isBuffer(value?.ciphertext) ||
        value.ciphertext.length > 128 * 1024 * 1024 ||
        value.manifest?.object !== name
      )
        fail('Recovery envelope is invalid.');
      await request(path(point, name), 'PUT', {
        manifest: value.manifest,
        ciphertext: value.ciphertext.toString('base64url'),
      });
    },
    async getObject(point, name) {
      const text = await request(path(point, name));
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        fail('Recovery envelope response is malformed.');
      }
      if (
        typeof value.ciphertext !== 'string' ||
        !/^[A-Za-z0-9_-]*$/.test(value.ciphertext) ||
        value.manifest?.object !== name
      )
        fail('Recovery envelope response is malformed.');
      return {
        ciphertext: Buffer.from(value.ciphertext, 'base64url'),
        manifest: value.manifest,
        storedHash: digest(text),
      };
    },
    async complete(point, marker) {
      if (
        marker?.version !== 2 ||
        marker.id !== point ||
        marker.complete !== true ||
        marker.verified !== true ||
        !Number.isFinite(Date.parse(marker.created))
      )
        fail('Recovery successful marker is invalid.');
      const sourceScope =
        /^\/subscriptions\/([a-zA-Z0-9-]+)\/resourceGroups\/er-([a-z][a-z0-9-]{0,62})-workload\/providers\/Microsoft\.KeyVault\/vaults\/[a-z0-9-]{3,24}$/.exec(
          marker.sourceIdentity?.vaultId ?? '',
        );
      if (!sourceScope)
        fail('Recovery successful marker source scope is invalid.');
      validateCompletion(marker, {
        pointId: point,
        backupPrincipalId: marker.producerPrincipalId,
        tenantId: marker.sourceIdentity.tenantId,
        subscriptionId: sourceScope[1],
        environment: sourceScope[2],
        keyId: marker.keyId,
        compatibility: marker.compatibility,
      });
      await request(path(point, 'complete'), 'PUT', marker);
    },
    async getComplete(point) {
      return readJson(path(point, 'complete'));
    },
    async readCompletion(point) {
      const response = await request(
        path(point, 'complete'),
        'GET',
        undefined,
        true,
      );
      if (response.text.length > 65536) fail('Recovery catalog is oversized.');
      let marker;
      try {
        marker = JSON.parse(response.text);
      } catch {
        fail('Recovery catalog is malformed.');
      }
      return {
        marker,
        etag: response.etag,
        versionId: response.versionId,
        markerHash: digest(response.text),
      };
    },
    async list() {
      const points = [];
      let marker = '';
      for (let page = 0; page < 100; page++) {
        const text = await request(
          `${container}?restype=container&comp=list&prefix=points%2F&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`,
        );
        if (text.length > 1048576 || /<!DOCTYPE/i.test(text))
          fail('Recovery Blob inventory XML is invalid or oversized.');
        let parsed;
        try {
          parsed = new XMLParser({
            ignoreAttributes: true,
            processEntities: false,
            parseTagValue: false,
            isArray: (name) => name === 'Blob',
          }).parse(text).EnumerationResults;
        } catch {
          fail('Recovery Blob inventory XML is malformed.');
        }
        if (
          !parsed ||
          (parsed.Blobs?.Blob && !Array.isArray(parsed.Blobs.Blob))
        )
          fail('Recovery Blob inventory schema is invalid.');
        for (const blob of parsed.Blobs?.Blob ?? []) {
          const match = /^points\/([a-zA-Z0-9-]{1,80})\/complete\.json$/.exec(
            blob.Name,
          );
          if (match) {
            const value = await readJson(path(match[1], 'complete'));
            if (value.id !== match[1])
              fail('Recovery marker identity mismatch.');
            points.push(value);
          }
        }
        marker = parsed.NextMarker;
        if (!marker) return points;
        if (typeof marker !== 'string' || marker.length > 4096)
          fail('Recovery Blob inventory continuation is invalid.');
      }
      fail('Recovery Blob inventory exceeds its page bound.');
    },
    async remove(point) {
      await cleanupAll(
        [...names, 'complete'].map((name) => ({
          operation: 'expired recovery object deletion',
          run: () => request(path(point, name), 'DELETE'),
        })),
      );
    },
  };
}

const writers = Object.freeze([
  'web',
  'inventory',
  'reservations',
  'notifications',
  'keycloak',
]);
const recoveryBudgets = Object.freeze({
  quiesce: 300000,
  dump: 1200000,
  verify: 1800000,
  cleanup: 120000,
  replicas: 300000,
});
const validPoint = (id) =>
  typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
const validRevision = (value) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const compatibilityHash = (value) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.keys(value).length
  )
    fail('Recovery compatibility inventory is required.');
  const canonical = (object) =>
    Array.isArray(object)
      ? object.map(canonical)
      : object && typeof object === 'object'
        ? Object.fromEntries(
            Object.entries(object)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, entry]) => [key, canonical(entry)]),
          )
        : object;
  const json = JSON.stringify(canonical(value));
  if (json.length > 65536)
    fail('Recovery compatibility inventory exceeds its bound.');
  return digest(json);
};

const recoveryObjects = () => [...recoveryDatabases, 'credentials', 'metadata'];
const canonicalObject = (value) =>
  Array.isArray(value)
    ? value.map(canonicalObject)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonicalObject(item)]),
        )
      : value;
const objectDigest = (value) => digest(JSON.stringify(canonicalObject(value)));
const exactFields = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const secretNames = [
  'identity-admin',
  'reservations-client',
  'alice',
  'bob',
  'manager',
  'staff',
];
function validateCompletion(marker, settings) {
  if (
    !exactFields(marker, [
      'version',
      'id',
      'created',
      'complete',
      'verified',
      'objects',
      'producerPrincipalId',
      'sourceIdentity',
      'sourceSecrets',
      'compatibility',
      'keyId',
      'metadataHash',
      'objectHashes',
    ]) ||
    marker.version !== 2 ||
    marker.id !== settings.pointId ||
    !validPoint(marker.id) ||
    marker.complete !== true ||
    marker.verified !== true ||
    !Number.isFinite(Date.parse(marker.created)) ||
    !/^[a-f0-9-]{36}$/.test(marker.producerPrincipalId ?? '') ||
    marker.producerPrincipalId !== settings.backupPrincipalId ||
    !validKey(marker.keyId) ||
    marker.keyId !== settings.keyId ||
    !isDeepStrictEqual(marker.objects, recoveryObjects()) ||
    !exactFields(marker.objectHashes, recoveryObjects()) ||
    Object.values(marker.objectHashes).some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    ) ||
    marker.metadataHash !== marker.objectHashes.metadata
  )
    fail('Recovery version2 completion marker is missing, foreign or invalid.');
  const source = marker.sourceIdentity;
  if (
    !exactFields(source, ['vaultUri', 'vaultId', 'tenantId', 'generation']) ||
    !/^https:\/\/[a-z0-9-]{3,24}\.vault\.azure\.net$/.test(
      source.vaultUri ?? '',
    ) ||
    source.tenantId !== settings.tenantId ||
    typeof source.generation !== 'string' ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(source.generation) ||
    source.vaultId !==
      '/subscriptions/' +
        settings.subscriptionId +
        '/resourceGroups/er-' +
        settings.environment +
        '-workload/providers/Microsoft.KeyVault/vaults/' +
        new URL(source.vaultUri).hostname.split('.')[0] ||
    marker.compatibility?.generation !== source.generation ||
    compatibilityHash(marker.compatibility) !==
      compatibilityHash(settings.compatibility)
  )
    fail('Recovery selected source context or compatibility is invalid.');
  if (
    !Array.isArray(marker.sourceSecrets) ||
    marker.sourceSecrets.length !== secretNames.length ||
    marker.sourceSecrets.some(
      (secret, index) =>
        !exactFields(secret, ['name', 'version', 'valueHash']) ||
        secret.name !== secretNames[index] ||
        !/^[a-f0-9]{32}$/.test(secret.version ?? '') ||
        !/^[a-f0-9]{64}$/.test(secret.valueHash ?? ''),
    )
  )
    fail('Recovery selected six-secret source inventory is invalid.');
}

export function recoveryEnvelopeHash(value) {
  if (!Buffer.isBuffer(value?.ciphertext) || !value.manifest)
    fail('Recovery encrypted object is invalid.');
  return digest(
    JSON.stringify({
      manifest: value.manifest,
      ciphertext: value.ciphertext.toString('base64url'),
    }),
  );
}

export async function selectRecoveryPoint(storage, settings) {
  if (
    !validPoint(settings.pointId) ||
    !validRevision(settings.maintenanceRevision)
  )
    fail(
      'Recovery selection requires protected point and maintenance revision.',
    );
  const selected = await storage.readCompletion(settings.pointId);
  if (
    !/^"[^\r\n"]{1,250}"$/.test(selected.etag ?? '') ||
    !Number.isFinite(Date.parse(selected.versionId)) ||
    !/^[a-f0-9]{64}$/.test(selected.markerHash ?? '')
  )
    fail('Recovery catalog lacks authenticated Blob version properties.');
  validateCompletion(selected.marker, settings);
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return freeze({
    ...JSON.parse(JSON.stringify(selected)),
    pointId: settings.pointId,
    maintenanceRevision: settings.maintenanceRevision,
    contextHash: objectDigest(selected.marker),
  });
}

export function assertBackupWindow(
  evidence,
  revision,
  now = Date.now(),
  minimumRemaining = Object.values(recoveryBudgets).reduce(
    (sum, value) => sum + value,
    0,
  ),
  allowWriterScaleDrift = false,
) {
  const app = evidence?.application;
  const window = evidence?.project?.spec?.syncWindows?.find(
    (value) =>
      value.kind === 'deny' &&
      value.schedule === '0 20 * * *' &&
      value.duration === '2h' &&
      value.timeZone === 'Europe/Bucharest' &&
      value.manualSync === false &&
      value.applications?.includes('equipment-azure'),
  );
  if (
    !validRevision(revision) ||
    !(
      app?.status?.sync?.status === 'Synced' ||
      (allowWriterScaleDrift &&
        app?.status?.sync?.status === 'OutOfSync' &&
        Array.isArray(app.status.resources) &&
        app.status.resources.every(
          (resource) =>
            resource.status === 'Synced' ||
            (resource.kind === 'Deployment' &&
              resource.namespace === 'equipment' &&
              writers.includes(resource.name)),
        ))
    ) ||
    app.status.sync.revision !== revision ||
    app.operation ||
    ['Running', 'Terminating'].includes(app.status.operationState?.phase) ||
    !window
  )
    fail(
      'Backup requires reviewed synchronized normal Git state, no active sync and the exact deny-sync window.',
    );
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  const elapsed =
    Number(parts.hour) * 3600000 +
    Number(parts.minute) * 60000 +
    Number(parts.second) * 1000;
  if (
    elapsed < 20 * 3600000 ||
    elapsed >= 22 * 3600000 ||
    22 * 3600000 - elapsed < minimumRemaining
  )
    fail(
      'Backup deny-sync window has insufficient time for all worst-case operation and recovery budgets.',
    );
  return 22 * 3600000 - elapsed;
}

export async function backupRecoveryPoint(provider, settings) {
  const now = settings.now ?? Date.now;
  if (!validPoint(settings.pointId) || !validRevision(settings.normalRevision))
    fail('Recovery point or reviewed normal revision is invalid.');
  const cluster = await provider.cluster();
  if (cluster.properties?.powerState?.code === 'Stopped')
    return { outcome: 'skipped-stopped' };
  if (
    cluster.properties?.powerState?.code !== 'Running' ||
    cluster.properties?.provisioningState !== 'Succeeded'
  )
    fail('Backup requires a settled running cluster.');
  compatibilityHash(settings.compatibility);
  if (!validKey(settings.keyId))
    fail('Recovery requires a version-pinned retained key.');
  await provider.qualify('quiesce');
  assertBackupWindow(
    await provider.maintenance(),
    settings.normalRevision,
    now(),
  );
  const replicas = {};
  for (const name of writers) {
    replicas[name] = await provider.readScale(name);
    if (
      !Number.isSafeInteger(replicas[name]) ||
      replicas[name] < 0 ||
      replicas[name] > 10
    )
      fail('Recovery replica inventory is invalid.');
  }
  await provider.saveMaintenance({
    pointId: settings.pointId,
    revision: settings.normalRevision,
    replicas,
    expires: new Date(
      now() +
        Object.values(recoveryBudgets).reduce((sum, value) => sum + value, 0),
    ).toISOString(),
  });
  const plaintext = {};
  const fingerprints = {};
  const objectHashes = {};
  let sourceFacts;
  const templates = renderVerificationResources(
    digest(settings.pointId).slice(0, 16),
  );
  let verificationOwned = false;
  let primary;
  let complete = false;
  const bodySignal = globalThis.AbortSignal.any([
    ...(settings.signal ? [settings.signal] : []),
    globalThis.AbortSignal.timeout(
      recoveryBudgets.quiesce + recoveryBudgets.dump + recoveryBudgets.verify,
    ),
  ]);
  const body = { signal: bodySignal };
  try {
    await provider.scale('web', 0, body);
    await provider.waitScale('web', 0, recoveryBudgets.quiesce, body);
    await provider.drain(recoveryBudgets.quiesce, body);
    for (const name of writers.slice(1)) {
      await provider.scale(name, 0, body);
      await provider.waitScale(name, 0, recoveryBudgets.quiesce, body);
    }
    bodySignal.throwIfAborted();
    await provider.qualify('dump', body);
    assertBackupWindow(
      await provider.maintenance(),
      settings.normalRevision,
      now(),
      recoveryBudgets.dump +
        recoveryBudgets.verify +
        recoveryBudgets.cleanup +
        recoveryBudgets.replicas,
      true,
    );
    const objects = [];
    for (const name of recoveryDatabases) {
      bodySignal.throwIfAborted();
      plaintext[name] = await provider.database.dump(name, body);
      fingerprints[name] = await provider.database.fingerprint(name, body);
      const encrypted = await encryptObject(plaintext[name], {
        ...settings,
        object: name,
      });
      objectHashes[name] = recoveryEnvelopeHash(encrypted);
      await provider.storage.putObject(settings.pointId, name, encrypted);
      objects.push(name);
    }
    sourceFacts = await provider.sourceFacts(body);
    if (
      sourceFacts?.producerPrincipalId !== settings.backupPrincipalId ||
      !/^[a-f0-9-]{36}$/.test(sourceFacts.producerPrincipalId ?? '')
    )
      fail('Backup source producer is not the actual approved identity.');
    plaintext.credentials = await provider.captureBundle();
    const identityMetadata = identityContinuityMetadata(
      JSON.parse(plaintext.credentials.toString('utf8')).identity,
      sourceFacts.sourceIdentity,
    );
    if (
      !isDeepStrictEqual(
        identityMetadata.sourceIdentity,
        sourceFacts.sourceIdentity,
      ) ||
      !isDeepStrictEqual(
        identityMetadata.sourceSecrets,
        sourceFacts.sourceSecrets,
      )
    )
      fail('Backup bundle differs from independently observed source facts.');
    const encryptedCredentials = await encryptObject(plaintext.credentials, {
      ...settings,
      object: 'credentials',
    });
    objectHashes.credentials = recoveryEnvelopeHash(encryptedCredentials);
    await provider.storage.putObject(
      settings.pointId,
      'credentials',
      encryptedCredentials,
    );
    objects.push('credentials');
    bodySignal.throwIfAborted();
    await provider.qualify('verification', body);
    assertBackupWindow(
      await provider.maintenance(),
      settings.normalRevision,
      now(),
      recoveryBudgets.verify +
        recoveryBudgets.cleanup +
        recoveryBudgets.replicas,
      true,
    );
    verificationOwned = true;
    await provider.verification.create(templates, body);
    await provider.verification.wait(templates, recoveryBudgets.verify, body);
    await provider.database.verify(
      templates.host,
      plaintext,
      fingerprints,
      body,
    );
    bodySignal.throwIfAborted();
    assertBackupWindow(
      await provider.maintenance(),
      settings.normalRevision,
      now(),
      recoveryBudgets.cleanup + recoveryBudgets.replicas,
      true,
    );
    const metadata = Buffer.from(
      JSON.stringify({
        version: 1,
        pointId: settings.pointId,
        sourceRevision: settings.normalRevision,
        compatibility: settings.compatibility,
        ...identityMetadata,
        fingerprints,
        objects,
      }),
    );
    try {
      const encryptedMetadata = await encryptObject(metadata, {
        ...settings,
        object: 'metadata',
      });
      objectHashes.metadata = recoveryEnvelopeHash(encryptedMetadata);
      await provider.storage.putObject(
        settings.pointId,
        'metadata',
        encryptedMetadata,
      );
    } finally {
      metadata.fill(0);
    }
    complete = true;
  } catch {
    primary = new OperationalFailure(
      'Backup point failed; private database, credential and provider details suppressed.',
    );
  } finally {
    Object.values(plaintext).forEach((value) => value?.fill(0));
    let replicasRestored = true;
    const cleanup = {
      signal: globalThis.AbortSignal.timeout(
        recoveryBudgets.cleanup + recoveryBudgets.replicas,
      ),
    };
    await cleanupAll(
      [
        ...(verificationOwned
          ? [
              {
                operation: 'owned verification resources cleanup',
                run: () => provider.verification.remove(templates, cleanup),
              },
            ]
          : []),
        ...[...writers].reverse().map((name) => ({
          operation: 'restore exact recorded writer replicas',
          run: async () => {
            try {
              await provider.scale(name, replicas[name], cleanup);
              await provider.waitScale(
                name,
                replicas[name],
                recoveryBudgets.replicas,
                cleanup,
              );
            } catch (error) {
              replicasRestored = false;
              throw error;
            }
          },
        })),
        {
          operation: 'clear recovered maintenance record',
          run: async () => {
            if (replicasRestored) await provider.clearMaintenance();
            else
              fail(
                'Maintenance record retained for unresolved writer recovery.',
              );
          },
        },
      ],
      { primary, report: settings.report ?? console.error },
    );
  }
  if (!complete) fail('Backup point is incomplete.');
  const marker = {
    version: 2,
    id: settings.pointId,
    created: new Date(now()).toISOString(),
    complete: true,
    verified: true,
    objects: [...recoveryDatabases, 'credentials', 'metadata'],
    producerPrincipalId: sourceFacts.producerPrincipalId,
    sourceIdentity: sourceFacts.sourceIdentity,
    sourceSecrets: sourceFacts.sourceSecrets,
    compatibility: settings.compatibility,
    keyId: settings.keyId,
    metadataHash: objectHashes.metadata,
    objectHashes,
  };
  validateCompletion(marker, settings);
  await provider.storage.complete(settings.pointId, marker);
  for (const expired of successfulRetention(await provider.storage.list()))
    await provider.storage.remove(expired.id);
  return { outcome: 'verified', pointId: settings.pointId };
}

export async function restoreRecoveryPoint(provider, settings) {
  if (
    !validPoint(settings.pointId) ||
    !validRevision(settings.maintenanceRevision)
  )
    fail('Restore point and reviewed maintenance revision are required.');
  const expectedCompatibility = compatibilityHash(settings.compatibility);
  const cluster = await provider.cluster();
  if (
    cluster.properties?.powerState?.code !== 'Running' ||
    cluster.properties?.provisioningState !== 'Succeeded'
  )
    fail('Restore requires a settled running cluster; it never starts AKS.');
  await provider.qualify('restore-prerequisites');
  const evidence = await provider.maintenance();
  if (
    evidence.application?.status?.sync?.status !== 'Synced' ||
    evidence.application.status.sync.revision !==
      settings.maintenanceRevision ||
    evidence.application.operation ||
    ['Running', 'Terminating'].includes(
      evidence.application.status.operationState?.phase,
    ) ||
    evidence.seedJobs?.length
  )
    fail(
      'Restore requires synchronized reviewed maintenance Git with no seed Jobs or active sync.',
    );
  for (const name of writers) {
    if ((await provider.readScale(name)) !== 0)
      fail('Restore writers are not zero; restore actor cannot scale.');
    await provider.waitScale(name, 0, recoveryBudgets.quiesce, {
      signal: settings.signal,
    });
  }
  const selected = await selectRecoveryPoint(provider.storage, settings);
  const marker = selected.marker;
  if (
    settings.sourceIdentity !== undefined &&
    !isDeepStrictEqual(settings.sourceIdentity, marker.sourceIdentity)
  )
    fail(
      'Restore caller source context differs from the protected selected point.',
    );
  const plaintext = {};
  try {
    for (const name of [...recoveryDatabases, 'credentials', 'metadata']) {
      const encrypted = await provider.storage.getObject(
        settings.pointId,
        name,
      );
      if (
        encrypted.storedHash !== marker.objectHashes[name] ||
        recoveryEnvelopeHash(encrypted) !== marker.objectHashes[name]
      )
        fail('Selected recovery encrypted object hash mismatch.');
      plaintext[name] = await decryptObject(encrypted, {
        ...settings,
        object: name,
      });
    }
    const metadata = JSON.parse(plaintext.metadata.toString('utf8'));
    if (
      metadata.version !== 1 ||
      metadata.pointId !== settings.pointId ||
      !validRevision(metadata.sourceRevision) ||
      compatibilityHash(metadata.compatibility) !== expectedCompatibility
    )
      fail('Restore compatibility does not match the reviewed deployment.');
    const trustedIdentity = identityContinuityMetadata(
      JSON.parse(plaintext.credentials.toString('utf8')).identity,
      marker.sourceIdentity,
    );
    if (
      !isDeepStrictEqual(
        metadata.sourceIdentity,
        trustedIdentity.sourceIdentity,
      ) ||
      !isDeepStrictEqual(
        metadata.sourceSecrets,
        trustedIdentity.sourceSecrets,
      ) ||
      !isDeepStrictEqual(marker.sourceSecrets, trustedIdentity.sourceSecrets) ||
      metadata.sourceIdentity.generation !== metadata.compatibility.generation
    )
      fail(
        'Restore source identity does not match the independently selected point.',
      );
    await provider.qualify('restore-data');
    await provider.restoreBundle(plaintext.credentials, {
      sourceIdentity: trustedIdentity.sourceIdentity,
      sourceSecrets: trustedIdentity.sourceSecrets,
    });
    for (const name of recoveryDatabases) {
      await provider.database.restore(name, plaintext[name]);
      if (
        (await provider.database.fingerprint(name)) !==
        metadata.fingerprints[name]
      )
        fail('Restored database fingerprint differs from the verified point.');
    }
    await provider.recordRestored({
      pointId: settings.pointId,
      maintenanceRevision: settings.maintenanceRevision,
    });
    return {
      outcome: 'data-restored-awaiting-reviewed-resume',
      pointId: settings.pointId,
    };
  } catch {
    fail(
      'Recovery restore failed; maintenance must remain active and private details are suppressed.',
    );
  } finally {
    Object.values(plaintext).forEach((value) => value?.fill(0));
  }
}

export const recoveryDatabases = Object.freeze([
  'inventory',
  'reservations',
  'notifications',
  'keycloak',
]);
const database = (name) => {
  if (!recoveryDatabases.includes(name))
    fail('Recovery database is not allowlisted.');
  return name;
};
export const recoveryFingerprintSql = `SET row_security=off;
SELECT format('SELECT %L || ''|'' || count(*)::text || ''|'' || md5(coalesce(string_agg(row_to_json(t)::text, chr(10) ORDER BY row_to_json(t)::text), '''')) FROM %I.%I t;', schemaname || '.' || tablename, schemaname, tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\\gexec
SELECT 'sequence|' || sequencename || '|' || coalesce(last_value::text,'NULL') FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;
`;

export function createPostgresRecoveryClient({
  kubeconfig,
  actor,
  command = process.env.KUBECTL ?? 'kubectl',
  prefix = [],
  signal,
}) {
  if (
    !['backup', 'restore'].includes(actor) ||
    typeof kubeconfig !== 'string' ||
    !kubeconfig
  )
    fail('Recovery PostgreSQL actor or kubeconfig is invalid.');
  const pod = `equipment-${actor}-client`;
  const exec = (args, input, timeout = 300000, requestSignal) =>
    runPrivateProcess(
      command,
      [
        ...prefix,
        '--kubeconfig',
        kubeconfig,
        '--namespace',
        'equipment-recovery',
        'exec',
        '-i',
        pod,
        '--container',
        'client',
        '--',
        ...args,
      ],
      {
        tool: 'kubectl',
        operation: 'Private PostgreSQL recovery client',
        input,
        signal: requestSignal
          ? globalThis.AbortSignal.any([
              requestSignal,
              ...(signal ? [signal] : []),
            ])
          : signal,
        timeout,
        maxBuffer: 128 * 1024 * 1024,
      },
    );
  const psql = (name, input, host, options = {}) =>
    exec(
      host
        ? [
            'sh',
            '-ceu',
            'PGPASSWORD="$VERIFY_PGPASSWORD" exec psql "$@"',
            'sh',
            '-X',
            '--no-password',
            '--set',
            'ON_ERROR_STOP=1',
            '-qAt',
            '--host',
            host,
            '--username',
            'verification_admin',
            '--dbname',
            name,
          ]
        : [
            'psql',
            '-X',
            '--no-password',
            '--set',
            'ON_ERROR_STOP=1',
            '-qAt',
            '--dbname',
            name,
          ],
      input,
      300000,
      options.signal,
    );
  return {
    async dump(name, options = {}) {
      database(name);
      if (actor !== 'backup') fail('Recovery dump requires backup actor.');
      return Buffer.from(
        await exec(
          [
            'pg_dump',
            '--format=plain',
            '--no-owner',
            '--no-privileges',
            '--no-password',
            '--dbname',
            name,
          ],
          undefined,
          300000,
          options.signal,
        ),
      );
    },
    async fingerprint(name, options) {
      database(name);
      return psql(name, recoveryFingerprintSql, undefined, options);
    },
    async outboxCount(options) {
      if (actor !== 'backup')
        fail('Outbox drain observation requires backup actor.');
      const value = (
        await psql(
          'reservations',
          'SELECT count(*) FROM reservation_outbox WHERE published_at IS NULL;\n',
          undefined,
          options,
        )
      ).trim();
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        fail(
          'Outbox drain count is missing or invalid; private result suppressed.',
        );
      return { count: Number(value), observedAt: new Date().toISOString() };
    },
    async restore(name, plaintext, options) {
      database(name);
      if (actor !== 'restore')
        fail('Live recovery restore requires restore actor.');
      if (!Buffer.isBuffer(plaintext) || plaintext.length > 128 * 1024 * 1024)
        fail('Recovery restore payload is invalid.');
      await psql(
        name,
        Buffer.concat([
          Buffer.from(
            `SET ROLE "${name}_app";\nDROP SCHEMA public CASCADE;\nCREATE SCHEMA public AUTHORIZATION "${name}_app";\n`,
          ),
          plaintext,
        ]),
        undefined,
        options,
      );
    },
    async verify(host, objects, fingerprints, options) {
      if (actor !== 'backup')
        fail('Isolated verification requires backup actor.');
      if (
        !/^equipment-verify-[a-f0-9]{16}\.equipment-recovery\.svc$/.test(host)
      )
        fail('Isolated verification hostname is invalid.');
      await psql(
        'postgres',
        recoveryDatabases
          .map((name) => `CREATE DATABASE "${name}";`)
          .join('\n'),
        host,
        options,
      );
      for (const name of recoveryDatabases) {
        if (
          !Buffer.isBuffer(objects[name]) ||
          typeof fingerprints[name] !== 'string'
        )
          fail('Isolated verification input is incomplete.');
        await psql(
          name,
          Buffer.concat([
            Buffer.from('DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n'),
            objects[name],
          ]),
          host,
          options,
        );
        if (
          (await psql(name, recoveryFingerprintSql, host, options)) !==
          fingerprints[name]
        )
          fail(
            'Isolated restore fingerprint differs from the source database.',
          );
      }
    },
  };
}

const fail = (message) => {
  throw new OperationalFailure(message);
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const validKey = (value) =>
  typeof value === 'string' &&
  /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/[a-zA-Z0-9-]+\/[a-f0-9]{32}$/.test(
    value,
  );
const validObject = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9.-]{0,79}$/.test(value);
const aad = (object, keyId) =>
  Buffer.from(JSON.stringify({ version: 1, object, keyId }));

export async function encryptObject(plaintext, { keyId, wrapping, object }) {
  if (
    !Buffer.isBuffer(plaintext) ||
    plaintext.length > 128 * 1024 * 1024 ||
    !validKey(keyId) ||
    !validObject(object)
  )
    fail(
      'Recovery encryption input is invalid or exceeds its bounded object size.',
    );
  const key = randomBytes(32);
  try {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(aad(object, keyId));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const wrapped = await wrapping.wrap(key);
    if (
      wrapped?.kid !== keyId ||
      typeof wrapped.value !== 'string' ||
      !wrapped.value
    )
      fail('Recovery wrapping key version mismatch.');
    return {
      ciphertext,
      manifest: {
        version: 1,
        object,
        keyId,
        algorithm: 'AES-256-GCM',
        wrapAlgorithm: 'RSA-OAEP-256',
        wrappedKey: wrapped.value,
        nonce: nonce.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
        ciphertextHash: digest(ciphertext),
        plaintextHash: digest(plaintext),
      },
    };
  } catch {
    fail('Recovery encryption or key wrap failed; private details suppressed.');
  } finally {
    key.fill(0);
  }
}

export async function decryptObject(
  { ciphertext, manifest },
  { keyId, wrapping, object },
) {
  if (
    !validKey(keyId) ||
    !validObject(object) ||
    !Buffer.isBuffer(ciphertext) ||
    ciphertext.length > 128 * 1024 * 1024 ||
    manifest?.version !== 1 ||
    manifest.object !== object ||
    manifest.keyId !== keyId ||
    manifest.algorithm !== 'AES-256-GCM' ||
    manifest.wrapAlgorithm !== 'RSA-OAEP-256' ||
    !/^[a-f0-9]{64}$/.test(manifest.ciphertextHash) ||
    !/^[a-f0-9]{64}$/.test(manifest.plaintextHash) ||
    digest(ciphertext) !== manifest.ciphertextHash
  )
    fail(
      'Recovery manifest, compatibility or ciphertext hash validation failed.',
    );
  let key;
  try {
    const nonce = Buffer.from(manifest.nonce, 'base64url');
    const tag = Buffer.from(manifest.tag, 'base64url');
    if (nonce.length !== 12 || tag.length !== 16)
      fail('Recovery authentication parameters are invalid.');
    key = await wrapping.unwrap(manifest.wrappedKey);
    if (!Buffer.isBuffer(key) || key.length !== 32)
      fail('Recovery unwrapped key is invalid.');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(aad(object, keyId));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    if (digest(plaintext) !== manifest.plaintextHash) {
      plaintext.fill(0);
      fail('Recovery plaintext integrity validation failed.');
    }
    return plaintext;
  } catch {
    fail(
      'Recovery decryption or authentication failed; private details suppressed.',
    );
  } finally {
    key?.fill(0);
  }
}

export function createKeyVaultWrapping({
  keyId,
  token,
  fetch = globalThis.fetch,
}) {
  if (!validKey(keyId))
    fail('Recovery key must have an explicit retained version.');
  async function operate(action, value) {
    let response;
    try {
      response = await fetch(`${keyId}/${action}?api-version=2025-07-01`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alg: 'RSA-OAEP-256', value }),
        signal: globalThis.AbortSignal.timeout(30000),
      });
    } catch {
      fail('Recovery Key Vault request failed; transport or timeout.');
    }
    if (!response.ok)
      fail(`Recovery Key Vault request failed; status=${response.status}.`);
    let result;
    try {
      result = await response.json();
    } catch {
      fail('Recovery Key Vault response is invalid.');
    }
    if (
      result.kid !== keyId ||
      typeof result.value !== 'string' ||
      !result.value
    )
      fail('Recovery Key Vault response key version is invalid.');
    return result;
  }
  return {
    async wrap(key) {
      return operate('wrapkey', key.toString('base64url'));
    },
    async unwrap(value) {
      return Buffer.from(
        (await operate('unwrapkey', value)).value,
        'base64url',
      );
    },
  };
}

export function successfulRetention(points) {
  if (
    !Array.isArray(points) ||
    points.some(
      (point) =>
        !/^[a-zA-Z0-9-]{1,80}$/.test(point.id) ||
        !Number.isFinite(Date.parse(point.created)),
    )
  )
    fail('Recovery point inventory is invalid.');
  const daily = new Map();
  const candidates = points
    .filter((point) => point.complete === true && point.verified === true)
    .sort(
      (left, right) => Date.parse(right.created) - Date.parse(left.created),
    );
  for (const point of candidates) {
    const day = new Date(point.created).toISOString().slice(0, 10);
    if (!daily.has(day)) daily.set(day, point);
  }
  const retain = new Set(
    [...daily.values()].slice(0, 7).map((point) => point.id),
  );
  return candidates
    .filter((point) => !retain.has(point.id))
    .sort(
      (left, right) => Date.parse(left.created) - Date.parse(right.created),
    );
}
