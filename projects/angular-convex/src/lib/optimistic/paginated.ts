/*
 * Ported from convex/react `use_paginated_query.ts` (Apache-2.0, © Convex, Inc.)
 * because `convex/react` cannot be imported without React.
 */
import type { OptimisticLocalStore } from 'convex/browser';
import { compareValues, convexToJson, type Value } from 'convex/values';
import type { QueryReference } from '../core/types';
import type { PaginatedArgs, PaginatedItem } from '../query/inject-paginated-query';

interface PageValue<Item> {
  page: Item[];
  isDone: boolean;
  continueCursor: string;
}

interface PageQuery<Item> {
  args: Record<string, Value> & { paginationOpts: { cursor: string | null; id?: number } };
  value: PageValue<Item> | undefined;
}

function pages<Item>(store: OptimisticLocalStore, query: QueryReference): PageQuery<Item>[] {
  return store.getAllQueries(query as never) as unknown as PageQuery<Item>[];
}

function setPage<Item>(store: OptimisticLocalStore, query: QueryReference, args: PageQuery<Item>['args'], value: PageValue<Item>): void {
  store.setQuery(query as never, args as never, value as never);
}

function matches(argsToMatch: Record<string, unknown> | undefined, args: Record<string, Value>): boolean {
  if (argsToMatch === undefined) return true;
  return Object.keys(argsToMatch).every((k) => compareValues(argsToMatch[k] as Value, args[k]) === 0);
}

/** Applies `updateValue` to every loaded item of a paginated query with these args. */
export function optimisticallyUpdateValueInPaginatedQuery<Query extends QueryReference>(
  localStore: OptimisticLocalStore,
  query: Query,
  args: PaginatedArgs<Query>,
  updateValue: (current: PaginatedItem<Query>) => PaginatedItem<Query>,
): void {
  const expected = JSON.stringify(convexToJson(args as Value));
  for (const result of pages<PaginatedItem<Query>>(localStore, query)) {
    if (result.value === undefined) continue;
    const { paginationOpts: _ignored, ...inner } = result.args;
    if (JSON.stringify(convexToJson(inner as Value)) !== expected) continue;
    if (Array.isArray(result.value.page)) {
      setPage(localStore, query, result.args, { ...result.value, page: result.value.page.map(updateValue) });
    }
  }
}

export interface InsertOptions<Query extends QueryReference> {
  paginatedQuery: Query;
  /** Only update queries whose args match these (all by default). */
  argsToMatch?: Partial<PaginatedArgs<Query>>;
  localQueryStore: OptimisticLocalStore;
  item: PaginatedItem<Query>;
}

/** Inserts `item` at the top of the first page (for lists sorted newest first). */
export function insertAtTop<Query extends QueryReference>(options: InsertOptions<Query>): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options;
  const first = pages<PaginatedItem<Query>>(localQueryStore, paginatedQuery)
    .filter((q) => matches(argsToMatch, q.args))
    .find((q) => q.args.paginationOpts.cursor === null);
  if (!first?.value) return;
  setPage(localQueryStore, paginatedQuery, first.args, { ...first.value, page: [item, ...first.value.page] });
}

/** Appends `item` to the last page, only once that page is fully loaded. */
export function insertAtBottomIfLoaded<Query extends QueryReference>(options: InsertOptions<Query>): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options;
  const last = pages<PaginatedItem<Query>>(localQueryStore, paginatedQuery)
    .filter((q) => matches(argsToMatch, q.args))
    .find((q) => q.value !== undefined && q.value.isDone);
  if (!last?.value) return;
  setPage(localQueryStore, paginatedQuery, last.args, { ...last.value, page: [...last.value.page, item] });
}

export interface InsertAtPositionOptions<Query extends QueryReference> extends InsertOptions<Query> {
  sortOrder: 'asc' | 'desc';
  sortKeyFromItem: (item: PaginatedItem<Query>) => Value | Value[];
}

/** Inserts `item` at its sorted position among the loaded pages. */
export function insertAtPosition<Query extends QueryReference>(options: InsertAtPositionOptions<Query>): void {
  const { paginatedQuery, argsToMatch, localQueryStore } = options;
  const groups = new Map<string, PageQuery<PaginatedItem<Query>>[]>();
  for (const query of pages<PaginatedItem<Query>>(localQueryStore, paginatedQuery)) {
    if (argsToMatch !== undefined && !Object.keys(argsToMatch).every((k) => (argsToMatch as Record<string, unknown>)[k] === query.args[k])) continue;
    const key = JSON.stringify(
      Object.fromEntries(Object.entries(query.args).map(([k, v]) => [k, k === 'paginationOpts' ? (v as { id?: number }).id : v])),
    );
    groups.set(key, [...(groups.get(key) ?? []), query]);
  }
  for (const pageQueries of groups.values()) insertInPages(options, pageQueries);
}

function insertInPages<Query extends QueryReference>(
  options: InsertAtPositionOptions<Query>,
  pageQueries: PageQuery<PaginatedItem<Query>>[],
): void {
  const { sortOrder, sortKeyFromItem, localQueryStore, item, paginatedQuery } = options;
  const cmp = (a: Value | Value[], b: Value | Value[]) =>
    sortOrder === 'asc' ? compareValues(a as Value, b as Value) : compareValues(b as Value, a as Value);
  const key = sortKeyFromItem(item);
  const sorted = pageQueries
    .filter((q): q is PageQuery<PaginatedItem<Query>> & { value: PageValue<PaginatedItem<Query>> } => q.value !== undefined && q.value.page.length > 0)
    .sort((a, b) => cmp(sortKeyFromItem(a.value.page[0]), sortKeyFromItem(b.value.page[0])));
  const first = sorted[0];
  if (!first) return;
  if (cmp(key, sortKeyFromItem(first.value.page[0])) <= 0) {
    if (first.args.paginationOpts.cursor === null) {
      setPage(localQueryStore, paginatedQuery, first.args, { ...first.value, page: [item, ...first.value.page] });
    }
    return;
  }
  const last = sorted[sorted.length - 1];
  if (cmp(key, sortKeyFromItem(last.value.page[last.value.page.length - 1])) >= 0) {
    if (last.value.isDone) {
      setPage(localQueryStore, paginatedQuery, last.args, { ...last.value, page: [...last.value.page, item] });
    }
    return;
  }
  const successor = sorted.findIndex((p) => cmp(sortKeyFromItem(p.value.page[0]), key) > 0);
  const target = successor === -1 ? last : sorted[successor - 1];
  if (!target) return;
  const index = target.value.page.findIndex((e) => cmp(sortKeyFromItem(e), key) >= 0);
  const page = index === -1
    ? [...target.value.page, item]
    : [...target.value.page.slice(0, index), item, ...target.value.page.slice(index)];
  setPage(localQueryStore, paginatedQuery, target.args, { ...target.value, page });
}
