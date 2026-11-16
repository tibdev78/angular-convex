import type { Injector } from '@angular/core';

/** `"query" | "mutation" | "action"`. */
export type ConvexFunctionType = 'query' | 'mutation' | 'action';

/**
 * Any public Convex function reference of the given type, as produced by the
 * generated `api` object of the consuming application.
 *
 * Structural on purpose: it accepts both `FunctionReference` and
 * `FunctionReference_future` and keeps the library independent of the exact
 * `convex` minor version.
 */
export interface ConvexFunctionReference<Type extends ConvexFunctionType> {
  _type: Type;
  _visibility: 'public';
}

export type QueryReference = ConvexFunctionReference<'query'>;
export type MutationReference = ConvexFunctionReference<'mutation'>;
export type ActionReference = ConvexFunctionReference<'action'>;

/** Arguments of a function reference. */
export type ArgsOf<Ref> = Ref extends { _args: infer Args }
  ? Args
  : Ref extends { _fn?: ((args: infer Args, ...rest: never[]) => unknown) | undefined }
    ? Args
    : Record<string, unknown>;

/** Client-facing return type of a function reference. */
export type ReturnOf<Ref> = Ref extends { _returnType: infer Return }
  ? Return
  : Ref extends { _fn?: ((...args: never[]) => infer Return) | undefined }
    ? Return
    : unknown;

type IsEmpty<T> = keyof T extends never ? true : false;

/** `[args?]` when the function takes no arguments, `[args]` otherwise. */
export type OptionalArgs<Ref> =
  IsEmpty<ArgsOf<Ref>> extends true ? [args?: ArgsOf<Ref>] : [args: ArgsOf<Ref>];

/**
 * Pass `'skip'` (or {@link skipToken}) instead of arguments to disable a
 * subscription, e.g. while a required input is not available yet.
 */
export const skipToken = 'skip' as const;
export type SkipToken = typeof skipToken;

/** Static arguments, or a reactive function re-evaluated when its signals change. */
export type ArgsInput<Ref> =
  | ArgsOf<Ref>
  | SkipToken
  | (() => ArgsOf<Ref> | SkipToken);

/** Common option: run outside an injection context by passing an injector. */
export interface WithInjector {
  injector?: Injector;
}
