import { createGeneratorInput } from './azure-generator-input.mjs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import parsers from '@stoplight/spectral-parsers';
import { imagePatch } from './component-images.mjs';
import {
  validateComponentRelease,
  validateAzurePublication,
} from './deployment-validation.mjs';
import { renderRuntimeProjection } from './azure-runtime.mjs';

const fail = () => {
  throw Error(
    'Qualification data classification or transition is invalid; private details suppressed.',
  );
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
export const releaseComponents = Object.freeze([
  'web',
  'inventory',
  'reservations',
  'notifications',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
]);
export const releaseRepository = Object.freeze({
  id: 1426639177,
  name: 'cosminstirbu/equipment-reservations-lab',
});
export const releasePaths = Object.freeze(
  ['local', 'azure']
    .flatMap((environment) =>
      releaseComponents.flatMap((component) => [
        `deploy/environments/${environment}/images/${component}.yaml`,
        `deploy/environments/${environment}/releases/${component}.json`,
      ]),
    )
    .sort(),
);
export const activationPath = 'deploy/platform/azure/recovery-activation.json';
export const qualificationStatePath =
  'deploy/platform/azure/recovery-controls/kustomization.yaml';
export const generatedPaths = Object.freeze(
  [
    'deploy/environments/azure/runtime/kustomization.yaml',
    'deploy/environments/azure/runtime/identities.json',
    'deploy/environments/azure/runtime/projection.json',
    'deploy/platform/azure/runtime/recovery-continuity-bindings.json',
    'deploy/platform/azure/runtime/recovery-qualification-bindings.json',
    'deploy/platform/azure/runtime/argocd-bootstrap-patches.json',
    'deploy/platform/azure/runtime/argocd-bootstrap-resources.json',
    'deploy/platform/azure/runtime/kustomization.yaml',
    'deploy/platform/azure/runtime/identities.json',
    'deploy/platform/azure/runtime/projection.json',
    'deploy/platform/azure/recovery/runtime/kustomization.yaml',
    'deploy/platform/azure/recovery/runtime/bindings.json',
    'deploy/platform/azure/recovery/runtime/identities.json',
    'deploy/platform/azure/recovery/runtime/projection.json',
  ].sort(),
);
export const installationPaths = Object.freeze(
  [qualificationStatePath, ...generatedPaths].sort(),
);
export const classificationPaths = Object.freeze({
  release: releasePaths,
  installation: installationPaths,
  activation: activationPath,
});
function parse(text, format = 'yaml') {
  if (typeof text !== 'string' || !text.trim() || text.length > 1048576) fail();
  if (
    format === 'yaml' &&
    (/(^|\s)[&*!][^\s]/m.test(text) ||
      /^%/m.test(text) ||
      (text.match(/^---\s*$/gm)?.length ?? 0) > 1 ||
      /^\.\.\.\s*$/m.test(text))
  )
    fail();
  const result = (format === 'json' ? parsers.Json : parsers.Yaml).parse(text);
  if (
    result.diagnostics.length ||
    !result.data ||
    typeof result.data !== 'object'
  )
    fail();
  if (format === 'json') JSON.parse(text);
  return result.data;
}
export function classifyReleaseFiles(
  files,
  { repository = releaseRepository, acrLoginServer, requireAzure = false } = {},
) {
  try {
    if (
      !files ||
      Object.keys(files).some((path) => !releasePaths.includes(path)) ||
      !isDeepStrictEqual(repository, releaseRepository)
    )
      fail();
    const publications = [];
    const selections = [];
    for (const environment of ['local', 'azure']) {
      const paths = releasePaths.filter((path) =>
        path.startsWith(`deploy/environments/${environment}/`),
      );
      const present = paths.filter((path) => Object.hasOwn(files, path));
      if (environment === 'azure' && present.length === 0 && !requireAzure)
        continue;
      if (present.length !== 14) fail();
      for (const component of releaseComponents) {
        const recordPath = `deploy/environments/${environment}/releases/${component}.json`;
        const patchPath = `deploy/environments/${environment}/images/${component}.yaml`;
        const record = parse(files[recordPath], 'json');
        const source =
          environment === 'local'
            ? validateComponentRelease(record)
            : validateAzurePublication(record, { repository, acrLoginServer })
                .source;
        if (
          source.component !== component ||
          source.sourceRef !== 'refs/heads/main' ||
          !isDeepStrictEqual(source.repository, repository)
        )
          fail();
        const canonical = imagePatch(
          component,
          `${record.image}@${record.digest}`,
        );
        if (
          !isDeepStrictEqual(parse(files[patchPath]), parse(canonical)) ||
          files[patchPath] !== canonical
        )
          fail();
        if (environment === 'azure') publications.push(record);
        selections.push(
          { path: recordPath, sha256: hash(files[recordPath]) },
          { path: patchPath, sha256: hash(files[patchPath]) },
        );
      }
    }
    return {
      files: selections.sort((a, b) => a.path.localeCompare(b.path)),
      publications,
    };
  } catch {
    fail();
  }
}
function records(files) {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, sha256: hash(content) }));
}
function projectionFiles(input) {
  const projection = renderRuntimeProjection(createGeneratorInput(input));
  const files = {};
  for (const [key, root] of [
    ['applicationFiles', 'deploy/environments/azure/runtime'],
    ['platformFiles', 'deploy/platform/azure/runtime'],
    ['recoveryFiles', 'deploy/platform/azure/recovery/runtime'],
  ])
    for (const [path, content] of Object.entries(projection[key]))
      files[`${root}/${path}`] = content;
  if (!isDeepStrictEqual(Object.keys(files).sort(), generatedPaths)) fail();
  return { files, projection };
}
const sourceState = {
  apiVersion: 'kustomize.config.k8s.io/v1beta1',
  kind: 'Kustomization',
  resources: [
    'admission.json',
    'roles.json',
    'network.json',
    'qualification.json',
  ],
};
const targetState = {
  ...sourceState,
  resources: sourceState.resources.slice(0, -1),
};
export async function buildQualificationInstallation({ files, input }) {
  try {
    if (
      !isDeepStrictEqual(Object.keys(files).sort(), installationPaths) ||
      !isDeepStrictEqual(parse(files[qualificationStatePath]), sourceState)
    )
      fail();
    const { files: generated, projection } = projectionFiles(input);
    for (const path of generatedPaths)
      if (files[path] !== generated[path]) fail();
    const prettier = await import('prettier');
    if (
      files[qualificationStatePath] !==
      (await prettier.format(JSON.stringify(sourceState), {
        parser: 'yaml',
        singleQuote: true,
      }))
    )
      fail();
    const targetFiles = {
      ...files,
      [qualificationStatePath]: await prettier.format(
        JSON.stringify(targetState),
        { parser: 'yaml', singleQuote: true },
      ),
    };
    const source = records(files),
      target = records(targetFiles);
    return {
      binding: {
        version: 1,
        generation: projection.generation,
        outputHash: projection.outputHash,
        source: { files: source, hash: hash(JSON.stringify(source)) },
        target: { files: target, hash: hash(JSON.stringify(target)) },
      },
      targetFiles,
    };
  } catch {
    fail();
  }
}
export async function validateQualificationInstallation({
  files,
  input,
  binding,
  phase,
}) {
  try {
    if (
      !['source', 'target'].includes(phase) ||
      !isDeepStrictEqual(Object.keys(files).sort(), installationPaths) ||
      !isDeepStrictEqual(
        parse(files[qualificationStatePath]),
        phase === 'source' ? sourceState : targetState,
      )
    )
      fail();
    const { files: generated, projection } = projectionFiles(input);
    if (
      binding?.version !== 1 ||
      Object.keys(binding).sort().join(',') !==
        'generation,outputHash,source,target,version' ||
      binding.generation !== projection.generation ||
      binding.outputHash !== projection.outputHash
    )
      fail();
    for (const path of generatedPaths)
      if (files[path] !== generated[path]) fail();
    for (const stage of ['source', 'target']) {
      if (
        Object.keys(binding[stage]).sort().join(',') !== 'files,hash' ||
        binding[stage].hash !== hash(JSON.stringify(binding[stage].files)) ||
        !isDeepStrictEqual(
          binding[stage].files.map((entry) => entry.path),
          installationPaths,
        )
      )
        fail();
      if (
        binding[stage].files.some(
          (entry) =>
            Object.keys(entry).sort().join(',') !== 'path,sha256' ||
            !/^[a-f0-9]{64}$/.test(entry.sha256),
        )
      )
        fail();
    }
    const prettier = await import('prettier');
    const expectedSource = {
      ...generated,
      [qualificationStatePath]: await prettier.format(
        JSON.stringify(sourceState),
        { parser: 'yaml', singleQuote: true },
      ),
    };
    const expected = await buildQualificationInstallation({
      files: expectedSource,
      input,
    });
    if (!isDeepStrictEqual(binding, expected.binding)) fail();
    if (!isDeepStrictEqual(records(files), binding[phase].files)) fail();
    return binding;
  } catch {
    fail();
  }
}
