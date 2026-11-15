import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { convexQueryOptions, injectQueryFromOptions, prewarmQueryFromOptions } from './query-options';
import { injectQuery } from './inject-query';
import { flush, setup } from '../../test/helpers';
import { listTodos } from '../../test/refs';

describe('convexQueryOptions', () => {
  afterEach(() => vi.useRealTimers());

  it('is an identity function', () => {
    const options = { query: listTodos, args: {} };
    expect(convexQueryOptions(options)).toBe(options);
  });

  it('injectQueryFromOptions reads the query, its args and the query options from one object', async () => {
    const { convex, injector } = setup();
    const enabled = signal(false);
    const todos = injectQueryFromOptions({
      query: listTodos,
      args: () => (enabled() ? {} : 'skip'),
      initialValue: [],
      injector,
    });
    await flush();
    expect(todos.status()).toBe('skipped');
    expect(todos()).toEqual([]);
    enabled.set(true);
    await flush();
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'from options' }]);
    expect(todos.status()).toBe('success');
    expect(todos()).toEqual([{ _id: '1', text: 'from options' }]);
  });

  it('throwOnError works through the options object', () => {
    const { convex, injector } = setup();
    const todos = injectQueryFromOptions({ ...convexQueryOptions({ query: listTodos, args: {} }), throwOnError: true, injector });
    convex.setQueryError(listTodos, {}, new Error('boom'));
    expect(() => todos()).toThrow('boom');
  });

  it('prewarmQueryFromOptions warms the same subscription a page reads later', () => {
    vi.useFakeTimers();
    const { convex, injector } = setup();
    const options = convexQueryOptions({ query: listTodos, args: {} });
    TestBed.runInInjectionContext(() => prewarmQueryFromOptions(options, { extendSubscriptionFor: 1000 }));
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'warm' }]);
    expect(injectQuery(options.query, options.args, { injector })()).toEqual([{ _id: '1', text: 'warm' }]);
    vi.advanceTimersByTime(1000);
    expect(convex.subscriptionCount).toBe(1);
  });
});
