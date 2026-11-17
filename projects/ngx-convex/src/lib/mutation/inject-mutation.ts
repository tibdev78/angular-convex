import { computed, signal, type Signal } from '@angular/core';
import type { OptimisticLocalStore } from 'convex/browser';
import { CONVEX_CLIENT } from '../core/config';
import type { ArgsOf, MutationReference, OptionalArgs, ReturnOf, WithInjector } from '../core/types';
import { resolveInjector } from '../util/compat';
import { toError } from '../util/args';

export type CallStatus = 'idle' | 'pending' | 'success' | 'error';

/** Optimistic update, same contract as Convex React's `withOptimisticUpdate`. */
export type OptimisticUpdate<Args> = (localStore: OptimisticLocalStore, args: Args) => void;

export interface CallOptions<Args, Result> extends WithInjector {
  onSuccess?: (result: Result, args: Args) => void;
  onError?: (error: Error, args: Args) => void;
}

export interface MutationOptions<Args, Result> extends CallOptions<Args, Result> {
  optimisticUpdate?: OptimisticUpdate<Args>;
}

/** Shared state of an imperative Convex call (mutation or action). */
export interface CallState<Result> {
  readonly data: Signal<Result | undefined>;
  readonly error: Signal<Error | undefined>;
  readonly status: Signal<CallStatus>;
  readonly isPending: Signal<boolean>;
  /** Number of calls currently in flight. */
  readonly inFlight: Signal<number>;
  /** Back to `idle`, clearing data and error. */
  reset(): void;
}

/**
 * A callable mutation: `await addTodo({ text })`. The returned promise rejects
 * on failure; the signals reflect the latest call.
 */
export interface ConvexMutation<Ref extends MutationReference> extends CallState<ReturnOf<Ref>> {
  (...args: OptionalArgs<Ref>): Promise<ReturnOf<Ref>>;
  /** Same as calling the mutation. */
  mutate(...args: OptionalArgs<Ref>): Promise<ReturnOf<Ref>>;
  /** New mutation with an optimistic update (React `withOptimisticUpdate`). */
  withOptimisticUpdate(update: OptimisticUpdate<ArgsOf<Ref>>): ConvexMutation<Ref>;
}

/**
 * ```ts
 * readonly addTodo = injectMutation(api.todos.add).withOptimisticUpdate((store, { text }) => {
 *   const list = store.getQuery(api.todos.list, {});
 *   if (list) store.setQuery(api.todos.list, {}, [...list, { _id: 'tmp', text }]);
 * });
 * ```
 */
export function injectMutation<Ref extends MutationReference>(
  mutation: Ref,
  options: MutationOptions<ArgsOf<Ref>, ReturnOf<Ref>> = {},
): ConvexMutation<Ref> {
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  return buildMutation(mutation, options, (args, optimisticUpdate) =>
    client.mutation(mutation, args, optimisticUpdate ? { optimisticUpdate: optimisticUpdate } : undefined),
  );
}

function buildMutation<Ref extends MutationReference>(
  ref: Ref,
  options: MutationOptions<ArgsOf<Ref>, ReturnOf<Ref>>,
  run: (args: ArgsOf<Ref>, update?: OptimisticUpdate<ArgsOf<Ref>>) => Promise<unknown>,
): ConvexMutation<Ref> {
  const call = createCall<ArgsOf<Ref>, ReturnOf<Ref>>(options, (args) => run(args, options.optimisticUpdate));
  return Object.assign(call.invoke, {
    ...call.state,
    mutate: call.invoke,
    withOptimisticUpdate: (optimisticUpdate: OptimisticUpdate<ArgsOf<Ref>>) =>
      buildMutation(ref, { ...options, optimisticUpdate }, run),
  }) as unknown as ConvexMutation<Ref>;
}

/** @internal State machine shared by mutations and actions. */
export function createCall<Args, Result>(
  options: CallOptions<Args, Result>,
  run: (args: Args) => Promise<unknown>,
): { invoke: (args?: Args) => Promise<Result>; state: CallState<Result> } {
  const data = signal<Result | undefined>(undefined);
  const error = signal<Error | undefined>(undefined);
  const status = signal<CallStatus>('idle');
  const inFlight = signal(0);
  let latest = 0;

  const invoke = async (args?: Args): Promise<Result> => {
    const id = ++latest;
    const callArgs = (args ?? {}) as Args;
    inFlight.update((n) => n + 1);
    status.set('pending');
    error.set(undefined);
    try {
      const result = (await run(callArgs)) as Result;
      if (id === latest) {
        data.set(result);
        status.set('success');
      }
      options.onSuccess?.(result, callArgs);
      return result;
    } catch (e) {
      const err = toError(e);
      if (id === latest) {
        error.set(err);
        status.set('error');
      }
      options.onError?.(err, callArgs);
      throw err;
    } finally {
      inFlight.update((n) => n - 1);
    }
  };

  return {
    invoke,
    state: {
      data: data.asReadonly(),
      error: error.asReadonly(),
      status: status.asReadonly(),
      isPending: computed(() => inFlight() > 0),
      inFlight: inFlight.asReadonly(),
      reset: () => {
        latest++;
        data.set(undefined);
        error.set(undefined);
        status.set('idle');
      },
    },
  };
}
