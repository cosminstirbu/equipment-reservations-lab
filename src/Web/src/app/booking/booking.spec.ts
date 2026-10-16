import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { Booking, BOOKING_TIME_ZONE } from './booking';
import { AuthSession } from '../auth/auth-session';
import {
  ProviderSessionBoundary,
  sessionBoundaryProviders,
} from '../auth/auth-test-fixture';

const catalog = [
  { id: 'camera-001', name: 'Demo Camera', operational: true },
  { id: 'laptop-001', name: 'Demo Laptop', operational: true },
  { id: 'projector-001', name: 'Demo Projector', operational: false },
];
const saved = {
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

describe('booking equipment', () => {
  let boundary: ProviderSessionBoundary;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    boundary = new ProviderSessionBoundary();
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
        ...sessionBoundaryProviders(boundary),
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
    const input = (id: string, value: string) => {
      const control = view().querySelector<
        HTMLInputElement | HTMLSelectElement
      >(`#${id}`)!;
      expect(control).not.toBeNull();
      control.value = value;
      control.dispatchEvent(
        new Event('input', {
          bubbles: true,
        }),
      );
      view();
    };
    const button = (action: string) =>
      view().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    view();
    return { fixture, http, view, input, button };
  }

  function ready() {
    const state = setup();
    state.http.expectOne('/api/equipment').flush(catalog);
    state.input('equipment', 'camera-001');
    state.input('start-time', '2030-01-02T14:00');
    state.input('end-time', '2030-01-02T15:00');
    return state;
  }

  it('loads catalog with local scope, labeled controls and visible timezone/operational state', () => {
    const { http, view } = setup();
    expect(view().textContent).toContain('Loading equipment');
    http.expectOne('/api/equipment').flush(catalog);
    expect(view().textContent).toContain('Europe/Bucharest');
    expect(view().querySelector('label[for="equipment"]')).not.toBeNull();
    expect(view().querySelector('label[for="start-time"]')).not.toBeNull();
    expect(view().querySelector('label[for="end-time"]')).not.toBeNull();
    expect(
      view().querySelector<HTMLOptionElement>('option[value="projector-001"]')!
        .disabled,
    ).toBe(true);
    http.verify();
  });

  it('offers availability and inbox to an Approver without Employee reservation controls', async () => {
    boundary.session = { ...boundary.session!, roles: ['Approver'] };
    await TestBed.inject(AuthSession).initialize();
    const { http, view, button } = setup();
    http.expectOne('/api/equipment').flush(catalog);
    expect(button('availability')).not.toBeNull();
    expect(button('refresh-notifications')).not.toBeNull();
    expect(button('book')).toBeNull();
    expect(button('refresh-reservations')).toBeNull();
    expect(view().textContent).toContain('Notification inbox');
    http.verify();
  });

  it('clears saved private data and cancels pending requests immediately on sign-out while retaining dates', async () => {
    const { http, view, button, fixture } = ready();
    button('book').click();
    http.expectOne('/api/reservations').flush(saved);
    expect(view().textContent).toContain(saved.id);
    button('refresh-notifications').click();
    const pending = http.expectOne('/api/notifications');
    await TestBed.inject(AuthSession).logout();
    view();
    expect(pending.cancelled).toBe(true);
    expect(view().querySelector('[data-action="book"]')).toBeNull();
    boundary.session = {
      ...boundary.session!,
      subject: 'opaque-employee-b',
      account: 'employee-b',
    };
    await TestBed.inject(AuthSession).initialize();
    view();
    http.expectOne('/api/equipment').flush(catalog);
    expect(view().textContent).not.toContain(saved.id);
    expect(view().querySelector<HTMLInputElement>('#start-time')!.value).toBe(
      '2030-01-02T14:00',
    );
    http.expectNone('/api/reservations');
    fixture.destroy();
    http.verify();
  });

  it('distinguishes an empty catalog from dependency failure and supports explicit reload', () => {
    const { http, view, button } = setup();
    http.expectOne('/api/equipment').flush([]);
    expect(view().textContent).toContain('No equipment available');
    expect(button('book').disabled).toBe(true);
    button('reload').click();
    http
      .expectOne('/api/equipment')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(view().textContent).toContain('Unable to load equipment');
    http.verify();
  });

  it('converts selected wall times to UTC, explains advisory availability and invalidates it on input change', () => {
    const { http, view, input, button } = ready();
    expect(view().textContent).toContain('UTC+02:00');
    button('availability').click();
    const availability = http.expectOne(
      (request) => request.url === '/api/availability',
    );
    expect(availability.request.params.get('startAt')).toBe(
      '2030-01-02T12:00:00.000Z',
    );
    expect(availability.request.params.get('endAt')).toBe(
      '2030-01-02T13:00:00.000Z',
    );
    availability.flush({
      equipmentId: 'camera-001',
      startAt: saved.startAt,
      endAt: saved.endAt,
      available: true,
      advisory: true,
    });
    expect(view().textContent).toContain('Available (advisory)');
    input('end-time', '2030-01-02T16:00');
    expect(view().textContent).not.toContain('Available (advisory)');
    http.verify();
  });

  it('books once, displays saved Confirmed separately from asynchronous notification and reenables actions', () => {
    const { http, view, button } = ready();
    button('book').click();
    const booking = http.expectOne('/api/reservations');
    expect(booking.request.body).toEqual({
      equipmentId: 'camera-001',
      startAt: '2030-01-02T12:00:00.000Z',
      endAt: '2030-01-02T13:00:00.000Z',
    });
    expect(button('book').disabled).toBe(true);
    button('book').click();
    http.expectNone('/api/reservations');
    booking.flush(saved);
    expect(view().textContent).toContain('Confirmed');
    expect(view().textContent).toContain('Notification not yet observed');
    expect(view().textContent).toContain(saved.id);
    expect(button('book').disabled).toBe(false);
    http.verify();
  });

  it.each([
    ['booking_conflict', 409, 'conflicts'],
    ['inventory_unavailable', 503, 'Inventory is unavailable'],
    ['invalid_interval', 400, 'Start must be before end'],
  ])('announces %s without resubmitting the write', (code, status, message) => {
    const { http, view, button } = ready();
    button('book').click();
    http
      .expectOne('/api/reservations')
      .flush({ code, title: message }, { status, statusText: 'Rejected' });
    expect(view().textContent).toContain(message);
    expect(button('book').disabled).toBe(false);
    http.expectNone('/api/reservations');
    http.verify();
  });

  it('rejects nonexistent spring DST time and requires an explicit offset for repeated autumn time', () => {
    const { http, view, input, button } = ready();
    input('start-time', '2030-03-31T03:30');
    input('end-time', '2030-03-31T05:30');
    button('book').click();
    expect(view().textContent).toContain('does not exist');
    http.expectNone('/api/reservations');
    input('start-time', '2030-10-27T03:30');
    input('end-time', '2030-10-27T04:30');
    button('book').click();
    expect(view().textContent).toContain('Choose an offset');
    http.expectNone('/api/reservations');
    input('start-offset', '+03:00');
    button('book').click();
    const request = http.expectOne('/api/reservations');
    expect(request.request.body).toEqual({
      equipmentId: 'camera-001',
      startAt: '2030-10-27T00:30:00.000Z',
      endAt: '2030-10-27T02:30:00.000Z',
    });
    request.flush(saved);
    http.verify();
  });

  it('stalled save times out with uncertain-state guidance, performs no retry and cancels on destruction', async () => {
    const { fixture, http, view, button } = ready();
    button('book').click();
    const request = http.expectOne('/api/reservations');
    await vi.advanceTimersByTimeAsync(5000);
    expect(request.cancelled).toBe(true);
    expect(view().textContent).toContain(
      'Refresh reservations before retrying',
    );
    http.expectNone('/api/reservations');
    fixture.destroy();
  });

  it('cancels pending catalog HTTP when destroyed', () => {
    const { fixture, http } = setup();
    const request = http.expectOne('/api/equipment');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('renders accessible loading, ready, pending, saved and failure states', async () => {
    vi.useRealTimers();
    const { fixture, http, view, input, button } = setup();
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
    http.expectOne('/api/equipment').flush(catalog);
    input('equipment', 'camera-001');
    input('start-time', '2030-01-02T14:00');
    input('end-time', '2030-01-02T15:00');
    await check();
    button('book').click();
    await check();
    http.expectOne('/api/reservations').flush(saved);
    await check();
    button('book').click();
    http
      .expectOne('/api/reservations')
      .flush(
        { code: 'booking_conflict' },
        { status: 409, statusText: 'Conflict' },
      );
    await check();
    fixture.destroy();
  });
});
