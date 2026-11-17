import {
  computed,
  DestroyRef,
  effect,
  ENVIRONMENT_INITIALIZER,
  ErrorHandler,
  inject,
  InjectionToken,
  Injector,
  makeEnvironmentProviders,
  signal,
  untracked,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
import { AuthClient, defaultStorage, InMemoryStorage, type AuthState, type TokenStorage } from '@convex-dev/auth/browser';
import { ConvexHttpClient } from 'convex/browser';
import {
  CONVEX_CLIENT,
  CONVEX_CONFIG,
  injectConvexAuth,
  injectQuery,
  provideConvexAuth,
  type WithInjector,
} from 'ngx-convex';
import { resolveInjector } from './injector';
import { oauth } from './oauth/oauth-client';
import type { AmbientSignInClient, AuthSession, AuthSignInApi, ConvexAuthClientApi, ConvexMutationApi } from './types';

export interface ConvexAuthClientOptions {
  /** `api.auth` — the functions exported by `convex/auth.ts`. */
  api: ConvexAuthClientApi;
  /** Where tokens are kept. Defaults to `localStorage` (in memory where unavailable). */
  storage?: TokenStorage;
  /** Storage key namespace. Defaults to the deployment URL. */
  storageNamespace?: string;
  /** Sign-in methods that run on page load. Defaults to `[oauth()]`. */
  ambientSignIns?: AmbientSignInClient[];
  /** Rewrites the URL after a callback. Defaults to `history.replaceState`. */
  replaceUrl?: (url: string) => void;
  /** Logs the session manager's decisions to the console. */
  verbose?: boolean;
}

/** One-shot HTTP calls used by `refreshSession` and `signOut` (never authenticated). */
export type ConvexAuthHttpClient = ConvexMutationApi;

/**
 * HTTP client for the token refresh and sign-out. Separate from the WebSocket
 * client so a refresh never waits on the connection it is trying to authenticate.
 */
export const CONVEX_AUTH_HTTP_CLIENT = new InjectionToken<ConvexAuthHttpClient>('ngx-convex/convex-auth: http client');

/** Everything the `inject*` functions of this entry point share. */
export interface ConvexAuthContext {
  readonly client: AuthClient;
  readonly signInApi: AuthSignInApi;
  /** Mirror of `client.getSnapshot()`. */
  readonly state: Signal<AuthState>;
}

export const CONVEX_AUTH_CONTEXT = new InjectionToken<ConvexAuthContext>('ngx-convex/convex-auth: context');

const NOT_PROVIDED = 'ngx-convex/convex-auth: call provideConvexAuthClient() in the providers of the application.';

/**
 * Convex Auth for Angular — the equivalent of `<ConvexAuthProvider>`.
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideConvex(url), provideConvexAuthClient({ api: api.auth })],
 * });
 * ```
 *
 * Creates the `AuthClient` (SPA mode), restores the stored session at start-up,
 * feeds `provideConvexAuth` so queries run authenticated, and signs out when the
 * backend reports the session revoked. On the server nothing is restored: the
 * state stays `isLoading` and the browser takes over after hydration.
 */
export function provideConvexAuthClient(options: ConvexAuthClientOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH_HTTP_CLIENT,
      useFactory: (): ConvexAuthHttpClient => new ConvexHttpClient(inject(CONVEX_CONFIG).url),
    },
    { provide: CONVEX_AUTH_CONTEXT, useFactory: () => createContext(options) },
    provideConvexAuth(() => {
      const { client, state } = inject(CONVEX_AUTH_CONTEXT);
      return {
        isLoading: computed(() => state().isLoading),
        isAuthenticated: computed(() => state().isAuthenticated),
        fetchAccessToken: (args) => client.fetchAccessToken(args),
      };
    }),
    { provide: ENVIRONMENT_INITIALIZER, multi: true, useValue: () => watchSession(options.api) },
  ]);
}

