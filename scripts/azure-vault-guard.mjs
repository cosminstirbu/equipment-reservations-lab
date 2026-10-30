import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { OperationalFailure } from './process.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { assertPrivatePath } from './local-platform.mjs';

export const vaultGuardApiVersions = Object.freeze([
  '2024-11-01',
  '2026-02-01',
]);
const policyVersion = '2023-04-01';
const exemptionVersion = '2022-07-01-preview';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const fail = (phase, status) => {
  throw new OperationalFailure(
    `Azure vault guard ${phase} failed${Number.isInteger(status) ? `; status=${status}` : ''}; private provider contents suppressed.`,
  );
};
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
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const equal = (left, right) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const idEqual = (left, right) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  left.toLowerCase() === right.toLowerCase();

const delegationActions = Object.freeze({
  write: 'Microsoft.Authorization/roleAssignments/write',
  delete: 'Microsoft.Authorization/roleAssignments/delete',
});

function delegationFailure() {
  fail('delegation validation');
}

function delegationKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    delegationFailure();
}

function delegationStrings(values, { guids = false, nonempty = false } = {}) {
  if (
    !Array.isArray(values) ||
    values.length > 128 ||
    (nonempty && !values.length) ||
    values.some(
      (value) =>
        typeof value !== 'string' ||
        !value.length ||
        value.length > 512 ||
        (guids && !uuid.test(value)),
    ) ||
    !equal(values, [...values].sort()) ||
    new Set(values.map((value) => value.toLowerCase())).size !== values.length
  )
    delegationFailure();
  return values.map((value) => value.toLowerCase());
}

function delegationScope(scope) {
  if (
    typeof scope !== 'string' ||
    scope.length > 2048 ||
    !scope.startsWith('/') ||
    (scope !== '/' &&
      (scope.endsWith('/') ||
        scope
          .slice(1)
          .split('/')
          .some(
            (part) =>
              !part ||
              part === '.' ||
              part === '..' ||
              !/^[A-Za-z0-9._()-]+$/.test(part),
          )))
  )
    delegationFailure();
  return scope.toLowerCase().split('/').filter(Boolean);
}

function delegationAst(op, children) {
  const flat = children.flatMap((child) =>
    child.op === op ? child.children : [child],
  );
  const sorted = flat
    .map((child) => [JSON.stringify(canonical(child)), child])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (new Set(sorted.map(([key]) => key)).size !== sorted.length)
    delegationFailure();
  return sorted.length === 1
    ? sorted[0][1]
    : { op, children: sorted.map(([, child]) => child) };
}

function delegationAttribute(origin, attribute, values) {
  return {
    op: 'attribute',
    origin,
    attribute,
    values: [...values].map((value) => value.toLowerCase()).sort(),
  };
}

function parseDelegationCondition(condition) {
  if (
    typeof condition !== 'string' ||
    !condition.length ||
    Buffer.byteLength(condition, 'utf8') > 65536
  )
    delegationFailure();
  const pattern =
    /\s+|[()!{},]|'[^'\\\r\n]*'|@(Request|Resource)\[Microsoft\.Authorization\/roleAssignments:(RoleDefinitionId|PrincipalId|PrincipalType)\]|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|[A-Za-z][A-Za-z0-9:]*/y;
  const tokens = [];
  let offset = 0;
  while (offset < condition.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(condition);
    if (!match) delegationFailure();
    offset = pattern.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
    if (tokens.length > 8192) delegationFailure();
  }
  let position = 0;
  const take = (expected) => {
    const value = tokens[position++];
    if (expected !== undefined && value !== expected) delegationFailure();
    return value;
  };
  const attribute =
    /^@(Request|Resource)\[Microsoft\.Authorization\/roleAssignments:(RoleDefinitionId|PrincipalId|PrincipalType)\]$/;
  const atom = (depth) => {
    if (depth > 32) delegationFailure();
    const token = take();
    if (token === '!') return { op: 'not', value: atom(depth + 1) };
    if (token === '(') {
      const result = group(depth + 1);
      take(')');
      return result;
    }
    if (token === 'ActionMatches') {
      take('{');
      const action = take();
      take('}');
      if (
        ![...Object.values(delegationActions)].some(
          (value) => `'${value.toLowerCase()}'` === action?.toLowerCase(),
        )
      )
        delegationFailure();
      return { op: 'action', value: action.slice(1, -1).toLowerCase() };
    }
    const match = attribute.exec(token ?? '');
    if (!match) delegationFailure();
    const [, origin, field] = match;
    take(
      field === 'PrincipalType'
        ? 'ForAnyOfAnyValues:StringEqualsIgnoreCase'
        : 'ForAnyOfAnyValues:GuidEquals',
    );
    take('{');
    const values = [];
    if (field === 'PrincipalType') {
      if (take()?.toLowerCase() !== "'serviceprincipal'") delegationFailure();
      values.push('serviceprincipal');
    } else {
      do {
        const value = take();
        if (!uuid.test(value ?? '')) delegationFailure();
        values.push(value.toLowerCase());
        if (tokens[position] !== ',') break;
        take(',');
      } while (values.length <= 128);
      if (values.length > 128 || new Set(values).size !== values.length)
        delegationFailure();
    }
    take('}');
    return delegationAttribute(origin, field, values);
  };
  const group = (depth) => {
    const children = [atom(depth)];
    let operator;
    while (tokens[position] === 'AND' || tokens[position] === 'OR') {
      const next = take();
      if (operator && operator !== next) delegationFailure();
      operator = next;
      children.push(atom(depth));
    }
    return operator
      ? delegationAst(operator.toLowerCase(), children)
      : children[0];
  };
  const result = group(0);
  if (position !== tokens.length) delegationFailure();
  return result;
}

function expectedDelegationAst(rules) {
  return delegationAst(
    'and',
    Object.entries(delegationActions).map(([operation, action]) => {
      const origin = operation === 'write' ? 'Request' : 'Resource';
      const allowed = delegationAst(
        'or',
        rules.map((rule) => {
          const role = delegationAttribute(
            origin,
            'RoleDefinitionId',
            rule.roleDefinitionIds,
          );
          return rule.principalIds === null
            ? role
            : delegationAst('and', [
                role,
                delegationAttribute(origin, 'PrincipalId', rule.principalIds),
              ]);
        }),
      );
      return delegationAst('or', [
        { op: 'not', value: { op: 'action', value: action.toLowerCase() } },
        delegationAst('and', [
          allowed,
          delegationAttribute(origin, 'PrincipalType', ['ServicePrincipal']),
        ]),
      ]);
    }),
  );
}

function delegationDescriptor(value) {
  delegationKeys(value, [
    'version',
    'scope',
    'roleDefinition',
    'assignments',
    'allowedRules',
    'semanticSha256',
  ]);
  if (
    value.version !== 1 ||
    !sha256.test(value.semanticSha256 ?? '') ||
    !/^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[A-Za-z0-9._()-]+$/i.test(
      value.scope ?? '',
    )
  )
    delegationFailure();
  delegationScope(value.scope);
  const subscription = value.scope.split('/')[2];
  if (!uuid.test(subscription)) delegationFailure();
  const role = value.roleDefinition;
  const roleKeys = [
    'id',
    'name',
    'roleType',
    'actions',
    'notActions',
    'dataActions',
    'notDataActions',
    'assignableScopes',
  ];
  delegationKeys(role, [...roleKeys, 'sha256']);
  for (const key of ['actions', 'notActions', 'dataActions', 'notDataActions'])
    delegationStrings(role[key]);
  delegationStrings(role.assignableScopes, { nonempty: true });
  for (const scope of role.assignableScopes) delegationScope(scope);
  if (
    role.name !== 'Role Based Access Control Administrator' ||
    role.roleType !== 'BuiltInRole' ||
    !idEqual(
      role.id?.slice(0, -36),
      `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/`,
    ) ||
    !uuid.test(role.id?.slice(-36) ?? '') ||
    role.sha256 !==
      digest(Object.fromEntries(roleKeys.map((key) => [key, role[key]])))
  )
    delegationFailure();
  delegationKeys(value.assignments, ['apply', 'destroy']);
  if (
    !Array.isArray(value.allowedRules) ||
    !value.allowedRules.length ||
    value.allowedRules.length > 64
  )
    delegationFailure();
  const rules = value.allowedRules.map((rule) => {
    delegationKeys(rule, [
      'roleDefinitionIds',
      'principalIds',
      'principalType',
    ]);
    if (rule.principalType !== 'ServicePrincipal') delegationFailure();
    return {
      roleDefinitionIds: delegationStrings(rule.roleDefinitionIds, {
        guids: true,
        nonempty: true,
      }),
      principalIds:
        rule.principalIds === null
          ? null
          : delegationStrings(rule.principalIds, {
              guids: true,
              nonempty: true,
            }),
      principalType: rule.principalType,
    };
  });
  if (
    new Set(rules.map((rule) => JSON.stringify(canonical(rule)))).size !==
    rules.length
  )
    delegationFailure();
  const asts = {};
  for (const actor of ['apply', 'destroy']) {
    const assignment = value.assignments[actor];
    const semanticKeys = [
      'id',
      'scope',
      'principalId',
      'principalType',
      'roleDefinitionId',
      'conditionVersion',
      'conditionSha256',
    ];
    delegationKeys(assignment, [
      ...semanticKeys,
      'condition',
      'semanticSha256',
    ]);
    if (
      !idEqual(assignment.scope, value.scope) ||
      !idEqual(
        assignment.id?.slice(0, -36),
        `${value.scope}/providers/Microsoft.Authorization/roleAssignments/`,
      ) ||
      !uuid.test(assignment.id?.slice(-36) ?? '') ||
      !uuid.test(assignment.principalId ?? '') ||
      assignment.principalType !== 'ServicePrincipal' ||
      !idEqual(assignment.roleDefinitionId, role.id) ||
      assignment.conditionVersion !== '2.0' ||
      typeof assignment.condition !== 'string' ||
      Buffer.byteLength(assignment.condition, 'utf8') > 65536 ||
      assignment.conditionSha256 !==
        createHash('sha256')
          .update(assignment.condition, 'utf8')
          .digest('hex') ||
      assignment.semanticSha256 !==
        digest(
          Object.fromEntries(semanticKeys.map((key) => [key, assignment[key]])),
        )
    )
      delegationFailure();
    asts[actor] = parseDelegationCondition(assignment.condition);
  }
  if (
    idEqual(value.assignments.apply.id, value.assignments.destroy.id) ||
    idEqual(
      value.assignments.apply.principalId,
      value.assignments.destroy.principalId,
    ) ||
    value.semanticSha256 !==
      digest({
        version: value.version,
        scope: value.scope,
        roleDefinitionSha256: role.sha256,
        assignmentsSemanticHashes: Object.fromEntries(
          ['apply', 'destroy'].map((actor) => [
            actor,
            value.assignments[actor].semanticSha256,
          ]),
        ),
        allowedRules: value.allowedRules,
      })
  )
    delegationFailure();
  return { rules, asts };
}

function checkedDelegation(descriptor, expectedDescriptor) {
  const actual = delegationDescriptor(descriptor);
  const expected = delegationDescriptor(expectedDescriptor);
  if (!equal(descriptor, expectedDescriptor)) delegationFailure();
  const ast = expectedDelegationAst(expected.rules);
  for (const actor of ['apply', 'destroy'])
    if (!equal(actual.asts[actor], ast) || !equal(expected.asts[actor], ast))
      delegationFailure();
  return actual;
}

function pureDelegation(action) {
  try {
    return action();
  } catch {
    delegationFailure();
  }
}

// Transport consistency does not establish reviewed-source provenance or authority.
export function validateWorkloadDelegationProjection(descriptor) {
  return pureDelegation(() => {
    const { rules, asts } = delegationDescriptor(descriptor);
    const ast = expectedDelegationAst(rules);
    if (Object.values(asts).some((actual) => !equal(actual, ast)))
      delegationFailure();
    return descriptor;
  });
}

export function validateWorkloadDelegation(descriptor, options) {
  return pureDelegation(() => {
    delegationKeys(options, ['expectedDescriptor']);
    checkedDelegation(descriptor, options.expectedDescriptor);
    return { valid: true, semanticSha256: descriptor.semanticSha256 };
  });
}

