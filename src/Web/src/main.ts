import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { Hello } from './app/hello';

bootstrapApplication(Hello, { providers: [provideHttpClient()] }).catch(
  console.error,
);
