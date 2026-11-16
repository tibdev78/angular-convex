import type { OptimisticLocalStore } from 'convex/browser';
import { getFunctionName } from 'convex/server';
import { insertAtBottomIfLoaded, insertAtPosition, insertAtTop, optimisticallyUpdateValueInPaginatedQuery } from './paginated';
import { pageTodos, type Todo } from '../../test/refs';

type Entry = { args: Record<string, unknown>; value: { page: Todo[]; isDone: boolean; continueCursor: string } | undefined };

function store(entries: Entry[]) {
  const set = vi.fn((_q: unknown, args: Record<string, unknown>, value: Entry['value']) => {
    const e = entries.find((x) => x.args === args);
    if (e) e.value = value;
  });
  const s = {
    getQuery: () => undefined,
    getAllQueries: (q: unknown) => (getFunctionName(q as never) === 'todos:page' ? entries : []),
    setQuery: set,
  } as unknown as OptimisticLocalStore;
  return { s, set, entries };
}

const t = (id: string): Todo => ({ _id: id, text: id });
const p = (cursor: string | null, id = 0) => ({ paginationOpts: { numItems: 2, cursor, id } });

describe('optimistic pagination helpers', () => {
  it('insertAtTop prepends to the first page', () => {
    const { s, entries } = store([
      { args: p('c1'), value: { page: [t('c'), t('d')], isDone: true, continueCursor: 'x' } },
      { args: p(null), value: { page: [t('a'), t('b')], isDone: false, continueCursor: 'c1' } },
    ]);
    insertAtTop({ paginatedQuery: pageTodos, localQueryStore: s, item: t('new') });
    expect(entries[1].value!.page.map((x) => x._id)).toEqual(['new', 'a', 'b']);
  });

  it('insertAtBottomIfLoaded only appends to a finished list', () => {
    const { s, set, entries } = store([{ args: p(null), value: { page: [t('a')], isDone: false, continueCursor: 'c' } }]);
    insertAtBottomIfLoaded({ paginatedQuery: pageTodos, localQueryStore: s, item: t('z') });
    expect(set).not.toHaveBeenCalled();
    entries[0].value!.isDone = true;
    insertAtBottomIfLoaded({ paginatedQuery: pageTodos, localQueryStore: s, item: t('z') });
    expect(entries[0].value!.page.map((x) => x._id)).toEqual(['a', 'z']);
  });

  it('insertAtPosition keeps the sort order', () => {
    const { s, entries } = store([
      { args: p(null), value: { page: [t('a'), t('c')], isDone: false, continueCursor: 'c1' } },
      { args: p('c1'), value: { page: [t('e'), t('g')], isDone: true, continueCursor: 'x' } },
    ]);
    insertAtPosition({ paginatedQuery: pageTodos, localQueryStore: s, item: t('f'), sortOrder: 'asc', sortKeyFromItem: (x) => x._id });
    expect(entries[1].value!.page.map((x) => x._id)).toEqual(['e', 'f', 'g']);
    insertAtPosition({ paginatedQuery: pageTodos, localQueryStore: s, item: t('b'), sortOrder: 'asc', sortKeyFromItem: (x) => x._id });
    expect(entries[0].value!.page.map((x) => x._id)).toEqual(['a', 'b', 'c']);
  });

  it('optimisticallyUpdateValueInPaginatedQuery maps matching pages', () => {
    const { s, entries } = store([
      { args: { ...p(null), tag: 'x' }, value: { page: [t('a')], isDone: true, continueCursor: '' } },
      { args: { ...p(null), tag: 'y' }, value: { page: [t('b')], isDone: true, continueCursor: '' } },
    ]);
    optimisticallyUpdateValueInPaginatedQuery(s, pageTodos, { tag: 'x' }, (item) => ({ ...item, done: true }));
    expect(entries[0].value!.page[0].done).toBe(true);
    expect(entries[1].value!.page[0].done).toBeUndefined();
  });
});
