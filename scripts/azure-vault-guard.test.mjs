import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPrivateDirectory } from './local-platform.mjs';
import {
  inspectVaultGuards,
  qualifyVaultGuardPolicy,
  qualifyVaultGuards,
  validateVaultGuardEvidence,
} from './azure-vault-guard.mjs';
import * as guardApi from './azure-vault-guard.mjs';
import {
  delegationFixture,
  sealDelegation,
} from './azure-guard-test-fixture.mjs';

// The native HTTP server replaces ARM/token issuance only. Serialization, bounded
// transport, actual response inspection and guard bindings remain production code.
// Provider shapes follow the pinned Vault2024-11-01 and Policy REST contracts;
// passing these tests does not establish Azure enforcement or delegated authority.
const uuid = (digit) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

test('pure workload delegation validates independently expected complete source-shaped descriptors and every source rule', () => {
  const fixture = delegationFixture();
  const { descriptor, expectedDescriptor, guid } = fixture;
  assert.equal(
    guardApi.validateWorkloadDelegation(descriptor, { expectedDescriptor })
      .valid,
    true,
  );
  for (const rule of descriptor.allowedRules)
    for (const role of rule.roleDefinitionIds)
      for (const principal of rule.principalIds ?? [guid(999)])
        for (const actor of ['apply', 'destroy']) {
          const query = {
            expectedDescriptor,
            actor,
            action: 'Microsoft.Authorization/roleAssignments/write',
            targetScope: descriptor.scope,
            requestedRoleDefinitionId: role,
            requestedPrincipalId: principal,
            requestedPrincipalType: 'ServicePrincipal',
          };
          assert.deepEqual(
            guardApi.evaluateWorkloadDelegation(descriptor, query),
            { valid: true, allowed: true },
          );
          const {
            requestedRoleDefinitionId,
            requestedPrincipalId,
            requestedPrincipalType,
            ...deletion
          } = query;
          assert.deepEqual(
            guardApi.evaluateWorkloadDelegation(descriptor, {
              ...deletion,
              action: 'Microsoft.Authorization/roleAssignments/delete',
              resource: {
                id: `${descriptor.scope}/providers/Microsoft.Authorization/roleAssignments/${guid(800)}`,
                scope: descriptor.scope,
                roleDefinitionId: requestedRoleDefinitionId,
                principalId: requestedPrincipalId,
                principalType: requestedPrincipalType,
              },
            }),
            { valid: true, allowed: true },
          );
        }
});

test('pure workload delegation preserves ANY ServicePrincipal and denies cross-principal, User, Group and unknown roles', () => {
  const {
    descriptor,
    expectedDescriptor,
    guid,
    base,
    installer,
    actors,
    continuity,
  } = delegationFixture();
  const query = {
    expectedDescriptor,
    actor: 'apply',
    action: 'Microsoft.Authorization/roleAssignments/write',
    targetScope:
      descriptor.scope + '/providers/Microsoft.KeyVault/vaults/nested',
    requestedRoleDefinitionId: base[0].toUpperCase(),
    requestedPrincipalId: guid(999),
    requestedPrincipalType: 'serviceprincipal',
  };
  assert.deepEqual(guardApi.evaluateWorkloadDelegation(descriptor, query), {
    valid: true,
    allowed: true,
  });
  for (const change of [
    { requestedPrincipalType: 'User' },
    { requestedPrincipalType: 'Group' },
    {
      requestedRoleDefinitionId: installer,
      requestedPrincipalId: actors.destroy,
    },
    {
      requestedRoleDefinitionId: continuity.backup,
      requestedPrincipalId: actors.restore,
    },
    { requestedRoleDefinitionId: guid(999) },
  ])
    assert.deepEqual(
      guardApi.evaluateWorkloadDelegation(descriptor, { ...query, ...change }),
      { valid: true, allowed: false },
    );
});

test('pure workload delegation rejects missing independent expectations, hash drift, foreign scopes and request/resource crossover', () => {
  const { descriptor, expectedDescriptor, guid, base } = delegationFixture();
  assert.throws(
    () => guardApi.validateWorkloadDelegation(descriptor),
    /delegation/,
  );
  const query = {
    expectedDescriptor,
    actor: 'apply',
    action: 'Microsoft.Authorization/roleAssignments/write',
    targetScope: descriptor.scope,
    requestedRoleDefinitionId: base[0],
    requestedPrincipalId: guid(999),
    requestedPrincipalType: 'ServicePrincipal',
  };
  for (const change of [
    { targetScope: descriptor.scope + '-sibling' },
    { targetScope: descriptor.scope + '/../escape' },
    { requestedPrincipalId: '*' },
    { requestedPrincipalType: 'Unknown' },
    { actor: 'backup' },
    { action: 'Microsoft.Authorization/roleAssignments/read' },
    { action: 'Microsoft.Authorization/roleAssignments/delete' },
    { resource: { principalId: guid(999) } },
  ])
    assert.throws(
      () =>
        guardApi.evaluateWorkloadDelegation(descriptor, {
          ...query,
          ...change,
        }),
      /delegation/,
    );
  const changed = globalThis.structuredClone(descriptor);
  changed.assignments.apply.condition += ' ';
  assert.throws(
    () => guardApi.validateWorkloadDelegation(changed, { expectedDescriptor }),
    /delegation/,
  );
  const foreignPrincipal = globalThis.structuredClone(descriptor);
  foreignPrincipal.assignments.apply.principalId = uuid('9');
  sealDelegation(foreignPrincipal);
  assert.throws(
    () =>
      guardApi.validateWorkloadDelegation(foreignPrincipal, {
        expectedDescriptor,
      }),
    /delegation/,
  );
});

test('pure workload delegation proves exact AST equivalence and rejects unsupported grammar rather than sampling tuples', () => {
  for (const mutate of [
    (value) => value.replace('AND', 'OR'),
    (value) => value.replace('!(', '('),
    (value) => value.replace('@Request', '@Resource'),
    (value) => value.replace('PrincipalId', 'UnknownId'),
    (value) => value.replace('GuidEquals', 'StringEquals'),
    (value) => value.replace('ActionMatches', 'UnknownFunction'),
    (value) => value + ' trailing',
    (value) => value + ' /*comment*/',
    (value) => value + ' PRIVATE_DELEGATION_VALUE',
    (value) => value.replace("roleAssignments/write'", "roleAssignments/*'"),
    (value) => value.replace('ServicePrincipal', 'Service\\Principal'),
  ]) {
    const { descriptor } = delegationFixture();
    descriptor.assignments.apply.condition = mutate(
      descriptor.assignments.apply.condition,
    );
    sealDelegation(descriptor);
    const expectedDescriptor = globalThis.structuredClone(descriptor);
    assert.throws(
      () =>
        guardApi.validateWorkloadDelegation(descriptor, { expectedDescriptor }),
      (error) =>
        /delegation/.test(error.message) &&
        !error.message.includes('PRIVATE_DELEGATION_VALUE'),
    );
  }
});

test('pure workload delegation normalizes commutative rule and GUID order while retaining raw source byte binding', () => {
  const { descriptor, base } = delegationFixture();
  for (const assignment of Object.values(descriptor.assignments))
    assignment.condition = assignment.condition
      .replaceAll(base.join(', '), [...base].reverse().join(', '))
      .replaceAll('roleAssignments/write', 'ROLEASSIGNMENTS/WRITE');
  descriptor.allowedRules.reverse();
  sealDelegation(descriptor);
  assert.equal(
    guardApi.validateWorkloadDelegation(descriptor, {
      expectedDescriptor: globalThis.structuredClone(descriptor),
    }).valid,
    true,
  );
  const unrelated = delegationFixture().expectedDescriptor;
  assert.throws(
    () =>
      guardApi.validateWorkloadDelegation(descriptor, {
        expectedDescriptor: unrelated,
      }),
    /delegation/,
  );
});

