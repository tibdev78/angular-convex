import { TestBed } from '@angular/core/testing';
import { InMemoryStorage } from '@convex-dev/auth/browser';
import { makeFunctionReference } from 'convex/server';
import { injectConvexAuth } from 'ngx-convex';
import { authApi, authSetup, fakeHttp, flush, run, tokens } from '../test/auth-test-helpers';
import {
  injectAuthActions,
  injectAuthClient,
  injectAuthSignInApi,
  injectAuthState,
  injectAuthToken,
  injectConvexAuthContext,
} from './provide-convex-auth-client';

describe('provideConvexAuthClient', () => {
  it('restores nothing on a fresh browser, then reports signed out', async () => {
    authSetup();
    const state = run(() => injectAuthState());
    const token = run(() => injectAuthToken());
    await flush();
    expect(state()).toMatchObject({ isLoading: false, isAuthenticated: false, token: null });
    expect(token()).toBeNull();
  });

  it('adopts a session: token signal, storage, and the Convex client fetches it', async () => {
    const { convex } = authSetup();
    const actions = run(() => injectAuthActions());
    const token = run(() => injectAuthToken());
    const auth = run(() => injectConvexAuth());
    await flush();

    await actions.setSession(tokens(1));
    await flush();
    expect(token()).toBe('jwt-1');
    expect(await convex.client.fetchToken?.({ forceRefreshToken: false })).toBe('jwt-1');

    await convex.resolveAuth(true);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('restores the stored session on the next start', async () => {
    const storage = new InMemoryStorage();
    authSetup({ storage });
    await flush();
    await run(() => injectAuthActions()).setSession(tokens(7));

    TestBed.resetTestingModule();
    authSetup({ storage });
    const token = run(() => injectAuthToken());
    await flush();
    expect(token()).toBe('jwt-7');
  });

  it('signs out through the HTTP client with the refresh token', async () => {
    const http = fakeHttp();
    authSetup({ http });
    const actions = run(() => injectAuthActions());
    const token = run(() => injectAuthToken());
    await flush();
    await actions.setSession(tokens(2));

    await actions.signOut();
    await flush();
    expect(http.calls).toContainEqual({ name: 'auth:signOut', args: { refreshToken: 'refresh-2' } });
    expect(token()).toBeNull();
  });

  it('signs out when the backend reports the session revoked', async () => {
    const http = fakeHttp();
    const { convex } = authSetup({ http });
    const actions = run(() => injectAuthActions());
    const token = run(() => injectAuthToken());
    await flush();
    await actions.setSession(tokens(3));
    await flush();
    await convex.resolveAuth(true);
    await flush();
    expect(convex.subscriptionCount).toBe(1);
    convex.setQuery(authApi.isAuthenticated, {}, true);
    await flush();
    expect(token()).toBe('jwt-3');

    convex.setQuery(authApi.isAuthenticated, {}, false);
    await flush();
    expect(http.calls.map((c) => c.name)).toContain('auth:signOut');
    expect(token()).toBeNull();
  });

  it('runs sign-in functions over the WebSocket client', async () => {
    const { convex } = authSetup();
    const signIn = makeFunctionReference<'mutation'>('auth:signIn');
    convex.onMutation(signIn, (args) => ({ echoed: args }));
    const signInApi = run(() => injectAuthSignInApi());
    await expect(signInApi.mutation(signIn, { a: 1 })).resolves.toEqual({ echoed: { a: 1 } });
  });

  it('exposes the AuthClient and the shared context', () => {
    authSetup();
    const client = run(() => injectAuthClient());
    expect(run(() => injectConvexAuthContext()).client).toBe(client);
  });

  it('fails clearly without provideConvexAuthClient', () => {
    TestBed.configureTestingModule({});
    expect(() => run(() => injectAuthState())).toThrow(/provideConvexAuthClient/);
  });
});
