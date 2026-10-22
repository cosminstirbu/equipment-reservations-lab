import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { OperationalFailure, safeFailure, cleanupAllSync } from './process.mjs';
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
  canonicalRelease,
  imageNames,
  verifyComponentIndex,
  validateIndex,
} from './deployment-validation.mjs';
import { validateRunIntent } from './component-pipelines.mjs';

const releasePath = 'deploy/environments/local/release.json';
const overlayPath = 'deploy/environments/local/kustomization.yaml';
const marker = 'chore: promote local application images';

export function promotionFiles(release, kustomization, jobInputs) {
  validateRelease(release);
  const parsed = parsers.Yaml.parse(kustomization);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new OperationalFailure('Invalid kustomization');
  const overlay = parsed.data;
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

  if (release.schemaVersion === 1) {
    const files = {
      [`deploy/environments/local/releases/${release.component}.json`]: `${JSON.stringify(release, null, 2)}\n`,
      [overlayPath]: updated,
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
  const state = await gateway.readState();
  if (
    state.head !== (expected.proposal?.head ?? null) ||
    (state.head && !state.managed)
  )
    throw new OperationalFailure(
      'Captured component proposal changed or has human edits; dispatch a fresh run',
    );
  const main = await gateway.readSnapshot(state.base);
  if (main.revision !== state.base)
    throw new OperationalFailure('Main snapshot revision mismatch');
  let proposal;
  if (state.head) {
    proposal = await gateway.readSnapshot(state.head);
    if (
      proposal.revision !== state.head ||
      canonicalRecord(proposal.records?.[release.component] ?? null) !==
        canonicalRecord(expected.proposal.record)
    )
      throw new OperationalFailure(
        'Captured component proposal record changed; dispatch a fresh run',
      );
    const proposalBase =
      state.proposalBase && state.proposalBase !== state.base
        ? await gateway.readSnapshot(state.proposalBase)
        : main;
    assertCompatibleParent(proposal, proposalBase);
    for (const name of imageNames.filter(
      (name) => name !== release.component,
    )) {
      if (
        canonicalRecord(proposal.records?.[name] ?? null) !==
        canonicalRecord(proposalBase.records?.[name] ?? null)
      )
        throw new OperationalFailure(
          'Managed proposal contains unrelated component changes',
        );
    }
    const siblingImages = (snapshot) =>
      parsers.Yaml.parse(snapshot.kustomization)
        .data.images.filter((entry) => entry.name !== release.component)
        .sort((left, right) => left.name.localeCompare(right.name));
    if (
      canonicalRecord(siblingImages(proposal)) !==
      canonicalRecord(siblingImages(proposalBase))
    )
      throw new OperationalFailure(
        'Managed proposal contains unrelated component image changes',
      );
    for (const name of jobNames.filter(
      (name) => release.component !== `${name}-bootstrap`,
    ))
      if (
        proposal.jobInputs.jobs[name].wrapper !==
        proposalBase.jobInputs.jobs[name].wrapper
      )
        throw new OperationalFailure(
          'Managed proposal contains unrelated component Job changes',
        );
  }
  if (
    canonicalRecord(main.records?.[release.component] ?? null) !==
    canonicalRecord(expected.target)
  )
    throw new OperationalFailure(
      'Component target changed since original intent; dispatch a fresh run',
    );
  if (main.records?.[release.component]?.digest === release.digest)
    return { status: 'noop' };
  for (const previous of [
    main.records?.[release.component],
    proposal?.records?.[release.component],
  ]) {
    if (
      previous &&
      previous.sourceRevision !== release.sourceRevision &&
      (await gateway.isAncestor(
        release.sourceRevision,
        previous.sourceRevision,
      ))
    )
      throw new OperationalFailure(
        'Component candidate is obsolete on the same source lineage; dispatch a fresh run',
      );
  }
  const files = promotionFiles(release, main.kustomization, main.jobInputs);
  const current = await gateway.readState();
  if (
    current.base !== state.base ||
    current.head !== state.head ||
    (current.head && !current.managed)
  )
    throw new OperationalFailure(
      'Main or component proposal changed before mutation',
    );
  const commit = await gateway.commit(
    files,
    state.head ?? state.base,
    `${marker}\n\nComponent: ${release.component}\nSource: ${release.sourceRevision}\nBranch: ${release.sourceRef}`,
    { treeParent: state.base, mergeParent: state.head ? state.base : null },
  );
  const beforeRef = await gateway.readState();
  if (
    beforeRef.base !== state.base ||
    beforeRef.head !== state.head ||
    (beforeRef.head && !beforeRef.managed)
  )
    throw new OperationalFailure(
      'Main or component proposal changed before ref mutation; dispatch a fresh run',
    );
  await gateway.compareAndSwap(state.head, commit);
  return gateway.ensurePullRequest();
}

function canonicalRecord(record) {
  return canonicalRelease(record);
}

export function githubGateway({
  repository,
  component,
  token,
  request = globalThis.fetch,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token)
    throw new OperationalFailure('Repository and promotion token required');
  if (component !== undefined && !imageNames.includes(component))
    throw new OperationalFailure('Unknown promotion component');
  const branch = component
    ? `automation/local-image-promotion-${component}`
    : 'automation/local-image-promotion';
  const allowedPaths = component
    ? [
        `deploy/environments/local/releases/${component}.json`,
        overlayPath,
        ...jobNames
          .filter((name) => component === `${name}-bootstrap`)
          .map(wrapperPath),
      ]
    : [releasePath, overlayPath, ...jobNames.map(wrapperPath)];
  const root = `https://api.github.com/repos/${repository}`;
  const owner = repository.split('/')[0];
  async function api(path, method = 'GET', body, allowMissing = false) {
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
          signal: globalThis.AbortSignal.timeout(15000),
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
        comparison.ahead_by > 0 &&
        comparison.ahead_by <= 100 &&
        Array.isArray(comparison.commits) &&
        comparison.commits.length === comparison.ahead_by &&
        comparison.commits.at(-1)?.sha === ref.object.sha &&
        comparison.commits.every(
          (commit) =>
            commit.author?.login === 'github-actions[bot]' &&
            commit.commit.message.startsWith(`${marker}\n`),
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
      async function file(path, optional = false) {
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
        return text;
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
      validateCommittedState(snapshot);
      return snapshot;
    },
    async commit(
      files,
      parent,
      message,
      { treeParent = parent, mergeParent = null } = {},
    ) {
      if (
        Object.keys(files).length !== allowedPaths.length ||
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
      if (result.errors?.length || !result.data?.updateRefs)
        throw new OperationalFailure(
          'Promotion head changed or atomic update rejected; no PR was created',
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
        title: marker,
        head: branch,
        base: 'main',
        body: 'Updates only local application image digests and source provenance. Review immutable indexes and source revision before merging.',
      });
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv[2] === 'refresh') {
      refreshJobSuffixes(process.argv[3] ?? process.cwd());
      console.log(
        'Refreshed only local bootstrap Job suffixes; review the configuration diff.',
      );
    } else {
      const event = process.env.GITHUB_EVENT_NAME;
      const ref = process.env.GITHUB_REF;
      if (!(
        (event === 'push' && ref === 'refs/heads/main') ||
        (event === 'workflow_dispatch' &&
          /^refs\/heads\/[^\s]+$/.test(ref ?? ''))
      ))
        throw new OperationalFailure(
          'Promotion requires trusted repository branch invocation',
        );
      const resultFile = JSON.parse(
        canonicalRelease(readFileSync(process.argv[2], 'utf8')),
      );
      const release = validateComponentRelease(resultFile.record);
      const intent = validateRunIntent(
        JSON.parse(canonicalRelease(readFileSync(process.argv[3], 'utf8'))),
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
      });
      const result = await promote({
        release,
        intent,
        gateway,
      });
      console.log(
        result.status === 'noop'
          ? 'Component already deployed; no promotion needed.'
          : `Promotion PR: ${result.number}`,
      );
    }
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
