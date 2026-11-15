import { injectMutation } from './inject-mutation';
import { injectAction } from '../action/inject-action';
import { setup } from '../../test/helpers';
import { addTodo, listTodos, sendEmail } from '../../test/refs';

describe('injectMutation', () => {
  it('calls the mutation and tracks its state', async () => {
    const { convex, injector } = setup();
    let release!: () => void;
    convex.onMutation(addTodo, ({ text }) => new Promise((r) => (release = () => r(`id-${text}`))));
    const add = injectMutation(addTodo, { injector });
    expect(add.status()).toBe('idle');

    const promise = add({ text: 'x' });
    expect(add.isPending()).toBe(true);
    expect(add.status()).toBe('pending');
    await Promise.resolve();
    release();
    await expect(promise).resolves.toBe('id-x');
    expect(add.data()).toBe('id-x');
    expect(add.status()).toBe('success');
    expect(add.isPending()).toBe(false);
    expect(convex.calls).toEqual([{ type: 'mutation', name: 'todos:add', args: { text: 'x' } }]);
  });

  it('rejects, exposes the error, and calls callbacks', async () => {
    const { convex, injector } = setup();
    convex.onMutation(addTodo, () => {
      throw new Error('nope');
    });
    const onError = vi.fn();
    const add = injectMutation(addTodo, { injector, onError });
    await expect(add.mutate({ text: 'x' })).rejects.toThrow('nope');
    expect(add.status()).toBe('error');
    expect(add.error()?.message).toBe('nope');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { text: 'x' });
    add.reset();
    expect(add.status()).toBe('idle');
    expect(add.error()).toBeUndefined();
  });

  it('forwards the optimistic update to the client', async () => {
    const { convex, injector } = setup();
    convex.onMutation(addTodo, () => 'id');
    const spy = vi.spyOn(convex, 'mutation');
    const update = vi.fn();
    const add = injectMutation(addTodo, { injector }).withOptimisticUpdate(update);
    await add({ text: 'x' });
    expect(spy).toHaveBeenCalledWith(addTodo, { text: 'x' }, { optimisticUpdate: update });
    void listTodos;
  });

  it('only the latest call updates data', async () => {
    const { convex, injector } = setup();
    const resolvers: ((v: string) => void)[] = [];
    convex.onMutation(addTodo, () => new Promise<string>((r) => resolvers.push(r)));
    const add = injectMutation(addTodo, { injector });
    const a = add({ text: 'a' });
    const b = add({ text: 'b' });
    await Promise.resolve();
    resolvers[1]('b');
    await b;
    resolvers[0]('a');
    await a;
    expect(add.data()).toBe('b');
  });
});

describe('injectAction', () => {
  it('runs the action', async () => {
    const { convex, injector } = setup();
    convex.onAction(sendEmail, ({ to }) => ({ ok: to === 'a@b.c' }));
    const onSuccess = vi.fn();
    const send = injectAction(sendEmail, { injector, onSuccess });
    await expect(send.run({ to: 'a@b.c' })).resolves.toEqual({ ok: true });
    expect(send.data()).toEqual({ ok: true });
    expect(onSuccess).toHaveBeenCalledWith({ ok: true }, { to: 'a@b.c' });
    expect(convex.calls[0].type).toBe('action');
  });
});
