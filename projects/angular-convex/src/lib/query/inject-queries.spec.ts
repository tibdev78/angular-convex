import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { injectQueries } from './inject-queries';
import { injectPaginatedQuery } from './inject-paginated-query';
import { prewarmQuery } from './prewarm';
import { flush, setup } from '../../test/helpers';
import { getTodo, listTodos, pageTodos } from '../../test/refs';

describe('injectQueries', () => {
  it('subscribes to a dynamic set and keeps unchanged entries', async () => {
    const { convex } = setup();
    const ids = signal(['1', '2']);
    const rows = TestBed.runInInjectionContext(() =>
      injectQueries(() => Object.fromEntries(ids().map((id) => [id, { query: getTodo, args: { id } }]))),
    );
    await flush();
    expect(convex.subscriptionCount).toBe(2);
    convex.setQuery(getTodo, { id: '1' }, { _id: '1', text: 'one' });
    convex.setQueryError(getTodo, { id: '2' }, new Error('missing'));
    expect(rows()['1']).toEqual({ _id: '1', text: 'one' });
    expect(rows()['2']).toBeInstanceOf(Error);

    const spy = vi.spyOn(convex, 'onUpdate');
    ids.set(['1', '3']);
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(convex.subscriptionCount).toBe(2);
    expect(rows()['1']).toEqual({ _id: '1', text: 'one' });
    expect('2' in rows()).toBe(false);
  });

  it('skips entries with skip args', () => {
    const { convex, injector } = setup();
    injectQueries({ a: { query: listTodos, args: 'skip' } }, { injector });
    expect(convex.subscriptionCount).toBe(0);
  });
});

describe('injectPaginatedQuery', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ _id: String(i), text: `t${i}` }));

  it('loads pages and reports status', () => {
    const { convex, injector } = setup();
    const page = injectPaginatedQuery(pageTodos, {}, { initialNumItems: 2, injector });
    expect(page.status()).toBe('LoadingFirstPage');
    expect(page.isLoading()).toBe(true);
    convex.setPaginatedItems(pageTodos, {}, items);
    expect(page.results().length).toBe(2);
    expect(page.canLoadMore()).toBe(true);
    expect(page.loadMore(2)).toBe(true);
    expect(page.results().length).toBe(4);
    page.loadMore(10);
    expect(page.status()).toBe('Exhausted');
    expect(page.loadMore(1)).toBe(false);
  });

  it('restarts when args change and supports skip', async () => {
    const { convex } = setup();
    const tag = signal<string | null>(null);
    convex.setPaginatedItems(pageTodos, { tag: 'a' }, items);
    const page = TestBed.runInInjectionContext(() =>
      injectPaginatedQuery(pageTodos, () => (tag() ? { tag: tag()! } : 'skip'), { initialNumItems: 1 }),
    );
    await flush();
    expect(page.status()).toBe('Skipped');
    tag.set('a');
    await flush();
    expect(page.results().length).toBe(1);
    page.loadMore(1);
    tag.set('b');
    await flush();
    expect(page.results()).toEqual([]);
    expect(page.status()).toBe('LoadingFirstPage');
  });
});

describe('prewarmQuery', () => {
  it('subscribes for a limited time', () => {
    vi.useFakeTimers();
    const { convex } = setup();
    TestBed.runInInjectionContext(() => prewarmQuery(listTodos, {}, { extendSubscriptionFor: 1000 }));
    expect(convex.subscriptionCount).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(convex.subscriptionCount).toBe(0);
    vi.useRealTimers();
  });
});
