import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { App } from './app/app';
import { AuthSession } from './app/auth/auth-session';
import { authInterceptor } from './app/auth/auth-interceptor';

bootstrapApplication(App, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AuthSession).initialize()),
  ],
}).catch(() => {
  document.body.textContent =
    'Equipment reservations could not start. Reload to try again.';
});
