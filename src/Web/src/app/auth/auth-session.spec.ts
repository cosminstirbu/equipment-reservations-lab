import { TestBed } from '@angular/core/testing';
import { createRequire } from 'node:module';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from './auth-session';
import { authInterceptor } from './auth-interceptor';
import {
  AUTH_CONFIG_LOADER,
  AuthConfig,
  SESSION_ADAPTER,
  SessionAdapter,
  SessionSnapshot,
} from './keycloak-session';

const configuration: AuthConfig = {
  issuer: 'http://localhost:18080/realms/equipment',
  realm: 'equipment',
  clientId: 'equipment-web',
};

const require = createRequire(import.meta.url);
const { publicConfiguration } = require('../../../auth-config.cjs') as {
  publicConfiguration: (environment: Record<string, string>) => AuthConfig;
};

describe('generated public identity configuration', () => {
  it('exposes only issuer,realm and public client identity despite secret environment values', () => {
    expect(
      publicConfiguration({
        Identity__Authority: configuration.issuer,
        Identity__Realm: configuration.realm,
        Identity__ClientId: configuration.clientId,
        AdminPassword: 'private-environment-value',
        ReservationsClientSecret: 'private-service-value',
      }),
    ).toEqual(configuration);
  });

  it('refuses missing or nonlocal provider settings', () => {
    expect(() => publicConfiguration({})).toThrow();
    expect(() =>
      publicConfiguration({
        Identity__Authority: 'https://unrelated.invalid/realms/equipment',
        Identity__Realm: 'equipment',
        Identity__ClientId: 'equipment-web',
      }),
    ).toThrow();
  });
});

class ProviderBoundary implements SessionAdapter {
  snapshot: SessionSnapshot = {
    token: 'boundary-authority',
    expiresAt: Date.now() + 120000,
    subject: 'opaque-a',
    account: 'employee-a',
    roles: ['Employee'],
  };
  initialize = vi.fn<SessionAdapter['initialize']>(() =>
    Promise.resolve(this.snapshot),
  );
  login = vi.fn<SessionAdapter['login']>(() => Promise.resolve());
  refresh = vi.fn<SessionAdapter['refresh']>(() =>
    Promise.resolve(this.snapshot),
  );
  logoutUrl = vi.fn(() => 'http://localhost:18080/protocol-logout');
  endSession = vi.fn<SessionAdapter['endSession']>(() => Promise.resolve());
  clear = vi.fn();
}

class SessionChannel {
  static current: SessionChannel;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();

  constructor() {
    SessionChannel.current = this;
  }
}

