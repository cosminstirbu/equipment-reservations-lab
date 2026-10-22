import { readFileSync, lstatSync, readdirSync } from 'node:fs';
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
  if (release?.schemaVersion !== undefined)
    return validateComponentRelease(release);
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

export function validateComponentRelease(record) {
  const keys = [
    'schemaVersion',
    'component',
    'repository',
    'sourceRevision',
    'sourceRef',
    'runId',
    'runAttempt',
    'workflow',
    'image',
    'digest',
  ];
  if (
    !record ||
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key)) ||
    record.schemaVersion !== 1 ||
    !imageNames.includes(record.component)
  )
    throw new OperationalFailure('Invalid component release schema');
  const repository = record.repository;
  if (
    !repository ||
    Object.keys(repository).length !== 2 ||
    !Number.isSafeInteger(repository.id) ||
    repository.id <= 0 ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.name ?? '')
  )
    throw new OperationalFailure('Invalid component repository identity');
  if (
    !/^[a-f0-9]{40}$/.test(record.sourceRevision ?? '') ||
    !/^refs\/heads\/[^\s]+$/.test(record.sourceRef ?? '') ||
    !Number.isSafeInteger(record.runId) ||
    record.runId <= 0 ||
    !Number.isSafeInteger(record.runAttempt) ||
    record.runAttempt <= 0 ||
    record.workflow !== '.github/workflows/validate.yaml'
  )
    throw new OperationalFailure(
      'Invalid component source or workflow provenance',
    );
  if (
    record.image !==
      `ghcr.io/${repository.name.toLowerCase()}-${record.component}` ||
    !digestPattern.test(record.digest ?? '')
  )
    throw new OperationalFailure('Invalid component image or index digest');
  return record;
}

export function verifyComponentIndex(record, inspect) {
  validateComponentRelease(record);
  const reference = `${record.image}@${record.digest}`;
  let index;
  if (inspect) index = inspect(reference);
  else {
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
      index = JSON.parse(raw);
    } catch {
      throw new OperationalFailure(
        'Release index response is not valid JSON; raw provider response suppressed.',
      );
    }
  }
  validateIndex(index);
  return index;
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
  return validateManifestPolicy(parseManifestDocuments(text), {
    ciImages,
    ciRevision,
  });
}

function parseManifestDocuments(text) {
  return text
    .split(/^---\s*$/m)
    .filter((document) => document.trim())
    .map((document) => {
      const parsed = parsers.Yaml.parse(document);
      if (parsed.diagnostics.some((item) => item.severity === 0))
        throw new OperationalFailure('Invalid manifest YAML');
      return parsed.data;
    });
}

