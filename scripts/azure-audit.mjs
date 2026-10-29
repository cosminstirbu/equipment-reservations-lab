import { createHash } from 'node:crypto';
import { OperationalFailure } from './process.mjs';
export const auditTransform =
  'source | project TimeGenerated, AccountName, Category, OperationName, StatusCode, DurationMs, ServerLatencyMs, AuthenticationType, RequesterObjectId, Protocol, TlsVersion';
const digest = createHash('sha256').update(auditTransform).digest('hex');
const fail = (message) => {
  throw new OperationalFailure(message);
};
export function validateAuditObservation(
  value,
  config,
  outputs,
  now = Date.now(),
) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'dcr_provisioning_state,dcr_resource_id,environment,expires_at,generation,observed_at,revision,stage,transform_sha256,version,workspace_default_dcr_id,workspace_resource_id' ||
    value.version !== 1 ||
    !['bind', 'enable'].includes(value.stage) ||
    value.environment !== config.environment ||
    value.generation !== config.generation ||
    value.revision !== config.gitRevision ||
    value.workspace_resource_id !== outputs.audit_workspace_resource_id ||
    value.dcr_resource_id !== outputs.audit_dcr_resource_id ||
    value.transform_sha256 !== digest ||
    value.dcr_provisioning_state !== 'Succeeded'
  )
    fail('Audit qualification identity, transform or schema is invalid.');
  const observed = Date.parse(value.observed_at),
    expires = Date.parse(value.expires_at);
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(expires) ||
    observed > now ||
    observed < now - 1800000 ||
    expires <= now ||
    expires > observed + 1800000
  )
    fail(
      'Audit observation expired or is not fresh; re-plan and review required.',
    );
  if (
    value.stage === 'enable' &&
    value.workspace_default_dcr_id !== outputs.audit_dcr_resource_id
  )
    fail('Audit default DCR binding prerequisite is invalid.');
  return value;
}
export async function qualifyAudit({
  config,
  outputs,
  stage,
  request,
  now = Date.now(),
}) {
  if (
    !['bind', 'enable'].includes(stage) ||
    outputs.audit_stream !== 'Microsoft-Table-StorageBlobLogs' ||
    (outputs.audit_transform_sha256 &&
      outputs.audit_transform_sha256 !== digest)
  )
    fail('Audit stage or transform prerequisite is invalid.');
  const [rule, workspace] = await Promise.all([
    request(outputs.audit_dcr_resource_id, '2024-03-11'),
    request(outputs.audit_workspace_resource_id, '2025-07-01'),
  ]);
  const properties = rule?.properties,
    flow = properties?.dataFlows?.[0],
    destinations = properties?.destinations;
  if (
    rule?.kind !== 'WorkspaceTransforms' ||
    properties?.provisioningState !== 'Succeeded' ||
    properties?.dataFlows?.length !== 1 ||
    JSON.stringify(flow?.streams) !== JSON.stringify([outputs.audit_stream]) ||
    JSON.stringify(flow?.destinations) !== JSON.stringify(['audit']) ||
    flow?.transformKql !== auditTransform ||
    flow.builtInTransform ||
    (flow.outputStream && flow.outputStream !== outputs.audit_stream) ||
    !destinations ||
    Object.keys(destinations).some((key) => key !== 'logAnalytics') ||
    destinations.logAnalytics?.length !== 1 ||
    destinations.logAnalytics[0].name !== 'audit' ||
    destinations.logAnalytics[0].workspaceResourceId !==
      outputs.audit_workspace_resource_id ||
    properties.endpoints ||
    properties.dataCollectionEndpointId
  )
    fail('Actual audit DCR transform, stream or destination is invalid.');
  const observed = Math.floor(now / 1000) * 1000;
  const observation = {
    version: 1,
    stage,
    environment: config.environment,
    generation: config.generation,
    revision: config.gitRevision,
    workspace_resource_id: outputs.audit_workspace_resource_id,
    dcr_resource_id: outputs.audit_dcr_resource_id,
    transform_sha256: digest,
    observed_at: new Date(observed).toISOString().replace('.000Z', 'Z'),
    expires_at: new Date(observed + 1800000)
      .toISOString()
      .replace('.000Z', 'Z'),
    workspace_default_dcr_id:
      workspace?.properties?.defaultDataCollectionRuleResourceId ?? null,
    dcr_provisioning_state: 'Succeeded',
  };
  return validateAuditObservation(observation, config, outputs, now);
}

export function auditArmReader(
  token,
  { request = globalThis.fetch, signal } = {},
) {
  return async (id, version) => {
    if (
      typeof id !== 'string' ||
      !/^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[a-zA-Z0-9._()-]+\/providers\/Microsoft\.(Insights\/dataCollectionRules|OperationalInsights\/workspaces)\/[a-zA-Z0-9._()-]+$/.test(
        id,
      )
    )
      fail('Audit resource identity is invalid.');
    const response = await request(
      `https://management.azure.com${id}?api-version=${version}`,
      {
        headers: {
          Authorization: `Bearer ${await token('https://management.azure.com/')}`,
        },
        redirect: 'error',
        signal: signal
          ? globalThis.AbortSignal.any([
              signal,
              globalThis.AbortSignal.timeout(30000),
            ])
          : globalThis.AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      fail(
        `Live audit resource qualification failed; HTTP status ${response.status}.`,
      );
    return response.json();
  };
}
