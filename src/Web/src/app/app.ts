import { Component, inject } from '@angular/core';
import { Booking } from './booking/booking';
import { AuthSession } from './auth/auth-session';

@Component({
  selector: 'app-root',
  imports: [Booking],
  template: `
    <header>
      <h1>Equipment reservations</h1>
      @if (auth.active()) {
        <p>
          Account: <strong>{{ auth.account() }}</strong>
        </p>
        <p>Roles: {{ auth.roles().join(', ') || 'No application roles' }}</p>
        <button type="button" data-action="sign-out" (click)="auth.logout()">
          Sign out
        </button>
      } @else {
        <button
          type="button"
          data-action="sign-in"
          (click)="auth.login()"
          [disabled]="
            auth.state() === 'initializing' || auth.state() === 'authenticating'
          "
        >
          Sign in
        </button>
      }
      <p role="status" aria-live="polite" aria-atomic="true">
        {{ auth.notice() }}
      </p>
      @if (auth.logoutRetry()) {
        <button
          type="button"
          data-action="retry-sign-out"
          (click)="auth.retryLogout()"
        >
          Retry provider sign-out
        </button>
      }
    </header>
    <main>
      @if (!auth.active()) {
        <h2>Sign in to continue</h2>
        <p>
          Use your account to check equipment availability and view your
          notifications.
        </p>
      }
      <app-booking />
    </main>
  `,
})
export class App {
  protected readonly auth = inject(AuthSession);
}
