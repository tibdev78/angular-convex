import { computed, inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { injectConvexAuth } from 'ngx-convex';
import { filter, map, take } from 'rxjs';

/** Waits for the stored session to be restored, then lets signed-in users through. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = injectConvexAuth();
  const router = inject(Router);
  const settled = computed(() => (auth.isLoading() ? undefined : auth.isAuthenticated()));
  return toObservable(settled, { injector: inject(Injector) }).pipe(
    filter((value) => value !== undefined),
    take(1),
    map((signedIn) => signedIn || router.createUrlTree(['/login'], { queryParams: { next: state.url } })),
  );
};
