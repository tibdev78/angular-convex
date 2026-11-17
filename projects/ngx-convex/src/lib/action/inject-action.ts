import { CONVEX_CLIENT } from '../core/config';
import type { ActionReference, ArgsOf, OptionalArgs, ReturnOf } from '../core/types';
import { createCall, type CallOptions, type CallState } from '../mutation/inject-mutation';
import { resolveInjector } from '../util/compat';

/** A callable action: `await sendEmail({ to })`. */
export interface ConvexAction<Ref extends ActionReference> extends CallState<ReturnOf<Ref>> {
  (...args: OptionalArgs<Ref>): Promise<ReturnOf<Ref>>;
  run(...args: OptionalArgs<Ref>): Promise<ReturnOf<Ref>>;
}

/** Calls a Convex action (side effects, third-party APIs). Not optimistic, not retried. */
export function injectAction<Ref extends ActionReference>(
  action: Ref,
  options: CallOptions<ArgsOf<Ref>, ReturnOf<Ref>> = {},
): ConvexAction<Ref> {
  const injector = resolveInjector(options.injector);
  const client = injector.get(CONVEX_CLIENT);
  const call = createCall<ArgsOf<Ref>, ReturnOf<Ref>>(options, (args) =>
    client.action(action, args),
  );
  return Object.assign(call.invoke, { ...call.state, run: call.invoke }) as unknown as ConvexAction<Ref>;
}
