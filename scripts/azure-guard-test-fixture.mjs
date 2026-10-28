import { createHash } from 'node:crypto';
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
    canary: createVaultGuardCanaryDescriptors({
      config: { subscriptionId, environment },
      guard,
      principalIds,
    }),
  };
}
