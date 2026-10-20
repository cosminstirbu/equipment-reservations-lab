import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import parsers from '@stoplight/spectral-parsers';
import {
  validateRelease,
  verifyReleaseIndexes,
  jobNames,
  wrapperPath,
  jobSuffix,
  validateWrapper,
  validateJobSuffixes,
  readJobInputs,
  readPublicFile,
  parseRelease,
  validateCommittedState,
} from './deployment-validation.mjs';

const branch = 'automation/local-image-promotion';
const releasePath = 'deploy/environments/local/release.json';
const overlayPath = 'deploy/environments/local/kustomization.yaml';
const allowedPaths = [releasePath, overlayPath, ...jobNames.map(wrapperPath)];
const marker = 'chore: promote local application images';

export function promotionFiles(release, kustomization, jobInputs) {
  validateRelease(release);
  const parsed = parsers.Yaml.parse(kustomization);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new Error('Invalid kustomization');
  const overlay = parsed.data;
  const replacements = Object.entries(release.images).map(([name, entry]) => ({
    name,
    newName: entry.image,
    digest: entry.digest,
  }));
  const images = [
    ...(overlay.images ?? []).filter((entry) => !release.images[entry.name]),
    ...replacements,
  ];
  const imagesNode = parsed.ast.mappings.find(
    (mapping) => mapping.key.value === 'images',
  );
  const replacement = `images: ${JSON.stringify(images, null, 2)}\n`;
  const updated = imagesNode
    ? `${kustomization.slice(0, imagesNode.key.startPosition)}${replacement}${kustomization.slice(imagesNode.value.endPosition)}`
    : `${kustomization.trimEnd()}\n${replacement}`;

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
    throw new Error('Unexpected Job input field');
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
    throw new Error('Unexpected Job input');
  validateJobSuffixes(release, proposal);
  return files;
}

export function refreshJobSuffixes(root) {
  const releaseText = readPublicFile(root, releasePath);
  const release = parseRelease(releaseText);
  const inputs = readJobInputs(root);
  const files = jobWrapperFiles(release, inputs);
  const temporary = [];
  try {
    for (const [path, content] of Object.entries(files)) {
      const temporaryPath = join(root, `${path}.${randomUUID()}.tmp`);
      writeFileSync(temporaryPath, content, { flag: 'wx' });
      temporary.push({ path, temporaryPath });
    }
    if (
      readPublicFile(root, releasePath) !== releaseText ||
      JSON.stringify(readJobInputs(root)) !== JSON.stringify(inputs)
    )
      throw new Error('Public release or Job input changed during refresh');
    for (const { path, temporaryPath } of temporary)
      renameSync(temporaryPath, join(root, path));
  } finally {
    for (const { temporaryPath } of temporary)
      rmSync(temporaryPath, { force: true });
  }
  return Object.keys(files);
}

function neutralField(text, key) {
  const parsed = parsers.Yaml.parse(text);
  if (parsed.diagnostics.some((item) => item.severity === 0))
    throw new Error('Invalid parent YAML');
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
    throw new Error(
      'Promotion parent has unrelated main or branch changes; review manually',
    );
  for (const name of jobNames) {
    if (
      parent.jobInputs.jobs[name].template !==
        main.jobInputs.jobs[name].template ||
      neutralField(parent.jobInputs.jobs[name].wrapper, 'nameSuffix') !==
        neutralField(main.jobInputs.jobs[name].wrapper, 'nameSuffix')
    )
      throw new Error(
        'Promotion parent public inputs or unrelated wrapper fields changed',
      );
  }
}

export async function promote({
  release,
  checkoutRevision,
  expectedHead,
  gateway,
}) {
  validateRelease(release);
  const state = await gateway.readState();
  if (
    state.base !== checkoutRevision ||
    release.sourceRevision !== checkoutRevision
  )
    throw new Error(
      'Remote main advanced beyond the verified checkout revision; rerun release from current main',
    );
  if (state.head !== expectedHead || (state.head && !state.managed))
    throw new Error(
      'Promotion head changed or is not managed; review existing branch manually',
    );
  const parentRevision = state.head ?? state.base;
  const parent = await gateway.readSnapshot(parentRevision);
  if (parent.revision !== parentRevision)
    throw new Error('Promotion parent revision mismatch');
  if (state.head) {
    const main = await gateway.readSnapshot(state.base);
    if (main.revision !== state.base)
      throw new Error('Main snapshot revision mismatch');
    assertCompatibleParent(parent, main);
  }
  const files = promotionFiles(release, parent.kustomization, parent.jobInputs);
  const current = await gateway.readState();
  if (
    current.base !== state.base ||
    current.head !== state.head ||
    (current.head && !current.managed)
  )
    throw new Error('Main or promotion parent changed before mutation');
  const commit = await gateway.commit(
    files,
    parentRevision,
    `${marker}\n\nSource: ${release.sourceRevision}`,
  );
  await gateway.compareAndSwap(state.head, commit);
  return gateway.ensurePullRequest();
}

