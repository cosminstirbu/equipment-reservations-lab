import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  AUTH_CONFIG_LOADER,
  AuthConfig,
  SESSION_ADAPTER,
  SessionSnapshot,
} from './keycloak-session';

type SessionState =
  | 'initializing'
  | 'signed-out'
  | 'authenticating'
  | 'authenticated'
  | 'expired';

@Service()
export class AuthSession {
  private readonly adapter = inject(SESSION_ADAPTER);
  private readonly configuration = inject(AUTH_CONFIG_LOADER);
  private readonly document = inject(DOCUMENT);
  private snapshot: SessionSnapshot | null = null;
  private initialized = false;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private logoutLocation: string | null = null;
  private refreshing: Promise<string> | null = null;
  private readonly channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('equipment-session');
  readonly state = signal<SessionState>('initializing');
  readonly generation = signal(0);
  readonly account = signal('');
  readonly roles = signal<string[]>([]);
  readonly notice = signal('Sign in to use equipment reservations.');
  readonly logoutRetry = signal(false);
  readonly active = computed(() => this.state() === 'authenticated');
  readonly employee = computed(
    () => this.active() && this.roles().includes('Employee'),
  );

  constructor() {
    const check = () => {
      this.checkActive();
    };
    const resume = () => {
      if (this.state() === 'authenticating') {
        this.clearLocal(
          'signed-out',
          'Sign-in did not complete. You can try again.',
        );
      }
      this.checkActive();
    };
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', resume);
    this.document.addEventListener('visibilitychange', check);
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        if (
          event.data &&
          typeof event.data === 'object' &&
          'type' in event.data &&
          event.data.type === 'clear-session'
        ) {
          this.clearLocal(
            'signed-out',
            'Session changed in another tab. Sign in again.',
            false,
          );
        }
      };
    }

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.expiryTimer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', resume);
      this.document.removeEventListener('visibilitychange', check);
      this.channel?.close();
    });
  }

  async initialize() {
    const generation = this.generation();
    try {
      const configuration = this.validConfiguration(await this.configuration());
      const initial = this.adapter.initialize(configuration);
      void initial.then(
        () => {
          if (this.generation() !== generation && !this.active())
            this.adapter.clear();
        },
        () => undefined,
      );
      const snapshot = await this.bounded(initial, 10000);
      if (this.generation() !== generation) {
        this.adapter.clear();
        return;
      }

      this.initialized = true;
      if (!snapshot) {
        this.state.set('signed-out');
        return;
      }

      this.generation.update((value) => value + 1);
      this.accept(snapshot);
      this.channel?.postMessage({ type: 'clear-session' });
    } catch {
      this.initialized = false;
      this.clearLocal(
        'signed-out',
        'Sign-in is unavailable. Check the identity service and try again.',
        false,
      );
    }
  }

  async login() {
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) return;
    }

    this.clearLocal('authenticating', 'Opening secure sign-in…');
    try {
      await this.adapter.login();
    } catch {
      this.clearLocal(
        'signed-out',
        'Sign-in did not complete. You can try again.',
      );
    }
  }

  async logout() {
    try {
      this.logoutLocation = this.adapter.logoutUrl();
    } catch {
      this.logoutLocation = null;
    }

    this.clearLocal(
      'signed-out',
      'Signed out locally. Ending the provider session…',
    );
    await this.retryLogout();
  }

  async retryLogout() {
    if (!this.logoutLocation) {
      this.notice.set(
        'Signed out locally. Provider sign-out could not be started.',
      );
      return;
    }

    try {
      await this.bounded(this.adapter.endSession(this.logoutLocation), 5000);
      this.logoutRetry.set(false);
      this.notice.set('Provider sign-out requested.');
    } catch {
      this.logoutRetry.set(true);
      this.notice.set(
        'Signed out locally. Retry provider sign-out to end the provider session.',
      );
    }
  }

  async tokenForAction() {
    if (!this.checkActive() || !this.snapshot)
      throw new Error('Sign in again.');
    if (this.snapshot.expiresAt - Date.now() >= 30000)
      return this.snapshot.token;
    if (this.refreshing) return this.refreshing;
    const generation = this.generation();
    this.refreshing = this.refreshForAction(generation);
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  checkActive() {
    if (this.active() && this.snapshot && Date.now() >= this.snapshot.expiresAt)
      this.expire();
    return this.active() && this.snapshot !== null;
  }

  isCurrent(generation: number) {
    return generation === this.generation() && this.checkActive();
  }

  expire() {
    this.clearLocal(
      'expired',
      'Session expired. Sign in and refresh your history before choosing another action.',
    );
  }

  forbidden() {
    this.notice.set('Your account does not have permission for that action.');
  }

  private async refreshForAction(generation: number) {
    const subject = this.snapshot?.subject;
    const refresh = this.adapter.refresh();
    void refresh.then(
      () => {
        if (!this.isCurrent(generation)) this.adapter.clear();
      },
      () => undefined,
    );
    try {
      const snapshot = await this.bounded(refresh, 3000);
      if (!this.isCurrent(generation) || snapshot.subject !== subject)
        throw new Error('Session changed.');
      this.accept(snapshot);
      return snapshot.token;
    } catch {
      if (this.generation() === generation) this.expire();
      throw new Error('Sign in again.');
    }
  }

  private accept(snapshot: SessionSnapshot) {
    if (
      !snapshot.token ||
      !snapshot.subject ||
      !Number.isFinite(snapshot.expiresAt) ||
      snapshot.expiresAt <= Date.now()
    )
      throw new Error('Session unavailable.');
    this.snapshot = { ...snapshot, roles: [...snapshot.roles] };
    this.account.set(snapshot.account);
    this.roles.set(
      snapshot.roles.filter((role) =>
        ['Employee', 'Approver', 'EquipmentStaff'].includes(role),
      ),
    );
    this.state.set('authenticated');
    this.notice.set('Signed in.');
    clearTimeout(this.expiryTimer);
    this.expiryTimer = setTimeout(
      () => this.expire(),
      snapshot.expiresAt - Date.now(),
    );
  }

  private clearLocal(state: SessionState, notice: string, broadcast = true) {
    clearTimeout(this.expiryTimer);
    this.snapshot = null;
    this.adapter.clear();
    this.generation.update((value) => value + 1);
    this.account.set('');
    this.roles.set([]);
    this.logoutRetry.set(false);
    this.state.set(state);
    this.notice.set(notice);
    if (broadcast) this.channel?.postMessage({ type: 'clear-session' });
  }

  private validConfiguration(value: unknown): AuthConfig {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 3)
      throw new Error('Invalid identity configuration.');
    const configuration = value as Partial<AuthConfig>;
    if (
      typeof configuration.issuer !== 'string' ||
      configuration.realm !== 'equipment' ||
      configuration.clientId !== 'equipment-web'
    )
      throw new Error('Invalid identity configuration.');
    const issuer = new URL(configuration.issuer);
    if (
      (issuer.protocol !== 'https:' &&
        !(
          issuer.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)
        )) ||
      issuer.href !== configuration.issuer ||
      issuer.pathname !== '/realms/equipment' ||
      issuer.search ||
      issuer.hash ||
      issuer.username ||
      issuer.password
    )
      throw new Error('Invalid identity authority.');
    return {
      issuer: configuration.issuer,
      realm: configuration.realm,
      clientId: configuration.clientId,
    };
  }

  private async bounded<T>(operation: Promise<T>, milliseconds: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Identity operation timed out.')),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
