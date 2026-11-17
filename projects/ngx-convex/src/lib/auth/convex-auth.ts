import {
  computed,
  DestroyRef,
  effect,
  ENVIRONMENT_INITIALIZER,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  makeEnvironmentProviders,
  runInInjectionContext,
  signal,
  untracked,
  type EnvironmentProviders,
  type Signal,
} from '@angular/core';
import { ConvexHttpClient } from 'convex/browser';
import { CONVEX_CLIENT, CONVEX_CONFIG } from '../core/config';

/** Fetches a JWT for Convex. `forceRefreshToken` is set after the server rejected the previous one. */
export type AccessTokenFetcher = (args: { forceRefreshToken: boolean }) => Promise<string | null | undefined>;

/**
 * Bridge between any identity provider (Convex Auth, Auth0, Clerk, Firebase,
 * WorkOS, a custom OIDC client…) and Convex — the Angular equivalent of the
 * `useAuth` prop of React's `ConvexProviderWithAuth`.
 */
export interface ConvexAuthProvider {
  /** The identity provider is still restoring its session. */
  isLoading: Signal<boolean>;
  /** The identity provider has a signed-in user. */
  isAuthenticated: Signal<boolean>;
  fetchAccessToken: AccessTokenFetcher;
}

/** Combined state (React `useConvexAuth`). */
export interface ConvexAuthState {
  /** `true` until both the provider and the Convex backend have decided. */
  isLoading: boolean;
  /** `true` once the Convex backend has validated the token. */
  isAuthenticated: boolean;
  /** A token refresh is in progress while authenticated. */
  isRefreshing: boolean;
}

/** The identity provider adapter registered by {@link provideConvexAuth}. */
const CONVEX_AUTH_PROVIDER = new InjectionToken<ConvexAuthProvider>('ngx-convex: auth provider');

/**
 * Connects an identity provider to Convex. The factory runs in an injection
 * context, so it can `inject()` the provider's own services.
 *
 * ```ts
 * provideConvexAuth(() => {
 *   const auth0 = inject(AuthService);
 *   return {
 *     isLoading: toSignal(auth0.isLoading$, { initialValue: true }),
 *     isAuthenticated: toSignal(auth0.isAuthenticated$, { initialValue: false }),
 *     fetchAccessToken: ({ forceRefreshToken }) =>
 *       firstValueFrom(auth0.getAccessTokenSilently({ cacheMode: forceRefreshToken ? 'off' : 'on' })),
 *   };
 * });
 * ```
 */
export function provideConvexAuth(
  provider: ConvexAuthProvider | (() => ConvexAuthProvider),
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: CONVEX_AUTH_PROVIDER,
      useFactory: () => {
        if (typeof provider !== 'function') return provider;
        const injector = inject(Injector);
        return runInInjectionContext(injector, provider);
      },
    },
    ConvexAuthService,
    { provide: ENVIRONMENT_INITIALIZER, multi: true, useValue: () => inject(ConvexAuthService) },
  ]);
}

interface InternalClient {
  setAuth(fetch: AccessTokenFetcher, onChange: (auth: boolean) => void, onRefreshChange?: (r: boolean) => void): void;
  clearAuth(): void;
}

/**
 * Drives `client.setAuth` / `client.clearAuth` from the provider's signals,
 * exactly like `ConvexProviderWithAuth`.
 */
@Injectable()
export class ConvexAuthService {
  private readonly provider = inject(CONVEX_AUTH_PROVIDER);
  private readonly client = inject(CONVEX_CLIENT);
  /** `null` = unknown (loading), otherwise what the backend reported. */
  private readonly convexAuthenticated = signal<boolean | null>(null);
  private readonly refreshing = signal(false);
  private generation = 0;
  private active = false;

  readonly state: Signal<ConvexAuthState> = computed(
    () => {
      const providerAuth = this.provider.isAuthenticated();
      const providerLoading = this.provider.isLoading();
      const backend = this.convexAuthenticated();
      const isAuthenticated = !providerLoading && providerAuth && (backend ?? false);
      const isLoading = providerLoading || (providerAuth && backend === null);
      return { isLoading, isAuthenticated, isRefreshing: this.refreshing() && isAuthenticated };
    },
    { equal: (a, b) => a.isLoading === b.isLoading && a.isAuthenticated === b.isAuthenticated && a.isRefreshing === b.isRefreshing },
  );
  readonly isLoading = computed(() => this.state().isLoading);
  readonly isAuthenticated = computed(() => this.state().isAuthenticated);
  readonly isRefreshing = computed(() => this.state().isRefreshing);

  constructor() {
    const wanted = computed(() => !this.provider.isLoading() && this.provider.isAuthenticated());
    const sync = (authenticate: boolean) => {
      if (authenticate === this.active) return;
      this.active = authenticate;
      const generation = ++this.generation;
      const inner = (this.client as unknown as { client: InternalClient }).client;
      if (authenticate) {
        this.convexAuthenticated.set(null);
        const onChange = (auth: boolean) => {
          if (generation === this.generation) this.convexAuthenticated.set(auth);
        };
        const onRefresh = (r: boolean) => {
          if (generation === this.generation) this.refreshing.set(r);
        };
        if (inner?.setAuth) inner.setAuth(this.provider.fetchAccessToken, onChange, onRefresh);
        else this.client.setAuth(this.provider.fetchAccessToken, onChange);
      } else {
        inner?.clearAuth();
        this.convexAuthenticated.set(this.provider.isLoading() ? null : false);
        this.refreshing.set(false);
      }
    };
    untracked(() => sync(wanted()));
    const ref = effect(() => {
      const next = wanted();
      untracked(() => sync(next));
    });
    inject(DestroyRef).onDestroy(() => ref.destroy());
  }
}

/** Combined auth state as signals (React `useConvexAuth`). */
export function injectConvexAuth(): Pick<ConvexAuthService, 'state' | 'isLoading' | 'isAuthenticated' | 'isRefreshing'> {
  return inject(ConvexAuthService);
}

/**
 * The access token of the configured auth provider, fetched on demand: for a
 * `fetch` to an HTTP action (`Authorization: Bearer …`) or any other call that
 * must carry the user's identity. Resolves to `null` without a provider or a
 * signed-in user.
 */
export function injectFetchAccessToken(): (args?: { forceRefreshToken?: boolean }) => Promise<string | null> {
  const provider = inject(CONVEX_AUTH_PROVIDER, { optional: true });
  return async ({ forceRefreshToken = false } = {}) => {
    if (!provider || provider.isLoading() || !provider.isAuthenticated()) return null;
    return (await provider.fetchAccessToken({ forceRefreshToken })) ?? null;
  };
}

/**
 * A fresh `ConvexHttpClient` that carries the signed-in user's token, so that
 * `ctx.auth` works in one-shot HTTP calls (`query`, `mutation`, `action`,
 * `consistentQuery`). The shared `injectConvexHttpClient()` stays anonymous.
 *
 * ```ts
 * const http = injectAuthenticatedHttpClient();
 * const todos = await (await http()).query(api.todos.list, {});
 * ```
 */
export function injectAuthenticatedHttpClient(): () => Promise<ConvexHttpClient> {
  const { url } = inject(CONVEX_CONFIG);
  const fetchToken = injectFetchAccessToken();
  return async () => {
    const token = await fetchToken();
    return new ConvexHttpClient(url, token ? { auth: token } : undefined);
  };
}
