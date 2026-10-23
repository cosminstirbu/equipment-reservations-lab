import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import ts from 'typescript';
import { createPrivateDirectory } from './local-platform.mjs';
import { cleanupAllSync } from './process.mjs';

const rawPath = '.cache/application-reporting/raw';
const publicPath = 'test-results/application';
const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: false,
  processEntities: true,
});
const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressBooleanAttributes: false,
});
function array(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
const failureNote =
  'Test failed. Inspect the live quality job log for diagnostic details; private assertion/output payloads are not published.';

function files(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink())
      throw new Error('Reporting refuses symbolic links');
    if (
      ['node_modules', 'bin', 'obj', 'AppHost', 'coverage'].includes(entry.name)
    )
      return [];
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });
}

function owned(root, path) {
  const base = realpathSync(root);
  const result = resolve(base, path);
  const name = relative(base, result);
  if (!name || name.startsWith('..') || isAbsolute(name))
    throw new Error('Reporting path must stay inside its workspace');
  let current = result;
  while (current !== base) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error('Reporting refuses symbolic links');
    current = dirname(current);
  }
  return result;
}

function readXml(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024)
    throw new Error('Invalid report file');
  const xml = readFileSync(path, 'utf8').replace(
    '<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">',
    '',
  );
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('Invalid report XML');
  return parser.parse(xml);
}

function save(root, path, value) {
  const target = owned(root, `${publicPath}/${path}`);
  mkdirSync(dirname(target), { recursive: true });
  const xml = builder.build(value);
  if (XMLValidator.validate(xml) !== true)
    throw new Error('Invalid projected report XML');
  writeFileSync(target, xml);
}

function number(value, integer = false) {
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    result < 0 ||
    (integer && !Number.isInteger(result))
  )
    throw new Error('Invalid numeric report measurement');
  return result;
}

export function clearReports(root) {
  for (const path of [rawPath, publicPath])
    rmSync(owned(root, path), { recursive: true, force: true });
}

export function prepareReports(root) {
  clearReports(root);
  createPrivateDirectory(owned(root, rawPath));
  for (const suite of ['backend', 'frontend'])
    mkdirSync(owned(root, `${rawPath}/${suite}`), { mode: 0o700 });
}

