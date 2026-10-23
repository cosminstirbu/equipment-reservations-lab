import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ReadableStream } from 'node:stream/web';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderArgoInstallation } from './argocd-installation.mjs';
import { OperationalFailure } from './process.mjs';

const { AbortSignal, Response, DOMException } = globalThis;

const url =
  'https://raw.githubusercontent.com/argoproj/argo-cd/a5038b0e2bbac1715754380ae0084df8e3d5b48c/manifests/install.yaml';
const manifest = Buffer.from(
  'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\n',
);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'argo-render-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'deploy/argocd');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'source.json'),
    JSON.stringify({
      url,
      sha256: createHash('sha256').update(manifest).digest('hex'),
    }),
  );
  writeFileSync(
    join(directory, 'kustomization.yaml'),
    JSON.stringify({
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      namespace: 'argocd',
      resources: [url],
      patches: [{ path: 'resources.yaml' }],
    }),
  );
  writeFileSync(
    join(directory, 'resources.yaml'),
    'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: fixture\ndata:\n  patched: yes\n',
  );
  const stagingParent = join(root, 'staging');
  mkdirSync(stagingParent);
  const calls = [];
  const run = (command, args, settings) => {
    calls.push({ command, args, settings });
    const staging = args[1];
    assert.deepEqual(readFileSync(join(staging, 'install.yaml')), manifest);
    assert.deepEqual(
      JSON.parse(readFileSync(join(staging, 'kustomization.yaml'), 'utf8'))
        .resources,
      ['install.yaml'],
    );
    return 'verified rendered fixture\n';
  };
  return { root, directory, stagingParent, calls, run };
}

test('fetches once with immutable identity, stages verified original bytes, returns exact render and cleans up', async (t) => {
  const f = fixture(t);
  let requests = 0;
  const rendered = await renderArgoInstallation({
    ...f,
    fetchManifest: async (address, settings) => {
      requests++;
      assert.equal(address, url);
      assert.equal(settings.redirect, 'error');
      assert.ok(settings.signal instanceof AbortSignal);
      return new Response(manifest);
    },
  });
  assert.equal(rendered, 'verified rendered fixture\n');
  assert.equal(requests, 1);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(readdirSync(f.stagingParent), []);
  assert.equal(
    JSON.parse(readFileSync(join(f.directory, 'kustomization.yaml'), 'utf8'))
      .resources[0],
    url,
  );
});

test('upstream integrity, HTTP, transport, timeout and oversized-body failures never invoke rendering or retain payloads', async (t) => {
  for (const [name, fetchManifest, expected] of [
    ['integrity', async () => new Response('PRIVATE_MARKER'), /integrity/i],
    [
      'http',
      async () => new Response('PRIVATE_MARKER', { status: 503 }),
      /status=503/,
    ],
    [
      'transport',
      async () => {
        throw new Error('PRIVATE_MARKER');
      },
      /transport/,
    ],
    [
      'timeout',
      async () => {
        throw new DOMException('PRIVATE_MARKER', 'TimeoutError');
      },
      /timeout/,
    ],
    [
      'oversize',
      async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)),
      /size|limit/i,
    ],
  ])
    await t.test(name, async (t) => {
      const f = fixture(t);
      await assert.rejects(
        renderArgoInstallation({ ...f, fetchManifest }),
        (error) => {
          assert.match(error.message, expected);
          assert.doesNotMatch(
            JSON.stringify(error) + error.stack,
            /PRIVATE_MARKER/,
          );
          return true;
        },
      );
      assert.equal(f.calls.length, 0);
      assert.deepEqual(readdirSync(f.stagingParent), []);
    });
});

