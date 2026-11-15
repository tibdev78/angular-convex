import {
  computed,
  DestroyRef,
  effect,
  untracked,
  type Injector,
} from '@angular/core';

/** A value that is either fixed or recomputed from signals. */
export interface Source<T> {
  read: () => T;
  /** `false` for static values: they connect synchronously, once. */
  reactive: boolean;
}

/**
 * Runs `connect(value)` for the current value of `source` and again whenever
 * it changes (compared with `equal`). The teardown returned by `connect` runs
 * before the next connection and when the injector is destroyed.
 *
 * Static sources connect immediately (synchronously); reactive sources connect
 * from an effect so that component inputs can be read safely.
 */
export function connectReactive<T>(
  injector: Injector,
  source: Source<T>,
  equal: (a: T, b: T) => boolean,
  connect: (value: T) => () => void,
): void {
  const destroyRef = injector.get(DestroyRef);
  if (!source.reactive) {
    const teardown = untracked(() => connect(source.read()));
    destroyRef.onDestroy(teardown);
    return;
  }
  const value = computed(source.read, { equal });
  let teardown: (() => void) | undefined;
  const ref = effect(
    () => {
      const current = value();
      untracked(() => {
        teardown?.();
        teardown = connect(current);
      });
    },
    { injector },
  );
  destroyRef.onDestroy(() => {
    ref.destroy();
    teardown?.();
    teardown = undefined;
  });
}
