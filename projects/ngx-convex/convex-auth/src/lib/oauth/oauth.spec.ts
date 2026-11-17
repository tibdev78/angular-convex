import { TestBed } from '@angular/core/testing';
import { InMemoryStorage } from '@convex-dev/auth/browser';
import { fakeMutation, FakeConvexClient } from 'ngx-convex/testing';
import { authSetup, complete, flush, run } from '../../test/auth-test-helpers';
import { authClientStorage } from '../types';
import { injectAuthClient, injectAuthToken } from '../provide-convex-auth-client';
import { injectOauth, injectOauthSignIn, injectSignInWithGithub } from './inject-oauth';

const github = {
  startSignInWithGithub: fakeMutation('auth:startSignInWithGithub'),
  completeSignInWithGithub: fakeMutation('auth:completeSignInWithGithub'),
};

/** Writes the flow `signIn` would have stored before the redirect. */
async function storePendingFlow(storage: InMemoryStorage): Promise<void> {
  authSetup({ storage });
  const client = run(() => injectAuthClient());
  const view = (authClientStorage(client) as unknown as { forSignIn(id: string): { set(k: string, v: string): unknown } }).forSignIn('oauth');
  await view.set('flow', JSON.stringify({ providerName: 'github', state: 'st-1', completeSignIn: 'auth:completeSignInWithGithub' }));
  TestBed.resetTestingModule();
}

describe('oauth', () => {
  const start = window.location.href;
  afterEach(() => window.history.replaceState(null, '', start));

  it('redeems ?convexAuthCode on start and strips it from the URL', async () => {
    const storage = new InMemoryStorage();
    await storePendingFlow(storage);
    window.history.replaceState(null, '', '/callback?convexAuthCode=code-1&keep=1');
    const convex = new FakeConvexClient();
    const redeemed: unknown[] = [];
    convex.onMutation(github.completeSignInWithGithub, (args) => {
      redeemed.push(args);
      return complete(4);
    });
    const replaceUrl = vi.fn();
    authSetup({ storage, convex, replaceUrl });
    const token = run(() => injectAuthToken());
    const oauth = run(() => injectOauth());
    await flush();

    expect(replaceUrl).toHaveBeenCalledWith(expect.stringMatching(/\/callback\?keep=1$/));
    expect(redeemed).toEqual([{ code: 'code-1', state: 'st-1' }]);
    expect(token()).toBe('jwt-4');
    expect(oauth.flowError()).toBeNull();
  });

  it('publishes the provider error of the callback', async () => {
    window.history.replaceState(null, '', '/callback?convexAuthError=access_denied');
    authSetup({ replaceUrl: vi.fn() });
    const oauth = run(() => injectOauth());
    await flush();
    expect(oauth.flowError()).toEqual({ error: 'ACCESS_DENIED' });
  });

  it('reports INVALID_FLOW for a code this browser did not start', async () => {
    window.history.replaceState(null, '', '/callback?convexAuthCode=stray');
    authSetup({ replaceUrl: vi.fn() });
    const oauth = run(() => injectOauth());
    await flush();
    expect(oauth.flowError()).toEqual({ error: 'INVALID_FLOW' });
  });

  it('finishes a flow with a code obtained elsewhere', async () => {
    const storage = new InMemoryStorage();
    await storePendingFlow(storage);
    const convex = new FakeConvexClient();
    convex.onMutation(github.completeSignInWithGithub, () => complete(5));
    authSetup({ storage, convex });
    const { signIn } = run(() => injectSignInWithGithub(github));
    const token = run(() => injectAuthToken());
    await flush();
    await expect(signIn({ code: 'code-2' })).resolves.toEqual({ status: 'complete' });
    expect(token()).toBe('jwt-5');
  });

  it('folds a failing start into an OTHER_ERROR result (no redirect)', async () => {
    authSetup();
    const { signIn } = run(() => injectSignInWithGithub(github));
    const result = await signIn({ redirectTo: 'http://localhost/back' });
    expect(result).toMatchObject({ status: 'error', userError: { error: 'OTHER_ERROR' } });
  });

  it('refuses a start that does not return { redirect, state }', async () => {
    const convex = new FakeConvexClient();
    convex.onMutation(github.startSignInWithGithub, () => ({ redirect: 'https://github.com/login' }));
    authSetup({ convex });
    const { signIn } = run(() => injectSignInWithGithub(github));
    const result = await signIn({ redirectTo: 'http://localhost/back' });
    expect(result).toMatchObject({ status: 'error', userError: { error: 'OTHER_ERROR' } });
    expect(String((result as { userError: { cause: unknown } }).userError.cause)).toMatch(/did not return \{ redirect, state \}/);
  });

  it('throws when oauth() is not registered', () => {
    authSetup({ ambientSignIns: [] });
    expect(() => run(() => injectOauth())).toThrow(/No OAuth setup/);
    expect(() =>
      run(() => injectOauthSignIn({ providerName: 'x', startSignIn: github.startSignInWithGithub, completeSignIn: github.completeSignInWithGithub })),
    ).toThrow(/No OAuth setup/);
  });
});
