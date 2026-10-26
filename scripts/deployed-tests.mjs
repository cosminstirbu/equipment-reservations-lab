import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { executeProcess, safeFailure, OperationalFailure } from './process.mjs';
import { assertPrivatePath } from './local-platform.mjs';
import { XMLParser } from 'fast-xml-parser';
import { deployedTestNames } from './deployed-test-reporter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const arguments_ = process.argv.slice(2);
  let reports = false;
  let pattern;
  let state =
    process.env.EQUIPMENT_TEST_STATE ??
    process.env.EQUIPMENT_CI_STATE ??
    resolve(root, '.local/kubernetes');
  let ci = false;
  for (let index = 0; index < arguments_.length; index++) {
    const flag = arguments_[index];
    if (flag === '--reports') reports = true;
    else if (flag === '--ci') ci = true;
    else if (flag === '--state' && arguments_[index + 1])
      state = resolve(arguments_[++index]);
    else if (flag === '--test-name-pattern' && arguments_[index + 1])
      pattern = arguments_[++index];
    else
      throw new OperationalFailure(
        'Usage: test:deployed [--reports] [--ci] [--state DIRECTORY] [--test-name-pattern REGEX]',
      );
  }
  if (
    pattern &&
    !deployedTestNames().some((name) => new RegExp(pattern).test(name))
  )
    throw new OperationalFailure('No deployed test cases selected.');
  const directory = resolve('test-results/deployed');
  let ancestor = directory;
  while (ancestor !== process.cwd()) {
    if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink())
      throw new OperationalFailure(
        'Deployed reporting refuses symbolic links.',
      );
    ancestor = dirname(ancestor);
  }
  if (reports) {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
  }
  const env = {
    ...process.env,
    EQUIPMENT_TEST_STATE: state,
    EQUIPMENT_DEPLOYED_CI: String(ci),
    EQUIPMENT_DEPLOYED_PATTERN: pattern ?? '',
  };
  // Configure trust before starting Node; IDE runs must supply the same startup environment.
  if (!env.NODE_EXTRA_CA_CERTS) {
    try {
      const path = resolve(state, 'smoke-state.json');
      assertPrivatePath(path, 0o600);
      const settings = JSON.parse(readFileSync(path, 'utf8'));
      if (settings.caFile) {
        const ca = resolve(state, settings.caFile);
        assertPrivatePath(ca, 0o600);
        env.NODE_EXTRA_CA_CERTS = ca;
      }
    } catch {
      /* Each discovered case reports missing prerequisites safely. */
    }
  }
  let primary;
  try {
    executeProcess(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        ...(pattern ? ['--test-name-pattern', pattern] : []),
        ...(reports
          ? [
              '--test-reporter=spec',
              '--test-reporter-destination=stdout',
              `--test-reporter=${pathToFileURL(resolve(root, 'scripts/deployed-test-reporter.mjs')).href}`,
              `--test-reporter-destination=${resolve(directory, 'results.xml')}`,
            ]
          : []),
        resolve(root, 'tests/DeployedApplication/deployed.test.mjs'),
      ],
      {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 1200000,
        operation: 'deployed application tests',
        tool: 'node',
        output: 'stream',
      },
    );
  } catch (error) {
    primary = error;
  }
  const validateReport = () => {
    const result = new XMLParser({ ignoreAttributes: false }).parse(
      readFileSync(resolve(directory, 'results.xml'), 'utf8'),
    ).testsuites?.testsuite;
    if (
      !result ||
      Number(result['@_tests']) !==
        deployedTestNames().filter(
          (name) => !pattern || new RegExp(pattern).test(name),
        ).length ||
      Number(result['@_failures']) !== 0
    )
      throw new OperationalFailure(
        'Deployed tests failed or reporting is incomplete.',
      );
  };
  let reportingFailure;
  if (reports) {
    try {
      validateReport();
    } catch {
      reportingFailure = new OperationalFailure(
        'Deployed test results contain failures or reporting is incomplete.',
      );
      console.error(reportingFailure.message);
    }
  }
  if (primary) throw primary;
  if (reportingFailure) throw reportingFailure;
} catch (error) {
  console.error(
    safeFailure(
      error,
      'Deployed tests failed or reporting is incomplete; private diagnostics suppressed.',
    ),
  );
  process.exitCode = 1;
}
