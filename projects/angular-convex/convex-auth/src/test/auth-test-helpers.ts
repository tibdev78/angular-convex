import { ApplicationRef, EnvironmentInjector, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InMemoryStorage, type TokenStorage } from '@convex-dev/auth/browser';
import { getFunctionName } from 'convex/server';
// Through the package name (dist), like the sources: one copy of CONVEX_CLIENT.
import { FakeConvexClient, fakeMutation, fakeQuery, provideConvexTesting } from 'angular-convex/testing';
import {
  CONVEX_AUTH_HTTP_CLIENT,
  provideConvexAuthClient,
  type ConvexAuthClientOptions,
} from '../lib/provide-convex-auth-client';

export const authApi = {
  refreshSession: fakeMutation('auth:refreshSession'),
  signOut: fakeMutation('auth:signOut'),
  isAuthenticated: fakeQuery<boolean>('auth:isAuthenticated'),
};

export const tokens = (n = 1) => ({
  accessToken: `jwt-${n}`,
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: Date.now() + 3_600_000,
  userId: 'user-1',
});

export const complete = (n = 1) => ({ status: 'complete' as const, tokens: tokens(n) });

/** Fake `ConvexHttpClient`: records `refreshSession` / `signOut` calls. */
export function fakeHttp(refresh: () => unknown = () => null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    mutation: vi.fn(async (fn: unknown, args: Record<string, unknown>) => {
      const name = getFunctionName(fn as never);
      calls.push({ name, args });
      return name === 'auth:refreshSession' ? refresh() : null;
    }),
  };
}

export interface AuthSetupOptions extends Partial<ConvexAuthClientOptions> {
  convex?: FakeConvexClient;
  http?: ReturnType<typeof fakeHttp>;
  storage?: TokenStorage;
  providers?: (Provider | EnvironmentProviders)[];
}

/** TestBed with a fake Convex client, `provideConvexAuthClient` and a fake HTTP client. */
export function authSetup(options: AuthSetupOptions = {}) {
  const { convex = new FakeConvexClient(), http = fakeHttp(), storage = new InMemoryStorage(), providers = [], ...rest } =
    options;
  TestBed.configureTestingModule({
    providers: [
      provideConvexTesting(convex),
      provideConvexAuthClient({ api: authApi, storage, storageNamespace: 'test', ...rest }),
      { provide: CONVEX_AUTH_HTTP_CLIENT, useValue: http },
      ...providers,
    ],
  });
  const injector = TestBed.inject(EnvironmentInjector);
  return { convex, http, storage, injector };
}

/** Effects, change detection, then pending promises. */
export async function flush(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    const tb = TestBed as unknown as { tick?: () => void; flushEffects?: () => void };
    if (tb.tick) tb.tick();
    else tb.flushEffects?.();
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export const run = <T>(fn: () => T): T => TestBed.runInInjectionContext(fn);
