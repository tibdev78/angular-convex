import { inject, Injector } from '@angular/core';

/**
 * `inject(Injector)` that also accepts an explicit injector. Local copy: the
 * core keeps its own `resolveInjector` internal (not in its public API).
 */
export function resolveInjector(injector?: Injector): Injector {
  return injector ?? inject(Injector);
}
