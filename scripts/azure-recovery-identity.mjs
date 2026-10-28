import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { OperationalFailure } from './process.mjs';

const names = [
  'identity-admin',
  'reservations-client',
  'alice',
  'bob',
  'manager',
  'staff',
];
const fail = (
  message = 'Identity continuity input or private provider response is invalid.',
) => {
  throw new OperationalFailure(message);
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const exactKeys = (value, required, optional = []) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key),
  );
const contextValid = (value) =>
  exactKeys(value, ['vaultUri', 'tenantId', 'generation']) &&
  /^https:\/\/[a-z0-9-]{3,24}\.vault\.azure\.net$/.test(value.vaultUri) &&
  typeof value.tenantId === 'string' &&
  value.tenantId.length > 0 &&
  typeof value.generation === 'string' &&
  value.generation.length > 0;
function attributes(value, now) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.enabled === false ||
    (value.enabled !== undefined && typeof value.enabled !== 'boolean')
  )
    fail();
  const result = {};
  for (const key of ['enabled', 'nbf', 'exp'])
    if (value[key] !== undefined) result[key] = value[key];
  for (const key of ['nbf', 'exp'])
    if (
      result[key] !== undefined &&
      (!Number.isSafeInteger(result[key]) || result[key] < 0)
    )
      fail();
  if (result.nbf > now || (result.exp !== undefined && result.exp <= now))
    fail();
  return result;
}

export function identityContinuityMetadata(identity, sourceIdentity) {
  if (
    !exactKeys(sourceIdentity, [
      'vaultUri',
      'vaultId',
      'tenantId',
      'generation',
    ]) ||
    !contextValid({
      vaultUri: sourceIdentity.vaultUri,
      tenantId: sourceIdentity.tenantId,
      generation: sourceIdentity.generation,
    })
  )
    fail();
  const scope =
    /^\/subscriptions\/([a-zA-Z0-9-]+)\/resourceGroups\/([a-zA-Z0-9_.()-]+)\/providers\/Microsoft\.KeyVault\/vaults\/([a-z0-9-]{3,24})$/.exec(
      sourceIdentity.vaultId ?? '',
    );
  if (
    !scope ||
    sourceIdentity.vaultUri !== 'https://' + scope[3] + '.vault.azure.net' ||
    !exactKeys(identity, ['version', 'source', 'secrets']) ||
    identity.version !== 1 ||
    !contextValid(identity.source) ||
    identity.source.vaultUri !== sourceIdentity.vaultUri ||
    identity.source.tenantId !== sourceIdentity.tenantId ||
    identity.source.generation !== sourceIdentity.generation ||
    !Array.isArray(identity.secrets) ||
    identity.secrets.length !== names.length
  )
    fail();
  const sourceSecrets = identity.secrets.map((item, index) => {
    if (
      !exactKeys(
        item,
        ['name', 'version', 'value', 'valueHash', 'attributes'],
        ['contentType'],
      ) ||
      item.name !== names[index] ||
      !/^[a-f0-9]{32}$/.test(item.version ?? '') ||
      typeof item.value !== 'string' ||
      item.valueHash !== digest(item.value)
    )
      fail();
    return {
      name: item.name,
      version: item.version,
      valueHash: item.valueHash,
    };
  });
  return { sourceIdentity: { ...sourceIdentity }, sourceSecrets };
}

export function createIdentityContinuityStore({
  vaultUri,
  tenantId,
  generation,
  actor,
  token,
  request = globalThis.fetch,
  signal,
}) {
  if (typeof vaultUri === 'string') vaultUri = vaultUri.replace(/\/$/, '');
  const source = { vaultUri, tenantId, generation };
  if (
    !contextValid(source) ||
    !['backup', 'restore'].includes(actor) ||
    typeof token !== 'function'
  )
    fail();
  const validate = (item, name, origin) => {
    if (
      !exactKeys(
        item,
        ['name', 'version', 'value', 'valueHash', 'attributes'],
        ['contentType'],
      ) ||
      !exactKeys(item.attributes, [], ['enabled', 'nbf', 'exp']) ||
      item.name !== name ||
      typeof item.value !== 'string' ||
      item.value.length < 16 ||
      item.value.length > 16384 ||
      !/^[a-f0-9]{32}$/.test(item.version ?? '') ||
      item.valueHash !== digest(item.value) ||
      (item.contentType !== undefined &&
        (typeof item.contentType !== 'string' ||
          item.contentType.length > 256)) ||
      !contextValid(origin)
    )
      fail();
    attributes(item.attributes, Math.floor(Date.now() / 1000));
  };
  const send = async (name, method, body) => {
    let status;
    try {
      const response = await request(
        `${vaultUri}/secrets/${name}?api-version=7.5`,
        {
          method,
          headers: {
            Authorization: `Bearer ${await token('https://vault.azure.net')}`,
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: 'error',
          signal: globalThis.AbortSignal.any([
            ...(signal ? [signal] : []),
            globalThis.AbortSignal.timeout(30000),
          ]),
        },
      );
      status =
        Number.isInteger(response.status) &&
        response.status >= 100 &&
        response.status <= 599
          ? response.status
          : undefined;
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        fail(
          `Identity continuity ${method} failed; status=${response.status}.`,
        );
      }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65536) fail();
          chunks.push(Buffer.from(chunk.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        typeof value.id !== 'string' ||
        !value.id.startsWith(`${vaultUri}/secrets/${name}/`)
      )
        fail();
      const version = value.id.slice(`${vaultUri}/secrets/${name}/`.length);
      const item = {
        name,
        version,
        value: value.value,
        valueHash:
          typeof value.value === 'string' ? digest(value.value) : undefined,
        attributes: attributes(value.attributes, Math.floor(Date.now() / 1000)),
        ...(value.contentType !== undefined
          ? { contentType: value.contentType }
          : {}),
      };
      validate(item, name, source);
      return item;
    } catch {
      fail(
        `Identity continuity ${method} failed; status=${status ?? 'unavailable'}; private values and transport details suppressed.`,
      );
    }
  };
  return {
    async capture() {
      if (actor !== 'backup')
        fail('Identity continuity actor cannot capture secret values.');
      const secrets = [];
      for (const name of names) secrets.push(await send(name, 'GET'));
      return { version: 1, source, secrets };
    },
    async restore(bundle, expectedSource) {
      if (actor !== 'restore')
        fail('Identity continuity actor cannot restore secret values.');
      if (
        !exactKeys(bundle, ['version', 'source', 'secrets']) ||
        bundle.version !== 1 ||
        !contextValid(expectedSource) ||
        JSON.stringify(bundle.source) !== JSON.stringify(expectedSource) ||
        !Array.isArray(bundle.secrets) ||
        bundle.secrets.length !== names.length
      )
        fail();
      bundle.secrets.forEach((item, index) =>
        validate(item, names[index], expectedSource),
      );
      for (const item of bundle.secrets) {
        const body = {
          value: item.value,
          attributes: attributes(
            item.attributes,
            Math.floor(Date.now() / 1000),
          ),
          ...(item.contentType !== undefined
            ? { contentType: item.contentType }
            : {}),
        };
        const actual = await send(item.name, 'PUT', body);
        if (
          actual.valueHash !== item.valueHash ||
          JSON.stringify(actual.attributes) !==
            JSON.stringify(body.attributes) ||
          actual.contentType !== body.contentType
        )
          fail();
      }
    },
  };
}
