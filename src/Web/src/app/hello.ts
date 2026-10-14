import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Subscription,
  timer,
  timeout,
  filter,
  exhaustMap,
  catchError,
  of,
  take,
  startWith,
  throwError,
} from 'rxjs';
import { Equipment, HelloApi } from './hello-api';

@Component({
  selector: 'app-hello',
  template: ` <main>
    <h1>Equipment hello</h1>
    <p>A local connectivity demonstration.</p>
    @if (equipment(); as item) {
      <h2>{{ item.name }}</h2>
      <p>Equipment ID: {{ item.id }}</p>
      <button #sendButton type="button" (click)="send()" [disabled]="pending()">
        Send hello
      </button>
    }
    <p role="status" aria-live="polite" aria-atomic="true">{{ status() }}</p>
    @if (correlationId()) {
      <p>
        Correlation ID: <code>{{ correlationId() }}</code>
      </p>
    }
  </main>`,
})
export class Hello {
  private readonly api = inject(HelloApi);
  private readonly lifetime = new Subscription();
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly sendButton =
    viewChild<ElementRef<HTMLButtonElement>>('sendButton');
  private restoreSendFocus = false;

  protected readonly equipment = signal<Equipment | null>(null);
  protected readonly pending = signal(false);
  protected readonly status = signal('Loading equipment…');
  protected readonly correlationId = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lifetime.unsubscribe());

    this.lifetime.add(
      this.api.equipment().subscribe({
        next: (items) => {
          if (items.length !== 1) {
            this.status.set('Unable to load equipment. Check Inventory.');
            return;
          }

          this.equipment.set(items[0]);
          this.status.set('Ready to send hello.');
        },
        error: () =>
          this.status.set(
            'Unable to load equipment. Check Inventory and reload.',
          ),
      }),
    );
  }

  protected send() {
    const item = this.equipment();
    if (!item || this.pending()) {
      return;
    }

    this.restoreSendFocus =
      this.document.activeElement === this.sendButton()?.nativeElement;
    this.pending.set(true);
    this.correlationId.set('');
    this.status.set('Sending hello…');

    this.lifetime.add(
      this.api.send(item.id).subscribe({
        next: (result) => {
          this.correlationId.set(result.correlationId);
          this.status.set('Waiting for notification…');
          this.wait(result.correlationId);
        },
        error: () =>
          this.fail(
            'Unable to send hello. Check Inventory and the message broker, then try again.',
          ),
      }),
    );
  }

  private wait(id: string) {
    const polling = timer(500, 500).pipe(
      startWith(0),
      exhaustMap(() =>
        this.api
          .notification(id)
          .pipe(
            catchError((error: unknown) =>
              error instanceof HttpErrorResponse && error.status === 404
                ? of(null)
                : throwError(() => error),
            ),
          ),
      ),
      filter((result) => result !== null),
      take(1),
      timeout(30000),
    );

    this.lifetime.add(
      polling.subscribe({
        next: (result) => {
          this.status.set(result.message);
          this.finish();
        },
        error: (error: unknown) =>
          this.fail(
            error instanceof Error && error.name === 'TimeoutError'
              ? 'Notification timed out. Check Notifications and try a new send.'
              : 'Unable to receive notification. Check Notifications and try again.',
          ),
      }),
    );
  }

  private finish() {
    this.pending.set(false);
    if (!this.restoreSendFocus) {
      return;
    }

    this.restoreSendFocus = false;

    afterNextRender(
      () => {
        const button = this.sendButton()?.nativeElement;
        const active = this.document.activeElement;
        if (
          button &&
          this.document.hasFocus() &&
          (active === this.document.body || active === button)
        ) {
          button.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private fail(message: string) {
    this.status.set(message);
    this.finish();
  }
}
