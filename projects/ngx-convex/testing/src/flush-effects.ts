import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/** `TestBed.tick` since Angular 20, `TestBed.flushEffects` before. */
interface EffectFlusher {
  tick?: () => void;
  flushEffects?: () => void;
}

/**
 * Runs pending effects and change detection, then lets pending promises and
 * timers settle, `rounds` times (Angular 17 → latest). A flow that chains
 * several awaits between effects needs more than one round.
 */
export async function flushEffects(rounds = 1): Promise<void> {
  const testBed: EffectFlusher = TestBed;
  for (let round = 0; round < rounds; round++) {
    if (testBed.tick) testBed.tick();
    else testBed.flushEffects?.();
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
