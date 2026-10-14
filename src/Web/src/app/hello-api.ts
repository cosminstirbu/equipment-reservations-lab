import { inject, Service } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';

export interface Equipment {
  id: string;
  name: string;
}

export interface Notification {
  correlationId: string;
  message: string;
}

@Service()
export class HelloApi {
  private readonly http = inject(HttpClient);

  equipment() {
    return this.http.get<Equipment[]>('/api/equipment').pipe(timeout(5000));
  }

  send(id: string) {
    return this.http
      .post<{ correlationId: string }>('/api/hellos', { equipmentId: id })
      .pipe(timeout(5000));
  }

  notification(id: string) {
    return this.http
      .get<Notification>(`/api/notifications/${encodeURIComponent(id)}`)
      .pipe(timeout(5000));
  }
}