test('pure workload delegation rejects descriptor/hash/semantic substitutions and duplicate or unbounded grammar', () => {
  for (const mutate of [
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.roleDefinition.actions.push('*');
    },
    (value) => {
      value.assignments.apply.conditionVersion = '1.0';
    },
    (value) => {
      value.assignments.apply.scope += '-foreign';
    },
    (value) => {
      value.assignments.apply.extra = true;
    },
    (value) => {
      value.allowedRules[1].principalIds = null;
    },
    (value) => {
      value.allowedRules[0].roleDefinitionIds.push(
        value.allowedRules[0].roleDefinitionIds[0],
      );
    },
    (value) => {
      value.allowedRules.push(value.allowedRules[0]);
    },
    (value) => {
      value.assignments.apply.condition =
        '('.repeat(40) + value.assignments.apply.condition + ')'.repeat(40);
    },
    (value) => {
      value.assignments.apply.condition += ' '.repeat(65536);
    },
    (value) => {
      value.assignments.apply.condition =
        value.assignments.apply.condition.replace(
          'GuidEquals {',
          'GuidEquals {abcdefab-0000-4000-8000-000000000100, ',
        );
    },
  ]) {
    const { descriptor, expectedDescriptor } = delegationFixture();
    mutate(descriptor);
    sealDelegation(descriptor);
    assert.throws(
      () =>
        guardApi.validateWorkloadDelegation(descriptor, { expectedDescriptor }),
      /delegation/,
    );
    assert.throws(
      () =>
        guardApi.validateWorkloadDelegation(descriptor, {
          expectedDescriptor: globalThis.structuredClone(descriptor),
        }),
      /delegation/,
    );
  }
});

test('pure workload delegation evaluates only actual delete resource fields and rejects request-field overrides', () => {
  const { descriptor, expectedDescriptor, guid, installer, actors } =
    delegationFixture();
  const query = {
    expectedDescriptor,
    actor: 'destroy',
    action: 'MICROSOFT.AUTHORIZATION/ROLEASSIGNMENTS/DELETE',
    targetScope: descriptor.scope.toUpperCase(),
    resource: {
      id: `${descriptor.scope}/providers/Microsoft.Authorization/roleAssignments/${guid(900)}`,
      scope: descriptor.scope,
      roleDefinitionId: installer,
      principalId: actors.destroy,
      principalType: 'ServicePrincipal',
    },
  };
  assert.deepEqual(guardApi.evaluateWorkloadDelegation(descriptor, query), {
    valid: true,
    allowed: false,
  });
  query.resource.principalId = actors.apply;
  assert.deepEqual(guardApi.evaluateWorkloadDelegation(descriptor, query), {
    valid: true,
    allowed: true,
  });
  assert.throws(
    () =>
      guardApi.evaluateWorkloadDelegation(descriptor, {
        ...query,
        requestedPrincipalId: actors.apply,
      }),
    /delegation/,
  );
  query.resource.scope += '-sibling';
  assert.throws(
    () => guardApi.evaluateWorkloadDelegation(descriptor, query),
    /delegation/,
  );
});

test('pure workload delegation rejects every individual Boolean operator and NOT mutation in the actual source condition', () => {
  const fixture = delegationFixture();
  const original = fixture.descriptor.assignments.apply.condition;
  for (const match of original.matchAll(/\bAND\b|\bOR\b|!/g)) {
    const descriptor = globalThis.structuredClone(fixture.descriptor);
    const replacement =
      match[0] === 'AND' ? 'OR' : match[0] === 'OR' ? 'AND' : '';
    descriptor.assignments.apply.condition =
      original.slice(0, match.index) +
      replacement +
      original.slice(match.index + match[0].length);
    sealDelegation(descriptor);
    assert.throws(
      () =>
        guardApi.validateWorkloadDelegation(descriptor, {
          expectedDescriptor: globalThis.structuredClone(descriptor),
        }),
      /delegation/,
    );
  }
});

