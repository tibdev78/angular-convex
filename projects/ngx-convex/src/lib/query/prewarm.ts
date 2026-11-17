import { inject } from '@angular/core';
import type { ConvexClient } from 'convex/browser';
import { CONVEX_CLIENT } from '../core/config';
import type { ArgsOf, QueryReference } from '../core/types';

/**
 * Starts loading a query before it is needed (e.g. on link hover) and keeps
 * it subscribed for `extendSubscriptionFor` ms (default 5000), so that a later
 * `injectQuery` gets the value instantly.
 */
export function prewarmQuery<Query extends QueryReference>(
  query: Query,
  args: ArgsOf<Query>,
  options: { extendSubscriptionFor?: number; client?: ConvexClient } = {},
): void {
  const client = options.client ?? inject(CONVEX_CLIENT);
  const unsubscribe = client.onUpdate(query, (args ?? {}), () => undefined, () => undefined);
  setTimeout(() => unsubscribe(), options.extendSubscriptionFor ?? 5000);
}

/** Injection-context-bound variant: `const prewarm = injectPrewarmQuery(); prewarm(api.x, {})`. */
export function injectPrewarmQuery() {
  const client = inject(CONVEX_CLIENT);
  return <Query extends QueryReference>(query: Query, args: ArgsOf<Query>, extendSubscriptionFor?: number) =>
    prewarmQuery(query, args, { client, extendSubscriptionFor });
}
