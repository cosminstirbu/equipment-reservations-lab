import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import parsers from '@stoplight/spectral-parsers';
import {
  cleanupAllSync,
  executeProcess,
  OperationalFailure,
  safeFailure,
} from './process.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePattern =
  /^https:\/\/raw\.githubusercontent\.com\/argoproj\/argo-cd\/[a-f0-9]{40}\/manifests\/install\.yaml$/;
const maximumBytes = 4 * 1024 * 1024;

function configuration(root) {
  const directory = join(root, 'deploy/argocd');
  const read = (name) => {
    const path = join(directory, name);
    if (!lstatSync(path).isFile()) throw new Error('Invalid file');
    return readFileSync(path, 'utf8');
  };
  try {
    if (!lstatSync(directory).isDirectory())
      throw new Error('Invalid directory');
    const source = JSON.parse(read('source.json'));
    const parsed = parsers.Yaml.parse(read('kustomization.yaml'));
    const overlay = parsed.data;
    const allowed = new Set([
      'apiVersion',
      'kind',
      'namespace',
      'resources',
      'images',
      'patches',
    ]);
    if (
      parsed.diagnostics.some((item) => item.severity === 0) ||
      Object.keys(source).sort().join(',') !== 'sha256,url' ||
      !sourcePattern.test(source.url) ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !overlay ||
      Object.keys(overlay).some((key) => !allowed.has(key)) ||
      overlay.apiVersion !== 'kustomize.config.k8s.io/v1beta1' ||
      overlay.kind !== 'Kustomization' ||
      overlay.namespace !== 'argocd' ||
      !Array.isArray(overlay.resources) ||
      overlay.resources.length !== 1 ||
      overlay.resources[0] !== source.url ||
      !Array.isArray(overlay.patches) ||
      !overlay.patches.length ||
      overlay.patches.some((patch) => {
        if (patch.path !== undefined)
          return (
            Object.keys(patch).length !== 1 || patch.path !== 'resources.yaml'
          );
        return (
          Object.keys(patch).sort().join(',') !== 'patch,target' ||
          typeof patch.patch !== 'string' ||
          !patch.target ||
          typeof patch.target !== 'object'
        );
      })
    )
      throw new Error('Invalid configuration');
    return { source, overlay, resources: read('resources.yaml') };
  } catch {
    throw new OperationalFailure(
      'Argo installation configuration is invalid; use the reviewed immutable source and local patch allowlist.',
    );
  }
}

async function download(source, fetchManifest, createTimeoutSignal) {
  const started = Date.now();
  const signal = createTimeoutSignal(30000);
  let reader;
  try {
    const response = await fetchManifest(source.url, {
      redirect: 'error',
      signal,
    });
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      throw new OperationalFailure(
        `Argo upstream request failed: status=${response.status}; duration=${Date.now() - started}ms.`,
      );
    }
    if (!response.body)
      throw new OperationalFailure('Argo upstream response has no body.');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes)
        throw new OperationalFailure(
          'Argo upstream response exceeds the 4 MiB size limit.',
        );
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
      throw new OperationalFailure(
        'Argo upstream integrity verification failed; no installation was rendered.',
      );
    return bytes;
  } catch (error) {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* The transport may already have closed the body. */
      }
    }
    if (error instanceof OperationalFailure) throw error;
    const category =
      signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name)
        ? 'timeout'
        : 'transport';
    throw new OperationalFailure(
      `Argo upstream request failed: ${category}; duration=${Date.now() - started}ms; private transport details suppressed.`,
    );
  }
}

export async function renderArgoInstallation({
  root = repository,
  kubectl = 'kubectl',
  run = executeProcess,
  fetchManifest = globalThis.fetch,
  createTimeoutSignal = (milliseconds) =>
    globalThis.AbortSignal.timeout(milliseconds),
  stagingParent = tmpdir(),
  report = console.error,
} = {}) {
  const { source, overlay, resources } = configuration(root);
  const bytes = await download(source, fetchManifest, createTimeoutSignal);
  let staging;
  let primary;
  try {
    staging = mkdtempSync(join(stagingParent, 'equipment-argocd-'));
    writeFileSync(join(staging, 'install.yaml'), bytes);
    writeFileSync(join(staging, 'resources.yaml'), resources);
    writeFileSync(
      join(staging, 'kustomization.yaml'),
      JSON.stringify({ ...overlay, resources: ['install.yaml'] }),
    );
    return run(kubectl, ['kustomize', staging], {
      operation: 'Argo installation rendering',
      tool: 'kubectl',
      output: 'private-capture',
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    primary =
      error instanceof OperationalFailure
        ? error
        : new OperationalFailure(
            'Argo installation staging or rendering failed; private details suppressed.',
          );
    throw primary;
  } finally {
    cleanupAllSync(
      staging
        ? [
            {
              operation: 'Argo staging cleanup',
              tool: 'filesystem',
              run: () => rmSync(staging, { recursive: true }),
            },
          ]
        : [],
      { primary, report },
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/argocd-installation.mjs');
    process.exitCode = 1;
  } else {
    renderArgoInstallation()
      .then((rendered) => process.stdout.write(rendered))
      .catch((error) => {
        console.error(
          safeFailure(
            error,
            'Argo installation failed; private details suppressed.',
          ),
        );
        process.exitCode = 1;
      });
  }
}
