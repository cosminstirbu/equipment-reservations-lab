import {
  AUTH_CONFIG_LOADER,
  SESSION_ADAPTER,
  SessionAdapter,
  SessionSnapshot,
} from './keycloak-session';

export class ProviderSessionBoundary implements SessionAdapter {
  session: SessionSnapshot | null = {
    token: 'boundary-access-token',
    expiresAt: Date.now() + 120000,
    subject: 'opaque-employee-a',
    account: 'employee-a',
    roles: ['Employee'],
  };

  initialize() {
    return Promise.resolve(this.session);
  }

  login() {
    return Promise.reject(
      new Error('Provider navigation unavailable in rendered test.'),
    );
  }

  refresh() {
    if (!this.session)
      return Promise.reject(new Error('Provider session unavailable.'));
    return Promise.resolve(this.session);
  }

  logoutUrl() {
    return 'http://localhost:18080/realms/equipment/protocol/openid-connect/logout';
  }

  endSession() {
    return Promise.resolve();
  }

  clear() {
    return;
  }
}

export function sessionBoundaryProviders(boundary: ProviderSessionBoundary) {
  return [
    { provide: SESSION_ADAPTER, useValue: boundary },
    {
      provide: AUTH_CONFIG_LOADER,
      useValue: () =>
        Promise.resolve({
          issuer: 'http://localhost:18080/realms/equipment',
          realm: 'equipment',
          clientId: 'equipment-web',
        }),
    },
  ];
}