async function fixture(t) {
  const config = {
    version: 1,
    environment: 'learning',
    generation: 'test1234',
    tenantId: uuid('1'),
    subscriptionId: uuid('2'),
    gitRevision: 'a'.repeat(40),
    region: 'westeurope',
  };
  const subscription = `/subscriptions/${config.subscriptionId}`;
  const scopes = {
    recovery: `${subscription}/resourceGroups/learning-foundation`,
    workload: `${subscription}/resourceGroups/learning-workload`,
  };
  const definitionId = `${subscription}/providers/Microsoft.Authorization/policyDefinitions/learning-vault-guard`;
  const projection = {
    mode: 'All',
    parameters: {
      expectedTenantId: { type: 'String' },
      exactVaultName: { type: 'String' },
    },
    policyRule: {
      if: { field: 'type', equals: 'Microsoft.KeyVault/vaults' },
      then: { effect: 'Deny' },
    },
  };
  const guard = {
    definition_id: definitionId,
    definition_sha256: hash(projection),
    assignment_ids: Object.fromEntries(
      Object.entries(scopes).map(([family, scope]) => [
        family,
        `${scope}/providers/Microsoft.Authorization/policyAssignments/learning-${family}-vault-guard`,
      ]),
    ),
    scope_ids: scopes,
    recovery_vault_id: `${scopes.recovery}/providers/Microsoft.KeyVault/vaults/errecfixture`,
    workload_vault_name_prefix: 'erw',
    parameters: {
      recovery: {
        expectedTenantId: { value: config.tenantId },
        exactVaultName: { value: 'errecfixture' },
      },
      workload: {
        expectedTenantId: { value: config.tenantId },
        exactVaultName: { value: '' },
      },
    },
  };
  const vaults = Object.fromEntries(
    Object.entries(scopes).map(([family, scope]) => [
      family,
      {
        id:
          family === 'recovery'
            ? guard.recovery_vault_id
            : `${scope}/providers/Microsoft.KeyVault/vaults/erwfixture`,
        name: family === 'recovery' ? 'errecfixture' : 'erwfixture',
        type: 'Microsoft.KeyVault/vaults',
        location: 'westeurope',
        etag: '"v1"',
        tags: {
          application: 'equipment-reservations',
          environment: config.environment,
        },
        properties: {
          tenantId: config.tenantId,
          sku: { family: 'A', name: 'standard' },
          enableRbacAuthorization: true,
          enablePurgeProtection: true,
          enableSoftDelete: true,
          accessPolicies: [],
          enabledForDeployment: false,
          enabledForDiskEncryption: false,
          enabledForTemplateDeployment: false,
          publicNetworkAccess: 'Enabled',
          networkAcls: {
            defaultAction: 'Deny',
            bypass: 'None',
            ipRules: [],
            virtualNetworkRules: [],
          },
          provisioningState: 'Succeeded',
        },
      },
    ]),
  );
  const objects = new Map([
    [
      definitionId,
      { id: definitionId, properties: { ...projection, policyType: 'Custom' } },
    ],
    ...Object.entries(scopes).map(([family, scope]) => [
      guard.assignment_ids[family],
      {
        id: guard.assignment_ids[family],
        properties: {
          scope,
          policyDefinitionId: definitionId,
          enforcementMode: 'Default',
          parameters: guard.parameters[family],
          notScopes: [],
        },
      },
    ]),
    ...Object.values(vaults).map((vault) => [vault.id, vault]),
  ]);
  guard.producer_principal_ids = { human: uuid('3'), apply: uuid('4') };
  guard.evidence_storage_account_name = 'fixturefoundation';
  guard.evidence_container_names = {
    human: 'guard-evidence',
    apply: 'guard-apply-evidence',
  };
  const accountId = `${scopes.recovery}/providers/Microsoft.Storage/storageAccounts/${guard.evidence_storage_account_name}`;
  objects.set(accountId, {
    id: accountId,
    properties: {
      allowSharedKeyAccess: false,
      allowBlobPublicAccess: false,
      minimumTlsVersion: 'TLS1_2',
    },
  });
  for (const container of ['guard-evidence', 'guard-apply-evidence']) {
    const id = `${accountId}/blobServices/default/containers/${container}`;
    objects.set(id, { id, properties: { publicAccess: 'None' } });
  }
  const actions = [
    'Microsoft.KeyVault/vaults/read',
    'Microsoft.KeyVault/vaults/write',
    'Microsoft.Resources/tags/read',
    'Microsoft.Resources/tags/write',
  ].sort();
  guard.role_definitions = Object.fromEntries(
    ['recovery', 'workload'].map((family) => {
      const id = `${scopes[family]}/providers/Microsoft.Authorization/roleDefinitions/${uuid(family === 'recovery' ? '5' : '6')}`;
      objects.set(id, {
        id,
        properties: {
          roleType: 'CustomRole',
          permissions: [
            { actions, notActions: [], dataActions: [], notDataActions: [] },
          ],
          assignableScopes: [scopes[family]],
        },
      });
      return [
        `${family}_network`,
        { id, actions, sha256: hash({ actions, dataActions: [] }) },
      ];
    }),
  );
  const contributorId = `${subscription}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`;
  objects.set(contributorId, {
    id: contributorId,
    properties: {
      roleType: 'BuiltInRole',
      roleName: 'Contributor',
      permissions: [
        {
          actions: ['*'],
          notActions: ['Microsoft.Authorization/*/Write'],
          dataActions: [],
          notDataActions: [],
        },
      ],
    },
  });
  const blobRoleId = `${subscription}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`;
  objects.set(blobRoleId, {
    id: blobRoleId,
    properties: {
      permissions: [
        {
          actions: [],
          notActions: [],
          dataActions: [
            'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/*',
          ],
          notDataActions: [],
        },
      ],
    },
  });
  const claims = {
    oid: uuid('3'),
    tid: config.tenantId,
    scp: 'user_impersonation',
    aud: 'https://management.azure.com/',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const accessToken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const applyClaims = {
    ...claims,
    oid: uuid('4'),
    idtyp: 'app',
    appid: uuid('7'),
  };
  delete applyClaims.scp;
  const applyToken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(applyClaims)).toString('base64url')}.signature`;
  const storageToken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, aud: 'https://storage.azure.com/' })).toString('base64url')}.signature`;
  const applyStorageToken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...applyClaims, aud: 'https://storage.azure.com/' })).toString('base64url')}.signature`;
  const requests = [];
  const state = {
    objects,
    exemptions: [],
    fail: false,
    writeMode: 'deny',
    blobs: new Map(),
    deleted: new Map(),
    applyToken,
    applyCredentials: async (resource) =>
      resource === 'https://storage.azure.com/'
        ? applyStorageToken
        : applyToken,
    writerDrift: false,
    leaseId: uuid('9'),
    leaseRecord: {
      owner: uuid('9'),
      environment: config.environment,
      revision: config.gitRevision,
      operation: 'apply',
      issued: new Date().toISOString(),
      expires: new Date(Date.now() + 3600000).toISOString(),
    },
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({
      method: request.method,
      path: url.pathname,
      version: url.searchParams.get('api-version'),
    });
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('x-ms-request-id', randomUUID());
    response.setHeader('x-ms-correlation-request-id', randomUUID());
    if (
      !(
        /^\/(guard-evidence|guard-apply-evidence|operations)\//.test(
          url.pathname,
        )
          ? [storageToken, applyStorageToken]
          : [accessToken, applyToken]
      ).some((value) => request.headers.authorization === `Bearer ${value}`)
    ) {
      response.writeHead(401);
      response.end('{}');
      return;
    }
    if (state.fail) {
      response.writeHead(500);
      response.end(
        JSON.stringify({ error: { message: 'PRIVATE_VAULT_PROVIDER_VALUE' } }),
      );
      return;
    }
    if (state.canaries?.has(url.pathname)) {
      const object = state.canaries.get(url.pathname);
      if (request.method === 'GET') {
        if (
          state.canaryPostFailure &&
          state.canaryWrites?.some((entry) => entry.id === url.pathname)
        ) {
          response.writeHead(500);
          response.end('{"error":{"message":"PRIVATE_POST_READ_VALUE"}}');
          return;
        }
        if (object === null) response.writeHead(404);
        response.end(JSON.stringify(object));
        return;
      }
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      state.canaryWrites ??= [];
      state.canaryWrites.push({ id: url.pathname, body: JSON.parse(text) });
      if (state.canaryMutation && object)
        object.properties.displayName = 'changed';
      response.writeHead(state.canaryStatus ?? 403);
      response.end(
        JSON.stringify({
          error: {
            code: state.canaryCode ?? 'AuthorizationFailed',
            message: `The client lacks action '${state.canaryAction ?? `Microsoft.Authorization/${url.pathname.includes('/roleAssignments/') ? 'roleAssignments' : url.pathname.includes('/policyExemptions/') ? 'policyExemptions' : url.pathname.includes('/policyAssignments/') ? 'policyAssignments' : 'policyDefinitions'}/write`}'. PRIVATE_CANARY_VALUE`,
          },
        }),
      );
      return;
    }
    if (url.pathname === `/operations/operations/${config.environment}.json`) {
      if (
        request.method === 'PUT' &&
        url.searchParams.get('comp') === 'lease'
      ) {
        const owned =
          request.headers['x-ms-lease-id'] === state.leaseId &&
          !state.leaseLost;
        response.writeHead(owned ? 200 : 412);
        response.end('{}');
        return;
      }
      response.end(JSON.stringify(state.leaseRecord));
      return;
    }
    if (/^\/(guard-evidence|guard-apply-evidence)\//.test(url.pathname)) {
      const container = url.pathname.split('/')[1];
      if (
        url.pathname.includes('/current/') &&
        url.searchParams.get('comp') === 'lease'
      ) {
        const action = request.headers['x-ms-lease-action'];
        const leaseId = request.headers['x-ms-lease-id'];
        if (action === 'acquire' && !state.pointerLease) {
          state.pointerLease = request.headers['x-ms-proposed-lease-id'];
          response.setHeader('x-ms-lease-id', state.pointerLease);
          response.writeHead(201);
        } else if (action === 'release' && leaseId === state.pointerLease) {
          state.pointerLease = null;
          response.writeHead(state.pointerReleaseFailure ? 500 : 200);
        } else response.writeHead(412);
        response.end('{}');
        return;
      }
      if (request.method === 'PUT') {
        const human =
          request.headers.authorization === `Bearer ${storageToken}`;
        if ((container === 'guard-evidence') !== human) {
          response.writeHead(403);
          response.end('{}');
          return;
        }
        const exists = state.blobs.has(url.pathname);
        const update =
          url.pathname.includes('/current/') &&
          exists &&
          request.headers['if-match'] === '"pointer-v1"' &&
          request.headers['x-ms-lease-id'] === state.pointerLease &&
          !state.pointerConflict;
        if (!update && (request.headers['if-none-match'] !== '*' || exists)) {
          response.writeHead(412);
          response.end('{}');
          return;
        }
        let text = '';
        for await (const chunk of request) text += chunk.toString();
        state.blobs.set(url.pathname, text);
        response.writeHead(201);
        response.end('{}');
        return;
      }
      const stored = state.blobs.get(url.pathname);
      if (stored && url.pathname.includes('/current/'))
        response.setHeader('ETag', '"pointer-v1"');
      response.writeHead(stored ? 200 : 404);
      response.end(stored ?? '{}');
      return;
    }
    if (url.pathname.endsWith('/roleAssignments')) {
      const scope = url.pathname.slice(
        0,
        -'/providers/Microsoft.Authorization/roleAssignments'.length,
      );
      const isContainer = scope.includes('/containers/');
      const human = scope.endsWith('/guard-evidence');
      response.end(
        JSON.stringify({
          value: [
            {
              id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${uuid('8')}`,
              properties: {
                scope,
                principalId: state.writerDrift
                  ? uuid('9')
                  : isContainer
                    ? human
                      ? uuid('3')
                      : uuid('4')
                    : uuid('4'),
                principalType: human ? 'User' : 'ServicePrincipal',
                roleDefinitionId: isContainer ? blobRoleId : contributorId,
                condition: null,
              },
            },
          ],
        }),
      );
      return;
    }
    if (request.method === 'DELETE') {
      const owned = state.objects.get(url.pathname);
      if (
        !owned?.tags?.['equipment-vault-guard-probe'] ||
        state.deleteFailure
      ) {
        response.writeHead(403);
        response.end('{}');
        return;
      }
      state.objects.delete(url.pathname);
      const deletedId = `${subscription}/providers/Microsoft.KeyVault/locations/${owned.location}/deletedVaults/${owned.name}`;
      state.deleted.set(deletedId, {
        id: deletedId,
        name: owned.name,
        properties: {
          vaultId: state.softDeleteMismatch ? vaults.recovery.id : owned.id,
          location: owned.location,
        },
      });
      response.writeHead(204);
      response.end();
      return;
    }
    if (
      url.pathname.endsWith('/accessPolicies/add') &&
      request.method === 'PUT'
    ) {
      for await (const chunk of request) void chunk;
      response.writeHead(403);
      response.end(
        JSON.stringify({
          error: {
            code: state.applyChildRbac
              ? 'AuthorizationFailed'
              : 'RequestDisallowedByPolicy',
            message: state.applyChildRbac
              ? "The client lacks action 'Microsoft.KeyVault/vaults/accessPolicies/write'. PRIVATE_CHILD_PROVIDER_VALUE"
              : 'PRIVATE_CHILD_PROVIDER_VALUE',
            additionalInfo: [
              {
                type: 'PolicyViolation',
                info: {
                  policyAssignmentId: guard.assignment_ids.workload,
                  policyDefinitionId: guard.definition_id,
                },
              },
            ],
          },
        }),
      );
      return;
    }
    if (request.method !== 'GET') {
      let vault = state.objects.get(url.pathname);
      if (
        !vault &&
        request.method === 'PUT' &&
        url.pathname.startsWith(
          `${scopes.workload}/providers/Microsoft.KeyVault/vaults/`,
        )
      ) {
        let text = '';
        for await (const chunk of request) text += chunk.toString();
        const body = JSON.parse(text);
        vault = {
          id: url.pathname,
          name: url.pathname.split('/').at(-1),
          type: 'Microsoft.KeyVault/vaults',
          ...body,
          properties: { ...body.properties, provisioningState: 'Succeeded' },
          systemData: {
            createdBy: uuid('3'),
            createdAt: new Date().toISOString(),
            createdByType: 'User',
          },
        };
        state.objects.set(url.pathname, vault);
        response.writeHead(201);
        response.end(JSON.stringify(vault));
        return;
      }
      if (!vault || !['PUT', 'PATCH'].includes(request.method)) {
        response.writeHead(405);
        response.end('{}');
        return;
      }
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      const body = JSON.parse(text);
      const p = body.properties;
      const invalid =
        !p ||
        p.tenantId !== config.tenantId ||
        p.enableRbacAuthorization !== true ||
        p.enablePurgeProtection !== true ||
        p.enableSoftDelete !== true ||
        p.accessPolicies?.length ||
        [
          'enabledForDeployment',
          'enabledForDiskEncryption',
          'enabledForTemplateDeployment',
        ].some((name) => p[name] !== false) ||
        p.publicNetworkAccess !== 'Enabled' ||
        p.networkAcls?.defaultAction !== 'Deny' ||
        p.networkAcls?.bypass !== 'None';
      if (invalid) {
        const family =
          vault.id === vaults.recovery.id ? 'recovery' : 'workload';
        if (state.writeMode === 'accepted' || state.writeMode === 'mutation')
          vault.properties = { ...vault.properties, ...p };
        if (state.writeMode === 'accepted') {
          response.writeHead(200);
          response.end(JSON.stringify(vault));
          return;
        }
        response.writeHead(403);
        response.end(
          JSON.stringify({
            error: {
              code:
                state.writeMode === 'rbac' ||
                (state.applyToggleRbac && p.enableRbacAuthorization !== true)
                  ? 'AuthorizationFailed'
                  : 'RequestDisallowedByPolicy',
              message:
                state.applyToggleRbac && p.enableRbacAuthorization !== true
                  ? "The client lacks action 'Microsoft.Authorization/roleAssignments/write'. PRIVATE_VAULT_PROVIDER_VALUE"
                  : 'PRIVATE_VAULT_PROVIDER_VALUE',
              additionalInfo: [
                {
                  type: 'PolicyViolation',
                  info: {
                    policyAssignmentId:
                      state.writeMode === 'wrong-policy'
                        ? '/wrong/assignment'
                        : guard.assignment_ids[family],
                    policyDefinitionId: guard.definition_id,
                  },
                },
              ],
            },
          }),
        );
        return;
      }
      vault.properties = { ...vault.properties, ...p };
      if (
        state.failCleanup &&
        vault.tags?.['equipment-vault-guard'] &&
        !body.tags?.['equipment-vault-guard']
      ) {
        response.writeHead(403);
        response.end(
          JSON.stringify({
            error: {
              code: 'AuthorizationFailed',
              message: 'PRIVATE_CLEANUP_VALUE',
            },
          }),
        );
        return;
      }
      vault.tags = body.tags ?? vault.tags;
      if (state.admissionChange && body.tags?.['equipment-vault-guard'])
        vault.tags.unrelated = 'PRIVATE_UNRELATED_VALUE';
      response.writeHead(200);
      response.end(JSON.stringify(vault));
      if (body.tags?.['equipment-vault-guard']) state.afterAdmission?.();
      return;
    }
    const body = url.pathname.endsWith('/policyExemptions')
      ? { value: state.exemptions }
      : url.pathname.endsWith('/permissions')
        ? {
            value: [
              {
                actions: ['*'],
                notActions: [],
                dataActions: [],
                notDataActions: [],
              },
            ],
          }
        : (state.objects.get(url.pathname) ??
          state.deleted.get(url.pathname) ??
          (url.pathname.includes('/roleDefinitions/')
            ? [...state.objects.values()].find(
                (entry) =>
                  entry.id?.includes('/roleDefinitions/') &&
                  entry.id.split('/').at(-1) === url.pathname.split('/').at(-1),
              )
            : undefined));
    response.writeHead(body ? 200 : 404);
    response.end(
      JSON.stringify(body ?? { error: { code: 'ResourceNotFound' } }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const options = {
    config,
    guard,
    workloadVaultId: vaults.workload.id,
    sourceClosureHash: 'b'.repeat(64),
    token: async (resource) =>
      resource === 'https://storage.azure.com/' ? storageToken : accessToken,
    armOrigin: `http://127.0.0.1:${server.address().port}`,
    blobOrigin: `http://127.0.0.1:${server.address().port}`,
    admissionCidr: '203.0.113.7/32',
    operation: { leaseId: state.leaseId },
    outputs: {
      operation_storage_account_name: 'fixturefoundation',
      recovery_storage_account_name: 'fixturefoundation',
      operation_container_name: 'operations',
    },
    request: async (url, init) => {
      if (
        !String(url).startsWith(
          'https://fixturefoundation.blob.core.windows.net/operations/',
        )
      )
        throw new Error('Unexpected external operation boundary');
      return globalThis.fetch(
        String(url).replace(
          'https://fixturefoundation.blob.core.windows.net',
          `http://127.0.0.1:${server.address().port}`,
        ),
        init,
      );
    },
  };
  return { options, state, requests, vaults, projection };
}

test('durable human family pointer is producer-owned fixed-path transport and updates under exact lease plus ETag', async (t) => {
  const { options, state } = await fixture(t);
  options.purpose = 'human-policy-family';
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  const published = await qualifyVaultGuards({
    ...options,
    workloadVaultId: undefined,
  });
  const familyHandle = {
    purpose: published.purpose,
    reference: published.reference,
    digest: published.digest,
  };
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle,
  });
  const selected = await guardApi.resolveVaultGuardFamily(options);
  assert.deepEqual(selected.familyHandle, familyHandle);
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle,
  });
  assert.equal(state.pointerLease, null);
  const pointer = JSON.parse(
    state.blobs.get(
      `/guard-evidence/${options.guard.current_family_reference}`,
    ),
  );
  assert.equal(pointer.generation, null);
  assert.equal(pointer.activationHandle, null);
  assert.equal(
    pointer.producerPrincipalId,
    options.guard.producer_principal_ids.human,
  );
});

