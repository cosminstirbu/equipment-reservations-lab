import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  executeProcess,
  OperationalFailure,
  ProcessFailure,
  safeFailure,
  processFailure,
} from './process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => {
  throw new OperationalFailure(message);
};
export const fileHash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export function policyTreeHash(directory) {
  const entries = [];
  const walk = (path) => {
    if (lstatSync(path).isSymbolicLink())
      fail('Security policy contains a forbidden symbolic link.');
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isSymbolicLink())
        fail('Security policy contains a forbidden symbolic link.');
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile())
        entries.push(
          `${relative(directory, target).replaceAll('\\', '/')}\0${fileHash(target)}`,
        );
      else fail('Security policy contains an unsupported entry.');
    }
  };
  walk(directory);
  return createHash('sha256').update(entries.sort().join('\n')).digest('hex');
}

export function qualityContext({
  toolsDirectory = resolve(root, '.cache/azure-toolchain'),
  policyDirectory = resolve(toolsDirectory, 'trivy-pinned-cache'),
} = {}) {
  const lock = JSON.parse(
    readFileSync(resolve(root, 'infra/azure/tools.lock.json'), 'utf8'),
  );
  const architecture =
    process.platform === 'win32' && process.arch === 'arm64'
      ? 'x64'
      : process.arch;
  const platform = `${process.platform}-${architecture}`;
  if (!['win32-x64', 'linux-x64'].includes(platform))
    fail('Unsupported quality tool platform.');
  return {
    lock,
    platform,
    toolsDirectory: resolve(toolsDirectory),
    policyDirectory: resolve(policyDirectory),
  };
}

export function verifiedTool(context, name) {
  const pin = context.lock.tools[name]?.platforms[context.platform];
  if (!pin) fail('Pinned quality tool prerequisite is missing.');
  const path = resolve(context.toolsDirectory, pin.path);
  if (
    !existsSync(path) ||
    lstatSync(path).isSymbolicLink() ||
    fileHash(path) !== pin.executableSha256
  )
    fail(`Pinned ${name} tool prerequisite or checksum is invalid.`);
  return path;
}

export function verifyPolicy(context) {
  try {
    const metadata = JSON.parse(
      readFileSync(
        join(context.policyDirectory, 'policy/metadata.json'),
        'utf8',
      ),
    );
    if (
      metadata.Digest !== context.lock.policy.digest ||
      policyTreeHash(join(context.policyDirectory, 'policy/content')) !==
        context.lock.policy.contentSha256
    )
      fail('Security policy digest or content integrity mismatch.');
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Pinned security policy prerequisite is missing or invalid.',
      ),
    );
  }
}

export function verifiedSchemas(context = qualityContext()) {
  const pin = context.lock.schemas;
  if (
    !pin ||
    !/^[a-f0-9]{40}$/.test(pin.revision) ||
    pin.directory !== 'kubernetes-schemas' ||
    !Array.isArray(pin.files) ||
    !pin.files.length
  )
    fail('Pinned Kubernetes schema manifest is invalid.');
  const directory = resolve(context.toolsDirectory, pin.directory);
  const expected = new Set();
  for (const file of pin.files) {
    if (
      !/^(?:inputs\/)?[a-zA-Z0-9_.-]+\.(json|yaml)$/.test(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      fail('Pinned Kubernetes schema entry is invalid.');
    const path = resolve(directory, file.path);
    if (
      !existsSync(path) ||
      lstatSync(path).isSymbolicLink() ||
      fileHash(path) !== file.sha256
    )
      fail('Pinned Kubernetes schema prerequisite or checksum is invalid.');
    expected.add(file.path);
  }
  const inspect = (path) => {
    if (lstatSync(path).isSymbolicLink())
      fail('Kubernetes schema cache contains a symbolic link.');
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) inspect(target);
      else if (
        !entry.isFile() ||
        !expected.has(relative(directory, target).replaceAll('\\', '/'))
      )
        fail('Kubernetes schema cache contains unpinned input.');
    }
  };
  inspect(directory);
  return { directory, files: pin.files };
}

