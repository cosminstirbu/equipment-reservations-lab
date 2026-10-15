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

const confirmed: Reservation = {
  id: '310bfc65-7b78-4d28-a91c-1c45d0fbd64a',
  demoUserId: 'demo-user',
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
const cancelled: Reservation = {
  ...confirmed,
  status: 'Cancelled',
  cancelledAt: '2030-01-01T12:00:00Z',
  cancellationEventId: '9fb7f715-7931-4281-a723-564d4f73fe4d',
};

describe('reservation history and cancellation', () => {
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
        { provide: BOOKING_TIME_ZONE, useValue: 'Europe/Bucharest' },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
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
        '[data-action="refresh-reservations"]',
      );
      expect(button, 'Visible explicit history refresh').not.toBeNull();
      return button!;
    };
    const cancel = () => {
      const button = view().querySelector<HTMLButtonElement>(
        '[data-action="cancel-reservation"]',
      );
      expect(
        button,
        'Visible cancellation action for Confirmed record',
      ).not.toBeNull();
      return button!;
    };
    view();
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera', operational: true }]);
    return { fixture, http, view, refresh, cancel };
  }

  function loaded() {
    const state = setup();
    state.refresh().click();
    state.http.expectOne('/api/reservations').flush([confirmed]);
    state.view();
    return state;
  }

  it('loads history only on explicit refresh and distinguishes loading, empty and error', () => {
    const { http, view, refresh } = setup();
    http.expectNone('/api/reservations');
    refresh().click();
    expect(view().textContent).toContain('Loading reservations');
    expect(refresh().disabled).toBe(true);
    http.expectOne('/api/reservations').flush([]);
    expect(view().textContent).toContain('No reservations yet');
    refresh().click();
    http
      .expectOne('/api/reservations')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(view().textContent).toContain('Unable to load reservations');
    expect(view().textContent).not.toContain('No reservations yet');
    expect(refresh().disabled).toBe(false);
    http.verify();
  });

  it.each(['success', 'failure'])(
    'restores keyboard focus after %s history refresh completion',
    async (outcome) => {
      vi.useRealTimers();
      const { fixture, http, refresh } = setup();
      document.body.appendChild(fixture.nativeElement);
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const button = refresh();
      button.focus();
      button.click();
      button.blur();
      fixture.detectChanges();
      expect(document.activeElement).toBe(document.body);
      const request = http.expectOne('/api/reservations');
      if (outcome === 'success') {
        request.flush([]);
      } else {
        request.flush({}, { status: 503, statusText: 'Unavailable' });
      }
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(button);
      http.verify();
      fixture.destroy();
    },
  );

  it.each(['success', 'failure'])(
    'restores focus after %s equipment reload completion',
    async (outcome) => {
      vi.useRealTimers();
      const { fixture, http, view } = setup();
      document.body.appendChild(fixture.nativeElement);
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const button = view().querySelector<HTMLButtonElement>(
        '[data-action="reload"]',
      )!;
      button.focus();
      button.click();
      button.blur();
      fixture.detectChanges();
      expect(document.activeElement).toBe(document.body);
      const request = http.expectOne('/api/equipment');
      if (outcome === 'success') {
        request.flush([
          { id: 'camera-001', name: 'Demo Camera', operational: true },
        ]);
      } else {
        request.flush({}, { status: 503, statusText: 'Unavailable' });
      }
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(button);
      http.verify();
      fixture.destroy();
    },
  );

  it('retains both statuses and displays deterministic history with local timezone and explicit offset', () => {
    const { http, view, refresh } = setup();
    const newest = {
      ...cancelled,
      id: 'fffffc65-7b78-4d28-a91c-1c45d0fbd64a',
      equipmentName: 'Newest Camera',
      confirmedAt: '2030-01-01T01:00:00Z',
    };
    const tieFirst = {
      ...confirmed,
      id: '010bfc65-7b78-4d28-a91c-1c45d0fbd64a',
      equipmentName: 'First Camera',
    };
    refresh().click();
    http.expectOne('/api/reservations').flush([newest, tieFirst, confirmed]);
    const rows = [...view().querySelectorAll('[data-reservation-id]')];
    expect(rows.map((row) => row.getAttribute('data-reservation-id'))).toEqual([
      newest.id,
      tieFirst.id,
      confirmed.id,
    ]);
    expect(view().textContent).toContain('Cancelled');
    expect(view().textContent).toContain('Confirmed');
    expect(rows[0].textContent).toContain('Europe/Bucharest');
    expect(rows[0].textContent).toContain('14:00');
    expect(rows[0].textContent).toContain('UTC+02:00');
    expect(rows[0].textContent).toContain(newest.cancellationEventId);
    expect(
      rows[0].querySelector('[data-action="cancel-reservation"]'),
    ).toBeNull();
    http.verify();
  });

  it('preserves authoritative history ordering for confirmations separated by one microsecond', () => {
    const { http, view, refresh } = setup();
    const newer = {
      ...confirmed,
      id: 'fffffc65-7b78-4d28-a91c-1c45d0fbd64a',
      confirmedAt: '2030-01-01T00:00:00.123002Z',
    };
    const older = {
      ...confirmed,
      id: '010bfc65-7b78-4d28-a91c-1c45d0fbd64a',
      confirmedAt: '2030-01-01T00:00:00.123001Z',
    };
    refresh().click();
    http.expectOne('/api/reservations').flush([newer, older]);
    const rows = [...view().querySelectorAll('[data-reservation-id]')];
    expect(rows.map((row) => row.getAttribute('data-reservation-id'))).toEqual([
      newer.id,
      older.id,
    ]);
    http.verify();
  });

  it('disables pending actions, prevents repeated writes and displays one saved Cancelled transition', () => {
    const { http, view, refresh, cancel } = loaded();
    const button = cancel();
    button.click();
    const request = http.expectOne(`/api/reservations/${confirmed.id}/cancel`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(cancel().disabled).toBe(true);
    expect(refresh().disabled).toBe(true);
    button.click();
    http.expectNone(`/api/reservations/${confirmed.id}/cancel`);
    request.flush(cancelled);
    expect(view().textContent).toContain('Cancellation saved');
    expect(view().textContent).toContain('Cancelled');
    expect(view().textContent).toContain(cancelled.cancellationEventId);
    expect(view().textContent).toContain('Notification not yet observed');
    expect(refresh().disabled).toBe(false);
    expect(
      view().querySelector('[data-action="cancel-reservation"]'),
    ).toBeNull();
    http.verify();
  });

  it('announces at-start rejection and retains the confirmed record without a retry', () => {
    const { http, view, cancel } = loaded();
    cancel().click();
    http
      .expectOne(`/api/reservations/${confirmed.id}/cancel`)
      .flush(
        { code: 'cancellation_started' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(view().textContent).toContain('already started');
    expect(view().textContent).toContain('Confirmed');
    expect(cancel().disabled).toBe(false);
    http.expectNone(`/api/reservations/${confirmed.id}/cancel`);
    http.verify();
  });

  it('uncertain cancellation preserves saved state and explicit refresh recovers the committed transition', async () => {
    const { http, view, refresh, cancel } = loaded();
    cancel().click();
    const request = http.expectOne(`/api/reservations/${confirmed.id}/cancel`);
    await vi.advanceTimersByTimeAsync(5000);
    expect(request.cancelled).toBe(true);
    expect(view().textContent).toContain(
      'Refresh reservations before retrying',
    );
    expect(view().textContent).toContain('Confirmed');
    http.expectNone(`/api/reservations/${confirmed.id}/cancel`);
    refresh().click();
    http.expectOne('/api/reservations').flush([cancelled]);
    expect(view().textContent).toContain('Cancelled');
    expect(view().textContent).toContain(cancelled.cancellationEventId);
    http.verify();
  });

  it('cancels pending history requests when destroyed', () => {
    const { fixture, http, refresh } = setup();
    refresh().click();
    const request = http.expectOne('/api/reservations');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.verify();
  });

  it('cancels a pending cancellation request when destroyed', () => {
    const { fixture, http, cancel } = loaded();
    cancel().click();
    const request = http.expectOne(`/api/reservations/${confirmed.id}/cancel`);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.verify();
  });

  it('restores focus to refresh after successful cancellation removes its action', async () => {
    vi.useRealTimers();
    const { fixture, http, refresh, cancel } = loaded();
    document.body.appendChild(fixture.nativeElement);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const button = cancel();
    button.focus();
    button.click();
    button.blur();
    http.expectOne(`/api/reservations/${confirmed.id}/cancel`).flush(cancelled);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(refresh());
    fixture.destroy();
  });

  it('renders accessible history, pending cancellation and cancelled states', async () => {
    vi.useRealTimers();
    const { fixture, http, view, cancel } = loaded();
    document.body.appendChild(fixture.nativeElement);
    const check = async () =>
      expect(
        (
          await axe.run(view(), {
            rules: { 'color-contrast': { enabled: false } },
          })
        ).violations,
      ).toEqual([]);
    await check();
    cancel().click();
    await check();
    http.expectOne(`/api/reservations/${confirmed.id}/cancel`).flush(cancelled);
    await check();
    fixture.destroy();
  });
});
