import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  InjectionToken,
  Injector,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { Subscription } from 'rxjs';
import {
  Availability,
  BookingApi,
  BookingEquipment,
  BookingInput,
  Reservation,
  InboxEntry,
} from './booking-api';
import { localInstants, LocalInstant } from './booking-time';

export const BOOKING_TIME_ZONE = new InjectionToken<string>(
  'Booking timezone',
  {
    factory: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
);

@Component({
  selector: 'app-booking',
  imports: [FormField],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class Booking {
  private readonly api = inject(BookingApi);
  private readonly lifetime = new Subscription();
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private actionFocus: HTMLElement | null = null;

  protected readonly timeZone = inject(BOOKING_TIME_ZONE);
  protected readonly equipment = signal<BookingEquipment[]>([]);
  protected readonly loading = signal(true);
  protected readonly pending = signal(false);
  protected readonly status = signal('Loading equipment…');
  protected readonly availability = signal<Availability | null>(null);
  protected readonly saved = signal<Reservation | null>(null);
  protected readonly reservations = signal<Reservation[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyStatus = signal(
    'Refresh reservations to load history.',
  );
  protected readonly notifications = signal<InboxEntry[]>([]);
  protected readonly notificationsLoading = signal(false);
  protected readonly notificationsStatus = signal(
    'Refresh notifications to check asynchronous delivery.',
  );
  private readonly observedEventIds = computed(
    () => new Set(this.notifications().map((entry) => entry.eventId)),
  );
  protected readonly model = signal({
    equipmentId: '',
    startLocal: '',
    endLocal: '',
    startOffset: '',
    endOffset: '',
  });
  protected readonly fields = form(this.model, (schema) => {
    required(schema.equipmentId);
    required(schema.startLocal);
    required(schema.endLocal);
    disabled(schema, { when: () => this.pending() || this.loading() });
  });
  protected readonly starts = computed(() =>
    localInstants(this.model().startLocal, this.timeZone),
  );
  protected readonly ends = computed(() =>
    localInstants(this.model().endLocal, this.timeZone),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.lifetime.unsubscribe());
    let previous = '';
    effect(() => {
      const value = this.model();
      const current = `${value.equipmentId}|${value.startLocal}|${value.endLocal}|${value.startOffset}|${value.endOffset}`;
      if (current !== previous) {
        previous = current;
        if (this.availability()) {
          this.status.set(
            'Dates changed. Check availability again or book the new interval.',
          );
        }
        this.availability.set(null);
      }
    });
    this.load(false);
  }

  protected load(restore = true) {
    if (this.pending()) {
      return;
    }

    const focus =
      restore && this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
    this.loading.set(true);
    this.status.set('Loading equipment…');
    this.lifetime.add(
      this.api.equipment().subscribe({
        next: (items) => {
          this.equipment.set(items);
          this.loading.set(false);
          this.status.set(
            items.length
              ? 'Choose operational equipment and future dates.'
              : 'No equipment available.',
          );
          this.restoreFocus(focus);
        },
        error: () => {
          this.loading.set(false);
          this.equipment.set([]);
          this.status.set(
            'Unable to load equipment. Inventory is unavailable; try Reload equipment.',
          );
          this.restoreFocus(focus);
        },
      }),
    );
  }

  protected refreshNotifications() {
    if (this.notificationsLoading()) {
      return;
    }

    const focus =
      this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
    this.notificationsLoading.set(true);
    this.notificationsStatus.set('Loading notifications…');
    this.lifetime.add(
      this.api.notifications().subscribe({
        next: (entries) => {
          this.notifications.set(entries);
          this.notificationsLoading.set(false);
          this.notificationsStatus.set(
            entries.length
              ? 'Notifications refreshed.'
              : 'No notifications observed yet.',
          );
          this.restoreFocus(focus);
        },
        error: () => {
          this.notificationsLoading.set(false);
          this.notificationsStatus.set(
            'Unable to load notifications. Saved reservations remain valid; try Refresh notifications later.',
          );
          this.restoreFocus(focus);
        },
      }),
    );
  }

  protected notificationObserved(eventId: string | null) {
    return eventId !== null && this.observedEventIds().has(eventId);
  }

  protected refreshReservations() {
    if (this.pending() || this.historyLoading()) {
      return;
    }

    const focus =
      this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
    this.historyLoading.set(true);
    this.historyStatus.set('Loading reservations…');
    this.lifetime.add(
      this.api.reservations().subscribe({
        next: (items) => {
          this.reservations.set(items);
          this.historyLoading.set(false);
          this.historyStatus.set(
            items.length ? 'Reservations refreshed.' : 'No reservations yet.',
          );
          const savedId = this.saved()?.id;
          const refreshed = items.find((item) => item.id === savedId);
          if (refreshed) {
            this.saved.set(refreshed);
          }

          this.restoreFocus(focus);
        },
        error: () => {
          this.historyLoading.set(false);
          this.historyStatus.set(
            'Unable to load reservations. Check storage and try Refresh reservations.',
          );
          this.restoreFocus(focus);
        },
      }),
    );
  }

  protected cancelReservation(reservation: Reservation) {
    if (
      this.pending() ||
      this.historyLoading() ||
      reservation.status !== 'Confirmed'
    ) {
      return;
    }

    this.begin('Cancelling reservation…');
    this.historyStatus.set('Cancelling reservation…');
    this.lifetime.add(
      this.api.cancel(reservation.id).subscribe({
        next: (cancelled) => {
          this.reservations.update((items) =>
            items.map((item) => (item.id === cancelled.id ? cancelled : item)),
          );
          if (this.saved()?.id === cancelled.id) {
            this.saved.set(cancelled);
          }
          this.availability.set(null);
          const message =
            'Cancellation saved: Cancelled. Delivery is asynchronous; use Refresh notifications.';
          this.historyStatus.set(message);
          this.status.set(message);
          this.finish('refresh-reservations');
        },
        error: (error: unknown) => {
          const message = this.cancellationError(error);
          this.historyStatus.set(message);
          this.status.set(message);
          this.finish();
        },
      }),
    );
  }

  protected formatTime(value: string) {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: this.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'longOffset',
        hourCycle: 'h23',
      })
        .format(new Date(value))
        .replace('GMT', 'UTC') + ` (${this.timeZone})`
    );
  }

  private cancellationError(error: unknown) {
    if (
      error instanceof HttpErrorResponse &&
      error.error &&
      typeof error.error === 'object'
    ) {
      const problem = error.error as Record<string, unknown>;
      if (problem['code'] === 'cancellation_started') {
        return 'This reservation has already started and cannot be cancelled.';
      }

      if (problem['code'] === 'reservation_not_found') {
        return 'Reservation was not found. Refresh reservations.';
      }
    }

    return 'The cancellation response is uncertain. Refresh reservations before retrying.';
  }

  protected submit(event: Event) {
    event.preventDefault();
    this.book();
  }

  protected checkAvailability() {
    if (this.pending() || this.loading()) {
      return;
    }

    const input = this.validInput();
    if (!input) {
      return;
    }

    this.begin('Checking availability…');
    this.lifetime.add(
      this.api.availability(input).subscribe({
        next: (result) => {
          this.availability.set(result);
          this.status.set(
            result.available
              ? 'Available (advisory). Booking checks these dates again.'
              : 'These dates conflict with a confirmed reservation.',
          );
          this.finish();
        },
        error: (error: unknown) => {
          this.status.set(this.errorMessage(error, false));
          this.finish();
        },
      }),
    );
  }

  private book() {
    if (this.pending() || this.loading()) {
      return;
    }

    const input = this.validInput();
    if (!input) {
      return;
    }

    this.begin('Saving reservation…');
    this.lifetime.add(
      this.api.book(input).subscribe({
        next: (reservation) => {
          this.saved.set(reservation);
          this.availability.set(null);
          this.status.set(
            'Reservation saved: Confirmed. Delivery is asynchronous; use Refresh notifications.',
          );
          this.finish();
        },
        error: (error: unknown) => {
          this.status.set(this.errorMessage(error, true));
          this.finish();
        },
      }),
    );
  }

  private validInput(): BookingInput | null {
    const value = this.model();
    const item = this.equipment().find(
      (candidate) => candidate.id === value.equipmentId,
    );
    if (!item?.operational) {
      this.status.set('Choose operational equipment.');
      return null;
    }

    const start = this.chooseInstant(
      value.startLocal,
      this.starts(),
      value.startOffset,
      'start',
    );
    if (!start) {
      return null;
    }

    const end = this.chooseInstant(
      value.endLocal,
      this.ends(),
      value.endOffset,
      'end',
    );
    if (!end) {
      return null;
    }

    if (start.instant >= end.instant) {
      this.status.set('Start must be before end.');
      return null;
    }

    if (Date.parse(start.instant) < Date.now()) {
      this.status.set('Start must not be in the past.');
      return null;
    }

    return { equipmentId: item.id, startAt: start.instant, endAt: end.instant };
  }

  private chooseInstant(
    value: string,
    candidates: LocalInstant[],
    offset: string,
    field: string,
  ): LocalInstant | null {
    if (!value) {
      this.status.set(`Enter the ${field} time.`);
      return null;
    }

    if (!candidates.length) {
      this.status.set(
        `The ${field} time does not exist in ${this.timeZone}. Choose a valid local time.`,
      );
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const selected = candidates.find(
      (candidate) => candidate.offset === offset,
    );
    if (!selected) {
      this.status.set(`Choose an offset for the repeated ${field} time.`);
      return null;
    }

    return selected;
  }

  private begin(message: string) {
    this.actionFocus =
      this.document.activeElement instanceof HTMLElement
        ? this.document.activeElement
        : null;
    this.pending.set(true);
    this.status.set(message);
  }

  private finish(fallbackAction?: string) {
    this.pending.set(false);
    const focus = this.actionFocus;
    this.actionFocus = null;
    this.restoreFocus(focus, fallbackAction);
  }

  private restoreFocus(focus: HTMLElement | null, fallbackAction?: string) {
    if (!focus) {
      return;
    }

    afterNextRender(
      () => {
        if (
          this.document.hasFocus() &&
          this.document.activeElement === this.document.body
        ) {
          if (focus.isConnected) {
            focus.focus();
            return;
          }

          if (!fallbackAction) {
            return;
          }

          this.document
            .querySelector<HTMLElement>(`[data-action="${fallbackAction}"]`)
            ?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private errorMessage(error: unknown, write: boolean) {
    if (
      error instanceof HttpErrorResponse &&
      error.error &&
      typeof error.error === 'object'
    ) {
      const problem = error.error as Record<string, unknown>;
      switch (problem['code']) {
        case 'booking_conflict':
          return 'This interval now conflicts with a confirmed reservation. Check another interval.';
        case 'inventory_unavailable':
          return 'Inventory is unavailable. No reservation was created; try again later.';
        case 'equipment_not_found':
          return 'Equipment was not found. Reload equipment.';
        case 'equipment_not_operational':
          return 'This equipment is not operational. Choose another item.';
        case 'invalid_interval':
          return 'Start must be before end.';
        case 'start_in_past':
          return 'Start must not be in the past.';
        case 'invalid_request':
          return 'Check the equipment and dates, including timezone offsets, then try again.';
      }
    }

    return write
      ? 'The save response is uncertain. Refresh reservations before retrying.'
      : 'Unable to check availability. Check the local services and try again.';
  }
}
