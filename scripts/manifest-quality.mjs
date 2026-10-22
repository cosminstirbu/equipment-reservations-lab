import { executeProcess, OperationalFailure, safeFailure } from './process.mjs';
import {
  appendFileSync,
  writeFileSync,
  readFileSync,
  lstatSync,
} from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';

const componentNames = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];
const allowedPaths = new Set([
  'deploy/environments/local/kustomization.yaml',
  'deploy/environments/local/jobs/database/kustomization.yaml',
  'deploy/environments/local/jobs/identity/kustomization.yaml',
  ...componentNames.flatMap((name) => [
    `deploy/environments/local/releases/${name}.json`,
    `deploy/environments/local/images/${name}.yaml`,
  ]),
]);
const sha = /^[a-f0-9]{40}$/;
const full = (reason) => ({ mode: 'full', paths: [], reason });
const git = (root, args) =>
  executeProcess('git', args, {
    cwd: root,
    operation: 'Manifest quality Git inspection',
    tool: 'git',
    output: 'private-capture',
    timeout: 15000,
    maxBuffer: 16 * 1024 * 1024,
  });

export function selectQuality({
  root,
  event,
  sourceRef,
  sourceRevision,
  baseRevision,
  fullQualityBaseline,
}) {
  if (
    !sha.test(sourceRevision ?? '') ||
    !['push', 'pull_request'].includes(event) ||
    (event === 'push' &&
      (sourceRef !== 'refs/heads/main' ||
        !sha.test(fullQualityBaseline?.sourceRevision ?? ''))) ||
    (event === 'pull_request' && !sha.test(baseRevision ?? ''))
  )
    return full('unproven-comparison');
  try {
    let base;
    if (event === 'push') {
      base = fullQualityBaseline.sourceRevision;
      git(root, ['merge-base', '--is-ancestor', base, sourceRevision]);
    } else
      base = git(root, ['merge-base', baseRevision, sourceRevision]).trim();
    const parts = git(root, [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--find-copies',
      base,
      sourceRevision,
    ]).split('\0');
    if (parts.pop() !== '') return full('unproven-comparison');
    const paths = [];
    for (let index = 0; index < parts.length;) {
      const status = parts[index++];
      let count;
      if (/^[AMD]$/.test(status)) count = 1;
      else if (/^[RC](?:100|[0-9]{1,2})$/.test(status)) count = 2;
      else return full('unsupported-change');
      for (let endpoint = 0; endpoint < count; endpoint++) {
        const path = parts[index++];
        if (!allowedPaths.has(path)) return full('outside-allowlist');
        paths.push(path);
      }
    }
    if (!paths.length) return full('empty-comparison');
    return {
      mode: 'manifest',
      paths: [...new Set(paths)].sort(),
      reason: 'allowlisted-changes',
    };
  } catch {
    return full('unproven-comparison');
  }
}

