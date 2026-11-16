import { TestBed } from '@angular/core/testing';
import { injectPrewarmQuery, prewarmQuery } from './prewarm';
import { injectQuery } from './inject-query';
import { setup } from '../../test/helpers';
import { listTodos } from '../../test/refs';

describe('prewarmQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('subscribes for a while, then lets go', () => {
    vi.useFakeTimers();
    const { convex } = setup();
    TestBed.runInInjectionContext(() => prewarmQuery(listTodos, {}, { extendSubscriptionFor: 1000 }));
    expect(convex.subscriptionCount).toBe(1);
    vi.advanceTimersByTime(999);
    expect(convex.subscriptionCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(convex.subscriptionCount).toBe(0);
  });

  it('injectPrewarmQuery works outside the injection context, and a later injectQuery reads the warm value', () => {
    vi.useFakeTimers();
    const { convex, injector } = setup();
    const prewarm = TestBed.runInInjectionContext(() => injectPrewarmQuery());
    prewarm(listTodos, {});
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'warm' }]);
    const todos = injectQuery(listTodos, {}, { injector });
    expect(todos()).toEqual([{ _id: '1', text: 'warm' }]);
    vi.advanceTimersByTime(5000);
    expect(convex.subscriptionCount).toBe(1); // only injectQuery's own subscription is left
  });
});
