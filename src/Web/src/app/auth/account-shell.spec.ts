import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import axe from 'axe-core';
import { App } from '../app';
import { Booking } from '../booking/booking';
import { AuthSession } from './auth-session';
import {
  ProviderSessionBoundary,
  sessionBoundaryProviders,
} from './auth-test-fixture';

describe('account shell', () => {
  let boundary: ProviderSessionBoundary;

  beforeEach(async () => {
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
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...sessionBoundaryProviders(boundary),
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('offers accessible explicit sign-in without requesting private APIs before authentication', async () => {
    boundary.session = null;
    await TestBed.inject(AuthSession).initialize();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    expect(root.querySelector('h1')?.textContent).toContain(
      'Equipment reservations',
    );
    const login = root.querySelector<HTMLButtonElement>(
      '[data-action="sign-in"]',
    );
    expect(login?.textContent).toContain('Sign in');
    expect(root.querySelector('main')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone(() => true);
    expect(
      (await axe.run(root, { rules: { 'color-contrast': { enabled: false } } }))
        .violations,
    ).toEqual([]);
    login!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('Sign-in did not complete');
    fixture.destroy();
  });

  it('shows current account and explicit roles, then clears private controls on expiry', async () => {
    await TestBed.inject(AuthSession).initialize();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/equipment').flush([]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('employee-a');
    expect(root.textContent).toContain('Employee');
    expect(root.querySelector('[data-action="sign-out"]')).not.toBeNull();
    TestBed.inject(AuthSession).expire();
    fixture.detectChanges();
    expect(root.textContent).toContain('Session expired');
    expect(root.querySelector('[data-action="sign-in"]')).not.toBeNull();
    expect(root.querySelector('[data-action="book"]')).toBeNull();
    fixture.destroy();
  });
});
