import { signal } from '@angular/core';
import { InMemoryStorage } from '@convex-dev/auth/browser';
import { fakeMutation, fakeQuery, FakeConvexClient } from 'ngx-convex/testing';
import { authSetup, complete, flush, run } from '../test/auth-test-helpers';
import { injectAuthClient, injectAuthToken } from './provide-convex-auth-client';
import { authClientStorage } from './types';
import { injectSignInWithUsernamePassword, injectSignUpWithUsernamePassword } from './username-password';
import {
  EMAIL_PASSWORD_SECRET_STORAGE_KEYS,
  injectCompleteChangeEmail,
  injectCompletePasswordRecovery,
  injectCompleteSignUpWithEmailPassword,
  injectSignInWithEmailPassword,
  injectSignUpWithEmailPassword,
  injectStartPasswordRecovery,
} from './email-password';

const api = {
  signInWithUsernamePassword: fakeMutation('auth:signInWithUsernamePassword'),
  signUpWithUsernamePassword: fakeMutation('auth:signUpWithUsernamePassword'),
  signInWithEmailPassword: fakeMutation('auth:signInWithEmailPassword'),
  signUpWithEmailPassword: fakeMutation('auth:signUpWithEmailPassword'),
  completeSignUpWithEmailPassword: fakeMutation('auth:completeSignUpWithEmailPassword'),
  startPasswordRecovery: fakeMutation('auth:startPasswordRecovery'),
  checkPasswordRecovery: fakeQuery('auth:checkPasswordRecovery'),
  completePasswordRecovery: fakeMutation('auth:completePasswordRecovery'),
  completeChangeEmail: fakeMutation('auth:completeChangeEmail'),
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('username-password', () => {
  it('signs in, tracks pending and adopts the session', async () => {
    const convex = new FakeConvexClient();
    const answer = deferred<unknown>();
    convex.onMutation(api.signInWithUsernamePassword, () => answer.promise);
    authSetup({ convex });
    const flow = run(() => injectSignInWithUsernamePassword(api));
    const token = run(() => injectAuthToken());
    await flush();

    const result = flow.signIn({ username: 'ada', password: 'pw' });
    expect(flow.pending()).toBe(true);
    answer.resolve(complete(1));
    await expect(result).resolves.toMatchObject({ status: 'complete' });
    expect(flow.pending()).toBe(false);
    expect(flow.userError()).toBeNull();
    expect(token()).toBe('jwt-1');
    expect(convex.calls.at(-1)).toMatchObject({ args: { username: 'ada', password: 'pw' } });
  });

  it('keeps the user error of a refused sign-up', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.signUpWithUsernamePassword, () => ({ status: 'error', userError: { error: 'USERNAME_TAKEN' } }));
    authSetup({ convex });
    const flow = run(() => injectSignUpWithUsernamePassword(api));
    await flow.signUp({ username: 'ada', password: 'pw' });
    expect(flow.userError()).toEqual({ error: 'USERNAME_TAKEN' });
  });

  it('folds a thrown error into OTHER_ERROR', async () => {
    authSetup();
    const flow = run(() => injectSignInWithUsernamePassword(api));
    const result = await flow.signIn({ username: 'ada', password: 'pw' });
    expect(result).toMatchObject({ status: 'error', userError: { error: 'OTHER_ERROR' } });
    expect(flow.pending()).toBe(false);
  });
});

