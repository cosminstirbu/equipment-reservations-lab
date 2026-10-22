import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';

const signals = new Set([
  'SIGABRT',
  'SIGALRM',
  'SIGBUS',
  'SIGFPE',
  'SIGHUP',
  'SIGILL',
  'SIGINT',
  'SIGKILL',
  'SIGPIPE',
  'SIGQUIT',
  'SIGSEGV',
  'SIGTERM',
  'SIGUSR1',
  'SIGUSR2',
  'SIGTRAP',
]);
const label = (value, fallback) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9 ._/-]{0,119}$/.test(value)
    ? value
    : fallback;

export class OperationalFailure extends Error {}

export class ProcessFailure extends OperationalFailure {
  constructor(details) {
    const metadata = `${details.operation} (${details.tool}) failed: ${details.category}; status=${details.status ?? 'unavailable'}; signal=${details.signal ?? 'unavailable'}; duration=${details.durationMs}ms`;
    const tails = ['stdout', 'stderr']
      .filter((stream) => details[stream] !== undefined)
      .map(
        (stream) =>
          `\n${stream}${details[`${stream}Truncated`] ? ' (truncated)' : ''}:\n${details[stream]}`,
      );
    super(metadata + tails.join(''));
    this.name = 'ProcessFailure';
    this.details = Object.freeze(details);
  }
}

export function processFailure(
  error,
  { operation, tool, durationMs = 0, output = 'private-capture' } = {},
) {
  if (error instanceof ProcessFailure) return error;
  const status =
    Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255
      ? error.status
      : undefined;
  const signal = signals.has(error?.signal) ? error.signal : undefined;
  let category = 'unknown';
  if (error?.code === 'ETIMEDOUT') category = 'timeout';
  else if (
    error?.code === 'ENOBUFS' ||
    error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
  )
    category = 'output-limit';
  else if (['ENOENT', 'EACCES', 'ENOEXEC', 'EPERM'].includes(error?.code))
    category = 'spawn';
  else if (signal) category = 'termination';
  else if (status !== undefined && status !== 0) category = 'exit';
  const details = {
    operation: label(operation, 'process operation'),
    tool: label(tool, 'tool'),
    category,
    status,
    signal,
    durationMs:
      Number.isFinite(durationMs) && durationMs >= 0
        ? Math.round(durationMs)
        : 0,
  };
  if (output === 'public-capture') {
    for (const stream of ['stdout', 'stderr']) {
      let value = '';
      if (typeof error?.[stream] === 'string') value = error[stream];
      else if (error?.[stream] instanceof Uint8Array)
        value = new TextDecoder().decode(error[stream]);
      details[stream] = value.slice(-4000);
      details[`${stream}Truncated`] = value.length > 4000;
    }
  }
  return new ProcessFailure(details);
}

export function executeProcess(command, args, settings = {}) {
  const { operation, tool, output = 'private-capture', ...options } = settings;
  const started = performance.now();
  try {
    const result = execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
      killSignal: 'SIGKILL',
      ...options,
      stdio:
        output === 'stream'
          ? [
              options.input === undefined ? 'inherit' : 'pipe',
              'inherit',
              'inherit',
            ]
          : ['pipe', 'pipe', 'pipe'],
    });
    return result ?? '';
  } catch (error) {
    throw processFailure(error, {
      operation,
      tool,
      output,
      durationMs: performance.now() - started,
    });
  }
}

export async function cleanupAll(
  operations,
  { primary, report = console.error } = {},
) {
  const failures = [];
  for (const operation of operations) {
    try {
      await operation.run();
    } catch (error) {
      const failure =
        error instanceof OperationalFailure
          ? error
          : processFailure(error, {
              operation: operation.operation,
              tool: operation.tool,
            });
      failures.push(failure);
      report(`Cleanup failure: ${failure.message}`);
    }
  }
  if (primary) throw primary;
  if (failures.length)
    throw new OperationalFailure(
      `${failures.length} cleanup operation(s) failed.`,
    );
}

export function cleanupAllSync(
  operations,
  { primary, report = console.error } = {},
) {
  let failed = 0;
  for (const operation of operations) {
    try {
      operation.run();
    } catch (error) {
      failed++;
      const failure =
        error instanceof OperationalFailure
          ? error
          : processFailure(error, {
              operation: operation.operation,
              tool: operation.tool,
            });
      report(`Cleanup failure: ${failure.message}`);
    }
  }
  if (primary) throw primary;
  if (failed)
    throw new OperationalFailure(`${failed} cleanup operation(s) failed.`);
}

export function safeFailure(error, fallback) {
  return error instanceof OperationalFailure ? error.message : fallback;
}