describe('identity session lifecycle', () => {
  let provider: ProviderBoundary;
  let session: AuthSession;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    vi.stubGlobal('BroadcastChannel', SessionChannel);
    provider = new ProviderBoundary();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_ADAPTER, useValue: provider },
        {
          provide: AUTH_CONFIG_LOADER,
          useValue: () => Promise.resolve(configuration),
        },
      ],
    });
    session = TestBed.inject(AuthSession);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows only explicit roles for the initialized account', async () => {
    provider.snapshot.roles = [
      'default-roles-equipment',
      'Approver',
      'offline_access',
    ];
    await session.initialize();
    expect(session.active()).toBe(true);
    expect(session.account()).toBe('employee-a');
    expect(session.employee()).toBe(false);
    expect(session.roles()).toEqual(['Approver']);
    expect(provider.initialize).toHaveBeenCalledWith(configuration);
    expect(session.generation()).toBeGreaterThan(0);
  });

  it('allows explicit combined roles without inferring Employee from other grants', async () => {
    provider.snapshot.roles = ['EquipmentStaff', 'Employee'];
    await session.initialize();
    expect(session.employee()).toBe(true);
  });

  it('clears private identity at expiry and never refreshes an expired session', async () => {
    await session.initialize();
    const generation = session.generation();
    await vi.advanceTimersByTimeAsync(120000);
    expect(session.active()).toBe(false);
    expect(session.state()).toBe('expired');
    expect(session.account()).toBe('');
    expect(session.roles()).toEqual([]);
    expect(session.generation()).toBeGreaterThan(generation);
    await expect(session.tokenForAction()).rejects.toThrow();
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it('refreshes only a still-valid token before explicit action', async () => {
    provider.snapshot.expiresAt = Date.now() + 10000;
    await session.initialize();
    provider.snapshot = {
      ...provider.snapshot,
      token: 'renewed-boundary-authority',
      expiresAt: Date.now() + 120000,
    };
    expect(await session.tokenForAction()).toBe('renewed-boundary-authority');
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(session.active()).toBe(true);
  });

  it('clears on refresh failure and permits only a new explicit sign-in', async () => {
    provider.snapshot.expiresAt = Date.now() + 10000;
    await session.initialize();
    provider.refresh.mockRejectedValueOnce(new Error('unavailable'));
    await expect(session.tokenForAction()).rejects.toThrow();
    expect(session.active()).toBe(false);
    expect(provider.login).not.toHaveBeenCalled();
    expect(provider.clear).toHaveBeenCalled();
  });

  it('bounds stalled refresh and discards its late completion after logout', async () => {
    provider.snapshot.expiresAt = Date.now() + 10000;
    await session.initialize();
    let finish!: (snapshot: SessionSnapshot) => void;
    provider.refresh.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const outcome = session.tokenForAction().catch(() => 'denied');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await outcome).toBe('denied');
    expect(session.active()).toBe(false);
    finish({ ...provider.snapshot, expiresAt: Date.now() + 120000 });
    await Promise.resolve();
    expect(session.active()).toBe(false);
    expect(provider.clear).toHaveBeenCalled();
  });

  it('captures provider logout before clearing locally and exposes retry on failure', async () => {
    await session.initialize();
    const generation = session.generation();
    provider.endSession.mockRejectedValueOnce(new Error('offline'));
    await session.logout();
    expect(session.active()).toBe(false);
    expect(session.account()).toBe('');
    expect(session.isCurrent(generation)).toBe(false);
    expect(provider.logoutUrl.mock.invocationCallOrder[0]).toBeLessThan(
      provider.clear.mock.invocationCallOrder[0],
    );
    expect(session.notice()).toContain('Retry provider sign-out');
    await session.retryLogout();
    expect(provider.endSession).toHaveBeenCalledTimes(2);
    expect(provider.login).not.toHaveBeenCalled();
  });

  it('reports cancelled or failed sign-in without protected data or automatic retry', async () => {
    provider.initialize.mockResolvedValueOnce(null);
    await session.initialize();
    provider.login.mockRejectedValueOnce(new Error('cancelled'));
    await session.login();
    expect(session.active()).toBe(false);
    expect(session.notice()).toContain('Sign-in did not complete');
    expect(provider.login).toHaveBeenCalledTimes(1);
  });

  it('recovers an explicit sign-in after browser history restores the abandoned sign-in page', async () => {
    provider.initialize.mockResolvedValueOnce(null);
    await session.initialize();
    await session.login();
    expect(session.state()).toBe('authenticating');
    window.dispatchEvent(new Event('pageshow'));
    expect(session.state()).toBe('signed-out');
    expect(session.notice()).toContain('Sign-in did not complete');
    expect(provider.login).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected public configuration fields before provider initialization', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_ADAPTER, useValue: provider },
        {
          provide: AUTH_CONFIG_LOADER,
          useValue: () =>
            Promise.resolve({ ...configuration, clientSecret: 'forbidden' }),
        },
      ],
    });
    const invalid = TestBed.inject(AuthSession);
    await invalid.initialize();
    expect(invalid.active()).toBe(false);
    expect(provider.initialize).not.toHaveBeenCalled();
    expect(invalid.notice()).toContain('Sign-in is unavailable');
  });

  it('retries failed initialization only when the user explicitly chooses sign-in', async () => {
    TestBed.resetTestingModule();
    const configurationLoader = vi.fn(() => Promise.resolve(configuration));
    configurationLoader.mockRejectedValueOnce(new Error('unavailable'));
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_ADAPTER, useValue: provider },
        { provide: AUTH_CONFIG_LOADER, useValue: configurationLoader },
      ],
    });
    const recovering = TestBed.inject(AuthSession);
    await recovering.initialize();
    expect(recovering.active()).toBe(false);
    expect(configurationLoader).toHaveBeenCalledTimes(1);
    await recovering.login();
    expect(configurationLoader).toHaveBeenCalledTimes(2);
    expect(provider.login).toHaveBeenCalledTimes(1);
  });

  it.each(['focus', 'visibilitychange'])(
    'checks expiry on %s even when a background timer has not fired',
    async (event) => {
      await session.initialize();
      vi.setSystemTime(new Date('2030-01-01T00:02:01Z'));
      const target = event === 'focus' ? window : document;
      target.dispatchEvent(new Event(event));
      expect(session.state()).toBe('expired');
      expect(session.account()).toBe('');
    },
  );

  it('receives cross-tab clear signals without restoring or broadcasting an identity', async () => {
    await session.initialize();
    SessionChannel.current.postMessage.mockClear();
    SessionChannel.current.onmessage?.(
      new MessageEvent('message', { data: { type: 'clear-session' } }),
    );
    expect(session.active()).toBe(false);
    expect(session.account()).toBe('');
    expect(SessionChannel.current.postMessage).not.toHaveBeenCalled();
  });

  it('broadcasts only a clear signal when ending the local session', async () => {
    await session.initialize();
    SessionChannel.current.postMessage.mockClear();
    await session.logout();
    expect(SessionChannel.current.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'clear-session',
    });
  });
});

