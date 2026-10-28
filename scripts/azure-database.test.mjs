import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { executeProcess } from './process.mjs';
import { renderVerificationResources } from './azure-runtime.mjs';
import { recoveryFingerprintSql } from './azure-recovery.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'deploy/platform/azure/recovery');
const image =
  'docker.io/library/postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';
const databases = ['inventory', 'reservations', 'notifications', 'keycloak'];

test(
  'isolated verification PostgreSQL template starts with the pinned image and readonly nonroot boundary',
  {
    skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1',
    timeout: 120000,
  },
  async () => {
    const name = 'equipment-verification-contract-' + randomUUID();
    const container =
      renderVerificationResources('0123456789abcdef').job.spec.template.spec
        .containers[0];
    const env = { ...process.env, POSTGRES_PASSWORD: randomUUID() };
    for (const value of container.env)
      if (value.value) env[value.name] = value.value;
    const run = (args) =>
      executeProcess('podman', args, {
        operation: 'Pinned isolated verification server contract',
        tool: 'podman',
        output: 'private-capture',
        env,
        timeout: 90000,
      });
    let created = false;
    try {
      created = true;
      run([
        'run',
        '--detach',
        '--name',
        name,
        '--read-only',
        '--user',
        '999:999',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--tmpfs',
        '/data:mode=1777,size=64m',
        '--tmpfs',
        '/tmp:mode=1777,size=16m',
        '--tmpfs',
        '/var/run/postgresql:mode=1777,size=8m',
        ...container.env.flatMap(({ name }) => ['-e', name]),
        container.image,
        ...container.command,
        ...container.args,
      ]);
      let ready = false;
      for (let attempt = 0; attempt < 90; attempt++) {
        try {
          run(['exec', name, ...container.readinessProbe.exec.command]);
          ready = true;
          break;
        } catch {
          await wait(500);
        }
      }
      assert.ok(
        ready,
        'The exact isolated PostgreSQL server template did not become authenticated-ready.',
      );
    } finally {
      if (created) run(['rm', '--force', '--ignore', name]);
    }
  },
);

// Design: use the actual pinned PostgreSQL engine and reviewed SQL/HBA files.
// Credentials and all provider output stay in private process capture. No mocks
// establish SQL authorization, RLS completeness, or extension/schema ownership.
test('Azure recovery SQL grants only reviewed roles and rejects future databases in ordered HBA', () => {
  const sql = readFileSync(
    resolve(directory, 'database-bootstrap.sql'),
    'utf8',
  );
  const hba = readFileSync(resolve(directory, 'pg_hba.conf'), 'utf8');
  assert.match(sql, /NOBYPASSRLS/);
  assert.match(sql, /INHERIT FALSE/);
  assert.match(sql, /SET TRUE/);
  assert.ok(
    hba.indexOf('inventory,reservations,notifications,keycloak') <
      hba.indexOf('reject'),
  );
  assert.match(
    hba,
    /local\s+all\s+equipment_backup,equipment_restore\s+reject/,
  );
});

