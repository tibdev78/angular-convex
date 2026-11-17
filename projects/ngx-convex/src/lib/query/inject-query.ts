import {
  computed,
  makeStateKey,
  signal,
  TransferState,
  type Injector,
  type Signal,
} from '@angular/core';
import type { ConvexClient } from 'convex/browser';
import { CONVEX_CLIENT, CONVEX_CONFIG } from '../core/config';
import { CONVEX_HTTP_CLIENT } from '../core/provide-convex';
import type {
  ArgsInput,
  ArgsOf,
  EmptyArgs,
  QueryReference,
  ReturnOf,
  WithInjector,
} from '../core/types';
import { addPendingTask, resolveInjector } from '../util/compat';
import { functionName, sameTarget, targetSource, toError, type Target } from '../util/args';
import { connectReactive } from '../util/reactive';

/** Lifecycle of a query. */
export type QueryStatus = 'pending' | 'success' | 'error' | 'skipped';

export interface QueryOptions<T> extends WithInjector {
  /** Value exposed while the first result is loading. */
  initialValue?: T;
  /**
   * Keep showing the previous result while the arguments change and the new
   * result loads. Defaults to `false` (data resets to `initialValue`).
   */
  keepPreviousData?: boolean;
  /** Set to `false` to skip the SSR prefetch of this query. Defaults to `true`. */
  ssr?: boolean;
  /**
   * Reading the data while the query is in error throws that error (React's
   * `throwOnError`): it reaches Angular's `ErrorHandler`, or the `@error` block
   * of a surrounding `@defer`. Defaults to `false` (read `error()` instead).
   */
  throwOnError?: boolean;
}

/**
 * A live Convex query. Calling it returns the latest data (same as `data()`).
 */
export interface ConvexQuery<T> extends Signal<T | undefined> {
  readonly data: Signal<T | undefined>;
  readonly error: Signal<Error | undefined>;
  readonly status: Signal<QueryStatus>;
  /** `true` until the first result (or error) for the current arguments. */
  readonly isLoading: Signal<boolean>;
  readonly isSuccess: Signal<boolean>;
  readonly isError: Signal<boolean>;
  readonly isSkipped: Signal<boolean>;
}

interface QueryState<T> {
  status: QueryStatus;
  data: T | undefined;
  error: Error | undefined;
}

/**
 * Subscribes to a Convex query and exposes its result as Signals.
 *
 * ```ts
 * readonly todos = injectQuery(api.todos.list, () => ({ done: this.filter() }));
 * // template: @for (t of todos(); track t._id) { ... }
 * ```
 *
 * - `args` may be static, `'skip'`, or a function reading signals: the
 *   subscription is replaced whenever the serialized arguments change.
 * - The subscription is released when the injection context is destroyed.
 * - Identical subscriptions are deduplicated by the Convex client.
 */
export function injectQuery<Query extends QueryReference>(
  query: Query,
  ...rest: QueryRest<Query>
): ConvexQuery<ReturnOf<Query>> {
  const [args, options = {}] = rest as [ArgsInput<Query> | undefined, QueryOptions<ReturnOf<Query>>?];
  const injector = resolveInjector(options.injector);
  return createQuery(injector, query, args ?? {}, options);
}

/** `args` is optional for functions without arguments (see {@link OptionalArgs}). */
export type QueryRest<Query extends QueryReference> = ArgsOf<Query> extends EmptyArgs
  ? [args?: ArgsInput<Query>, options?: QueryOptions<ReturnOf<Query>>]
  : [args: ArgsInput<Query>, options?: QueryOptions<ReturnOf<Query>>];

function createQuery<T>(
  injector: Injector,
  query: QueryReference,
  args: unknown,
  options: QueryOptions<T>,
): ConvexQuery<T> {
  const client = injector.get(CONVEX_CLIENT);
  const config = injector.get(CONVEX_CONFIG);
  const transferState = injector.get(TransferState, null);
  const name = functionName(query);

  const state = signal<QueryState<T>>({
    status: 'pending',
    data: options.initialValue,
    error: undefined,
  });

  const connect = (target: Target): (() => void) => {
    const previous = state();
    if (target.skip) {
      state.set({ status: 'skipped', data: options.initialValue, error: undefined });
      return () => undefined;
    }
    state.set({
      status: 'pending',
      data: options.keepPreviousData ? previous.data : options.initialValue,
      error: undefined,
    });

    const stateKey = makeStateKey<T>(`convex:${target.key}`);

    if (config.isServer) {
      return serverPrefetch(injector, query, target, stateKey, options, state, transferState);
    }

    // Hydrate from the server render while the live subscription starts.
    if (transferState?.hasKey(stateKey)) {
      state.set({ status: 'success', data: transferState.get(stateKey, undefined as T), error: undefined });
    }

    return subscribe(client, query, target, (next) => {
      transferState?.remove(stateKey);
      state.set(next);
    }, () => state().data);
  };

  connectReactive(injector, targetSource(name, args), sameTarget, connect);

  return toConvexQuery(state, options.throwOnError);
}

/** Opens the live subscription and maps its callbacks to state updates. */
function subscribe<T>(
  client: ConvexClient,
  query: QueryReference,
  target: Target,
  set: (state: QueryState<T>) => void,
  currentData: () => T | undefined,
): () => void {
  const unsubscribe = client.onUpdate(
    query,
    target.args,
    (value: unknown) => set({ status: 'success', data: value as T, error: undefined }),
    (error: Error) => set({ status: 'error', data: currentData(), error }),
  );
  // Results already in the client cache are available synchronously.
  try {
    const cached = unsubscribe.getCurrentValue() as T | undefined;
    if (cached !== undefined) set({ status: 'success', data: cached, error: undefined });
  } catch (error) {
    set({ status: 'error', data: currentData(), error: toError(error) });
  }
  return () => unsubscribe();
}

function serverPrefetch<T>(
  injector: Injector,
  query: QueryReference,
  target: Target,
  stateKey: ReturnType<typeof makeStateKey<T>>,
  options: QueryOptions<T>,
  state: ReturnType<typeof signal<QueryState<T>>>,
  transferState: TransferState | null,
): () => void {
  const config = injector.get(CONVEX_CONFIG);
  if (!config.ssr.prefetch || options.ssr === false) return () => undefined;
  let cancelled = false;
  const done = addPendingTask(injector);
  const http = injector.get(CONVEX_HTTP_CLIENT);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`SSR prefetch timed out after ${config.ssr.timeoutMs}ms`)), config.ssr.timeoutMs),
  );
  Promise.race([http.query(query, target.args), timeout])
    .then((value) => {
      if (cancelled) return;
      state.set({ status: 'success', data: value as T, error: undefined });
      transferState?.set(stateKey, value as T);
    })
    .catch((error: unknown) => {
      if (!cancelled) state.set({ status: 'error', data: undefined, error: toError(error) });
    })
    .finally(done);
  return () => {
    cancelled = true;
    done();
  };
}

/** Exposes a state signal as the public `ConvexQuery` shape. */
export function toConvexQuery<T>(state: Signal<QueryState<T>>, throwOnError = false): ConvexQuery<T> {
  const data = computed(() => {
    const { status, data, error } = state();
    if (throwOnError && status === 'error') throw error;
    return data;
  });
  const status = computed(() => state().status);
  return Object.assign(data, {
    data,
    error: computed(() => state().error),
    status,
    isLoading: computed(() => status() === 'pending'),
    isSuccess: computed(() => status() === 'success'),
    isError: computed(() => status() === 'error'),
    isSkipped: computed(() => status() === 'skipped'),
  }) as ConvexQuery<T>;
}

