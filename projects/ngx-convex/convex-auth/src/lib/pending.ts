import { signal, type Signal } from '@angular/core';

/** Counts in-flight calls; `pending` is `true` while at least one runs. */
export function createPending(): { pending: Signal<boolean>; track: <T>(work: () => Promise<T>) => Promise<T> } {
  const pending = signal(false);
  let inFlight = 0;
  const track = async <T>(work: () => Promise<T>): Promise<T> => {
    inFlight++;
    pending.set(true);
    try {
      return await work();
    } finally {
      if (--inFlight === 0) pending.set(false);
    }
  };
  return { pending: pending.asReadonly(), track };
}

/** Keeps the `userError` of the latest result (`null` after a success). */
export function createUserError<E>(): {
  userError: Signal<E | null>;
  record: <R>(result: R) => R;
} {
  const userError = signal<E | null>(null);
  const record = <R>(result: R): R => {
    const error = (result as { userError?: E } | null)?.userError;
    userError.set(error ?? null);
    return result;
  };
  return { userError: userError.asReadonly(), record };
}
