import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { injectQuery } from './inject-query';
import { childInjector, flush, setup } from '../../test/helpers';
import { getTodo, listTodos } from '../../test/refs';

describe('injectQuery', () => {
  it('starts pending then exposes live results', () => {
    const { convex, injector } = setup();
    const todos = injectQuery(listTodos, {}, { injector });
    expect(todos.status()).toBe('pending');
    expect(todos.isLoading()).toBe(true);
    expect(todos()).toBeUndefined();

    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'a' }]);
    expect(todos()).toEqual([{ _id: '1', text: 'a' }]);
    expect(todos.data()).toEqual(todos());
    expect(todos.isSuccess()).toBe(true);

    convex.setQuery(listTodos, {}, []);
    expect(todos()).toEqual([]);
  });

  it('reads a cached value synchronously', () => {
    const { convex, injector } = setup();
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'a' }]);
    const todos = injectQuery(listTodos, {}, { injector });
    expect(todos.status()).toBe('success');
    expect(todos()?.length).toBe(1);
  });

  it('throws the error on read with throwOnError, and recovers', () => {
    const { convex, injector } = setup();
    const todos = injectQuery(listTodos, {}, { injector, throwOnError: true });
    convex.setQueryError(listTodos, {}, new Error('boom'));
    expect(() => todos()).toThrow('boom');
    expect(todos.error()?.message).toBe('boom');
    convex.setQuery(listTodos, {}, []);
    expect(todos()).toEqual([]);
  });

  it('exposes errors and keeps the last data', () => {
    const { convex, injector } = setup();
    const todos = injectQuery(listTodos, {}, { injector });
    convex.setQuery(listTodos, {}, [{ _id: '1', text: 'a' }]);
    convex.setQueryError(listTodos, {}, new Error('boom'));
    expect(todos.isError()).toBe(true);
    expect(todos.error()?.message).toBe('boom');
    expect(todos()?.length).toBe(1);
  });

  it('supports skip and reactive args', async () => {
    const { convex, injector } = setup();
    const id = signal<string | null>(null);
    const todo = TestBed.runInInjectionContext(() =>
      injectQuery(getTodo, () => (id() ? { id: id()! } : 'skip')),
    );
    await flush();
    expect(todo.isSkipped()).toBe(true);
    expect(convex.subscriptionCount).toBe(0);

    id.set('1');
    await flush();
    expect(todo.isLoading()).toBe(true);
    convex.setQuery(getTodo, { id: '1' }, { _id: '1', text: 'one' });
    expect(todo()?.text).toBe('one');

    id.set('2');
    await flush();
    expect(todo()).toBeUndefined();
    expect(convex.subscriptionCount).toBe(1);
    void injector;
  });

  it('keepPreviousData keeps showing the old value while loading', async () => {
    const { convex } = setup();
    const id = signal('1');
    convex.setQuery(getTodo, { id: '1' }, { _id: '1', text: 'one' });
    const todo = TestBed.runInInjectionContext(() =>
      injectQuery(getTodo, () => ({ id: id() }), { keepPreviousData: true }),
    );
    await flush();
    expect(todo()?.text).toBe('one');
    id.set('2');
    await flush();
    expect(todo.isLoading()).toBe(true);
    expect(todo()?.text).toBe('one');
  });

  it('does not resubscribe when args are equal by value', async () => {
    const { convex } = setup();
    const done = signal(false);
    const other = signal(0);
    TestBed.runInInjectionContext(() => injectQuery(listTodos, () => (other(), { done: done() })));
    await flush();
    const spy = vi.spyOn(convex, 'onUpdate');
    other.set(1);
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('unsubscribes when its injector is destroyed', () => {
    const { convex } = setup();
    const child = childInjector();
    injectQuery(listTodos, {}, { injector: child, initialValue: [] });
    expect(convex.subscriptionCount).toBe(1);
    child.destroy();
    expect(convex.subscriptionCount).toBe(0);
  });

  it('uses initialValue while loading', () => {
    const { injector } = setup();
    const todos = injectQuery(listTodos, {}, { injector, initialValue: [] });
    expect(todos()).toEqual([]);
    expect(todos.isLoading()).toBe(true);
  });
});
