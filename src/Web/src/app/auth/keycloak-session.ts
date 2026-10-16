import { InjectionToken } from '@angular/core';
import Keycloak from 'keycloak-js';

export interface AuthConfig {
  issuer: string;
  realm: string;
  clientId: string;
}

export interface SessionSnapshot {
  token: string;
  expiresAt: number;
  subject: string;
  account: string;
  roles: string[];
}

export interface SessionAdapter {
  initialize(config: AuthConfig): Promise<SessionSnapshot | null>;
  login(): Promise<void>;
  refresh(): Promise<SessionSnapshot>;
  logoutUrl(): string;
  endSession(url: string): Promise<void>;
  clear(): void;
}

export const SESSION_ADAPTER = new InjectionToken<SessionAdapter>(
  'Identity provider session',
  { providedIn: 'root', factory: () => new KeycloakSession() },
);
export const AUTH_CONFIG_LOADER = new InjectionToken<() => Promise<AuthConfig>>(
  'Public identity configuration',
  {
    providedIn: 'root',
    factory: () => async () => {
      const response = await fetch('/auth-config.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error('Identity configuration unavailable.');
      return response.json() as Promise<AuthConfig>;
    },
  },
);

export class KeycloakSession implements SessionAdapter {
  private client: Keycloak | null = null;
  private configuration: AuthConfig | null = null;
  private epoch = 0;

  async initialize(configuration: AuthConfig) {
    this.configuration = configuration;
    const epoch = this.epoch;
    this.client = new Keycloak({
      url: new URL(configuration.issuer).origin,
      realm: configuration.realm,
      clientId: configuration.clientId,
    });
    const authenticated = await this.client.init({
      flow: 'standard',
      pkceMethod: 'S256',
      responseMode: 'fragment',
      checkLoginIframe: false,
      enableLogging: false,
      scope: 'openid',
    });
    if (epoch !== this.epoch) {
      this.client.clearToken();
      throw new Error('Session changed.');
    }

    return authenticated ? this.snapshot() : null;
  }

  async login() {
    if (!this.client) throw new Error('Identity provider unavailable.');
    await this.client.login({
      prompt: 'login',
      redirectUri: window.location.origin + '/',
    });
  }

  async refresh() {
    if (!this.client) throw new Error('Identity provider unavailable.');
    const epoch = this.epoch;
    await this.client.updateToken(30);
    if (epoch !== this.epoch) {
      this.client.clearToken();
      throw new Error('Session changed.');
    }

    return this.snapshot();
  }

  logoutUrl() {
    if (!this.client) throw new Error('Identity provider unavailable.');
    return this.client.createLogoutUrl({
      redirectUri: window.location.origin + '/',
    });
  }

  async endSession(url: string) {
    if (!this.configuration) throw new Error('Identity provider unavailable.');
    const destination = new URL(url);
    const issuer = new URL(this.configuration.issuer);
    if (
      destination.origin !== issuer.origin ||
      destination.pathname !==
        issuer.pathname + '/protocol/openid-connect/logout'
    )
      throw new Error('Invalid provider logout target.');
    const available = await fetch(
      this.configuration.issuer + '/.well-known/openid-configuration',
      {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!available.ok) throw new Error('Identity provider unavailable.');
    window.location.assign(url);
  }

  clear() {
    this.epoch++;
    this.client?.clearToken();
  }

  private snapshot(): SessionSnapshot {
    const token = this.client?.token;
    const parsed = this.client?.tokenParsed;
    if (
      !token ||
      !parsed ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.iss !== this.configuration?.issuer ||
      parsed['principal_kind'] !== 'human' ||
      parsed['azp'] !== 'equipment-web' ||
      parsed['typ'] !== 'Bearer'
    )
      throw new Error('Human access authority unavailable.');
    const account: unknown = parsed['preferred_username'];
    return {
      token,
      expiresAt: parsed.exp * 1000,
      subject: parsed.sub,
      account: typeof account === 'string' ? account : parsed.sub,
      roles: [...(this.client?.realmAccess?.roles ?? [])],
    };
  }
}