test('human pointer ETag race fails and releases its exact owned lease without leaking provider bodies', async (t) => {
  const { options, state } = await fixture(t);
  options.purpose = 'human-policy-family';
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  const published = await qualifyVaultGuards({
    ...options,
    workloadVaultId: undefined,
  });
  const familyHandle = {
    purpose: published.purpose,
    reference: published.reference,
    digest: published.digest,
  };
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle,
  });
  state.pointerConflict = true;
  await assert.rejects(
    guardApi.publishVaultGuardReference({
      ...options,
      mode: 'family',
      familyHandle,
    }),
    (error) => /pointer.*412/.test(error.message),
  );
  assert.equal(state.pointerLease, null);
});

for (const drift of ['source', 'policy']) {
  test(`fresh family qualification replaces stale ${drift} pointer while old evidence stays operationally invalid`, async (t) => {
    const { options, state, projection } = await fixture(t);
    options.guard.current_family_reference = `current/${options.config.environment}.json`;
    const initial = await qualifyVaultGuards({
      ...options,
      purpose: 'human-policy-family',
      workloadVaultId: undefined,
    });
    await guardApi.publishVaultGuardReference({
      ...options,
      mode: 'family',
      familyHandle: initial,
    });
    if (drift === 'source') options.sourceClosureHash = 'c'.repeat(64);
    else {
      projection.parameters.reviewedRevision = {
        type: 'String',
        defaultValue: 'v2',
      };
      options.guard.definition_sha256 = hash(projection);
    }
    await assert.rejects(
      guardApi.resolveVaultGuardFamily(options),
      /family.*binding|tuple drift/,
    );
    // Model provider expiry of this fixture's disposable probe tombstone; the
    // helper cannot purge or immediately reuse a soft-deleted Azure vault.
    const deletedProbe = `/subscriptions/${options.config.subscriptionId}/providers/Microsoft.KeyVault/locations/${options.config.region}/deletedVaults/${initial.record.probe.vaultId.split('/').at(-1)}`;
    assert.ok(state.deleted.delete(deletedProbe));
    const fresh = await qualifyVaultGuards({
      ...options,
      purpose: 'human-policy-family',
      workloadVaultId: undefined,
    });
    await guardApi.publishVaultGuardReference({
      ...options,
      mode: 'family',
      familyHandle: fresh,
    });
    assert.deepEqual(await guardApi.resolveVaultGuardFamily(options), {
      familyHandle: {
        purpose: fresh.purpose,
        reference: fresh.reference,
        digest: fresh.digest,
      },
    });
    await assert.rejects(
      validateVaultGuardEvidence({
        ...options,
        purpose: 'human-policy-family',
        handle: initial,
      }),
      /family.*binding|tuple drift/,
    );
    assert.equal(state.pointerLease, null);
  });
}

