import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, tap, throwError } from 'rxjs';
import { AuthSession } from './auth-session';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const target = new URL(request.url, window.location.origin);
  const applicationPath =
    /^\/api\/(?:equipment(?:\/[^/]+)?|availability|reservations(?:\/[^/]+(?:\/cancel)?)?|notifications)\/?$/;
  if (
    target.origin !== window.location.origin ||
    target.username ||
    target.password ||
    !applicationPath.test(target.pathname)
  )
    return next(request);

  const session = inject(AuthSession);
  const generation = session.generation();
  return from(session.tokenForAction()).pipe(
    switchMap((token) => {
      if (!session.isCurrent(generation))
        return throwError(() => new Error('Session changed.'));
      return next(
        request.clone({ setHeaders: { Authorization: 'Bearer ' + token } }),
      );
    }),
    tap(() => {
      if (!session.isCurrent(generation)) throw new Error('Session changed.');
    }),
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        session.isCurrent(generation)
      )
        session.expire();
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        session.isCurrent(generation)
      ) {
        session.forbidden();
      }
      return throwError(() => error);
    }),
  );
};
