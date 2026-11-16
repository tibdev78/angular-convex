import { DestroyRef, signal, type Signal } from '@angular/core';
import { type WithInjector } from 'ngx-convex';
import { resolveInjector } from './injector';
import { injectConvexAuthContext } from './provide-convex-auth-client';

/**
 * A value published by an ambient sign-in (React `useAmbientSignInValue`),
 * as a signal that follows it until the injection context is destroyed.
 */
export function injectAmbientSignInValue<T>(id: string, key: string, options?: WithInjector): Signal<T | undefined> {
  const injector = resolveInjector(options?.injector);
  const reader = injectConvexAuthContext({ injector }).client.ambientSignInValues(id);
  const value = signal<T | undefined>(reader.get<T>(key));
  const unsubscribe = reader.subscribe(key, () => value.set(reader.get<T>(key)));
  injector.get(DestroyRef).onDestroy(unsubscribe);
  return value.asReadonly();
}