async function replacementFamilyFixture(t) {
  const value = await fixture(t);
  const { options, state } = value;
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  const qualify = () =>
    qualifyVaultGuards({
      ...options,
      purpose: 'human-policy-family',
      workloadVaultId: undefined,
    });
  const initial = await qualify();
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle: initial,
  });
  // The external provider has expired this exact prior probe's retention.
  assert.ok(
    state.deleted.delete(
      `/subscriptions/${options.config.subscriptionId}/providers/Microsoft.KeyVault/locations/${options.config.region}/deletedVaults/${initial.record.probe.vaultId.split('/').at(-1)}`,
    ),
  );
  const fresh = await qualify();
  return { ...value, initial, fresh };
}

for (const fault of [
  'tampered-digest',
  'foreign-environment',
  'foreign-producer',
  'foreign-handle',
  'future-issued',
]) {
  test(`replacement rejects ${fault} historical pointer evidence without changing pointer`, async (t) => {
    const { options, state, initial, fresh } =
      await replacementFamilyFixture(t);
    const pointerPath = `/guard-evidence/${options.guard.current_family_reference}`;
    const oldPath = `/guard-evidence/${initial.reference}`;
    const pointer = JSON.parse(state.blobs.get(pointerPath));
    const historical = JSON.parse(state.blobs.get(oldPath));
    if (fault === 'tampered-digest')
      historical.sourceClosureHash = 'f'.repeat(64);
    if (fault === 'foreign-environment') historical.environment = 'foreign';
    if (fault === 'foreign-producer')
      historical.producerPrincipalId = uuid('9');
    if (fault === 'future-issued')
      historical.issuedAt = new Date(Date.now() + 60000).toISOString();
    if (fault === 'foreign-handle')
      pointer.familyHandle.reference = `generation/${historical.qualificationId}.json`;
    if (fault !== 'tampered-digest')
      pointer.familyHandle.digest = hash(historical);
    state.blobs.set(oldPath, JSON.stringify(historical));
    state.blobs.set(pointerPath, JSON.stringify(pointer));
    const prior = state.blobs.get(pointerPath);
    await assert.rejects(
      guardApi.publishVaultGuardReference({
        ...options,
        mode: 'family',
        familyHandle: fresh,
      }),
      /historical family pointer integrity|configured producer identity|pointer family handle/,
    );
    assert.equal(state.blobs.get(pointerPath), prior);
    assert.equal(state.pointerLease, null);
  });
}

test('a newer published family cannot be rolled back to an older otherwise current family', async (t) => {
  const { options, state, initial, fresh } = await replacementFamilyFixture(t);
  assert.ok(
    Date.parse(fresh.record.issuedAt) > Date.parse(initial.record.issuedAt),
  );
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle: fresh,
  });
  await assert.rejects(
    guardApi.publishVaultGuardReference({
      ...options,
      mode: 'family',
      familyHandle: initial,
    }),
    /pointer rollback/,
  );
  assert.equal(
    (await guardApi.resolveVaultGuardFamily(options)).familyHandle.digest,
    fresh.digest,
  );
  assert.equal(state.pointerLease, null);
});

test('pointer primary conditional failure and owned lease cleanup failure remain separately diagnosable', async (t) => {
  const { options, state } = await fixture(t);
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  const published = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  const input = {
    ...options,
    mode: 'family',
    familyHandle: {
      purpose: published.purpose,
      reference: published.reference,
      digest: published.digest,
    },
  };
  await guardApi.publishVaultGuardReference(input);
  state.pointerConflict = true;
  state.pointerReleaseFailure = true;
  await assert.rejects(guardApi.publishVaultGuardReference(input), (error) =>
    /pointer conditional publication.*412.*Cleanup:.*pointer lease release.*500/.test(
      error.message,
    ),
  );
});

test('pointer resolution rejects substituted producer or tuple and never lists for discovery', async (t) => {
  const { options, state, requests } = await fixture(t);
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  const published = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  await guardApi.publishVaultGuardReference({
    ...options,
    mode: 'family',
    familyHandle: published,
  });
  const path = `/guard-evidence/${options.guard.current_family_reference}`;
  const pointer = JSON.parse(state.blobs.get(path));
  pointer.tupleHash = 'f'.repeat(64);
  state.blobs.set(path, JSON.stringify(pointer));
  await assert.rejects(
    guardApi.resolveVaultGuardFamily(options),
    /pointer current family tuple/,
  );
  pointer.tupleHash = published.record.tupleHash;
  pointer.producerPrincipalId = uuid('9');
  state.blobs.set(path, JSON.stringify(pointer));
  await assert.rejects(
    guardApi.resolveVaultGuardFamily(options),
    /configured producer identity/,
  );
  assert.ok(requests.every((entry) => entry.path !== '/guard-evidence'));
});

test('ordinary activation pointer cannot be discovered from consumption or published without completed activation records', async (t) => {
  const { options, state } = await fixture(t);
  options.guard.current_activation_reference = `current/${options.config.environment}/${options.config.generation}.json`;
  options.token = state.applyCredentials;
  await assert.rejects(
    guardApi.resolveVaultGuardActivation(options),
    /pointer activation not published/,
  );
  const id = uuid('7');
  await assert.rejects(
    guardApi.publishVaultGuardReference({
      ...options,
      mode: 'ordinary-activation',
      familyHandle: {
        purpose: 'human-policy-family',
        reference: `policy/${id}.json`,
        digest: 'a'.repeat(64),
      },
      generationHandle: {
        purpose: 'workload-generation',
        reference: `generation/${id}.json`,
        digest: 'b'.repeat(64),
      },
      consumptionHandle: {
        purpose: 'guard-generation-consumption',
        reference: `consumed/${id}.json`,
        digest: 'c'.repeat(64),
      },
      bindingHandle: {
        purpose: 'guard-plan-binding',
        reference: `plan-bindings/${id}.json`,
        digest: 'd'.repeat(64),
      },
      activationHandle: {
        reference: `activation/${options.config.generation}/${id}.json`,
        digest: 'e'.repeat(64),
      },
    }),
    /pointer.*generation/,
  );
  assert.equal(state.blobs.size, 0);
});