function validateManifestPolicy(
  documents,
  { ciImages = [], ciRevision } = {},
  acceptImage = () => false,
) {
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
    for (const [kind, containers] of [
      ['initContainers', pod?.initContainers ?? []],
      ['containers', pod?.containers ?? []],
    ])
      for (const container of containers) {
        const accepted = acceptImage(resource, container, kind);
        if (
          !accepted &&
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

export function validateStaticManifests(text, state) {
  validateStaticState(state);
  const documents = parseManifestDocuments(text);
  if (
    documents.some(
      (resource) =>
        ['CronJob', 'PodTemplate'].includes(resource?.kind) ||
        (typeof resource?.kind === 'string' && resource.kind.endsWith('List')),
    )
  )
    throw new OperationalFailure(
      'Unsupported static manifest kind: nested workloads and resource lists',
    );
  const slots = [
    ...['inventory', 'reservations', 'notifications', 'web'].map(
      (component) => ({
        component,
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: component,
        containerKind: 'containers',
        containerName: component,
      }),
    ),
    ...jobNames.map((name) => ({
      component: `${name}-bootstrap`,
      apiVersion: 'batch/v1',
      kind: 'Job',
      name: `${name}-bootstrap${state.jobSuffixes[name]}`,
      containerKind: 'containers',
      containerName: `${name}-bootstrap`,
    })),
    {
      component: 'broker-bootstrap',
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: 'rabbitmq',
      containerKind: 'initContainers',
      containerName: 'definitions',
    },
  ];
  const matches = (resource, slot) =>
    resource?.apiVersion === slot.apiVersion &&
    resource.kind === slot.kind &&
    resource.metadata?.name === slot.name &&
    resource.metadata.namespace === 'equipment';
  for (const slot of slots) {
    const resources = documents.filter((resource) => matches(resource, slot));
    if (
      resources.length !== 1 ||
      (resources[0].spec?.template?.spec?.[slot.containerKind] ?? []).filter(
        (container) => container.name === slot.containerName,
      ).length !== 1
    )
      throw new OperationalFailure(
        `Missing, duplicate or moved component slot: ${slot.component}`,
      );
    const record = state.records[slot.component];
    const expected = record
      ? `${record.image}@${record.digest}`
      : slot.component;
    const container = resources[0].spec.template.spec[slot.containerKind].find(
      (container) => container.name === slot.containerName,
    );
    if (container.image !== expected)
      throw new OperationalFailure(
        `Rendered component image does not match committed state: ${slot.component}`,
      );
  }
  return validateManifestPolicy(documents, {}, (resource, container, kind) => {
    const slot = slots.find(
      (slot) =>
        matches(resource, slot) &&
        kind === slot.containerKind &&
        container.name === slot.containerName,
    );
    return (
      slot &&
      !state.records[slot.component] &&
      container.image === slot.component
    );
  });
}

function validateStaticState(state) {
  try {
    if (
      !state ||
      !state.records ||
      typeof state.records !== 'object' ||
      Array.isArray(state.records) ||
      !Array.isArray(state.missing)
    )
      throw new Error();
    for (const [name, record] of Object.entries(state.records)) {
      validateComponentRelease(record);
      if (record.component !== name) throw new Error();
    }
    const missing = imageNames.filter(
      (name) => !Object.hasOwn(state.records, name),
    );
    if (canonicalRelease(missing) !== canonicalRelease(state.missing))
      throw new Error();
    let status = 'partial';
    if (!missing.length) status = 'released';
    if (missing.length === imageNames.length) status = 'unreleased';
    if (
      state.status !== status ||
      !state.jobSuffixes ||
      Object.keys(state.jobSuffixes).length !== jobNames.length
    )
      throw new Error();
    for (const name of jobNames) {
      const suffix = state.jobSuffixes[name];
      if (
        state.records[`${name}-bootstrap`]
          ? !/^-[a-f0-9]{16}$/.test(suffix ?? '')
          : suffix !== '-unreleased'
      )
        throw new Error();
    }
  } catch {
    throw new OperationalFailure('Invalid static component state');
  }
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
  if (release.schemaVersion === 1)
    return verifyComponentIndex(release, inspect);
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
  records,
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
  if (records !== undefined) {
    for (const [name, record] of Object.entries(records)) {
      validateComponentRelease(record);
      if (name !== record.component)
        throw new OperationalFailure('Component record filename mismatch');
    }
    if (
      overlay.images.length !== Object.keys(records).length ||
      overlay.images.some(
        (entry) =>
          !records[entry.name] ||
          Object.keys(entry).some(
            (key) => !['name', 'newName', 'digest'].includes(key),
          ) ||
          records[entry.name].image !== entry.newName ||
          records[entry.name].digest !== entry.digest,
      ) ||
      new Set(overlay.images.map((entry) => entry.name)).size !==
        overlay.images.length
    )
      throw new OperationalFailure(
        'Committed images do not match available component records',
      );
    for (const name of jobNames) {
      const record = records[`${name}-bootstrap`];
      const job = jobInputs.jobs[name];
      const expected = record
        ? jobSuffix(
            record,
            jobInputs.baseConfiguration,
            jobInputs.localConfiguration,
            job.template,
          )
        : '-unreleased';
      if (validateWrapper(name, job.wrapper).data.nameSuffix !== expected)
        throw new OperationalFailure(
          `Job ${name} has stale or unreleased component suffix`,
        );
    }
    if (Object.keys(records).length === imageNames.length) return 'released';
    if (Object.keys(records).length) return 'partial';
    return 'unreleased';
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
  let hasComponents = false;
  try {
    lstatSync(join(root, 'deploy/environments/local/releases'));
    hasComponents = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (hasComponents) return readComponentState(root).status;
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

export function readComponentState(root, { requireComplete = false } = {}) {
  const records = {};
  const directory = 'deploy/environments/local/releases';
  let entries = [];
  try {
    readPublicFile(root, 'deploy/environments/local/kustomization.yaml');
    let current = resolve(root);
    for (const part of directory.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink())
        throw new OperationalFailure('Symlinked component metadata rejected');
    }
    entries = readdirSync(current);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const entry of entries) {
    const name = entry.replace(/\.json$/, '');
    if (entry !== `${name}.json` || !imageNames.includes(name))
      throw new OperationalFailure('Unknown component record file');
    const text = readPublicFile(root, `${directory}/${entry}`);
    if (Buffer.byteLength(text, 'utf8') > 65536)
      throw new OperationalFailure('Component metadata exceeds 64KiB');
    let record;
    try {
      record = JSON.parse(canonicalRelease(text));
    } catch {
      throw new OperationalFailure('Invalid component record JSON');
    }
    validateComponentRelease(record);
    if (record.component !== name)
      throw new OperationalFailure('Component record filename mismatch');
    records[name] = record;
  }
  const missing = imageNames.filter((name) => !records[name]);
  if (requireComplete && missing.length)
    throw new OperationalFailure(
      `Missing published components: ${missing.join(', ')}`,
    );
  const jobInputs = readJobInputs(root);
  const status = validateCommittedState({
    kustomization: readPublicFile(
      root,
      'deploy/environments/local/kustomization.yaml',
    ),
    jobInputs,
    records,
  });
  const jobSuffixes = Object.fromEntries(
    jobNames.map((name) => [
      name,
      validateWrapper(name, jobInputs.jobs[name].wrapper).data.nameSuffix,
    ]),
  );
  return { records, missing, status, jobSuffixes };
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
      readComponentState(root);
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
