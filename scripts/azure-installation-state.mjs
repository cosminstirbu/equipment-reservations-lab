import { createGeneratorInput } from './azure-generator-input.mjs';
import { createHash } from 'node:crypto';
import { renderRuntimeProjection } from './azure-runtime.mjs';

const runtimeFiles = [
  [
    'deploy/environments/azure/runtime',
    'applicationFiles',
    ['identities.json', 'kustomization.yaml', 'projection.json'],
  ],
  [
    'deploy/platform/azure/runtime',
    'platformFiles',
    [
      'argocd-bootstrap-patches.json',
      'argocd-bootstrap-resources.json',
      'identities.json',
      'kustomization.yaml',
      'projection.json',
      'recovery-continuity-bindings.json',
      'recovery-qualification-bindings.json',
    ],
  ],
  [
    'deploy/platform/azure/recovery/runtime',
    'recoveryFiles',
    [
      'bindings.json',
      'identities.json',
      'kustomization.yaml',
      'projection.json',
    ],
  ],
];

function fail() {
  throw new Error('Installation state is invalid; private details suppressed.');
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function validateInstallationState({
  config,
  foundation,
  environment,
  files,
} = {}) {
  try {
    const projection = renderRuntimeProjection(
      createGeneratorInput({
        config,
        foundation,
        environment,
      }),
    );
    const expected = new Map();
    for (const [directory, key, names] of runtimeFiles) {
      const generated = projection[key];
      if (
        !generated ||
        JSON.stringify(Object.keys(generated).sort()) !== JSON.stringify(names)
      )
        fail();
      for (const name of names) {
        if (typeof generated[name] !== 'string') fail();
        expected.set(`${directory}/${name}`, generated[name]);
      }
    }
    if (
      !files ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(files))
    )
      fail();
    const paths = Reflect.ownKeys(files);
    if (
      paths.some((path) => typeof path !== 'string') ||
      (paths.length !== 0 && paths.length !== expected.size)
    )
      fail();
    const records = paths.sort().map((path) => {
      const entry = Object.getOwnPropertyDescriptor(files, path);
      if (
        !entry.enumerable ||
        !Object.hasOwn(entry, 'value') ||
        typeof entry.value !== 'string' ||
        !expected.has(path) ||
        entry.value !== expected.get(path)
      )
        fail();
      return { path, sha256: digest(entry.value) };
    });
    return {
      state: paths.length === 0 ? 'absent' : 'generated',
      generation: projection.generation,
      outputHash: projection.outputHash,
      installationHash: digest(JSON.stringify(records)),
    };
  } catch {
    fail();
  }
}
