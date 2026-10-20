const label = (process.argv[2] || 'OpenAPI')
  .slice(0, 100)
  .split('')
  .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
  .join('');

function rejectExternalReferences(value, path = '$') {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const location = `${path}[${JSON.stringify(key)}]`;
    if (
      (key === '$ref' || key === '$dynamicRef') &&
      (typeof child !== 'string' || !child.startsWith('#'))
    ) {
      throw new Error(
        `external-reference ${location}: only local fragment references are supported`,
      );
    }
    rejectExternalReferences(child, location);
  }
}

try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('input $: expected a nonempty valid JSON OpenAPI document');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.openapi !== 'string' ||
    !/^3\.[01]\.\d+$/.test(parsed.openapi)
  ) {
    throw new Error('input $.openapi: expected an OpenAPI 3.0 or 3.1 document');
  }
  rejectExternalReferences(parsed);

  const [{ default: core }, { default: rulesets }, { default: parsers }] =
    await Promise.all([
      import('@stoplight/spectral-core'),
      import('@stoplight/spectral-rulesets'),
      import('@stoplight/spectral-parsers'),
    ]);
  const spectral = new core.Spectral();
  spectral.setRuleset({ extends: [[rulesets.oas, 'recommended']] });
  const findings = await spectral.run(new core.Document(input, parsers.Json));
  const severities = ['error', 'warning', 'information', 'hint'];
  for (const finding of findings) {
    console.error(
      `${label}: ${severities[finding.severity]} ${finding.code} $${finding.path.map((part) => `[${JSON.stringify(part)}]`).join('')}: ${finding.message}`,
    );
  }
  if (findings.some((finding) => finding.severity <= 1)) process.exitCode = 1;
} catch (error) {
  const message =
    error.code === 'ERR_MODULE_NOT_FOUND'
      ? 'tool: Spectral dependencies unavailable; run npm ci from the repository root'
      : error.message;
  console.error(`${label}: ${message}`);
  process.exitCode = 1;
}