test('rejects mutable/untrusted sources and all additional Kustomize loading paths before fetching', async (t) => {
  for (const mutation of [
    (config) => {
      config.resources = [url, 'https://private.invalid/PRIVATE_MARKER'];
    },
    (config) => {
      config.components = ['https://private.invalid/PRIVATE_MARKER'];
    },
    (config) => {
      config.bases = ['../PRIVATE_MARKER'];
    },
    (config) => {
      config.generators = ['PRIVATE_MARKER'];
    },
    (config) => {
      config.transformers = ['PRIVATE_MARKER'];
    },
    (config) => {
      config.patches = [{ path: '../PRIVATE_MARKER' }];
    },
    (config) => {
      config.resources = [
        url.replace(/a5038b0e2bbac1715754380ae0084df8e3d5b48c/, 'stable'),
      ];
    },
  ]) {
    const f = fixture(t);
    const path = join(f.directory, 'kustomization.yaml');
    const config = JSON.parse(readFileSync(path, 'utf8'));
    mutation(config);
    writeFileSync(path, JSON.stringify(config));
    let fetched = false;
    await assert.rejects(
      renderArgoInstallation({
        ...f,
        fetchManifest: async () => {
          fetched = true;
          return new Response(manifest);
        },
      }),
      /configuration/i,
    );
    assert.equal(fetched, false);
  }
});

test('real process failure remains private and removes its staged files through the public API', async (t) => {
  const f = fixture(t);
  const runner = `import {renderArgoInstallation} from ${JSON.stringify(new URL('./argocd-installation.mjs', import.meta.url).href)}; import {executeProcess} from ${JSON.stringify(new URL('./process.mjs', import.meta.url).href)}; try { await renderArgoInstallation({root:${JSON.stringify(f.root)}, stagingParent:${JSON.stringify(f.stagingParent)}, fetchManifest:async()=>new Response(${JSON.stringify(manifest.toString())}),run:()=>executeProcess(process.execPath,['-e','console.error("PRIVATE_MARKER");process.exit(7)'],{operation:'Argo render fixture',tool:'node',output:'private-capture',timeout:10000})}); } catch(error) { console.error(error.message); process.exitCode=1; }`;
  let failure;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', runner], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /status=7/);
  assert.doesNotMatch(failure.stdout + failure.stderr, /PRIVATE_MARKER/);
  assert.deepEqual(readdirSync(f.stagingParent), []);
});

test('cleanup failure fails success and preserves an existing primary failure with separate safe evidence', async (t) => {
  for (const failPrimary of [false, true]) {
    const f = fixture(t);
    const diagnostics = [];
    await assert.rejects(
      renderArgoInstallation({
        ...f,
        fetchManifest: async () => new Response(manifest),
        report: (message) => diagnostics.push(message),
        run: (_command, args) => {
          rmSync(args[1], { recursive: true });
          if (failPrimary)
            throw new OperationalFailure('primary render fixture failure');
          return 'rendered';
        },
      }),
      failPrimary ? /primary render fixture failure/ : /cleanup operation/,
    );
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], /Argo staging cleanup/);
    assert.deepEqual(readdirSync(f.stagingParent), []);
  }
});

test('redirect responses are refused and oversized streamed bodies are cancelled', async (t) => {
  const redirect = fixture(t);
  await assert.rejects(
    renderArgoInstallation({
      ...redirect,
      fetchManifest: async () =>
        new Response('PRIVATE_MARKER', {
          status: 302,
          headers: { location: 'https://private.invalid' },
        }),
    }),
    /status=302/,
  );
  assert.equal(redirect.calls.length, 0);
  const oversized = fixture(t);
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    renderArgoInstallation({
      ...oversized,
      fetchManifest: async () => new Response(body),
    }),
    /size limit/,
  );
  assert.equal(cancelled, true);
});

test('one 30-second budget also aborts a stalled response body before rendering', async (t) => {
  const f = fixture(t);
  let budget;
  let aborted = false;
  await assert.rejects(
    renderArgoInstallation({
      ...f,
      createTimeoutSignal: (milliseconds) => {
        budget = milliseconds;
        return AbortSignal.timeout(10);
      },
      fetchManifest: async (_url, { signal }) =>
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                'abort',
                () => {
                  aborted = true;
                  controller.error(signal.reason);
                },
                { once: true },
              );
            },
          }),
        ),
    }),
    /timeout/,
  );
  assert.equal(budget, 30000);
  assert.equal(aborted, true);
  assert.equal(f.calls.length, 0);
});
