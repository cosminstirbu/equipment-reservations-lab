import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import axe from 'axe-core';
import { Hello } from './hello';

describe('equipment hello screen', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Hello],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });
  function setup() {
    const fixture = TestBed.createComponent(Hello);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      http,
      view: () => {
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
      },
    };
  }
  it('loads authoritative equipment, sends its ID and shows correlated result', async () => {
    vi.useFakeTimers();
    const { fixture, http, view } = setup();
    expect(view().textContent).toContain('Loading');
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera' }]);
    expect(view().textContent).toContain('Demo Camera');
    view().querySelector('button')!.click();
    const send = http.expectOne('/api/hellos');
    expect(send.request.body).toEqual({ equipmentId: 'camera-001' });
    expect(view().textContent).toContain('Sending');
    expect(view().querySelector('button')!.disabled).toBe(true);
    view().querySelector('button')!.click();
    http.expectNone('/api/hellos');
    send.flush({ correlationId: 'a9b2be3d-e84c-4b03-beb2-6d0e4c7d3747' });
    http
      .expectOne('/api/notifications/a9b2be3d-e84c-4b03-beb2-6d0e4c7d3747')
      .flush({
        correlationId: 'a9b2be3d-e84c-4b03-beb2-6d0e4c7d3747',
        message: 'Hello received for Demo Camera',
      });
    expect(view().textContent).toContain('Hello received for Demo Camera');
    expect(view().textContent).toContain(
      'a9b2be3d-e84c-4b03-beb2-6d0e4c7d3747',
    );
    expect(view().querySelector('button')!.disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    http.expectNone('/api/notifications/a9b2be3d-e84c-4b03-beb2-6d0e4c7d3747');
    http.verify();
    fixture.destroy();
  });
  it('reports errors accessibly and cancels pending HTTP on destroy', () => {
    const { fixture, http, view } = setup();
    http
      .expectOne('/api/equipment')
      .flush([], { status: 503, statusText: 'Unavailable' });
    expect(view().textContent).toContain('Unable to load');
    expect(view().querySelector('[role="status"]')).not.toBeNull();
    fixture.destroy();
    const another = setup();
    const request = another.http.expectOne('/api/equipment');
    another.fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
  it('enforces absolute polling deadline and stops after destruction', async () => {
    vi.useFakeTimers();
    const { fixture, http, view } = setup();
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera' }]);
    view().querySelector('button')!.click();
    http.expectOne('/api/hellos').flush({ correlationId: 'id' });
    for (let i = 0; i < 60; i++) {
      const pending = http.match('/api/notifications/id');
      pending.forEach((r) =>
        r.flush({}, { status: 404, statusText: 'Pending' }),
      );
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(view().textContent).toContain('timed out');
    const cancelled = http.match('/api/notifications/id');
    expect(cancelled.every((request) => request.cancelled)).toBe(true);
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(1000);
    http.expectNone('/api/notifications/id');
  });
  it('stalled remote call exits pending and pending polling cancels on destroy', async () => {
    vi.useFakeTimers();
    const { fixture, http, view } = setup();
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera' }]);
    view().querySelector('button')!.click();
    const send = http.expectOne('/api/hellos');
    await vi.advanceTimersByTimeAsync(5000);
    expect(send.cancelled).toBe(true);
    expect(view().textContent).toContain('Unable to send');
    fixture.destroy();
  });
  it('destroy cancels an in-flight notification and schedules no later polls', async () => {
    vi.useFakeTimers();
    const { fixture, http, view } = setup();
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera' }]);
    view().querySelector('button')!.click();
    http.expectOne('/api/hellos').flush({ correlationId: 'id' });
    const pending = http.expectOne('/api/notifications/id');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(31000);
    http.expectNone('/api/notifications/id');
  });
  it('has no axe violations in loading, ready, pending, success and error states', async () => {
    const { fixture, http, view } = setup();
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
    http
      .expectOne('/api/equipment')
      .flush([{ id: 'camera-001', name: 'Demo Camera' }]);
    await check();
    view().querySelector('button')!.click();
    await check();
    http.expectOne('/api/hellos').flush({ correlationId: 'id' });
    http.expectOne('/api/notifications/id').flush({
      correlationId: 'id',
      message: 'Hello received for Demo Camera',
    });
    await check();
    view().querySelector('button')!.click();
    http
      .expectOne('/api/hellos')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await check();
    fixture.destroy();
  });
});
