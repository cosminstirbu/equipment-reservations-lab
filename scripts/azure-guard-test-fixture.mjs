import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVaultGuardCanaryDescriptors } from './azure-vault-guard.mjs';

// Test-only provider projection fixture; retained as an immutable closure asset.
export function inspectionGuardFixture(guard, environment = 'learning') {
  const subscriptionId = guard.definition_id.split('/')[2];
  const subscription = `/subscriptions/${subscriptionId}`;
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
  const actors = ['plan', 'apply', 'destroy', 'backup', 'restore', 'reaper'];
  const principalIds = Object.fromEntries(
    actors.map((actor, index) => [
      actor,
      actor === 'apply'
        ? guard.producer_principal_ids.apply
        : `${index + 1}9999999-9999-4999-8999-999999999999`,
    ]),
  );
  const scopes = Object.values(guard.scope_ids).sort();
  const definitions = {
    permissions: {
      actions: ['Microsoft.Authorization/permissions/read'],
      assignableScopes: [...scopes, guard.definition_id].sort(),
    },
    authority: {
      actions: [
        'Microsoft.Authorization/roleAssignments/read',
        'Microsoft.Authorization/roleDefinitions/read',
      ],
      assignableScopes: [...scopes, guard.definition_id].sort(),
    },
    policy_definition: {
      actions: ['Microsoft.Authorization/policyDefinitions/read'],
      assignableScopes: [guard.definition_id],
    },
    policy_assignment: {
      actions: ['Microsoft.Authorization/policyAssignments/read'],
      assignableScopes: scopes,
    },
    policy_exemptions: {
      actions: ['Microsoft.Authorization/policyExemptions/read'],
      assignableScopes: scopes,
    },
  };
  const inspection_roles = Object.fromEntries(
    Object.entries(definitions).map(([key, value], index) => {
      const semantic = {
        ...value,
        notActions: [],
        dataActions: [],
        notDataActions: [],
      };
      return [
        key,
        {
          ...semantic,
          id: `${subscription}/providers/Microsoft.Authorization/roleDefinitions/${index + 1}8888888-8888-4888-8888-888888888888`,
          sha256: hash(semantic),
        },
      ];
    }),
  );
  const containers = Object.values(guard.evidence_container_names).map(
    (name) =>
      `${guard.scope_ids.recovery}/providers/Microsoft.Storage/storageAccounts/${guard.evidence_storage_account_name}/blobServices/default/containers/${name}`,
  );
  const active = [
    guard.definition_id,
    ...Object.values(guard.assignment_ids),
    ...scopes,
  ];
  const tuples = [
    ...containers.flatMap((scope) =>
      ['permissions', 'authority'].map((roleKey) => ({ scope, roleKey })),
    ),
    { scope: guard.recovery_vault_id, roleKey: 'permissions' },
    ...active.flatMap((scope) =>
      ['permissions', 'authority'].map((roleKey) => ({ scope, roleKey })),
    ),
    { scope: guard.definition_id, roleKey: 'policy_definition' },
    ...Object.values(guard.assignment_ids).map((scope) => ({
      scope,
      roleKey: 'policy_assignment',
    })),
    ...scopes.map((scope) => ({ scope, roleKey: 'policy_exemptions' })),
  ];
  const inspection_bindings = actors.flatMap((actor, actorIndex) =>
    tuples.map(({ scope, roleKey }, index) => ({
      roleKey,
      scope,
      queryScopes: [scope],
      principalId: principalIds[actor],
      assignmentId: `${scope}/providers/Microsoft.Authorization/roleAssignments/${String(actorIndex * tuples.length + index + 1).padStart(8, '0')}-7777-4777-8777-777777777777`,
    })),
  );
  return {
    ...guard,
    role_definitions: Object.fromEntries(
      Object.entries(guard.role_definitions).map(([key, role]) => {
        const actions = [
          'Microsoft.KeyVault/vaults/read',
          'Microsoft.KeyVault/vaults/write',
          'Microsoft.Resources/tags/read',
          'Microsoft.Resources/tags/write',
        ];
        return [
          key,
          { ...role, actions, sha256: hash({ actions, dataActions: [] }) },
        ];
      }),
    ),
    current_family_reference: `current/${environment}.json`,
    inspection_roles,
    inspection_bindings,
    workload_delegation: delegationFixture({
      scope: guard.scope_ids.workload,
      actors: principalIds,
      network: guard.role_definitions.workload_network.id.split('/').at(-1),
      permissions: inspection_roles.permissions.id.split('/').at(-1),
    }).descriptor,
    canary: createVaultGuardCanaryDescriptors({
      config: { subscriptionId, environment },
      guard,
      principalIds,
    }),
  };
}

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

