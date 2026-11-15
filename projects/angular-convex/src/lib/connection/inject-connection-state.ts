import { DestroyRef, signal, type Signal } from '@angular/core';
import type { ConnectionState } from 'convex/browser';
import { CONVEX_CLIENT } from '../core/config';
import type { WithInjector } from '../core/types';
import { resolveInjector } from '../util/compat';

/** WebSocket / in-flight state of the client (React `useConvexConnectionState`). */
export function injectConvexConnectionState(options: WithInjector = {}): Signal<ConnectionState> {
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  const state = signal<ConnectionState>(client.connectionState());
  const unsubscribe = client.subscribeToConnectionState((next) => state.set(next));
  injector.get(DestroyRef).onDestroy(() => unsubscribe());
  return state.asReadonly();
}