export function runApplicationSuites(suites) {
  const failures = [];
  for (const suite of suites) {
    try {
      suite();
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

function junit(name, cases) {
  if (!cases.length) throw new Error('No application test cases were reported');
  return {
    testsuites: {
      '@_time': cases.reduce((total, entry) => total + entry['@_time'], 0),
      testsuite: {
        '@_name': name,
        '@_time': cases.reduce((total, entry) => total + entry['@_time'], 0),
        '@_tests': cases.length,
        '@_failures': cases.filter((entry) => entry.failure).length,
        '@_errors': 0,
        '@_skipped': cases.filter((entry) => entry.skipped !== undefined)
          .length,
        testcase: cases,
      },
    },
  };
}

function backendResults(root, paths) {
  const projects = readdirSync(resolve(root, 'tests')).filter(
    (name) =>
      name.endsWith('.Tests') &&
      existsSync(resolve(root, 'tests', name, `${name}.csproj`)),
  );
  const methods = new Map(
    projects.map((project) => [
      project,
      files(resolve(root, 'tests', project))
        .filter((path) => path.endsWith('.cs'))
        .map((path) => readFileSync(path, 'utf8'))
        .join('\n'),
    ]),
  );
  const seen = new Set();
  const cases = [];
  for (const path of paths.filter((path) => path.endsWith('.trx'))) {
    const run = readXml(path).TestRun;
    const definitions = new Map(
      array(run?.TestDefinitions?.UnitTest).map((test) => [
        test['@_id'],
        test.TestMethod,
      ]),
    );
    for (const result of array(run?.Results?.UnitTestResult)) {
      const method = definitions.get(result['@_testId']);
      const className = method?.['@_className']?.split(',')[0];
      const methodName = method?.['@_name'];
      const project = projects.find((name) =>
        className?.startsWith(`${name}.`),
      );
      if (
        !project ||
        !/^[\w.]+$/.test(className) ||
        !/^\w+$/.test(methodName) ||
        !methods.get(project).includes(`${methodName}(`) ||
        className !== `${project}.${className.split('.').at(-1)}` ||
        !new RegExp(`\\bclass\\s+${className.split('.').at(-1)}\\b`).test(
          methods.get(project),
        )
      )
        throw new Error('Test identity is not backed by source');
      const outcome = result['@_outcome'];
      if (!['Passed', 'Failed', 'NotExecuted'].includes(outcome))
        throw new Error('Unsupported test outcome');
      seen.add(project);
      const duration = String(result['@_duration'] ?? '00:00:00').split(':');
      if (duration.length !== 3) throw new Error('Invalid test duration');
      const seconds =
        number(duration[0]) * 3600 +
        number(duration[1]) * 60 +
        number(duration[2]);
      cases.push({
        '@_classname': className,
        '@_name': `${methodName} (case ${cases.length + 1})`,
        '@_time': seconds,
        ...(outcome === 'Failed'
          ? { failure: { '@_message': failureNote } }
          : {}),
        ...(outcome === 'NotExecuted' ? { skipped: '' } : {}),
      });
    }
  }
  save(root, 'backend.xml', junit('Backend application tests', cases));
  if (seen.size !== projects.length)
    throw new Error('A backend test module report is missing');
}

function frontendResults(root) {
  const report = readXml(owned(root, `${rawPath}/frontend/results.xml`));
  const cases = [];
  const expected = files(resolve(root, 'src/Web/src')).filter((file) =>
    file.endsWith('.spec.ts'),
  );
  const seen = new Set();
  for (const suite of array(report.testsuites?.testsuite)) {
    for (const entry of array(suite.testcase)) {
      const file = `src/Web/${entry['@_classname']}`;
      if (!/^src\/Web\/src\/[\w./-]+\.spec\.ts$/.test(file))
        throw new Error('Invalid frontend test source');
      const source = ts.createSourceFile(
        file,
        readFileSync(owned(root, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      seen.add(owned(root, file));
      const titles = new Set();
      const visit = (node) => {
        if (!ts.isCallExpression(node)) {
          ts.forEachChild(node, visit);
          return;
        }
        let expression = node.expression;
        if (ts.isCallExpression(expression)) expression = expression.expression;
        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === 'each'
        )
          expression = expression.expression;
        if (
          ts.isIdentifier(expression) &&
          ['describe', 'it', 'test'].includes(expression.text) &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        )
          titles.add(node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(source);
      const runtimeName = String(entry['@_name']).split(' > ').at(-1);
      const name = [...titles].find(
        (title) =>
          title === runtimeName ||
          new RegExp(
            '^' +
              title
                .split(/%[sdifjo#]/)
                .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('[\\s\\S]*') +
              '$',
          ).test(runtimeName),
      );
      if (!name)
        throw new Error(
          'Frontend test identity is not backed by a literal source declaration',
        );
      cases.push({
        '@_classname': file,
        '@_name': name,
        '@_time': number(entry['@_time'] ?? 0),
        ...(entry.failure !== undefined || entry.error !== undefined
          ? { failure: { '@_message': failureNote } }
          : {}),
        ...(entry.skipped !== undefined ? { skipped: '' } : {}),
      });
    }
  }
  save(root, 'frontend.xml', junit('Frontend application tests', cases));
  if (seen.size !== expected.length)
    throw new Error('A frontend test file report is missing');
}

function coverageReport(root, path, suite) {
  const input = readXml(path).coverage;
  const classes = [];
  const sourceFiles = new Set(
    files(resolve(root, suite === 'backend' ? 'src' : 'src/Web/src'))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .filter((file) =>
        suite === 'backend'
          ? file.endsWith('.cs')
          : file.endsWith('.ts') &&
            !file.endsWith('.spec.ts') &&
            !file.endsWith('-test-fixture.ts') &&
            file !== 'src/Web/src/test-setup.ts',
      ),
  );
  for (const pkg of array(input?.packages?.package)) {
    for (const entry of array(pkg.classes?.class)) {
      const raw = String(entry['@_filename']).replaceAll('\\', '/');
      let filename = raw.startsWith('src/')
        ? raw
        : relative(root, raw).replaceAll('\\', '/');
      if (suite === 'frontend' && !filename.startsWith('src/Web/'))
        filename = `src/Web/${raw}`;
      if (!sourceFiles.has(filename)) continue;
      const lines = array(entry.lines?.line).map((line) => {
        const condition = String(line['@_condition-coverage'] ?? '');
        if (condition && !/^\d+(?:\.\d+)?% \(\d+\/\d+\)$/.test(condition))
          throw new Error('Invalid branch measurement');
        return {
          '@_number': number(line['@_number'], true),
          '@_hits': number(line['@_hits'], true),
          ...(condition
            ? { '@_branch': 'true', '@_condition-coverage': condition }
            : {}),
        };
      });
      if (lines.length)
        classes.push({
          '@_name': filename,
          '@_filename': filename,
          methods: '',
          lines: { line: lines },
        });
    }
  }
  if (!classes.length) throw new Error('Application coverage is empty');
  const basename = path.replaceAll('\\', '/').split('/').at(-1);
  if (!/^[\w.-]+\.xml$/.test(basename))
    throw new Error('Invalid coverage filename');
  save(root, `coverage/${suite}/${basename}`, {
    coverage: {
      '@_version': '1',
      sources: { source: '.' },
      packages: { package: { '@_name': suite, classes: { class: classes } } },
    },
  });
}

export function publishReports(root) {
  const failures = [];
  let primary;
  try {
    const backend = files(owned(root, `${rawPath}/backend`));
    const attempt = (label, action) => {
      try {
        action();
      } catch {
        failures.push(label);
      }
    };
    attempt('backend test results', () => backendResults(root, backend));
    attempt('frontend test results', () => frontendResults(root));
    const projects = readdirSync(resolve(root, 'tests')).filter((name) =>
      name.endsWith('.Tests'),
    );
    const coverage = backend.filter((file) => file.endsWith('.cobertura.xml'));
    if (coverage.length !== projects.length)
      failures.push('backend coverage collection');
    for (const file of coverage)
      attempt('backend coverage', () => coverageReport(root, file, 'backend'));
    attempt('frontend coverage', () =>
      coverageReport(
        root,
        owned(root, `${rawPath}/frontend/cobertura-coverage.xml`),
        'frontend',
      ),
    );
    if (failures.length)
      primary = new Error(
        `Application reporting is incomplete: ${[...new Set(failures)].join(', ')}`,
      );
  } catch {
    primary = new Error(
      'Application reporting is incomplete: invalid input inventory',
    );
  }
  cleanupAllSync(
    [
      {
        operation: 'application report collection status',
        run: () => {
          const directory = owned(root, publicPath);
          mkdirSync(directory, { recursive: true });
          writeFileSync(
            resolve(directory, 'status.json'),
            JSON.stringify(
              {
                complete: !primary,
                missing:
                  primary && !failures.length
                    ? ['input inventory']
                    : [...new Set(failures)],
              },
              null,
              2,
            ) + '\n',
          );
        },
      },
      {
        operation: 'private application report cleanup',
        run: () =>
          rmSync(owned(root, rawPath), { recursive: true, force: true }),
      },
    ],
    { primary },
  );
}

export function appendCoverageSummaries(root, summaryPath) {
  const missing = [];
  const status = JSON.parse(
    readFileSync(owned(root, `${publicPath}/status.json`), 'utf8'),
  );
  if (status.complete !== true) {
    appendFileSync(
      summaryPath,
      '\n## Application reporting incomplete\n\nAvailable reports are partial. Inspect the quality job log for missing collection stages.\n',
    );
    missing.push('collection');
  }
  for (const suite of ['backend', 'frontend']) {
    const report = owned(
      root,
      `${publicPath}/coverage/${suite}/report/SummaryGithub.md`,
    );
    const html = owned(
      root,
      `${publicPath}/coverage/${suite}/report/index.html`,
    );
    if (!existsSync(report) || !existsSync(html)) {
      missing.push(suite);
      continue;
    }
    appendFileSync(
      summaryPath,
      `\n## ${suite === 'backend' ? 'Backend' : 'Frontend'} coverage\n\n${readFileSync(report, 'utf8')}\n`,
    );
  }
  if (missing.length)
    throw new Error(`Coverage reporting is incomplete: ${missing.join(', ')}`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    if (process.argv[2] !== 'summary' || !process.env.GITHUB_STEP_SUMMARY)
      throw new Error(
        'Application coverage summary requires its workflow summary path',
      );
    appendCoverageSummaries(process.cwd(), process.env.GITHUB_STEP_SUMMARY);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
