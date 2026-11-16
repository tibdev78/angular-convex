import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConvexHttpClient } from 'convex/browser';
import { injectAuthenticatedHttpClient, injectConvexAuth, injectFetchAccessToken, provideConvexAuth } from './convex-auth';
import { ConvexAuthenticated, ConvexAuthLoading, ConvexUnauthenticated } from './auth-directives';
import { flush, setup } from '../../test/helpers';

function authSetup(initial: { loading: boolean; authenticated: boolean }) {
  const isLoading = signal(initial.loading);
  const isAuthenticated = signal(initial.authenticated);
  const fetchAccessToken = vi.fn(async () => 'jwt');
  const env = setup([provideConvexAuth({ isLoading, isAuthenticated, fetchAccessToken })]);
  return { ...env, isLoading, isAuthenticated, fetchAccessToken };
}

describe('provideConvexAuth', () => {
  it('is loading until the backend confirms the token', async () => {
    const { convex, isLoading, isAuthenticated, fetchAccessToken } = authSetup({ loading: true, authenticated: false });
    const auth = TestBed.runInInjectionContext(() => injectConvexAuth());
    expect(auth.state()).toEqual({ isLoading: true, isAuthenticated: false, isRefreshing: false });

    isLoading.set(false);
    isAuthenticated.set(true);
    await flush();
    expect(convex.client.fetchToken).toBe(fetchAccessToken);
    expect(auth.isLoading()).toBe(true);

    await convex.resolveAuth(true);
    expect(auth.state()).toEqual({ isLoading: false, isAuthenticated: true, isRefreshing: false });
  });

  it('is signed out when the backend rejects the token', async () => {
    const { convex } = authSetup({ loading: false, authenticated: true });
    const auth = TestBed.runInInjectionContext(() => injectConvexAuth());
    await convex.resolveAuth(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.isLoading()).toBe(false);
  });

  it('clears auth on sign out', async () => {
    const { convex, isAuthenticated } = authSetup({ loading: false, authenticated: true });
    const auth = TestBed.runInInjectionContext(() => injectConvexAuth());
    await convex.resolveAuth(true);
    isAuthenticated.set(false);
    await flush();
    expect(convex.client.fetchToken).toBeUndefined();
    expect(auth.state()).toEqual({ isLoading: false, isAuthenticated: false, isRefreshing: false });
  });

  it('ignores late answers from a previous session', async () => {
    const { convex, isAuthenticated } = authSetup({ loading: false, authenticated: true });
    const auth = TestBed.runInInjectionContext(() => injectConvexAuth());
    const stale = convex.client.onAuthChange!;
    isAuthenticated.set(false);
    await flush();
    stale(true);
    expect(auth.isAuthenticated()).toBe(false);
  });
});

@Component({
  standalone: true,
  imports: [ConvexAuthenticated, ConvexUnauthenticated, ConvexAuthLoading],
  template: `<p *convexAuthLoading>loading</p><p *convexAuthenticated>in</p><p *convexUnauthenticated>out</p>`,
})
class Host {}

describe('auth directives', () => {
  it('render according to the auth state', async () => {
    const { convex, isLoading, isAuthenticated } = authSetup({ loading: true, authenticated: false });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await flush();
    const text = () => (fixture.nativeElement as HTMLElement).textContent?.trim();
    expect(text()).toBe('loading');
    isLoading.set(false);
    isAuthenticated.set(true);
    await flush();
    await convex.resolveAuth(true);
    await flush();
    fixture.detectChanges();
    expect(text()).toBe('in');
    isAuthenticated.set(false);
    await flush();
    fixture.detectChanges();
    expect(text()).toBe('out');
  });
});

describe('injectFetchAccessToken / injectAuthenticatedHttpClient', () => {
  it('returns the provider token only while signed in', async () => {
    const { isAuthenticated, fetchAccessToken } = authSetup({ loading: false, authenticated: true });
    const fetchToken = TestBed.runInInjectionContext(() => injectFetchAccessToken());
    expect(await fetchToken({ forceRefreshToken: true })).toBe('jwt');
    expect(fetchAccessToken).toHaveBeenLastCalledWith({ forceRefreshToken: true });
    isAuthenticated.set(false);
    expect(await fetchToken()).toBeNull();
  });

  it('is null without an auth provider', async () => {
    setup([]);
    const fetchToken = TestBed.runInInjectionContext(() => injectFetchAccessToken());
    expect(await fetchToken()).toBeNull();
  });

  it('builds an HTTP client carrying the token', async () => {
    authSetup({ loading: false, authenticated: true });
    const http = TestBed.runInInjectionContext(() => injectAuthenticatedHttpClient());
    const client = await http();
    expect(client).toBeInstanceOf(ConvexHttpClient);
    expect((client as unknown as { auth?: string }).auth).toBe('jwt');
  });
});
