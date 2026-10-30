import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, X509Certificate } from 'node:crypto';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';
import { executeProcess } from './process.mjs';
import {
  stageAzureFixture,
  removeAzureFixtureDirectory,
} from './azure-runtime-fixture.mjs';

const root = resolve(import.meta.dirname, '..');

// Design: run the actual pinned Dashboard with the complete rendered Azure env,
// production CPU/memory limits and normal TLS verification. A discovery-only
// HTTPS IdP double implements OpenID Connect Discovery 1.0 metadata/JWKS; the
// Dashboard itself constructs the authorization challenge/callback. No token
// exchange, Entra role authorization or browser login is claimed by this test.
// Provider contract: https://github.com/microsoft/aspire/blob/main/src/Aspire.Dashboard/README.md
test(
  'pinned Azure Dashboard starts with OIDC and enforces separate API and encrypted OTLP keys with the actual callback',
  {
    skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1',
    timeout: 180000,
  },
  async () => {
    const temporary = mkdtempSync(
      resolve(tmpdir(), 'equipment-azure-dashboard-'),
    );
    const pod = 'equipment-azure-dashboard-' + randomUUID();
    const credentials = {
      dashboardApi: randomUUID(),
      dashboardOtlp: randomUUID(),
      oidcClientSecret: randomUUID(),
    };
    const run = (args, env = process.env) =>
      executeProcess('podman', args, {
        operation: 'Pinned Azure Dashboard provider contract',
        tool: 'podman',
        output: 'private-capture',
        env,
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const http = (
      port,
      path,
      { key, otlp = false, body, method = 'GET', ca, cookie } = {},
    ) =>
      new Promise((accept, reject) => {
        const operation = (ca ? secureRequest : request)(
          {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            ...(ca ? { ca } : {}),
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              ...(!ca
                ? {
                    Host: 'dashboard.codingfunlab.com',
                    'X-Forwarded-Proto': 'https',
                    'X-Forwarded-Host': 'dashboard.codingfunlab.com',
                  }
                : {}),
              ...(key ? { [otlp ? 'x-otlp-api-key' : 'x-api-key']: key } : {}),
              ...(body
                ? {
                    'Content-Type': 'application/x-protobuf',
                    'Content-Length': body.length,
                  }
                : {}),
            },
          },
          (response) => {
            let size = 0;
            response.on('data', (data) => {
              size += data.length;
              if (size > 65536)
                operation.destroy(
                  new Error('Dashboard fixture response exceeded its bound.'),
                );
            });
            response.on('end', () =>
              accept({
                status: response.statusCode,
                headers: response.headers,
              }),
            );
            response.on('error', () =>
              reject(new Error('Dashboard fixture response failed.')),
            );
          },
        );
        operation.setTimeout(5000, () =>
          operation.destroy(new Error('Dashboard fixture request timed out.')),
        );
        operation.on('error', (error) =>
          reject(
            new Error(
              `Dashboard fixture transport failed (${['ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code) ? error.code : 'other'}).`,
            ),
          ),
        );
        operation.end(body);
      });
    let created = false;
    try {
      const fixture = resolve(temporary, 'repository');
      stageAzureFixture(fixture);
      const kubectl =
        process.env.KUBECTL ??
        (process.platform === 'win32'
          ? resolve(root, '.cache/promotion-tools/kubectl.exe')
          : 'kubectl');
      const documents = executeProcess(
        kubectl,
        ['kustomize', resolve(fixture, 'deploy/environments/azure')],
        {
          operation: 'Complete Azure Dashboard render',
          tool: 'kubectl',
          output: 'private-capture',
          timeout: 30000,
          maxBuffer: 8 * 1024 * 1024,
        },
      )
        .split(/^---\s*$/m)
        .filter((part) => part.trim())
        .map((part) => parsers.Yaml.parse(part).data);
      const deployment = documents.find(
        (item) =>
          item.kind === 'Deployment' && item.metadata.name === 'dashboard',
      );
      const dashboard = deployment.spec.template.spec.containers[0];
      const environment = { ...process.env };
      for (const entry of dashboard.env) {
        if (entry.value !== undefined) environment[entry.name] = entry.value;
        else {
          const key = entry.valueFrom?.secretKeyRef?.key;
          assert.ok(
            Object.hasOwn(credentials, key),
            'Dashboard fixture requires an explicitly modeled private credential.',
          );
          environment[entry.name] = credentials[key];
        }
      }
      assert.equal(environment.Dashboard__Frontend__AuthMode, 'OpenIdConnect');
      assert.equal(
        environment.Dashboard__Frontend__OpenIdConnect__RequiredClaimType,
        'roles',
      );
      assert.equal(
        environment.Dashboard__Frontend__OpenIdConnect__RequiredClaimValue,
        'Equipment.Operator',
      );
      assert.equal(
        dashboard.env.some(
          (entry) => entry.name === 'Dashboard__Frontend__BrowserToken',
        ),
        false,
      );
      const tls = resolve(temporary, 'tls');
      mkdirSync(tls);
      const openssl =
        process.platform === 'win32'
          ? 'C:/Program Files/Git/usr/bin/openssl.exe'
          : 'openssl';
      executeProcess(
        openssl,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          resolve(tls, 'tls.key'),
          '-out',
          resolve(tls, 'tls.crt'),
          '-days',
          '1',
          '-subj',
          '/CN=oidc.fixture.test',
          '-addext',
          'subjectAltName=DNS:oidc.fixture.test,DNS:localhost,IP:127.0.0.1',
        ],
        {
          operation: 'Ephemeral Dashboard TLS fixture',
          tool: 'openssl',
          output: 'private-capture',
          timeout: 30000,
        },
      );
      chmodSync(resolve(tls, 'tls.key'), 0o644);
      const ca = readFileSync(resolve(tls, 'tls.crt'));
      const issuer = 'https://oidc.fixture.test:8444';
      const discovery = {
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile'],
      };
      const jwk = new X509Certificate(ca).publicKey.export({ format: 'jwk' });
      const configuration = `worker_processes 1; pid /tmp/nginx.pid; error_log /dev/null crit; events {worker_connections 32;} http {access_log off; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; server {listen 8444 ssl; ssl_certificate /internal-tls/tls.crt; ssl_certificate_key /internal-tls/tls.key; location = /.well-known/openid-configuration {default_type application/json; return 200 '${JSON.stringify(discovery)}';} location = /jwks {default_type application/json; return 200 '${JSON.stringify({ keys: [{ ...jwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] })}';} location / {return 404;}}}`;
      writeFileSync(resolve(temporary, 'oidc.conf'), configuration);
      environment.Authentication__Schemes__OpenIdConnect__Authority = issuer;
      environment.SSL_CERT_FILE = '/internal-tls/tls.crt';
      created = true;
      run([
        'pod',
        'create',
        '--name',
        pod,
        '--add-host',
        'oidc.fixture.test:127.0.0.1',
        '--publish',
        '127.0.0.1::18888',
        '--publish',
        '127.0.0.1::18890',
      ]);
      const proxy = JSON.parse(
        readFileSync(
          resolve(root, 'deploy/platform/azure/recovery/monitor/pod.json'),
          'utf8',
        ),
      ).spec.containers[0].image;
      run([
        'run',
        '--detach',
        '--name',
        pod + '-idp',
        '--pod',
        pod,
        '--read-only',
        '--user',
        '101:101',
        '--cap-drop',
        'ALL',
        '--tmpfs',
        '/tmp:mode=1777,size=16m',
        '-v',
        `${tls}:/internal-tls:ro`,
        '-v',
        `${resolve(temporary, 'oidc.conf')}:/configuration/nginx.conf:ro`,
        '--entrypoint',
        'nginx',
        proxy,
        '-c',
        '/configuration/nginx.conf',
        '-g',
        'daemon off;',
      ]);
      run(
        [
          'run',
          '--detach',
          '--name',
          pod + '-dashboard',
          '--pod',
          pod,
          '--read-only',
          '--user',
          `${deployment.spec.template.spec.securityContext.runAsUser}:${deployment.spec.template.spec.securityContext.runAsGroup}`,
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--memory',
          dashboard.resources.limits.memory.replace('Mi', 'm'),
          '--memory-reservation',
          dashboard.resources.requests.memory.replace('Mi', 'm'),
          '--cpus',
          String(
            Number(dashboard.resources.limits.cpu.replace('m', '')) / 1000,
          ),
          '--tmpfs',
          '/home/app:mode=1777,size=64m',
          '--tmpfs',
          '/tmp:mode=1777,size=16m',
          '-v',
          `${tls}:/internal-tls:ro`,
          ...Object.keys(environment)
            .filter(
              (key) =>
                dashboard.env.some((entry) => entry.name === key) ||
                key === 'SSL_CERT_FILE',
            )
            .flatMap((key) => ['-e', key]),
          dashboard.image,
        ],
        environment,
      );
      const port = (value) =>
        Number(
          run(['port', pod + '-dashboard', `${value}/tcp`])
            .trim()
            .match(/127\.0\.0\.1:(\d+)/)?.[1],
        );
      const apiPort = port(18888);
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        try {
          if (
            (
              await http(apiPort, '/api/telemetry/resources', {
                key: credentials.dashboardApi,
              })
            ).status === 200
          ) {
            ready = true;
            break;
          }
        } catch {
          // The bounded readiness loop tolerates connection refusal while the provider starts.
        }
        if (
          attempt % 10 === 9 &&
          JSON.parse(run(['inspect', pod + '-dashboard']))[0].State.Status ===
            'exited'
        )
          break;
        await wait(500);
      }
      assert.ok(
        ready,
        'Pinned Dashboard did not become authenticated-ready with the production OIDC/TLS/resource configuration.',
      );
      for (const key of [undefined, 'wrong-fixture-key'])
        assert.equal(
          (await http(apiPort, '/api/telemetry/resources', { key })).status,
          401,
        );
      const otlpPort = port(18890);
      for (const key of [undefined, 'wrong-fixture-key'])
        assert.equal(
          (
            await http(otlpPort, '/v1/logs', {
              key,
              otlp: true,
              method: 'POST',
              body: Buffer.alloc(0),
              ca,
            })
          ).status,
          401,
        );
      assert.equal(
        (
          await http(otlpPort, '/v1/logs', {
            key: credentials.dashboardOtlp,
            otlp: true,
            method: 'POST',
            body: Buffer.alloc(0),
            ca,
          })
        ).status,
        200,
      );
      const challenge = await http(apiPort, '/resources');
      assert.equal(challenge.status, 302);
      const target = new URL(challenge.headers.location);
      assert.equal(target.origin, issuer);
      assert.equal(target.pathname, '/authorize');
      assert.equal(
        target.searchParams.get('redirect_uri'),
        'https://dashboard.codingfunlab.com/',
      );
      assert.notEqual(
        target.searchParams.get('redirect_uri'),
        'https://dashboard.codingfunlab.com/signin-oidc',
      );
      const invalidCallback = await http(
        apiPort,
        '/?code=fixture-only-code&state=fixture-only-invalid-state',
      );
      const cookie = (invalidCallback.headers['set-cookie'] ?? [])
        .map((value) => value.split(';')[0])
        .join('; ');
      const afterInvalid = await http(apiPort, '/resources', { cookie });
      assert.equal(
        afterInvalid.status,
        302,
        'An unsolicited invalid callback must not create an authenticated session.',
      );
      assert.equal(new URL(afterInvalid.headers.location).origin, issuer);
      const logs =
        run(['logs', pod + '-dashboard']) + run(['logs', pod + '-idp']);
      for (const value of Object.values(credentials))
        assert.equal(logs.includes(value), false);
    } finally {
      const failures = [];
      if (created) {
        try {
          run(['pod', 'rm', '--force', '--ignore', pod]);
        } catch {
          failures.push('fixture pod');
        }
      }
      try {
        removeAzureFixtureDirectory(temporary, 'equipment-azure-dashboard-');
      } catch {
        failures.push('fixture files');
      }
      assert.deepEqual(
        failures,
        [],
        'Owned Dashboard provider cleanup failed.',
      );
    }
  },
);
