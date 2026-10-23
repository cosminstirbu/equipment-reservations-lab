import { posix, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import xmlPlugin from '@prettier/plugin-xml';
import { executeProcess, OperationalFailure, safeFailure } from './process.mjs';
import {
  validateComponentRelease,
  verifyComponentIndex,
} from './deployment-validation.mjs';

export const componentNames = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];

const projects = {
  inventory: 'Inventory',
  reservations: 'Reservations',
  notifications: 'Notifications',
  'database-bootstrap': 'DatabaseBootstrap',
  'identity-bootstrap': 'IdentityBootstrap',
  'broker-bootstrap': 'BrokerBootstrap',
};
const sha = /^[a-f0-9]{40}$/;
const qualityScriptNames = new Set([
  'format',
  'format-check',
  'lint',
  'check',
  'check:openapi',
  'test:tooling',
  'test:deployment',
]);
const nonImageScripts = new Set([
  'scripts/argocd-installation.mjs',
  'scripts/component-pipelines.mjs',
  'scripts/local-kubernetes.mjs',
  'scripts/quality.mjs',
]);

export function createEvidenceGateway({
  repository,
  token,
  request = globalThis.fetch,
  budgetMs = 60000,
}) {
  if (
    !Number.isSafeInteger(repository?.id) ||
    repository.id <= 0 ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository.name ?? '') ||
    !token
  )
    throw new OperationalFailure(
      'GitHub evidence repository and token required',
    );
  const deadline = Date.now() + Math.min(60000, budgetMs);
  async function api(path, { binary = false, allowMissing = false } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new OperationalFailure('GitHub evidence lookup budget exhausted');
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
            signal: globalThis.AbortSignal.timeout(Math.min(15000, remaining)),
          },
        );
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(
                200 * 2 ** attempt + Math.random() * 100,
                Math.max(0, deadline - Date.now()),
              ),
            ),
          );
          continue;
        }
        throw new OperationalFailure(
          'GitHub evidence request failed: transport or timeout',
        );
      }
      if (allowMissing && response.status === 404) return null;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              200 * 2 ** attempt + Math.random() * 100,
              Math.max(0, deadline - Date.now()),
            ),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new OperationalFailure(
          `GitHub evidence request failed (HTTP ${Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : 'unavailable'})`,
        );
      try {
        const limit = binary ? 262144 : 2097152;
        const chunks = [];
        let length = 0;
        for await (const chunk of response.body) {
          length += chunk.length;
          if (length > limit || Date.now() > deadline) throw new Error();
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        return binary ? bytes : JSON.parse(bytes.toString('utf8'));
      } catch {
        throw new OperationalFailure(
          'GitHub evidence response invalid or exceeds bounded payload',
        );
      }
    }
    throw new OperationalFailure('GitHub evidence request failed');
  }
  return {
    readRef: async (ref) => {
      if (
        !/^heads\/(main|automation\/local-image-promotion-[a-z-]+)$/.test(ref)
      )
        throw new OperationalFailure('Invalid component snapshot ref');
      const result = await api(`/git/ref/${ref}`, { allowMissing: true });
      if (result === null) return null;
      if (!sha.test(result.object?.sha))
        throw new OperationalFailure('Invalid GitHub evidence ref');
      return result.object.sha;
    },
    readRecord: async (component, revision) => {
      if (!componentNames.includes(component) || !sha.test(revision))
        throw new OperationalFailure('Invalid component record snapshot');
      const value = await api(
        `/contents/deploy/environments/local/releases/${component}.json?ref=${revision}`,
        { allowMissing: true },
      );
      if (value === null) return null;
      try {
        if (
          value.type !== 'file' ||
          value.encoding !== 'base64' ||
          typeof value.content !== 'string' ||
          value.content.length > 90000
        )
          throw new Error();
        const record = validateComponentRelease(
          JSON.parse(Buffer.from(value.content, 'base64').toString('utf8')),
        );
        if (
          record.component !== component ||
          record.repository.id !== repository.id ||
          record.repository.name !== repository.name
        )
          throw new Error();
        return record;
      } catch {
        throw new OperationalFailure(
          'Invalid GitHub evidence component record',
        );
      }
    },
    listArtifacts: (page, runId) =>
      api(
        `${runId ? `/actions/runs/${runId}` : '/actions'}/artifacts?per_page=100&page=${page}`,
      ),
    readRun: (runId, attempt) =>
      api(`/actions/runs/${positiveId(runId)}/attempts/${positiveId(attempt)}`),
    listJobs: (runId, attempt) =>
      api(
        `/actions/runs/${positiveId(runId)}/attempts/${positiveId(attempt)}/jobs?per_page=100`,
      ),
    readResult: async (artifact) =>
      readArtifactJson(
        await api(`/actions/artifacts/${positiveId(artifact.id)}/zip`, {
          binary: true,
        }),
        'component-result.json',
        artifact.digest ?? undefined,
      ),
    readIntent: async (artifact) =>
      readArtifactJson(
        await api(`/actions/artifacts/${positiveId(artifact.id)}/zip`, {
          binary: true,
        }),
        'run-intent.json',
        artifact.digest ?? undefined,
      ),
    api,
  };
}

