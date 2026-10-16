import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { Booking, BOOKING_TIME_ZONE } from './booking';
import { Reservation } from './booking-api';
import { AuthSession } from '../auth/auth-session';
import {
  ProviderSessionBoundary,
  sessionBoundaryProviders,
} from '../auth/auth-test-fixture';

const reservation: Reservation = {
  id: '310bfc65-7b78-4d28-a91c-1c45d0fbd64a',
  userKey: 'a'.repeat(64),
  equipmentId: 'camera-001',
  equipmentName: 'Demo Camera',
  startAt: '2030-01-02T12:00:00Z',
  endAt: '2030-01-02T13:00:00Z',
  status: 'Confirmed',
  confirmedAt: '2030-01-01T00:00:00Z',
  cancelledAt: null,
  confirmationEventId: 'f518d14a-daf1-4bf5-8d4e-92d3c58dbb12',
  cancellationEventId: null,
};
const entry = {
  eventId: reservation.confirmationEventId,
  reservationId: reservation.id,
  userKey: reservation.userKey,
  equipmentId: 'camera-001',
  equipmentName: 'Demo Camera',
  eventType: 'ReservationConfirmed',
  startAt: reservation.startAt,
  endAt: reservation.endAt,
  occurredAt: reservation.confirmedAt,
  receivedAt: '2030-01-01T00:00:01Z',
  message: 'Reservation confirmed for Demo Camera',
};

describe('explicit reservation notification inbox', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    TestBed.overrideComponent(Booking, {
      set: {
        template: readFileSync('src/app/booking/booking.html', 'utf8'),
        templateUrl: undefined,
        styleUrl: undefined,
        styles: [],
      },
    });
    await TestBed.compileComponents();
    TestBed.configureTestingModule({
      imports: [Booking],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...sessionBoundaryProviders(new ProviderSessionBoundary()),
        { provide: BOOKING_TIME_ZONE, useValue: 'Europe/Bucharest' },
      ],
    });
    await TestBed.inject(AuthSession).initialize();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function setup() {
    const fixture = TestBed.createComponent(Booking);
    const http = TestBed.inject(HttpTestingController);
    const view = () => {
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    const refresh = () => {
      const button = view().querySelector<HTMLButtonElement>(
        '[data-action="refresh-notifications"]',
      );
      expect(button, 'Visible explicit inbox refresh').not.toBeNull();
      return button!;
    };
    view();
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera', operational: true }]);
    view()
      .querySelector<HTMLButtonElement>('[data-action="refresh-reservations"]')!
      .click();
    http.expectOne('/api/reservations').flush([reservation]);
    view();
    return { fixture, http, view, refresh };
  }

  it('refreshes only explicitly with separate loading, empty and error states and no polling', async () => {
    const { http, view, refresh } = setup();
    http.expectNone('/api/notifications');
    refresh().click();
    expect(view().textContent).toContain('Loading notifications');
    expect(refresh().disabled).toBe(true);
    refresh().click();
    const request = http.expectOne('/api/notifications');
    request.flush([]);
    expect(view().textContent).toContain('No notifications observed yet');
    await vi.advanceTimersByTimeAsync(10000);
    http.expectNone('/api/notifications');
    refresh().click();
    http
      .expectOne('/api/notifications')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(view().textContent).toContain('Unable to load notifications');
    expect(view().textContent).not.toContain('No notifications observed yet');
    expect(refresh().disabled).toBe(false);
    http.verify();
  });

  it('only matching transition event IDs count as observed and render message as plain text', () => {
    const { http, view, refresh } = setup();
    refresh().click();
    const message = '<img src=x onerror=alert(1)>';
    http.expectOne('/api/notifications').flush([{ ...entry, message }]);
    expect(view().textContent).toContain('Confirmation notification observed');
    expect(view().textContent).toContain(message);
    expect(view().querySelector('img')).toBeNull();
    expect(view().textContent).toContain('Confirmed');
    http.expectNone('/api/reservations');
    http.verify();
  });

  it('keeps cancellation saved while its event is not observed even when confirmation is observed', () => {
    const { http, view, refresh } = setup();
    view()
      .querySelector<HTMLButtonElement>('[data-action="cancel-reservation"]')!
      .click();
    const cancelled = {
      ...reservation,
      status: 'Cancelled',
      cancelledAt: '2030-01-01T12:00:00Z',
      cancellationEventId: 'ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    http
      .expectOne(`/api/reservations/${reservation.id}/cancel`)
      .flush(cancelled);
    refresh().click();
    http.expectOne('/api/notifications').flush([entry]);
    expect(view().textContent).toContain('Cancelled');
    expect(view().textContent).toContain('Confirmation notification observed');
    expect(view().textContent).toContain(
      'Cancellation notification not yet observed',
    );
    refresh().click();
    http.expectOne('/api/notifications').flush([
      {
        ...entry,
        eventId: cancelled.cancellationEventId,
        eventType: 'ReservationCancelled',
      },
      entry,
    ]);
    expect(view().textContent).toContain('Cancellation notification observed');
    http.expectNone(`/api/reservations/${reservation.id}/cancel`);
    http.verify();
  });

  it('notification failure never changes saved reservation state or resubmits it', () => {
    const { http, view, refresh } = setup();
    refresh().click();
    http
      .expectOne('/api/notifications')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(view().textContent).toContain('Confirmed');
    expect(view().textContent).toContain(reservation.id);
    expect(view().textContent).toContain(
      'Confirmation notification not yet observed',
    );
    http.expectNone('/api/reservations');
    http.expectNone(`/api/reservations/${reservation.id}/cancel`);
    http.verify();
  });

  it('preserves authoritative inbox order including submillisecond occurrence times', () => {
    const { http, view, refresh } = setup();
    const newer = {
      ...entry,
      eventId: 'ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      occurredAt: '2030-01-01T00:00:00.123002Z',
    };
    const older = {
      ...entry,
      eventId: '00000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      occurredAt: '2030-01-01T00:00:00.123001Z',
    };
    refresh().click();
    http.expectOne('/api/notifications').flush([newer, older]);
    expect(
      [...view().querySelectorAll('[data-event-id]')].map((row) =>
        row.getAttribute('data-event-id'),
      ),
    ).toEqual([newer.eventId, older.eventId]);
    http.verify();
  });

  it('cancels pending inbox HTTP on destruction and performs no retry', async () => {
    const { fixture, http, refresh } = setup();
    refresh().click();
    const request = http.expectOne('/api/notifications');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    http.expectNone('/api/notifications');
    http.verify();
  });

  it('restores the inbox refresh focus when its pending request completes', async () => {
    vi.useRealTimers();
    const { fixture, http, refresh } = setup();
    document.body.appendChild(fixture.nativeElement);
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const button = refresh();
    button.focus();
    button.click();
    button.blur();
    http.expectOne('/api/notifications').flush([entry]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(refresh());
    focus.mockRestore();
    fixture.destroy();
  });

  it('renders accessible pending and observed inbox states', async () => {
    vi.useRealTimers();
    const { fixture, http, view, refresh } = setup();
    document.body.appendChild(fixture.nativeElement);
    const check = async () =>
      expect(
        (
          await axe.run(view(), {
            rules: { 'color-contrast': { enabled: false } },
          })
        ).violations,
      ).toEqual([]);
    refresh().click();
    await check();
    http.expectOne('/api/notifications').flush([entry]);
    await check();
    fixture.destroy();
  });
});