async function canaryFixture(t) {
  const fixtureState = await fixture(t);
  const principalIds = Object.fromEntries(
    ['plan', 'apply', 'destroy', 'backup', 'restore', 'reaper'].map(
      (actor, i) => [actor, uuid(String(i + 3))],
    ),
  );
  principalIds.apply = uuid('4');
  fixtureState.options.guard.canary =
    guardApi.createVaultGuardCanaryDescriptors({
      ...fixtureState.options,
      principalIds,
    });
  const descriptor = fixtureState.options.guard.canary;
  fixtureState.state.canaries = new Map(
    [
      descriptor.definition,
      descriptor.assignment,
      descriptor.exemption,
      descriptor.role_assignments.apply,
    ].map((entry) => [
      entry.id,
      {
        id: entry.id,
        properties: globalThis.structuredClone(entry.properties),
      },
    ]),
  );
  fixtureState.state.canaries.set(descriptor.role_assignments.apply.id, null);
  fixtureState.state.canaries.set(
    `${descriptor.assignment.id}/providers/Microsoft.Authorization/roleDefinitions/${descriptor.role.id.split('/').at(-1)}`,
    {
      id: descriptor.role.id,
      properties: {
        permissions: [
          {
            actions: descriptor.role.actions,
            notActions: [],
            dataActions: [],
            notDataActions: [],
          },
        ],
        assignableScopes: descriptor.role.assignableScopes,
      },
    },
  );
  fixtureState.options.token = fixtureState.state.applyCredentials;
  return fixtureState;
}

test('fixed inert G3 canary requests prove only exact canary scope denials without active guard mutations', async (t) => {
  const { options, state, requests } = await canaryFixture(t);
  const result = await guardApi.verifyVaultGuardCanaryDenials({
    ...options,
    actor: 'apply',
  });
  assert.equal(result.boundary, 'canary-scopes-only');
  assert.equal(result.cases.length, 4);
  assert.equal(state.canaryWrites.length, 4);
  assert.ok(
    requests
      .filter((entry) => entry.method === 'PUT')
      .every((entry) => state.canaries.has(entry.path)),
  );
  const definition = options.guard.canary.definition;
  assert.deepEqual(definition.properties.policyRule, {
    if: { field: 'type', equals: 'EquipmentQualification.Never/resources' },
    then: { effect: 'audit' },
  });
  for (const entry of state.canaryWrites)
    assert.deepEqual(entry.body, {
      properties:
        state.canaries.get(entry.id)?.properties ??
        options.guard.canary.role_assignments.apply.properties,
    });
});

for (const scenario of [
  'accepted',
  'wrong-code',
  'wrong-action',
  'changed',
  'substituted-target',
  'unsafe-actual-role',
]) {
  test(`G3 canary rejects ${scenario} with no passing proof or active guard write`, async (t) => {
    const { options, state, requests } = await canaryFixture(t);
    if (scenario === 'accepted') state.canaryStatus = 200;
    if (scenario === 'wrong-code')
      state.canaryCode = 'RequestDisallowedByPolicy';
    if (scenario === 'wrong-action')
      state.canaryAction = 'Microsoft.KeyVault/vaults/write';
    if (scenario === 'changed') state.canaryMutation = true;
    if (scenario === 'substituted-target')
      options.guard.canary.definition.id = options.guard.definition_id;
    if (scenario === 'unsafe-actual-role') {
      const role = Array.from(state.canaries.values()).find(
        (entry) => entry?.properties?.permissions,
      );
      role.properties.permissions[0].actions = ['*'];
    }
    await assert.rejects(
      guardApi.verifyVaultGuardCanaryDenials({ ...options, actor: 'apply' }),
      (error) =>
        /canary/.test(error.message) &&
        !error.message.includes('PRIVATE_CANARY_VALUE'),
    );
    assert.ok(
      requests
        .filter((entry) => entry.method === 'PUT')
        .every((entry) => state.canaries.has(entry.path)),
    );
    if (scenario === 'substituted-target') assert.equal(requests.length, 0);
  });
}

test('unexpected canary acceptance preserves HTTP200 together with failed unchanged-state verification', async (t) => {
  const { options, state } = await canaryFixture(t);
  state.canaryStatus = 200;
  state.canaryPostFailure = true;
  await assert.rejects(
    guardApi.verifyVaultGuardCanaryDenials({ ...options, actor: 'apply' }),
    (error) =>
      /canary.*200.*Verification:.*500/.test(error.message) &&
      !error.message.includes('PRIVATE_'),
  );
});

test('public guard pointer and canary APIs suppress arbitrary token-provider errors', async (t) => {
  const { options } = await canaryFixture(t);
  options.guard.current_family_reference = `current/${options.config.environment}.json`;
  options.guard.current_activation_reference = `current/${options.config.environment}/${options.config.generation}.json`;
  options.token = async () => {
    throw new Error('PRIVATE_TOKEN_PROVIDER_VALUE');
  };
  for (const action of [
    () =>
      guardApi.verifyVaultGuardCanaryDenials({ ...options, actor: 'apply' }),
    () => guardApi.resolveVaultGuardFamily(options),
    () => guardApi.resolveVaultGuardActivation(options),
    () => guardApi.publishVaultGuardReference({ ...options, mode: 'family' }),
  ])
    await assert.rejects(
      action,
      (error) => !error.message.includes('PRIVATE_TOKEN_PROVIDER_VALUE'),
    );
});

test('guard inspection reads both actual assignments, definition, exemptions and strict vault invariants through ARM', async (t) => {
  const { options, requests } = await fixture(t);
  const observed = await inspectVaultGuards(options);
  assert.equal(observed.guards.length, 2);
  assert.deepEqual(observed.guards.map((guard) => guard.family).sort(), [
    'recovery',
    'workload',
  ]);
  assert.ok(
    requests.some(
      (request) => request.path === options.guard.assignment_ids.recovery,
    ),
  );
  assert.ok(
    requests.some(
      (request) => request.path === options.guard.assignment_ids.workload,
    ),
  );
  assert.equal(
    requests.filter((request) => request.path.endsWith('/policyExemptions'))
      .length,
    2,
  );
  assert.ok(requests.every((request) => request.method === 'GET'));
});

test('human publisher owns the fixed probe lifecycle and creates private family evidence reusable without an age-based human login', async (t) => {
  const { options, state, requests } = await fixture(t);
  const published = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  assert.equal(published.purpose, 'human-policy-family');
  assert.equal(published.record.expiresAt, null);
  assert.equal(state.blobs.size, 1);
  assert.ok([...state.blobs.keys()][0].startsWith('/guard-evidence/policy/'));
  const deletion = requests.find((request) => request.method === 'DELETE');
  assert.ok(
    deletion?.path.startsWith(
      `${options.guard.scope_ids.workload}/providers/Microsoft.KeyVault/vaults/erw`,
    ),
  );
  assert.ok(!state.objects.has(deletion.path));
  assert.ok(
    requests.every((request) => !request.path.toLowerCase().includes('/purge')),
  );
  const proof = await validateVaultGuardEvidence({
    ...options,
    purpose: 'human-policy-family',
    handle: published,
    now: () => Date.now() + 30 * 24 * 60 * 60000,
    token: state.applyCredentials,
  });
  assert.equal(proof.evidence_sha256, published.digest);
  assert.equal(proof.definition_sha256, options.guard.definition_sha256);
});

test('private family evidence cannot substitute producer, container, digest, matrix or live policy and role state', async (t) => {
  const { options, state } = await fixture(t);
  const family = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  const path = `/guard-evidence/${family.reference}`;
  const original = state.blobs.get(path);
  for (const fault of [
    'purpose',
    'producer',
    'digest',
    'matrix',
    'role',
    'writer',
  ]) {
    const record = JSON.parse(original);
    let handle = { ...family };
    if (fault === 'purpose') record.mode = 'workload-generation';
    if (fault === 'producer') record.producerPrincipalId = uuid('4');
    if (fault === 'matrix') record.cases.pop();
    if (['purpose', 'producer', 'matrix'].includes(fault)) {
      state.blobs.set(path, JSON.stringify(canonical(record)));
      handle.digest = hash(record);
    }
    if (fault === 'digest') handle.digest = 'f'.repeat(64);
    const role = state.objects.get(
      options.guard.role_definitions.workload_network.id,
    );
    const permissions = role.properties.permissions;
    if (fault === 'role')
      role.properties.permissions = [{ actions: ['*'], dataActions: [] }];
    if (fault === 'writer') state.writerDrift = true;
    await assert.rejects(
      validateVaultGuardEvidence({
        ...options,
        purpose: 'human-policy-family',
        handle,
        token: state.applyCredentials,
      }),
      /vault guard/,
    );
    state.blobs.set(path, original);
    role.properties.permissions = permissions;
    state.writerDrift = false;
  }
  await assert.rejects(
    validateVaultGuardEvidence({
      ...options,
      purpose: 'human-policy-family',
      handle: family,
      storage: {
        account: 'fixturefoundation',
        container: 'guard-apply-evidence',
      },
    }),
    /container binding/,
  );
});

