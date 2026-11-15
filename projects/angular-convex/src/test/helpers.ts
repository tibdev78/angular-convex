import { ApplicationRef, EnvironmentInjector, createEnvironmentInjector, type Provider, type EnvironmentProviders } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeConvexClient } from '../../testing/src/fake-convex-client';
import { provideConvex } from '../lib/core/provide-convex';

/** Fresh fake client + TestBed wired to the library sources. */
export function setup(extra: (Provider | EnvironmentProviders)[] = []) {
  const convex = new FakeConvexClient();
  TestBed.configureTestingModule({
    providers: [provideConvex({ url: convex.client.url, client: convex.asConvexClient() }), ...extra],
  });
  return { convex, injector: TestBed.inject(EnvironmentInjector) };
}

/** A child injector that can be destroyed to simulate a component going away. */
export function childInjector() {
  return createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
}

/** Flushes effects (works on Angular 17 → latest). */
export async function flush(): Promise<void> {
  const tb = TestBed as unknown as { tick?: () => void; flushEffects?: () => void };
  if (tb.tick) tb.tick();
  else tb.flushEffects?.();
  TestBed.inject(ApplicationRef).tick();
  await Promise.resolve();
}
