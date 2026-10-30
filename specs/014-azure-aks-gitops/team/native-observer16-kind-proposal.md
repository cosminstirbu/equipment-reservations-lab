# Targeted temporary kind-stage observer16 proposal

Only this new author artifact is changed; prior observer and all source remain frozen. Root reports one instrumented concurrent run where all three kind creates exited1 at approximately98?99s with forciblyClosed=true and no overflow; Loki passed. Admission assertions and bundle issuer seed were not reached. Read-only global oom_kill=0 and recent OOM flags=false do not establish a cause. No provider execution or source repair is proposed here.

## Materially new observation

Reuse the frozen native16 preload mechanics and existing eight literal flags. Add only eight exact kind wrapper literals, four command-presence literals and three ordered progress IDs. These can distinguish provider setup, boot-log observation and kubeadm invocation; matches remain observations, never causal verdicts. The full block below differs only in the predicate function's tool argument, fixed kind-only observations and corresponding call argument. Overflow still returns only overflow=true/unclassified=true, with no inferred absent matches or progress. Unknown always remains unclassified.

Pinned references: [Podman provider](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/podman/provider.go), [Podman provisioning](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/podman/provision.go), [common cgroup/log observation](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/providers/common/cgroups.go), [kubeadm initialization](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/create/actions/kubeadminit/init.go), [kind create flow](https://github.com/kubernetes-sigs/kind/blob/v0.33.0/pkg/cluster/internal/create/create.go). Prior source assessment is preserved in `kind-create-observer-proposal.md`; root independently verified the version wrapper in pinned util.go. No new source-recall assertion or remote research is substituted for those supplied references.

Progress is the first occurrence of each fixed literal, sorted by byte-string position; emit only the fixed IDs preparing-nodes/writing-configuration/starting-control-plane. It records order observed in stderr, not guaranteed provider completion. Command-presence flags observe stderr text, not executed argv. Missing flags do not rule out hidden/abbreviated output. The preloader emits no raw matches, paths, arguments, payloads, values or stack. No retry, timing, concurrency, cleanup, kernel or VM change follows from any result.

## Executable preload

Root injects this single block using the same dataURL procedure and checksum-verified NATIVE_OBSERVER_KUBECTL/KIND paths described in `native-observer16-proposal.md`. Existing unchanged private-output, bounded64KiB, interception, fixture path checks and forwarding/privacy harness preconditions remain binding. Independent review precedes execution. No test/provider execution was performed while preparing this artifact.

```javascript
import childProcess from 'node:child_process';
import assert from 'node:assert/strict';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

const normalize = (value) => typeof value === 'string' ? resolve(value).replaceAll('\\', '/').toLowerCase() : '';
const pinned = new Map([
  [normalize(process.env.NATIVE_OBSERVER_KUBECTL), 'kubectl'],
  [normalize(process.env.NATIVE_OBSERVER_KIND), 'kind'],
].filter(([path]) => path));
const emit = (record) => {
  try { process.stderr.write(JSON.stringify({ observer: 'native16', ...record }) + '\n'); } catch {}
};
const now = () => performance.now();
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);
const issuers = new Set(['letsencrypt-production', 'letsencrypt-staging']);
const secrets = new Set([
  'cert-manager/letsencrypt-production-account',
  'cert-manager/letsencrypt-staging-account',
  'equipment/equipment-tls',
  'equipment/dashboard-public-tls',
  'argocd/argocd-public-tls',
]);
const admissionLines = new Set([96,138,142,184,205,218,221,231,243,263,264,269,273,289,309,313,318,319,383,388,399,411,430,645,652,656,671,702,734,751,760,820,825,833,844,850,851,873,877]);
const sourceContext = () => {
  const stack = new Error().stack ?? '';
  if (stack.includes('/scripts/azure-recovery-bundle.native.test.mjs:') || stack.includes('\\scripts\\azure-recovery-bundle.native.test.mjs:')) return 'bundle';
  if (stack.includes('/scripts/azure-admission.test.mjs:') || stack.includes('\\scripts\\azure-admission.test.mjs:')) return 'admission';
  return 'other';
};
const checkpoint = (tool, args, context, input) => {
  if (!Array.isArray(args)) return 'unclassified';
  if (tool === 'kind') {
    const index = args.indexOf('--name');
    const owned = typeof args[index + 1] === 'string' && /^equipment-(?:admission|bundle|acme)-[a-f0-9]{8}$/.test(args[index + 1]);
    return owned && args[0] === 'create' && args[1] === 'cluster' ? 'kind-create' : 'unclassified';
  }
  if (context !== 'bundle') return 'unclassified';
  const patch = args.indexOf('patch');
  if (patch >= 0 && args[patch + 1] === 'clusterissuer' && issuers.has(args[patch + 2]) && args.includes('--subresource=status')) return args[patch + 2] + '-status';
  if (!args.includes('apply') || !args.includes('-f') || args.at(-1) !== '-') return 'unclassified';
  try {
    if (typeof input !== 'string' && !Buffer.isBuffer(input)) return 'unclassified';
    if (Buffer.byteLength(input) > 65536) return 'unclassified';
    const value = JSON.parse(input.toString());
    if (value.apiVersion === 'cert-manager.io/v1' && value.kind === 'ClusterIssuer' && issuers.has(value.metadata?.name)) return value.metadata.name + '-apply';
    const name = value.metadata?.namespace + '/' + value.metadata?.name;
    if (value.apiVersion === 'v1' && value.kind === 'Secret' && secrets.has(name)) return name + '-apply';
  } catch {}
  return 'unclassified';
};
const predicates = (text, overflow, tool) => {
  if (overflow) return { unclassified: true, overflow: true };
  return {
    overflow: false, unclassified: true,
    noKindMapping: text.includes('no matches for kind'),
    notFound: text.includes('(NotFound)'),
    forbidden: text.includes('(Forbidden)'),
    webhookCall: text.includes('failed calling webhook'),
    deadlineExceeded: text.includes('context deadline exceeded'),
    connectionRefused: text.includes('connection refused'),
    forciblyClosed: text.includes('forcibly closed'),
    unexpectedEof: text.includes('unexpected EOF'),
    ...(tool === 'kind' ? {
      failedPodmanInfo: text.includes('failed to get podman info'),
      failedPodmanNetwork: text.includes('failed to ensure podman network'),
      failedListNodes: text.includes('failed to list nodes'),
      failedApiServerPort: text.includes('failed to get api server port'),
      failedPodmanVersion: text.includes('failed to check podman version'),
      failedReadLogs: text.includes('failed to read logs'),
      missingBootLogLine: text.includes('could not find a log line that matches'),
      failedKubeadmInit: text.includes('failed to init node with kubeadm'),
      podmanRunPresent: text.includes('podman run'),
      podmanExecPresent: text.includes('podman exec'),
      podmanLogsPresent: text.includes('podman logs'),
      podmanInspectPresent: text.includes('podman inspect'),
      progress: [
        ['preparing-nodes', text.indexOf('Preparing nodes')],
        ['writing-configuration', text.indexOf('Writing configuration')],
        ['starting-control-plane', text.indexOf('Starting control-plane')],
      ].filter(([, position]) => position >= 0)
        .sort((left, right) => left[1] - right[1])
        .map(([id]) => id),
    } : {}),
  };

};
const completion = (tool, context, label, started, result, text, overflow) => emit({
  event: 'process-complete', tool, context, checkpoint: label,
  status: Number.isInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
  signal: signals.has(result.signal) ? result.signal : null,
  durationMs: Math.max(0, Math.round(now() - started)),
  ...predicates(text, overflow, tool),
});
const originalSync = childProcess.spawnSync;
childProcess.spawnSync = function(command, args, options) {
  const tool = pinned.get(normalize(command));
  if (!tool) return Reflect.apply(originalSync, this, arguments);
  const context = sourceContext(), started = now();
  const label = checkpoint(tool, args, context, options?.input);
  const result = Reflect.apply(originalSync, this, arguments);
  const stderr = result.stderr;
  const size = typeof stderr === 'string' || Buffer.isBuffer(stderr) ? Buffer.byteLength(stderr) : 0;
  completion(tool, context, label, started, result, size <= 65536 && size ? stderr.toString() : '', size > 65536);
  return result;
};
const originalSpawn = childProcess.spawn;
childProcess.spawn = function(command, args, options) {
  const tool = pinned.get(normalize(command));
  if (!tool) return Reflect.apply(originalSpawn, this, arguments);
  const context = sourceContext(), started = now();
  let label = checkpoint(tool, args, context), stderr = Buffer.alloc(0), overflow = false;
  let input = Buffer.alloc(0), inputOverflow = false, forwarding = false;
  const child = Reflect.apply(originalSpawn, this, arguments);
  child.stderr?.on('data', (chunk) => {
    if (overflow) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (stderr.length + bytes.length > 65536) { overflow = true; stderr = Buffer.alloc(0); }
    else stderr = Buffer.concat([stderr, bytes]);
  });
  if (context === 'bundle' && tool === 'kubectl' && child.stdin) {
    const observe = (chunk, encoding) => {
      if (inputOverflow || chunk == null || typeof chunk === 'function') return;
      if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) { inputOverflow = true; input = Buffer.alloc(0); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
      if (input.length + bytes.length > 65536) { inputOverflow = true; input = Buffer.alloc(0); }
      else input = Buffer.concat([input, bytes]);
    };
    for (const method of ['write', 'end']) {
      const original = child.stdin[method];
      child.stdin[method] = function(chunk, encoding) {
        if (forwarding) return Reflect.apply(original, this, arguments);
        observe(chunk, encoding);
        forwarding = true;
        try { return Reflect.apply(original, this, arguments); }
        finally { forwarding = false; }
      };
    }
  }
  child.once('close', (status, signal) => {
    if (label === 'unclassified' && !inputOverflow) label = checkpoint(tool, args, context, input);
    completion(tool, context, label, started, { status, signal }, stderr.toString(), overflow);
    input = Buffer.alloc(0); stderr = Buffer.alloc(0);
  });
  return child;
};
for (const method of ['ok', 'equal', 'match', 'deepEqual', 'strictEqual', 'deepStrictEqual']) {
  const original = assert[method];
  assert[method] = function() {
    try { return Reflect.apply(original, this, arguments); }
    catch (error) {
      const stack = new Error().stack ?? '';
      const match = stack.match(/(?:\/|\\)scripts(?:\/|\\)azure-admission[.]test[.]mjs:(\d+):\d+/);
      const line = match ? Number(match[1]) : 0;
      if (admissionLines.has(line)) emit({ event: 'admission-assertion', method, line });
      throw error;
    }
  };
}
syncBuiltinESMExports();
```

Root owns any single same-profile diagnostic run and records its original failure outcome. An instrumented pass is not an ordinary gate pass. This proposal does not claim the new signatures have been observed, fix any failure, or authorize another source repair.