function positiveId(value) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new OperationalFailure('Invalid GitHub evidence identity');
  return value;
}

async function runArtifacts(gateway, runId) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const listing = await gateway.listArtifacts(page, runId);
    if (
      !Array.isArray(listing.artifacts) ||
      listing.artifacts.length > 100 ||
      !Number.isSafeInteger(listing.total_count) ||
      listing.total_count < 0
    )
      throw new OperationalFailure(
        'Incomplete original run evidence; dispatch a fresh run',
      );
    result.push(...listing.artifacts);
    if (result.length === listing.total_count) return result;
    if (listing.artifacts.length < 100 || result.length > listing.total_count)
      break;
  }
  throw new OperationalFailure(
    'Original run evidence lookup exhausted; dispatch a fresh run',
  );
}

function sameRun(run, context, attempt) {
  return (
    run?.id === context.runId &&
    run.run_attempt === attempt &&
    run.head_sha === context.sourceRevision &&
    run.head_branch === context.sourceRef.slice(11) &&
    run.event === context.event &&
    run.path === context.workflow &&
    run.repository?.id === context.repository.id &&
    run.repository?.full_name === context.repository.name &&
    run.head_repository?.id === context.repository.id
  );
}

function producerJobs(listing, runId, attempt, name) {
  if (
    !Array.isArray(listing?.jobs) ||
    listing.jobs.length !== listing.total_count ||
    listing.jobs.length > 100
  )
    throw new OperationalFailure(
      'Incomplete producer history; dispatch a fresh run',
    );
  return listing.jobs.filter(
    (job) =>
      job.run_id === runId &&
      job.run_attempt === attempt &&
      (job.name === name || job.name?.endsWith(` / ${name}`)),
  );
}

async function originalIntent(gateway, context) {
  try {
    const artifacts = (await runArtifacts(gateway, context.runId)).filter(
      (artifact) => artifact.name === `run-intent-${context.runId}`,
    );
    if (artifacts.length !== 1) throw new Error();
    const artifact = artifacts[0];
    const intent = validateRunIntent(await gateway.readIntent(artifact));
    const run = await gateway.readRun(context.runId, 1);
    const jobs = producerJobs(
      await gateway.listJobs(context.runId, 1),
      context.runId,
      1,
      'Select components',
    );
    const bound = artifact.workflow_run;
    if (
      intent.runAttempt !== 1 ||
      !sameRun(run, context, 1) ||
      intent.runId !== context.runId ||
      intent.sourceRevision !== context.sourceRevision ||
      intent.sourceRef !== context.sourceRef ||
      intent.event !== context.event ||
      intent.repository.id !== context.repository.id ||
      intent.repository.name !== context.repository.name ||
      artifact.expired !== false ||
      !Number.isSafeInteger(artifact.id) ||
      artifact.id <= 0 ||
      bound?.id !== context.runId ||
      bound.head_sha !== context.sourceRevision ||
      bound.head_branch !== context.sourceRef.slice(11) ||
      bound.repository_id !== context.repository.id ||
      bound.head_repository_id !== context.repository.id ||
      jobs.length !== 1 ||
      jobs[0].conclusion !== 'success'
    )
      throw new Error();
    return intent;
  } catch {
    throw new OperationalFailure(
      'Original run intent unavailable or invalid; dispatch a fresh run',
    );
  }
}

