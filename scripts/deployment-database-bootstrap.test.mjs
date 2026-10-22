import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { cleanupAll, executeProcess, processFailure } from './process.mjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import parsers from '@stoplight/spectral-parsers';

const root = resolve(import.meta.dirname, '..');
const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
assert.ok(['podman', 'docker'].includes(runtime));
const failureTypes = new Set([
  'NpgsqlException',
  'PostgresException',
  'InvalidOperationException',
  'ArgumentException',
  'OperationCanceledException',
  'TimeoutException',
  'IOException',
  'UnauthorizedAccessException',
  'FormatException',
  'TypeInitializationException',
]);
function processResult(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0 || result.error)
    console.error(
      processFailure(result.error ?? result, {
        operation: 'DatabaseBootstrap provider query',
        tool: command,
        durationMs: performance.now() - started,
      }).message,
    );
  return result;
}
function command(program, args, label, options = {}) {
  let output = 'private-capture';
  if (program === 'git' || args[0] === 'kustomize' || args[0] === 'image')
    output = 'public-capture';
  if (
    program === 'tar' ||
    ['build', 'network', 'volume', 'rm'].includes(args[0])
  )
    output = 'stream';
  return executeProcess(program, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    operation: label,
    tool: program,
    output,
    ...options,
  }).trim();
}
function environment(container, configuration, bundle) {
  const result = { ...configuration };
  for (const entry of container.env ?? []) {
    const value = entry.valueFrom?.secretKeyRef
      ? bundle[entry.valueFrom.secretKeyRef.key]
      : entry.value;
    assert.equal(
      typeof value,
      'string',
      'production environment must resolve through public config/private fixture',
    );
    result[entry.name] = value.replace(
      /\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g,
      (match, key) => result[key] ?? match,
    );
  }
  return result;
}
function writeEnvironment(path, values) {
  writeFileSync(
    path,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
}

test(
  'production DatabaseBootstrap image provisions four scoped databases and safely reconciles retained state',
  { timeout: 900000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'equipment-db-process-'));
    chmodSync(directory, 0o700);
    const id = randomBytes(8).toString('hex');
    const network = `equipment-db-process-${id}`;
    const pg = `${network}-postgres`;
    const dashboard = `${network}-dashboard`;
    const bootstrap = `${network}-bootstrap`;
    const volume = `${network}-data`;
    const image = `localhost/${network}:candidate`;
    const created = {
      containers: new Set(),
      network: false,
      volume: false,
      image: false,
    };
    t.after(() =>
      cleanupAll([
        ...[...created.containers].map((name) => ({
          operation: 'remove database fixture container',
          run: () =>
            command(
              runtime,
              ['rm', '--force', name],
              'remove database fixture container',
              { timeout: 30000 },
            ),
        })),
        ...(created.volume
          ? [
              {
                operation: 'remove database fixture volume',
                run: () =>
                  command(
                    runtime,
                    ['volume', 'rm', volume],
                    'remove database fixture volume',
                    { timeout: 30000 },
                  ),
              },
            ]
          : []),
        ...(created.network
          ? [
              {
                operation: 'remove database fixture network',
                run: () =>
                  command(
                    runtime,
                    ['network', 'rm', network],
                    'remove database fixture network',
                    { timeout: 30000 },
                  ),
              },
            ]
          : []),
        ...(created.image
          ? [
              {
                operation: 'remove database fixture image',
                run: () =>
                  command(
                    runtime,
                    ['image', 'rm', image],
                    'remove database fixture image',
                    { timeout: 30000 },
                  ),
              },
            ]
          : []),
        {
          operation: 'remove database private fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ]),
    );
    const context = join(directory, 'source');
    mkdirSync(context, { mode: 0o700 });
    const revision = command(
      'git',
      ['rev-parse', 'HEAD'],
      'read source revision',
    );
    const archive = processResult('git', ['archive', 'HEAD'], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(
      archive.status,
      0,
      'tracked public source archive must be available',
    );
    const archivePath = join(directory, 'source.tar');
    writeFileSync(archivePath, archive.stdout, { mode: 0o600 });
    command(
      'tar',
      ['-xf', archivePath, '-C', context],
      'extract tracked public source',
    );
    const candidate = join(root, 'src/DatabaseBootstrap');
    const hashes = [];
    for (const file of readdirSync(candidate).filter(
      (name) => /\.(?:cs|csproj)$/.test(name) || name === 'packages.lock.json',
    )) {
      const path = join(candidate, file);
      assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
      copyFileSync(path, join(context, 'src/DatabaseBootstrap', file));
      hashes.push(
        `${file}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
      );
    }
    const buildArgs = [
      'build',
      '--file',
      join(context, 'deploy/images/bootstrap.Dockerfile'),
      '--build-arg',
      'PROJECT=DatabaseBootstrap',
      '--tag',
      image,
    ];
    if (runtime === 'podman')
      buildArgs.push(
        '--ignorefile',
        join(context, 'deploy/images/bootstrap.Dockerfile.dockerignore'),
      );
    buildArgs.push(context);
    command(
      runtime,
      buildArgs,
      'build exact production DatabaseBootstrap image',
      { timeout: 480000 },
    );
    created.image = true;
    console.log(
      `DatabaseBootstrap context revision=${revision}; source hashes=${hashes.join(',')}; image=${command(runtime, ['image', 'inspect', '--format', '{{.Id}}', image], 'read built image identity')}`,
    );
    const rendered = command(
      process.env.EQUIPMENT_KUBECTL ?? 'kubectl',
      ['kustomize', join(context, 'deploy/environments/local')],
      'render exact production environment',
    );
    const resources = rendered
      .split(/^---\s*$/m)
      .filter((part) => part.trim())
      .map((part) => parsers.Yaml.parse(part).data);
    const job = resources.find(
      (entry) =>
        entry.kind === 'Job' &&
        entry.metadata.labels?.['equipment.test/bootstrap'] === 'database',
    );
    const pod = job.spec.template.spec;
    const executable = pod.containers[0];
    const configuration = resources.find(
      (entry) =>
        entry.kind === 'ConfigMap' &&
        entry.metadata.name === executable.envFrom[0].configMapRef.name,
    ).data;
    const pgPod = resources.find(
      (entry) =>
        entry.kind === 'Deployment' && entry.metadata.name === 'postgres',
    ).spec.template.spec;
    const postgres = pgPod.containers[0];
    const dashboardPod = resources.find(
      (entry) =>
        entry.kind === 'Deployment' && entry.metadata.name === 'dashboard',
    ).spec.template.spec;
    const viewer = dashboardPod.containers[0];
    const bundle = Object.fromEntries(
      [
        'postgresAdmin',
        'inventoryDb',
        'reservationsDb',
        'notificationsDb',
        'keycloakDb',
        'dashboardBrowser',
        'dashboardOtlp',
        'dashboardApi',
      ].map((key) => [key, randomBytes(32).toString('hex')]),
    );
    const pgEnv = join(directory, 'postgres.env');
    const dashboardEnv = join(directory, 'dashboard.env');
    const cliEnv = join(directory, 'bootstrap.env');
    writeEnvironment(pgEnv, environment(postgres, {}, bundle));
    writeEnvironment(dashboardEnv, environment(viewer, {}, bundle));
    writeEnvironment(cliEnv, environment(executable, configuration, bundle));
    const ca = join(directory, 'ca.crt');
    command(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'ca.key'),
        '-out',
        ca,
        '-days',
        '1',
        '-subj',
        '/CN=Disposable bootstrap process CA',
      ],
      'create isolated public trust fixture',
    );
    chmodSync(join(directory, 'ca.key'), 0o600);
    chmodSync(ca, 0o444);
    command(
      runtime,
      ['network', 'create', network],
      'create isolated provider network',
    );
    created.network = true;
    command(
      runtime,
      ['volume', 'create', volume],
      'create isolated provider volume',
    );
    created.volume = true;
    command(
      runtime,
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--user',
        '0',
        '--entrypoint',
        'chown',
        '--mount',
        `type=volume,source=${volume},destination=/var/lib/postgresql`,
        postgres.image,
        '-R',
        '999:999',
        '/var/lib/postgresql',
      ],
      'prepare production-aligned volume ownership',
    );
    created.containers.add(pg);
    command(
      runtime,
      [
        'run',
        '--detach',
        '--name',
        pg,
        '--network',
        network,
        '--network-alias',
        'postgres',
        '--user',
        `${pgPod.securityContext.runAsUser}:${pgPod.securityContext.runAsGroup}`,
        '--memory',
        postgres.resources.limits.memory.replace('Mi', 'm'),
        '--cpus',
        '1',
        '--env-file',
        pgEnv,
        '--mount',
        `type=volume,source=${volume},destination=/var/lib/postgresql`,
        postgres.image,
      ],
      'start actual PostgreSQL',
    );
    created.containers.add(dashboard);
    command(
      runtime,
      [
        'run',
        '--detach',
        '--name',
        dashboard,
        '--network',
        network,
        '--network-alias',
        'dashboard',
        '--user',
        `${dashboardPod.securityContext.runAsUser}:${dashboardPod.securityContext.runAsGroup}`,
        '--memory',
        viewer.resources.limits.memory.replace('Mi', 'm'),
        '--cpus',
        '0.5',
        '--env-file',
        dashboardEnv,
        '--tmpfs',
        '/data:rw,size=128m,mode=1777',
        '--tmpfs',
        '/tmp:rw,size=16m,mode=1777',
        viewer.image,
      ],
      'start authenticated actual Dashboard',
    );
    const deadline = Date.now() + 60000;
    while (true) {
      const ready =
        processResult(
          runtime,
          [
            'exec',
            pg,
            'pg_isready',
            '--host',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            'postgres',
          ],
          { timeout: 5000 },
        ).status === 0;
      const viewerReady =
        processResult(
          runtime,
          [
            'exec',
            '--env',
            'BOOTSTRAP_FIXTURE_API_KEY',
            pg,
            'bash',
            '-c',
            'exec 3<>/dev/tcp/dashboard/18888; printf "GET /api/telemetry/resources HTTP/1.1\\r\\nHost: dashboard\\r\\nx-api-key: %s\\r\\nConnection: close\\r\\n\\r\\n" "$BOOTSTRAP_FIXTURE_API_KEY" >&3; IFS= read -r line <&3; [[ "$line" == *" 200 "* ]]',
          ],
          {
            timeout: 5000,
            env: {
              ...process.env,
              BOOTSTRAP_FIXTURE_API_KEY: bundle.dashboardApi,
            },
          },
        ).status === 0;
      if (ready && viewerReady) break;
      if (Date.now() >= deadline)
        throw new Error(
          `Real provider readiness exceeded60seconds: postgres=${ready}; dashboard=${viewerReady}.`,
        );
      await delay(250);
    }
    const invoke = () => {
      created.containers.add(bootstrap);
      const result = processResult(
        runtime,
        [
          'run',
          '--name',
          bootstrap,
          '--network',
          network,
          '--user',
          `${pod.securityContext.runAsUser}:${pod.securityContext.runAsGroup}`,
          '--memory',
          executable.resources.limits.memory.replace('Mi', 'm'),
          '--cpus',
          '0.5',
          '--ulimit',
          'core=0:0',
          '--env-file',
          cliEnv,
          '--mount',
          `type=bind,source=${ca},destination=/trust/ca.crt,ro=true`,
          image,
        ],
        { timeout: 150000 },
      );
      const reported = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.match(
        /Database provisioning failed \(([A-Za-z][A-Za-z0-9.]*)\)/,
      )?.[1];
      const failureType =
        result.status === 0
          ? 'None'
          : failureTypes.has(reported)
            ? reported
            : 'Other';
      console.log(
        `Production DatabaseBootstrap CLI exit=${Number.isInteger(result.status) ? result.status : 'unavailable'} failureType=${failureType}`,
      );
      assert.equal(
        result.status,
        0,
        `production bootstrap failed; safe failure type=${failureType}; private output suppressed`,
      );
      command(runtime, ['rm', bootstrap], 'remove completed bootstrap process');
      created.containers.delete(bootstrap);
    };
    invoke();
    const passwords = {
      inventory: bundle.inventoryDb,
      reservations: bundle.reservationsDb,
      notifications: bundle.notificationsDb,
      keycloak: bundle.keycloakDb,
    };
    const sql = (database, user, password, statement) =>
      processResult(
        runtime,
        [
          'exec',
          '--env',
          'PGPASSWORD',
          pg,
          'psql',
          '--host',
          '127.0.0.1',
          '--username',
          user,
          '--dbname',
          database,
          '--tuples-only',
          '--no-align',
          '--command',
          statement,
        ],
        { env: { ...process.env, PGPASSWORD: password }, timeout: 10000 },
      );
    for (const [database, password] of Object.entries(passwords)) {
      const loggedIn = sql(
        database,
        `${database}_app`,
        password,
        'SELECT current_user,current_database(),rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
      );
      assert.equal(
        loggedIn.status,
        0,
        'real scoped database login must succeed',
      );
      assert.equal(loggedIn.stdout.trim(), `${database}_app|${database}|f|f|f`);
      assert.notEqual(
        sql(
          database === 'inventory' ? 'reservations' : 'inventory',
          `${database}_app`,
          password,
          'SELECT 1',
        ).status,
        0,
        'cross-database login must fail',
      );
      if (database !== 'keycloak')
        assert.ok(
          Number(
            sql(
              database,
              `${database}_app`,
              password,
              'SELECT count(*) FROM schema_migrations',
            ).stdout.trim(),
          ) > 0,
          'production migrations must be applied',
        );
    }
    assert.equal(
      sql(
        'inventory',
        'inventory_app',
        bundle.inventoryDb,
        "UPDATE equipment SET name='Retained process marker' WHERE id='camera-001'",
      ).status,
      0,
    );
    invoke();
    const retained = sql(
      'inventory',
      'inventory_app',
      bundle.inventoryDb,
      "SELECT name FROM equipment WHERE id='camera-001'",
    );
    assert.equal(retained.status, 0);
    assert.equal(retained.stdout.trim(), 'Retained process marker');
    for (const [database, password] of Object.entries(passwords))
      assert.equal(
        sql(database, `${database}_app`, password, 'SELECT 1').status,
        0,
        'original private credentials must remain usable after rerun',
      );
  },
);
