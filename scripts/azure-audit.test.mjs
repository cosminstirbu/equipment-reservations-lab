import assert from 'node:assert/strict';
import test from 'node:test';

test('audit qualifier reads actual rule/default binding and rejects changed transform or delayed saved-plan observations', async () => {
  const { qualifyAudit, validateAuditObservation, auditTransform } =
    await import('./azure-audit.mjs');
  const config = {
    environment: 'learning',
    generation: 'lab2026',
    gitRevision: 'a'.repeat(40),
  };
  const outputs = {
    audit_workspace_resource_id:
      '/subscriptions/sub/resourceGroups/foundation/providers/Microsoft.OperationalInsights/workspaces/audit',
    audit_dcr_resource_id:
      '/subscriptions/sub/resourceGroups/foundation/providers/Microsoft.Insights/dataCollectionRules/audit',
    audit_stream: 'Microsoft-Table-StorageBlobLogs',
  };
  const calls = [];
  const request = async (id) => {
    calls.push(id);
    return id === outputs.audit_workspace_resource_id
      ? {
          properties: {
            defaultDataCollectionRuleResourceId: outputs.audit_dcr_resource_id,
          },
        }
      : {
          kind: 'WorkspaceTransforms',
          properties: {
            provisioningState: 'Succeeded',
            destinations: {
              logAnalytics: [
                {
                  name: 'audit',
                  workspaceResourceId: outputs.audit_workspace_resource_id,
                },
              ],
            },
            dataFlows: [
              {
                streams: [outputs.audit_stream],
                destinations: ['audit'],
                transformKql: auditTransform,
              },
            ],
          },
        };
  };
  const observation = await qualifyAudit({
    config,
    outputs,
    stage: 'enable',
    request,
    now: 1000000000000,
  });
  assert.equal(calls.length, 2);
  assert.equal(observation.stage, 'enable');
  validateAuditObservation(observation, config, outputs, 1000000000001);
  assert.throws(
    () =>
      validateAuditObservation(
        observation,
        config,
        outputs,
        1000000000000 + 1800000,
      ),
    /expired|fresh/i,
  );
  await assert.rejects(
    () =>
      qualifyAudit({
        config,
        outputs,
        stage: 'enable',
        request: async (id) =>
          id === outputs.audit_workspace_resource_id
            ? { properties: { defaultDataCollectionRuleResourceId: 'foreign' } }
            : request(id),
      }),
    /binding/i,
  );
  await assert.rejects(
    () =>
      qualifyAudit({
        config,
        outputs,
        stage: 'enable',
        request: async (id) => {
          const value = await request(id);
          if (id === outputs.audit_dcr_resource_id)
            value.properties.destinations.extra = { unexpected: true };
          return value;
        },
      }),
    /destination|DCR/,
  );
});
