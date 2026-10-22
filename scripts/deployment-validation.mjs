import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { resolve, join } from 'node:path';
import { executeProcess, OperationalFailure, safeFailure } from './process.mjs';
import { pathToFileURL } from 'node:url';
import parsers from '@stoplight/spectral-parsers';

export const imageNames = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function classifyChanges(paths) {
  return paths.some((path) =>
    /^(src\/|deploy\/images\/|global\.json$|Directory\..*\.(props|targets)$|NuGet\.Config$|EquipmentReservation\.slnx$)/i.test(
      path,
    ),
  );
}

export function validateRelease(release) {
  if (
    Object.keys(release ?? {}).some(
      (key) => !['sourceRevision', 'images'].includes(key),
    )
  )
    throw new OperationalFailure('Unexpected release field');
  if (!/^[a-f0-9]{40}$/.test(release?.sourceRevision))
    throw new OperationalFailure('Release needs exact source revision');
  if (
    Object.keys(release.images ?? {}).some((name) => !imageNames.includes(name))
  )
    throw new OperationalFailure('Unknown application image');
  for (const name of imageNames) {
    const entry = release.images?.[name];
    if (!entry || !/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+$/.test(entry.image))
      throw new OperationalFailure(`Missing GHCR image: ${name}`);
    if (Object.keys(entry).some((key) => !['image', 'digest'].includes(key)))
      throw new OperationalFailure('Unexpected image field');
    if (!digestPattern.test(entry.digest))
      throw new OperationalFailure(`Invalid index digest: ${name}`);
  }
  return release;
}

export function validateIndex(index) {
  if (
    ![
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
    ].includes(index.mediaType)
  )
    throw new OperationalFailure('Expected OCI image index');
  for (const architecture of ['amd64', 'arm64']) {
    if (
      !index.manifests?.some(
        (item) =>
          item.platform?.os === 'linux' &&
          item.platform?.architecture === architecture &&
          digestPattern.test(item.digest),
      )
    )
      throw new OperationalFailure(`Index missing linux/${architecture}`);
  }
}

export function validateManifests(text, { ciImages = [], ciRevision } = {}) {
  if (
    ciImages.length &&
    (!/^[a-f0-9]{40}$/.test(ciRevision ?? '') ||
      ciImages.some(
        (image) =>
          !imageNames.some(
            (name) => image === `equipment-ci/${name}:${ciRevision}`,
          ),
      ))
  )
    throw new OperationalFailure(
      'CI image policy requires exact known names and committed revision',
    );
  const documents = text
    .split(/^---\s*$/m)
    .filter((document) => document.trim())
    .map((document) => {
      const parsed = parsers.Yaml.parse(document);
      if (parsed.diagnostics.some((item) => item.severity === 0))
        throw new OperationalFailure('Invalid manifest YAML');
      return parsed.data;
    });
  for (const resource of documents) {
    if (!resource?.apiVersion || !resource.kind || !resource.metadata?.name)
      throw new OperationalFailure('Manifest requires apiVersion/kind/name');
    if (resource.kind === 'Secret')
      throw new OperationalFailure('Secret must be privately provisioned');
    if (
      resource.kind === 'PersistentVolume' &&
      resource.spec?.persistentVolumeReclaimPolicy !== 'Retain'
    )
      throw new OperationalFailure('Durable PV requires Retain');
    if (['PersistentVolume', 'PersistentVolumeClaim'].includes(resource.kind)) {
      const options =
        resource.metadata.annotations?.['argocd.argoproj.io/sync-options'] ??
        '';
      if (!options.includes('Prune=false') || !options.includes('Delete=false'))
        throw new OperationalFailure(
          'Durable storage requires prune/delete protection',
        );
    }
    if (resource.kind === 'Application' && resource.metadata.finalizers?.length)
      throw new OperationalFailure('Application must not cascade deletion');
    const pod =
      resource.kind === 'Pod' ? resource.spec : resource.spec?.template?.spec;
    for (const container of [
      ...(pod?.initContainers ?? []),
      ...(pod?.containers ?? []),
    ]) {
      if (
        !/@sha256:[a-f0-9]{64}$/.test(container.image) &&
        !ciImages.includes(container.image)
      )
        throw new OperationalFailure('Container requires immutable digest');
      if (
        !container.resources?.requests?.cpu ||
        !container.resources?.requests?.memory ||
        !container.resources?.limits?.cpu ||
        !container.resources?.limits?.memory
      )
        throw new OperationalFailure('Container requires CPU/memory bounds');
    }
  }
  return documents;
}

export function verifyReleaseIndexes(
  release,
  inspect = (reference) => {
    const raw = executeProcess(
      'docker',
      ['buildx', 'imagetools', 'inspect', '--raw', reference],
      {
        encoding: 'utf8',
        timeout: 45000,
        operation: 'release index inspection',
        tool: 'docker',
        output: 'private-capture',
      },
    );
    try {
      return JSON.parse(raw);
    } catch {
      throw new OperationalFailure(
        'Release index response is not valid JSON; raw provider response suppressed.',
      );
    }
  },
) {
  validateRelease(release);
  for (const entry of Object.values(release.images))
    validateIndex(inspect(`${entry.image}@${entry.digest}`));
}

