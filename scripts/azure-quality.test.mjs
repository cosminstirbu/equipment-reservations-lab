import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const cli = resolve('scripts/azure-quality.mjs');
const invoke = (command, directory, extra = []) =>
  spawnSync(
    process.execPath,
    [cli, command, '--directory', directory, ...extra],
    { encoding: 'utf8', timeout: 120000 },
  );
const fixture = (t, source) => {
  const directory = mkdtempSync(join(tmpdir(), 'azure-quality-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'main.tf'), source);
  return directory;
};

test('public format check rejects bad layout; explicit formatter repairs it', (t) => {
  const directory = fixture(t, 'terraform {required_version="= 1.17.0"}\n');
  assert.notEqual(invoke('fmt-check', directory).status, 0);
  assert.equal(invoke('format', directory).status, 0);
  assert.equal(invoke('fmt-check', directory).status, 0);
});

test('actual Terraform validation rejects invalid configuration without disclosing source', (t) => {
  const directory = fixture(
    t,
    'output "PRIVATE_CONFIG_MARKER" { value = missing.value }\n',
  );
  const result = invoke('validate', directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Terraform validation/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_CONFIG_MARKER/);
});

test('actual pinned Azure rules reject unsupported Azure VM size', (t) => {
  const directory = fixture(
    t,
    'resource "azurerm_linux_virtual_machine" "example" { size = "PRIVATE_INVALID_SIZE" }\n',
  );
  const result = invoke('lint', directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TFLint/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_INVALID_SIZE/);
});

test('actual offline immutable policies block insecure Azure storage', (t) => {
  const directory = fixture(
    t,
    'resource "azurerm_storage_account" "PRIVATE_SECURITY_MARKER" { min_tls_version = "TLS1_0" }\n',
  );
  const result = invoke('security', directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Security findings/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_SECURITY_MARKER/);
});

test('missing tools and policy cache fail closed with safe diagnostics', (t) => {
  const directory = fixture(t, 'terraform {}\n');
  const missing = invoke('security', directory, [
    '--tools-directory',
    join(directory, 'missing'),
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /tool|prerequisite/i);
  const policy = invoke('security', directory, [
    '--policy-directory',
    join(directory, 'missing-policy'),
  ]);
  assert.notEqual(policy.status, 0);
  assert.match(policy.stderr, /policy/i);
});

test('policy content substitution cannot change enabled checks', (t) => {
  const directory = fixture(t, 'terraform {}\n');
  const result = invoke('security', directory, [
    '--policy-directory',
    directory,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /policy/);
});

test('security scanner parse errors block even without security findings', (t) => {
  const directory = fixture(t, 'resource "PRIVATE_PARSE_MARKER" {\n');
  const result = invoke('security', directory);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_PARSE_MARKER/);
});

test('inline suppression cannot bypass required security findings', (t) => {
  const directory = fixture(
    t,
    '#trivy:ignore:AZU-0011\nresource "azurerm_storage_account" "example" { min_tls_version = "TLS1_0" }\n',
  );
  const result = invoke('security', directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /suppression/i);
});

test('approved exceptions match only exact scanner rule root and resource', async () => {
  const { filterPolicyFindings } = await import('./azure-quality.mjs');
  const finding = {
    rule: 'AVD-AZU-0058',
    resource: 'azurerm_storage_account.state',
  };
  assert.equal(
    filterPolicyFindings('trivy', [finding], resolve('infra/azure/foundation'))
      .length,
    0,
  );
  assert.equal(
    filterPolicyFindings(
      'trivy',
      [{ ...finding, resource: 'azurerm_storage_account.other' }],
      resolve('infra/azure/foundation'),
    ).length,
    1,
  );
  assert.equal(
    filterPolicyFindings('trivy', [finding], resolve('infra/azure/environment'))
      .length,
    1,
  );
  assert.equal(
    filterPolicyFindings(
      'trivy',
      [{ ...finding, rule: 'AVD-AZU-0059' }],
      resolve('infra/azure/foundation'),
    ).length,
    1,
  );
});

test('approved Queue-rule false positives match only the two retained storage addresses', async () => {
  const { filterPolicyFindings } = await import('./azure-quality.mjs');
  for (const resource of [
    'azurerm_storage_account.state',
    'azurerm_storage_account.recovery',
  ])
    assert.equal(
      filterPolicyFindings(
        'trivy',
        [{ rule: 'AVD-AZU-0057', resource }],
        resolve('infra/azure/foundation'),
      ).length,
      0,
    );
  assert.equal(
    filterPolicyFindings(
      'trivy',
      [{ rule: 'AVD-AZU-0057', resource: 'azurerm_storage_account.other' }],
      resolve('infra/azure/foundation'),
    ).length,
    1,
  );
  assert.equal(
    filterPolicyFindings(
      'trivy',
      [{ rule: 'AVD-AZU-0057', resource: 'azurerm_storage_account.state' }],
      resolve('infra/azure/environment'),
    ).length,
    1,
  );
});

test('approved disposable workload vault lifecycle exception cannot cover retained or other vaults', async () => {
  const { filterPolicyFindings } = await import('./azure-quality.mjs');
  const finding = {
    rule: 'azurerm_resources_missing_prevent_destroy',
    resource: 'azurerm_key_vault.workload',
  };
  assert.equal(
    filterPolicyFindings(
      'tflint',
      [finding],
      resolve('infra/azure/environment'),
    ).length,
    0,
  );
  assert.equal(
    filterPolicyFindings('tflint', [finding], resolve('infra/azure/foundation'))
      .length,
    1,
  );
  assert.equal(
    filterPolicyFindings(
      'tflint',
      [{ ...finding, resource: 'azurerm_key_vault.recovery' }],
      resolve('infra/azure/environment'),
    ).length,
    1,
  );
});

test('public native Terraform contract gate runs real assertions and fails privately on invalid HCL', async (t) => {
  const directory = fixture(t, 'output "current" { value = "approved" }\n');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(directory, 'tests'));
  writeFileSync(
    join(directory, 'tests', 'contract.tftest.hcl'),
    'run "source_contract" {\n command = plan\n assert {\n condition = output.current == "approved"\n error_message = "PRIVATE_ASSERTION_MARKER"\n }\n}\n',
  );
  const positive = invoke('test', directory);
  assert.equal(positive.status, 0, positive.stderr);
  assert.match(positive.stdout, /passed/);
  writeFileSync(
    join(directory, 'main.tf'),
    'output "PRIVATE_BAD_HCL_MARKER" {',
  );
  const negative = invoke('test', directory);
  assert.notEqual(negative.status, 0);
  assert.doesNotMatch(
    negative.stdout + negative.stderr,
    /PRIVATE_BAD_HCL_MARKER|PRIVATE_ASSERTION_MARKER/,
  );
});

// Design: locked binary integrity is checked before a tool process can execute.
test('kind is exactly pinned for both runners and corrupted executables fail closed', async (t) => {
  const { qualityContext, verifiedTool } = await import('./azure-quality.mjs');
  const context = qualityContext();
  assert.equal(context.lock.tools.kind?.version, '0.33.0');
  for (const platform of ['win32-x64', 'linux-x64']) {
    const pin = context.lock.tools.kind.platforms[platform];
    assert.match(
      pin.url,
      /^https:\/\/github\.com\/kubernetes-sigs\/kind\/releases\/download\/v0\.33\.0\/kind-/,
    );
    assert.equal(pin.executableSha256, pin.archiveSha256);
    const directory = fixture(t, 'terraform {}');
    const path = join(directory, 'corrupt-kind');
    writeFileSync(path, 'PRIVATE_CORRUPT_KIND');
    const altered = globalThis.structuredClone(context.lock);
    altered.tools.kind.platforms[platform].path = 'corrupt-kind';
    assert.throws(
      () =>
        verifiedTool(
          { ...context, platform, lock: altered, toolsDirectory: directory },
          'kind',
        ),
      /integrity|checksum/i,
    );
  }
});