export function delegationFixture(context = {}) {
  const guid = (n) => `abcdefab-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const scope =
    context.scope ??
    `/subscriptions/${uuid('2')}/resourceGroups/learning-workload`;
  const actors = context.actors ?? {
    apply: guid(1),
    destroy: guid(2),
    backup: guid(3),
    restore: guid(4),
    reaper: guid(5),
    plan: guid(6),
  };
  const base = Array.from({ length: 10 }, (_, i) => guid(100 + i));
  const installer = guid(200),
    network = context.network ?? guid(201),
    permissions = context.permissions ?? guid(202);
  const continuity = { backup: guid(203), restore: guid(204) };
  const values = new Map([
    ['join(", ", local.delegated_workload_role_ids)', base.join(', ')],
    [
      'azurerm_role_definition.workload_vault_network.role_definition_id',
      network,
    ],
    [
      'azurerm_role_definition.guard_inspection["permissions"].role_definition_id',
      permissions,
    ],
    [
      'data.azurerm_role_definition.delegated["cluster_installer"].role_definition_id',
      installer,
    ],
    [
      'azurerm_user_assigned_identity.github["apply"].principal_id',
      actors.apply,
    ],
    [
      'join(", ", [for actor in ["backup", "restore", "reaper"] : azurerm_user_assigned_identity.github[actor].principal_id])',
      [actors.backup, actors.restore, actors.reaper].join(', '),
    ],
    [
      'join(", ", [for actor in sort(tolist(local.guard_inspection_actors)) : azurerm_user_assigned_identity.github[actor].principal_id])',
      Object.values(actors).sort().join(', '),
    ],
  ]);
  const terraform = readFileSync(
    new URL('../infra/azure/foundation/delegation.tf', import.meta.url),
    'utf8',
  );
  const template = terraform
    .split('resource "azurerm_role_assignment" "delegated_workload"')[1]
    .match(/<<-CONDITION\r?\n([\s\S]+?)\r?\n\s*CONDITION/)[1];
  const condition = template
    .split(/\r?\n/)
    .map((line) => {
      if (
        line.includes('[for actor, role in azurerm_role_definition.continuity')
      ) {
        const origin = line.includes('@Request') ? 'Request' : 'Resource';
        return Object.entries(continuity)
          .map(
            ([actor, role]) =>
              `OR (@${origin}[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${role}} AND @${origin}[Microsoft.Authorization/roleAssignments:PrincipalId] ForAnyOfAnyValues:GuidEquals {${actors[actor]}})`,
          )
          .join('\n');
      }
      return line.replace(/\$\{([^{}]+)\}/g, (_, expression) => {
        assert.ok(
          values.has(expression),
          'Terraform fixture expression must have an explicit synthetic substitution',
        );
        return values.get(expression);
      });
    })
    .join('\n');
  assert.ok(!condition.includes('${'));
  const rule = (roleDefinitionIds, principalIds) => ({
    roleDefinitionIds: [...roleDefinitionIds].sort(),
    principalIds: principalIds === null ? null : [...principalIds].sort(),
    principalType: 'ServicePrincipal',
  });
  const allowedRules = [
    rule(base, null),
    ...Object.entries(continuity).map(([actor, role]) =>
      rule([role], [actors[actor]]),
    ),
    rule([network], [actors.backup, actors.restore, actors.reaper]),
    rule([permissions], Object.values(actors)),
    rule([installer], [actors.apply]),
  ];
  const roleDefinition = {
    id: `/subscriptions/${scope.split('/')[2]}/providers/Microsoft.Authorization/roleDefinitions/${guid(300)}`,
    name: 'Role Based Access Control Administrator',
    roleType: 'BuiltInRole',
    actions: [
      'Microsoft.Authorization/roleAssignments/delete',
      'Microsoft.Authorization/roleAssignments/write',
    ],
    notActions: [],
    dataActions: [],
    notDataActions: [],
    assignableScopes: ['/'],
  };
  roleDefinition.sha256 = hash(roleDefinition);
  const descriptor = {
    version: 1,
    scope,
    roleDefinition,
    assignments: Object.fromEntries(
      ['apply', 'destroy'].map((actor, i) => [
        actor,
        {
          id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${guid(400 + i)}`,
          scope,
          principalId: actors[actor],
          principalType: 'ServicePrincipal',
          roleDefinitionId: roleDefinition.id,
          conditionVersion: '2.0',
          condition,
        },
      ]),
    ),
    allowedRules,
  };
  sealDelegation(descriptor);
  return {
    descriptor,
    expectedDescriptor: globalThis.structuredClone(descriptor),
    guid,
    actors,
    base,
    installer,
    network,
    permissions,
    continuity,
  };
}

export function sealDelegation(descriptor) {
  const role = descriptor.roleDefinition;
  role.sha256 = hash(
    Object.fromEntries(
      Object.entries(role).filter(([key]) => key !== 'sha256'),
    ),
  );
  for (const assignment of Object.values(descriptor.assignments)) {
    assignment.conditionSha256 = createHash('sha256')
      .update(assignment.condition, 'utf8')
      .digest('hex');
    assignment.semanticSha256 = hash(
      Object.fromEntries(
        [
          'id',
          'scope',
          'principalId',
          'principalType',
          'roleDefinitionId',
          'conditionVersion',
          'conditionSha256',
        ].map((key) => [key, assignment[key]]),
      ),
    );
  }
  descriptor.semanticSha256 = hash({
    version: descriptor.version,
    scope: descriptor.scope,
    roleDefinitionSha256: role.sha256,
    assignmentsSemanticHashes: Object.fromEntries(
      Object.entries(descriptor.assignments).map(([actor, assignment]) => [
        actor,
        assignment.semanticSha256,
      ]),
    ),
    allowedRules: descriptor.allowedRules,
  });
}