test('actual apply publishes a separately typed current-vault generation proof and current drift invalidates it', async (t) => {
  const { options, state, requests } = await fixture(t);
  const family = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  const apply = {
    ...options,
    purpose: 'workload-generation',
    familyHandle: family,
    token: state.applyCredentials,
  };
  const published = await qualifyVaultGuards(apply);
  assert.equal(published.purpose, 'workload-generation');
  assert.equal(published.record.producerPrincipalId, uuid('4'));
  assert.ok(state.blobs.has(`/guard-apply-evidence/${published.reference}`));
  const proof = await validateVaultGuardEvidence({
    ...apply,
    handle: published,
    usage: 'fresh',
  });
  assert.equal(proof.workload_vault_id, options.workloadVaultId);
  assert.equal(proof.family_evidence_sha256, family.digest);
  assert.equal(proof.consumption_sha256, null);
  const lookups = requests.filter((request) =>
    request.path.includes('/roleDefinitions/'),
  );
  assert.ok(lookups.length > 0);
  assert.ok(
    lookups.every(
      (request) =>
        request.path.startsWith(options.guard.scope_ids.workload + '/') ||
        request.path.includes(
          '/blobServices/default/containers/guard-evidence/',
        ) ||
        request.path.includes(
          '/blobServices/default/containers/guard-apply-evidence/',
        ),
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.path ===
        options.workloadVaultId +
          '/providers/Microsoft.Authorization/permissions',
    ),
  );
  await assert.rejects(
    validateVaultGuardEvidence({
      ...apply,
      handle: published,
      usage: 'fresh',
      now: () => Date.now() + 25 * 60 * 60000,
    }),
    /expired|fresh/,
  );
  state.objects.get(
    options.guard.assignment_ids.workload,
  ).properties.enforcementMode = 'DoNotEnforce';
  await assert.rejects(
    validateVaultGuardEvidence({ ...apply, handle: published, usage: 'fresh' }),
    /vault guard/,
  );
});

