import { Component, signal, VERSION } from '@angular/core';
import {
  ConvexAuthenticated,
  ConvexUnauthenticated,
  injectAction,
  injectConvexConnectionState,
  injectMutation,
  injectQuery,
  provideConvex,
} from 'angular-convex';
import { injectSignUpWithUsernamePassword, provideConvexAuthClient } from 'angular-convex/convex-auth';
import { api } from './api';


declare const ngDevMode: unknown;

/** Backend of the compatibility run (the demo's local deployment by default). */
const CONVEX_URL = (globalThis as { CONVEX_URL?: string }).CONVEX_URL ?? 'http://127.0.0.1:3210';

export const smokeProviders = [provideConvex(CONVEX_URL), provideConvexAuthClient({ api: api.auth })];

/**
 * Exercises the public surface of angular-convex against the convex-agl demo
 * backend: query, auth directives, convex-auth sign-up, authenticated query,
 * mutation with a live update, action, connection state.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConvexAuthenticated, ConvexUnauthenticated],
  template: `
    <main style="font: 16px system-ui; padding: 24px; max-width: 720px">
      <h1>angular-convex compat — Angular <span data-testid="ng-version">{{ version }}</span></h1>
      <p>WebSocket: <strong data-testid="ws">{{ connection().isWebSocketConnected ? 'connected' : 'down' }}</strong></p>
      <p>Public query <code>system.info</code>: <strong data-testid="query">{{ info() ? 'ok' : '…' }}</strong></p>
      <p *convexUnauthenticated data-testid="signed-out">
        Signed out —
        <button type="button" (click)="signUp()" data-testid="sign-up">Sign up as {{ username }}</button>
      </p>
      <section *convexAuthenticated data-testid="signed-in">
        <p>Signed in as <strong data-testid="me">{{ me()?.name ?? '…' }}</strong></p>
        <button type="button" (click)="rename()" data-testid="rename">Rename (mutation)</button>
        <button type="button" (click)="runPing()" data-testid="ping">Run action</button>
        <span data-testid="ping-result">{{ ping() }}</span>
      </section>
      <p style="color: #b91c1c" data-testid="error">{{ error() }}</p>
    </main>
  `,
})
export class Smoke {
  protected readonly version = VERSION.full;
  protected readonly username = 'compat' + Math.random().toString(36).slice(2, 8);
  protected readonly connection = injectConvexConnectionState();
  protected readonly info = injectQuery(api.system.info, {});
  protected readonly me = injectQuery(api.users.me, {});
  private readonly signUpFlow = injectSignUpWithUsernamePassword(api.auth);
  private readonly renameUser = injectMutation(api.users.rename);
  private readonly pingAction = injectAction(api.system.ping);
  protected readonly ping = signal('');
  protected readonly error = signal('');

  protected async signUp(): Promise<void> {
    const result = await this.signUpFlow.signUp({ username: this.username, password: 'compat-pass-42' });
    if (result.status === 'error') this.error.set(JSON.stringify(result.userError));
  }

  protected async rename(): Promise<void> {
    await this.renameUser({ name: 'Renamed on Angular ' + VERSION.major });
  }

  protected async runPing(): Promise<void> {
    try {
      this.ping.set((await this.pingAction({})).ok ? 'action ok' : 'action failed');
    } catch (e) {
      this.error.set(String(e));
    }
  }
}