export function readArtifactJson(bytes, member, digest) {
  if (
    !['component-result.json', 'run-intent.json'].includes(member) ||
    !(bytes instanceof Uint8Array) ||
    bytes.length > 262144
  )
    throw new OperationalFailure('Invalid bounded artifact archive');
  if (
    digest !== undefined &&
    (!/^sha256:[a-f0-9]{64}$/.test(digest) ||
      digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
  )
    throw new OperationalFailure('Artifact digest mismatch');
  const python = `import sys,io,zipfile,json,base64,stat
d=json.load(sys.stdin)
b=base64.b64decode(d['archive'],validate=True)
assert len(b)<=262144
with zipfile.ZipFile(io.BytesIO(b)) as z:
    entries=z.infolist()
    assert len(entries)==1
    item=entries[0]
    mode=item.external_attr >> 16
    assert item.filename==d['member'] and not item.is_dir() and not item.flag_bits & 1
    assert item.file_size<=65536 and (stat.S_IFMT(mode) in (0,stat.S_IFREG))
    raw=z.read(item)
    assert len(raw)<=65536
    value=json.loads(raw.decode('utf-8'))
    print(json.dumps(value,separators=(',',':')))
`;
  try {
    const text = executeProcess(
      process.platform === 'win32' ? 'python' : 'python3',
      ['-c', python],
      {
        input: JSON.stringify({
          archive: Buffer.from(bytes).toString('base64'),
          member,
        }),
        operation: 'Bounded artifact JSON inspection',
        tool: 'python',
        output: 'private-capture',
        timeout: 15000,
        maxBuffer: 65536,
      },
    );
    return JSON.parse(text);
  } catch {
    throw new OperationalFailure(
      'Artifact archive validation failed; raw payload suppressed',
    );
  }
}

export function validatePublicationEvidence(evidence, expected = {}) {
  try {
    const { record, run, job, artifact, index } = evidence;
    validateComponentRelease(record);
    verifyComponentIndex(record, () => index);
    const repository = expected.repository ?? record.repository;
    if (
      record.repository.id !== repository.id ||
      record.repository.name !== repository.name ||
      (expected.component && record.component !== expected.component) ||
      (expected.sourceRef && record.sourceRef !== expected.sourceRef) ||
      (expected.sourceRevision &&
        record.sourceRevision !== expected.sourceRevision) ||
      (expected.runId && record.runId !== expected.runId) ||
      (expected.runAttempt && record.runAttempt !== expected.runAttempt)
    )
      throw new Error();
    if (
      run.id !== record.runId ||
      run.run_attempt !== record.runAttempt ||
      run.head_sha !== record.sourceRevision ||
      run.head_branch !== record.sourceRef.slice(11) ||
      run.path !== record.workflow ||
      run.repository?.id !== repository.id ||
      run.repository?.full_name !== repository.name ||
      run.head_repository?.id !== repository.id ||
      !['push', 'workflow_dispatch'].includes(run.event) ||
      (run.event === 'push' && record.sourceRef !== 'refs/heads/main')
    )
      throw new Error();
    if (
      job.run_id !== record.runId ||
      job.run_attempt !== record.runAttempt ||
      job.conclusion !== 'success' ||
      !(
        job.name === `Publish ${record.component}` ||
        job.name?.endsWith(` / Publish ${record.component}`)
      )
    )
      throw new Error();
    if (
      !Number.isSafeInteger(artifact.id) ||
      artifact.id <= 0 ||
      artifact.expired !== false ||
      artifact.name !==
        `component-${record.component}-${record.runId}-${record.runAttempt}` ||
      artifact.workflow_run?.id !== record.runId ||
      artifact.workflow_run.head_sha !== record.sourceRevision ||
      artifact.workflow_run.head_branch !== record.sourceRef.slice(11) ||
      artifact.workflow_run.repository_id !== repository.id ||
      artifact.workflow_run.head_repository_id !== repository.id
    )
      throw new Error();
    return record;
  } catch {
    throw new OperationalFailure('Invalid component publication evidence');
  }
}
export function validateRunIntent(intent) {
  try {
    const keys = [
      'schemaVersion',
      'repository',
      'sourceRevision',
      'sourceRef',
      'event',
      'runId',
      'runAttempt',
      'workflow',
      'selected',
      'components',
    ];
    if (
      !intent ||
      Object.keys(intent).length !== keys.length ||
      Object.keys(intent).some((key) => !keys.includes(key)) ||
      !['push', 'workflow_dispatch'].includes(intent.event) ||
      (intent.event === 'push' && intent.sourceRef !== 'refs/heads/main')
    )
      throw new Error();
    validateComponentRelease({
      ...Object.fromEntries(
        keys
          .filter((key) => !['event', 'components', 'selected'].includes(key))
          .map((key) => [key, intent[key]]),
      ),
      component: 'inventory',
      image: `ghcr.io/${intent.repository?.name.toLowerCase()}-inventory`,
      digest: `sha256:${'0'.repeat(64)}`,
    });
    if (
      !Array.isArray(intent.selected) ||
      JSON.stringify(intent.selected) !==
        JSON.stringify(
          componentNames.filter((name) => intent.selected.includes(name)),
        )
    )
      throw new Error();
    if (
      !intent.components ||
      Object.keys(intent.components).length !== componentNames.length ||
      Object.keys(intent.components).some(
        (name) => !componentNames.includes(name),
      )
    )
      throw new Error();
    for (const name of componentNames) {
      const entry = intent.components[name];
      if (
        !entry ||
        Object.keys(entry).length !== 2 ||
        !Object.hasOwn(entry, 'target') ||
        !Object.hasOwn(entry, 'proposal')
      )
        throw new Error();
      if (
        entry.proposal !== null &&
        (!entry.proposal ||
          Object.keys(entry.proposal).length !== 2 ||
          !sha.test(entry.proposal.head) ||
          !entry.proposal.record)
      )
        throw new Error();
      for (const record of [entry.target, entry.proposal?.record]) {
        if (record === null || record === undefined) continue;
        validateComponentRelease(record);
        if (
          record.component !== name ||
          record.repository.id !== intent.repository.id ||
          record.repository.name !== intent.repository.name
        )
          throw new Error();
      }
      if (entry.target === undefined) throw new Error();
    }
    return intent;
  } catch {
    throw new OperationalFailure('Invalid original run intent');
  }
}
export async function discoverBaselines({
  repository,
  sourceRef,
  sourceRevision,
  gateway,
  root,
}) {
  if (sourceRef !== 'refs/heads/main') return {};
  const baselines = {};
  const deadline = Date.now() + 60000;
  try {
    for (let page = 1; page <= 10 && Date.now() < deadline; page++) {
      const listing = await gateway.listArtifacts(page);
      if (!Array.isArray(listing.artifacts) || listing.artifacts.length > 100)
        return {};
      for (const artifact of listing.artifacts) {
        if (Date.now() >= deadline) return {};
        const match = /^component-([a-z-]+)-(\d+)-(\d+)$/.exec(
          artifact.name ?? '',
        );
        if (
          !match ||
          !componentNames.includes(match[1]) ||
          baselines[match[1]] ||
          artifact.expired
        )
          continue;
        try {
          const result = await gateway.readResult(artifact);
          const run = await gateway.readRun(Number(match[2]), Number(match[3]));
          const listing = await gateway.listJobs(
            Number(match[2]),
            Number(match[3]),
          );
          if (
            !Array.isArray(listing.jobs) ||
            listing.jobs.length !== listing.total_count ||
            listing.jobs.length > 100
          )
            continue;
          const jobs = listing.jobs.filter(
            (job) =>
              job.name === `Publish ${match[1]}` ||
              job.name?.endsWith(` / Publish ${match[1]}`),
          );
          if (jobs.length !== 1) continue;
          const record = validatePublicationEvidence(
            { ...result, run, job: jobs[0], artifact },
            { repository, component: match[1], sourceRef },
          );
          git(root, [
            'merge-base',
            '--is-ancestor',
            record.sourceRevision,
            sourceRevision,
          ]);
          baselines[record.component] = record.sourceRevision;
        } catch {
          /* Invalid or unavailable evidence must rebuild, never skip. */
        }
      }
      if (listing.artifacts.length < 100 || page * 100 >= listing.total_count)
        return baselines;
    }
  } catch {
    return {};
  }
  return {};
}

function git(root, args) {
  return executeProcess('git', args, {
    cwd: root,
    operation: 'Component Git inspection',
    tool: 'git',
    output: 'private-capture',
    timeout: 15000,
  });
}

function projectInputs(root, revision, component) {
  if (component === 'web') return ['src/Web/'];
  const pending = [`src/${projects[component]}/${projects[component]}.csproj`];
  const visited = new Set();
  while (pending.length) {
    const project = pending.pop();
    if (visited.has(project)) continue;
    visited.add(project);
    const xml = git(root, ['show', `${revision}:${project}`]);
    const document = xmlPlugin.parsers.xml.parse(xml);
    const inspect = [document.element];
    while (inspect.length) {
      const element = inspect.pop();
      if (
        !element ||
        (element.END_NAME && element.END_NAME !== element.Name) ||
        element.Name.includes(':')
      )
        throw new OperationalFailure('Invalid project XML');
      if (['Compile', 'EmbeddedResource'].includes(element.Name)) {
        for (const attribute of element.attribute.filter((attribute) =>
          ['Include', 'Update', 'Remove'].includes(attribute.Name),
        )) {
          const value = attribute.STRING.slice(1, -1).replaceAll('\\', '/');
          if (
            value.startsWith('/') ||
            /^[A-Za-z]:/.test(value) ||
            /\$\(|[&;]/.test(value) ||
            value.split('/').includes('..')
          )
            throw new OperationalFailure('Uncertain linked project input');
        }
      }
      inspect.push(...(element.content?.element ?? []));
    }
    if (
      document.element.Name !== 'Project' ||
      /<(Import|Choose)\b|<!DOCTYPE|<!ENTITY/.test(xml)
    )
      throw new OperationalFailure('Uncertain project graph');
    const references = [
      ...xml.matchAll(/<ProjectReference\b([^>]*?)(?:\/>|>)/g),
    ];
    for (const reference of references) {
      const include = /\bInclude\s*=\s*["']([^"']+)["']/.exec(reference[1]);
      if (
        !include ||
        /\b(?:Condition|Update|Remove)\s*=/.test(reference[1]) ||
        /\$\(|[?*&;]/.test(include[1])
      )
        throw new OperationalFailure('Uncertain project reference');
      const path = posix.normalize(
        posix.join(posix.dirname(project), include[1].replaceAll('\\', '/')),
      );
      if (!path.startsWith('src/') || !path.endsWith('.csproj'))
        throw new OperationalFailure('Uncertain project reference path');
      pending.push(path);
    }
  }
  return [...visited].map((project) => `${posix.dirname(project)}/`);
}

function qualityScriptsOnly(root, base, revision) {
  const metadata = (ref) => {
    const value = JSON.parse(git(root, ['show', `${ref}:package.json`]));
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !value.scripts ||
      typeof value.scripts !== 'object' ||
      Array.isArray(value.scripts)
    )
      throw new OperationalFailure('Uncertain root package metadata');

    const scripts = { ...value.scripts };
    for (const name of qualityScriptNames) {
      if (Object.hasOwn(scripts, name) && typeof scripts[name] !== 'string')
        throw new OperationalFailure('Uncertain quality script metadata');
      delete scripts[name];
    }

    return { ...value, scripts };
  };

  try {
    return isDeepStrictEqual(metadata(base), metadata(revision));
  } catch {
    return false;
  }
}

function affects(path, component, inputs, knownInputs) {
  if (inputs.some((input) => path.startsWith(input))) return true;
  if (nonImageScripts.has(path) || /^scripts\/[^/]+\.test\.mjs$/.test(path))
    return false;
  if (
    /^(docs\/|specs\/|\.specify\/|\.agents\/|\.codex\/)|(^|\/)(README|CHANGELOG|LICENSE)(\.[^/]*)?$/i.test(
      path,
    )
  )
    return false;
  if (path.startsWith('deploy/') && !path.startsWith('deploy/images/'))
    return false;
  if (path.startsWith('deploy/images/')) {
    if (/\/web\.Dockerfile(?:\.dockerignore)?$|\/nginx\.conf$/.test(path))
      return component === 'web';
    if (/\/api\.Dockerfile(?:\.dockerignore)?$/.test(path))
      return ['inventory', 'reservations', 'notifications'].includes(component);
    if (/\/bootstrap\.Dockerfile(?:\.dockerignore)?$/.test(path))
      return component.endsWith('-bootstrap');
    return true;
  }
  if (path.startsWith('src/'))
    return (
      !knownInputs.some((input) => path.startsWith(input)) ||
      !/^src\/[^/]+\//.test(path) ||
      /(^|\/)Directory\.[^/]+\.(props|targets)$|(^|\/)NuGet\.Config$/i.test(
        path,
      )
    );
  if (path.startsWith('tests/')) return false;
  return true;
}

export function selectComponents({
  root,
  event,
  sourceRef,
  sourceRevision,
  baseRevision,
  baselines = {},
}) {
  if (!sha.test(sourceRevision) || !/^refs\/heads\/.+/.test(sourceRef ?? ''))
    throw new OperationalFailure('Invalid component source identity');
  if (event === 'workflow_dispatch')
    return {
      selected: [...componentNames],
      reasons: Object.fromEntries(
        componentNames.map((name) => [name, 'manual']),
      ),
    };
  if (
    !['push', 'pull_request'].includes(event) ||
    (event === 'push' && sourceRef !== 'refs/heads/main')
  )
    throw new OperationalFailure('Unsupported component event');
  let prBase;
  if (event === 'pull_request') {
    try {
      prBase = git(root, ['merge-base', sourceRevision, baseRevision]).trim();
    } catch {
      /* Missing history conservatively selects components. */
    }
  }
  const selected = [];
  const reasons = {};
  const candidateInputs = {};
  const nonImagePackages = new Map();
  const all = (reason) => ({
    selected: [...componentNames],
    reasons: Object.fromEntries(componentNames.map((name) => [name, reason])),
  });
  try {
    for (const name of componentNames)
      candidateInputs[name] = projectInputs(root, sourceRevision, name);
  } catch {
    return all('uncertain-graph');
  }
  const knownInputs = Object.values(candidateInputs).flat();
  for (const name of componentNames) {
    const base = event === 'pull_request' ? prBase : baselines[name];
    if (!sha.test(base ?? '')) {
      selected.push(name);
      reasons[name] = 'missing-baseline';
      continue;
    }
    try {
      git(root, ['merge-base', '--is-ancestor', base, sourceRevision]);
      const paths = git(root, [
        'diff',
        '--no-renames',
        '--name-only',
        '-z',
        base,
        sourceRevision,
      ])
        .split('\0')
        .filter(Boolean);
      let baselineInputs;
      try {
        baselineInputs = projectInputs(root, base, name);
      } catch {
        return all('uncertain-graph');
      }
      const inputs = [...baselineInputs, ...candidateInputs[name]];
      if (
        paths.some((path) => {
          if (path === 'package.json') {
            if (!nonImagePackages.has(base))
              nonImagePackages.set(
                base,
                qualityScriptsOnly(root, base, sourceRevision),
              );
            if (nonImagePackages.get(base)) return false;
          }
          return affects(path, name, inputs, [
            ...knownInputs,
            ...baselineInputs,
          ]);
        })
      ) {
        selected.push(name);
        reasons[name] = 'source';
      }
    } catch {
      selected.push(name);
      reasons[name] = 'uncertain-history';
    }
  }
  return { selected, reasons };
}

function outputValue(env, key, value) {
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}\n`,
    );
}

export async function runPipelineCommand({
  command,
  args = [],
  env = process.env,
  root = process.cwd(),
  gateway,
}) {
  if (command === 'load-result') {
    const component = argument(args, '--component');
    if (!componentNames.includes(component))
      throw new OperationalFailure('Unknown component result');
    const runId = positiveId(Number(env.GITHUB_RUN_ID));
    const attempt = positiveId(Number(env.GITHUB_RUN_ATTEMPT));
    const context = {
      runId,
      runAttempt: attempt,
      repository: {
        id: Number(env.GITHUB_REPOSITORY_ID),
        name: env.GITHUB_REPOSITORY,
      },
      sourceRevision: env.GITHUB_SHA,
      sourceRef: env.GITHUB_REF,
      event: env.GITHUB_EVENT_NAME,
      workflow: '.github/workflows/validate.yaml',
    };
    validateRunIntent({
      schemaVersion: 1,
      ...context,
      selected: [],
      components: Object.fromEntries(
        componentNames.map((name) => [name, { target: null, proposal: null }]),
      ),
    });
    gateway ??= createEvidenceGateway({
      repository: {
        id: Number(env.GITHUB_REPOSITORY_ID),
        name: env.GITHUB_REPOSITORY,
      },
      token: env.GH_TOKEN,
    });
    const retainedIntent =
      attempt > 1 ? await originalIntent(gateway, context) : null;
    if (retainedIntent && !retainedIntent.selected.includes(component))
      throw new OperationalFailure(
        'Component was not selected originally; dispatch a fresh run',
      );
    const artifacts = (await runArtifacts(gateway, runId)).filter((artifact) =>
      artifact.name?.startsWith(`component-${component}-${runId}-`),
    );
    if (attempt === 1 && artifacts.length === 0) {
      outputValue(env, 'available', 'false');
      return { available: false };
    }
    if (artifacts.length === 0 && attempt > 1 && attempt <= 11) {
      for (let previous = 1; previous < attempt; previous++) {
        const run = await gateway.readRun(runId, previous);
        const jobs = producerJobs(
          await gateway.listJobs(runId, previous),
          runId,
          previous,
          `Publish ${component}`,
        );
        if (
          jobs.length === 0 &&
          sameRun(run, context, previous) &&
          run.status === 'completed' &&
          ['failure', 'cancelled'].includes(run.conclusion)
        ) {
          if (!retainedIntent.selected.includes(component))
            throw new OperationalFailure(
              'Component was not selected originally; dispatch a fresh run',
            );
          continue;
        }
        if (
          !sameRun(run, context, previous) ||
          jobs.length !== 1 ||
          !['failure', 'cancelled', 'timed_out'].includes(jobs[0].conclusion)
        )
          throw new OperationalFailure(
            'Prior producer result required or unverifiable; dispatch a fresh run',
          );
      }
      outputValue(env, 'available', 'false');
      return { available: false };
    }
    if (artifacts.length === 1) {
      try {
        const artifact = artifacts[0];
        const result = await gateway.readResult(artifact);
        const produced = result.record?.runAttempt;
        if (!Number.isSafeInteger(produced) || produced > attempt)
          throw new Error();
        const run = await gateway.readRun(runId, produced);
        const jobs = producerJobs(
          await gateway.listJobs(runId, produced),
          runId,
          produced,
          `Publish ${component}`,
        );
        if (jobs.length !== 1 || !sameRun(run, context, produced))
          throw new Error();
        validatePublicationEvidence(
          { ...result, run, job: jobs[0], artifact },
          {
            repository: context.repository,
            component,
            sourceRef: context.sourceRef,
            sourceRevision: context.sourceRevision,
            runId,
          },
        );
        writeArtifact(argument(args, '--output'), {
          record: result.record,
          index: result.index,
        });
        outputValue(env, 'available', 'true');
        return { available: true };
      } catch {
        throw new OperationalFailure(
          'Required component result invalid; dispatch a fresh run',
        );
      }
    }
    throw new OperationalFailure(
      'Required component result unavailable; dispatch a fresh run',
    );
  }
  if (command === 'intent' || command === 'load-intent') {
    const intent = {
      schemaVersion: 1,
      repository: {
        id: Number(env.GITHUB_REPOSITORY_ID),
        name: env.GITHUB_REPOSITORY,
      },
      sourceRevision: env.GITHUB_SHA,
      sourceRef: env.GITHUB_REF,
      event: env.GITHUB_EVENT_NAME,
      runId: Number(env.GITHUB_RUN_ID),
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
      workflow: '.github/workflows/validate.yaml',
      selected: [],
      components: Object.fromEntries(
        componentNames.map((name) => [name, { target: null, proposal: null }]),
      ),
    };
    validateRunIntent(intent);
    gateway ??= createEvidenceGateway({
      repository: intent.repository,
      token: env.GH_TOKEN,
    });
    if (command === 'load-intent' || intent.runAttempt !== 1) {
      const original = await originalIntent(gateway, intent);
      writeArtifact(argument(args, '--output'), original);
      outputValue(env, 'created', 'false');
      return { created: false };
    }
    try {
      intent.selected = JSON.parse(
        readFileSync(argument(args, '--selection'), 'utf8'),
      ).selected;
      validateRunIntent(intent);
    } catch {
      throw new OperationalFailure(
        'Valid original component selection file required',
      );
    }
    const main = await gateway.readRef('heads/main');
    if (!sha.test(main))
      throw new OperationalFailure('Invalid target main snapshot');
    for (const component of componentNames) {
      const target = await gateway.readRecord(component, main);
      intent.components[component] = { target, proposal: null };
    }
    validateRunIntent(intent);
    const output = argument(args, '--output');
    writeArtifact(output, intent);
    outputValue(env, 'created', 'true');
    return { created: true };
  }
  if (command !== 'select')
    throw new OperationalFailure('Unsupported component pipeline command');
  const sourceRef =
    env.GITHUB_EVENT_NAME === 'pull_request'
      ? `refs/heads/${env.GITHUB_HEAD_REF}`
      : env.GITHUB_REF;
  if (
    env.GITHUB_EVENT_NAME !== 'pull_request' &&
    Number(env.GITHUB_RUN_ATTEMPT) > 1
  ) {
    const context = {
      schemaVersion: 1,
      repository: {
        id: Number(env.GITHUB_REPOSITORY_ID),
        name: env.GITHUB_REPOSITORY,
      },
      sourceRevision: env.GITHUB_SHA,
      sourceRef,
      event: env.GITHUB_EVENT_NAME,
      runId: Number(env.GITHUB_RUN_ID),
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
      workflow: '.github/workflows/validate.yaml',
      selected: [],
      components: Object.fromEntries(
        componentNames.map((name) => [name, { target: null, proposal: null }]),
      ),
    };
    validateRunIntent(context);
    gateway ??= createEvidenceGateway({
      repository: context.repository,
      token: env.GH_TOKEN,
    });
    const intent = await originalIntent(gateway, context);
    const result = {
      selected: intent.selected,
      reasons: Object.fromEntries(
        intent.selected.map((name) => [name, 'original-run']),
      ),
    };
    for (const component of componentNames)
      outputValue(
        env,
        component.replaceAll('-', '_'),
        String(result.selected.includes(component)),
      );
    outputValue(env, 'selected', result.selected);
    if (args.includes('--output'))
      writeFileSync(argument(args, '--output'), `${JSON.stringify(result)}\n`);
    return result;
  }
  let baselines = {};
  if (env.GITHUB_EVENT_NAME === 'push' && env.GH_TOKEN) {
    const repository = {
      id: Number(env.GITHUB_REPOSITORY_ID),
      name: env.GITHUB_REPOSITORY,
    };
    gateway ??= createEvidenceGateway({ repository, token: env.GH_TOKEN });
    baselines = await discoverBaselines({
      repository,
      sourceRef,
      sourceRevision: env.GITHUB_SHA,
      gateway,
      root,
    });
  }
  const result = selectComponents({
    root,
    event: env.GITHUB_EVENT_NAME,
    sourceRef,
    sourceRevision: env.GITHUB_SHA,
    baseRevision: env.BASE_REVISION,
    baselines,
  });
  for (const component of componentNames)
    outputValue(
      env,
      component.replaceAll('-', '_'),
      String(result.selected.includes(component)),
    );
  outputValue(env, 'selected', result.selected);
  if (args.includes('--output'))
    writeFileSync(argument(args, '--output'), `${JSON.stringify(result)}\n`);
  return result;
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new OperationalFailure('Component command argument required');
  return args[index + 1];
}

function writeArtifact(path, value) {
  const text = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(text) > 65536)
    throw new OperationalFailure(
      'Component artifact exceeds bounded 64KiB metadata',
    );
  writeFileSync(path, text);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await runPipelineCommand({
      command: process.argv[2],
      args: process.argv.slice(3),
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      safeFailure(
        error,
        'Component pipeline operation failed; private details suppressed',
      ),
    );
    process.exitCode = 1;
  }
}
