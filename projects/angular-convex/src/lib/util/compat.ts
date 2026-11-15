/**
 * Version bridges. The library supports Angular 17 → latest, so APIs that were
 * renamed across majors are looked up at runtime instead of being imported by
 * name (a missing named import would break older or newer builds).
 */
import * as ng from '@angular/core';
import { inject, Injector, type Type } from '@angular/core';

interface PendingTasksLike {
  add(): unknown;
  remove?(task: unknown): void;
}

const core = ng as unknown as Record<string, unknown>;

/** `PendingTasks` (19+), `ExperimentalPendingTasks` (18), `ɵPendingTasks` (17). */
const PENDING_TASKS_TOKEN = (core['PendingTasks'] ??
  core['ExperimentalPendingTasks'] ??
  core['ɵPendingTasks']) as Type<PendingTasksLike> | undefined;

/**
 * Registers a pending task so that SSR (and `whenStable`) waits for async work.
 * Returns a function that marks the task as done. Never throws.
 */
export function addPendingTask(injector: Injector): () => void {
  if (!PENDING_TASKS_TOKEN) return () => undefined;
  let service: PendingTasksLike | null = null;
  try {
    service = injector.get(PENDING_TASKS_TOKEN, null);
  } catch {
    service = null;
  }
  if (!service) return () => undefined;
  const handle = service.add();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    // 18+: add() returns a remover function. 17: add() returns an id + remove(id).
    if (typeof handle === 'function') (handle as () => void)();
    else service?.remove?.(handle);
  };
}

/** `inject(Injector)` that also accepts an explicit injector. */
export function resolveInjector(injector?: Injector): Injector {
  return injector ?? inject(Injector);
}
