import type { FunctionReference, FunctionReference_future } from 'convex/server';
import type { Signal } from '@angular/core';
import { injectQuery } from '../query/inject-query';
import { injectPaginatedQuery } from '../query/inject-paginated-query';
import { injectMutation } from '../mutation/inject-mutation';
import { injectAction } from '../action/inject-action';
import type { ArgsOf, ReturnOf } from './types';

// Type-level contract of the public API, for both reference forms the
// generated `api` may produce. Checked by `npm run typecheck:lib` (tsc); the
// bodies below never run.
interface Todo {
  _id: string;
  text: string;
}
type Page = { page: Todo[]; isDone: boolean; continueCursor: string };

declare const list: FunctionReference<'query', 'public', { done?: boolean }, Todo[]>;
declare const get: FunctionReference_future<'query', 'public', { id: string }, Todo | null>;
declare const noArgs: FunctionReference<'query', 'public', Record<string, never>, number>;
declare const paged: FunctionReference<'query', 'public', { paginationOpts: { numItems: number; cursor: string | null }; tag: string }, Page>;
declare const pagedFuture: FunctionReference_future<'query', 'public', { paginationOpts: { numItems: number; cursor: string | null } }, Page>;
declare const add: FunctionReference<'mutation', 'public', { text: string }, string>;
declare const addFuture: FunctionReference_future<'mutation', 'public', { text: string }, string>;
declare const clear: FunctionReference<'mutation', 'public', Record<string, never>, null>;
declare const send: FunctionReference<'action', 'public', { to: string }, { ok: boolean }>;
declare const internalQuery: FunctionReference<'query', 'internal', Record<string, never>, number>;

function contract(): void {
  // Arguments and results are read from both reference forms.
  expectTypeOf<ArgsOf<typeof list>>().toEqualTypeOf<{ done?: boolean }>();
  expectTypeOf<ArgsOf<typeof get>>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<ReturnOf<typeof get>>().toEqualTypeOf<Todo | null>();

  // injectQuery: static, reactive or 'skip' arguments; optional when none.
  expectTypeOf(injectQuery(list, {})).toExtend<Signal<Todo[] | undefined>>();
  expectTypeOf(injectQuery(get, () => ({ id: '1' }))).toExtend<Signal<Todo | null | undefined>>();
  expectTypeOf(injectQuery(get, 'skip')).toExtend<Signal<Todo | null | undefined>>();
  expectTypeOf(injectQuery(noArgs)).toExtend<Signal<number | undefined>>();
  expectTypeOf(injectQuery(list, {}, { initialValue: [] as Todo[] }).data).toEqualTypeOf<Signal<Todo[] | undefined>>();
  // @ts-expect-error missing required argument
  injectQuery(get);
  // @ts-expect-error wrong argument type
  injectQuery(get, { id: 1 });
  // @ts-expect-error a mutation is not a query
  injectQuery(add, { text: '' });
  // @ts-expect-error internal functions are not callable from the client
  injectQuery(internalQuery);

  // injectPaginatedQuery: items from the page type, args without paginationOpts.
  expectTypeOf(injectPaginatedQuery(paged, { tag: 'a' }, { initialNumItems: 5 }).results).toEqualTypeOf<Signal<Todo[]>>();
  expectTypeOf(injectPaginatedQuery(pagedFuture, {}, { initialNumItems: 5 }).results).toEqualTypeOf<Signal<Todo[]>>();
  // @ts-expect-error tag is required
  injectPaginatedQuery(paged, {}, { initialNumItems: 5 });

  // injectMutation / injectAction: callable, typed arguments and result.
  const addTodo = injectMutation(add);
  expectTypeOf(addTodo({ text: 'a' })).toEqualTypeOf<Promise<string>>();
  expectTypeOf(addTodo.data).toEqualTypeOf<Signal<string | undefined>>();
  expectTypeOf(injectMutation(addFuture)({ text: 'a' })).toEqualTypeOf<Promise<string>>();
  expectTypeOf(injectMutation(clear)()).toEqualTypeOf<Promise<null>>();
  injectMutation(add).withOptimisticUpdate((_store, args) => expectTypeOf(args).toEqualTypeOf<{ text: string }>());
  // @ts-expect-error wrong argument type
  void addTodo({ text: 1 });
  // @ts-expect-error a query is not a mutation
  injectMutation(list);
  expectTypeOf(injectAction(send)({ to: 'x' })).toEqualTypeOf<Promise<{ ok: boolean }>>();
  // @ts-expect-error missing required argument
  void injectAction(send)();
}

describe('public types', () => {
  it('are checked by the type checker (npm run typecheck:lib)', () => {
    expect(contract).toBeTypeOf('function');
  });
});
