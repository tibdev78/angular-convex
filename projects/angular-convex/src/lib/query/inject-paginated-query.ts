import { computed, signal, type Signal } from '@angular/core';
/** Mirrors `PaginationStatus` from `convex/browser`. */
export type PaginationStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
import { CONVEX_CLIENT } from '../core/config';
import type { QueryReference, ReturnOf, SkipToken, WithInjector, ArgsOf } from '../core/types';
import { resolveInjector } from '../util/compat';
import { functionName, sameTarget, targetSource, toError, type Target } from '../util/args';
import { connectReactive } from '../util/reactive';

/** Item type of a paginated query (`PaginationResult<Item>`). */
export type PaginatedItem<Query> = ReturnOf<Query> extends { page: (infer Item)[] } ? Item : unknown;

/** Arguments of a paginated query without `paginationOpts`. */
export type PaginatedArgs<Query> = Omit<ArgsOf<Query>, 'paginationOpts'>;

export interface PaginatedQueryOptions extends WithInjector {
  /** Size of the first page. */
  initialNumItems: number;
  /** Reading `results()` while the query is in error throws that error. Defaults to `false`. */
  throwOnError?: boolean;
}

export interface ConvexPaginatedQuery<Item> {
  /** All loaded items, across pages, kept up to date in real time. */
  readonly results: Signal<Item[]>;
  readonly status: Signal<PaginationStatus | 'Skipped'>;
  readonly error: Signal<Error | undefined>;
  readonly isLoading: Signal<boolean>;
  readonly canLoadMore: Signal<boolean>;
  /** Requests `numItems` more items. Returns `false` if nothing was started. */
  loadMore(numItems: number): boolean;
}

/**
 * Live, paginated query (React `usePaginatedQuery`). The server function must
 * take `paginationOpts` and return `ctx.db.query(...).paginate(paginationOpts)`.
 * Changing the arguments restarts from the first page.
 */
export function injectPaginatedQuery<Query extends QueryReference>(
  query: Query,
  args: PaginatedArgs<Query> | SkipToken | (() => PaginatedArgs<Query> | SkipToken),
  options: PaginatedQueryOptions,
): ConvexPaginatedQuery<PaginatedItem<Query>> {
  type Item = PaginatedItem<Query>;
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  const results = signal<Item[]>([]);
  const status = signal<PaginationStatus | 'Skipped'>('LoadingFirstPage');
  const error = signal<Error | undefined>(undefined);
  let loadMore: (n: number) => boolean = () => false;

  connectReactive(injector, targetSource(functionName(query), args), sameTarget, (target: Target) => {
    results.set([]);
    error.set(undefined);
    loadMore = () => false;
    if (target.skip) {
      status.set('Skipped');
      return () => undefined;
    }
    status.set('LoadingFirstPage');
    const apply = (value: unknown) => {
      const page = value as { results: Item[]; status: PaginationStatus; loadMore: (n: number) => boolean } | undefined;
      if (!page) return;
      results.set(page.results);
      status.set(page.status);
      loadMore = page.loadMore;
    };
    const handle = client.onPaginatedUpdate_experimental(
      query as never,
      target.args as never,
      { initialNumItems: options.initialNumItems },
      apply,
      (e: Error) => error.set(e),
    );
    try {
      apply(handle.getCurrentValue());
    } catch (e) {
      error.set(toError(e));
    }
    return () => handle();
  });

  return {
    results: options.throwOnError
      ? computed(() => {
          const e = error();
          if (e) throw e;
          return results();
        })
      : results.asReadonly(),
    status: status.asReadonly(),
    error: error.asReadonly(),
    isLoading: computed(() => status() === 'LoadingFirstPage' || status() === 'LoadingMore'),
    canLoadMore: computed(() => status() === 'CanLoadMore'),
    loadMore: (numItems: number) => loadMore(numItems),
  };
}
