import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { cleanupAll, executeProcess } from './process.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { imageNames, jobSuffix } from './deployment-validation.mjs';
import { prepareCiFixture } from './deployment-ci.mjs';

test('CI fixture uses real public templates and temporary TLS while keeping deployment mutations at a scoped process boundary', async () => {
  const kubectl = process.env.EQUIPMENT_KUBECTL ?? 'kubectl';
  assert.equal(
    JSON.parse(
      executeProcess(kubectl, ['version', '--client', '-o', 'json'], {
        encoding: 'utf8',
        operation: 'read CI public client version',
        tool: 'kubectl',
        output: 'public-capture',
      }),
    ).clientVersion.gitVersion,
    'v1.35.8',
    'Use checksum-verified kubectl1.35.8 via PATH or EQUIPMENT_KUBECTL',
  );
  const directory = mkdtempSync(join(tmpdir(), 'ci-fixture-contract-'));
  const kubeconfig = join(directory, 'kubeconfig');
  const sourceRevision = 'b'.repeat(40);
  const release = {
    sourceRevision,
    images: Object.fromEntries(
      imageNames.map((name) => [
        name,
        { image: `equipment-ci/${name}`, digest: `sha256:${'a'.repeat(64)}` },
      ]),
    ),
    tags: imageNames.map((name) => `equipment-ci/${name}:${sourceRevision}`),
  };
  const mutations = [];
  const run = (command, args, options = {}) => {
    if (
      command === 'openssl' ||
      (command === 'kubectl' && args[0] === 'kustomize')
    )
      return executeProcess(command === 'kubectl' ? kubectl : command, args, {
        encoding: 'utf8',
        operation: 'prepare CI contract fixture',
        tool: command,
        output: command === 'openssl' ? 'private-capture' : 'public-capture',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
    mutations.push({ command, args, input: options.input });
    return '';
  };
  let primary;
  try {
    const prepared = prepareCiFixture({
      directory,
      kubeconfig,
      context: 'kind-equipment-ci',
      release,
      run,
    });
    assert.equal(statSync(prepared.state).mode & 0o777, 0o700);
    assert.equal(
      statSync(join(prepared.state, 'credentials.json')).mode & 0o777,
      0o600,
    );
    assert.match(
      executeProcess(
        'openssl',
        ['verify', '-CAfile', prepared.ca, join(prepared.state, 'tls.crt')],
        {
          encoding: 'utf8',
          operation: 'verify CI contract certificate',
          tool: 'openssl',
          output: 'private-capture',
        },
      ),
      /OK/,
    );
    const certificate = new X509Certificate(
      readFileSync(join(prepared.state, 'tls.crt')),
    );
    assert.equal(certificate.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(certificate.checkIP('127.0.0.2'), undefined);
    const key = readFileSync(join(directory, 'ca.key'), 'utf8');
    const privateResources = mutations
      .filter((call) => call.input && call.command === 'kubectl')
      .map((call) => JSON.parse(call.input));
    const argoTls = privateResources.find(
      (resource) =>
        resource.kind === 'Secret' &&
        resource.metadata.namespace === 'argocd' &&
        resource.metadata.name === 'argocd-server-tls',
    );
    assert.ok(argoTls?.type === 'kubernetes.io/tls');
    assert.ok(
      argoTls.stringData['tls.crt'] ===
        readFileSync(join(prepared.state, 'tls.crt'), 'utf8'),
    );
    assert.ok(
      argoTls.stringData['tls.key'] ===
        readFileSync(join(prepared.state, 'tls.key'), 'utf8'),
    );
    assert.ok(
      privateResources.every(
        (resource) => !Object.values(resource.stringData ?? {}).includes(key),
      ),
    );
    assert.ok(
      mutations
        .filter((call) => call.command === 'kubectl')
        .every(
          (call) =>
            call.args.includes(kubeconfig) &&
            call.args.includes('kind-equipment-ci'),
        ),
    );
    const state = JSON.parse(
      readFileSync(join(prepared.state, 'smoke-state.json'), 'utf8'),
    );
    assert.equal(state.applicationOrigin, 'https://app.equipment.test');
    assert.equal(state.context, 'kind-equipment-ci');
    const waveResources = prepared.waves.flatMap(
      (wave) => JSON.parse(readFileSync(wave.manifests, 'utf8')).items,
    );
    assert.equal(
      waveResources.filter((resource) => resource.kind === 'Job').length,
      2,
    );
    for (const name of ['database', 'identity']) {
      const expected = jobSuffix(
        { sourceRevision, images: release.images },
        readFileSync('deploy/base/configuration.yaml', 'utf8'),
        readFileSync('deploy/environments/local/configuration.yaml', 'utf8'),
        readFileSync(`deploy/base/jobs/${name}/job.yaml`, 'utf8'),
      );
      const job = waveResources.find(
        (resource) =>
          resource.kind === 'Job' &&
          resource.metadata.labels['equipment.test/bootstrap'] === name,
      );
      assert.equal(job.metadata.name, `${name}-bootstrap${expected}`);
      assert.equal(job.metadata.annotations['argocd.argoproj.io/hook'], 'Sync');
    }
    assert.ok(
      waveResources
        .filter((resource) => resource.kind === 'Job')
        .every((resource) => /-[a-f0-9]{16}$/.test(resource.metadata.name)),
    );
  } catch (error) {
    primary = error;
  } finally {
    await cleanupAll(
      [
        {
          operation: 'remove CI contract fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ],
      { primary },
    );
  }
});
