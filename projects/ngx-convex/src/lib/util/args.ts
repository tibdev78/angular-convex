import { getFunctionName } from 'convex/server';
import type { Source } from './reactive';
import { convexToJson, type Value } from 'convex/values';
import { skipToken } from '../core/types';

/** A normalized subscription target, compared by `key`. */
export interface Target {
  readonly skip: boolean;
  readonly args: Record<string, Value>;
  /** Stable identity: function name + serialized args (or `skip`). */
  readonly key: string;
}

export function functionName(ref: unknown): string {
  return getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
}

function argsKey(name: string, args: Record<string, Value>): string {
  return `${name}:${JSON.stringify(convexToJson(args))}`;
}

export function toTarget(name: string, raw: unknown): Target {
  if (raw === skipToken) {
    return { skip: true, args: {}, key: `${name}:skip` };
  }
  const args = (raw ?? {}) as Record<string, Value>;
  return { skip: false, args, key: argsKey(name, args) };
}

export function sameTarget(a: Target, b: Target): boolean {
  return a.key === b.key;
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

/** Turns static / `'skip'` / reactive arguments into a {@link Source} of targets. */
export function targetSource(name: string, args: unknown): Source<Target> {
  if (typeof args === 'function') {
    return { read: () => toTarget(name, (args as () => unknown)()), reactive: true };
  }
  return { read: () => toTarget(name, args), reactive: false };
}
