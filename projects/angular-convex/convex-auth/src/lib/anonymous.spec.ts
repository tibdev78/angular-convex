import { fakeMutation, FakeConvexClient } from 'angular-convex/testing';
import { authSetup, complete, flush, run } from '../test/auth-test-helpers';
import { injectAuthToken } from './provide-convex-auth-client';
import { injectSignInAnonymously } from './anonymous';

const api = { signInAnonymously: fakeMutation('auth:signInAnonymously') };

describe('injectSignInAnonymously', () => {
  it('calls the mutation without arguments and adopts the session', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.signInAnonymously, () => complete(7));
    authSetup({ convex });
    const flow = run(() => injectSignInAnonymously(api));
    const token = run(() => injectAuthToken());
    await flush();

    const done = flow.signIn();
    expect(flow.pending()).toBe(true);
    await done;
    expect(flow.pending()).toBe(false);
    expect(token()).toBe('jwt-7');
    expect(convex.calls.at(-1)).toMatchObject({ args: {} });
  });

  it('rejects when the method answers with an error, and stays signed out', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(api.signInAnonymously, () => ({ status: 'error', userError: { error: 'DISABLED' } }));
    authSetup({ convex });
    const flow = run(() => injectSignInAnonymously(api));
    const token = run(() => injectAuthToken());
    await flush();

    await expect(flow.signIn()).rejects.toThrow('did not complete');
    expect(token()).toBeNull();
  });
});
