import { Observable } from 'rxjs';
import type { ConvexClient } from 'convex/browser';
import type { ArgsOf, QueryReference, ReturnOf } from '../core/types';

/**
 * Live query as an RxJS `Observable` (one subscription per subscriber).
 * Errors terminate the stream; unsubscribe to release the query.
 */
export function fromConvexQuery<Query extends QueryReference>(
  client: ConvexClient,
  query: Query,
  args: ArgsOf<Query>,
): Observable<ReturnOf<Query>> {
  return new Observable<ReturnOf<Query>>((subscriber) => {
    const unsubscribe = client.onUpdate(
      query as never,
      (args ?? {}) as never,
      (value: unknown) => subscriber.next(value as ReturnOf<Query>),
      (error: Error) => subscriber.error(error),
    );
    return () => unsubscribe();
  });
}
