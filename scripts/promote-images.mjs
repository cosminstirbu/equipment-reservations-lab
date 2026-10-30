import {
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdtempSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { check, resolveConfig } from 'prettier';
import { imagePatch, imagePatchPath } from './component-images.mjs';
import { validateStaticDeployment } from './manifest-quality.mjs';
import {
  OperationalFailure,
  safeFailure,
  cleanupAllSync,
  executeProcess,
} from './process.mjs';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import parsers from '@stoplight/spectral-parsers';
import {
  validateRelease,
  jobNames,
  wrapperPath,
  jobSuffix,
  validateWrapper,
  validateJobSuffixes,
  readJobInputs,
  readPublicFile,
  parseRelease,
  validateCommittedState,
  validateComponentRelease,
  validateAzurePublication,
  canonicalRelease,
  imageNames,
  verifyComponentIndex,
  validateIndex,
} from './deployment-validation.mjs';
import { validateRunIntent } from './component-pipelines.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { withRegistryPublication } from './azure-operations.mjs';
export { validateAzurePublication } from './deployment-validation.mjs';

const releasePath = 'deploy/environments/local/release.json';
const overlayPath = 'deploy/environments/local/kustomization.yaml';
const marker = 'chore: promote local application images';

function registryCommand(args, operation, timeout = 45000, signal, env) {
  return runPrivateProcess('docker', ['buildx', 'imagetools', ...args], {
    operation,
    tool: 'docker',
    timeout,
    signal,
    env,
    maxBuffer: 1048576,
  });
}

async function registryIndex(image, record, signal, env) {
  const raw = await registryCommand(
    ['inspect', '--raw', `${image}@${record.digest}`],
    'Registry immutable index verification',
    45000,
    signal,
    env,
  );
  const hash = (text) =>
    `sha256:${createHash('sha256').update(text).digest('hex')}`;
  // Buildx can append a presentation newline to the original manifest bytes.
  if (
    hash(raw) !== record.digest &&
    !(raw.endsWith('\n') && hash(raw.slice(0, -1)) === record.digest)
  )
    throw new OperationalFailure('Registry index digest mismatch');
  let index;
  try {
    index = JSON.parse(raw);
  } catch {
    throw new OperationalFailure('Registry index payload invalid');
  }
  validateIndex(index);
  for (const architecture of ['amd64', 'arm64']) {
    const descriptors = index.manifests.filter(
      (item) =>
        item.platform?.os === 'linux' &&
        item.platform?.architecture === architecture,
    );
    if (descriptors.length !== 1)
      throw new OperationalFailure('Registry platform descriptor is ambiguous');
    const configText = await registryCommand(
      [
        'inspect',
        '--format',
        '{{json .Image}}',
        `${image}@${descriptors[0].digest}`,
      ],
      'Registry source provenance verification',
      45000,
      signal,
      env,
    );
    let config;
    try {
      config = JSON.parse(configText);
    } catch {
      throw new OperationalFailure('Registry source configuration invalid');
    }
    if (
      config.os !== 'linux' ||
      config.architecture !== architecture ||
      config.config?.Labels?.['org.opencontainers.image.revision'] !==
        record.sourceRevision ||
      config.config?.Labels?.['org.opencontainers.image.source'] !==
        `https://github.com/${record.repository.name}`
    )
      throw new OperationalFailure('Registry source provenance mismatch');
  }
  return index;
}

export async function publishDualRegistry({
  release,
  acr,
  copy = true,
  signal,
  env,
}) {
  validateComponentRelease(release);
  if (!/^[a-z0-9]{5,50}\.azurecr\.io$/.test(acr ?? ''))
    throw new OperationalFailure('Explicit valid ACR login server required');
  const image = `${acr}/${release.repository.name.split('/')[1].toLowerCase()}-${release.component}`;
  await registryIndex(release.image, release, signal, env);
  if (copy)
    await registryCommand(
      [
        'create',
        '--tag',
        `${image}:${release.sourceRevision}`,
        `${release.image}@${release.digest}`,
      ],
      'Dual registry immutable publication',
      120000,
      signal,
      env,
    );
  await registryIndex(image, release, signal, env);
  return { schemaVersion: 1, source: release, image, digest: release.digest };
}

function assertPublicationInvocation(
  release,
  intent,
  { mainOnly = false } = {},
) {
  const event = process.env.GITHUB_EVENT_NAME;
  const ref = process.env.GITHUB_REF;
  if (
    !(
      (event === 'push' && ref === 'refs/heads/main') ||
      (event === 'workflow_dispatch' && /^refs\/heads\/[^\s]+$/.test(ref ?? ''))
    ) ||
    (mainOnly && ref !== 'refs/heads/main') ||
    release.repository.name !== process.env.GITHUB_REPOSITORY ||
    release.repository.id !== Number(process.env.GITHUB_REPOSITORY_ID) ||
    release.sourceRevision !== process.env.GITHUB_SHA ||
    release.sourceRef !== ref ||
    release.runId !== Number(process.env.GITHUB_RUN_ID) ||
    release.runAttempt > Number(process.env.GITHUB_RUN_ATTEMPT) ||
    intent.event !== event ||
    intent.sourceRevision !== release.sourceRevision ||
    intent.sourceRef !== release.sourceRef ||
    intent.runId !== release.runId ||
    canonicalRelease(intent.repository) !==
      canonicalRelease(release.repository) ||
    !intent.selected.includes(release.component)
  )
    throw new OperationalFailure(
      'Component publication identity does not match trusted workflow invocation',
    );
}

export async function verifyAzurePublication(publication, options = {}) {
  validateAzurePublication(publication, options);
  await registryIndex(
    publication.source.image,
    publication.source,
    options.signal,
    options.env,
  );
  await registryIndex(
    publication.image,
    publication.source,
    options.signal,
    options.env,
  );
  return publication;
}

function azurePublicationFiles(publication) {
  validateAzurePublication(publication);
  const source = publication.source;
  return {
    [`deploy/environments/azure/releases/${source.component}.json`]: `${JSON.stringify(publication, null, 2)}\n`,
    [`deploy/environments/azure/images/${source.component}.yaml`]: imagePatch(
      source.component,
      `${publication.image}@${publication.digest}`,
    ),
  };
}

export async function proposeAzure({ publication, gateway }) {
  const candidate = azurePublicationFiles(publication);
  const state = await gateway.readState();
  if (!state.managed)
    throw new OperationalFailure(
      'Azure image proposal branch is not managed; manual review required',
    );
  const main = await gateway.readSnapshot(state.base);
  const files = { ...main.azureFiles };
  if (state.head && state.proposalBase !== state.head) {
    const proposal = await gateway.readSnapshot(state.head);
    const ancestor = await gateway.readSnapshot(state.proposalBase);
    for (const [path, text] of Object.entries(proposal.azureFiles)) {
      if (text === ancestor.azureFiles[path]) continue;
      if (
        main.azureFiles[path] !== ancestor.azureFiles[path] &&
        main.azureFiles[path] !== text
      )
        throw new OperationalFailure(
          'Azure image proposal conflicts with reviewed main; manual review required',
        );
      files[path] = text;
    }
  }
  const previousText =
    files[
      `deploy/environments/azure/releases/${publication.source.component}.json`
    ];
  if (previousText) {
    const previous = JSON.parse(canonicalRelease(previousText));
    if (
      previous.source.sourceRevision === publication.source.sourceRevision &&
      previous.digest !== publication.digest
    )
      throw new OperationalFailure(
        'Divergent image content for the same source release',
      );
    if (
      previous.source.sourceRevision !== publication.source.sourceRevision &&
      !(await gateway.isAncestor(
        previous.source.sourceRevision,
        publication.source.sourceRevision,
      ))
    )
      throw new OperationalFailure(
        'Azure source release is stale or on a different lineage',
      );
  }
  const previousFiles = { ...files };
  Object.assign(files, candidate);
  if (canonicalRelease(files) === canonicalRelease(main.azureFiles))
    return { status: 'noop' };
  if (canonicalRelease(files) === canonicalRelease(previousFiles))
    return gateway.ensurePullRequest();
  const current = await gateway.readState();
  if (current.base !== state.base || current.head !== state.head)
    throw new OperationalFailure('Azure image proposal changed before commit');
  const commit = await gateway.commit(
    files,
    state.head ?? state.base,
    `chore: propose Azure component images\n\nComponent: ${publication.source.component}\nSource: ${publication.source.sourceRevision}`,
    { treeParent: state.base, mergeParent: state.base },
  );
  const beforeRef = await gateway.readState();
  if (beforeRef.base !== state.base || beforeRef.head !== state.head)
    throw new OperationalFailure(
      'Azure image proposal changed before ref update',
    );
  await gateway.compareAndSwap(state.head, commit);
  return gateway.ensurePullRequest();
}

export function promotionFiles(release, kustomization, jobInputs) {
  validateRelease(release);
  if (release.schemaVersion === 1) {
    const files = {
      [`deploy/environments/local/releases/${release.component}.json`]: `${JSON.stringify(release, null, 2)}\n`,
      [imagePatchPath(release.component)]: imagePatch(
        release.component,
        `${release.image}@${release.digest}`,
      ),
    };
    const name = jobNames.find(
      (name) => release.component === `${name}-bootstrap`,
    );
    if (name) {
      const job = jobInputs.jobs[name];
      const parsed = validateWrapper(name, job.wrapper);
      const node = parsed.ast.mappings.find(
        (mapping) => mapping.key.value === 'nameSuffix',
      );
      const suffix = jobSuffix(
        release,
        jobInputs.baseConfiguration,
        jobInputs.localConfiguration,
        job.template,
      );
      files[wrapperPath(name)] =
        `${job.wrapper.slice(0, node.value.startPosition)}${suffix}${job.wrapper.slice(node.value.endPosition)}`;
    }
    return files;
  }
  const parsed = parsers.Yaml.parse(kustomization);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new OperationalFailure('Invalid kustomization');
  const overlay = parsed.data;
  if (overlay.patches?.some((patch) => patch.path?.startsWith('images/'))) {
    return {
      [releasePath]: `${JSON.stringify(release, null, 2)}\n`,
      [overlayPath]: kustomization,
      ...Object.fromEntries(
        Object.entries(release.images).map(([name, entry]) => [
          imagePatchPath(name),
          imagePatch(name, `${entry.image}@${entry.digest}`),
        ]),
      ),
      ...jobWrapperFiles(release, jobInputs),
    };
  }
  const entries =
    release.schemaVersion === 1
      ? { [release.component]: release }
      : release.images;
  const replacements = Object.entries(entries).map(([name, entry]) => ({
    name,
    newName: entry.image,
    digest: entry.digest,
  }));
  const images = [
    ...(overlay.images ?? []).filter((entry) => !entries[entry.name]),
    ...replacements,
  ];
  const imagesNode = parsed.ast.mappings.find(
    (mapping) => mapping.key.value === 'images',
  );
  const imageLines = images.flatMap(({ name, newName, digest }) => [
    `  - name: ${name}`,
    `    newName: ${newName}`,
    `    digest: ${digest}`,
  ]);
  const replacement = images.length
    ? ['images:', ...imageLines].join('\n')
    : 'images: []';
  const remainder = imagesNode
    ? kustomization.slice(imagesNode.value.endPosition).replace(/^\r?\n/, '')
    : '';
  const updated = imagesNode
    ? `${kustomization.slice(0, imagesNode.key.startPosition)}${replacement}\n${remainder}`
    : `${kustomization.trimEnd()}\n${replacement}\n`;

  return {
    [releasePath]: `${JSON.stringify(release, null, 2)}\n`,
    [overlayPath]: updated,
    ...jobWrapperFiles(release, jobInputs),
  };
}

export function jobWrapperFiles(release, inputs) {
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
  const files = {};
  const proposal = { ...inputs, jobs: {} };
  for (const name of jobNames) {
    const job = inputs.jobs[name];
    const parsed = validateWrapper(name, job.wrapper);
    const node = parsed.ast.mappings.find(
      (mapping) => mapping.key.value === 'nameSuffix',
    );
    const suffix = jobSuffix(
      release,
      inputs.baseConfiguration,
      inputs.localConfiguration,
      job.template,
    );
    const wrapper = `${job.wrapper.slice(0, node.value.startPosition)}${suffix}${job.wrapper.slice(node.value.endPosition)}`;
    files[wrapperPath(name)] = wrapper;
    proposal.jobs[name] = { ...job, wrapper };
  }
  if (Object.keys(inputs.jobs).some((name) => !jobNames.includes(name)))
    throw new OperationalFailure('Unexpected Job input');
  validateJobSuffixes(release, proposal);
  return files;
}

export function refreshJobSuffixes(root) {
  let releaseText = null;
  try {
    releaseText = readPublicFile(root, releasePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inputs = readJobInputs(root);
  const originals = {};
  const files = {};
  if (releaseText !== null)
    Object.assign(files, jobWrapperFiles(parseRelease(releaseText), inputs));
  else
    for (const name of jobNames) {
      const path = `deploy/environments/local/releases/${name}-bootstrap.json`;
      let text;
      try {
        text = readPublicFile(root, path);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const record = validateComponentRelease(
        JSON.parse(canonicalRelease(text)),
      );
      if (record.component !== `${name}-bootstrap`)
        throw new OperationalFailure('Bootstrap component filename mismatch');
      originals[path] = text;
      const proposed = promotionFiles(record, 'images: []\n', inputs);
      files[wrapperPath(name)] = proposed[wrapperPath(name)];
    }
  const temporary = [];
  let primary;
  try {
    for (const [path, content] of Object.entries(files)) {
      const temporaryPath = join(root, `${path}.${randomUUID()}.tmp`);
      writeFileSync(temporaryPath, content, { flag: 'wx' });
      temporary.push({ path, temporaryPath });
    }
    if (
      (releaseText !== null &&
        readPublicFile(root, releasePath) !== releaseText) ||
      Object.entries(originals).some(
        ([path, text]) => readPublicFile(root, path) !== text,
      ) ||
      JSON.stringify(readJobInputs(root)) !== JSON.stringify(inputs)
    )
      throw new OperationalFailure(
        'Public release or Job input changed during refresh',
      );
    for (const { path, temporaryPath } of temporary)
      renameSync(temporaryPath, join(root, path));
  } catch (error) {
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            'Job suffix refresh failed; private filesystem details suppressed.',
          );
  } finally {
    cleanupAllSync(
      temporary.map(({ temporaryPath }) => ({
        operation: 'Job suffix temporary cleanup',
        tool: 'filesystem',
        run: () => rmSync(temporaryPath, { force: true }),
      })),
      { primary },
    );
  }
  return Object.keys(files);
}

function neutralField(text, key) {
  const parsed = parsers.Yaml.parse(text);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new OperationalFailure('Invalid parent YAML');
  const node = parsed.ast.mappings.find((mapping) => mapping.key.value === key);
  if (!node) return `${text.trimEnd()}\n<${key}>`;
  return `${text.slice(0, node.key.startPosition).trimEnd()}\n<${key}>\n${text.slice(node.value.endPosition).trimStart()}`.trimEnd();
}

function assertCompatibleParent(parent, main) {
  if (
    neutralField(parent.kustomization, 'images') !==
      neutralField(main.kustomization, 'images') ||
    parent.jobInputs.baseConfiguration !== main.jobInputs.baseConfiguration ||
    parent.jobInputs.localConfiguration !== main.jobInputs.localConfiguration
  )
    throw new OperationalFailure(
      'Promotion parent has unrelated main or branch changes; review manually',
    );
  for (const name of jobNames) {
    if (
      parent.jobInputs.jobs[name].template !==
        main.jobInputs.jobs[name].template ||
      neutralField(parent.jobInputs.jobs[name].wrapper, 'nameSuffix') !==
        neutralField(main.jobInputs.jobs[name].wrapper, 'nameSuffix')
    )
      throw new OperationalFailure(
        'Promotion parent public inputs or unrelated wrapper fields changed',
      );
  }
}

export async function promote({
  release,
  intent,
  checkoutRevision,
  expectedHead,
  gateway,
}) {
  if (release?.schemaVersion === 1)
    return promoteComponent({ release, intent, gateway });
  validateRelease(release);
  const state = await gateway.readState();
  if (
    state.base !== checkoutRevision ||
    release.sourceRevision !== checkoutRevision
  )
    throw new OperationalFailure(
      'Remote main advanced beyond the verified checkout revision; rerun release from current main',
    );
  if (state.head !== expectedHead || (state.head && !state.managed))
    throw new OperationalFailure(
      'Promotion head changed or is not managed; review existing branch manually',
    );
  const parentRevision = state.head ?? state.base;
  const parent = await gateway.readSnapshot(parentRevision);
  if (parent.revision !== parentRevision)
    throw new OperationalFailure('Promotion parent revision mismatch');
  if (state.head) {
    const main = await gateway.readSnapshot(state.base);
    if (main.revision !== state.base)
      throw new OperationalFailure('Main snapshot revision mismatch');
    assertCompatibleParent(parent, main);
  }
  const files = promotionFiles(release, parent.kustomization, parent.jobInputs);
  const current = await gateway.readState();
  if (
    current.base !== state.base ||
    current.head !== state.head ||
    (current.head && !current.managed)
  )
    throw new OperationalFailure(
      'Main or promotion parent changed before mutation',
    );
  const commit = await gateway.commit(
    files,
    parentRevision,
    `${marker}\n\nSource: ${release.sourceRevision}`,
  );
  await gateway.compareAndSwap(state.head, commit);
  return gateway.ensurePullRequest();
}

async function promoteComponent({ release, intent, gateway }) {
  validateComponentRelease(release);
  validateRunIntent(intent);
  if (!intent.selected.includes(release.component))
    throw new OperationalFailure(
      'Component was not selected in original run intent',
    );
  if (
    !intent ||
    intent.schemaVersion !== 1 ||
    intent.sourceRevision !== release.sourceRevision ||
    intent.sourceRef !== release.sourceRef ||
    intent.runId !== release.runId ||
    intent.workflow !== release.workflow ||
    canonicalRecord(intent.repository) !==
      canonicalRecord(release.repository) ||
    !['push', 'workflow_dispatch'].includes(intent.event) ||
    (intent.event === 'push' && intent.sourceRef !== 'refs/heads/main')
  )
    throw new OperationalFailure(
      'Component promotion requires original trusted run intent',
    );
  const expected = intent.components?.[release.component];
  if (
    !expected ||
    !Object.hasOwn(expected, 'target') ||
    !Object.hasOwn(expected, 'proposal')
  )
    throw new OperationalFailure(
      'Missing original component target intent; dispatch a fresh run',
    );
  if (expected.proposal !== null)
    throw new OperationalFailure(
      'Legacy promotion proposal intent; dispatch a fresh run',
    );
  const state = await gateway.readState();
  const main = await gateway.readSnapshot(state.base);
  if (main.revision !== state.base)
    throw new OperationalFailure('Main snapshot revision mismatch');
  const target = main.records?.[release.component] ?? null;
  if (canonicalRecord(target) === canonicalRecord(release))
    return { status: 'noop' };
  if (canonicalRecord(target) !== canonicalRecord(expected.target))
    throw new OperationalFailure(
      'Component target changed since original intent; dispatch a fresh run',
    );
  if (target?.digest === release.digest) return { status: 'noop' };
  if (
    target &&
    target.sourceRevision !== release.sourceRevision &&
    (await gateway.isAncestor(release.sourceRevision, target.sourceRevision))
  )
    throw new OperationalFailure(
      'Component candidate is obsolete on the same source lineage; dispatch a fresh run',
    );
  const files = promotionFiles(release, main.kustomization, main.jobInputs);
  await gateway.validateCandidate(files, main);
  const current = await gateway.readState();
  if (current.base !== state.base)
    throw new OperationalFailure(
      'Main changed before mutation; rerun promotion',
    );
  const commit = await gateway.commit(
    files,
    state.base,
    `${marker}\n\nComponent: ${release.component}\nSource: ${release.sourceRevision}\nBranch: ${release.sourceRef}`,
  );
  const beforeRef = await gateway.readState();
  if (beforeRef.base !== state.base)
    throw new OperationalFailure(
      'Main changed before ref mutation; rerun promotion',
    );
  await gateway.compareAndSwap(state.base, commit);
  return { status: 'promoted', commit };
}

function canonicalRecord(record) {
  return canonicalRelease(record);
}

export function githubGateway({
  repository,
  component,
  token,
  request = globalThis.fetch,
  kubectl,
  azure = false,
  signal,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token)
    throw new OperationalFailure('Repository and promotion token required');
  if (component !== undefined && !imageNames.includes(component))
    throw new OperationalFailure('Unknown promotion component');
  if (azure && !component)
    throw new OperationalFailure('Azure proposal requires component identity');
  const branch = azure
    ? 'automation/azure-image-promotion'
    : component
      ? 'main'
      : 'automation/local-image-promotion';
  const proposalMarker = azure
    ? 'chore: propose Azure component images'
    : marker;
  const allowedPaths = azure
    ? imageNames.flatMap((name) => [
        `deploy/environments/azure/releases/${name}.json`,
        `deploy/environments/azure/images/${name}.yaml`,
      ])
    : component
      ? [
          `deploy/environments/local/releases/${component}.json`,
          imagePatchPath(component),
          ...jobNames
            .filter((name) => component === `${name}-bootstrap`)
            .map(wrapperPath),
        ]
      : [releasePath, overlayPath, ...jobNames.map(wrapperPath)];
  const root = `https://api.github.com/repos/${repository}`;
  const owner = repository.split('/')[0];
  async function api(path, method = 'GET', body, allowMissing = false) {
    if (signal?.aborted)
      throw new OperationalFailure(
        'GitHub proposal cancelled after lost operation lease',
      );
    let response;
    try {
      response = await request(
        path === 'graphql'
          ? 'https://api.github.com/graphql'
          : `${root}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: signal
            ? globalThis.AbortSignal.any([
                signal,
                globalThis.AbortSignal.timeout(15000),
              ])
            : globalThis.AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new OperationalFailure(
        'GitHub authenticated request failed: transport or timeout.',
      );
    }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok)
      throw new OperationalFailure(
        `GitHub authenticated request failed (HTTP ${Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : 'unavailable'}).`,
      );
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new OperationalFailure(
        'GitHub authenticated response payload is invalid.',
      );
    }
  }
  return {
    async readState() {
      const base = (await api('/git/ref/heads/main')).object.sha;
      if (!/^[a-f0-9]{40}$/.test(base ?? ''))
        throw new OperationalFailure('Invalid main ref identity');
      if (component && !azure) return { base, head: null, managed: true };
      const ref = await api(`/git/ref/heads/${branch}`, 'GET', undefined, true);
      if (!ref) return { base, head: null, managed: true };
      const comparison = await api(
        `/compare/${base}...${ref.object.sha}?per_page=100`,
      );
      const managed =
        (component
          ? Number.isSafeInteger(comparison.behind_by) &&
            comparison.behind_by >= 0 &&
            /^[a-f0-9]{40}$/.test(comparison.merge_base_commit?.sha ?? '')
          : comparison.behind_by === 0 &&
            comparison.merge_base_commit?.sha === base) &&
        (azure ? comparison.ahead_by >= 0 : comparison.ahead_by > 0) &&
        comparison.ahead_by <= 100 &&
        Array.isArray(comparison.commits) &&
        comparison.commits.length === comparison.ahead_by &&
        ((azure &&
          comparison.ahead_by === 0 &&
          comparison.merge_base_commit?.sha === ref.object.sha) ||
          comparison.commits.at(-1)?.sha === ref.object.sha) &&
        comparison.commits.every(
          (commit) =>
            commit.author?.login === 'github-actions[bot]' &&
            commit.commit.message.startsWith(`${proposalMarker}\n`),
        ) &&
        Array.isArray(comparison.files) &&
        comparison.files.length < 300 &&
        comparison.files.every(
          (file) =>
            allowedPaths.includes(file.filename) &&
            (!jobNames.some((name) => wrapperPath(name) === file.filename) ||
              (file.status === 'modified' &&
                file.patch
                  ?.split('\n')
                  .filter((line) => /^[+-]/.test(line))
                  .every((line) =>
                    /^[+-]nameSuffix: (['"]?)-(?:[a-f0-9]{16}|unreleased)\1$/.test(
                      line,
                    ),
                  ))),
        );
      return {
        base,
        head: ref.object.sha,
        managed,
        ...(component
          ? { proposalBase: comparison.merge_base_commit?.sha }
          : {}),
      };
    },
    async isAncestor(ancestor, descendant) {
      if (
        !/^[a-f0-9]{40}$/.test(ancestor ?? '') ||
        !/^[a-f0-9]{40}$/.test(descendant ?? '')
      )
        throw new OperationalFailure(
          'Exact component lineage revisions required',
        );
      const comparison = await api(
        `/compare/${ancestor}...${descendant}?per_page=1`,
      );
      if (
        !['ahead', 'behind', 'diverged', 'identical'].includes(
          comparison?.status,
        ) ||
        !/^[a-f0-9]{40}$/.test(comparison.merge_base_commit?.sha ?? '')
      )
        throw new OperationalFailure(
          'Invalid GitHub lineage response; source freshness cannot be established',
        );
      return (
        comparison.merge_base_commit?.sha === ancestor &&
        ['ahead', 'identical'].includes(comparison.status)
      );
    },
    async readSnapshot(revision) {
      if (!/^[a-f0-9]{40}$/.test(revision))
        throw new OperationalFailure('Exact parent commit revision required');
      const commit = await api(`/git/commits/${revision}`);
      if (
        commit.sha !== revision ||
        !/^[a-f0-9]{40}$/.test(commit.tree?.sha ?? '')
      )
        throw new OperationalFailure('Parent commit identity mismatch');
      const tree = await api(`/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.sha !== commit.tree.sha)
        throw new OperationalFailure('Parent tree identity mismatch');
      if (tree.truncated)
        throw new OperationalFailure('Incomplete parent tree rejected');
      const cache = new Map();
      async function file(path, optional = false) {
        if (cache.has(path)) return cache.get(path);
        const matches = tree.tree.filter((item) => item.path === path);
        if (matches.length > 1)
          throw new OperationalFailure('Ambiguous parent tree input');
        const entry = matches[0];
        if (!entry && optional) return null;
        if (!entry || entry.type !== 'blob' || entry.mode !== '100644')
          throw new OperationalFailure(
            'Missing or symlinked parent input rejected',
          );
        const blob = await api(`/git/blobs/${entry.sha}`);
        if (blob.encoding !== 'base64')
          throw new OperationalFailure('Unexpected parent blob encoding');
        const bytes = Buffer.from(blob.content, 'base64');
        const objectId = createHash('sha1')
          .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
          .digest('hex');
        if (blob.sha !== entry.sha || objectId !== entry.sha)
          throw new OperationalFailure('Parent blob identity mismatch');
        const text = bytes.toString('utf8');
        if (!Buffer.from(text, 'utf8').equals(bytes))
          throw new OperationalFailure('Invalid parent UTF-8 input');
        cache.set(path, text);
        return text;
      }
      if (azure) {
        const azureFiles = {};
        for (const name of imageNames) {
          const path = `deploy/environments/azure/releases/${name}.json`;
          const text = await file(path, true);
          const patch = await file(
            `deploy/environments/azure/images/${name}.yaml`,
            true,
          );
          if (text === null && patch === null) continue;
          if (text === null || patch === null)
            throw new OperationalFailure(
              'Incomplete Azure component publication',
            );
          const publication = JSON.parse(canonicalRelease(text));
          if (
            publication.source?.component !== name ||
            publication.source.repository.name !== repository
          )
            throw new OperationalFailure(
              'Azure component publication identity mismatch',
            );
          const expected = azurePublicationFiles(publication);
          if (
            patch !== expected[`deploy/environments/azure/images/${name}.yaml`]
          )
            throw new OperationalFailure(
              'Azure image patch does not match publication',
            );
          Object.assign(azureFiles, expected);
        }
        return { revision, azureFiles };
      }
      const jobInputs = {
        baseConfiguration: await file('deploy/base/configuration.yaml'),
        localConfiguration: await file(
          'deploy/environments/local/configuration.yaml',
        ),
        jobs: {},
      };
      for (const name of jobNames)
        jobInputs.jobs[name] = {
          template: await file(`deploy/base/jobs/${name}/job.yaml`),
          wrapper: await file(wrapperPath(name)),
        };
      const snapshot = {
        revision,
        kustomization: await file(overlayPath),
        jobInputs,
        releaseText: await file(releasePath, true),
      };
      if (component) {
        snapshot.records = {};
        for (const entry of tree.tree) {
          if (!entry.path.startsWith('deploy/environments/local/releases/'))
            continue;
          const name = entry.path
            .slice('deploy/environments/local/releases/'.length)
            .replace(/\.json$/, '');
          if (
            entry.path !== `deploy/environments/local/releases/${name}.json` ||
            !imageNames.includes(name)
          )
            throw new OperationalFailure(
              'Unknown component metadata in parent tree',
            );
          let record;
          try {
            record = JSON.parse(canonicalRelease(await file(entry.path)));
          } catch {
            throw new OperationalFailure(
              'Invalid component metadata in parent tree',
            );
          }
          validateComponentRelease(record);
          if (
            record.component !== name ||
            record.repository.name !== repository
          )
            throw new OperationalFailure(
              'Parent component record identity mismatch',
            );
          snapshot.records[name] = record;
        }
      }
      {
        snapshot.imagePatches = {};
        const overlay = parsers.Yaml.parse(snapshot.kustomization).data;
        if (overlay.patches?.some((patch) => patch.path?.startsWith('images/')))
          for (const name of imageNames)
            snapshot.imagePatches[name] = await file(imagePatchPath(name));
        if (!Object.keys(snapshot.imagePatches).length)
          snapshot.imagePatches = undefined;
      }
      if (component) {
        snapshot.publicFiles = {};
        const entries = tree.tree.filter(
          (entry) =>
            /^deploy\/(base\/|environments\/local\/)/.test(entry.path) &&
            entry.type === 'blob',
        );
        if (entries.length > 150)
          throw new OperationalFailure(
            'Candidate manifest tree exceeds file bound',
          );
        let size = 0;
        for (const entry of entries) {
          if (
            !/^deploy\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:yaml|json)$/.test(
              entry.path,
            )
          )
            throw new OperationalFailure('Unsupported candidate manifest path');
          const text = await file(entry.path);
          size += Buffer.byteLength(text);
          if (size > 2097152)
            throw new OperationalFailure(
              'Candidate manifest tree exceeds size bound',
            );
          snapshot.publicFiles[entry.path] = text;
        }
      }
      validateCommittedState(snapshot);
      return snapshot;
    },
    async validateCandidate(files, snapshot) {
      if (!component || !snapshot.publicFiles)
        throw new OperationalFailure(
          'Exact public candidate snapshot required',
        );
      const directory = mkdtempSync(join(tmpdir(), 'component-promotion-'));
      let primary;
      try {
        const options = await resolveConfig(resolve('.prettierrc.json'));
        for (const [path, text] of Object.entries(files))
          if (!(await check(text, { ...options, filepath: path })))
            throw new OperationalFailure(
              'Promotion candidate formatting failed',
            );
        for (const [path, text] of Object.entries({
          ...snapshot.publicFiles,
          ...files,
        })) {
          mkdirSync(dirname(join(directory, path)), { recursive: true });
          writeFileSync(join(directory, path), text);
        }
        return await validateStaticDeployment({ root: directory, kubectl });
      } catch (error) {
        primary = error;
      } finally {
        cleanupAllSync(
          [
            {
              operation: 'Promotion candidate cleanup',
              tool: 'filesystem',
              run: () => rmSync(directory, { recursive: true, force: true }),
            },
          ],
          { primary },
        );
      }
    },
    async commit(
      files,
      parent,
      message,
      { treeParent = parent, mergeParent = null } = {},
    ) {
      if (
        (!azure && Object.keys(files).length !== allowedPaths.length) ||
        !Object.keys(files).length ||
        Object.keys(files).some((path) => !allowedPaths.includes(path))
      )
        throw new OperationalFailure('Unexpected promotion file');
      const parentCommit = await api(`/git/commits/${treeParent}`);
      const tree = await api('/git/trees', 'POST', {
        base_tree: parentCommit.tree.sha,
        tree: Object.entries(files).map(([path, content]) => ({
          path,
          mode: '100644',
          type: 'blob',
          content,
        })),
      });
      return (
        await api('/git/commits', 'POST', {
          message,
          tree: tree.sha,
          parents:
            mergeParent && mergeParent !== parent
              ? [parent, mergeParent]
              : [parent],
        })
      ).sha;
    },
    async compareAndSwap(expected, sha) {
      if (component && !azure && !/^[a-f0-9]{40}$/.test(expected ?? ''))
        throw new OperationalFailure('Exact main parent required');
      const repositoryId = (await api('')).node_id;
      const result = await api('graphql', 'POST', {
        query:
          'mutation($input: UpdateRefsInput!) { updateRefs(input: $input) { clientMutationId } }',
        variables: {
          input: {
            repositoryId,
            refUpdates: [
              {
                name: `refs/heads/${branch}`,
                beforeOid: expected ?? '0'.repeat(40),
                afterOid: sha,
                force: false,
              },
            ],
          },
        },
      });
      if (
        result.errors?.some((error) =>
          ['FORBIDDEN', 'UNAUTHORIZED'].includes(error.type),
        )
      )
        throw new OperationalFailure(
          'GitHub promotion authorization rejected; repository policy unchanged.',
        );
      if (result.errors?.length || !result.data?.updateRefs)
        throw new OperationalFailure(
          'Promotion head changed or atomic update rejected; no ref was changed',
        );
    },
    async ensurePullRequest() {
      const prs = await api(
        `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`,
      );
      if (prs.length > 1)
        throw new OperationalFailure(
          'Multiple promotion PRs require manual review',
        );
      if (prs.length) return prs[0];
      return api('/pulls', 'POST', {
        title: proposalMarker,
        head: branch,
        base: 'main',
        body: azure
          ? 'Updates verified matching GHCR/ACR component digests and source provenance. Initial creation accumulates all seven components in this PR; merge only when complete Azure manifest checks pass. Review immutable digests and source revisions.'
          : 'Updates only local application image digests and source provenance. Review immutable indexes and source revision before merging.',
      });
    },
  };
}

export async function runPromotionCommand({
  argv = process.argv,
  signal,
} = {}) {
  if (argv[2] === 'registry-login') {
    const acr = argv[3];
    if (
      !/^[a-z0-9]{5,50}\.azurecr\.io$/.test(acr ?? '') ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)
    )
      throw new OperationalFailure(
        'Registry login requires trusted main and explicit ACR',
      );
    await runPrivateProcess(
      process.platform === 'win32' ? 'cmd.exe' : 'az',
      process.platform === 'win32'
        ? [
            '/d',
            '/s',
            '/c',
            `az acr login --name ${acr.split('.')[0]} --output none`,
          ]
        : ['acr', 'login', '--name', acr.split('.')[0], '--output', 'none'],
      {
        operation: 'ACR federated registry login',
        tool: 'az',
        timeout: 60000,
        maxBuffer: 65536,
      },
    );
    console.log('ACR registry authentication ready.');
  } else if (argv[2] === 'repopulate') {
    const component = argv[3];
    const revision = process.env.GITHUB_SHA;
    if (
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      !/^[a-f0-9]{40}$/.test(revision ?? '') ||
      !imageNames.includes(component) ||
      (argv.length !== 6 && !(argv.length === 7 && argv[6] === '--propose'))
    )
      throw new OperationalFailure(
        'Registry repopulation requires exact trusted-main reviewed release',
      );
    const text = executeProcess(
      'git',
      [
        'show',
        `${revision}:deploy/environments/azure/releases/${component}.json`,
      ],
      {
        operation: 'Reviewed registry recovery publication',
        tool: 'git',
        output: 'private-capture',
        timeout: 15000,
        maxBuffer: 65536,
      },
    );
    const previous = JSON.parse(canonicalRelease(text));
    azurePublicationFiles(previous);
    const release = previous.source;
    if (
      release.component !== component ||
      release.sourceRef !== 'refs/heads/main' ||
      release.repository.name !== process.env.GITHUB_REPOSITORY ||
      release.repository.id !== Number(process.env.GITHUB_REPOSITORY_ID)
    )
      throw new OperationalFailure(
        'Reviewed registry recovery provenance mismatch',
      );
    const publication = await publishDualRegistry({
      release,
      acr: argv[4],
      signal,
    });
    if (argv[6] === '--propose')
      await proposeAzure({
        publication,
        gateway: githubGateway({
          repository: release.repository.name,
          component,
          azure: true,
          signal,
          token: process.env.GH_TOKEN,
        }),
      });
    writeFileSync(argv[5], `${JSON.stringify(publication, null, 2)}\n`);
    console.log(
      `Repopulated verified original component: ${component} ${release.digest}`,
    );
  } else if (argv[2] === 'dual') {
    if (argv.length !== 7 && !(argv.length === 8 && argv[7] === '--propose'))
      throw new OperationalFailure(
        'Dual registry publication requires result, intent, ACR and output',
      );
    const result = JSON.parse(canonicalRelease(readFileSync(argv[3], 'utf8')));
    const release = validateComponentRelease(result.record);
    const intent = validateRunIntent(
      JSON.parse(canonicalRelease(readFileSync(argv[4], 'utf8'))),
    );
    assertPublicationInvocation(release, intent, { mainOnly: true });
    validateIndex(result.index);
    const publication = await publishDualRegistry({
      release,
      acr: argv[5],
      signal,
    });
    if (argv[7] === '--propose')
      await proposeAzure({
        publication,
        gateway: githubGateway({
          repository: release.repository.name,
          component: release.component,
          azure: true,
          signal,
          token: process.env.GH_TOKEN,
        }),
      });
    writeFileSync(argv[6], `${JSON.stringify(publication, null, 2)}\n`);
    console.log(
      `Verified dual registry publication: ${release.component} ${release.digest}`,
    );
  } else if (argv[2] === 'refresh') {
    refreshJobSuffixes(argv[3] ?? process.cwd());
    console.log(
      'Refreshed only local bootstrap Job suffixes; review the configuration diff.',
    );
  } else {
    const event = process.env.GITHUB_EVENT_NAME;
    const ref = process.env.GITHUB_REF;
    if (!(
      (event === 'push' && ref === 'refs/heads/main') ||
      (event === 'workflow_dispatch' && /^refs\/heads\/[^\s]+$/.test(ref ?? ''))
    ))
      throw new OperationalFailure(
        'Promotion requires trusted repository branch invocation',
      );
    const resultFile = JSON.parse(
      canonicalRelease(readFileSync(argv[2], 'utf8')),
    );
    const release = validateComponentRelease(resultFile.record);
    const intent = validateRunIntent(
      JSON.parse(canonicalRelease(readFileSync(argv[3], 'utf8'))),
    );
    if (
      release.repository.name !== process.env.GITHUB_REPOSITORY ||
      release.repository.id !== Number(process.env.GITHUB_REPOSITORY_ID) ||
      release.sourceRevision !== process.env.GITHUB_SHA ||
      release.sourceRef !== ref ||
      release.runId !== Number(process.env.GITHUB_RUN_ID) ||
      release.runAttempt > Number(process.env.GITHUB_RUN_ATTEMPT) ||
      intent.event !== event
    )
      throw new OperationalFailure(
        'Component publication identity does not match current workflow invocation',
      );
    validateIndex(resultFile.index);
    verifyComponentIndex(release);
    const gateway = githubGateway({
      repository: process.env.GITHUB_REPOSITORY,
      component: release.component,
      token: process.env.GH_TOKEN,
      kubectl: process.env.PROMOTION_KUBECTL,
    });
    const result = await promote({
      release,
      intent,
      gateway,
    });
    console.log(
      result.status === 'noop'
        ? 'Component already deployed; no promotion needed.'
        : `Promoted component to main: ${result.commit}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (['dual', 'repopulate'].includes(process.argv[2])) {
      await withRegistryPublication(
        {
          configPath: process.env.AZURE_CONFIG_PATH,
          outputsPath: process.env.AZURE_OUTPUTS_PATH,
        },
        async ({ signal, outputs }) => {
          const acr =
            process.argv[2] === 'dual' ? process.argv[5] : process.argv[4];
          if (acr !== outputs.acr_login_server)
            throw new OperationalFailure(
              'Publication registry does not match approved environment outputs',
            );
          return runPromotionCommand({ signal });
        },
      );
    } else await runPromotionCommand();
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'Promotion failed; private transport and provider payloads are suppressed.',
      ),
    );
    process.exitCode = 1;
  }
}
