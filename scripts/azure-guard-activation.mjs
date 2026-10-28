import { isDeepStrictEqual } from 'node:util';
import { OperationalFailure, safeFailure } from './process.mjs';
import { createBlobJsonTransport } from './azure-handoff.mjs';
import {
  operationOutputsHash,
  assertAzureOperationLease,
} from './azure-operations.mjs';
import { validateVaultGuardOutput } from './azure-infrastructure.mjs';
import {
  validateGeneratorInput,
  generatorInputHash,
} from './azure-generator-input.mjs';

const fail = () => {
  throw new OperationalFailure(
    'Ordinary guard application activation is missing, incomplete or inconsistent; private details suppressed.',
  );
};
const hash = operationOutputsHash;
const sha = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function context(options) {
  const {
    config,
    outputs,
    qualificationHandle,
    consumptionHandle,
    bindingHandle,
    sourceClosureHash,
    sourceRevision,
    token,
  } = options;
  if (
    !config ||
    !outputs ||
    typeof token !== 'function' ||
    !sha.test(sourceClosureHash ?? '') ||
    !/^[a-f0-9]{40}$/.test(sourceRevision ?? '') ||
    typeof options.kubeconfig !== 'string'
  )
    fail();
  const guard = validateVaultGuardOutput(outputs.vault_guard);
  const input = validateGeneratorInput(outputs.projection_inputs);
  if (
    input.config.generation !== config.generation ||
    input.config.tenantId !== config.tenantId ||
    input.config.subscriptionId !== config.subscriptionId ||
    input.config.gitRevision !== config.gitRevision ||
    outputs.recovery_storage_account_name !==
      guard.evidence_storage_account_name
  )
    fail();
  const id = /^generation\/([a-f0-9-]{36})\.json$/.exec(
    qualificationHandle?.reference ?? '',
  )?.[1];
  if (
    !uuid.test(id ?? '') ||
    qualificationHandle?.purpose !== 'workload-generation' ||
    consumptionHandle?.purpose !== 'guard-generation-consumption' ||
    bindingHandle?.purpose !== 'guard-plan-binding' ||
    consumptionHandle.reference !== `consumed/${id}.json` ||
    bindingHandle.reference !== `plan-bindings/${id}.json` ||
    [qualificationHandle, consumptionHandle, bindingHandle].some(
      (x) => !sha.test(x.digest ?? ''),
    )
  )
    fail();
  const store = createBlobJsonTransport({
    account: guard.evidence_storage_account_name,
    container: 'guard-apply-evidence',
    token,
    request: options.request,
    signal: options.signal,
  });
  return {
    config,
    outputs,
    guard,
    input,
    id,
    store,
    reference: `activation/${config.generation}/${id}.json`,
  };
}
async function records(ctx, options) {
  const receipt = await ctx.store.read(options.consumptionHandle.reference);
  const binding = await ctx.store.read(options.bindingHandle.reference);
  if (
    !receipt ||
    !binding ||
    hash(receipt) !== options.consumptionHandle.digest ||
    hash(binding) !== options.bindingHandle.digest ||
    receipt.mode !== 'guard-generation-consumption' ||
    binding.mode !== 'guard-plan-binding' ||
    receipt.qualificationId !== ctx.id ||
    binding.qualificationId !== ctx.id ||
    receipt.qualificationDigest !== options.qualificationHandle.digest ||
    binding.qualificationDigest !== options.qualificationHandle.digest ||
    binding.consumptionDigest !== options.consumptionHandle.digest ||
    receipt.generation !== ctx.config.generation ||
    receipt.environment !== ctx.config.environment ||
    receipt.tenantId !== ctx.config.tenantId ||
    receipt.subscriptionId !== ctx.config.subscriptionId ||
    receipt.vaultId !==
      ctx.outputs.workload_key_vault_uri
        ?.replace(/\/$/, '')
        .replace(
          /^https:\/\/([^.]+)\.vault\.azure\.net$/,
          `/subscriptions/${ctx.config.subscriptionId}/resourceGroups/${ctx.outputs.workload_resource_group_name}/providers/Microsoft.KeyVault/vaults/$1`,
        ) ||
    receipt.consumerPrincipalId !== ctx.guard.producer_principal_ids.apply ||
    binding.producerPrincipalId !== ctx.guard.producer_principal_ids.apply ||
    receipt.sourceClosureHash !== options.sourceClosureHash ||
    binding.sourceClosureHash !== options.sourceClosureHash ||
    receipt.familyDigest !== binding.familyDigest ||
    receipt.planHash !== binding.planHash ||
    !sha.test(receipt.roleHash ?? '') ||
    !sha.test(receipt.familyDigest ?? '')
  )
    fail();
  return { receipt, binding };
}
async function currentInstallation(ctx, options, installationState) {
  const {
    validateQualificationLaunch,
    qualificationInstallationContext,
    validateQualificationInstallationContext,
    verifyQualificationReleaseContext,
  } = await import('./azure-qualification-launch.mjs');
  const launch = await validateQualificationLaunch();
  if (
    launch.actualProbeCodeRevision !== options.sourceRevision ||
    launch.definition.probeDefinitionHash !== options.sourceClosureHash
  )
    fail();
  const args = {
    revision: options.sourceRevision,
    input: ctx.input,
    acrLoginServer: ctx.outputs.acr_login_server,
  };
  await verifyQualificationReleaseContext({
    revision: options.sourceRevision,
    acrLoginServer: ctx.outputs.acr_login_server,
    signal: options.signal,
  });
  if (!installationState)
    return (await qualificationInstallationContext(args)).binding;
  let valid = false;
  for (const phase of ['source', 'target']) {
    try {
      await validateQualificationInstallationContext({
        ...args,
        binding: installationState,
        phase,
      });
      valid = true;
      break;
    } catch {
      /* Only the two independently predicted exact maps are acceptable. */
    }
  }
  if (!valid) fail();
  return installationState;
}
async function observe(options) {
  const { observeAzureGitOpsTargets } =
    await import('./azure-recovery-activation.mjs');
  return observeAzureGitOpsTargets({
    kubeconfig: options.kubeconfig,
    revision: options.sourceRevision,
    signal: options.signal,
  });
}
export async function publishGuardApplicationActivation(options = {}) {
  try {
    const ctx = context(options);
    const lease = await assertAzureOperationLease({
      config: ctx.config,
      outputs: ctx.outputs,
      token: options.token,
      operation: options.operation,
      allowedOperations: ['apply'],
    });
    const { receipt } = await records(ctx, options);
    if (
      receipt.leaseOwner !== lease.owner ||
      receipt.leaseNonce !== lease.nonce ||
      Date.parse(receipt.leaseExpires) <= Date.now()
    )
      fail();
    const installationState = await currentInstallation(ctx, options);
    const { verifyAzureReadiness } = await import('./azure-readiness.mjs');
    const readiness = await verifyAzureReadiness({
      stateDirectory: options.stateDirectory,
      kubeconfig: options.kubeconfig,
      signal: options.signal,
      operation: 'bootstrap',
    });
    const gitOps = await observe(options);
    await assertAzureOperationLease({
      config: ctx.config,
      outputs: ctx.outputs,
      token: options.token,
      operation: options.operation,
      allowedOperations: ['apply'],
    });
    const record = {
      version: 1,
      mode: 'guard-application-activation',
      environment: ctx.config.environment,
      generation: ctx.config.generation,
      subscriptionId: ctx.config.subscriptionId,
      tenantId: ctx.config.tenantId,
      vaultId: receipt.vaultId,
      qualificationDigest: options.qualificationHandle.digest,
      consumptionDigest: options.consumptionHandle.digest,
      bindingDigest: options.bindingHandle.digest,
      familyDigest: receipt.familyDigest,
      roleHash: receipt.roleHash,
      guardDefinitionHash: ctx.guard.definition_sha256,
      sourceClosureHash: options.sourceClosureHash,
      sourceRevision: options.sourceRevision,
      outputHash: generatorInputHash(ctx.input),
      installationState,
      installedTargetHash: hash(installationState),
      gitOps,
      readiness,
      producerPrincipalId: ctx.guard.producer_principal_ids.apply,
      completedAt: new Date().toISOString(),
    };
    await ctx.store.createOnly(ctx.reference, record);
    return { reference: ctx.reference, digest: hash(record) };
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Ordinary guard application activation failed; private details suppressed.',
      ),
    );
  }
}
export async function validateEstablishedGuardActivation(options = {}) {
  try {
    const ctx = context(options);
    const { receipt } = await records(ctx, options);
    const record = await ctx.store.read(ctx.reference);
    const keys =
      'bindingDigest,completedAt,consumptionDigest,environment,familyDigest,generation,gitOps,guardDefinitionHash,installationState,installedTargetHash,mode,outputHash,producerPrincipalId,qualificationDigest,readiness,roleHash,sourceClosureHash,sourceRevision,subscriptionId,tenantId,vaultId,version';
    if (
      !record ||
      Object.keys(record).sort().join(',') !== keys ||
      record.version !== 1 ||
      record.mode !== 'guard-application-activation' ||
      record.environment !== ctx.config.environment ||
      record.generation !== ctx.config.generation ||
      record.subscriptionId !== ctx.config.subscriptionId ||
      record.tenantId !== ctx.config.tenantId ||
      record.vaultId !== receipt.vaultId ||
      record.qualificationDigest !== options.qualificationHandle.digest ||
      record.consumptionDigest !== options.consumptionHandle.digest ||
      record.bindingDigest !== options.bindingHandle.digest ||
      record.familyDigest !== receipt.familyDigest ||
      record.roleHash !== receipt.roleHash ||
      record.sourceClosureHash !== options.sourceClosureHash ||
      record.guardDefinitionHash !== ctx.guard.definition_sha256 ||
      record.outputHash !== generatorInputHash(ctx.input) ||
      record.producerPrincipalId !== ctx.guard.producer_principal_ids.apply ||
      record.installedTargetHash !== hash(record.installationState) ||
      !Number.isFinite(Date.parse(record.completedAt)) ||
      Date.parse(record.completedAt) < Date.parse(receipt.issuedAt) ||
      Date.parse(record.completedAt) > Date.now() + 5000 ||
      !isDeepStrictEqual(record.readiness, {
        certificates: true,
        secrets: true,
        login: true,
        persistence: true,
        messaging: true,
        deployed: true,
        history: true,
      })
    )
      fail();
    await currentInstallation(ctx, options, record.installationState);
    await observe(options);
    return {
      generation: ctx.config.generation,
      vaultId: receipt.vaultId,
      qualificationDigest: options.qualificationHandle.digest,
      consumptionDigest: options.consumptionHandle.digest,
      revision: options.sourceRevision,
      installedTargetHash: record.installedTargetHash,
    };
  } catch (error) {
    throw new OperationalFailure(
      safeFailure(
        error,
        'Ordinary guard application activation failed; private details suppressed.',
      ),
    );
  }
}
