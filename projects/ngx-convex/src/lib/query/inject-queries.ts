import { computed, DestroyRef, effect, signal, untracked, type Signal } from '@angular/core';
import { CONVEX_CLIENT } from '../core/config';
import type { QueryReference, WithInjector } from '../core/types';
import { resolveInjector } from '../util/compat';
import { functionName, toError, toTarget, type Target } from '../util/args';

/** One entry of {@link injectQueries}. */
export interface QueryRequest {
  query: QueryReference;
  args?: Record<string, unknown> | 'skip';
}

/** `value`, `Error` when the query failed, `undefined` while loading or skipped. */
export type QueriesResult<R extends Record<string, QueryRequest>> = {
  [K in keyof R]: unknown | Error | undefined;
};

interface Live {
  target: Target;
  unsubscribe: () => void;
}

/**
 * Subscribes to a dynamic set of queries at once (React `useQueries`).
 * Entries whose identity is unchanged keep their subscription and value.
 *
 * ```ts
 * readonly rows = injectQueries(() =>
 *   Object.fromEntries(this.ids().map((id) => [id, { query: api.items.get, args: { id } }])),
 * );
 * ```
 */
export function injectQueries<R extends Record<string, QueryRequest>>(
  requests: R | (() => R),
  options: WithInjector = {},
): Signal<QueriesResult<R>> {
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  const values = signal<Record<string, unknown>>({});
  const live = new Map<string, Live>();

  const sync = (next: R) => {
    const targets = new Map<string, { req: QueryRequest; target: Target }>();
    for (const [key, req] of Object.entries(next)) {
      targets.set(key, { req, target: toTarget(functionName(req.query), req.args ?? {}) });
    }
    for (const [key, entry] of live) {
      const wanted = targets.get(key);
      if (!wanted || wanted.target.key !== entry.target.key) {
        entry.unsubscribe();
        live.delete(key);
        values.update((v) => omit(v, key));
      }
    }
    for (const [key, { req, target }] of targets) {
      if (live.has(key) || target.skip) continue;
      const set = (value: unknown) => {
        if (live.get(key)?.target.key === target.key) values.update((v) => ({ ...v, [key]: value }));
      };
      const handle = client.onUpdate(req.query, target.args, set, (e: Error) => set(e));
      live.set(key, { target, unsubscribe: () => handle() });
      try {
        const cached = handle.getCurrentValue();
        if (cached !== undefined) set(cached);
      } catch (e) {
        set(toError(e));
      }
    }
  };

  if (typeof requests === 'function') {
    const ref = effect(() => {
      const next = requests();
      untracked(() => sync(next));
    }, { injector });
    injector.get(DestroyRef).onDestroy(() => ref.destroy());
  } else {
    untracked(() => sync(requests));
  }
  injector.get(DestroyRef).onDestroy(() => {
    for (const entry of live.values()) entry.unsubscribe();
    live.clear();
  });

  return computed(() => values() as QueriesResult<R>);
}

function omit(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
