import { injectQuery, type ConvexQuery, type QueryOptions } from './inject-query';
import { prewarmQuery } from './prewarm';
import type { ArgsInput, ArgsOf, QueryReference, ReturnOf } from '../core/types';

/**
 * A query and its arguments as one value: what `convexQueryOptions` from
 * `convex/browser` builds, for example to share it between a prewarm and the
 * page that reads it, or to hand it to TanStack Query.
 */
export interface ConvexQueryOptions<Query extends QueryReference> {
  query: Query;
  args: ArgsOf<Query>;
}

/**
 * Same as `convexQueryOptions` from `convex/browser`: an identity function
 * that types `{ query, args }` against the function reference.
 */
export function convexQueryOptions<Query extends QueryReference>(options: ConvexQueryOptions<Query>): ConvexQueryOptions<Query> {
  return options;
}

/** `injectQuery` with one options object, like React's `useQuery({ query, args })`. */
export type QueryFromOptions<Query extends QueryReference> = QueryOptions<ReturnOf<Query>> & {
  query: Query;
  /** Static, `'skip'`, or a function reading signals. Defaults to `{}`. */
  args?: ArgsInput<Query>;
};

/**
 * The options-object form of {@link injectQuery}:
 *
 * ```ts
 * const todos = convexQueryOptions({ query: api.todos.list, args: {} });
 * readonly list = injectQueryFromOptions({ ...todos, throwOnError: true });
 * ```
 */
export function injectQueryFromOptions<Query extends QueryReference>(options: QueryFromOptions<Query>): ConvexQuery<ReturnOf<Query>> {
  const { query, args, ...rest } = options;
  return (injectQuery as (q: Query, a: unknown, o: QueryOptions<ReturnOf<Query>>) => ConvexQuery<ReturnOf<Query>>)(query, args ?? {}, rest);
}

/** {@link prewarmQuery} for a `convexQueryOptions` value. */
export function prewarmQueryFromOptions<Query extends QueryReference>(
  options: ConvexQueryOptions<Query>,
  extra?: Parameters<typeof prewarmQuery>[2],
): void {
  prewarmQuery(options.query, options.args, extra);
}
