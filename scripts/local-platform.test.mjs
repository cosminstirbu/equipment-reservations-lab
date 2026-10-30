import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { rootCertificates } from 'node:tls';
import {
  assertPrivatePath,
  createPrivateDirectory,
  verifySystemTrust,
  vmMemoryMiB,
} from './local-platform.mjs';

test(
  'Windows private state reuses verified empty directories, accepts protected inherited ACLs and rejects broad grants',
  {
    skip: process.platform !== 'win32',
  },
  (t) => {
    const parent = mkdtempSync(join(tmpdir(), 'equipment-private-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const state = join(parent, 'private');
    createPrivateDirectory(state);
    createPrivateDirectory(state);
    assertPrivatePath(state, 0o700);
    const secret = join(state, 'credentials.json');
    writeFileSync(secret, 'PRIVATE_MARKER');
    assertPrivatePath(state, 0o700);
    assertPrivatePath(secret, 0o600);
    execFileSync('icacls.exe', [secret, '/grant', '*S-1-1-0:R'], {
      stdio: 'pipe',
    });
    assert.throws(() => assertPrivatePath(secret, 0o600), /private|ACL/i);
    const inaccessible = join(state, 'missing-owner-grant.json');
    writeFileSync(inaccessible, 'PRIVATE_MARKER');
    execFileSync('icacls.exe', [inaccessible, '/inheritance:r'], {
      stdio: 'pipe',
    });
    try {
      assert.throws(
        () => assertPrivatePath(inaccessible, 0o600),
        /private|ACL/i,
      );
    } finally {
      execFileSync('icacls.exe', [inaccessible, '/inheritance:e'], {
        stdio: 'pipe',
      });
    }
  },
);

test('private state refuses links even when their target is private', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'equipment-private-link-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const state = join(parent, 'private');
  createPrivateDirectory(state);
  const link = join(parent, 'link');
  symlinkSync(state, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertPrivatePath(link, 0o700), /private|symlink/i);
});

test('macOS keeps its security trust verification and normal memory minimum', () => {
  const calls = [];
  verifySystemTrust({
    platform: 'darwin',
    certificatePath: '/private/leaf.crt',
    call: (command, args) => calls.push({ command, args }),
  });
  assert.deepEqual(calls, [
    {
      command: 'security',
      args: [
        'verify-cert',
        '-c',
        '/private/leaf.crt',
        '-p',
        'ssl',
        '-s',
        'identity.equipment.test',
      ],
    },
  ]);
  assert.throws(
    () =>
      verifySystemTrust({
        platform: 'darwin',
        certificatePath: '/private/leaf.crt',
        call: () => {
          throw new Error('trust rejected');
        },
      }),
    /trust rejected/,
  );
  assert.throws(
    () =>
      vmMemoryMiB({
        platform: 'darwin',
        vm: { Resources: { Memory: 8192 } },
      }),
    /11000/,
  );
  assert.throws(
    () =>
      vmMemoryMiB({
        platform: 'darwin',
        experimental8GiB: true,
      }),
    /Windows-only/,
  );
  assert.equal(
    vmMemoryMiB({
      platform: 'darwin',
      vm: { Resources: { Memory: 11000 } },
    }),
    11000,
  );
});

test('Windows requires the exact local CA in the operating system trust store', () => {
  const options = { platform: 'win32', caCertificate: rootCertificates[0] };
  verifySystemTrust({
    ...options,
    systemCertificates: () => [rootCertificates[0]],
  });
  assert.throws(
    () =>
      verifySystemTrust({
        ...options,
        systemCertificates: () => [rootCertificates[1]],
      }),
    /not trusted by Windows/,
  );
});

test('Windows reads guest memory and requires explicit opt-in for the 8 GiB trial', () => {
  const options = {
    platform: 'win32',
    vm: { Resources: { Memory: 2048 } },
    call: () => '7728',
  };
  assert.throws(() => vmMemoryMiB(options), /11000/);
  assert.equal(vmMemoryMiB({ ...options, experimental8GiB: true }), 7728);
  for (const value of ['4096', '', 'invalid'])
    assert.throws(
      () =>
        vmMemoryMiB({
          ...options,
          experimental8GiB: true,
          call: () => value,
        }),
      /7680/,
    );
});