export function evaluateWorkloadDelegation(descriptor, options) {
  return pureDelegation(() => {
    const operation = Object.entries(delegationActions).find(([, action]) =>
      idEqual(options?.action, action),
    )?.[0];
    if (!operation || !['apply', 'destroy'].includes(options.actor))
      delegationFailure();
    delegationKeys(
      options,
      operation === 'write'
        ? [
            'expectedDescriptor',
            'actor',
            'action',
            'targetScope',
            'requestedRoleDefinitionId',
            'requestedPrincipalId',
            'requestedPrincipalType',
          ]
        : ['expectedDescriptor', 'actor', 'action', 'targetScope', 'resource'],
    );
    const actual = checkedDelegation(descriptor, options.expectedDescriptor);
    const scope = delegationScope(options.targetScope);
    const parent = delegationScope(descriptor.scope);
    if (
      scope.length < parent.length ||
      !parent.every((part, i) => scope[i] === part)
    )
      delegationFailure();
    let target;
    if (operation === 'delete') {
      target = options.resource;
      delegationKeys(target, [
        'id',
        'scope',
        'roleDefinitionId',
        'principalId',
        'principalType',
      ]);
      if (
        !idEqual(target.scope, options.targetScope) ||
        !idEqual(
          target.id?.slice(0, -36),
          `${target.scope}/providers/Microsoft.Authorization/roleAssignments/`,
        ) ||
        !uuid.test(target.id?.slice(-36) ?? '')
      )
        delegationFailure();
    } else
      target = {
        roleDefinitionId: options.requestedRoleDefinitionId,
        principalId: options.requestedPrincipalId,
        principalType: options.requestedPrincipalType,
      };
    if (
      !uuid.test(target.roleDefinitionId ?? '') ||
      !uuid.test(target.principalId ?? '') ||
      !['serviceprincipal', 'user', 'group'].includes(
        target.principalType?.toLowerCase(),
      )
    )
      delegationFailure();
    const origin = operation === 'write' ? 'Request' : 'Resource';
    const fields = {
      RoleDefinitionId: target.roleDefinitionId,
      PrincipalId: target.principalId,
      PrincipalType: target.principalType,
    };
    const evaluate = (node) => {
      if (node.op === 'not') return !evaluate(node.value);
      if (node.op === 'and') return node.children.every(evaluate);
      if (node.op === 'or') return node.children.some(evaluate);
      if (node.op === 'action') return idEqual(node.value, options.action);
      if (node.op === 'attribute')
        return (
          node.origin === origin &&
          node.values.includes(fields[node.attribute].toLowerCase())
        );
      delegationFailure();
    };
    return { valid: true, allowed: evaluate(actual.asts[options.actor]) };
  });
}

const guardActors = ['plan', 'apply', 'destroy', 'backup', 'restore', 'reaper'];
const canaryNamespace = '6c80e97f-370c-5ca3-89bd-a0623f831280';

function canaryUuid(name) {
  const bytes = createHash('sha1')
    .update(Buffer.from(canaryNamespace.replaceAll('-', ''), 'hex'))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function createVaultGuardCanaryDescriptors({
  config,
  guard,
  principalIds,
}) {
  if (
    !uuid.test(config?.subscriptionId ?? '') ||
    !/^[a-z][a-z0-9-]{1,30}$/.test(config?.environment ?? '') ||
    !principalIds ||
    Object.keys(principalIds).sort().join(',') !==
      [...guardActors].sort().join(',') ||
    Object.values(principalIds).some((value) => !uuid.test(value ?? ''))
  )
    fail('canary descriptor identity');
  const subscription = `/subscriptions/${config.subscriptionId}`;
  const scope = guard?.scope_ids?.workload;
  if (
    !new RegExp(`^${subscription}/resourceGroups/[A-Za-z0-9._()-]+$`, 'i').test(
      scope ?? '',
    )
  )
    fail('canary descriptor scope');
  const name = `equipment-g3-${config.environment}-canary`;
  const definitionId = `${subscription}/providers/Microsoft.Authorization/policyDefinitions/${name}`;
  const assignmentId = `${scope}/providers/Microsoft.Authorization/policyAssignments/${name}`;
  const roleId = `${subscription}/providers/Microsoft.Authorization/roleDefinitions/${canaryUuid(`${config.environment}/g3-read-canary`)}`;
  const descriptor = (id, api_version, properties) => ({
    id,
    api_version,
    properties,
    sha256: digest(properties),
  });
  const role = {
    actions: ['Microsoft.Authorization/policyAssignments/read'],
    notActions: [],
    dataActions: [],
    notDataActions: [],
    assignableScopes: [scope],
  };
  return {
    namespace_uuid: canaryNamespace,
    definition: descriptor(definitionId, policyVersion, {
      policyType: 'Custom',
      mode: 'All',
      displayName: name,
      parameters: {},
      policyRule: {
        if: { field: 'type', equals: 'EquipmentQualification.Never/resources' },
        then: { effect: 'audit' },
      },
    }),
    assignment: descriptor(assignmentId, policyVersion, {
      policyDefinitionId: definitionId,
      enforcementMode: 'Default',
      parameters: {},
      notScopes: [],
    }),
    exemption: descriptor(
      `${scope}/providers/Microsoft.Authorization/policyExemptions/${name}`,
      exemptionVersion,
      {
        policyAssignmentId: assignmentId,
        exemptionCategory: 'Waiver',
        displayName: name,
      },
    ),
    role: { id: roleId, ...role, sha256: digest(role) },
    role_assignments: Object.fromEntries(
      guardActors.map((actor) => [
        actor,
        descriptor(
          `${assignmentId}/providers/Microsoft.Authorization/roleAssignments/${canaryUuid(`${config.environment}/${actor}/g3-deny`)}`,
          '2022-04-01',
          {
            roleDefinitionId: roleId,
            principalId: principalIds[actor],
            principalType: 'ServicePrincipal',
          },
        ),
      ]),
    ),
  };
}

export async function verifyVaultGuardCanaryDenials(options) {
  return guardBoundary(
    () => verifyCanaryDenials(options),
    'canary qualification',
  );
}

async function guardBoundary(action, phase) {
  try {
    return await action();
  } catch (error) {
    if (
      error instanceof OperationalFailure &&
      error.message.startsWith('Azure vault guard ')
    )
      throw error;
    fail(phase);
  }
}

async function verifyCanaryDenials(options) {
  const ctx = context(options);
  if (!guardActors.includes(options.actor)) fail('canary actor');
  const supplied = ctx.guard.canary;
  const principalIds = Object.fromEntries(
    guardActors.map((actor) => [
      actor,
      supplied?.role_assignments?.[actor]?.properties?.principalId,
    ]),
  );
  const expected = createVaultGuardCanaryDescriptors({ ...ctx, principalIds });
  if (!equal(supplied, expected))
    fail('canary literal descriptor substitution');
  const accessToken = await ctx.token('https://management.azure.com/');
  let claims;
  try {
    claims = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    );
  } catch {
    fail('canary actor identity');
  }
  if (
    claims.oid !== principalIds[options.actor] ||
    claims.tid !== ctx.config.tenantId ||
    claims.idtyp !== 'app' ||
    ![
      'https://management.azure.com/',
      'https://management.core.windows.net/',
    ].includes(claims.aud) ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= Date.now() + 30000
  )
    fail('canary actor identity');
  ctx.token = async (resource) =>
    resource === 'https://management.azure.com/'
      ? accessToken
      : options.token(resource);
  ctx.signal = globalThis.AbortSignal.any([
    globalThis.AbortSignal.timeout(5 * 60000),
    ...(ctx.signal ? [ctx.signal] : []),
  ]);
  const actualRole = await read(
    ctx,
    `${expected.assignment.id}/providers/Microsoft.Authorization/roleDefinitions/${expected.role.id.split('/').at(-1)}`,
    '2022-04-01',
  );
  const roleSemantic = {
    actions: actualRole.properties?.permissions?.[0]?.actions,
    notActions: actualRole.properties?.permissions?.[0]?.notActions,
    dataActions: actualRole.properties?.permissions?.[0]?.dataActions,
    notDataActions: actualRole.properties?.permissions?.[0]?.notDataActions,
    assignableScopes: actualRole.properties?.assignableScopes,
  };
  if (
    !idEqual(actualRole.id, expected.role.id) ||
    actualRole.properties?.permissions?.length !== 1 ||
    digest(roleSemantic) !== expected.role.sha256
  )
    fail('canary redundant-read role semantics');
  const cases = [];
  for (const [name, descriptor] of [
    ['policyDefinitions', expected.definition],
    ['policyAssignments', expected.assignment],
    ['policyExemptions', expected.exemption],
    ['roleAssignments', expected.role_assignments[options.actor]],
  ]) {
    const before = await arm(ctx, descriptor.id, descriptor.api_version);
    if (name === 'roleAssignments') {
      if (before.status !== 404)
        fail('canary preexisting role assignment', before.status);
    } else if (
      before.status !== 200 ||
      !idEqual(before.value?.id, descriptor.id) ||
      !Object.entries(descriptor.properties).every(([key, value]) =>
        equal(before.value?.properties?.[key], value),
      )
    )
      fail('canary existing fixture semantics', before.status);
    const result = await arm(ctx, descriptor.id, descriptor.api_version, {
      method: 'PUT',
      body: { properties: descriptor.properties },
    });
    const deniedAction = authorizationDenied(result, [
      `Microsoft.Authorization/${name}/write`,
    ]);
    let primary;
    if (result.value?.error?.code !== 'AuthorizationFailed' || !deniedAction) {
      try {
        fail(
          'canary denial provenance; unexpected acceptance requires human fixture inspection',
          result.status,
        );
      } catch (error) {
        primary = error;
      }
    }
    try {
      const after = await arm(ctx, descriptor.id, descriptor.api_version);
      if (after.status !== before.status || !equal(after.value, before.value))
        fail('canary changed after negative request', after.status);
    } catch (error) {
      if (primary)
        throw new OperationalFailure(
          `${primary.message} Verification: ${error instanceof OperationalFailure ? error.message : 'Azure vault guard canary verification failed; private details suppressed.'}`,
        );
      throw error;
    }
    if (primary) throw primary;
    cases.push({
      caseId: name,
      status: result.status,
      deniedAction,
      requestId: result.requestId,
      correlationId: result.correlationId,
    });
  }
  return {
    version: 1,
    boundary: 'canary-scopes-only',
    actor: options.actor,
    principalId: claims.oid,
    cases,
  };
}

function context(options) {
  const { config, guard, workloadVaultId, sourceClosureHash, token } = options;
  if (
    !config ||
    !guard ||
    !uuid.test(config.tenantId ?? '') ||
    !uuid.test(config.subscriptionId ?? '') ||
    !/^[a-f0-9]{40}$/.test(config.gitRevision ?? '') ||
    !/^\w{4,12}$/.test(config.generation ?? '') ||
    !/^[a-z][a-z0-9-]{1,30}$/.test(config.environment ?? '') ||
    !sha256.test(sourceClosureHash ?? '') ||
    !sha256.test(guard.definition_sha256 ?? '') ||
    typeof token !== 'function'
  )
    fail('binding inspection');
  const prefix = `/subscriptions/${config.subscriptionId}`;
  const rg = new RegExp(`^${prefix}/resourceGroups/[A-Za-z0-9._()-]+$`, 'i');
  const definition = new RegExp(
    `^${prefix}/providers/Microsoft.Authorization/policyDefinitions/[A-Za-z0-9._()-]+$`,
    'i',
  );
  if (
    !definition.test(guard.definition_id ?? '') ||
    !rg.test(guard.scope_ids?.recovery ?? '') ||
    !rg.test(guard.scope_ids?.workload ?? '') ||
    idEqual(guard.scope_ids.recovery, guard.scope_ids.workload)
  )
    fail('scope inspection');
  for (const family of ['recovery', 'workload']) {
    const assignmentPrefix = `${guard.scope_ids[family]}/providers/Microsoft.Authorization/policyAssignments/`;
    const assignmentId = guard.assignment_ids?.[family];
    if (
      typeof assignmentId !== 'string' ||
      !assignmentId.startsWith(assignmentPrefix) ||
      !/^[A-Za-z0-9._()-]+$/.test(
        assignmentId.slice(assignmentPrefix.length),
      ) ||
      guard.parameters?.[family]?.expectedTenantId?.value !== config.tenantId ||
      guard.parameters?.[family]?.exactVaultName?.value !==
        (family === 'recovery'
          ? guard.recovery_vault_id?.split('/').at(-1)
          : '')
    )
      fail('assignment binding inspection');
  }
  const vaults = {
    recovery: guard.recovery_vault_id,
    workload: workloadVaultId,
  };
  for (const [family, id] of Object.entries(vaults)) {
    const expected = `${guard.scope_ids[family]}/providers/Microsoft.KeyVault/vaults/`;
    if (
      typeof id !== 'string' ||
      !id.startsWith(expected) ||
      !/^[a-zA-Z0-9-]{3,24}$/.test(id.slice(expected.length))
    )
      fail('vault family inspection');
  }
  if (
    typeof guard.workload_vault_name_prefix !== 'string' ||
    !vaults.workload
      .split('/')
      .at(-1)
      .startsWith(guard.workload_vault_name_prefix)
  )
    fail('workload generation inspection');
  const origin = options.armOrigin ?? 'https://management.azure.com';
  const parsed = new URL(origin);
  if (
    origin !== 'https://management.azure.com' &&
    !(
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.pathname === '/'
    )
  )
    fail('transport binding');
  const sourceRevision = options.sourceRevision ?? config.gitRevision;
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) fail('executed source revision');
  return { ...options, origin, vaults, sourceRevision };
}

