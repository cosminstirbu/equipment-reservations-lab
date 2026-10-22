import { isDeepStrictEqual } from 'node:util';
import parsers from '@stoplight/spectral-parsers';
import { OperationalFailure } from './process.mjs';

const targets = {
  inventory: ['apps/v1', 'Deployment', 'inventory', 'containers', 'inventory'],
  reservations: [
    'apps/v1',
    'Deployment',
    'reservations',
    'containers',
    'reservations',
  ],
  notifications: [
    'apps/v1',
    'Deployment',
    'notifications',
    'containers',
    'notifications',
  ],
  web: ['apps/v1', 'Deployment', 'web', 'containers', 'web'],
  'database-bootstrap': [
    'batch/v1',
    'Job',
    'database-bootstrap',
    'containers',
    'database-bootstrap',
  ],
  'identity-bootstrap': [
    'batch/v1',
    'Job',
    'identity-bootstrap',
    'containers',
    'identity-bootstrap',
  ],
  'broker-bootstrap': [
    'apps/v1',
    'Deployment',
    'rabbitmq',
    'initContainers',
    'definitions',
  ],
};

export function imagePatchPath(name) {
  if (!Object.hasOwn(targets, name))
    throw new OperationalFailure('Unknown image patch component');
  return `deploy/environments/local/images/${name}.yaml`;
}

export function imagePatch(name, reference = name) {
  imagePatchPath(name);
  const [apiVersion, kind, resource, containers, container] = targets[name];
  return `---\napiVersion: ${apiVersion}\nkind: ${kind}\nmetadata:\n  name: ${resource}\nspec:\n  template:\n    spec:\n      ${containers}:\n        - name: ${container}\n          image: ${reference}\n`;
}

export function readImageReference(name, text) {
  imagePatchPath(name);
  const parsed = parsers.Yaml.parse(text);
  const containers = targets[name][3];
  const reference = parsed.data?.spec?.template?.spec?.[containers]?.[0]?.image;
  if (
    parsed.diagnostics.some((item) => item.severity === 0) ||
    typeof reference !== 'string' ||
    !isDeepStrictEqual(
      parsed.data,
      parsers.Yaml.parse(imagePatch(name, reference)).data,
    )
  )
    throw new OperationalFailure('Invalid component image patch shape');
  if (
    reference !== name &&
    !/^ghcr\.io\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(reference)
  )
    throw new OperationalFailure('Invalid component image patch reference');
  return reference;
}
