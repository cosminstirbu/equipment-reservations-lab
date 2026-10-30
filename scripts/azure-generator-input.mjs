import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const generatorInputSchemaVersion = 2;
const configKeys = [
  'version',
  'generation',
  'tenantId',
  'subscriptionId',
  'domain',
  'operatorCidrs',
  'acmeTermsAccepted',
  'gitRevision',
];
const foundationKeys = [
  'dns_zone_resource_group_name',
  'github_principal_ids',
  'operator_client_ids',
  'operator_group_object_id',
];
const environmentKeys = [
  'workload_client_ids',
  'workload_key_vault_name',
  'ingress_public_ip',
  'ingress_public_ip_resource_group_name',
];
const workloadKeys = [
  'postgres',
  'database-bootstrap',
  'keycloak',
  'identity-bootstrap',
  'inventory',
  'reservations',
  'notifications',
  'rabbitmq',
  'dashboard',
  'argocd',
  'otel-collector',
  'prometheus',
  'loki',
  'tempo',
  'grafana',
  'equipment-backup-client',
  'equipment-restore-client',
  'equipment-verification-server',
  'cert-manager',
];
const fail = () => {
  throw Error(
    'Canonical generator input is invalid; private values suppressed.',
  );
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
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
function exact(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    fail();
}
function ids(value, keys) {
  exact(value, keys);
  if (
    Object.values(value).some((id) => typeof id !== 'string' || !uuid.test(id))
  )
    fail();
  return Object.fromEntries(keys.map((key) => [key, value[key].toLowerCase()]));
}
function publicIp(value) {
  if (typeof value !== 'string' || isIP(value) !== 4) return false;
  const [a, b] = value.split('.').map(Number);
  return !(
    [0, 10, 127].includes(a) ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
export function validateGeneratorInput(value) {
  exact(value, ['config', 'foundation', 'environment']);
  exact(value.config, configKeys);
  exact(value.foundation, foundationKeys);
  exact(value.environment, environmentKeys);
  const { config, foundation, environment } = value;
  if (
    config.version !== 1 ||
    config.domain !== 'codingfunlab.com' ||
    !/^\w{4,12}$/.test(config.generation ?? '') ||
    !uuid.test(config.tenantId ?? '') ||
    !uuid.test(config.subscriptionId ?? '') ||
    !/^[a-f0-9]{40}$/.test(config.gitRevision ?? '') ||
    config.acmeTermsAccepted !== true ||
    !Array.isArray(config.operatorCidrs) ||
    !config.operatorCidrs.length ||
    config.operatorCidrs.length > 20 ||
    new Set(config.operatorCidrs).size !== config.operatorCidrs.length ||
    config.operatorCidrs.some(
      (cidr) =>
        typeof cidr !== 'string' ||
        !cidr.endsWith('/32') ||
        !publicIp(cidr.slice(0, -3)),
    )
  )
    fail();
  if (
    !uuid.test(foundation.operator_group_object_id ?? '') ||
    !/^[-A-Za-z0-9_.()]{1,90}$/.test(
      foundation.dns_zone_resource_group_name ?? '',
    ) ||
    !/^[-A-Za-z0-9_.()]{1,90}$/.test(
      environment.ingress_public_ip_resource_group_name ?? '',
    ) ||
    !publicIp(environment.ingress_public_ip) ||
    !/^[a-zA-Z0-9-]{3,24}$/.test(environment.workload_key_vault_name ?? '')
  )
    fail();
  return canonical({
    config: {
      ...config,
      tenantId: config.tenantId.toLowerCase(),
      subscriptionId: config.subscriptionId.toLowerCase(),
      operatorCidrs: [...config.operatorCidrs].sort(),
    },
    foundation: {
      ...foundation,
      operator_group_object_id:
        foundation.operator_group_object_id.toLowerCase(),
      operator_client_ids: ids(foundation.operator_client_ids, [
        'argocd',
        'dashboard',
      ]),
      github_principal_ids: ids(foundation.github_principal_ids, [
        'backup',
        'restore',
      ]),
    },
    environment: {
      ...environment,
      workload_client_ids: ids(environment.workload_client_ids, workloadKeys),
    },
  });
}
const pick = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value?.[key]]));
export function createGeneratorInput({ config, foundation, environment } = {}) {
  const input = {
    config: pick(config, configKeys),
    foundation: pick(foundation, foundationKeys),
    environment: pick(environment, environmentKeys),
  };
  input.foundation.github_principal_ids = pick(
    foundation?.github_principal_ids,
    ['backup', 'restore'],
  );
  input.foundation.operator_client_ids = pick(foundation?.operator_client_ids, [
    'argocd',
    'dashboard',
  ]);
  input.environment.workload_client_ids = pick(
    environment?.workload_client_ids,
    workloadKeys,
  );
  if (
    config?.operatorGroupObjectId &&
    config.operatorGroupObjectId.toLowerCase() !==
      foundation?.operator_group_object_id?.toLowerCase()
  )
    fail();
  return validateGeneratorInput(input);
}
export function generatorInputHash(input) {
  return createHash('sha256')
    .update(JSON.stringify(validateGeneratorInput(input)))
    .digest('hex');
}