async function responseBody(response) {
  if (Number(response.headers.get('content-length')) > 1024 * 1024) {
    await response.body?.cancel();
    fail('response limit');
  }
  const chunks = [];
  let length = 0;
  try {
    for await (const chunk of response.body ?? []) {
      length += chunk.byteLength;
      if (length > 1024 * 1024) fail('response limit');
      chunks.push(Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    fail('response parsing');
  }
}

async function arm(
  ctx,
  id,
  version,
  { method = 'GET', body, headers = {} } = {},
) {
  const started = Date.now();
  let response;
  try {
    response = await (ctx.fetch ?? globalThis.fetch)(
      `${ctx.origin}${id}${id.includes('?') ? '&' : '?'}api-version=${version}`,
      {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${await ctx.token('https://management.azure.com/')}`,
          'Content-Type': 'application/json',
          'x-ms-client-request-id': randomUUID(),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: globalThis.AbortSignal.any([
          globalThis.AbortSignal.timeout(30000),
          ...(ctx.signal ? [ctx.signal] : []),
        ]),
      },
    );
  } catch {
    throw new OperationalFailure(
      `Azure vault guard ${method === 'GET' ? 'read' : 'write completion uncertain'} failed; category=transport; duration=${Date.now() - started}ms; private provider contents suppressed.`,
    );
  }
  const value = await responseBody(response);
  return {
    status: response.status,
    value,
    requestId: response.headers.get('x-ms-request-id'),
    correlationId: response.headers.get('x-ms-correlation-request-id'),
  };
}

async function read(ctx, id, version) {
  const result = await arm(ctx, id, version);
  if (result.status !== 200) fail('read', result.status);
  return result.value;
}

async function inspectPermissions(ctx, id) {
  const value = await read(
    ctx,
    `${id}/providers/Microsoft.Authorization/permissions`,
    '2022-04-01',
  );
  if (
    !Array.isArray(value.value) ||
    !value.value.length ||
    value.nextLink ||
    value.value.some((entry) =>
      ['actions', 'notActions', 'dataActions', 'notDataActions'].some(
        (key) =>
          !Array.isArray(entry[key]) ||
          entry[key].some((action) => typeof action !== 'string'),
      ),
    )
  )
    fail('own effective permission inspection');
}

function vaultInvariant(vault, ctx, family) {
  const p = vault?.properties;
  if (
    !idEqual(vault?.id, ctx.vaults[family]) ||
    vault.type?.toLowerCase() !== 'microsoft.keyvault/vaults' ||
    !p ||
    p.tenantId !== ctx.config.tenantId ||
    p.enableRbacAuthorization !== true ||
    p.enablePurgeProtection !== true ||
    p.enableSoftDelete !== true ||
    !Array.isArray(p.accessPolicies) ||
    p.accessPolicies.length ||
    [
      'enabledForDeployment',
      'enabledForDiskEncryption',
      'enabledForTemplateDeployment',
    ].some((key) => p[key] !== false) ||
    p.publicNetworkAccess !== 'Enabled' ||
    p.networkAcls?.defaultAction !== 'Deny' ||
    p.networkAcls?.bypass !== 'None' ||
    p.provisioningState !== 'Succeeded' ||
    vault.tags?.application !== 'equipment-reservations' ||
    vault.tags?.environment !== ctx.config.environment
  )
    fail('vault invariant inspection');
}

async function inspect(ctx, skipWorkload = false) {
  const definition = await read(ctx, ctx.guard.definition_id, policyVersion);
  const properties = definition.properties;
  if (
    !idEqual(definition.id, ctx.guard.definition_id) ||
    properties?.policyType !== 'Custom' ||
    properties.mode !== 'All' ||
    digest({
      mode: properties.mode,
      parameters: properties.parameters,
      policyRule: properties.policyRule,
    }) !== ctx.guard.definition_sha256
  )
    fail('definition inspection');
  const guards = [];
  const vaults = {};
  for (const family of ['recovery', 'workload']) {
    const expected = ctx.guard;
    const assignment = await read(
      ctx,
      expected.assignment_ids[family],
      policyVersion,
    );
    const p = assignment.properties;
    if (
      !idEqual(assignment.id, expected.assignment_ids[family]) ||
      !idEqual(p?.scope, expected.scope_ids[family]) ||
      !idEqual(p?.policyDefinitionId, expected.definition_id) ||
      p?.enforcementMode !== 'Default' ||
      (Object.hasOwn(p, 'notScopes') &&
        (!Array.isArray(p.notScopes) || p.notScopes.length !== 0)) ||
      (p.overrides ?? []).length ||
      (p.resourceSelectors ?? []).length ||
      (assignment.identity && assignment.identity.type !== 'None') ||
      !equal(p.parameters, expected.parameters[family])
    )
      fail('assignment inspection');
    const exemptions = [];
    let path = `${expected.scope_ids[family]}/providers/Microsoft.Authorization/policyExemptions`;
    for (let page = 0; path; page++) {
      if (page >= 20) fail('exemption pagination');
      const result = await read(ctx, path, exemptionVersion);
      if (!Array.isArray(result.value)) fail('exemption inspection');
      exemptions.push(
        ...result.value.filter((entry) =>
          idEqual(entry.properties?.policyAssignmentId, assignment.id),
        ),
      );
      if (result.nextLink)
        fail('exemption pagination requires reviewed continuation');
      path = null;
    }
    if (exemptions.length) fail('exemption inspection');
    for (const apiVersion of vaultGuardApiVersions) {
      if (skipWorkload && family === 'workload') continue;
      const current = await read(ctx, ctx.vaults[family], apiVersion);
      vaultInvariant(current, ctx, family);
      await inspectPermissions(ctx, ctx.vaults[family]);
      vaults[`${family}/${apiVersion}`] = current;
    }
    const binding = {
      family,
      assignmentId: assignment.id,
      definitionId: definition.id,
      definitionHash: expected.definition_sha256,
      scope: expected.scope_ids[family],
      parameters: p.parameters,
      enforcementMode: p.enforcementMode,
      notScopes: [],
      exemptions: [],
      vaultId: ctx.vaults[family],
      apiVersions: [...vaultGuardApiVersions],
    };
    guards.push({ ...binding, bindingHash: digest(binding) });
  }
  return { guards, vaults };
}

export async function inspectVaultGuards(options) {
  try {
    return await inspect(context(options));
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    fail('inspection');
  }
}

const invariantFields = {
  rbac: ['enableRbacAuthorization', false],
  purge: ['enablePurgeProtection', false],
  softDelete: ['enableSoftDelete', false],
  deployment: ['enabledForDeployment', true],
  diskEncryption: ['enabledForDiskEncryption', true],
  templateDeployment: ['enabledForTemplateDeployment', true],
  defaultAction: ['networkAcls.defaultAction', 'Allow'],
  bypass: ['networkAcls.bypass', 'AzureServices'],
  publicNetwork: ['publicNetworkAccess', 'Disabled'],
  tenant: ['tenantId', '00000000-0000-4000-8000-000000000000'],
};

function writable(vault) {
  const properties = globalThis.structuredClone(vault.properties);
  for (const name of [
    'provisioningState',
    'vaultUri',
    'privateEndpointConnections',
  ])
    delete properties[name];
  return {
    location: vault.location,
    tags: globalThis.structuredClone(vault.tags ?? {}),
    properties,
  };
}
const vaultHash = (vault) =>
  digest({
    id: vault.id,
    name: vault.name,
    type: vault.type,
    ...writable(vault),
  });

function mutate(body, path, value, remove = false) {
  const segments = path.split('.');
  let parent = body.properties;
  for (const segment of segments.slice(0, -1)) parent = parent[segment];
  if (remove) delete parent[segments.at(-1)];
  else parent[segments.at(-1)] = value;
}

function negativeCases(principalId, tenantId) {
  const cases = Object.entries(invariantFields).flatMap(
    ([caseId, [path, value]]) => [
      { caseId, change: (body) => mutate(body, path, value) },
      {
        caseId: `missing-${caseId}`,
        change: (body) => mutate(body, path, null, true),
      },
    ],
  );
  cases.push({
    caseId: 'accessPolicies',
    change: (body) => {
      body.properties.accessPolicies = [
        { tenantId, objectId: principalId, permissions: { secrets: ['get'] } },
      ];
    },
  });
  cases.push({
    caseId: 'recover-mode',
    change: (body) => {
      body.properties.enableRbacAuthorization = false;
      body.properties.createMode = 'recover';
    },
  });
  return cases;
}

function policyDenied(result, guard) {
  if (
    ![400, 403].includes(result.status) ||
    !uuid.test(result.requestId ?? '') ||
    !uuid.test(result.correlationId ?? '') ||
    result.value?.error?.code !== 'RequestDisallowedByPolicy'
  )
    return false;
  const entries = [];
  const visit = (error, depth = 0) => {
    if (depth > 5) return;
    for (const info of (error?.additionalInfo ?? []).slice(0, 50))
      if (info.type === 'PolicyViolation') entries.push(info.info);
    for (const detail of (error?.details ?? []).slice(0, 50))
      visit(detail, depth + 1);
  };
  visit(result.value.error);
  return entries.some(
    (info) =>
      idEqual(info?.policyAssignmentId, guard.assignmentId) &&
      idEqual(info?.policyDefinitionId, guard.definitionId),
  );
}

async function humanContext(options) {
  const ctx = context(options);
  const token = await ctx.token('https://management.azure.com/');
  let claims;
  try {
    claims = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    );
  } catch {
    fail('delegated human identity');
  }
  const now = typeof options.now === 'function' ? options.now() : Date.now();
  if (
    !uuid.test(claims?.oid ?? '') ||
    claims.tid !== ctx.config.tenantId ||
    claims.idtyp === 'app' ||
    !claims.scp?.split(' ').includes('user_impersonation') ||
    ![
      'https://management.azure.com/',
      'https://management.core.windows.net/',
    ].includes(claims.aud) ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now + 30000
  )
    fail('delegated human identity');
  if (
    typeof options.admissionCidr !== 'string' ||
    !options.admissionCidr.endsWith('/32') ||
    isIP(options.admissionCidr.slice(0, -3)) !== 4
  )
    fail('admission CIDR');
  return {
    ...ctx,
    token: async (resource) =>
      resource === 'https://management.azure.com/'
        ? token
        : options.token(resource),
    principalId: claims.oid,
    observedAt: now,
    signal: globalThis.AbortSignal.any([
      globalThis.AbortSignal.timeout(20 * 60000),
      ...(ctx.signal ? [ctx.signal] : []),
    ]),
  };
}

function authorizationDenied(result, actions) {
  const error = result.value?.error;
  if (
    result.status !== 403 ||
    !['AuthorizationFailed', 'LinkedAuthorizationFailed'].includes(
      error?.code,
    ) ||
    !uuid.test(result.requestId ?? '') ||
    !uuid.test(result.correlationId ?? '') ||
    typeof error.message !== 'string'
  )
    return null;
  return (
    actions.find(
      (action) =>
        error.message.includes(`'${action}'`) ||
        error.message.includes(`"${action}"`),
    ) ?? null
  );
}

async function negative(
  ctx,
  guard,
  apiVersion,
  method,
  test,
  allowRbac = false,
  allowPatchPreservation = false,
) {
  const before = await read(ctx, guard.vaultId, apiVersion);
  vaultInvariant(before, ctx, guard.family);
  const body = writable(before);
  test.change(body);
  const result = await arm(ctx, guard.vaultId, apiVersion, { method, body });
  const after = await read(ctx, guard.vaultId, apiVersion);
  if (vaultHash(before) !== vaultHash(after))
    fail('negative resource changed; explicit human recovery required');
  const preserved =
    allowPatchPreservation &&
    method === 'PATCH' &&
    ['2024-11-01', '2026-02-01'].includes(apiVersion) &&
    test.caseId === 'missing-rbac' &&
    !Object.hasOwn(body.properties, 'enableRbacAuthorization') &&
    result.status === 200 &&
    uuid.test(result.requestId ?? '') &&
    uuid.test(result.correlationId ?? '');
  if (preserved) vaultInvariant(after, ctx, guard.family);
  const deniedAction =
    allowRbac && ['rbac', 'missing-rbac', 'recover-mode'].includes(test.caseId)
      ? authorizationDenied(result, [
          'Microsoft.Authorization/roleAssignments/write',
          'Microsoft.KeyVault/vaults/write',
        ])
      : null;
  if (!preserved && !policyDenied(result, guard) && !deniedAction)
    fail(
      'negative policy provenance unproven; human review required',
      result.status,
    );
  let outcome = 'policy-denied';
  if (deniedAction) outcome = 'rbac-denied';
  if (preserved) outcome = 'unchanged-preserved';
  const denialCode = deniedAction
    ? result.value.error.code
    : 'RequestDisallowedByPolicy';
  return {
    family: guard.family,
    apiVersion,
    method,
    caseId: test.caseId,
    action: 'Microsoft.KeyVault/vaults/write',
    outcome,
    status: result.status,
    ...(!preserved ? { denialCode } : {}),
    ...(deniedAction ? { deniedAction } : {}),
    assignmentId: guard.assignmentId,
    definitionId: guard.definitionId,
    requestId: result.requestId,
    correlationId: result.correlationId,
    beforeHash: vaultHash(before),
    afterHash: vaultHash(after),
  };
}

async function compliant(ctx, guard, apiVersion, method, qualificationId) {
  const before = await read(ctx, guard.vaultId, apiVersion);
  vaultInvariant(before, ctx, guard.family);
  const tag = 'equipment-vault-guard';
  if (
    Object.hasOwn(before.tags ?? {}, tag) ||
    Object.keys(before.tags ?? {}).length >= 49 ||
    !Array.isArray(before.properties.networkAcls.ipRules)
  )
    fail('owned admission precondition');
  const body = writable(before);
  const alreadyPresent = body.properties.networkAcls.ipRules.some(
    (rule) => rule.value === ctx.admissionCidr,
  );
  if (!alreadyPresent)
    body.properties.networkAcls.ipRules.push({ value: ctx.admissionCidr });
  body.tags[tag] = qualificationId;
  let primary;
  let admission;
  let cleanup;
  try {
    admission = await arm(ctx, guard.vaultId, apiVersion, { method, body });
    if (
      ![200, 201].includes(admission.status) ||
      !uuid.test(admission.requestId ?? '') ||
      !uuid.test(admission.correlationId ?? '')
    )
      fail('compliant admission', admission.status);
    const current = await read(ctx, guard.vaultId, apiVersion);
    vaultInvariant(current, ctx, guard.family);
    if (!equal(writable(current), body))
      fail('compliant admission preservation');
  } catch (error) {
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            'Azure vault guard compliant admission failed; private provider contents suppressed.',
          );
  }
  const cleanupContext = {
    ...ctx,
    signal: globalThis.AbortSignal.timeout(120000),
  };
  try {
    const current = await read(cleanupContext, guard.vaultId, apiVersion);
    if (current.tags?.[tag] === qualificationId) {
      const restore = writable(current);
      delete restore.tags[tag];
      if (!alreadyPresent)
        restore.properties.networkAcls.ipRules =
          restore.properties.networkAcls.ipRules.filter(
            (rule) => rule.value !== ctx.admissionCidr,
          );
      cleanup = await arm(cleanupContext, guard.vaultId, apiVersion, {
        method,
        body: restore,
      });
      if (
        ![200, 201].includes(cleanup.status) ||
        !uuid.test(cleanup.requestId ?? '') ||
        !uuid.test(cleanup.correlationId ?? '')
      )
        fail('compliant cleanup', cleanup.status);
    }
    const restored = await read(cleanupContext, guard.vaultId, apiVersion);
    if (vaultHash(restored) !== vaultHash(before))
      fail('compliant cleanup preservation');
  } catch {
    if (primary)
      throw new OperationalFailure(
        `${primary.message} Azure vault guard cleanup also failed; explicit human recovery required.`,
      );
    fail('compliant cleanup; explicit human recovery required');
  }
  if (primary) throw primary;
  if (!cleanup) fail('compliant cleanup ownership');
  return {
    family: guard.family,
    apiVersion,
    method,
    caseId: 'admission-cleanup',
    action: 'Microsoft.KeyVault/vaults/write',
    outcome: 'admission-cleanup',
    status: admission.status,
    cleanupStatus: cleanup.status,
    beforeHash: vaultHash(before),
    afterHash: vaultHash(before),
    requestId: admission.requestId,
    correlationId: admission.correlationId,
    cleanupRequestId: cleanup.requestId,
    cleanupCorrelationId: cleanup.correlationId,
  };
}

export async function qualifyVaultGuardPolicy(options) {
  return qualifyPolicy(options, true);
}

async function qualifyPolicy(options, allowPatchPreservation = false) {
  try {
    const ctx = await humanContext(options);
    const observed = await inspect(ctx);
    const qualificationId = randomUUID();
    const cases = [];
    for (const guard of observed.guards)
      for (const apiVersion of vaultGuardApiVersions)
        for (const method of ['PUT', 'PATCH']) {
          for (const test of negativeCases(
            ctx.principalId,
            ctx.config.tenantId,
          ))
            cases.push(
              await negative(
                ctx,
                guard,
                apiVersion,
                method,
                test,
                false,
                allowPatchPreservation,
              ),
            );
          cases.push(
            await compliant(ctx, guard, apiVersion, method, qualificationId),
          );
        }
    const current = await inspect(ctx);
    if (!equal(current.guards, observed.guards))
      fail('guard changed during qualification');
    return {
      version: 1,
      kind: cases.some((entry) => entry.outcome === 'unchanged-preserved')
        ? 'vault-policy-preservation-observation'
        : 'vault-policy-observation',
      qualificationId,
      environment: ctx.config.environment,
      generation: ctx.config.generation,
      tenantId: ctx.config.tenantId,
      subscriptionId: ctx.config.subscriptionId,
      publisherPrincipalId: ctx.principalId,
      sourceRevision: ctx.sourceRevision,
      sourceClosureHash: ctx.sourceClosureHash,
      observedAt: new Date(ctx.observedAt).toISOString(),
      expiresAt: new Date(ctx.observedAt + 24 * 60 * 60000).toISOString(),
      guards: observed.guards,
      cases,
    };
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    fail('policy qualification');
  }
}

const purposes = ['human-policy-family', 'workload-generation'];
const roleVersion = '2022-04-01';
const contributorRole = 'b24988ac-6180-42a0-ab88-20f7382dd24c';
const blobContributorRole = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe';
const now = (options) =>
  typeof options.now === 'function' ? options.now() : Date.now();
const probeName = (config) =>
  `erw${digest({ environment: config.environment, subscriptionId: config.subscriptionId }).slice(0, 12)}-g1probe`;
const probeId = (config, guard) =>
  `${guard.scope_ids.workload}/providers/Microsoft.KeyVault/vaults/${probeName(config)}`;
const deletedProbeId = (ctx) =>
  `/subscriptions/${ctx.config.subscriptionId}/providers/Microsoft.KeyVault/locations/${ctx.config.region}/deletedVaults/${probeName(ctx.config)}`;

function producer(ctx, purpose, principalId) {
  const name = purpose === 'human-policy-family' ? 'human' : 'apply';
  const expected = ctx.guard.producer_principal_ids?.[name];
  if (!uuid.test(expected ?? '') || principalId !== expected)
    fail('configured producer identity');
}

async function roles(ctx, apply = false) {
  const network = {};
  for (const family of ['recovery', 'workload']) {
    const expected = ctx.guard.role_definitions?.[`${family}_network`];
    const prefix = `${ctx.guard.scope_ids[family]}/providers/Microsoft.Authorization/roleDefinitions/`;
    if (
      !expected?.id?.startsWith(prefix) &&
      !expected?.id?.startsWith(
        `/subscriptions/${ctx.config.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/`,
      )
    )
      fail('role definition binding');
    if (
      !uuid.test(expected.id.split('/').at(-1)) ||
      !Array.isArray(expected.actions) ||
      !sha256.test(expected.sha256 ?? '')
    )
      fail('role definition binding');
    const lookupScope =
      family === 'workload'
        ? ctx.guard.scope_ids.workload
        : `${ctx.guard.scope_ids.recovery}/providers/Microsoft.Storage/storageAccounts/${ctx.guard.evidence_storage_account_name}/blobServices/default/containers/guard-evidence`;
    const actual = await read(
      ctx,
      `${lookupScope}/providers/Microsoft.Authorization/roleDefinitions/${expected.id.split('/').at(-1)}`,
      roleVersion,
    );
    const permissions = actual.properties?.permissions;
    if (
      !idEqual(actual.id, expected.id) ||
      permissions?.length !== 1 ||
      !Array.isArray(permissions[0].actions) ||
      (permissions[0].notActions ?? []).length ||
      (permissions[0].notDataActions ?? []).length ||
      (permissions[0].dataActions ?? []).length ||
      !equal(
        [...permissions[0].actions].sort(),
        [...expected.actions].sort(),
      ) ||
      digest({
        actions: [...permissions[0].actions].sort(),
        dataActions: [],
      }) !== expected.sha256 ||
      !equal(actual.properties.assignableScopes, [ctx.guard.scope_ids[family]])
    )
      fail('role definition drift');
    network[family] = { id: actual.id, hash: expected.sha256 };
  }
  const id = `/subscriptions/${ctx.config.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${contributorRole}`;
  const actual = await read(
    ctx,
    `${ctx.guard.scope_ids.workload}/providers/Microsoft.Authorization/roleDefinitions/${contributorRole}`,
    roleVersion,
  );
  if (
    !idEqual(actual.id, id) ||
    actual.properties?.roleType !== 'BuiltInRole' ||
    actual.properties.roleName !== 'Contributor' ||
    !Array.isArray(actual.properties.permissions)
  )
    fail('apply role definition');
  const result = {
    network,
    contributor: { id, hash: digest(actual.properties.permissions) },
  };
  if (apply) {
    const assignments = await read(
      ctx,
      `${ctx.guard.scope_ids.workload}/providers/Microsoft.Authorization/roleAssignments?$filter=atScope()`,
      roleVersion,
    );
    if (!Array.isArray(assignments.value) || assignments.nextLink)
      fail('apply assignment inspection');
    const matching = assignments.value.filter(
      (entry) =>
        entry.properties?.principalId ===
          ctx.guard.producer_principal_ids.apply &&
        idEqual(entry.properties.roleDefinitionId, id) &&
        idEqual(entry.properties.scope, ctx.guard.scope_ids.workload) &&
        !entry.properties.condition,
    );
    if (matching.length !== 1) fail('apply assignment authority');
    result.applyAssignment = {
      id: matching[0].id,
      scope: matching[0].properties.scope,
      principalId: matching[0].properties.principalId,
      roleDefinitionId: id,
      hash: digest(matching[0]),
    };
  }
  return result;
}

function storageContext(ctx, purpose) {
  if (!purposes.includes(purpose)) fail('evidence purpose');
  const container =
    purpose === 'human-policy-family'
      ? 'guard-evidence'
      : 'guard-apply-evidence';
  const key = purpose === 'human-policy-family' ? 'human' : 'apply';
  const account = ctx.guard.evidence_storage_account_name;
  if (
    !/^[a-z0-9]{3,24}$/.test(account ?? '') ||
    ctx.guard.evidence_container_names?.[key] !== container ||
    (ctx.storage &&
      (ctx.storage.account !== account || ctx.storage.container !== container))
  )
    fail('evidence container binding');
  const origin = ctx.blobOrigin ?? `https://${account}.blob.core.windows.net`;
  const parsed = new URL(origin);
  if (
    origin !== `https://${account}.blob.core.windows.net` &&
    !(
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.pathname === '/'
    )
  )
    fail('evidence transport binding');
  return {
    account,
    container,
    origin,
    accountId: `${ctx.guard.scope_ids.recovery}/providers/Microsoft.Storage/storageAccounts/${account}`,
    writer: ctx.guard.producer_principal_ids?.[key],
  };
}

async function evidenceAuthority(ctx, purpose) {
  const storage = storageContext(ctx, purpose);
  const account = await read(ctx, storage.accountId, '2025-06-01');
  if (
    !idEqual(account.id, storage.accountId) ||
    account.properties?.allowSharedKeyAccess !== false ||
    account.properties.allowBlobPublicAccess !== false ||
    account.properties.minimumTlsVersion !== 'TLS1_2'
  )
    fail('evidence storage protection');
  const scope = `${storage.accountId}/blobServices/default/containers/${storage.container}`;
  const container = await read(ctx, scope, '2025-06-01');
  await inspectPermissions(ctx, scope);
  if (
    !idEqual(container.id, scope) ||
    container.properties?.publicAccess !== 'None'
  )
    fail('evidence container protection');
  const assignments = await read(
    ctx,
    `${scope}/providers/Microsoft.Authorization/roleAssignments?$filter=atScope()`,
    roleVersion,
  );
  if (!Array.isArray(assignments.value) || assignments.nextLink)
    fail('evidence inherited authority inspection');
  let writer = false;
  for (const assignment of assignments.value) {
    const p = assignment.properties;
    if (
      !p ||
      typeof p.roleDefinitionId !== 'string' ||
      !p.roleDefinitionId.startsWith(
        `/subscriptions/${ctx.config.subscriptionId}/`,
      ) ||
      !uuid.test(p.roleDefinitionId.split('/').at(-1))
    )
      fail('evidence role identity');
    const definition = await read(
      ctx,
      `${scope}/providers/Microsoft.Authorization/roleDefinitions/${p.roleDefinitionId.split('/').at(-1)}`,
      roleVersion,
    );
    if (
      definition.id?.split('/').at(-1) !== p.roleDefinitionId.split('/').at(-1)
    )
      fail('evidence role canonical identity');
    const permissions = definition.properties?.permissions;
    if (!Array.isArray(permissions)) fail('evidence role definition');
    const writes = permissions
      .flatMap((permission) => permission.dataActions ?? [])
      .some((action) => !action.toLowerCase().endsWith('/read'));
    if (writes) {
      if (
        p.principalId !== storage.writer ||
        !idEqual(p.scope, scope) ||
        p.condition ||
        p.roleDefinitionId.split('/').at(-1) !== blobContributorRole
      )
        fail('evidence unexpected inherited writer');
      writer = true;
    }
  }
  if (!writer) fail('evidence configured writer missing');
  return storage;
}

async function blob(ctx, purpose, reference, method = 'GET', record) {
  const storage = storageContext(ctx, purpose);
  if (
    !/^(?:policy|generation|consumed|plan-bindings)\/[a-f0-9-]{36}\.json$/.test(
      reference,
    ) ||
    reference.includes('..')
  )
    fail('evidence reference');
  let response;
  try {
    response = await (ctx.fetch ?? globalThis.fetch)(
      `${storage.origin}/${storage.container}/${reference}`,
      {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${await ctx.token('https://storage.azure.com/')}`,
          'x-ms-version': '2023-11-03',
          'x-ms-date': new Date(now(ctx)).toUTCString(),
          ...(method === 'PUT'
            ? {
                'Content-Type': 'application/json',
                'x-ms-blob-type': 'BlockBlob',
                'If-None-Match': '*',
              }
            : {}),
        },
        ...(record ? { body: JSON.stringify(canonical(record)) } : {}),
        signal: globalThis.AbortSignal.any([
          globalThis.AbortSignal.timeout(30000),
          ...(ctx.signal ? [ctx.signal] : []),
        ]),
      },
    );
  } catch {
    fail('private evidence transport');
  }
  if (method === 'PUT') {
    await response.body?.cancel();
    if (response.status !== 201)
      fail(
        response.status === 412
          ? 'evidence replay or overwrite'
          : 'evidence publication',
        response.status,
      );
    return null;
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    fail('private evidence read', response.status);
  }
  return responseBody(response);
}

function familyTuple(ctx, guards, roleState) {
  return digest({
    environment: ctx.config.environment,
    tenantId: ctx.config.tenantId,
    subscriptionId: ctx.config.subscriptionId,
    recoveryVaultId: ctx.guard.recovery_vault_id,
    sourceClosureHash: ctx.sourceClosureHash,
    producerPrincipalIds: ctx.guard.producer_principal_ids,
    guards: guards.map((guard) =>
      Object.fromEntries(
        Object.entries(guard).filter(
          ([key]) => !['vaultId', 'bindingHash'].includes(key),
        ),
      ),
    ),
    roles: { network: roleState.network, contributor: roleState.contributor },
  });
}

async function initialProbe(options) {
  if (!/^[a-z0-9]+$/.test(options.config.region ?? '')) fail('probe region');
  const id = probeId(options.config, options.guard);
  if (options.workloadVaultId && !idEqual(options.workloadVaultId, id))
    fail('probe target cannot adopt production vault');
  const ctx = await humanContext({ ...options, workloadVaultId: id });
  producer(ctx, 'human-policy-family', ctx.principalId);
  await inspect(ctx, true);
  const roleState = await roles(ctx);
  await evidenceAuthority(ctx, 'human-policy-family');
  for (const api of vaultGuardApiVersions) {
    const active = await arm(ctx, id, api);
    const deleted = await arm(ctx, deletedProbeId(ctx), api);
    if (active.status !== 404 || deleted.status !== 404)
      fail('probe collision; explicit human review required');
  }
  const owner = randomUUID();
  const creationTime = now(ctx);
  const body = {
    location: ctx.config.region,
    tags: {
      application: 'equipment-reservations',
      environment: ctx.config.environment,
      'equipment-vault-guard-probe': owner,
    },
    properties: {
      tenantId: ctx.config.tenantId,
      sku: { family: 'A', name: 'standard' },
      enableRbacAuthorization: true,
      enablePurgeProtection: true,
      enableSoftDelete: true,
      softDeleteRetentionInDays: 90,
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
    },
  };
  const created = await arm(ctx, id, '2026-02-01', {
    method: 'PUT',
    body,
    headers: { 'If-None-Match': '*' },
  });
  const owned = (vault) =>
    idEqual(vault?.id, id) &&
    vault.location === ctx.config.region &&
    vault.tags?.['equipment-vault-guard-probe'] === owner &&
    vault.systemData?.createdBy === ctx.principalId &&
    vault.systemData.createdByType === 'User' &&
    Number.isFinite(Date.parse(vault.systemData.createdAt)) &&
    Date.parse(vault.systemData.createdAt) >= creationTime - 60000;
  if (
    created.status !== 201 ||
    !uuid.test(created.requestId ?? '') ||
    !owned(created.value)
  )
    fail(
      'probe create ownership uncertain; explicit human review required',
      created.status,
    );
  let record;
  let primary;
  let cleanup;
  try {
    const current = await read(ctx, id, '2026-02-01');
    if (!owned(current)) fail('probe ownership changed');
    record = await qualifyPolicy({ ...ctx, now: () => now(ctx) });
    record.roles = roleState;
  } catch (error) {
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            'Azure vault guard probe qualification failed; private provider contents suppressed.',
          );
  }
  const cleanupContext = {
    ...ctx,
    signal: globalThis.AbortSignal.timeout(120000),
  };
  try {
    const current = await read(cleanupContext, id, '2026-02-01');
    if (!owned(current)) fail('probe cleanup ownership');
    const removed = await arm(cleanupContext, id, '2026-02-01', {
      method: 'DELETE',
    });
    if (
      ![200, 202, 204].includes(removed.status) ||
      !uuid.test(removed.requestId ?? '')
    )
      fail('probe delete', removed.status);
    const until = Date.now() + 120000;
    while (true) {
      const active = await arm(cleanupContext, id, '2026-02-01');
      const deleted = await arm(
        cleanupContext,
        deletedProbeId(ctx),
        '2026-02-01',
      );
      if (active.status === 404 && deleted.status === 200) {
        if (
          !idEqual(deleted.value?.properties?.vaultId, id) ||
          deleted.value.properties.location !== ctx.config.region
        )
          fail('probe soft-delete identity');
        cleanup = {
          vaultId: id,
          location: ctx.config.region,
          createRequestId: created.requestId,
          deleteRequestId: removed.requestId,
          softDeleteHash: digest(deleted.value),
        };
        break;
      }
      if (
        Date.now() >= until ||
        ![200, 404].includes(active.status) ||
        ![200, 404].includes(deleted.status)
      )
        fail('probe soft-delete uncertainty');
      await delay(1000, undefined, { signal: cleanupContext.signal });
    }
  } catch {
    if (primary)
      throw new OperationalFailure(
        `${primary.message} Azure vault guard probe cleanup also failed; explicit human recovery required.`,
      );
    fail('probe cleanup; explicit human recovery required');
  }
  if (primary) throw primary;
  return { ctx, observation: record, probe: cleanup };
}

function recordShape(
  ctx,
  observation,
  purpose,
  roleState,
  probe = null,
  familyHandle = null,
) {
  return {
    version: 1,
    mode: purpose,
    qualificationId: observation.qualificationId,
    environment: ctx.config.environment,
    tenantId: ctx.config.tenantId,
    subscriptionId: ctx.config.subscriptionId,
    generation: ctx.config.generation,
    producerPrincipalId: observation.publisherPrincipalId,
    issuedAt: observation.observedAt,
    expiresAt: purpose === 'human-policy-family' ? null : observation.expiresAt,
    sourceRevision: ctx.sourceRevision,
    sourceClosureHash: ctx.sourceClosureHash,
    guards: observation.guards,
    roles: roleState,
    tupleHash: familyTuple(ctx, observation.guards, roleState),
    cases: observation.cases,
    probe,
    familyHandle,
  };
}

export async function qualifyVaultGuards(options) {
  try {
    if (options.purpose === 'workload-generation')
      return await publishGeneration(options);
    if (options.purpose !== 'human-policy-family') fail('evidence purpose');
    const { ctx, observation, probe } = await initialProbe(options);
    const record = recordShape(
      ctx,
      observation,
      options.purpose,
      observation.roles,
      probe,
    );
    const reference = `policy/${record.qualificationId}.json`;
    await blob(ctx, options.purpose, reference, 'PUT', record);
    return {
      reference,
      digest: digest(record),
      purpose: options.purpose,
      record,
    };
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    fail('qualification publication');
  }
}

function proofProjection(ctx, record, handle) {
  return {
    version: 1,
    environment: record.environment,
    source_revision: record.sourceRevision,
    qualification_id: record.qualificationId,
    evidence_sha256: handle.digest,
    definition_sha256: ctx.guard.definition_sha256,
    recovery_assignment_id: ctx.guard.assignment_ids.recovery,
    workload_assignment_id: ctx.guard.assignment_ids.workload,
    recovery_vault_id: ctx.guard.recovery_vault_id,
    observed_at: record.issuedAt,
  };
}

export async function validateVaultGuardEvidence(options) {
  try {
    if (options.purpose === 'workload-generation')
      return await validateGeneration(options);
    if (options.purpose !== 'human-policy-family') fail('evidence purpose');
    const ctx = context({
      ...options,
      workloadVaultId: probeId(options.config, options.guard),
    });
    const handle = options.handle;
    if (
      !handle ||
      handle.purpose !== options.purpose ||
      !sha256.test(handle.digest ?? '') ||
      !/^policy\/[a-f0-9-]{36}\.json$/.test(handle.reference ?? '')
    )
      fail('evidence handle');
    await evidenceAuthority(ctx, options.purpose);
    const record = await blob(ctx, options.purpose, handle.reference);
    const keys =
      'cases,environment,expiresAt,familyHandle,generation,guards,issuedAt,mode,probe,producerPrincipalId,qualificationId,roles,sourceClosureHash,sourceRevision,subscriptionId,tenantId,tupleHash,version';
    if (
      !record ||
      Object.keys(record).sort().join(',') !== keys ||
      record.version !== 1 ||
      record.mode !== options.purpose ||
      digest(record) !== handle.digest ||
      record.environment !== ctx.config.environment ||
      record.tenantId !== ctx.config.tenantId ||
      record.subscriptionId !== ctx.config.subscriptionId ||
      record.sourceClosureHash !== ctx.sourceClosureHash ||
      !/^[a-f0-9]{40}$/.test(record.sourceRevision ?? '') ||
      record.expiresAt !== null ||
      record.familyHandle !== null ||
      !uuid.test(record.qualificationId ?? '') ||
      handle.reference !== `policy/${record.qualificationId}.json` ||
      !Number.isFinite(Date.parse(record.issuedAt)) ||
      Date.parse(record.issuedAt) > now(ctx) ||
      !idEqual(record.probe?.vaultId, ctx.vaults.workload) ||
      !uuid.test(record.probe?.createRequestId ?? '') ||
      !uuid.test(record.probe?.deleteRequestId ?? '') ||
      !sha256.test(record.probe?.softDeleteHash ?? '')
    )
      fail('human family evidence binding');
    producer(ctx, options.purpose, record.producerPrincipalId);
    const observed = await inspect(ctx, true);
    const currentRoles = await roles(ctx);
    if (
      record.tupleHash !== familyTuple(ctx, record.guards, record.roles) ||
      record.tupleHash !== familyTuple(ctx, observed.guards, currentRoles) ||
      !equal(record.roles, currentRoles)
    )
      fail('current family tuple drift');
    const expected = [];
    for (const guard of record.guards)
      for (const apiVersion of vaultGuardApiVersions)
        for (const method of ['PUT', 'PATCH']) {
          for (const test of negativeCases(
            record.producerPrincipalId,
            ctx.config.tenantId,
          ))
            expected.push(
              `${guard.family}/${apiVersion}/${method}/${test.caseId}`,
            );
          expected.push(
            `${guard.family}/${apiVersion}/${method}/admission-cleanup`,
          );
        }
    if (
      !Array.isArray(record.guards) ||
      record.guards.length !== 2 ||
      !equal(record.guards.map((guard) => guard.family).sort(), [
        'recovery',
        'workload',
      ]) ||
      !Array.isArray(record.cases) ||
      record.cases.length !== expected.length ||
      new Set(
        record.cases.map(
          (entry) =>
            `${entry.family}/${entry.apiVersion}/${entry.method}/${entry.caseId}`,
        ),
      ).size !== expected.length
    )
      fail('family matrix completeness');
    for (const entry of record.cases) {
      const key = `${entry.family}/${entry.apiVersion}/${entry.method}/${entry.caseId}`;
      if (
        !expected.includes(key) ||
        !sha256.test(entry.beforeHash ?? '') ||
        entry.beforeHash !== entry.afterHash ||
        !uuid.test(entry.requestId ?? '') ||
        !uuid.test(entry.correlationId ?? '') ||
        entry.action !== 'Microsoft.KeyVault/vaults/write'
      )
        fail('family matrix provenance');
      if (entry.caseId === 'admission-cleanup') {
        if (
          entry.outcome !== 'admission-cleanup' ||
          ![200, 201].includes(entry.status) ||
          ![200, 201].includes(entry.cleanupStatus) ||
          !uuid.test(entry.cleanupRequestId ?? '') ||
          !uuid.test(entry.cleanupCorrelationId ?? '')
        )
          fail('family compliant matrix');
      } else if (
        entry.outcome !== 'policy-denied' ||
        entry.denialCode !== 'RequestDisallowedByPolicy' ||
        ![400, 403].includes(entry.status) ||
        !idEqual(entry.assignmentId, ctx.guard.assignment_ids[entry.family]) ||
        !idEqual(entry.definitionId, ctx.guard.definition_id)
      )
        fail('family negative matrix');
    }
    return proofProjection(ctx, record, handle);
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    fail('evidence validation');
  }
}

function handleOnly(handle) {
  return {
    reference: handle.reference,
    digest: handle.digest,
    purpose: handle.purpose,
  };
}

function referenceContext(options, mode) {
  const ctx = context({
    ...options,
    workloadVaultId:
      options.workloadVaultId ?? probeId(options.config, options.guard),
  });
  const family = mode === 'family';
  if (!family && mode !== 'ordinary-activation') fail('pointer mode');
  const reference = family
    ? `current/${ctx.config.environment}.json`
    : `current/${ctx.config.environment}/${ctx.config.generation}.json`;
  if (
    ctx.guard[
      family ? 'current_family_reference' : 'current_activation_reference'
    ] !== reference
  )
    fail('pointer fixed locator');
  const purpose = family ? 'human-policy-family' : 'workload-generation';
  return {
    ...ctx,
    pointerMode: mode,
    pointerReference: reference,
    pointerPurpose: purpose,
  };
}

async function pointerExchange(
  ctx,
  { method = 'GET', record, etag, leaseId, leaseAction, signal } = {},
) {
  const storage = storageContext(ctx, ctx.pointerPurpose);
  let response;
  try {
    response = await (ctx.fetch ?? globalThis.fetch)(
      `${storage.origin}/${storage.container}/${ctx.pointerReference}${leaseAction ? '?comp=lease' : ''}`,
      {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${await ctx.token('https://storage.azure.com/')}`,
          'x-ms-version': '2023-11-03',
          'x-ms-date': new Date(now(ctx)).toUTCString(),
          ...(record
            ? {
                'Content-Type': 'application/json',
                'x-ms-blob-type': 'BlockBlob',
                ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
              }
            : {}),
          ...(leaseAction
            ? {
                'x-ms-lease-action': leaseAction,
                ...(leaseAction === 'acquire'
                  ? {
                      'x-ms-lease-duration': '60',
                      'x-ms-proposed-lease-id': leaseId,
                    }
                  : { 'x-ms-lease-id': leaseId }),
              }
            : leaseId
              ? { 'x-ms-lease-id': leaseId }
              : {}),
        },
        ...(record ? { body: JSON.stringify(canonical(record)) } : {}),
        signal: globalThis.AbortSignal.any([
          globalThis.AbortSignal.timeout(30000),
          ...((signal ?? ctx.signal) ? [signal ?? ctx.signal] : []),
        ]),
      },
    );
  } catch {
    fail('pointer transport or uncertain completion');
  }
  if (leaseAction) {
    await response.body?.cancel();
    if (
      response.status !== (leaseAction === 'acquire' ? 201 : 200) ||
      (leaseAction === 'acquire' &&
        response.headers.get('x-ms-lease-id') !== leaseId)
    )
      fail(`pointer lease ${leaseAction}`, response.status);
    return null;
  }
  if (method === 'PUT') {
    await response.body?.cancel();
    if (response.status !== 201)
      fail('pointer conditional publication', response.status);
    return null;
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    fail('pointer read', response.status);
  }
  const actualEtag = response.headers.get('etag');
  if (!/^"[^"\r\n]{1,200}"$/.test(actualEtag ?? '')) {
    await response.body?.cancel();
    fail('pointer ETag');
  }
  return { record: await responseBody(response), etag: actualEtag };
}

function pointerShape(ctx, record) {
  if (
    !record ||
    Object.keys(record).sort().join(',') !==
      'activationHandle,bindingHandle,consumptionHandle,environment,familyHandle,generation,generationHandle,mode,producerPrincipalId,tupleHash,version' ||
    record.version !== 1 ||
    record.mode !== ctx.pointerMode ||
    record.environment !== ctx.config.environment ||
    record.generation !==
      (ctx.pointerMode === 'family' ? null : ctx.config.generation) ||
    !sha256.test(record.tupleHash ?? '')
  )
    fail('pointer strict schema');
  producer(ctx, ctx.pointerPurpose, record.producerPrincipalId);
  if (
    !record.familyHandle ||
    Object.keys(record.familyHandle).sort().join(',') !==
      'digest,purpose,reference' ||
    record.familyHandle.purpose !== 'human-policy-family' ||
    !sha256.test(record.familyHandle.digest ?? '') ||
    !/^policy\/[a-f0-9-]{36}\.json$/.test(record.familyHandle.reference ?? '')
  )
    fail('pointer family handle');
  if (
    ctx.pointerMode === 'family' &&
    [
      'generationHandle',
      'consumptionHandle',
      'bindingHandle',
      'activationHandle',
    ].some((key) => record[key] !== null)
  )
    fail('pointer family-only handles');
}

async function validateFamilyPointer(ctx, record) {
  pointerShape(ctx, record);
  await validateVaultGuardEvidence({
    ...ctx,
    purpose: 'human-policy-family',
    handle: record.familyHandle,
  });
  const family = await blob(
    ctx,
    'human-policy-family',
    record.familyHandle.reference,
  );
  if (record.tupleHash !== family.tupleHash)
    fail('pointer current family tuple');
  return family;
}

async function historicalFamilyPointer(ctx, pointer) {
  pointerShape(ctx, pointer);
  await evidenceAuthority(ctx, 'human-policy-family');
  const record = await blob(
    ctx,
    'human-policy-family',
    pointer.familyHandle.reference,
  );
  const keys =
    'cases,environment,expiresAt,familyHandle,generation,guards,issuedAt,mode,probe,producerPrincipalId,qualificationId,roles,sourceClosureHash,sourceRevision,subscriptionId,tenantId,tupleHash,version';
  if (
    !record ||
    Object.keys(record).sort().join(',') !== keys ||
    record.version !== 1 ||
    record.mode !== 'human-policy-family' ||
    digest(record) !== pointer.familyHandle.digest ||
    record.tupleHash !== pointer.tupleHash ||
    !sha256.test(record.tupleHash ?? '') ||
    record.environment !== ctx.config.environment ||
    record.tenantId !== ctx.config.tenantId ||
    record.subscriptionId !== ctx.config.subscriptionId ||
    !/^\w{4,12}$/.test(record.generation ?? '') ||
    !uuid.test(record.qualificationId ?? '') ||
    pointer.familyHandle.reference !==
      `policy/${record.qualificationId}.json` ||
    record.expiresAt !== null ||
    record.familyHandle !== null ||
    !sha256.test(record.sourceClosureHash ?? '') ||
    !/^[a-f0-9]{40}$/.test(record.sourceRevision ?? '') ||
    !Number.isFinite(Date.parse(record.issuedAt)) ||
    Date.parse(record.issuedAt) > now(ctx) ||
    !Array.isArray(record.guards) ||
    record.guards.length !== 2 ||
    !equal(record.guards.map((guard) => guard.family).sort(), [
      'recovery',
      'workload',
    ]) ||
    !record.roles ||
    !Array.isArray(record.cases) ||
    !record.cases.length
  )
    fail('historical family pointer integrity');
  producer(ctx, 'human-policy-family', record.producerPrincipalId);
  return record;
}

export async function resolveVaultGuardFamily(options) {
  return guardBoundary(
    () => resolveGuardFamily(options),
    'pointer family resolution',
  );
}

async function resolveGuardFamily(options) {
  const ctx = referenceContext(options, 'family');
  await evidenceAuthority(ctx, 'human-policy-family');
  const selected = await pointerExchange(ctx);
  if (!selected) fail('pointer family not published');
  await validateFamilyPointer(ctx, selected.record);
  return { familyHandle: handleOnly(selected.record.familyHandle) };
}

function activationHandles(ctx, record) {
  pointerShape(ctx, record);
  const id = /^generation\/([a-f0-9-]{36})\.json$/.exec(
    record.generationHandle?.reference ?? '',
  )?.[1];
  if (!uuid.test(id ?? '')) fail('pointer generation handle');
  for (const [key, purpose, reference] of [
    ['generationHandle', 'workload-generation', `generation/${id}.json`],
    [
      'consumptionHandle',
      'guard-generation-consumption',
      `consumed/${id}.json`,
    ],
    ['bindingHandle', 'guard-plan-binding', `plan-bindings/${id}.json`],
  ]) {
    const handle = record[key];
    if (
      !handle ||
      Object.keys(handle).sort().join(',') !== 'digest,purpose,reference' ||
      handle.purpose !== purpose ||
      handle.reference !== reference ||
      !sha256.test(handle.digest ?? '')
    )
      fail('pointer exact activation handles');
  }
  const handle = record.activationHandle;
  if (
    !handle ||
    Object.keys(handle).sort().join(',') !== 'digest,reference' ||
    handle.reference !== `activation/${ctx.config.generation}/${id}.json` ||
    !sha256.test(handle.digest ?? '')
  )
    fail('pointer completed activation handle');
}

async function completedPointerRecord(ctx, record) {
  activationHandles(ctx, record);
  const selected = await pointerExchange({
    ...ctx,
    pointerReference: record.activationHandle.reference,
  });
  if (
    !selected ||
    digest(selected.record) !== record.activationHandle.digest ||
    selected.record.mode !== 'guard-application-activation' ||
    selected.record.producerPrincipalId !==
      ctx.guard.producer_principal_ids.apply ||
    selected.record.generation !== ctx.config.generation ||
    selected.record.environment !== ctx.config.environment ||
    selected.record.qualificationDigest !== record.generationHandle.digest ||
    selected.record.consumptionDigest !== record.consumptionHandle.digest ||
    selected.record.bindingDigest !== record.bindingHandle.digest ||
    selected.record.familyDigest !== record.familyHandle.digest ||
    !Number.isFinite(Date.parse(selected.record.completedAt)) ||
    Date.parse(selected.record.completedAt) > now(ctx)
  )
    fail('pointer completed activation record');
  return selected.record;
}

async function validateActivationPointer(ctx, record) {
  activationHandles(ctx, record);
  const currentFamily = await resolveVaultGuardFamily(ctx);
  if (!equal(currentFamily.familyHandle, record.familyHandle))
    fail('pointer family substitution');
  const generation = await blob(
    ctx,
    'workload-generation',
    record.generationHandle.reference,
  );
  if (
    !generation ||
    digest(generation) !== record.generationHandle.digest ||
    generation.tupleHash !== record.tupleHash
  )
    fail('pointer generation tuple');
  const completed = await completedPointerRecord(ctx, record);
  await validateVaultGuardEvidence({
    ...ctx,
    purpose: 'workload-generation',
    usage: 'active',
    handle: record.generationHandle,
    familyHandle: record.familyHandle,
    consumptionHandle: record.consumptionHandle,
    bindingHandle: record.bindingHandle,
  });
  const observedAgain = await completedPointerRecord(ctx, record);
  if (!equal(completed, observedAgain))
    fail('pointer activation changed during observation');
  return completed;
}

export async function resolveVaultGuardActivation(options) {
  return guardBoundary(
    () => resolveGuardActivation(options),
    'pointer activation resolution',
  );
}

async function resolveGuardActivation(options) {
  const ctx = referenceContext(options, 'ordinary-activation');
  await evidenceAuthority(ctx, 'workload-generation');
  const selected = await pointerExchange(ctx);
  if (!selected) fail('pointer activation not published');
  await validateActivationPointer(ctx, selected.record);
  return Object.fromEntries(
    [
      'familyHandle',
      'generationHandle',
      'consumptionHandle',
      'bindingHandle',
      'activationHandle',
    ].map((key) => [key, canonical(selected.record[key])]),
  );
}

async function publishActivationReference(options) {
  const ctx = await applyContext(
    referenceContext(options, 'ordinary-activation'),
  );
  await actualLease(ctx);
  const generation = await blob(
    ctx,
    'workload-generation',
    options.generationHandle?.reference,
  );
  if (!generation || digest(generation) !== options.generationHandle?.digest)
    fail('pointer generation record');
  const record = {
    version: 1,
    mode: 'ordinary-activation',
    environment: ctx.config.environment,
    generation: ctx.config.generation,
    producerPrincipalId: ctx.guard.producer_principal_ids.apply,
    familyHandle: handleOnly(options.familyHandle),
    generationHandle: handleOnly(options.generationHandle),
    consumptionHandle: handleOnly(options.consumptionHandle),
    bindingHandle: handleOnly(options.bindingHandle),
    activationHandle: {
      reference: options.activationHandle?.reference,
      digest: options.activationHandle?.digest,
    },
    tupleHash: generation.tupleHash,
  };
  const completed = await validateActivationPointer(ctx, record);
  const previous = await pointerExchange(ctx);
  if (previous) {
    const older = await completedPointerRecord(ctx, previous.record);
    if (Date.parse(older.completedAt) > Date.parse(completed.completedAt))
      fail('pointer activation rollback');
  }
  await actualLease(ctx);
  await pointerExchange(ctx, {
    method: 'PUT',
    record,
    ...(previous ? { etag: previous.etag } : {}),
  });
  await actualLease(ctx);
}

export async function publishVaultGuardReference(options) {
  return guardBoundary(
    () => publishGuardReference(options),
    'pointer publication',
  );
}

async function publishGuardReference(options) {
  if (options.mode === 'ordinary-activation')
    return publishActivationReference(options);
  if (options.mode !== 'family')
    fail('pointer completed activation publisher prerequisite');
  let ctx = referenceContext(options, 'family');
  ctx = await humanContext(ctx);
  producer(ctx, 'human-policy-family', ctx.principalId);
  await validateVaultGuardEvidence({
    ...ctx,
    purpose: 'human-policy-family',
    handle: options.familyHandle,
  });
  const family = await blob(
    ctx,
    'human-policy-family',
    options.familyHandle.reference,
  );
  const record = {
    version: 1,
    mode: 'family',
    environment: ctx.config.environment,
    generation: null,
    producerPrincipalId: ctx.principalId,
    familyHandle: handleOnly(options.familyHandle),
    generationHandle: null,
    consumptionHandle: null,
    bindingHandle: null,
    activationHandle: null,
    tupleHash: family.tupleHash,
  };
  await validateFamilyPointer(ctx, record);
  const previous = await pointerExchange(ctx);
  if (!previous) {
    await pointerExchange(ctx, { method: 'PUT', record });
    return;
  }
  const leaseId = randomUUID();
  await pointerExchange(ctx, {
    method: 'PUT',
    leaseAction: 'acquire',
    leaseId,
  });
  let primary;
  try {
    const selected = await pointerExchange(ctx, { leaseId });
    if (
      !selected ||
      selected.etag !== previous.etag ||
      !equal(selected.record, previous.record)
    )
      fail('pointer concurrent update');
    const oldFamily = await historicalFamilyPointer(ctx, selected.record);
    if (Date.parse(oldFamily.issuedAt) > Date.parse(family.issuedAt))
      fail('pointer rollback');
    await pointerExchange(ctx, {
      method: 'PUT',
      record,
      etag: selected.etag,
      leaseId,
    });
  } catch (error) {
    primary = error;
  }
  try {
    await pointerExchange(ctx, {
      method: 'PUT',
      leaseAction: 'release',
      leaseId,
      signal: globalThis.AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (primary)
      throw new OperationalFailure(
        `${primary.message} Cleanup: ${error.message}`,
      );
    throw error;
  }
  if (primary) throw primary;
}

async function applyContext(options) {
  const ctx = context(options);
  const token = await ctx.token('https://management.azure.com/');
  let claims;
  try {
    claims = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    );
  } catch {
    fail('actual apply identity');
  }
  if (
    claims?.tid !== ctx.config.tenantId ||
    !uuid.test(claims.oid ?? '') ||
    !uuid.test(claims.appid ?? '') ||
    claims.scp ||
    claims.idtyp === 'user' ||
    ![
      'https://management.azure.com/',
      'https://management.core.windows.net/',
    ].includes(claims.aud) ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now(ctx) + 30000
  )
    fail('actual apply identity');
  producer(ctx, 'workload-generation', claims.oid);
  if (
    typeof options.admissionCidr !== 'string' ||
    !options.admissionCidr.endsWith('/32') ||
    isIP(options.admissionCidr.slice(0, -3)) !== 4
  )
    fail('admission CIDR');
  return {
    ...ctx,
    principalId: claims.oid,
    observedAt: now(ctx),
    token: async (resource) =>
      resource === 'https://management.azure.com/'
        ? token
        : options.token(resource),
    signal: globalThis.AbortSignal.any([
      globalThis.AbortSignal.timeout(20 * 60000),
      ...(ctx.signal ? [ctx.signal] : []),
    ]),
  };
}

async function childCase(ctx, guard, apiVersion) {
  const before = await read(ctx, guard.vaultId, apiVersion);
  const result = await arm(
    ctx,
    `${guard.vaultId}/accessPolicies/add`,
    apiVersion,
    {
      method: 'PUT',
      body: {
        properties: {
          accessPolicies: [
            {
              tenantId: ctx.config.tenantId,
              objectId: ctx.principalId,
              permissions: { secrets: ['get'] },
            },
          ],
        },
      },
    },
  );
  const after = await read(ctx, guard.vaultId, apiVersion);
  const deniedAction = authorizationDenied(result, [
    'Microsoft.KeyVault/vaults/accessPolicies/write',
  ]);
  if (vaultHash(before) !== vaultHash(after))
    fail('child negative changed resource; human review required');
  if (!policyDenied(result, guard) && !deniedAction)
    fail('child denial provenance unproven', result.status);
  return {
    family: 'workload',
    apiVersion,
    method: 'PUT',
    caseId: 'child-accessPolicies',
    action: 'Microsoft.KeyVault/vaults/accessPolicies/write',
    outcome: deniedAction ? 'rbac-denied' : 'policy-denied',
    status: result.status,
    denialCode: deniedAction
      ? result.value.error.code
      : 'RequestDisallowedByPolicy',
    ...(deniedAction ? { deniedAction } : {}),
    assignmentId: guard.assignmentId,
    definitionId: guard.definitionId,
    requestId: result.requestId,
    correlationId: result.correlationId,
    beforeHash: vaultHash(before),
    afterHash: vaultHash(after),
  };
}

async function publishGeneration(options) {
  const ctx = await applyContext(options);
  if (
    !options.familyHandle ||
    options.familyHandle.purpose !== 'human-policy-family'
  )
    fail('human family prerequisite');
  await validateVaultGuardEvidence({
    ...options,
    purpose: 'human-policy-family',
    storage: undefined,
    handle: options.familyHandle,
  });
  await evidenceAuthority(ctx, 'workload-generation');
  const observed = await inspect(ctx);
  const roleState = await roles(ctx, true);
  const guard = observed.guards.find((entry) => entry.family === 'workload');
  const qualificationId = randomUUID();
  const cases = [];
  for (const apiVersion of vaultGuardApiVersions) {
    for (const method of ['PUT', 'PATCH']) {
      for (const test of negativeCases(ctx.principalId, ctx.config.tenantId))
        cases.push(await negative(ctx, guard, apiVersion, method, test, true));
      cases.push(
        await compliant(ctx, guard, apiVersion, method, qualificationId),
      );
    }
    cases.push(await childCase(ctx, guard, apiVersion));
  }
  const current = await inspect(ctx);
  const currentRoles = await roles(ctx, true);
  if (
    !equal(current.guards, observed.guards) ||
    !equal(currentRoles, roleState)
  )
    fail('generation tuple changed during qualification');
  const observation = {
    qualificationId,
    publisherPrincipalId: ctx.principalId,
    observedAt: new Date(ctx.observedAt).toISOString(),
    expiresAt: new Date(ctx.observedAt + 24 * 60 * 60000).toISOString(),
    guards: observed.guards,
    cases,
  };
  const record = recordShape(
    ctx,
    observation,
    'workload-generation',
    roleState,
    null,
    handleOnly(options.familyHandle),
  );
  const reference = `generation/${qualificationId}.json`;
  await blob(ctx, 'workload-generation', reference, 'PUT', record);
  return {
    reference,
    digest: digest(record),
    purpose: 'workload-generation',
    record,
  };
}

function generationMatrix(ctx, record) {
  const expected = [];
  for (const apiVersion of vaultGuardApiVersions) {
    for (const method of ['PUT', 'PATCH']) {
      for (const test of negativeCases(
        record.producerPrincipalId,
        ctx.config.tenantId,
      ))
        expected.push(`${apiVersion}/${method}/${test.caseId}`);
      expected.push(`${apiVersion}/${method}/admission-cleanup`);
    }
    expected.push(`${apiVersion}/PUT/child-accessPolicies`);
  }
  if (
    !Array.isArray(record.cases) ||
    record.cases.length !== expected.length ||
    new Set(
      record.cases.map(
        (entry) => `${entry.apiVersion}/${entry.method}/${entry.caseId}`,
      ),
    ).size !== expected.length
  )
    fail('generation matrix completeness');
  for (const entry of record.cases) {
    if (
      entry.family !== 'workload' ||
      !expected.includes(
        `${entry.apiVersion}/${entry.method}/${entry.caseId}`,
      ) ||
      !sha256.test(entry.beforeHash ?? '') ||
      entry.beforeHash !== entry.afterHash ||
      !uuid.test(entry.requestId ?? '') ||
      !uuid.test(entry.correlationId ?? '')
    )
      fail('generation matrix provenance');
    if (entry.caseId === 'admission-cleanup') {
      if (
        entry.outcome !== 'admission-cleanup' ||
        ![200, 201].includes(entry.status) ||
        ![200, 201].includes(entry.cleanupStatus) ||
        !uuid.test(entry.cleanupRequestId ?? '') ||
        !uuid.test(entry.cleanupCorrelationId ?? '')
      )
        fail('generation compliant matrix');
      continue;
    }
    const child = entry.caseId === 'child-accessPolicies';
    if (
      entry.action !==
      (child
        ? 'Microsoft.KeyVault/vaults/accessPolicies/write'
        : 'Microsoft.KeyVault/vaults/write')
    )
      fail('generation action binding');
    if (entry.outcome === 'rbac-denied') {
      if (
        ![
          'rbac',
          'missing-rbac',
          'recover-mode',
          'child-accessPolicies',
        ].includes(entry.caseId) ||
        entry.status !== 403 ||
        !['AuthorizationFailed', 'LinkedAuthorizationFailed'].includes(
          entry.denialCode,
        ) ||
        !(
          child
            ? ['Microsoft.KeyVault/vaults/accessPolicies/write']
            : [
                'Microsoft.Authorization/roleAssignments/write',
                'Microsoft.KeyVault/vaults/write',
              ]
        ).includes(entry.deniedAction)
      )
        fail('generation RBAC provenance');
    } else if (
      entry.outcome !== 'policy-denied' ||
      entry.denialCode !== 'RequestDisallowedByPolicy' ||
      ![400, 403].includes(entry.status) ||
      !idEqual(entry.assignmentId, ctx.guard.assignment_ids.workload) ||
      !idEqual(entry.definitionId, ctx.guard.definition_id)
    )
      fail('generation policy provenance');
  }
}

async function validateGeneration(options) {
  const ctx = context(options);
  const handle = options.handle;
  const usage = options.usage ?? 'fresh';
  if (
    !['fresh', 'consume', 'pending', 'active'].includes(usage) ||
    !handle ||
    handle.purpose !== 'workload-generation' ||
    !sha256.test(handle.digest ?? '') ||
    !/^generation\/[a-f0-9-]{36}\.json$/.test(handle.reference ?? '')
  )
    fail('generation handle or usage');
  await evidenceAuthority(ctx, 'workload-generation');
  const record = await blob(ctx, 'workload-generation', handle.reference);
  const keys =
    'cases,environment,expiresAt,familyHandle,generation,guards,issuedAt,mode,probe,producerPrincipalId,qualificationId,roles,sourceClosureHash,sourceRevision,subscriptionId,tenantId,tupleHash,version';
  if (
    !record ||
    Object.keys(record).sort().join(',') !== keys ||
    record.version !== 1 ||
    record.mode !== 'workload-generation' ||
    digest(record) !== handle.digest ||
    record.environment !== ctx.config.environment ||
    record.tenantId !== ctx.config.tenantId ||
    record.subscriptionId !== ctx.config.subscriptionId ||
    record.generation !== ctx.config.generation ||
    record.sourceClosureHash !== ctx.sourceClosureHash ||
    !/^[a-f0-9]{40}$/.test(record.sourceRevision ?? '') ||
    !uuid.test(record.qualificationId ?? '') ||
    handle.reference !== `generation/${record.qualificationId}.json` ||
    record.probe !== null ||
    !Number.isFinite(Date.parse(record.issuedAt)) ||
    Date.parse(record.issuedAt) > now(ctx) ||
    !Number.isFinite(Date.parse(record.expiresAt)) ||
    Date.parse(record.expiresAt) <= Date.parse(record.issuedAt) ||
    Date.parse(record.expiresAt) >
      Date.parse(record.issuedAt) + 24 * 60 * 60000 ||
    !Array.isArray(record.guards) ||
    record.guards.length !== 2 ||
    !idEqual(
      record.guards.find((entry) => entry.family === 'workload')?.vaultId,
      ctx.vaults.workload,
    )
  )
    fail('generation evidence binding');
  producer(ctx, 'workload-generation', record.producerPrincipalId);
  if (usage !== 'active' && Date.parse(record.expiresAt) <= now(ctx))
    fail('generation evidence expired before fresh consumption');
  if (
    options.familyHandle &&
    !equal(handleOnly(options.familyHandle), record.familyHandle)
  )
    fail('current family evidence substitution');
  await validateVaultGuardEvidence({
    ...options,
    purpose: 'human-policy-family',
    storage: undefined,
    handle: record.familyHandle,
  });
  const observed = await inspect(ctx);
  const currentRoles = await roles(ctx, true);
  if (
    record.tupleHash !== familyTuple(ctx, record.guards, record.roles) ||
    record.tupleHash !== familyTuple(ctx, observed.guards, currentRoles) ||
    !equal(record.roles, currentRoles)
  )
    fail('generation current tuple drift');
  generationMatrix(ctx, record);
  let consumptionHash = null;
  if (usage === 'consume' || usage === 'pending')
    consumptionHash = await consumption(ctx, record, handle, usage);
  if (usage === 'active')
    consumptionHash = await establishedConsumption(ctx, record, handle);
  return {
    version: 1,
    environment: record.environment,
    generation: record.generation,
    source_revision: record.sourceRevision,
    qualification_id: record.qualificationId,
    evidence_sha256: handle.digest,
    family_evidence_sha256: record.familyHandle.digest,
    definition_sha256: ctx.guard.definition_sha256,
    workload_vault_id: ctx.vaults.workload,
    observed_at: record.issuedAt,
    expires_at: record.expiresAt,
    consumption_sha256: consumptionHash,
  };
}

function privatePlan(ctx, record, handle) {
  try {
    const binding = ctx.planBinding;
    if (
      !binding ||
      Object.keys(binding).sort().join(',') !==
        'bundleDigest,familyDigest,qualificationDigest,review,savedPlanPath' ||
      binding.qualificationDigest !== handle.digest ||
      binding.familyDigest !== record.familyHandle.digest ||
      !sha256.test(binding.bundleDigest ?? '')
    )
      fail('saved plan qualification binding');
    const path = resolve(binding.savedPlanPath);
    if (path !== binding.savedPlanPath || !path.endsWith('saved.tfplan'))
      fail('saved plan path');
    assertPrivatePath(dirname(path), 0o700);
    assertPrivatePath(path, 0o600);
    const reviewPath = join(dirname(path), 'review.json');
    assertPrivatePath(reviewPath, 0o600);
    const bytes = readFileSync(path);
    const reviewBytes = readFileSync(reviewPath);
    if (bytes.length > 16 * 1024 * 1024 || reviewBytes.length > 65536)
      fail('saved plan limit');
    const review = JSON.parse(reviewBytes.toString('utf8'));
    if (
      !equal(review, binding.review) ||
      digest(review) !== binding.bundleDigest ||
      Object.keys(review).sort().join(',') !==
        'actions,expiresAt,inputHash,planHash,policyHash,revision,stateLineage,stateSerial,version' ||
      review.version !== 1 ||
      review.revision !== ctx.sourceRevision ||
      !['inputHash', 'policyHash', 'planHash'].every((key) =>
        sha256.test(review[key] ?? ''),
      ) ||
      createHash('sha256').update(bytes).digest('hex') !== review.planHash ||
      typeof review.stateLineage !== 'string' ||
      !review.stateLineage ||
      !Number.isSafeInteger(review.stateSerial) ||
      review.stateSerial < 0 ||
      !Number.isFinite(Date.parse(review.expiresAt)) ||
      Date.parse(review.expiresAt) <= now(ctx) ||
      !review.actions ||
      Object.keys(review.actions).sort().join(',') !==
        'create,delete,read,update' ||
      Object.values(review.actions).some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      )
    )
      fail('saved plan review association');
    return {
      ...binding,
      review,
      path,
      localPath: join(dirname(path), 'guard-apply-binding.json'),
    };
  } catch (error) {
    if (
      error instanceof OperationalFailure &&
      error.message.startsWith('Azure vault guard')
    )
      throw error;
    fail('private saved plan binding');
  }
}

async function actualLease(ctx) {
  try {
    const { assertAzureOperationLease } =
      await import('./azure-operations.mjs');
    if (typeof assertAzureOperationLease !== 'function')
      fail('actual operation lease prerequisite');
    return await assertAzureOperationLease({
      config: ctx.config,
      outputs: ctx.outputs,
      token: ctx.token,
      operation: ctx.operation,
      allowedOperations: ['apply'],
      ...(ctx.request ? { request: ctx.request } : {}),
    });
  } catch (error) {
    const status = /status=(\d{3})/.exec(
      error instanceof OperationalFailure ? error.message : '',
    )?.[1];
    fail('actual operation lease', status ? Number(status) : undefined);
  }
}

function canonicalConsumption(ctx, record, handle, plan, lease, issuedAt) {
  return {
    version: 1,
    mode: 'guard-generation-consumption',
    qualificationId: record.qualificationId,
    qualificationDigest: handle.digest,
    familyDigest: record.familyHandle.digest,
    tupleHash: record.tupleHash,
    roleHash: digest(record.roles),
    sourceClosureHash: ctx.sourceClosureHash,
    environment: record.environment,
    generation: record.generation,
    tenantId: record.tenantId,
    subscriptionId: record.subscriptionId,
    vaultId: ctx.vaults.workload,
    sourceRevision: plan.review.revision,
    issuedAt,
    consumerPrincipalId: ctx.guard.producer_principal_ids.apply,
    leaseOwner: lease.owner,
    leaseNonce: lease.nonce,
    leaseExpires: lease.expires,
    operation: lease.operation,
    planHash: plan.review.planHash,
    bundleDigest: plan.bundleDigest,
    review: plan.review,
  };
}

function canonicalBinding(ctx, record, handle, plan, receiptHash, receipt) {
  return {
    version: 1,
    mode: 'guard-plan-binding',
    qualificationId: record.qualificationId,
    qualificationDigest: handle.digest,
    familyDigest: record.familyHandle.digest,
    consumptionDigest: receiptHash,
    bundleDigest: plan.bundleDigest,
    planHash: plan.review.planHash,
    inputHash: plan.review.inputHash,
    policyHash: plan.review.policyHash,
    stateLineage: plan.review.stateLineage,
    stateSerial: plan.review.stateSerial,
    sourceRevision: plan.review.revision,
    generation: record.generation,
    vaultId: ctx.vaults.workload,
    tupleHash: record.tupleHash,
    sourceClosureHash: ctx.sourceClosureHash,
    producerPrincipalId: ctx.guard.producer_principal_ids.apply,
    issuedAt: receipt.issuedAt,
    leaseOwner: receipt.leaseOwner,
    leaseNonce: receipt.leaseNonce,
  };
}

async function consumption(ctx, record, handle, usage) {
  const actor = await applyContext(ctx);
  const lease = await actualLease(actor);
  const plan = privatePlan(ctx, record, handle);
  const reference = `consumed/${record.qualificationId}.json`;
  const bindingReference = `plan-bindings/${record.qualificationId}.json`;
  if (usage === 'consume') {
    if (
      now(ctx) >= Date.parse(record.expiresAt) ||
      now(ctx) >= Date.parse(lease.expires)
    )
      fail('fresh consumption window');
    const receipt = canonicalConsumption(
      ctx,
      record,
      handle,
      plan,
      lease,
      new Date(now(ctx)).toISOString(),
    );
    await blob(actor, 'workload-generation', reference, 'PUT', receipt);
    await actualLease(actor);
    const receiptHash = digest(receipt);
    const binding = canonicalBinding(
      ctx,
      record,
      handle,
      plan,
      receiptHash,
      receipt,
    );
    await blob(actor, 'workload-generation', bindingReference, 'PUT', binding);
    const local = {
      version: 1,
      qualificationHandle: handleOnly(handle),
      consumptionHandle: {
        purpose: 'guard-generation-consumption',
        reference,
        digest: receiptHash,
      },
      bindingHandle: {
        purpose: 'guard-plan-binding',
        reference: bindingReference,
        digest: digest(binding),
      },
      planHash: plan.review.planHash,
      bundleDigest: plan.bundleDigest,
    };
    try {
      writeFileSync(plan.localPath, JSON.stringify(canonical(local)), {
        mode: 0o600,
        flag: 'wx',
      });
      assertPrivatePath(plan.localPath, 0o600);
    } catch {
      fail('private consumed apply binding creation');
    }
    await actualLease(actor);
    privatePlan(ctx, record, handle);
    return receiptHash;
  }
  let local;
  try {
    assertPrivatePath(plan.localPath, 0o600);
    local = JSON.parse(readFileSync(plan.localPath, 'utf8'));
  } catch {
    fail('private consumed apply binding read');
  }
  if (
    Object.keys(local).sort().join(',') !==
      'bindingHandle,bundleDigest,consumptionHandle,planHash,qualificationHandle,version' ||
    local.version !== 1 ||
    !equal(local.qualificationHandle, handleOnly(handle)) ||
    local.planHash !== plan.review.planHash ||
    local.bundleDigest !== plan.bundleDigest ||
    local.consumptionHandle?.purpose !== 'guard-generation-consumption' ||
    local.consumptionHandle.reference !== reference ||
    !sha256.test(local.consumptionHandle.digest ?? '') ||
    local.bindingHandle?.purpose !== 'guard-plan-binding' ||
    local.bindingHandle.reference !== bindingReference ||
    !sha256.test(local.bindingHandle.digest ?? '')
  )
    fail('private consumed apply binding identity');
  const receipt = await blob(actor, 'workload-generation', reference);
  const binding = await blob(actor, 'workload-generation', bindingReference);
  if (
    !receipt ||
    !binding ||
    digest(receipt) !== local.consumptionHandle.digest ||
    digest(binding) !== local.bindingHandle.digest ||
    !uuid.test(receipt.leaseOwner ?? '') ||
    receipt.leaseOwner !== lease.owner ||
    receipt.leaseNonce !== lease.nonce ||
    receipt.operation !== 'apply' ||
    !Number.isFinite(Date.parse(receipt.issuedAt)) ||
    Date.parse(receipt.issuedAt) > now(ctx) ||
    Date.parse(receipt.issuedAt) < Date.parse(record.issuedAt) ||
    Date.parse(receipt.issuedAt) >= Date.parse(record.expiresAt) ||
    !Number.isFinite(Date.parse(receipt.leaseExpires)) ||
    Date.parse(receipt.leaseExpires) <= Date.parse(receipt.issuedAt) ||
    !equal(
      receipt,
      canonicalConsumption(
        ctx,
        record,
        handle,
        plan,
        { ...lease, expires: receipt.leaseExpires },
        receipt.issuedAt,
      ),
    ) ||
    !equal(
      binding,
      canonicalBinding(
        ctx,
        record,
        handle,
        plan,
        local.consumptionHandle.digest,
        receipt,
      ),
    )
  )
    fail('consumed saved plan binding mismatch');
  await actualLease(actor);
  privatePlan(ctx, record, handle);
  return local.consumptionHandle.digest;
}

function historicalReview(ctx, receipt) {
  const review = receipt.review;
  if (
    !review ||
    Object.keys(review).sort().join(',') !==
      'actions,expiresAt,inputHash,planHash,policyHash,revision,stateLineage,stateSerial,version' ||
    review.version !== 1 ||
    !/^[a-f0-9]{40}$/.test(review.revision ?? '') ||
    !['inputHash', 'policyHash', 'planHash'].every((key) =>
      sha256.test(review[key] ?? ''),
    ) ||
    typeof review.stateLineage !== 'string' ||
    !review.stateLineage ||
    !Number.isSafeInteger(review.stateSerial) ||
    review.stateSerial < 0 ||
    !Number.isFinite(Date.parse(review.expiresAt)) ||
    Date.parse(review.expiresAt) <= Date.parse(receipt.issuedAt) ||
    !review.actions ||
    Object.keys(review.actions).sort().join(',') !==
      'create,delete,read,update' ||
    Object.values(review.actions).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    ) ||
    digest(review) !== receipt.bundleDigest
  )
    fail('ordinary activation historical approval');
  return { review, bundleDigest: receipt.bundleDigest };
}

async function establishedConsumption(ctx, record, handle) {
  const consumptionHandle = ctx.consumptionHandle;
  const bindingHandle = ctx.bindingHandle;
  if (
    consumptionHandle?.purpose !== 'guard-generation-consumption' ||
    consumptionHandle.reference !== `consumed/${record.qualificationId}.json` ||
    !sha256.test(consumptionHandle.digest ?? '') ||
    bindingHandle?.purpose !== 'guard-plan-binding' ||
    bindingHandle.reference !==
      `plan-bindings/${record.qualificationId}.json` ||
    !sha256.test(bindingHandle.digest ?? '')
  )
    fail('ordinary activation consumption handles');
  const receipt = await blob(
    ctx,
    'workload-generation',
    consumptionHandle.reference,
  );
  const binding = await blob(
    ctx,
    'workload-generation',
    bindingHandle.reference,
  );
  if (
    !receipt ||
    !binding ||
    digest(receipt) !== consumptionHandle.digest ||
    digest(binding) !== bindingHandle.digest ||
    !uuid.test(receipt.leaseOwner ?? '') ||
    receipt.leaseNonce !== receipt.leaseOwner ||
    receipt.operation !== 'apply' ||
    !Number.isFinite(Date.parse(receipt.issuedAt)) ||
    Date.parse(receipt.issuedAt) > now(ctx) ||
    Date.parse(receipt.issuedAt) < Date.parse(record.issuedAt) ||
    Date.parse(receipt.issuedAt) >= Date.parse(record.expiresAt) ||
    !Number.isFinite(Date.parse(receipt.leaseExpires)) ||
    Date.parse(receipt.leaseExpires) <= Date.parse(receipt.issuedAt) ||
    Date.parse(receipt.leaseExpires) - Date.parse(receipt.issuedAt) >
      2 * 3600000
  )
    fail('ordinary activation receipt provenance');
  const plan = historicalReview(ctx, receipt);
  const lease = {
    owner: receipt.leaseOwner,
    nonce: receipt.leaseNonce,
    expires: receipt.leaseExpires,
    operation: 'apply',
  };
  if (
    !equal(
      receipt,
      canonicalConsumption(ctx, record, handle, plan, lease, receipt.issuedAt),
    ) ||
    !equal(
      binding,
      canonicalBinding(
        ctx,
        record,
        handle,
        plan,
        consumptionHandle.digest,
        receipt,
      ),
    )
  )
    fail('ordinary activation immutable receipt binding');
  let validateEstablishedGuardActivation;
  try {
    ({ validateEstablishedGuardActivation } =
      await import('./azure-guard-activation.mjs'));
  } catch {
    fail('ordinary completed activation validator prerequisite');
  }
  if (typeof validateEstablishedGuardActivation !== 'function')
    fail('ordinary completed activation validator prerequisite');
  const installed = await validateEstablishedGuardActivation({
    config: ctx.config,
    outputs: ctx.outputs,
    token: ctx.token,
    signal: ctx.signal,
    operation: ctx.operation,
    qualificationHandle: handleOnly(handle),
    consumptionHandle: handleOnly(consumptionHandle),
    bindingHandle: handleOnly(bindingHandle),
    sourceClosureHash: ctx.sourceClosureHash,
    sourceRevision: ctx.sourceRevision,
    kubeconfig: ctx.activationContext?.kubeconfig ?? ctx.kubeconfig,
  });
  if (
    !installed ||
    Object.keys(installed).sort().join(',') !==
      'consumptionDigest,generation,installedTargetHash,qualificationDigest,revision,vaultId' ||
    installed.generation !== ctx.config.generation ||
    !idEqual(installed.vaultId, ctx.vaults.workload) ||
    installed.qualificationDigest !== handle.digest ||
    installed.consumptionDigest !== consumptionHandle.digest ||
    !sha256.test(installed.installedTargetHash ?? '') ||
    !/^[a-f0-9]{40}$/.test(installed.revision ?? '')
  )
    fail('ordinary completed activation current target');
  return consumptionHandle.digest;
}
