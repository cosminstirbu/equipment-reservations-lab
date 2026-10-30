import { lstatSync, mkdirSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { getCACertificates } from 'node:tls';
import { executeProcess, OperationalFailure } from './process.mjs';

function windowsAcl(path, prepare = false) {
  executeProcess(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `
    $ErrorActionPreference = 'Stop'
    $path = $env:EQUIPMENT_PRIVATE_PATH
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($env:EQUIPMENT_PREPARE_ACL -eq '1') {
      $acl = New-Object System.Security.AccessControl.DirectorySecurity
      $acl.SetOwner($sid)
      $acl.SetAccessRuleProtection($true, $false)
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
      $acl.AddAccessRule($rule)
      Set-Acl -LiteralPath $path -AclObject $acl
    }
    $acl = Get-Acl -LiteralPath $path
    if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { exit 21 }
    $allowed = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
    $ownerAllowed = $false
    foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
      if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) { exit 22 }
      if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -eq $sid.Value -and
          ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $ownerAllowed = $true }
    }
    if (-not $ownerAllowed) { exit 23 }
  `,
    ],
    {
      operation: 'Windows private state ACL verification',
      tool: 'powershell',
      output: 'private-capture',
      timeout: 10000,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => name.toLowerCase() !== 'psmodulepath',
          ),
        ),
        EQUIPMENT_PRIVATE_PATH: path,
        EQUIPMENT_PREPARE_ACL: prepare ? '1' : '0',
      },
    },
  );
}

export function assertPrivatePath(path, mode) {
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    (process.platform !== 'win32' && (info.mode & 0o777) !== mode) ||
    (mode === 0o700 ? !info.isDirectory() : !info.isFile())
  )
    throw new OperationalFailure(
      `Private state requires ${mode === 0o700 ? '0700 directory' : '0600 regular file'}: ${path}`,
    );
  if (process.platform === 'win32') windowsAcl(path);
}

export function createPrivateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    if (lstatSync(path).isSymbolicLink())
      throw new OperationalFailure('Private state cannot be a symlink.');
    try {
      assertPrivatePath(path, 0o700);
      return;
    } catch {
      windowsAcl(path, true);
    }
  }
  assertPrivatePath(path, 0o700);
}

export function verifySystemTrust({
  platform = process.platform,
  certificatePath,
  caCertificate,
  call,
  systemCertificates = getCACertificates,
}) {
  if (platform === 'darwin') {
    call('security', [
      'verify-cert',
      '-c',
      certificatePath,
      '-p',
      'ssl',
      '-s',
      'identity.equipment.test',
    ]);
    return;
  }
  if (platform !== 'win32')
    throw new OperationalFailure(
      'Local setup supports macOS and Windows hosts.',
    );
  const ca = new X509Certificate(caCertificate);
  if (
    !systemCertificates('system').some(
      (pem) => new X509Certificate(pem).fingerprint256 === ca.fingerprint256,
    )
  )
    throw new OperationalFailure(
      'Local CA is not trusted by Windows; explicitly run mkcert -install.',
    );
}

export function vmMemoryMiB({ platform, vm, call, experimental8GiB = false }) {
  if (experimental8GiB && platform !== 'win32')
    throw new OperationalFailure(
      'The experimental 8 GiB trial is Windows-only.',
    );
  const memory =
    platform === 'win32'
      ? Number(
          call('podman', [
            'machine',
            'ssh',
            "awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo",
          ]).trim(),
        )
      : vm?.Resources?.Memory;
  const minimum = experimental8GiB ? 7680 : 11000;
  if (!Number.isFinite(memory) || memory < minimum)
    throw new OperationalFailure(
      `Existing running rootful Podman VM requires >=${minimum} MiB; owner must make any VM changes.`,
    );
  return memory;
}