describe('bearer request boundary', () => {
  let provider: ProviderBoundary;
  let session: AuthSession;
  let http: HttpClient;
  let requests: HttpTestingController;

  beforeEach(async () => {
    provider = new ProviderBoundary();
    vi.stubGlobal('BroadcastChannel', SessionChannel);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SESSION_ADAPTER, useValue: provider },
        {
          provide: AUTH_CONFIG_LOADER,
          useValue: () => Promise.resolve(configuration),
        },
      ],
    });
    session = TestBed.inject(AuthSession);
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
    await session.initialize();
  });

  afterEach(() => {
    requests.verify();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('attaches authority only to the exact same-origin application resource paths', async () => {
    const response = firstValueFrom(http.get('/api/reservations'));
    await Promise.resolve();
    const own = requests.expectOne('/api/reservations');
    expect(own.request.headers.get('Authorization')).toBe(
      'Bearer boundary-authority',
    );
    own.flush([]);
    await response;
    for (const target of [
      'https://unrelated.invalid/api/reservations',
      '/auth-config.json',
      '/api/unknown',
      '/api/reservations-other',
    ]) {
      const external = firstValueFrom(http.get(target));
      const request = requests.expectOne(target);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      await external;
    }
  });

  it('clears a rejected session and never replays the write after401', async () => {
    const response = firstValueFrom(http.post('/api/reservations', {})).catch(
      (error: unknown) => error,
    );
    await Promise.resolve();
    requests
      .expectOne('/api/reservations')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await response).toBeInstanceOf(HttpErrorResponse);
    expect(session.active()).toBe(false);
    requests.expectNone('/api/reservations');
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it('announces forbidden authority distinctly without expiring or replaying a valid session', async () => {
    const response = firstValueFrom(http.get('/api/reservations')).catch(
      (error: unknown) => error,
    );
    await Promise.resolve();
    requests
      .expectOne('/api/reservations')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(await response).toBeInstanceOf(HttpErrorResponse);
    expect(session.active()).toBe(true);
    expect(session.notice()).toContain('does not have permission');
    requests.expectNone('/api/reservations');
    expect(provider.refresh).not.toHaveBeenCalled();
  });

  it('discards protected responses from a previous session generation', async () => {
    const response = firstValueFrom(http.get('/api/notifications')).catch(
      (error: unknown) => error,
    );
    await Promise.resolve();
    const pending = requests.expectOne('/api/notifications');
    await session.logout();
    pending.flush([{ message: 'previous account notification' }]);
    expect(await response).toBeInstanceOf(Error);
    expect(session.active()).toBe(false);
  });
});
