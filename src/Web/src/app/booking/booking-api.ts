import { inject, Service } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { timeout } from 'rxjs';

export interface BookingEquipment {
  id: string;
  name: string;
  operational: boolean;
}

export interface BookingInput {
  equipmentId: string;
  startAt: string;
  endAt: string;
}

export interface Reservation {
  id: string;
  demoUserId: string;
  equipmentId: string;
  equipmentName: string;
  startAt: string;
  endAt: string;
  status: 'Confirmed' | 'Cancelled';
  confirmedAt: string;
  cancelledAt: string | null;
  confirmationEventId: string;
  cancellationEventId: string | null;
}

export interface InboxEntry {
  eventId: string;
  reservationId: string;
  demoUserId: string;
  equipmentId: string;
  equipmentName: string;
  eventType: 'ReservationConfirmed' | 'ReservationCancelled';
  startAt: string;
  endAt: string;
  occurredAt: string;
  receivedAt: string;
  message: string;
}

export interface Availability extends BookingInput {
  available: boolean;
  advisory: boolean;
}

@Service()
export class BookingApi {
  private readonly http = inject(HttpClient);

  equipment() {
    return this.http
      .get<BookingEquipment[]>('/api/equipment')
      .pipe(timeout(5000));
  }

  availability(input: BookingInput) {
    const params = new HttpParams()
      .set('equipmentId', input.equipmentId)
      .set('startAt', input.startAt)
      .set('endAt', input.endAt);
    return this.http
      .get<Availability>('/api/availability', { params })
      .pipe(timeout(5000));
  }

  notifications() {
    return this.http
      .get<InboxEntry[]>('/api/notifications')
      .pipe(timeout(5000));
  }

  reservations() {
    return this.http
      .get<Reservation[]>('/api/reservations')
      .pipe(timeout(5000));
  }

  cancel(id: string) {
    return this.http
      .post<Reservation>(
        `/api/reservations/${encodeURIComponent(id)}/cancel`,
        null,
      )
      .pipe(timeout(5000));
  }

  book(input: BookingInput) {
    return this.http
      .post<Reservation>('/api/reservations', input)
      .pipe(timeout(5000));
  }
}
