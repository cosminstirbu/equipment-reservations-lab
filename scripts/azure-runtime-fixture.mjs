import { createGeneratorInput } from './azure-generator-input.mjs';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { resolve, join, extname, sep, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderRuntimeProjection,
  workloadSecrets,
  recoveryWorkloadSecrets,
} from './azure-runtime.mjs';
import { imagePatch } from './component-images.mjs';

const repository = { id: 123, name: 'example/equipment' };

export function removeAzureFixtureDirectory(directory, prefix) {
  const target = realpathSync(directory);
  if (
    !/^equipment-[a-z-]+-$/.test(prefix) ||
    dirname(target) !== realpathSync(tmpdir()) ||
    !basename(target).startsWith(prefix)
  )
    throw new Error(
      'Fixture cleanup target is outside the exact owned temporary directory.',
    );
  rmSync(target, { recursive: true, force: true });
}

const components = [
  'inventory',
  'reservations',
  'notifications',
  'web',
  'database-bootstrap',
  'identity-bootstrap',
  'broker-bootstrap',
];

export function azureRuntimeFixtureInput() {
  const id = '22222222-2222-4222-8222-222222222222';
  const backend = {
    resourceGroupName: 'learning-foundation',
    storageAccountName: 'fixturefoundation',
    containerName: 'tfstate',
    key: 'foundation.tfstate',
  };
  return {
    config: {
      version: 1,
      taxRate: 0,
      environment: 'learning',
      generation: 'test1234',
      tenantId: id,
      subscriptionId: id,
      region: 'westeurope',
      domain: 'codingfunlab.com',
      operatorGroupObjectId: id,
      operatorCidrs: ['203.0.113.7/32'],
      acmeEmail: 'owner@codingfunlab.com',
      acmeTermsAccepted: true,
      kubernetesVersion: '1.35.8',
      nodeVmSize: 'Standard_D4s_v5',
      nodeCount: 2,
      githubRepository: repository.name,
      gitRevision: 'a'.repeat(40),
      foundationBackend: backend,
      environmentBackend: { ...backend, key: 'environment.tfstate' },
      recoveryKeyVersion: 'b'.repeat(32),
    },
    foundation: {
      foundation_resource_group_name: 'learning-foundation',
      state_storage_account_name: 'fixturefoundation',
      operation_container_name: 'operations',
      recovery_key_id: `https://fixturefoundation.vault.azure.net/keys/recovery/${'b'.repeat(32)}`,
      tenant_id: id,
      dns_zone_resource_group_name: 'learning-foundation',
      operator_client_ids: { argocd: id, dashboard: id },
      operator_group_object_id: id,
      github_principal_ids: { backup: id, restore: id },
    },
    environment: {
      workload_resource_group_name: 'learning-workload',
      aks_cluster_name: 'learning-aks',
      aks_resource_id: `/subscriptions/${id}/resourceGroups/learning-workload/providers/Microsoft.ContainerService/managedClusters/learning-aks`,
      acr_login_server: 'learning.azurecr.io',
      workload_key_vault_uri: 'https://learning-vault.vault.azure.net/',
      workload_key_vault_name: 'learning-vault',
      workload_client_ids: Object.fromEntries(
        [
          ...Object.keys(workloadSecrets),
          ...Object.keys(recoveryWorkloadSecrets).filter(
            (name) => name !== 'recovery-database-bootstrap',
          ),
          'cert-manager',
        ].map((name) => [name, id]),
      ),
      ingress_public_ip: '203.0.113.8',
      ingress_public_ip_resource_group_name: 'learning-workload',
    },
  };
}

export function stageAzureFixture(
  destination,
  { sourceRoot = resolve(import.meta.dirname, '..') } = {},
) {
  const root = resolve(destination);
  const source = resolve(sourceRoot);
  if (
    root === source ||
    root.startsWith(join(source, 'deploy') + sep) ||
    (existsSync(root) && readdirSync(root).length)
  )
    throw new Error(
      'Offline Azure fixture requires an empty isolated destination.',
    );
  mkdirSync(root, { recursive: true });
  const directories = [
    'deploy/base',
    'deploy/environments/azure',
    'deploy/platform/azure',
    'deploy/argocd/azure',
  ];
  for (const directory of directories) {
    const from = join(source, directory);
    const to = join(root, directory);
    mkdirSync(resolve(to, '..'), { recursive: true });
    cpSync(from, to, {
      recursive: true,
      filter: (path) => {
        if (lstatSync(path).isSymbolicLink()) return false;
        const relative = path.slice(from.length).split(/[\\/]/).filter(Boolean);
        if (relative.includes('runtime')) return false;
        if (lstatSync(path).isDirectory()) return true;
        return ['.yaml', '.yml', '.json', '.conf', '.sql'].includes(
          extname(path),
        );
      },
    });
  }
  const input = azureRuntimeFixtureInput();
  const projection = renderRuntimeProjection(createGeneratorInput(input));
  for (const [directory, files] of [
    ['deploy/environments/azure/runtime', projection.applicationFiles],
    ['deploy/platform/azure/runtime', projection.platformFiles],
    ['deploy/platform/azure/recovery/runtime', projection.recoveryFiles],
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
    for (const [path, content] of Object.entries(files))
      writeFileSync(join(root, directory, path), content);
  }
  for (const component of components) {
    const digest = 'sha256:' + 'b'.repeat(64);
    const image = 'learning.azurecr.io/equipment-' + component;
    const release = {
      schemaVersion: 1,
      component,
      repository,
      sourceRevision: 'a'.repeat(40),
      sourceRef: 'refs/heads/main',
      runId: 1,
      runAttempt: 1,
      workflow: '.github/workflows/validate.yaml',
      image: 'ghcr.io/example/equipment-' + component,
      digest,
    };
    for (const directory of ['images', 'releases'])
      mkdirSync(join(root, 'deploy/environments/azure', directory), {
        recursive: true,
      });
    writeFileSync(
      join(root, 'deploy/environments/azure/images', component + '.yaml'),
      imagePatch(component, image + '@' + digest),
    );
    writeFileSync(
      join(root, 'deploy/environments/azure/releases', component + '.json'),
      JSON.stringify(
        { schemaVersion: 1, source: release, image, digest },
        null,
        2,
      ) + '\n',
    );
  }
  return { root, fixture: true, repository, ...input, projection };
}