test('real lease and exact saved plan bind create-only consumption before unchanged apply, and replay cannot masquerade as activation', async (t) => {
  const { options, state } = await fixture(t);
  const family = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  const apply = {
    ...options,
    purpose: 'workload-generation',
    familyHandle: family,
    token: state.applyCredentials,
  };
  const published = await qualifyVaultGuards(apply);
  const directory = mkdtempSync(join(tmpdir(), 'guard-plan-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  createPrivateDirectory(directory);
  const savedPlanPath = join(directory, 'saved.tfplan');
  const bytes = Buffer.from('PRIVATE_SAVED_PLAN_BYTES');
  writeFileSync(savedPlanPath, bytes, { mode: 0o600 });
  const revision = 'd'.repeat(40);
  const review = {
    version: 1,
    revision,
    inputHash: '1'.repeat(64),
    policyHash: '2'.repeat(64),
    planHash: createHash('sha256').update(bytes).digest('hex'),
    stateLineage: 'reviewed-lineage',
    stateSerial: 7,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    actions: { create: 3, update: 0, delete: 0, read: 0 },
  };
  writeFileSync(join(directory, 'review.json'), JSON.stringify(review), {
    mode: 0o600,
  });
  const planBinding = {
    savedPlanPath,
    review,
    bundleDigest: hash(review),
    qualificationDigest: published.digest,
    familyDigest: family.digest,
  };
  const consume = {
    ...apply,
    sourceRevision: revision,
    handle: published,
    planBinding,
    usage: 'consume',
  };
  state.leaseLost = true;
  await assert.rejects(validateVaultGuardEvidence(consume), /lease/);
  assert.equal(
    [...state.blobs.keys()].filter((key) => key.includes('/consumed/')).length,
    0,
  );
  state.leaseLost = false;
  writeFileSync(savedPlanPath, 'PRIVATE_DIVERGENT_PLAN');
  await assert.rejects(validateVaultGuardEvidence(consume), /plan/);
  writeFileSync(savedPlanPath, bytes);
  const projection = await validateVaultGuardEvidence(consume);
  assert.match(projection.consumption_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(readFileSync(savedPlanPath), bytes);
  const local = JSON.parse(
    readFileSync(join(directory, 'guard-apply-binding.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    state.blobs.get(
      `/guard-apply-evidence/${local.consumptionHandle.reference}`,
    ),
  );
  assert.equal(receipt.sourceRevision, revision);
  assert.equal(receipt.planHash, review.planHash);
  assert.equal(receipt.consumerPrincipalId, uuid('4'));
  assert.equal(receipt.leaseOwner, state.leaseId);
  assert.equal(receipt.qualificationDigest, published.digest);
  assert.ok(Date.parse(receipt.issuedAt) <= Date.now());
  await assert.rejects(validateVaultGuardEvidence(consume), /replay|consum/);
  const pending = await validateVaultGuardEvidence({
    ...consume,
    usage: 'pending',
  });
  assert.equal(pending.consumption_sha256, projection.consumption_sha256);
  await assert.rejects(
    validateVaultGuardEvidence({ ...consume, usage: 'active' }),
    /activation/,
  );
  await assert.rejects(
    validateVaultGuardEvidence({
      ...consume,
      usage: 'active',
      consumptionHandle: local.consumptionHandle,
      bindingHandle: local.bindingHandle,
    }),
    /activation/,
  );
  const binding = JSON.parse(
    state.blobs.get(`/guard-apply-evidence/${local.bindingHandle.reference}`),
  );
  binding.planHash = 'f'.repeat(64);
  state.blobs.set(
    `/guard-apply-evidence/${local.bindingHandle.reference}`,
    JSON.stringify(binding),
  );
  await assert.rejects(
    validateVaultGuardEvidence({ ...consume, usage: 'pending' }),
    /binding/,
  );
});

test('probe collisions, failed deletion and mismatched soft-delete identity block publication without adoption or purge', async (t) => {
  for (const fault of ['collision', 'delete', 'softdelete'])
    await t.test(fault, async (t) => {
      const { options, state, requests } = await fixture(t);
      if (fault === 'collision') {
        const name = `erw${hash({ environment: options.config.environment, subscriptionId: options.config.subscriptionId }).slice(0, 12)}-g1probe`;
        const id = `${options.guard.scope_ids.workload}/providers/Microsoft.KeyVault/vaults/${name}`;
        state.objects.set(id, { id, tags: { unrelated: 'PRIVATE_UNOWNED' } });
      }
      if (fault === 'delete') state.deleteFailure = true;
      if (fault === 'softdelete') state.softDeleteMismatch = true;
      await assert.rejects(
        qualifyVaultGuards({
          ...options,
          purpose: 'human-policy-family',
          workloadVaultId: undefined,
        }),
        /vault guard/,
      );
      assert.equal(state.blobs.size, 0);
      if (fault === 'collision')
        assert.ok(requests.every((request) => request.method === 'GET'));
      assert.ok(
        requests.every(
          (request) => !request.path.toLowerCase().includes('/purge'),
        ),
      );
    });
});

test('apply records actual earlier toggle and child RBAC denials separately from policy coverage anchored by the human family', async (t) => {
  const { options, state } = await fixture(t);
  const family = await qualifyVaultGuards({
    ...options,
    purpose: 'human-policy-family',
    workloadVaultId: undefined,
  });
  state.applyToggleRbac = true;
  state.applyChildRbac = true;
  const apply = {
    ...options,
    purpose: 'workload-generation',
    familyHandle: family,
    token: state.applyCredentials,
  };
  const published = await qualifyVaultGuards(apply);
  assert.ok(
    published.record.cases.some(
      (entry) =>
        entry.caseId === 'rbac' &&
        entry.outcome === 'rbac-denied' &&
        entry.deniedAction === 'Microsoft.Authorization/roleAssignments/write',
    ),
  );
  assert.ok(
    published.record.cases.some(
      (entry) =>
        entry.caseId === 'child-accessPolicies' &&
        entry.outcome === 'rbac-denied',
    ),
  );
  assert.ok(
    family.record.cases.every((entry) => entry.outcome !== 'rbac-denied'),
  );
  await validateVaultGuardEvidence({ ...apply, handle: published });
});

test('initial human qualification failure still deletes only its newly owned disposable probe', async (t) => {
  const { options, state, requests } = await fixture(t);
  state.writeMode = 'wrong-policy';
  await assert.rejects(
    qualifyVaultGuards({
      ...options,
      purpose: 'human-policy-family',
      workloadVaultId: undefined,
    }),
    /policy provenance/,
  );
  const deletions = requests.filter((request) => request.method === 'DELETE');
  assert.equal(deletions.length, 1);
  assert.ok(
    deletions[0].path.startsWith(
      options.guard.scope_ids.workload +
        '/providers/Microsoft.KeyVault/vaults/',
    ),
  );
  assert.equal(state.blobs.size, 0);
});

test('human policy qualification observes complete both-family both-API PUT and PATCH denials and restored compliant admission', async (t) => {
  const { options, requests, vaults } = await fixture(t);
  const before = hash(vaults);
  const record = await qualifyVaultGuardPolicy({
    ...options,
    admissionCidr: '203.0.113.7/32',
  });
  assert.equal(record.publisherPrincipalId, uuid('3'));
  assert.equal(record.guards.length, 2);
  for (const family of ['recovery', 'workload'])
    for (const apiVersion of ['2024-11-01', '2026-02-01'])
      for (const method of ['PUT', 'PATCH']) {
        const cases = record.cases.filter(
          (entry) =>
            entry.family === family &&
            entry.apiVersion === apiVersion &&
            entry.method === method,
        );
        assert.ok(
          cases.some(
            (entry) =>
              entry.caseId === 'rbac' && entry.outcome === 'policy-denied',
          ),
        );
        assert.ok(
          cases.some(
            (entry) =>
              entry.caseId === 'accessPolicies' &&
              entry.outcome === 'policy-denied',
          ),
        );
        assert.ok(
          cases.some(
            (entry) =>
              entry.caseId === 'recover-mode' &&
              entry.outcome === 'policy-denied',
          ),
        );
        assert.ok(
          cases.some(
            (entry) =>
              entry.caseId === 'admission-cleanup' &&
              entry.beforeHash === entry.afterHash,
          ),
        );
        assert.ok(cases.every((entry) => entry.beforeHash === entry.afterHash));
      }
  assert.equal(hash(vaults), before);
  assert.ok(
    requests
      .filter((entry) => entry.method !== 'GET')
      .every(
        (entry) =>
          entry.path.includes('/Microsoft.KeyVault/vaults/') &&
          !entry.path.includes('/accessPolicies/'),
      ),
  );
  assert.doesNotMatch(
    JSON.stringify(record),
    /PRIVATE_VAULT_PROVIDER_VALUE|signature/,
  );
});

test('human qualification never counts RBAC denial, another policy, accepted mutation or changed resource as successful policy proof', async (t) => {
  for (const mode of ['rbac', 'wrong-policy', 'accepted', 'mutation'])
    await t.test(mode, async (t) => {
      const { options, state, requests } = await fixture(t);
      state.writeMode = mode;
      await assert.rejects(
        qualifyVaultGuardPolicy({
          ...options,
          admissionCidr: '203.0.113.7/32',
        }),
        (error) => {
          assert.match(error.message, /vault guard/);
          assert.doesNotMatch(
            error.message + JSON.stringify(error),
            /PRIVATE_VAULT_PROVIDER_VALUE/,
          );
          return true;
        },
      );
      assert.equal(
        requests.filter((entry) => entry.method !== 'GET').length,
        1,
      );
    });
});

test('qualification cleanup failures block proof and preserve unrelated changes without private diagnostics', async (t) => {
  for (const fault of ['cleanup', 'simultaneous'])
    await t.test(fault, async (t) => {
      const { options, state, vaults } = await fixture(t);
      if (fault === 'cleanup') state.failCleanup = true;
      else state.admissionChange = true;
      await assert.rejects(
        qualifyVaultGuardPolicy({
          ...options,
          admissionCidr: '203.0.113.7/32',
        }),
        (error) => {
          assert.match(error.message, /cleanup/);
          if (fault === 'simultaneous')
            assert.match(error.message, /preservation.*cleanup also failed/);
          assert.doesNotMatch(
            error.message + JSON.stringify(error),
            /PRIVATE_CLEANUP_VALUE|PRIVATE_UNRELATED_VALUE/,
          );
          return true;
        },
      );
      if (fault === 'simultaneous') {
        assert.equal(vaults.recovery.tags.unrelated, 'PRIVATE_UNRELATED_VALUE');
        assert.equal(vaults.recovery.tags['equipment-vault-guard'], undefined);
      }
    });
});

test('cancellation after an owned admission still attempts independent bounded cleanup', async (t) => {
  const { options, state, vaults } = await fixture(t);
  const controller = new globalThis.AbortController();
  state.afterAdmission = () => controller.abort();
  await assert.rejects(
    qualifyVaultGuardPolicy({ ...options, signal: controller.signal }),
    /vault guard/,
  );
  assert.equal(vaults.recovery.tags['equipment-vault-guard'], undefined);
  assert.deepEqual(vaults.recovery.properties.networkAcls.ipRules, []);
});

test('an application token cannot masquerade as the supervised human policy publisher', async (t) => {
  const { options, requests } = await fixture(t);
  const actual = await options.token();
  const parts = actual.split('.');
  const claims = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8'),
  );
  claims.idtyp = 'app';
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  await assert.rejects(
    qualifyVaultGuardPolicy({
      ...options,
      token: async () => parts.join('.'),
      admissionCidr: '203.0.113.7/32',
    }),
    /delegated human identity/,
  );
  assert.equal(requests.length, 0);
});

test('guard inspection rejects drift, exemptions and wrong-family bindings without publishing private provider contents', async (t) => {
  for (const fault of [
    'definition',
    'disabled',
    'scope',
    'parameters',
    'exemption',
    'vault',
    'provider',
  ]) {
    await t.test(fault, async (t) => {
      const { options, state, vaults } = await fixture(t);
      const assignment = state.objects.get(
        options.guard.assignment_ids.workload,
      );
      if (fault === 'definition')
        state.objects.get(options.guard.definition_id).properties.mode =
          'Indexed';
      if (fault === 'disabled')
        assignment.properties.enforcementMode = 'DoNotEnforce';
      if (fault === 'scope')
        assignment.properties.scope = options.guard.scope_ids.recovery;
      if (fault === 'parameters')
        assignment.properties.parameters = {
          ...assignment.properties.parameters,
          exactVaultName: { value: 'wrong' },
        };
      if (fault === 'exemption')
        state.exemptions = [
          {
            id: '/private-exemption',
            properties: {
              policyAssignmentId: options.guard.assignment_ids.workload,
            },
          },
        ];
      if (fault === 'vault')
        vaults.recovery.properties.enableRbacAuthorization = false;
      if (fault === 'provider') state.fail = true;
      await assert.rejects(inspectVaultGuards(options), (error) => {
        assert.match(error.message, /vault guard/i);
        assert.doesNotMatch(
          error.message + JSON.stringify(error),
          /PRIVATE_VAULT_PROVIDER_VALUE/,
        );
        return true;
      });
    });
  }
});

test('workload delegation transport validates structure without satisfying source authority', () => {
  const { descriptor } = delegationFixture();
  assert.deepEqual(
    guardApi.validateWorkloadDelegationProjection(descriptor),
    descriptor,
  );
  assert.throws(
    () => guardApi.validateWorkloadDelegation(descriptor, {}),
    /delegation/,
  );
  for (const mutate of [
    (x) => {
      x.extra = true;
    },
    (x) => {
      x.version = 2;
    },
    (x) => {
      x.assignments.apply.condition += ' unsupported';
      sealDelegation(x);
    },
    (x) => {
      x.assignments.apply.condition = x.assignments.apply.condition.replace(
        'AND',
        'OR',
      );
      sealDelegation(x);
    },
    (x) => {
      x.assignments.apply.conditionSha256 = '0'.repeat(64);
    },
    (x) => {
      x.semanticSha256 = '0'.repeat(64);
    },
  ]) {
    const changed = globalThis.structuredClone(descriptor);
    mutate(changed);
    assert.throws(
      () => guardApi.validateWorkloadDelegationProjection(changed),
      /delegation/,
    );
  }
});
