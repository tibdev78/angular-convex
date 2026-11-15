import { isPlatformServer } from '@angular/common';
import {
  DestroyRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
  type EnvironmentProviders,
} from '@angular/core';
import { ConvexClient, ConvexHttpClient } from 'convex/browser';
import {
  CONVEX_CLIENT,
  CONVEX_CONFIG,
  type ConvexConfig,
  type ResolvedConvexConfig,
} from './config';

/**
 * A `ConvexHttpClient` bound to the same deployment. Used for one-shot calls
 * that must not open a WebSocket (server-side rendering, scripts, prefetch).
 */
export const CONVEX_HTTP_CLIENT = new InjectionToken<ConvexHttpClient>(
  'angular-convex: ConvexHttpClient',
);

/**
 * Registers Convex for the application (or for a lazy route's environment).
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideConvex(environment.convexUrl)],
 * });
 * ```
 *
 * One WebSocket client is created per environment injector and closed when
 * that injector is destroyed. On the server, no WebSocket is opened.
 */
export function provideConvex(
  urlOrConfig: string | ConvexConfig,
): EnvironmentProviders {
  const config: ConvexConfig =
    typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;
  if (!config.url && !config.client) {
    throw new Error(
      'angular-convex: provideConvex() needs a deployment URL (e.g. https://<name>.convex.cloud).',
    );
  }
  return makeEnvironmentProviders([
    {
      provide: CONVEX_CONFIG,
      useFactory: (): ResolvedConvexConfig => ({
        url: config.url || (config.client?.client.url ?? ''),
        isServer: isPlatformServer(inject(PLATFORM_ID)),
        ssr: {
          prefetch: config.ssr?.prefetch ?? true,
          timeoutMs: config.ssr?.timeoutMs ?? 5000,
        },
      }),
    },
    {
      provide: CONVEX_CLIENT,
      useFactory: () => {
        if (config.client) return config.client;
        const { isServer, url } = inject(CONVEX_CONFIG);
        // A disabled client never opens a socket: subscriptions are inert and
        // the SSR prefetch path uses the HTTP client instead.
        const client = new ConvexClient(url, {
          ...config.options,
          disabled: isServer || config.options?.disabled,
        });
        inject(DestroyRef).onDestroy(() => void client.close());
        return client;
      },
    },
    {
      provide: CONVEX_HTTP_CLIENT,
      useFactory: () => new ConvexHttpClient(inject(CONVEX_CONFIG).url),
    },
  ]);
}

/** The `ConvexClient` of the current injector, for anything not wrapped here. */
export function injectConvex(): ConvexClient {
  return inject(CONVEX_CLIENT);
}

/** The `ConvexHttpClient` of the current injector. */
export function injectConvexHttpClient(): ConvexHttpClient {
  return inject(CONVEX_HTTP_CLIENT);
}
