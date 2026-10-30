import {
  validateGeneratorInput,
  generatorInputHash,
  generatorInputSchemaVersion,
} from './azure-generator-input.mjs';

export function renderVerificationResources(pointHash) {
  if (typeof pointHash !== 'string' || !/^[a-f0-9]{16}$/.test(pointHash))
    throw new Error(
      'Verification requires an exact lowercase sixteen-character point hash.',
    );
  const name = `equipment-verify-${pointHash}`;
  const labels = {
    'equipment.verify/point': pointHash,
    'azure.workload.identity/use': 'true',
  };
  const metadata = { name, namespace: 'equipment-recovery', labels };
  const probe = {
    exec: {
      command: [
        '/bin/sh',
        '-ec',
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h 127.0.0.1 -U verification_admin -d postgres --set ON_ERROR_STOP=1 -Atc "SELECT 1" >/dev/null 2>&1',
      ],
    },
    periodSeconds: 5,
    timeoutSeconds: 3,
    failureThreshold: 3,
  };
  return {
    host: `${name}.equipment-recovery.svc`,
    service: {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: globalThis.structuredClone(metadata),
      spec: {
        type: 'ClusterIP',
        selector: labels,
        ports: [
          { name: 'postgres', port: 5432, targetPort: 5432, protocol: 'TCP' },
        ],
      },
    },
    job: {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: globalThis.structuredClone(metadata),
      spec: {
        activeDeadlineSeconds: 600,
        ttlSecondsAfterFinished: 300,
        backoffLimit: 0,
        template: {
          metadata: { labels },
          spec: {
            serviceAccountName: 'equipment-verification-server',
            dnsPolicy: 'ClusterFirst',
            schedulerName: 'default-scheduler',
            automountServiceAccountToken: false,
            enableServiceLinks: false,
            restartPolicy: 'Never',
            terminationGracePeriodSeconds: 10,
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 999,
              runAsGroup: 999,
              fsGroup: 999,
              seccompProfile: { type: 'RuntimeDefault' },
            },
            containers: [
              {
                name: 'postgres',
                image:
                  'docker.io/library/postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336',
                imagePullPolicy: 'IfNotPresent',
                command: ['docker-entrypoint.sh'],
                args: [
                  'postgres',
                  '-c',
                  'log_statement=none',
                  '-c',
                  'log_min_error_statement=panic',
                  '-c',
                  'max_connections=10',
                ],
                env: [
                  { name: 'POSTGRES_USER', value: 'verification_admin' },
                  { name: 'POSTGRES_DB', value: 'postgres' },
                  { name: 'PGDATA', value: '/data/pgdata' },
                  {
                    name: 'POSTGRES_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'equipment-verification-server-credentials',
                        key: 'postgresPassword',
                      },
                    },
                  },
                ],
                ports: [
                  { name: 'postgres', containerPort: 5432, protocol: 'TCP' },
                ],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  capabilities: { drop: ['ALL'] },
                },
                startupProbe: {
                  ...globalThis.structuredClone(probe),
                  failureThreshold: 60,
                },
                readinessProbe: globalThis.structuredClone(probe),
                livenessProbe: globalThis.structuredClone(probe),
                volumeMounts: [
                  { name: 'data', mountPath: '/data' },
                  { name: 'tmp', mountPath: '/tmp' },
                  { name: 'run', mountPath: '/var/run/postgresql' },
                  {
                    name: 'credentials',
                    mountPath: '/mnt/secrets-store',
                    readOnly: true,
                  },
                ],
              },
            ],
            volumes: [
              { name: 'data', emptyDir: { sizeLimit: '1Gi' } },
              { name: 'tmp', emptyDir: { sizeLimit: '16Mi' } },
              { name: 'run', emptyDir: { sizeLimit: '8Mi' } },
              {
                name: 'credentials',
                csi: {
                  driver: 'secrets-store.csi.k8s.io',
                  readOnly: true,
                  volumeAttributes: {
                    secretProviderClass: 'equipment-verification-server',
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
}

export const workloadSecrets = Object.freeze({
  postgres: { postgresAdmin: 'postgres-admin' },
  'database-bootstrap': {
    postgresAdmin: 'postgres-admin',
    inventoryDb: 'inventory-db',
    reservationsDb: 'reservations-db',
    notificationsDb: 'notifications-db',
    keycloakDb: 'keycloak-db',
    otlpToken: 'database-bootstrap-otlp',
  },
  keycloak: { keycloakDb: 'keycloak-db', identityAdmin: 'identity-admin' },
  'identity-bootstrap': {
    identityAdmin: 'identity-admin',
    alice: 'alice',
    bob: 'bob',
    manager: 'manager',
    staff: 'staff',
    reservationsClient: 'reservations-client',
    otlpToken: 'identity-bootstrap-otlp',
  },
  inventory: { inventoryDb: 'inventory-db', otlpToken: 'inventory-otlp' },
  reservations: {
    reservationsDb: 'reservations-db',
    reservationsClient: 'reservations-client',
    rabbitPublisher: 'rabbit-publisher',
    otlpToken: 'reservations-otlp',
  },
  notifications: {
    notificationsDb: 'notifications-db',
    rabbitConsumer: 'rabbit-consumer',
    otlpToken: 'notifications-otlp',
  },
  rabbitmq: {
    monitorDefinitions: 'broker-monitor-definitions',
    rabbitAdmin: 'rabbit-admin',
    rabbitPublisher: 'rabbit-publisher',
    rabbitConsumer: 'rabbit-consumer',
    brokerAdminSalt: 'broker-admin-salt',
    brokerPublisherSalt: 'broker-publisher-salt',
    brokerConsumerSalt: 'broker-consumer-salt',
    otlpToken: 'broker-bootstrap-otlp',
  },
  dashboard: {
    dashboardApi: 'dashboard-api',
    dashboardOtlp: 'dashboard-otlp',
    oidcClientSecret: 'dashboard-oidc-client-secret',
  },
  argocd: { oidcClientSecret: 'argocd-oidc-client-secret' },
  'otel-collector': {
    inventoryToken: 'inventory-otlp',
    reservationsToken: 'reservations-otlp',
    notificationsToken: 'notifications-otlp',
    databaseBootstrapToken: 'database-bootstrap-otlp',
    identityBootstrapToken: 'identity-bootstrap-otlp',
    brokerBootstrapToken: 'broker-bootstrap-otlp',
    dashboardOtlp: 'dashboard-otlp',
    prometheusToken: 'prometheus-api-token',
    lokiToken: 'loki-api-token',
    tempoToken: 'tempo-api-token',
  },
  prometheus: { apiToken: 'prometheus-api-token' },
  loki: { apiToken: 'loki-api-token' },
  tempo: { apiToken: 'tempo-api-token' },
  grafana: {
    adminPassword: 'grafana-admin-password',
    prometheusToken: 'prometheus-api-token',
    lokiToken: 'loki-api-token',
    tempoToken: 'tempo-api-token',
  },
});

for (const secrets of Object.values(workloadSecrets)) Object.freeze(secrets);

// Deliberately separate from initial application secret population. Real values
// and authority activate only after hosted identity qualification and review.
export const recoveryWorkloadSecrets = Object.freeze({
  'equipment-backup-client': Object.freeze({
    postgresPassword: 'backup-postgres-password',
    verificationPassword: 'verification-postgres-password',
  }),
  'equipment-restore-client': Object.freeze({
    postgresPassword: 'restore-postgres-password',
  }),
  'equipment-verification-server': Object.freeze({
    postgresPassword: 'verification-postgres-password',
  }),
  'recovery-database-bootstrap': Object.freeze({
    postgresAdmin: 'postgres-admin',
    backupPassword: 'backup-postgres-password',
    restorePassword: 'restore-postgres-password',
  }),
});

const json = (value) => JSON.stringify(value, null, 2) + '\n';
const annotation = {
  'argocd.argoproj.io/sync-wave': '-50',
  'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false',
};
const namespaceFor = (name) =>
  name.startsWith('equipment-')
    ? 'equipment-recovery'
    : name === 'argocd'
      ? 'argocd'
      : ['otel-collector', 'prometheus', 'loki', 'tempo', 'grafana'].includes(
            name,
          )
        ? 'equipment-platform'
        : 'equipment';

function identities(config, environment, inventory = workloadSecrets) {
  return Object.entries(inventory).flatMap(([name, keys]) => {
    const namespace = namespaceFor(name);
    const identityName =
      name === 'recovery-database-bootstrap' ? 'database-bootstrap' : name;
    return [
      {
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: {
          name,
          namespace,
          annotations: {
            ...annotation,
            'azure.workload.identity/client-id':
              environment.workload_client_ids[identityName],
          },
        },
        automountServiceAccountToken: false,
      },
      {
        apiVersion: 'secrets-store.csi.x-k8s.io/v1',
        kind: 'SecretProviderClass',
        metadata: { name, namespace, annotations: annotation },
        spec: {
          provider: 'azure',
          parameters: {
            usePodIdentity: 'false',
            clientID: environment.workload_client_ids[identityName],
            keyvaultName: environment.workload_key_vault_name,
            tenantId: config.tenantId,
            objects:
              'array:\n' +
              Object.values(keys)
                .map(
                  (objectName) =>
                    `  - |\n    objectName: ${objectName}\n    objectType: secret\n    objectVersion: ""`,
                )
                .join('\n'),
          },
          secretObjects: [
            {
              secretName: name + '-credentials',
              ...(name === 'argocd'
                ? { labels: { 'app.kubernetes.io/part-of': 'argocd' } }
                : {}),
              type: 'Opaque',
              data: Object.entries(keys).map(([key, objectName]) => ({
                key,
                objectName,
              })),
            },
          ],
        },
      },
    ];
  });
}

export function renderRuntimeProjection(input) {
  const { config, foundation, environment } = validateGeneratorInput(input);
  const outputHash = generatorInputHash({ config, foundation, environment });
  const metadata = {
    version: generatorInputSchemaVersion,
    generation: config.generation,
    sourceRevision: config.gitRevision,
    outputHash,
  };
  const all = identities(config, environment);
  const application = all.filter(
    (item) => item.metadata.namespace === 'equipment',
  );
  const platform = all.filter(
    (item) => item.metadata.namespace !== 'equipment',
  );
  const certificateClient = environment.workload_client_ids['cert-manager'];
  const certManagerPatch = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: 'cert-manager',
      namespace: 'cert-manager',
      annotations: {
        'azure.workload.identity/client-id': certificateClient,
      },
    },
  };
  for (const [name, server] of [
    [
      'letsencrypt-staging',
      'https://acme-staging-v02.api.letsencrypt.org/directory',
    ],
    [
      'letsencrypt-production',
      'https://acme-v02.api.letsencrypt.org/directory',
    ],
  ]) {
    platform.push({
      apiVersion: 'cert-manager.io/v1',
      kind: 'ClusterIssuer',
      metadata: { name, annotations: annotation },
      spec: {
        acme: {
          server,
          privateKeySecretRef: { name: name + '-account' },
          solvers: [
            {
              selector: { dnsZones: [config.domain] },
              dns01: {
                azureDNS: {
                  subscriptionID: config.subscriptionId,
                  resourceGroupName: foundation.dns_zone_resource_group_name,
                  hostedZoneName: config.domain,
                  environment: 'AzurePublicCloud',
                  managedIdentity: { clientID: certificateClient },
                },
              },
            },
          ],
        },
      },
    });
  }
  for (const namespace of ['equipment', 'argocd']) {
    const objects = namespace === 'equipment' ? application : platform;
    objects.push({
      apiVersion: 'traefik.io/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'operator-source', namespace, annotations: annotation },
      spec: { ipAllowList: { sourceRange: config.operatorCidrs } },
    });
  }
  const dashboardPatch = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'dashboard' },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'dashboard',
              env: [
                {
                  name: 'Authentication__Schemes__OpenIdConnect__Authority',
                  value: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
                },
                {
                  name: 'Authentication__Schemes__OpenIdConnect__ClientId',
                  value: foundation.operator_client_ids.dashboard,
                },
              ],
            },
          ],
        },
      },
    },
  };
  const ingressPatch = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'traefik',
      namespace: 'equipment-platform',
      annotations: {
        'service.beta.kubernetes.io/azure-load-balancer-resource-group':
          environment.ingress_public_ip_resource_group_name,
        'service.beta.kubernetes.io/azure-load-balancer-ipv4':
          environment.ingress_public_ip,
      },
    },
    spec: { loadBalancerIP: environment.ingress_public_ip },
  };
  const component = {
    apiVersion: 'kustomize.config.k8s.io/v1alpha1',
    kind: 'Component',
    resources: ['identities.json'],
  };
  const argoPatches = [
    {
      kind: 'ServiceAccount',
      name: 'argocd-server',
      namespace: 'argocd',
      type: 'merge',
      patch: {
        metadata: {
          annotations: {
            'azure.workload.identity/client-id':
              environment.workload_client_ids.argocd,
          },
        },
      },
    },
    {
      kind: 'Deployment',
      name: 'argocd-server',
      namespace: 'argocd',
      type: 'strategic',
      patch: {
        spec: {
          template: {
            metadata: { labels: { 'azure.workload.identity/use': 'true' } },
            spec: {
              volumes: [
                {
                  name: 'azure-secrets',
                  csi: {
                    driver: 'secrets-store.csi.k8s.io',
                    readOnly: true,
                    volumeAttributes: { secretProviderClass: 'argocd' },
                  },
                },
              ],
              containers: [
                {
                  name: 'argocd-server',
                  volumeMounts: [
                    {
                      name: 'azure-secrets',
                      mountPath: '/mnt/azure-secrets',
                      readOnly: true,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      kind: 'ConfigMap',
      name: 'argocd-cm',
      namespace: 'argocd',
      type: 'merge',
      patch: {
        data: {
          url: 'https://argocd.codingfunlab.com',
          'admin.enabled': 'false',
          'users.anonymous.enabled': 'false',
          'oidc.config': `name: Microsoft Entra ID\nissuer: https://login.microsoftonline.com/${config.tenantId}/v2.0\nclientID: ${foundation.operator_client_ids.argocd}\nclientSecret: $argocd-credentials:oidcClientSecret\nrequestedScopes: [openid, profile, email]\nrequestedIDTokenClaims:\n  roles:\n    essential: true\nenablePKCEAuthentication: true\n`,
        },
      },
    },
    {
      kind: 'ConfigMap',
      name: 'argocd-rbac-cm',
      namespace: 'argocd',
      type: 'merge',
      patch: {
        data: {
          'policy.default': '',
          'policy.csv': 'g, Equipment.Operator, role:admin',
          scopes: '[roles]',
        },
      },
    },
    {
      kind: 'ConfigMap',
      name: 'argocd-cmd-params-cm',
      namespace: 'argocd',
      type: 'merge',
      patch: { data: { 'server.insecure': 'true' } },
    },
  ];
  return {
    generation: config.generation,
    outputHash,
    recoveryFiles: {
      'kustomization.yaml': json({
        ...component,
        resources: ['identities.json', 'bindings.json'],
      }),
      'bindings.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: [
          ...['backup', 'restore'].map((actor) => ({
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'RoleBinding',
            metadata: {
              name: `equipment-recovery-${actor}`,
              namespace: 'equipment-recovery',
              annotations: annotation,
            },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'Role',
              name: `equipment-recovery-${actor}`,
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: foundation.github_principal_ids[actor],
              },
            ],
          })),
          {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'RoleBinding',
            metadata: {
              name: 'equipment-recovery-backup-scale',
              namespace: 'equipment',
              annotations: annotation,
            },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'Role',
              name: 'equipment-recovery-backup-scale',
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: foundation.github_principal_ids.backup,
              },
            ],
          },
          {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'RoleBinding',
            metadata: {
              name: 'equipment-recovery-restore-scale',
              namespace: 'equipment',
              annotations: annotation,
            },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'Role',
              name: 'equipment-recovery-restore-scale',
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: foundation.github_principal_ids.restore,
              },
            ],
          },
        ],
      }),
      'identities.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: identities(config, environment, recoveryWorkloadSecrets).filter(
          (item) =>
            !(
              item.kind === 'ServiceAccount' &&
              item.metadata.name === 'recovery-database-bootstrap'
            ),
        ),
      }),
      'projection.json': json(metadata),
    },
    applicationFiles: {
      'kustomization.yaml': json({
        ...component,
        patches: [{ patch: JSON.stringify(dashboardPatch) }],
      }),
      'identities.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: application,
      }),
      'projection.json': json(metadata),
    },
    platformFiles: {
      'recovery-continuity-bindings.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: ['backup', 'restore'].flatMap((actor) => [
          ...['cert-manager', 'argocd'].map((namespace) => ({
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'RoleBinding',
            metadata: {
              name: `equipment-recovery-${actor}-continuity`,
              namespace,
              annotations: annotation,
            },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'Role',
              name: `equipment-recovery-${actor}-continuity`,
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: foundation.github_principal_ids[actor],
              },
            ],
          })),
          {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRoleBinding',
            metadata: {
              name: `equipment-recovery-${actor}-issuers`,
              annotations: annotation,
            },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'ClusterRole',
              name: `equipment-recovery-${actor}-issuers`,
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: foundation.github_principal_ids[actor],
              },
            ],
          },
        ]),
      }),
      'recovery-qualification-bindings.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: ['backup', 'restore'].map((actor) => ({
          apiVersion: 'rbac.authorization.k8s.io/v1',
          kind: 'RoleBinding',
          metadata: {
            name: `equipment-recovery-qualification-${actor}`,
            namespace: 'equipment-recovery',
          },
          roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'Role',
            name: `equipment-recovery-qualification-${actor}`,
          },
          subjects: [
            {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: 'User',
              name: foundation.github_principal_ids[actor],
            },
          ],
        })),
      }),
      'argocd-bootstrap-patches.json': json(argoPatches),
      'argocd-bootstrap-resources.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: platform.filter(
          (item) =>
            item.kind === 'SecretProviderClass' &&
            item.metadata.name === 'argocd',
        ),
      }),
      'kustomization.yaml': json({
        ...component,
        patches: [
          { patch: JSON.stringify(ingressPatch) },
          { patch: JSON.stringify(certManagerPatch) },
          {
            target: {
              kind: 'Deployment',
              name: 'traefik',
              namespace: 'equipment-platform',
            },
            patch: JSON.stringify([
              {
                op: 'add',
                path: '/spec/template/spec/containers/0/args/-',
                value: `--providers.kubernetesingress.ingressendpoint.ip=${environment.ingress_public_ip}`,
              },
            ]),
          },
        ],
      }),
      'identities.json': json({
        apiVersion: 'v1',
        kind: 'List',
        items: platform.filter((item) => item.metadata.name !== 'argocd'),
      }),
      'projection.json': json(metadata),
    },
  };
}
