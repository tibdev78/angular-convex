import type { Injector } from '@angular/core';
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReference_future,
  FunctionReturnType,
  FunctionType,
} from 'convex/server';

/** `"query" | "mutation" | "action"`. */
export type ConvexFunctionType = FunctionType;

/**
 * Any public Convex function reference of the given type, as produced by the
 * generated `api` object of the consuming application: `FunctionReference`
 * or `FunctionReference_future`, both accepted by `convex` since 1.48.
 */
export type ConvexFunctionReference<Type extends ConvexFunctionType> =
  | FunctionReference<Type>
  | FunctionReference_future<Type>;

export type QueryReference = ConvexFunctionReference<'query'>;
export type MutationReference = ConvexFunctionReference<'mutation'>;
export type ActionReference = ConvexFunctionReference<'action'>;

/** Arguments of a function reference (`FunctionArgs` from `convex/server`). */
export type ArgsOf<Ref extends ConvexFunctionReference<ConvexFunctionType>> = FunctionArgs<Ref>;

/** Client-facing return type of a function reference (`FunctionReturnType`). */
export type ReturnOf<Ref extends ConvexFunctionReference<ConvexFunctionType>> = FunctionReturnType<Ref>;

/**
 * `[args?]` when the function takes no arguments, `[args]` otherwise: the
 * rule of Convex's own `OptionalRestArgs`.
 */
export type OptionalArgs<Ref extends ConvexFunctionReference<ConvexFunctionType>> =
  ArgsOf<Ref> extends EmptyArgs ? [args?: ArgsOf<Ref>] : [args: ArgsOf<Ref>];

/** What Convex calls `EmptyObject`: the arguments of a function that takes none. */
export type EmptyArgs = Record<string, never>;

/**
 * Pass `'skip'` (or {@link skipToken}) instead of arguments to disable a
 * subscription, e.g. while a required input is not available yet.
 */
export const skipToken = 'skip' as const;
export type SkipToken = typeof skipToken;

/** Static arguments, or a reactive function re-evaluated when its signals change. */
export type ArgsInput<Ref extends ConvexFunctionReference<ConvexFunctionType>> =
  | ArgsOf<Ref>
  | SkipToken
  | (() => ArgsOf<Ref> | SkipToken);

/** Common option: run outside an injection context by passing an injector. */
export interface WithInjector {
  injector?: Injector;
}
