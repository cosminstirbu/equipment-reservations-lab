# Temporary native observer16 proposal

Source remains frozen. This is a temporary diagnostic preload, not production code or a native gate result. Only this proposal is authored. Root owns execution and exact verified executable paths. No cluster, provider, VM or external action was performed while preparing it.

## Assessment and invocation

The prior ordinary run failed admission inside its coarse phase and bundle during issuer-seed, after CRD readiness passed. Neither establishes cause. This observer preserves original arguments, options, stdin writes, return objects, thrown errors, deadlines and concurrency. It records fixed checkpoint IDs, bounded stderr literal signature/overflow/unclassified booleans and completion metadata only. Matches are observations, not causal proof. No raw stderr, arguments, stack, input, key, certificate or assertion value is emitted or written. Unknown and overflow remain unclassified.

Root extracts the single javascript block below and injects it as `--import data:text/javascript;base64,<base64>`, using its existing four-file command/profile unchanged. Set `NATIVE_OBSERVER_KUBECTL` and `NATIVE_OBSERVER_KIND` to the already checksum-verified absolute pinned paths. These are comparison inputs only, never emitted. Capture stderr in the existing private run directory; select only JSON records whose observer field equals native16. Do not persist the preload's transient raw buffers. No callback, caller pattern or executable override is accepted. Review this block before execution. No validation has been executed pending independent review.

The observer sees at most65536 bytes per matching process stderr. Async capture adds a listener but never replaces/removes consumers; forwarding of stdin methods uses original receiver/arguments/return value. Capturing data adds bounded CPU/memory overhead and can affect timing, so a pass cannot be counted as an ordinary gate pass. The original stderr still reaches its existing private capture unchanged. Synchronous results are returned unchanged. Input is inspected only transiently for the exact bundle apply object metadata; Secret data is never copied into a retained record. Patch classification uses fixed issuer arguments, not private patch files. Assertions are wrapped only on failure; the same exception is rethrown. Source location is reduced to an explicit allowed numeric line and fixed method; arbitrary stacks/messages/values are never emitted.

## Executable preload

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
const predicates = (text, overflow) => {
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
  };

};
const completion = (tool, context, label, started, result, text, overflow) => emit({
  event: 'process-complete', tool, context, checkpoint: label,
  status: Number.isInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
  signal: signals.has(result.signal) ? result.signal : null,
  durationMs: Math.max(0, Math.round(now() - started)),
  ...predicates(text, overflow),
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

## Validation plan and limits

Before native execution, independently review the literal block and freeze its SHA256. A root-owned fast child harness should verify unchanged unrelated Node exit11/stderr, pinned kubectl version success, fixed unclassified output without retaining raw text. Include an actual private sentinel in subprocess stderr and assertion values; require it absent from observer JSON. Native source checkpoints must be checked against frozen admission line numbers before injection. No local source rewrite is necessary.

The observer uses no provider-cause classifier. Eight fixed literal substring booleans report signature observations only; provider category always remains unclassified. Overflow suppresses all match flags. These matches do not establish a cause. Root may correlate the precise failing checkpoint with a separately reviewed later observation. Synchronous observer output errors are suppressed; existing stderr destination ownership remains root responsibility. A reentrancy guard prevents double-observing writes internally forwarded by end. Unknown input remains unclassified. No patch file contents, discovery requests, retries or native fixture source changes are introduced. Independent review must assess interception and private-output behavior before any execution.
