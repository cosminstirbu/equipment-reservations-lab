import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Booking } from './booking/booking';
import { Hello } from './hello';

@Component({
  selector: 'app-root',
  imports: [Booking, Hello],
  template: `
    <nav aria-label="Demo sections">
      <a href="/">Book equipment</a>
      <a href="/hello">Connectivity demo</a>
    </nav>
    @if (hello) {
      <app-hello />
    } @else {
      <app-booking />
    }
  `,
  styles: `
    nav {
      display: flex;
      gap: 1.5rem;
      max-width: 42rem;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    a {
      color: #174ea6;
    }
    a:focus-visible {
      outline: 3px solid #111;
      outline-offset: 3px;
    }
  `,
})
export class App {
  protected readonly hello = inject(DOCUMENT).location.pathname === '/hello';
}
