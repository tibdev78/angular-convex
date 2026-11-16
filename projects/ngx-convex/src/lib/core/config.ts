import { InjectionToken } from '@angular/core';
import type { ConvexClient, ConvexClientOptions } from 'convex/browser';

/**
 * Server-side rendering behaviour.
 *
 * On the server no WebSocket is ever opened. When `prefetch` is enabled, every
 * `injectQuery()` executed during the server render runs once over HTTP, the
 * render waits for it, and the result is shipped to the browser through
 * Angular's `TransferState`. The browser then starts from that value and
 * upgrades to a live subscription.
 */
export interface ConvexSsrOptions {
  /**
   * Fetch queries over HTTP during the server render and transfer the results.
   * Defaults to `true`. Individual queries can opt out with `{ ssr: false }`.
   */
  prefetch?: boolean;
  /**
   * Maximum time (ms) the server render waits for a single query.
   * Defaults to `5000`. A query that times out renders in its loading state.
   */
  timeoutMs?: number;
}

/** Configuration accepted by {@link provideConvex}. */
export interface ConvexConfig {
  /** Deployment URL, e.g. `https://happy-otter-123.convex.cloud`. */
  url: string;
  /** Options forwarded to the underlying `ConvexClient`. */
  options?: ConvexClientOptions;
  /**
   * Bring your own client instead of letting the library create one.
   * The library will not close a client it did not create.
   */
  client?: ConvexClient;
  /** Server-side rendering behaviour. See {@link ConvexSsrOptions}. */
  ssr?: ConvexSsrOptions;
}

/** The resolved configuration, available for advanced integrations. */
export interface ResolvedConvexConfig {
  readonly url: string;
  readonly ssr: Required<ConvexSsrOptions>;
  readonly isServer: boolean;
}

export const CONVEX_CONFIG = new InjectionToken<ResolvedConvexConfig>(
  'ngx-convex: config',
);

/** The single `ConvexClient` shared by the environment injector. */
export const CONVEX_CLIENT = new InjectionToken<ConvexClient>(
  'ngx-convex: ConvexClient',
);
