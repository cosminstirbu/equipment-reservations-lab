import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  assertPrivatePath,
  createPrivateDirectory,
} from './local-platform.mjs';
import {
  cleanupAll,
  OperationalFailure,
  ProcessFailure,
  processFailure,
} from './process.mjs';
import { validateAzurePublication } from './deployment-validation.mjs';
import { verifyAzurePublication } from './promote-images.mjs';
import {
  createEvidenceGateway,
  validatePublicationRunEvidence,
} from './component-pipelines.mjs';
import {
  releaseComponents,
  releaseRepository,
} from './azure-qualification-data.mjs';

const fail = () => {
  throw new OperationalFailure(
    'Actual release verification failed; private details suppressed.',
  );
};

function releaseFailure(error, phase, httpFailures) {
  if (error instanceof ProcessFailure) {
    // Reconstruct only validated metadata, never public-capture tails or causes.
    const { operation, tool, status, signal, durationMs, category } =
      error.details;
    const projection = processFailure(
      {
        status,
        signal,
        code: {
          timeout: 'ETIMEDOUT',
          'output-limit': 'ENOBUFS',
          spawn: 'ENOENT',
        }[category],
      },
      { operation, tool, durationMs, output: 'private-capture' },
    );
    const failure = new ProcessFailure({ ...projection.details, phase });
    failure.message = `Release verification phase=${phase}: ${failure.message}`;
    return failure;
  }
  const http = [...httpFailures.values()].at(-1);
  const details = http ?? {
    phase,
    operation: 'Release verification',
    tool: 'node',
    category: 'validation',
    status: undefined,
    signal: undefined,
    durationMs: 0,
  };
  const failure = new OperationalFailure(
    http
      ? `Release verification phase=${http.phase}: ${http.operation} (${http.tool}) failed: ${http.category}; status=${http.status ?? 'unavailable'}; signal=unavailable; duration=${http.durationMs}ms; private details suppressed.`
      : `Release verification phase=${phase} failed; private details suppressed.`,
  );
  failure.details = Object.freeze(details);
  return failure;
}