export async function discoverFullQualityBaseline({
  root,
  repository,
  sourceRevision,
  gateway,
}) {
  if (
    !sha.test(sourceRevision ?? '') ||
    !Number.isSafeInteger(repository?.id) ||
    repository.id <= 0 ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository.name ?? '')
  )
    return null;
  const deadline = Date.now() + 60000;
  try {
    for (let page = 1; page <= 10 && Date.now() < deadline; page++) {
      const listing = await gateway.api(
        `/actions/workflows/validate.yaml/runs?branch=main&event=push&per_page=100&page=${page}`,
      );
      if (
        !Array.isArray(listing.workflow_runs) ||
        listing.workflow_runs.length > 100 ||
        !Number.isSafeInteger(listing.total_count) ||
        listing.total_count < 0
      )
        return null;
      for (const run of listing.workflow_runs) {
        if (Date.now() >= deadline) return null;
        if (
          !Number.isSafeInteger(run.id) ||
          run.id <= 0 ||
          !Number.isSafeInteger(run.run_attempt) ||
          run.run_attempt <= 0 ||
          run.path !== '.github/workflows/validate.yaml' ||
          run.event !== 'push' ||
          run.head_branch !== 'main' ||
          !sha.test(run.head_sha ?? '') ||
          run.repository?.id !== repository.id ||
          run.repository?.full_name !== repository.name ||
          run.head_repository?.id !== repository.id ||
          run.head_repository?.full_name !== repository.name
        )
          continue;
        const jobs = await gateway.api(
          `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        );
        if (
          !Array.isArray(jobs.jobs) ||
          jobs.jobs.length !== jobs.total_count ||
          jobs.jobs.length > 100
        )
          continue;
        const quality = jobs.jobs.filter((job) => job.name === 'quality');
        if (quality.length !== 1) continue;
        const job = quality[0];
        const markers = job.steps?.filter(
          (step) => step.name === 'Full application quality completed',
        );
        if (
          job.run_id !== run.id ||
          job.run_attempt !== run.run_attempt ||
          job.status !== 'completed' ||
          job.conclusion !== 'success' ||
          markers?.length !== 1 ||
          markers[0].status !== 'completed' ||
          markers[0].conclusion !== 'success'
        )
          continue;
        try {
          git(root, [
            'merge-base',
            '--is-ancestor',
            run.head_sha,
            sourceRevision,
          ]);
        } catch {
          continue;
        }
        return {
          sourceRevision: run.head_sha,
          runId: run.id,
          runAttempt: run.run_attempt,
        };
      }
      if (
        listing.workflow_runs.length < 100 ||
        page * 100 >= listing.total_count
      )
        return null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function validateStaticDeployment({ root, kubectl }) {
  if (!isAbsolute(kubectl ?? ''))
    throw new OperationalFailure('Explicit pinned kubectl path required');
  const { readComponentState, validateStaticManifests } =
    await import('./deployment-validation.mjs');
  const state = readComponentState(root, { requireComplete: false });
  const rendered = executeProcess(
    kubectl,
    ['kustomize', 'deploy/environments/local'],
    {
      cwd: root,
      operation: 'Manifest quality rendering',
      tool: 'kubectl',
      output: 'public-capture',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const resources = validateStaticManifests(rendered, state);
  return { status: state.status, resources: resources.length };
}

export async function runManifestQuality({
  command,
  args = [],
  env = process.env,
  root = process.cwd(),
  request = globalThis.fetch,
}) {
  if (command === 'validate') {
    let selection;
    try {
      const path = argument(args, '--selection');
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
        throw new Error();
      selection = JSON.parse(readFileSync(path, 'utf8'));
      if (
        selection?.mode !== 'manifest' ||
        selection.reason !== 'allowlisted-changes' ||
        !Array.isArray(selection.paths) ||
        !selection.paths.length ||
        selection.paths.some((path) => !allowedPaths.has(path)) ||
        new Set(selection.paths).size !== selection.paths.length ||
        Object.keys(selection).some(
          (key) => !['mode', 'paths', 'reason'].includes(key),
        )
      )
        throw new Error();
    } catch {
      throw new OperationalFailure('Invalid manifest quality selection scope');
    }
    const { readPublicFile } = await import('./deployment-validation.mjs');
    const existing = [];
    for (const path of selection.paths) {
      try {
        readPublicFile(root, path);
        existing.push(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (existing.length)
      executeProcess(
        process.execPath,
        [resolve(root, 'scripts/quality.mjs'), 'format-check', ...existing],
        {
          cwd: root,
          operation: 'Manifest quality scoped formatting',
          tool: 'node',
          output: 'public-capture',
          timeout: 60000,
        },
      );
    return {
      mode: 'manifest',
      ...(await validateStaticDeployment({
        root,
        kubectl: argument(args, '--kubectl'),
      })),
    };
  }
  if (command !== 'select')
    throw new OperationalFailure('Unknown manifest quality command');
  const refValid =
    env.GITHUB_EVENT_NAME === 'pull_request'
      ? /^refs\/pull\/[1-9][0-9]*\/(merge|head)$/.test(env.GITHUB_REF ?? '')
      : env.GITHUB_REF === 'refs/heads/main';
  let fullQualityBaseline = null;
  if (refValid && env.GITHUB_EVENT_NAME === 'push' && env.GH_TOKEN) {
    const repository = {
      id: Number(env.GITHUB_REPOSITORY_ID),
      name: env.GITHUB_REPOSITORY,
    };
    fullQualityBaseline = await discoverFullQualityBaseline({
      root,
      repository,
      sourceRevision: env.GITHUB_SHA,
      gateway: qualityGateway(repository, env.GH_TOKEN, request),
    });
  }
  const selection = refValid
    ? selectQuality({
        root,
        event: env.GITHUB_EVENT_NAME,
        sourceRef: env.GITHUB_REF,
        sourceRevision: env.GITHUB_SHA,
        baseRevision: env.BASE_REVISION,
        fullQualityBaseline,
      })
    : full('unproven-comparison');
  const index = args.indexOf('--output');
  if (index < 0 || !args[index + 1])
    throw new OperationalFailure('Manifest quality output file required');
  writeFileSync(args[index + 1], `${JSON.stringify(selection)}\n`);
  if (env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(selection))
      appendFileSync(
        env.GITHUB_OUTPUT,
        `${key}=${Array.isArray(value) ? JSON.stringify(value) : value}\n`,
      );
  return selection;
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new OperationalFailure('Manifest quality command argument required');
  return args[index + 1];
}

function qualityGateway(repository, token, request) {
  const deadline = Date.now() + 60000;
  return {
    api: async (path) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
          throw new OperationalFailure('Full quality lookup budget exhausted');
        let response;
        try {
          response = await request(
            `https://api.github.com/repos/${repository.name}${path}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              signal: globalThis.AbortSignal.timeout(
                Math.min(15000, remaining),
              ),
            },
          );
        } catch {
          if (attempt === 2)
            throw new OperationalFailure(
              'Full quality lookup transport failed',
            );
        }
        if (!response || response.status === 429 || response.status >= 500) {
          await response?.body?.cancel();
          if (attempt < 2) {
            await delay(
              Math.min(
                200 * 2 ** attempt + Math.random() * 100,
                Math.max(0, deadline - Date.now()),
              ),
            );
            continue;
          }
        }
        if (!response?.ok)
          throw new OperationalFailure('Full quality lookup HTTP failure');
        try {
          const chunks = [];
          let length = 0;
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > 2097152 || Date.now() > deadline) throw new Error();
            chunks.push(chunk);
          }
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new OperationalFailure(
            'Full quality lookup invalid bounded response',
          );
        }
      }
      throw new OperationalFailure('Full quality lookup failed');
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(
        await runManifestQuality({
          command: process.argv[2],
          args: process.argv.slice(3),
        }),
      ),
    );
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'Manifest quality operation failed; private details suppressed',
      ),
    );
    process.exitCode = 1;
  }
}