function createContext(options: ConvexAuthClientOptions): ConvexAuthContext {
  const convex = inject(CONVEX_CLIENT);
  const config = inject(CONVEX_CONFIG);
  const http = inject(CONVEX_AUTH_HTTP_CLIENT);
  const { api } = options;

  const signInApi: AuthSignInApi = {
    mutation: (fn, args) => convex.mutation(fn, args),
    action: (fn, args) => convex.action(fn, args),
  };
  const client = new AuthClient({
    mode: 'spa',
    authApi: {
      refreshSession: (refreshToken) => http.mutation(api.refreshSession, { refreshToken }),
      signOut: async (refreshToken) => {
        await http.mutation(api.signOut, { refreshToken });
      },
    },
    // On the server there is no session to restore and localStorage is absent.
    storage: options.storage ?? (config.isServer ? new InMemoryStorage() : defaultStorage()),
    storageNamespace: options.storageNamespace ?? config.url,
    verbose: options.verbose,
    ambientSignIns: {
      signIns: options.ambientSignIns ?? [oauth()],
      signInApi,
      convex: { mutation: (fn, args) => convex.mutation(fn, args) },
      replaceUrl: options.replaceUrl,
    },
  });

  const state = signal<AuthState>(client.getSnapshot());
  const unsubscribe = client.subscribe(() => state.set(client.getSnapshot()));
  inject(DestroyRef).onDestroy(() => {
    unsubscribe();
    client.dispose();
  });
  if (!config.isServer) {
    // A failing token storage must surface, not leave the state loading forever unexplained.
    const errorHandler = inject(ErrorHandler);
    client.init().catch((error: unknown) => errorHandler.handleError(error));
  }

  return { client, signInApi, state: state.asReadonly() };
}

/** React `SessionWatcher`: signs out once the backend says the session is gone. */
function watchSession(api: ConvexAuthClientApi): void {
  const injector = inject(Injector);
  const { client } = inject(CONVEX_AUTH_CONTEXT);
  const convexAuth = injectConvexAuth();
  const live = injectQuery(api.isAuthenticated, () => (convexAuth.isAuthenticated() ? {} : 'skip'), { injector });
  const revoked = computed(() => live() === false);
  const errorHandler = inject(ErrorHandler);
  effect(
    () => {
      if (!revoked()) return;
      untracked(() => void client.signOut().catch((error: unknown) => errorHandler.handleError(error)));
    },
    { injector },
  );
}

/** The context, or a clear error when `provideConvexAuthClient` is missing. */
export function injectConvexAuthContext(options?: WithInjector): ConvexAuthContext {
  const context = resolveInjector(options?.injector).get(CONVEX_AUTH_CONTEXT, null);
  if (context === null) throw new Error(NOT_PROVIDED);
  return context;
}

/** The underlying `AuthClient`, for anything not wrapped here. */
export function injectAuthClient(options?: WithInjector): AuthClient {
  return injectConvexAuthContext(options).client;
}

/** How sign-in functions are executed (React `useAuthSignInApi`). */
export function injectAuthSignInApi(options?: WithInjector): AuthSignInApi {
  return injectConvexAuthContext(options).signInApi;
}

/** Raw session state of the auth client (`isLoading`, `isAuthenticated`, `token`). */
export function injectAuthState(options?: WithInjector): Signal<AuthState> {
  return injectConvexAuthContext(options).state;
}

export interface ConvexAuthActions {
  /** Stores a session returned by a sign-in function. */
  setSession: (session: AuthSession) => Promise<void>;
  /** Revokes the session on the server (best effort) and forgets the tokens. */
  signOut: () => Promise<void>;
}

/** React `useAuthActions`. */
export function injectAuthActions(options?: WithInjector): ConvexAuthActions {
  const { client } = injectConvexAuthContext(options);
  return { setSession: client.setSession, signOut: client.signOut };
}

/** React `useAuthToken`: the current JWT, or `null`. */
export function injectAuthToken(options?: WithInjector): Signal<string | null> {
  const { state } = injectConvexAuthContext(options);
  return computed(() => state().token);
}