// The launcher classifies all 28 static release files before loading private inputs.
// This boundary revalidates all seven wrappers before any authenticated operation.
// It owns only the temporary credential copy, never the caller's original directory.
export async function verifyQualificationPublications({
  publications,
  outputs,
  config,
  sourceRevision,
  signal,
  env = process.env,
  request = globalThis.fetch,
}) {
  let directory;
  let primary;
  let phase = 'validation';
  const httpFailures = new Map();
  try {
    if (
      !Array.isArray(publications) ||
      publications.length !== releaseComponents.length ||
      !/^[a-f0-9]{40}$/.test(sourceRevision ?? '')
    )
      fail();
    const ordered = [...publications].sort((a, b) =>
      String(a?.source?.component).localeCompare(String(b?.source?.component)),
    );
    if (
      !isDeepStrictEqual(
        ordered.map((p) => p?.source?.component),
        [...releaseComponents].sort(),
      )
    )
      fail();
    for (const publication of ordered) {
      validateAzurePublication(publication, {
        repository: releaseRepository,
        acrLoginServer: outputs?.acr_login_server,
      });
      if (publication.source.sourceRef !== 'refs/heads/main') fail();
    }
    if (
      config?.githubRepository !== releaseRepository.name ||
      !/^[a-z0-9]{5,50}\.azurecr\.io$/.test(outputs?.acr_login_server ?? '') ||
      typeof env.GITHUB_TOKEN !== 'string' ||
      !env.GITHUB_TOKEN ||
      /^(ghp_|github_pat_)/.test(env.GITHUB_TOKEN) ||
      !env.DOCKER_CONFIG
    )
      fail();

    phase = 'credentials';
    const credentialSource = resolve(env.DOCKER_CONFIG);
    assertPrivatePath(credentialSource, 0o700);
    assertPrivatePath(join(credentialSource, 'config.json'), 0o600);
    const credentials = readFileSync(join(credentialSource, 'config.json'));
    if (credentials.length > 1048576) fail();
    JSON.parse(credentials.toString('utf8'));
    directory = mkdtempSync(join(tmpdir(), 'equipment-release-verification-'));
    createPrivateDirectory(directory);
    const credentialCopy = join(directory, 'config.json');
    writeFileSync(credentialCopy, credentials, { mode: 0o600, flag: 'wx' });
    // Windows inherits the already-private directory ACL; POSIX verifies 0600.
    assertPrivatePath(credentialCopy, 0o600);
    const registryEnvironment = { ...env, DOCKER_CONFIG: directory };
    for (const name of [
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    ])
      delete registryEnvironment[name];

    const gateway = createEvidenceGateway({
      repository: releaseRepository,
      token: env.GITHUB_TOKEN,
      request: async (url, options) => {
        const requestPhase = phase;
        const started = Date.now();
        let response;
        try {
          response = await request(url, {
            ...options,
            redirect: 'error',
            signal: signal
              ? globalThis.AbortSignal.any([signal, options.signal])
              : options.signal,
          });
        } catch (error) {
          httpFailures.set(url, {
            phase: requestPhase,
            operation: 'GitHub publication evidence',
            tool: 'https',
            category: 'transport',
            status: undefined,
            signal: undefined,
            durationMs: Date.now() - started,
          });
          throw error;
        }
        if (!response.ok) {
          const status =
            Number.isInteger(response.status) &&
            response.status >= 100 &&
            response.status <= 599
              ? response.status
              : undefined;
          httpFailures.set(url, {
            phase: requestPhase,
            operation: 'GitHub publication evidence',
            tool: 'https',
            category: 'http',
            status,
            signal: undefined,
            durationMs: Date.now() - started,
          });
        } else httpFailures.delete(url);
        return response;
      },
    });
    phase = 'github-repository';
    const identity = await gateway.api('');
    if (
      identity.id !== releaseRepository.id ||
      identity.full_name !== releaseRepository.name
    )
      fail();
    phase = 'github-main';
    if ((await gateway.readRef('heads/main')) !== sourceRevision) fail();
    const runs = new Map();
    const ancestors = new Map();
    const bindings = [];
    for (const publication of ordered) {
      phase = 'github-provenance';
      signal?.throwIfAborted();
      const record = publication.source;
      const key = `${record.runId}/${record.runAttempt}`;
      if (!runs.has(key))
        runs.set(
          key,
          Promise.all([
            gateway.readRun(record.runId, record.runAttempt),
            gateway.listJobs(record.runId, record.runAttempt),
          ]),
        );
      const [run, listing] = await runs.get(key);
      if (
        !Array.isArray(listing.jobs) ||
        listing.total_count !== listing.jobs.length ||
        listing.jobs.length > 100 ||
        run.status !== 'completed'
      )
        fail();
      const jobs = listing.jobs.filter(
        (job) =>
          job.name === `Publish ${record.component}` ||
          job.name?.endsWith(` / Publish ${record.component}`),
      );
      if (
        jobs.length !== 1 ||
        !Number.isSafeInteger(jobs[0].id) ||
        jobs[0].id <= 0
      )
        fail();
      validatePublicationRunEvidence(
        record,
        { run, job: jobs[0] },
        { repository: releaseRepository, sourceRef: 'refs/heads/main' },
      );
      phase = 'github-lineage';
      if (!ancestors.has(record.sourceRevision))
        ancestors.set(
          record.sourceRevision,
          gateway.api(`/compare/${record.sourceRevision}...${sourceRevision}`),
        );
      const ancestry = await ancestors.get(record.sourceRevision);
      if (
        !['ahead', 'identical'].includes(ancestry.status) ||
        ancestry.base_commit?.sha !== record.sourceRevision ||
        ancestry.merge_base_commit?.sha !== record.sourceRevision
      )
        fail();
      bindings.push({
        component: record.component,
        sourceRevision: record.sourceRevision,
        runId: record.runId,
        runAttempt: record.runAttempt,
        jobId: jobs[0].id,
        digest: publication.digest,
        image: publication.image,
      });
    }
    // Complete bounded GitHub lookups before slower registry subprocesses can
    // consume that gateway's fixed request budget across independent producer runs.
    for (const publication of ordered) {
      phase = 'registry';
      signal?.throwIfAborted();
      await verifyAzurePublication(publication, {
        repository: releaseRepository,
        acrLoginServer: outputs.acr_login_server,
        signal,
        env: registryEnvironment,
      });
    }
    const binding = {
      version: 1,
      sourceRevision,
      repository: { ...releaseRepository },
      publications: bindings,
    };
    return {
      ...binding,
      verificationHash: createHash('sha256')
        .update(JSON.stringify(binding))
        .digest('hex'),
    };
  } catch (error) {
    primary = releaseFailure(error, phase, httpFailures);
  } finally {
    await cleanupAll(
      directory
        ? [
            {
              operation: 'Release verification credential cleanup',
              run: () => rmSync(directory, { recursive: true, force: true }),
            },
          ]
        : [],
      { primary },
    );
  }
}
