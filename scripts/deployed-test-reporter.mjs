import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { XMLBuilder } from 'fast-xml-parser';

const file = new URL(
  '../tests/DeployedApplication/deployed.test.mjs',
  import.meta.url,
);

export function deployedTestNames() {
  const names = [];
  const source = ts.createSourceFile(
    file.pathname,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'test' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      names.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

export default async function* report(events) {
  const pattern = process.env.EQUIPMENT_DEPLOYED_PATTERN;
  const expected = deployedTestNames().filter(
    (name) => !pattern || new RegExp(pattern).test(name),
  );
  const cases = new Map();
  for await (const event of events) {
    if (
      !['test:pass', 'test:fail'].includes(event.type) ||
      !expected.includes(event.data.name)
    )
      continue;
    const duration = event.data.details?.duration_ms;
    cases.set(event.data.name, {
      '@_classname': 'DeployedApplication',
      '@_name': event.data.name,
      '@_time':
        Number.isFinite(duration) && duration >= 0 ? duration / 1000 : 0,
      ...(event.type === 'test:fail' || event.data.skip || event.data.todo
        ? {
            failure: {
              '@_message':
                'Deployed test failed or did not execute. Inspect the live job log for safe diagnostics.',
            },
          }
        : {}),
    });
  }
  // Missing cases are failures as well: a worker crash must never look like a smaller passing suite.
  for (const name of expected) {
    if (!cases.has(name))
      cases.set(name, {
        '@_classname': 'DeployedApplication',
        '@_name': name,
        '@_time': 0,
        failure: { '@_message': 'Expected deployed test result is missing.' },
      });
  }
  if (!expected.length) throw new Error('No deployed test cases selected.');
  const results = [...cases.values()];
  const time = results.reduce((total, entry) => total + entry['@_time'], 0);
  yield new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressBooleanAttributes: false,
  }).build({
    testsuites: {
      '@_time': time,
      testsuite: {
        '@_name': 'Deployed application tests',
        '@_tests': results.length,
        '@_failures': results.filter((entry) => entry.failure).length,
        '@_errors': 0,
        '@_skipped': 0,
        '@_time': time,
        testcase: results,
      },
    },
  });
}