describe('email-password', () => {
  it('signs in with an e-mail', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.signInWithEmailPassword, () => complete(2));
    authSetup({ convex });
    const flow = run(() => injectSignInWithEmailPassword(api));
    const token = run(() => injectAuthToken());
    await flow.signIn({ email: 'a@b.c', password: 'pw' });
    expect(token()).toBe('jwt-2');
  });

  it('sign-up keeps the browser secret and hides it from the result', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.signUpWithEmailPassword, () => ({ success: true, browserSecret: 's3cret', email: 'a@b.c' }));
    authSetup({ convex });
    const flow = run(() => injectSignUpWithEmailPassword(api));
    const client = run(() => injectAuthClient());
    const result = await flow.signUp({ email: 'a@b.c', password: 'pw' });
    expect(result).toEqual({ success: true, email: 'a@b.c' });
    expect(await authClientStorage(client).get(EMAIL_PASSWORD_SECRET_STORAGE_KEYS.signUp)).toBe('s3cret');
  });

  it('completes the sign-up from the link once, with the stored secret', async () => {
    const storage = new InMemoryStorage();
    const convex = new FakeConvexClient();
    const calls: unknown[] = [];
    convex.onMutation(api.signUpWithEmailPassword, () => ({ success: true, browserSecret: 's1' }));
    convex.onMutation(api.completeSignUpWithEmailPassword, (args) => {
      calls.push(args);
      return complete(3);
    });
    authSetup({ storage, convex });
    await run(() => injectSignUpWithEmailPassword(api)).signUp({ email: 'a@b.c', password: 'pw' });
    const code = signal('code-1');
    const state = run(() => injectCompleteSignUpWithEmailPassword(api, { emailCode: code }));
    const token = run(() => injectAuthToken());
    const client = run(() => injectAuthClient());
    expect(state()).toEqual({ status: 'loading' });
    await flush();

    expect(state()).toEqual({ status: 'complete' });
    expect(calls).toEqual([{ emailCode: 'code-1', browserSecret: 's1' }]);
    expect(token()).toBe('jwt-3');
    expect(await authClientStorage(client).get(EMAIL_PASSWORD_SECRET_STORAGE_KEYS.signUp)).toBeFalsy();
    code.set('code-2');
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('reports MISSING_SECRET when the link is opened in another browser', async () => {
    authSetup();
    const state = run(() => injectCompleteChangeEmail(api, { emailCode: 'c' }));
    await flush();
    expect(state()).toEqual({ status: 'error', userError: { error: 'MISSING_SECRET' } });
  });

  it('password recovery: checks the link, then sets the new password and signs in', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.startPasswordRecovery, () => ({ success: true, browserSecret: 'rs' }));
    const completed: unknown[] = [];
    convex.onMutation(api.completePasswordRecovery, (args) => {
      completed.push(args);
      return complete(6);
    });
    authSetup({ convex });
    await run(() => injectStartPasswordRecovery(api)).startPasswordRecovery({ email: 'a@b.c' });
    const state = run(() => injectCompletePasswordRecovery(api, { emailCode: 'rc' }));
    const token = run(() => injectAuthToken());
    await flush();
    expect(state()).toEqual({ status: 'loading' });

    convex.setQuery(api.checkPasswordRecovery, { emailCode: 'rc', browserSecret: 'rs' }, { success: true });
    await flush();
    const ready = state();
    if (ready.status !== 'ready') throw new Error(`expected ready, got ${ready.status}`);
    await ready.completePasswordRecovery({ newPassword: 'new-pw' });
    await flush();

    expect(completed).toEqual([{ emailCode: 'rc', browserSecret: 'rs', newPassword: 'new-pw' }]);
    expect(token()).toBe('jwt-6');
    expect(state()).toEqual({ status: 'complete' });
  });

  it('password recovery: a dead link is an error state', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.startPasswordRecovery, () => ({ success: true, browserSecret: 'rs' }));
    authSetup({ convex });
    await run(() => injectStartPasswordRecovery(api)).startPasswordRecovery({ email: 'a@b.c' });
    const state = run(() => injectCompletePasswordRecovery(api, { emailCode: 'rc' }));
    await flush();
    convex.setQuery(api.checkPasswordRecovery, { emailCode: 'rc', browserSecret: 'rs' }, {
      success: false,
      userError: { error: 'INVALID_CHALLENGE' },
    });
    await flush();
    expect(state()).toEqual({ status: 'error', userError: { error: 'INVALID_CHALLENGE' } });
  });
});
