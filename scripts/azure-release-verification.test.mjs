// Design: exercise the public verifier across real loopback HTTP and child-process
// boundaries. Only GitHub/registry responses are doubled; shared provenance and OCI
// validation remain real. No external service or cloud mutation is permitted.
import test from 'node:test';
import assert from 'node:assert/strict';

test('release verification rejects missing publications before using credentials or network', async () => {
  const { verifyQualificationPublications } =
    await import('./azure-release-verification.mjs');
  let calls = 0;
  await assert.rejects(
    verifyQualificationPublications({
      publications: [],
      outputs: {},
      config: {},
      sourceRevision: 'a'.repeat(40),
      env: {},
      request: () => {
        calls++;
        throw Error('PRIVATE_TOKEN');
      },
    }),
  );
  assert.equal(calls, 0);
});

import childProcess from 'node:child_process';
import filesystem from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createPrivateDirectory } from './local-platform.mjs';
import {
  releaseComponents,
  releaseRepository,
} from './azure-qualification-data.mjs';

async function boundary(t, mode = '') {
  const directory = mkdtempSync(join(tmpdir(), 'release-boundary-'));
  const credentials = join(directory, 'credentials');
  createPrivateDirectory(credentials);
  writeFileSync(
    join(credentials, 'config.json'),
    JSON.stringify({
      auths: {
        'fixtureacr.azurecr.io': { auth: 'PRIVATE_AUTH' },
        'ghcr.io': { auth: 'PRIVATE_AUTH' },
      },
    }),
    { mode: 0o600 },
  );
  const original = readFileSync(join(credentials, 'config.json'), 'utf8');
  const index = {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: ['amd64', 'arm64'].map((architecture, i) => ({
      digest: `sha256:${String(i + 1).repeat(64)}`,
      platform: { os: 'linux', architecture },
    })),
  };
  const raw = JSON.stringify(index);
  const publications = releaseComponents.map((component) => {
    const source = {
      schemaVersion: 1,
      component,
      repository: releaseRepository,
      sourceRevision: 'a'.repeat(40),
      sourceRef: 'refs/heads/main',
      runId: 1,
      runAttempt: 1,
      workflow: '.github/workflows/validate.yaml',
      image: `ghcr.io/${releaseRepository.name}-${component}`,
      digest: `sha256:${createHash('sha256').update(raw).digest('hex')}`,
    };
    return {
      schemaVersion: 1,
      source,
      image: `fixtureacr.azurecr.io/equipment-reservations-lab-${component}`,
      digest: source.digest,
    };
  });
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    const path = req.url.replace(`/repos/${releaseRepository.name}`, '');
    let value;
    if (path === '')
      value = { id: releaseRepository.id, full_name: releaseRepository.name };
    else if (path === '/git/ref/heads/main')
      value = { object: { sha: 'b'.repeat(40) } };
    else if (path.startsWith('/compare/'))
      value = {
        status: mode === 'foreign-lineage' ? 'diverged' : 'ahead',
        base_commit: { sha: 'a'.repeat(40) },
        merge_base_commit: { sha: 'a'.repeat(40) },
      };
    else if (path.endsWith('/jobs?per_page=100'))
      value = {
        total_count: mode === 'incomplete-jobs' ? 8 : 7,
        jobs: releaseComponents.map((component, index) => ({
          id: mode === 'missing-job-id' ? undefined : index + 1,
          run_id: 1,
          run_attempt: mode === 'wrong-attempt' ? 2 : 1,
          name: `Publish ${component}`,
          conclusion: mode === 'failed-job' ? 'failure' : 'success',
        })),
      };
    else if (path === '/actions/runs/1/attempts/1')
      value = {
        id: 1,
        run_attempt: 1,
        head_sha: 'a'.repeat(40),
        head_branch: mode === 'foreign-branch' ? 'feature' : 'main',
        path: '.github/workflows/validate.yaml',
        repository: {
          id: releaseRepository.id,
          full_name: releaseRepository.name,
        },
        head_repository: { id: releaseRepository.id },
        event: 'push',
        status: 'completed',
        // Existing publication authority is the successful component job, even
        // when a different component caused the parent workflow to fail.
        conclusion: 'failure',
      };
    else {
      res.writeHead(403);
      res.end('PRIVATE_GITHUB_PAYLOAD');
      return;
    }
    if (mode === 'http-failure') {
      res.writeHead(403);
      res.end('PRIVATE_GITHUB_TOKEN');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const provider = join(directory, 'registry.mjs');
  writeFileSync(
    provider,
    `const args=process.argv.slice(2);if(process.env.FIXTURE_MODE==='registry-error'){console.error('PRIVATE_REGISTRY_TOKEN');process.exit(17);}if(args.includes('--raw')){process.stdout.write(${JSON.stringify(raw)}+(process.env.FIXTURE_MODE==='digest'?'PRIVATE_RAW':''));}else{const architecture=args.at(-1).endsWith('2'.repeat(64))?'arm64':'amd64';process.stdout.write(JSON.stringify({os:'linux',architecture,config:{Labels:{'org.opencontainers.image.revision':process.env.FIXTURE_MODE==='labels'?'PRIVATE_REVISION':'${'a'.repeat(40)}','org.opencontainers.image.source':'https://github.com/${releaseRepository.name}'}}}));}`,
  );
  const calls = [];
  const spawn = childProcess.spawn;
  childProcess.spawn = (command, args, options) => {
    if (command !== 'docker') return spawn(command, args, options);
    calls.push({
      args,
      config: options.env.DOCKER_CONFIG,
      githubTokenPresent: Boolean(
        options.env.GITHUB_TOKEN || options.env.GH_TOKEN,
      ),
    });
    return spawn(process.execPath, [provider, ...args], options);
  };
  syncBuiltinESMExports();
  t.after(async () => {
    childProcess.spawn = spawn;
    syncBuiltinESMExports();
    server.close();
    await once(server, 'close');
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    publications,
    requests,
    calls,
    credentials,
    options: {
      publications,
      outputs: { acr_login_server: 'fixtureacr.azurecr.io' },
      config: { githubRepository: releaseRepository.name },
      sourceRevision: 'b'.repeat(40),
      env: {
        ...process.env,
        GITHUB_TOKEN: 'ghs_PRIVATE_GITHUB_TOKEN',
        DOCKER_CONFIG: credentials,
        FIXTURE_MODE: mode,
      },
      request: (url, options) =>
        globalThis.fetch(
          `http://127.0.0.1:${server.address().port}${new URL(url).pathname}${new URL(url).search}`,
          options,
        ),
    },
    assertCleanup: () => {
      assert.equal(
        readFileSync(join(credentials, 'config.json'), 'utf8'),
        original,
      );
      for (const call of calls) {
        assert.notEqual(call.config, credentials);
        assert.equal(existsSync(call.config), false);
      }
    },
  };
}

test('all seven publications require actual GitHub and both OCI registry responses, without Actions artifact dependence', async (t) => {
  const fixture = await boundary(t);
  const { verifyQualificationPublications } =
    await import('./azure-release-verification.mjs');
  const result = await verifyQualificationPublications(fixture.options);
  assert.equal(result.publications.length, 7);
  assert.deepEqual(
    result.publications.map((entry) => entry.jobId).sort(),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.match(result.verificationHash, /^[a-f0-9]{64}$/);
  assert.equal(fixture.calls.length, 42);
  assert.ok(fixture.calls.every((call) => !call.githubTokenPresent));
  assert.ok(
    fixture.calls.every(
      (call) =>
        call.args.includes('inspect') &&
        !call.args.includes('create') &&
        !call.args.includes('login'),
    ),
  );
  assert.ok(
    fixture.requests.every(
      (request) =>
        !request.url.includes('artifacts') &&
        request.authorization === 'Bearer ghs_PRIVATE_GITHUB_TOKEN',
    ),
  );
  fixture.assertCleanup();
});

for (const mode of [
  'wrong-attempt',
  'missing-job-id',
  'foreign-branch',
  'failed-job',
  'incomplete-jobs',
  'foreign-lineage',
  'http-failure',
  'digest',
  'labels',
  'registry-error',
]) {
  test(`actual release verification fails privately and removes owned credentials: ${mode}`, async (t) => {
    const fixture = await boundary(t, mode);
    const { verifyQualificationPublications } =
      await import('./azure-release-verification.mjs');
    await assert.rejects(
      verifyQualificationPublications(fixture.options),
      (error) => {
        assert.doesNotMatch(String(error), /PRIVATE_/);
        if (mode === 'registry-error') {
          assert.match(error.message, /phase=registry/);
          assert.equal(
            error.details.operation,
            'Registry immutable index verification',
          );
          assert.equal(error.details.tool, 'docker');
          assert.equal(error.details.category, 'exit');
          assert.equal(error.details.status, 17);
          assert.equal(error.details.signal, undefined);
          assert.ok(
            Number.isFinite(error.details.durationMs) &&
              error.details.durationMs >= 0,
          );
        }
        if (mode === 'http-failure') {
          assert.match(error.message, /phase=github-repository/);
          assert.equal(error.details.status, 403);
          assert.equal(error.details.category, 'http');
        }
        return true;
      },
    );
    fixture.assertCleanup();
  });
}

test('simultaneous primary process and credential cleanup failures retain separate safe evidence', async (t) => {
  const fixture = await boundary(t, 'registry-error');
  const remove = filesystem.rmSync;
  const report = console.error;
  const cleanupPaths = [];
  const diagnostics = [];
  filesystem.rmSync = (path, options) => {
    if (
      dirname(String(path)) === tmpdir() &&
      basename(String(path)).startsWith('equipment-release-verification-')
    ) {
      cleanupPaths.push(path);
      const failure = new Error('PRIVATE_CLEANUP_PAYLOAD');
      failure.code = 'EACCES';
      throw failure;
    }
    return remove(path, options);
  };
  console.error = (message) => diagnostics.push(message);
  syncBuiltinESMExports();
  t.after(() => {
    filesystem.rmSync = remove;
    console.error = report;
    syncBuiltinESMExports();
    for (const path of cleanupPaths)
      remove(path, { recursive: true, force: true });
  });
  const { verifyQualificationPublications } =
    await import('./azure-release-verification.mjs');
  await assert.rejects(
    verifyQualificationPublications(fixture.options),
    (error) => {
      assert.equal(error.details.status, 17);
      assert.match(error.message, /phase=registry/);
      assert.doesNotMatch(error.message, /PRIVATE_/);
      return true;
    },
  );
  assert.equal(cleanupPaths.length, 1);
  assert.match(
    diagnostics.join('\n'),
    /Cleanup failure: Release verification credential cleanup/,
  );
  assert.match(
    diagnostics.join('\n'),
    /spawn; status=unavailable; signal=unavailable; duration=0ms/,
  );
  assert.doesNotMatch(diagnostics.join('\n'), /PRIVATE_/);
});

for (const kind of [
  'duplicate-component',
  'foreign-acr',
  'foreign-repository',
  'personal-token',
]) {
  test(`untrusted release inputs fail before authenticated requests: ${kind}`, async (t) => {
    const fixture = await boundary(t);
    const { verifyQualificationPublications } =
      await import('./azure-release-verification.mjs');
    if (kind === 'duplicate-component')
      fixture.options.publications[1] = fixture.options.publications[0];
    if (kind === 'foreign-acr')
      fixture.options.outputs.acr_login_server = 'foreignacr.azurecr.io';
    if (kind === 'foreign-repository')
      fixture.options.publications[0].source.repository = {
        id: 99,
        name: 'foreign/repository',
      };
    if (kind === 'personal-token')
      fixture.options.env.GITHUB_TOKEN = 'github_pat_PRIVATE_PERSONAL_TOKEN';
    await assert.rejects(verifyQualificationPublications(fixture.options));
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.calls.length, 0);
    fixture.assertCleanup();
  });
}
