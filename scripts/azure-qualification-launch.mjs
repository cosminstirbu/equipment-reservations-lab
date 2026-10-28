import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  lstatSync,
  realpathSync,
  mkdtempSync,
  cpSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import {
  resolve,
  dirname,
  relative,
  sep,
  extname,
  join,
  basename,
} from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, builtinModules } from 'node:module';
import { OperationalFailure } from './process.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const definitionPath = 'infra/azure/qualification-definition.json';
const fail = () => {
  throw Error(
    'Qualification launch or reviewed source definition is invalid; private details suppressed.',
  );
};
const installationFailure = (phase) =>
  new Error(
    `Qualification installation ${phase} validation failed; private details suppressed.`,
  );
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(value);
function git(root, args) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      `safe.directory=${root}`,
      '-C',
      root,
      ...args,
    ],
    {
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
      ),
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0) fail();
  return result.stdout;
}
function safePath(path) {
  if (
    typeof path !== 'string' ||
    !/^[a-zA-Z0-9_./-]+$/.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => part === '..' || part === '.' || part === '')
  )
    fail();
  return path;
}
function bytes(root, path, revision) {
  safePath(path);
  if (revision) {
    const mode = git(root, ['ls-tree', revision, '--', path]).split(' ')[0];
    if (mode !== '100644' && mode !== '100755') fail();
    return Buffer.from(git(root, ['show', `${revision}:${path}`]));
  }
  const absolute = resolve(root, path);
  if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute)
    fail();
  let parent = dirname(absolute);
  while (parent !== root) {
    if (lstatSync(parent).isSymbolicLink()) fail();
    parent = dirname(parent);
  }
  return readFileSync(absolute);
}
function runtime() {
  if (
    process.version !== 'v24.15.0' ||
    process.execArgv.length ||
    Object.keys(process.env).some(
      (key) => /^(NODE_OPTIONS|NODE_PATH)$/i.test(key) && process.env[key],
    )
  )
    fail();
}
function reviewed(root, revision) {
  const manifest = JSON.parse(bytes(root, definitionPath, revision));
  if (
    Object.keys(manifest).sort().join(',') !==
      'assets,data,entrypoints,externalPackages,modules,parser,version' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.modules) ||
    !Array.isArray(manifest.assets) ||
    canonical(manifest.entrypoints) !==
      canonical([
        'scripts/azure-qualification.mjs',
        'scripts/azure-infrastructure.mjs',
      ])
  )
    fail();
  for (const list of [manifest.modules, manifest.assets]) {
    if (canonical(list) !== canonical([...new Set(list)].sort())) fail();
    list.forEach(safePath);
  }
  if (manifest.modules.some((path) => !/\.(mjs|cjs|js)$/.test(path))) fail();
  return manifest;
}
function snapshot(root, revision, paths) {
  const tree = git(root, ['ls-tree', '-r', '--full-tree', revision]);
  const modes = new Map(
    tree
      .trim()
      .split('\n')
      .map((line) => {
        const tab = line.indexOf('\t');
        return [line.slice(tab + 1), line.slice(0, 6)];
      }),
  );
  const selected = [...new Set(paths)].sort();
  if (selected.some((path) => !['100644', '100755'].includes(modes.get(path))))
    fail();
  const result = spawnSync(
    'git',
    ['-c', `safe.directory=${root}`, '-C', root, 'cat-file', '--batch'],
    {
      input: selected.map((path) => `${revision}:${safePath(path)}\n`).join(''),
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
      ),
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0) fail();
  let cursor = 0;
  const files = new Map();
  for (const path of selected) {
    const end = result.stdout.indexOf(10, cursor);
    const header = result.stdout
      .subarray(cursor, end)
      .toString('ascii')
      .split(' ');
    const length = Number(header[2]);
    if (
      end < cursor ||
      header[1] !== 'blob' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      end + length + 1 >= result.stdout.length
    )
      fail();
    files.set(path, result.stdout.subarray(end + 1, end + 1 + length));
    cursor = end + length + 2;
  }
  if (cursor !== result.stdout.length) fail();
  return files;
}
export function qualificationSourceDefinition({
  root = repository,
  revision,
} = {}) {
  root = resolve(root);
  if (revision && !/^[a-f0-9]{40}$/.test(revision)) fail();
  try {
    const manifest = reviewed(root, revision);
    const current = reviewed(root);
    if (canonical(current) !== canonical(manifest)) fail();
    const scopes = [
      'scripts/',
      'deploy/',
      'infra/azure/',
      '.github/workflows/',
    ];
    const inventory = git(
      root,
      revision
        ? ['ls-tree', '-r', '--name-only', revision]
        : ['ls-files', '--cached', '--others', '--exclude-standard'],
    )
      .trim()
      .split('\n')
      .filter(
        (path) =>
          (manifest.modules.includes(path) ||
            scopes.some((scope) => path.startsWith(scope)) ||
            ['package.json', 'package-lock.json'].includes(path)) &&
          !path.endsWith('.test.mjs'),
      )
      .sort();
    const dataPaths = [
      ...manifest.data.release,
      ...manifest.data.installation,
      manifest.data.activation,
    ];
    if (dataPaths.some((path) => typeof path !== 'string')) fail();
    dataPaths.forEach(safePath);
    const presentData = dataPaths.filter((path) => inventory.includes(path));
    if (
      canonical(
        [
          ...new Set([...manifest.modules, ...manifest.assets, ...presentData]),
        ].sort(),
      ) !== canonical([...new Set(inventory)])
    )
      fail();
    const committed = revision
      ? snapshot(root, revision, [
          ...manifest.modules,
          ...manifest.assets,
          ...presentData,
        ])
      : undefined;
    const read = (path) =>
      committed ? (committed.get(path) ?? fail()) : bytes(root, path);
    const packageJson = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    if (
      packageJson.devDependencies.typescript !== '6.0.3' ||
      lock.packages['node_modules/typescript'].version !== '6.0.3' ||
      !/^sha512-/.test(lock.packages['node_modules/typescript'].integrity)
    )
      fail();
    const parserPath = resolve(
      repository,
      'node_modules/typescript/lib/typescript.js',
    );
    if (
      manifest.parser.version !== '6.0.3' ||
      digest(readFileSync(parserPath)) !== manifest.parser.sha256
    )
      fail();
    const parser = createRequire(import.meta.url)(parserPath);
    const seen = new Set();
    const visit = (path) => {
      if (seen.has(path)) return;
      seen.add(path);
      if (!manifest.modules.includes(path)) fail();
      const source = parser.createSourceFile(
        path,
        read(path).toString('utf8'),
        parser.ScriptTarget.Latest,
        true,
        parser.ScriptKind.JS,
      );
      if (source.parseDiagnostics.length) fail();
      const imported = (specifier) => {
        if (
          specifier.startsWith('node:') &&
          builtinModules.includes(specifier.slice(5))
        )
          return;
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          if (
            !manifest.externalPackages.includes(specifier) ||
            !packageJson.devDependencies[specifier] ||
            lock.packages['node_modules/' + specifier]?.version !==
              packageJson.devDependencies[specifier]
          )
            fail();
          return;
        }
        const target = relative(root, resolve(root, dirname(path), specifier))
          .split(sep)
          .join('/');
        safePath(target);
        if (!['.mjs', '.cjs', '.js'].includes(extname(target))) fail();
        visit(target);
      };
      const walk = (node) => {
        if (
          parser.isIdentifier(node) &&
          ['eval', 'Function', 'require', 'WebAssembly'].includes(node.text)
        )
          fail();
        if (
          parser.isPropertyAccessExpression(node) &&
          [
            'constructor',
            'dlopen',
            'getBuiltinModule',
            'register',
            'registerHooks',
          ].includes(node.name.text)
        )
          fail();
        if (
          parser.isImportDeclaration(node) ||
          parser.isExportDeclaration(node)
        ) {
          if (node.moduleSpecifier) {
            if (!parser.isStringLiteral(node.moduleSpecifier)) fail();
            if (
              node.moduleSpecifier.text === 'node:vm' ||
              (node.moduleSpecifier.text === 'node:module' &&
                path !== 'scripts/azure-qualification-launch.mjs')
            )
              fail();
            imported(node.moduleSpecifier.text);
          }
        }
        if (parser.isCallExpression(node) || parser.isNewExpression(node)) {
          const expression = node.expression.getText(source);
          if (expression === 'createRequire(import.meta.url)') {
            if (
              path !== 'scripts/azure-qualification-launch.mjs' ||
              node.arguments?.length !== 1
            )
              fail();
            if (
              parser.isStringLiteral(node.arguments[0]) &&
              node.arguments[0].text === './azure-qualification-data.mjs'
            )
              imported(node.arguments[0].text);
            else if (node.arguments[0].getText(source) !== 'parserPath') fail();
          }
          if (expression === 'import') {
            if (
              node.arguments?.length !== 1 ||
              !parser.isStringLiteral(node.arguments[0])
            )
              fail();
            imported(node.arguments[0].text);
          }
          if (
            /^(eval|Function|require|module\.require)$/.test(expression) ||
            /\.(register|registerHooks)$/.test(expression)
          )
            fail();
        }
        parser.forEachChild(node, walk);
      };
      walk(source);
    };
    manifest.entrypoints.forEach(visit);
    if (canonical([...seen].sort()) !== canonical(manifest.modules)) fail();
    const classifier = createRequire(import.meta.url)(
      './azure-qualification-data.mjs',
    );
    if (canonical(manifest.data) !== canonical(classifier.classificationPaths))
      fail();
    classifier.classifyReleaseFiles(
      Object.fromEntries(
        presentData
          .filter((path) => manifest.data.release.includes(path))
          .map((path) => [path, read(path).toString('utf8')]),
      ),
    );
    const records = (paths) =>
      paths.map((path) => ({
        path,
        sha256: digest(read(path)),
      }));
    const packages = Object.entries(lock.packages)
      .filter(([path]) => path)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, value]) => {
        if (!value.version || !value.integrity) fail();
        return { path, version: value.version, integrity: value.integrity };
      });
    const result = {
      version: 1,
      modules: records(manifest.modules),
      assets: records(manifest.assets),
      runtime: { node: '24.15.0', packages },
    };
    return { manifest: result, probeDefinitionHash: digest(canonical(result)) };
  } catch {
    fail();
  }
}
export async function validateQualificationLaunch({
  root = repository,
  trustedRevision = process.env.GITHUB_SHA,
} = {}) {
  runtime();
  root = resolve(root);
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    !/^[a-f0-9]{40}$/.test(trustedRevision ?? '') ||
    trustedRevision !== process.env.GITHUB_SHA
  )
    fail();
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  if (
    head !== trustedRevision ||
    git(root, ['status', '--porcelain', '--untracked-files=all']).trim()
  )
    fail();
  const definition = qualificationSourceDefinition({ root });
  const committed = qualificationSourceDefinition({ root, revision: head });
  if (canonical(definition) !== canonical(committed)) fail();
  return { actualProbeCodeRevision: head, definition };
}