test(
  'pinned PostgreSQL enforces complete dumps, least privilege restore and unrelated database denial',
  {
    skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1',
    timeout: 180000,
  },
  async () => {
    const name = 'equipment-recovery-contract-' + randomUUID();
    const passwords = {
      POSTGRES_PASSWORD: randomUUID(),
      BACKUP_PASSWORD: randomUUID(),
      RESTORE_PASSWORD: randomUUID(),
    };
    const env = { ...process.env, ...passwords };
    const run = (args, input) =>
      executeProcess('podman', args, {
        operation: 'Pinned PostgreSQL recovery authorization contract',
        tool: 'podman',
        output: 'private-capture',
        env,
        input,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      });
    const sql = (statement, user = 'postgres', database = 'postgres') =>
      run(
        [
          'exec',
          '-i',
          '-e',
          'PGPASSWORD',
          name,
          'psql',
          '-X',
          '-qAt',
          '--set',
          'ON_ERROR_STOP=1',
          '-h',
          '127.0.0.1',
          '-U',
          user,
          '-d',
          database,
        ],
        statement,
      );
    // Each invocation supplies PGPASSWORD by environment, never an argument value.
    const query = (
      statement,
      user = 'postgres',
      database = 'postgres',
      password = passwords.POSTGRES_PASSWORD,
    ) => {
      env.PGPASSWORD = password;
      return sql(statement, user, database).trim();
    };
    let created = false;
    try {
      created = true;
      run([
        'run',
        '--detach',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD',
        '-e',
        'BACKUP_PASSWORD',
        '-e',
        'RESTORE_PASSWORD',
        '-v',
        `${resolve(directory, 'pg_hba.conf')}:/etc/equipment/pg_hba.conf:ro`,
        image,
        '-c',
        'hba_file=/etc/equipment/pg_hba.conf',
      ]);
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          query('SELECT 1;');
          ready = true;
          break;
        } catch {
          await wait(500);
        }
      }
      assert.ok(ready, 'Pinned PostgreSQL fixture did not become ready.');
      for (const database of databases) {
        query(
          `CREATE ROLE ${database}_app LOGIN PASSWORD 'fixture-application-only'; CREATE DATABASE ${database} OWNER ${database}_app; REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC;`,
        );
        query(
          `REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO ${database}_app; SET ROLE ${database}_app; CREATE TABLE marker(id integer PRIMARY KEY, value text, details jsonb); INSERT INTO marker VALUES(1, '${database}', '{"unicode":"é","nothing":null}'); CREATE SEQUENCE marker_seq; SELECT nextval('marker_seq');`,
          'postgres',
          database,
        );
      }
      query('CREATE EXTENSION btree_gist;', 'postgres', 'reservations');
      query(readFileSync(resolve(directory, 'database-bootstrap.sql'), 'utf8'));
      query(readFileSync(resolve(directory, 'database-bootstrap.sql'), 'utf8'));
      assert.equal(
        query(
          "SELECT rolname FROM pg_roles WHERE rolname IN ('equipment_backup','equipment_restore') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);",
        ),
        '',
      );
      for (const database of databases) {
        const before = query(
          recoveryFingerprintSql,
          'equipment_backup',
          database,
          passwords.BACKUP_PASSWORD,
        );
        assert.match(before, /public\.marker\|1\|[a-f0-9]{32}/);
        assert.match(before, /sequence\|marker_seq\|1/);
        assert.equal(
          query(
            'SELECT count(*) FROM marker;',
            'equipment_backup',
            database,
            passwords.BACKUP_PASSWORD,
          ),
          '1',
        );
        assert.throws(() =>
          query(
            "INSERT INTO marker VALUES(2, 'forbidden');",
            'equipment_backup',
            database,
            passwords.BACKUP_PASSWORD,
          ),
        );
        assert.throws(() =>
          query(
            'CREATE TABLE forbidden(id int);',
            'equipment_restore',
            database,
            passwords.RESTORE_PASSWORD,
          ),
        );
        env.PGPASSWORD = passwords.BACKUP_PASSWORD;
        const dump = run([
          'exec',
          '-e',
          'PGPASSWORD',
          name,
          'pg_dump',
          '--no-owner',
          '--no-privileges',
          '-h',
          '127.0.0.1',
          '-U',
          'equipment_backup',
          '-d',
          database,
        ]);
        assert.doesNotMatch(dump, /CREATE ROLE|PASSWORD/);
        query(
          `SET ROLE ${database}_app; DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n${dump}`,
          'equipment_restore',
          database,
          passwords.RESTORE_PASSWORD,
        );
        assert.equal(
          query(
            'SELECT value FROM marker;',
            `${database}_app`,
            database,
            'fixture-application-only',
          ),
          database,
        );
        assert.equal(
          query(
            recoveryFingerprintSql,
            'equipment_backup',
            database,
            passwords.BACKUP_PASSWORD,
          ),
          before,
        );
      }
      assert.equal(
        query(
          "SELECT extname FROM pg_extension WHERE extname='btree_gist';",
          'reservations_app',
          'reservations',
          'fixture-application-only',
        ),
        'btree_gist',
      );
      query('CREATE DATABASE unrelated; CREATE DATABASE future_public;');
      env.PGPASSWORD = passwords.POSTGRES_PASSWORD;
      const connection = (host, user, database) =>
        run(
          [
            'exec',
            '--user',
            '999:999',
            '-i',
            '-e',
            'PGPASSWORD',
            name,
            'psql',
            '-X',
            '-qAt',
            '--set',
            'ON_ERROR_STOP=1',
            '-h',
            host,
            '-U',
            user,
            '-d',
            database,
          ],
          'SELECT 1;',
        ).trim();
      assert.equal(
        connection('/var/run/postgresql', 'postgres', 'postgres'),
        '1',
      );
      assert.equal(connection('::1', 'postgres', 'postgres'), '1');
      for (const user of ['equipment_backup', 'equipment_restore']) {
        const password =
          user === 'equipment_backup'
            ? passwords.BACKUP_PASSWORD
            : passwords.RESTORE_PASSWORD;
        for (const database of [
          'postgres',
          'template1',
          'unrelated',
          'future_public',
        ])
          assert.throws(() => query('SELECT 1;', user, database, password));
        env.PGPASSWORD = password;
        assert.throws(() =>
          connection('/var/run/postgresql', user, 'inventory'),
        );
        assert.throws(() => connection('::1', user, 'future_public'));
        assert.throws(() =>
          query('SET ROLE postgres;', user, 'inventory', password),
        );
        assert.throws(() =>
          query('CREATE ROLE forbidden;', user, 'inventory', password),
        );
      }
      query(
        'SET ROLE inventory_app; ALTER TABLE marker ENABLE ROW LEVEL SECURITY; ALTER TABLE marker FORCE ROW LEVEL SECURITY; CREATE POLICY none ON marker USING(false);',
        'postgres',
        'inventory',
      );
      env.PGPASSWORD = passwords.BACKUP_PASSWORD;
      assert.throws(
        () =>
          query(
            recoveryFingerprintSql,
            'equipment_backup',
            'inventory',
            passwords.BACKUP_PASSWORD,
          ),
        'RLS must fail fingerprinting rather than silently omit rows.',
      );
      assert.throws(
        () =>
          run([
            'exec',
            '-e',
            'PGPASSWORD',
            name,
            'pg_dump',
            '--no-owner',
            '--no-privileges',
            '-h',
            '127.0.0.1',
            '-U',
            'equipment_backup',
            '-d',
            'inventory',
          ]),
        'RLS must fail the backup rather than silently omit rows.',
      );
    } finally {
      if (created) run(['rm', '--force', '--ignore', name]);
    }
  },
);