export async function prepareTools(context = qualityContext()) {
  mkdirSync(context.toolsDirectory, { recursive: true });
  const downloadsDirectory = resolve(context.toolsDirectory, 'downloads');
  mkdirSync(downloadsDirectory, { recursive: true });
  for (const name of [
    'terraform',
    'tflint',
    'azurerm',
    'trivy',
    'kubectl',
    'kubelogin',
    'kubeconform',
    'kind',
  ]) {
    const pin = context.lock.tools[name].platforms[context.platform];
    const destination = resolve(context.toolsDirectory, pin.path);
    if (
      existsSync(destination) &&
      fileHash(destination) === pin.executableSha256
    )
      continue;
    const archive = resolve(
      downloadsDirectory,
      new URL(pin.url).pathname.split('/').at(-1),
    );
    if (!existsSync(archive) || fileHash(archive) !== pin.archiveSha256) {
      let response;
      try {
        response = await globalThis.fetch(pin.url, {
          signal: globalThis.AbortSignal.timeout(120000),
        });
      } catch {
        fail('Pinned tool download failed; transport details suppressed.');
      }
      if (!response.ok)
        fail(`Pinned tool download failed; HTTP status ${response.status}.`);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 150 * 1024 * 1024)
          fail('Pinned tool download exceeded size limit.');
        chunks.push(chunk);
      }
      writeFileSync(archive, Buffer.concat(chunks));
    }
    if (fileHash(archive) !== pin.archiveSha256)
      fail('Pinned tool archive checksum mismatch.');
    mkdirSync(dirname(destination), { recursive: true });
    if (name === 'kubectl' || name === 'kind') {
      writeFileSync(destination, readFileSync(archive), { mode: 0o755 });
      verifiedTool(context, name);
      continue;
    }
    const extractDirectory = pin.extractDirectory
      ? resolve(context.toolsDirectory, pin.extractDirectory)
      : dirname(destination);
    mkdirSync(extractDirectory, { recursive: true });
    const linuxZip =
      context.platform === 'linux-x64' && archive.endsWith('.zip');
    let extractor = process.platform === 'win32' ? 'tar.exe' : 'tar';
    if (linuxZip) extractor = 'unzip';
    executeProcess(
      extractor,
      linuxZip
        ? ['-o', archive, '-d', extractDirectory]
        : ['-xf', archive, '-C', extractDirectory],
      {
        operation: 'Verified tool extraction',
        tool: linuxZip ? 'unzip' : 'tar',
        output: 'private-capture',
        timeout: 120000,
      },
    );
    verifiedTool(context, name);
  }
  const fixture = resolve(context.toolsDirectory, 'empty-policy-scan');
  mkdirSync(fixture, { recursive: true });
  run(
    context,
    'trivy',
    [
      'config',
      '--cache-dir',
      context.policyDirectory,
      '--checks-bundle-repository',
      context.lock.policy.repository,
      '--skip-version-check',
      '--disable-telemetry',
      '--format',
      'json',
      fixture,
    ],
    'Immutable security policy preparation',
  );
  verifyPolicy(context);
  for (const file of context.lock.schemas.files) {
    const destination = resolve(
      context.toolsDirectory,
      context.lock.schemas.directory,
      file.path,
    );
    if (
      existsSync(destination) &&
      !lstatSync(destination).isSymbolicLink() &&
      fileHash(destination) === file.sha256
    )
      continue;
    if (
      !/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//.test(
        file.url,
      )
    )
      fail('Schema download must use a pinned official source revision.');
    let response;
    try {
      response = await globalThis.fetch(file.url, {
        signal: globalThis.AbortSignal.timeout(30000),
        redirect: 'error',
      });
    } catch {
      fail('Pinned schema download failed; transport details suppressed.');
    }
    if (!response.ok)
      fail(`Pinned schema download failed; HTTP status ${response.status}.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024)
        fail('Pinned schema download exceeded size budget.');
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (createHash('sha256').update(data).digest('hex') !== file.sha256)
      fail('Pinned schema download checksum mismatch.');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, data);
  }
  verifiedSchemas(context);
}

function run(context, name, args, operation, options = {}) {
  const executable = verifiedTool(context, name);
  return executeProcess(executable, args, {
    operation,
    tool: name,
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
    output: 'private-capture',
    ...options,
    env: controlledTerraformEnvironment(options.env, context),
  });
}

export const controlledTerraformCli =
  'disable_checkpoint = true\nprovider_installation {\n  direct {}\n}\n';

export function controlledTerraformEnvironment(
  source = process.env,
  context = qualityContext(),
) {
  const environment = cleanEnvironment(source);
  mkdirSync(context.toolsDirectory, { recursive: true });
  const path = resolve(context.toolsDirectory, 'controlled-terraform.tfrc');
  if (existsSync(path)) {
    if (
      lstatSync(path).isSymbolicLink() ||
      readFileSync(path, 'utf8') !== controlledTerraformCli
    )
      fail('Controlled Terraform CLI configuration integrity is invalid.');
  } else writeFileSync(path, controlledTerraformCli, { flag: 'wx' });
  return { ...environment, TF_CLI_CONFIG_FILE: path, TF_IN_AUTOMATION: 'true' };
}

export function cleanEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !/^(TRIVY_|TF_|TFLINT_)/i.test(key),
    ),
  );
}

export function filterPolicyFindings(tool, findings, directory) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'infra/azure/policy-exceptions.json'), 'utf8'),
  );
  if (
    manifest.version !== 1 ||
    manifest.approval?.approver !== 'Human environment owner' ||
    manifest.approval?.date !== '2026-10-26' ||
    !Array.isArray(manifest.exceptions) ||
    manifest.exceptions.some(
      (entry) =>
        Object.keys(entry).sort().join(',') !==
          'rationale,resource,root,rule,tool' ||
        !['trivy', 'tflint'].includes(entry.tool) ||
        !/^infra\/azure\/(foundation|environment)$/.test(entry.root) ||
        !/^[a-z0-9_]+\.[a-zA-Z0-9_]+$/.test(entry.resource) ||
        typeof entry.rationale !== 'string' ||
        entry.rationale.length < 10 ||
        (entry.tool === 'trivy'
          ? !/^AVD-AZU-\d{4}$/.test(entry.rule)
          : !/^azurerm_[a-z_]+$/.test(entry.rule)),
    )
  )
    fail('Scoped policy exception manifest is invalid.');
  const selected = relative(root, resolve(directory)).replaceAll('\\', '/');
  return findings.filter(
    (finding) =>
      !manifest.exceptions.some(
        (entry) =>
          entry.tool === tool &&
          entry.root === selected &&
          entry.rule === finding.rule &&
          entry.resource === finding.resource,
      ),
  );
}

export function assertSecurityReport(raw, directory) {
  let result;
  try {
    result = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    fail('Security scanner returned invalid JSON.');
  }
  if (result?.SchemaVersion !== 2 || !Array.isArray(result.Results))
    fail('Security scanner report schema is invalid.');
  const findings = result.Results.flatMap(
    (entry) => entry.Misconfigurations ?? [],
  )
    .filter((entry) => entry.Status !== 'PASS')
    .map((entry) => ({
      rule:
        typeof entry.ID === 'string' && entry.ID.startsWith('AVD-')
          ? entry.ID
          : `AVD-${entry.ID}`,
      resource: entry.CauseMetadata?.Resource,
    }));
  const blocking = filterPolicyFindings('trivy', findings, directory);
  if (blocking.length) {
    const ids = [
      ...new Set(
        blocking
          .map((entry) => entry.rule)
          .filter((id) => /^AVD-[A-Z0-9-]{1,39}$/.test(id)),
      ),
    ].sort();
    fail(
      `Security findings block: count=${blocking.length}; rules=${ids.join(',')}.`,
    );
  }
  return { accepted: findings.length };
}

function lintDirectory(context, directory) {
  const result = spawnSync(
    verifiedTool(context, 'tflint'),
    [
      '--config',
      resolve(root, 'infra/azure/.tflint.hcl'),
      '--format',
      'json',
      '--chdir',
      directory,
    ],
    {
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...cleanEnvironment(),
        TFLINT_PLUGIN_DIR: resolve(context.toolsDirectory, 'plugins'),
      },
    },
  );
  if (result.error || ![0, 2].includes(result.status))
    throw processFailure(result.error ?? result, {
      operation: 'TFLint Azure rules',
      tool: 'tflint',
      output: 'private-capture',
    });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail('TFLint returned invalid JSON.');
  }
  if (
    !Array.isArray(report.issues) ||
    !Array.isArray(report.errors) ||
    report.errors.length
  )
    fail('TFLint scanner reported an error.');
  const findings = report.issues.map((issue) => {
    const filename = issue.range?.filename;
    const line = issue.range?.start?.line;
    let resource;
    if (typeof filename === 'string' && Number.isInteger(line) && line > 0) {
      const candidates = [
        resolve(root, filename),
        resolve(directory, filename),
      ];
      const path = candidates.find(
        (candidate) =>
          !relative(directory, candidate).startsWith('..') &&
          existsSync(candidate) &&
          !lstatSync(candidate).isSymbolicLink(),
      );
      if (path) {
        const text = readFileSync(path, 'utf8').split(/\r?\n/)[line - 1];
        const match =
          /^resource\s+"([a-z0-9_]+)"\s+"([a-zA-Z0-9_]+)"\s*\{/.exec(
            text ?? '',
          );
        if (match) resource = `${match[1]}.${match[2]}`;
      }
    }
    return { rule: issue.rule?.name, resource };
  });
  if (filterPolicyFindings('tflint', findings, directory).length)
    fail('TFLint findings block; unapproved rule/resource scope.');
}

function rejectUnapprovedSuppressions(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.terraform', '.git'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      fail('Terraform source symbolic links require explicit review.');
    if (entry.isDirectory()) rejectUnapprovedSuppressions(path);
    else if (
      /\.(tf|tfvars|hcl|json)$/.test(entry.name) &&
      /(?:trivy|tfsec):ignore|checkov:skip/i.test(readFileSync(path, 'utf8'))
    )
      fail('Unapproved inline security suppression blocks the quality gate.');
  }
}

function scan(context, args) {
  const started = performance.now();
  const result = spawnSync(verifiedTool(context, 'trivy'), args, {
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: cleanEnvironment(),
  });
  if (result.error || result.status !== 0)
    throw processFailure(result.error ?? result, {
      operation: 'Trivy immutable security scan',
      tool: 'trivy',
      durationMs: performance.now() - started,
      output: 'private-capture',
    });
  if (
    /\b(ERROR|FATAL)\b/.test(result.stderr) ||
    /failed to parse|parse error|unable to parse/i.test(result.stderr)
  )
    fail(
      'Security scanner reported an error; private source diagnostics suppressed.',
    );
  return result.stdout;
}

export function checkDirectory(command, directory, context = qualityContext()) {
  const path = resolve(directory);
  if (!existsSync(path) || !lstatSync(path).isDirectory())
    fail('Terraform root prerequisite is missing.');
  if (command === 'check') {
    for (const phase of ['fmt-check', 'validate', 'lint', 'security'])
      checkDirectory(phase, path, context);
    return;
  }
  if (['format', 'fmt-check'].includes(command)) {
    run(
      context,
      'terraform',
      [
        'fmt',
        ...(command === 'fmt-check' ? ['-check'] : []),
        '-recursive',
        path,
      ],
      'Terraform formatting',
    );
  } else if (command === 'validate') {
    const args = ['init', '-backend=false', '-input=false', '-no-color'];
    if (existsSync(join(path, '.terraform.lock.hcl')))
      args.push('-lockfile=readonly');
    run(context, 'terraform', args, 'Terraform initialization', { cwd: path });
    const raw = run(
      context,
      'terraform',
      ['validate', '-json'],
      'Terraform validation',
      { cwd: path },
    );
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      fail('Terraform validation returned invalid JSON.');
    }
    if (
      result.valid !== true ||
      result.error_count !== 0 ||
      result.warning_count !== 0
    )
      fail('Terraform validation failed.');
  } else if (command === 'test') {
    checkDirectory('validate', path, context);
    const raw = run(
      context,
      'terraform',
      ['test', '-json', '-no-color'],
      'Terraform native contracts',
      { cwd: path },
    );
    let messages;
    try {
      messages = raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      fail('Terraform native contract report is invalid.');
    }
    const summary = messages.findLast(
      (entry) => entry.type === 'test_summary',
    )?.test_summary;
    if (
      !summary ||
      summary.status !== 'pass' ||
      !Number.isSafeInteger(summary.passed) ||
      summary.passed < 1 ||
      summary.failed !== 0 ||
      summary.errored !== 0 ||
      summary.skipped !== 0 ||
      messages.some((entry) => entry['@level'] === 'error')
    )
      fail('Terraform native contracts failed or did not run completely.');
    console.log(`${summary.passed} native Terraform contracts passed.`);
  } else if (command === 'lint') {
    verifiedTool(context, 'azurerm');
    lintDirectory(context, path);
  } else if (command === 'security') {
    rejectUnapprovedSuppressions(path);
    verifiedTool(context, 'trivy');
    verifyPolicy(context);
    let raw;
    try {
      raw = scan(context, [
        'config',
        '--config',
        resolve(root, 'infra/azure/trivy.yaml'),
        '--cache-dir',
        context.policyDirectory,
        '--skip-check-update',
        '--checks-bundle-repository',
        context.lock.policy.repository,
        '--skip-version-check',
        '--disable-telemetry',
        '--format',
        'json',
        '--exit-code',
        '0',
        '--ignorefile',
        '',
        ...(path === resolve(root, 'infra/azure/foundation')
          ? [
              '--tf-vars',
              resolve(root, 'infra/azure/examples/source-scan.tfvars'),
            ]
          : []),
        path,
      ]);
    } catch (error) {
      throw new OperationalFailure(
        safeFailure(
          error,
          'Security scanner failed; private details suppressed.',
        ),
      );
    }
    verifyPolicy(context);
    assertSecurityReport(raw, path);
  } else fail('Unknown quality command.');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = {
      '--directory': 'directory',
      '--tools-directory': 'toolsDirectory',
      '--policy-directory': 'policyDirectory',
    }[args[index]];
    if (!key || !args[index + 1] || options[key])
      fail('Invalid quality command arguments.');
    options[key] = args[index + 1];
  }
  const context = qualityContext(options);
  if (command === 'prepare') {
    await prepareTools(context);
    console.log('Pinned Azure quality tools and policy verified.');
    return;
  }
  const directories = options.directory
    ? [options.directory]
    : ['infra/azure/foundation', 'infra/azure/environment'].map((path) =>
        resolve(root, path),
      );
  for (const directory of directories)
    checkDirectory(command, directory, context);
  console.log('Azure quality checks passed.');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof ProcessFailure
        ? error.message
        : safeFailure(
            error,
            'Quality tool operation failed; private details suppressed.',
          ),
    );
    process.exitCode = 1;
  });
}
