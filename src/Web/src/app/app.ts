import { Component } from '@angular/core';
import { Booking } from './booking/booking';

@Component({
  selector: 'app-root',
  imports: [Booking],
  template: `<app-booking />`,
})
export class App {}