async function installationFiles({ root, revision }) {
  const classifier = createRequire(import.meta.url)(
    './azure-qualification-data.mjs',
  );
  return Object.fromEntries(
    [...snapshot(root, revision, classifier.installationPaths)].map(
      ([path, content]) => [path, content.toString('utf8')],
    ),
  );
}
export async function qualificationReleaseContext({
  root = repository,
  revision,
  acrLoginServer,
}) {
  try {
    root = resolve(root);
    const launch = await validateQualificationLaunch({ root });
    if (
      (revision && revision !== launch.actualProbeCodeRevision) ||
      !/^[a-z0-9]{5,50}\.azurecr\.io$/.test(acrLoginServer ?? '')
    )
      fail();
    const classifier = createRequire(import.meta.url)(
      './azure-qualification-data.mjs',
    );
    const files = Object.fromEntries(
      [
        ...snapshot(
          root,
          launch.actualProbeCodeRevision,
          classifier.releasePaths,
        ),
      ].map(([path, content]) => [path, content.toString('utf8')]),
    );
    return classifier.classifyReleaseFiles(files, {
      acrLoginServer,
      requireAzure: true,
    });
  } catch {
    fail();
  }
}
export async function verifyQualificationReleaseContext({
  root = repository,
  revision,
  acrLoginServer,
  signal,
}) {
  const selected = await qualificationReleaseContext({
    root,
    revision,
    acrLoginServer,
  });
  const launch = await validateQualificationLaunch({ root });
  if (revision && revision !== launch.actualProbeCodeRevision) fail();
  const { verifyQualificationPublications } =
    await import('./azure-release-verification.mjs');
  const { releaseRepository } = createRequire(import.meta.url)(
    './azure-qualification-data.mjs',
  );
  return verifyQualificationPublications({
    publications: selected.publications,
    outputs: { acr_login_server: acrLoginServer },
    config: { githubRepository: releaseRepository.name },
    sourceRevision: launch.actualProbeCodeRevision,
    signal,
  });
}
async function validateInstallationTrees(root, sourceFiles, targetFiles) {
  const { validateAzureDeployment } = await import('./manifest-quality.mjs');
  const { createPrivateDirectory } = await import('./local-platform.mjs');
  const directory = mkdtempSync(
    join(tmpdir(), 'equipment-qualification-trees-'),
  );
  createPrivateDirectory(directory);
  try {
    for (const [phase, files] of [
      ['source', sourceFiles],
      ['target', targetFiles],
    ]) {
      const staged = join(directory, phase);
      mkdirSync(staged);
      cpSync(join(root, 'deploy'), join(staged, 'deploy'), { recursive: true });
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(staged, path)), { recursive: true });
        writeFileSync(join(staged, path), content);
      }
      const result = await validateAzureDeployment({ root: staged });
      if (result.status !== 'configured' || result.pending.length) fail();
    }
  } finally {
    const actual = realpathSync(directory);
    if (
      dirname(actual) !== realpathSync(tmpdir()) ||
      !basename(actual).startsWith('equipment-qualification-trees-')
    )
      fail();
    rmSync(actual, { recursive: true, force: true });
  }
}
export async function qualificationInstallationContext({
  root = repository,
  revision,
  input,
  acrLoginServer,
}) {
  let phase = 'launch';
  try {
    root = resolve(root);
    const launch = await validateQualificationLaunch({ root });
    if (revision && revision !== launch.actualProbeCodeRevision) fail();
    await qualificationReleaseContext({
      root,
      revision: launch.actualProbeCodeRevision,
      acrLoginServer: acrLoginServer ?? input?.environment?.acr_login_server,
    });
    phase = 'git-inputs';
    const files = await installationFiles({
      root,
      revision: launch.actualProbeCodeRevision,
    });
    const { buildQualificationInstallation } = createRequire(import.meta.url)(
      './azure-qualification-data.mjs',
    );
    phase = 'generator';
    const result = await buildQualificationInstallation({ files, input });
    phase = 'rendered-trees';
    await validateInstallationTrees(root, files, result.targetFiles);
    return result;
  } catch (error) {
    if (error instanceof OperationalFailure) throw error;
    throw installationFailure(phase);
  }
}
export async function validateQualificationInstallationContext({
  root = repository,
  revision,
  input,
  acrLoginServer,
  binding,
  phase,
}) {
  try {
    root = resolve(root);
    const launch = await validateQualificationLaunch({ root });
    if (revision && revision !== launch.actualProbeCodeRevision) fail();
    await qualificationReleaseContext({
      root,
      revision: launch.actualProbeCodeRevision,
      acrLoginServer: acrLoginServer ?? input?.environment?.acr_login_server,
    });
    const files = await installationFiles({
      root,
      revision: launch.actualProbeCodeRevision,
    });
    const { validateQualificationInstallation } = createRequire(
      import.meta.url,
    )('./azure-qualification-data.mjs');
    await validateQualificationInstallation({ files, input, binding, phase });
    await validateInstallationTrees(root, files, files);
    return binding;
  } catch {
    fail();
  }
}
async function launchMain() {
  try {
    const mode = process.argv[2];
    if (!['verify', 'prove', 'bootstrap'].includes(mode)) fail();
    await validateQualificationLaunch();
    if (mode === 'verify') console.log('Qualification launch verified.');
    else if (mode === 'prove') {
      process.argv = [
        process.execPath,
        resolve(repository, 'scripts/azure-qualification.mjs'),
        'prove',
        ...process.argv.slice(3),
      ];
      await import('./azure-qualification.mjs');
    } else {
      process.argv = [
        process.execPath,
        resolve(repository, 'scripts/azure-infrastructure.mjs'),
        'bootstrap',
        ...process.argv.slice(3),
      ];
      await import('./azure-infrastructure.mjs');
    }
  } catch {
    console.error(
      'Qualification launch validation failed; private details suppressed.',
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  launchMain().catch(() => {
    process.exitCode = 1;
  });
}