export const jobNames = ['database', 'identity'];
export const wrapperPath = (name) =>
  `deploy/environments/local/jobs/${name}/kustomization.yaml`;

export function canonicalRelease(input) {
  let value = input;
  if (typeof input === 'string') {
    if (
      parsers.Json.parse(input).diagnostics.some((item) => item.severity === 0)
    )
      throw new OperationalFailure('Ambiguous or invalid release JSON');
    value = JSON.parse(input);
  }
  const visiting = new Set();
  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean')
      return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item))
      return JSON.stringify(item);
    if (
      typeof item !== 'object' ||
      visiting.has(item) ||
      (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
    )
      throw new OperationalFailure('Release must contain finite JSON values');
    visiting.add(item);
    let encoded;
    if (Array.isArray(item))
      encoded = `[${Array.from(item, encode).join(',')}]`;
    else {
      const keys = Object.keys(item).sort((a, b) => {
        const left = Array.from(a, (character) => character.codePointAt(0));
        const right = Array.from(b, (character) => character.codePointAt(0));
        for (
          let index = 0;
          index < Math.min(left.length, right.length);
          index++
        ) {
          if (left[index] !== right[index]) return left[index] - right[index];
        }
        return left.length - right.length;
      });
      encoded = `{${keys.map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    }
    visiting.delete(item);
    return encoded;
  }
  return encode(value);
}

export function parseRelease(text) {
  return validateRelease(JSON.parse(canonicalRelease(text)));
}

export function jobSuffix(
  release,
  baseConfiguration,
  localConfiguration,
  template,
) {
  const hash = createHash('sha256');
  for (const input of [
    canonicalRelease(release),
    baseConfiguration,
    localConfiguration,
    template,
  ]) {
    if (typeof input !== 'string')
      throw new OperationalFailure(
        'Job hash requires exact public UTF-8 input',
      );
    const bytes = Buffer.from(input, 'utf8');
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(length);
    hash.update(bytes);
  }
  return `-${hash.digest('hex').slice(0, 16)}`;
}

export function validateWrapper(name, text) {
  const parsed = parsers.Yaml.parse(text);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new OperationalFailure('Invalid Job wrapper YAML');
  const wrapper = parsed.data;
  if (
    !jobNames.includes(name) ||
    !wrapper ||
    Object.keys(wrapper).some(
      (key) => !['apiVersion', 'kind', 'resources', 'nameSuffix'].includes(key),
    )
  )
    throw new OperationalFailure('Unexpected Job wrapper field');
  if (
    wrapper.apiVersion !== 'kustomize.config.k8s.io/v1beta1' ||
    wrapper.kind !== 'Kustomization' ||
    !Array.isArray(wrapper.resources) ||
    wrapper.resources.length !== 1 ||
    wrapper.resources[0] !== `../../../../base/jobs/${name}` ||
    typeof wrapper.nameSuffix !== 'string'
  )
    throw new OperationalFailure('Unexpected Job wrapper fields or resources');
  return parsed;
}

export function validateJobSuffixes(release, inputs) {
  validateRelease(release);
  if (
    Object.keys(inputs).some(
      (key) =>
        !['baseConfiguration', 'localConfiguration', 'jobs'].includes(key),
    ) ||
    Object.values(inputs.jobs).some((job) =>
      Object.keys(job).some((key) => !['template', 'wrapper'].includes(key)),
    )
  )
    throw new OperationalFailure('Unexpected Job input field');
  if (Object.keys(inputs.jobs).some((name) => !jobNames.includes(name)))
    throw new OperationalFailure('Unexpected Job input');
  for (const name of jobNames) {
    const job = inputs.jobs[name];
    const parsed = validateWrapper(name, job.wrapper);
    const expected = jobSuffix(
      release,
      inputs.baseConfiguration,
      inputs.localConfiguration,
      job.template,
    );
    if (parsed.data.nameSuffix !== expected)
      throw new OperationalFailure(
        `Job ${name} has stale or malformed nameSuffix`,
      );
  }
}

export function readPublicFile(root, path) {
  let current = resolve(root);
  if (lstatSync(current).isSymbolicLink())
    throw new OperationalFailure('Symlinked public input root rejected');
  if (path.split('/').some((part) => !part || part === '..' || part === '.'))
    throw new OperationalFailure('Unexpected public input path');
  for (const part of path.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw new OperationalFailure('Symlinked public input rejected');
  }
  return readFileSync(current, 'utf8');
}

export function readJobInputs(root) {
  return {
    baseConfiguration: readPublicFile(root, 'deploy/base/configuration.yaml'),
    localConfiguration: readPublicFile(
      root,
      'deploy/environments/local/configuration.yaml',
    ),
    jobs: Object.fromEntries(
      jobNames.map((name) => [
        name,
        {
          template: readPublicFile(root, `deploy/base/jobs/${name}/job.yaml`),
          wrapper: readPublicFile(root, wrapperPath(name)),
        },
      ]),
    ),
  };
}

function sourceDocument(text, label) {
  const parsed = parsers.Yaml.parse(text);
  if (
    parsed.diagnostics.some((item) => item.severity === 0) ||
    !parsed.data ||
    typeof parsed.data !== 'object' ||
    Array.isArray(parsed.data)
  )
    throw new OperationalFailure(`Invalid public ${label} YAML`);
  return parsed.data;
}

export function validateCommittedState({
  kustomization,
  jobInputs,
  releaseText,
}) {
  const overlay = sourceDocument(kustomization, 'Kustomization');
  if (
    overlay.apiVersion !== 'kustomize.config.k8s.io/v1beta1' ||
    overlay.kind !== 'Kustomization' ||
    overlay.namespace !== 'equipment' ||
    !Array.isArray(overlay.images) ||
    !Array.isArray(overlay.resources) ||
    !overlay.resources.includes('../../base') ||
    !Array.isArray(overlay.generators) ||
    !overlay.generators.includes('configuration.yaml') ||
    overlay.secretGenerator
  )
    throw new OperationalFailure('Invalid committed local Kustomization');
  for (const [local, text] of [
    [false, jobInputs.baseConfiguration],
    [true, jobInputs.localConfiguration],
  ]) {
    const generator = sourceDocument(text, 'configuration generator');
    if (
      generator.apiVersion !== 'builtin' ||
      generator.kind !== 'ConfigMapGenerator' ||
      generator.metadata?.name !== 'equipment-runtime' ||
      !Array.isArray(generator.literals) ||
      !generator.literals.length ||
      generator.literals.some(
        (value) =>
          typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(value),
      ) ||
      generator.files ||
      generator.envs ||
      generator.env ||
      generator.options?.disableNameSuffixHash === true ||
      (local && generator.behavior !== 'merge')
    )
      throw new OperationalFailure(
        'Invalid public runtime configuration generator',
      );
  }
  for (const name of jobNames) {
    validateWrapper(name, jobInputs.jobs[name].wrapper);
    const job = sourceDocument(jobInputs.jobs[name].template, 'Job template');
    if (
      job.apiVersion !== 'batch/v1' ||
      job.kind !== 'Job' ||
      !job.spec?.template?.spec?.containers?.length
    )
      throw new OperationalFailure('Invalid public Job template');
  }
  if (releaseText === null) {
    if (
      overlay.images.length ||
      jobNames.some(
        (name) =>
          validateWrapper(name, jobInputs.jobs[name].wrapper).data
            .nameSuffix !== '-unreleased',
      )
    )
      throw new OperationalFailure(
        'Initial unreleased state requires empty images and only -unreleased Job suffixes',
      );
    return 'unreleased';
  }
  const release = parseRelease(releaseText);
  if (
    overlay.images.length !== imageNames.length ||
    imageNames.some((name) => {
      const matches = overlay.images.filter((entry) => entry.name === name);
      return (
        matches.length !== 1 ||
        Object.keys(matches[0]).some(
          (key) => !['name', 'newName', 'digest'].includes(key),
        ) ||
        matches[0].newName !== release.images[name].image ||
        matches[0].digest !== release.images[name].digest
      );
    })
  )
    throw new OperationalFailure(
      'Committed image references do not match the genuine release record',
    );
  validateJobSuffixes(release, jobInputs);
  return 'released';
}

export function validateCommittedDeployment(root) {
  let releaseText;
  try {
    releaseText = readPublicFile(
      root,
      'deploy/environments/local/release.json',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    releaseText = null;
  }
  return validateCommittedState({
    kustomization: readPublicFile(
      root,
      'deploy/environments/local/kustomization.yaml',
    ),
    jobInputs: readJobInputs(root),
    releaseText,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'classify') {
      console.log(`publish=${classifyChanges(args)}`);
    } else if (command === 'release') {
      verifyReleaseIndexes(parseRelease(readFileSync(args[0], 'utf8')));
    } else if (command === 'committed') {
      console.log(
        `Committed deployment state: ${validateCommittedDeployment(args[0] ?? process.cwd())}`,
      );
    } else if (command === 'jobs') {
      const root = args[0] ?? process.cwd();
      validateJobSuffixes(
        parseRelease(
          readPublicFile(root, 'deploy/environments/local/release.json'),
        ),
        readJobInputs(root),
      );
    } else if (command === 'manifests') {
      validateManifests(readFileSync(args[0], 'utf8'));
    } else {
      throw new OperationalFailure(
        'Usage: deployment-validation.mjs classify PATH... | release FILE | manifests FILE | jobs [ROOT] | committed [ROOT]',
      );
    }
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'Deployment validation failed; private provider details suppressed.',
      ),
    );
    process.exitCode = 1;
  }
}