export function githubGateway({
  repository,
  token,
  request = globalThis.fetch,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token)
    throw new Error('Repository and promotion token required');
  const root = `https://api.github.com/repos/${repository}`;
  const owner = repository.split('/')[0];
  async function api(path, method = 'GET', body, allowMissing = false) {
    const response = await request(
      path === 'graphql' ? 'https://api.github.com/graphql' : `${root}${path}`,
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
    if (allowMissing && response.status === 404) return null;
    if (!response.ok)
      throw new Error(`GitHub ${method} ${path} failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
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
        comparison.behind_by === 0 &&
        comparison.merge_base_commit?.sha === base &&
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
                    /^[+-]nameSuffix: -(?:[a-f0-9]{16}|unreleased)$/.test(line),
                  ))),
        );
      return { base, head: ref.object.sha, managed };
    },
    async readSnapshot(revision) {
      if (!/^[a-f0-9]{40}$/.test(revision))
        throw new Error('Exact parent commit revision required');
      const commit = await api(`/git/commits/${revision}`);
      if (
        commit.sha !== revision ||
        !/^[a-f0-9]{40}$/.test(commit.tree?.sha ?? '')
      )
        throw new Error('Parent commit identity mismatch');
      const tree = await api(`/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.sha !== commit.tree.sha)
        throw new Error('Parent tree identity mismatch');
      if (tree.truncated) throw new Error('Incomplete parent tree rejected');
      async function file(path, optional = false) {
        const matches = tree.tree.filter((item) => item.path === path);
        if (matches.length > 1) throw new Error('Ambiguous parent tree input');
        const entry = matches[0];
        if (!entry && optional) return null;
        if (!entry || entry.type !== 'blob' || entry.mode !== '100644')
          throw new Error('Missing or symlinked parent input rejected');
        const blob = await api(`/git/blobs/${entry.sha}`);
        if (blob.encoding !== 'base64')
          throw new Error('Unexpected parent blob encoding');
        const bytes = Buffer.from(blob.content, 'base64');
        const objectId = createHash('sha1')
          .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
          .digest('hex');
        if (blob.sha !== entry.sha || objectId !== entry.sha)
          throw new Error('Parent blob identity mismatch');
        const text = bytes.toString('utf8');
        if (!Buffer.from(text, 'utf8').equals(bytes))
          throw new Error('Invalid parent UTF-8 input');
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
      validateCommittedState(snapshot);
      return snapshot;
    },
    async commit(files, parent, message) {
      if (
        Object.keys(files).length !== allowedPaths.length ||
        Object.keys(files).some((path) => !allowedPaths.includes(path))
      )
        throw new Error('Unexpected promotion file');
      const parentCommit = await api(`/git/commits/${parent}`);
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
          parents: [parent],
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
        throw new Error(
          'Promotion head changed or atomic update rejected; no PR was created',
        );
    },
    async ensurePullRequest() {
      const prs = await api(
        `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=main`,
      );
      if (prs.length > 1)
        throw new Error('Multiple promotion PRs require manual review');
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
  if (process.argv[2] === 'refresh') {
    refreshJobSuffixes(process.argv[3] ?? process.cwd());
    console.log(
      'Refreshed only local bootstrap Job suffixes; review the configuration diff.',
    );
  } else {
    const release = parseRelease(readFileSync(process.argv[2], 'utf8'));
    verifyReleaseIndexes(release);
    const gateway = githubGateway({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GH_TOKEN,
    });
    const state = await gateway.readState();
    const result = await promote({
      release,
      checkoutRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 15000,
      }).trim(),
      expectedHead: state.head,
      gateway,
    });
    console.log(`Promotion PR: ${result.number}`);
  }
}
