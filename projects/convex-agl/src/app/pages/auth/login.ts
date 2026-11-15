import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { injectConvexAuth } from 'angular-convex';
import {
  injectOauth,
  injectOauthSignIn,
  injectSignInWithEmailPassword,
  injectSignInAnonymously,
  injectSignInWithGithub,
  injectSignInWithUsernamePasskey,
  injectSignInWithUsernamePassword,
  injectSignUpWithEmailPassword,
  injectSignUpWithUsernamePassword,
  injectStartPasswordRecovery,
  supportsWebAuthn,
} from 'angular-convex/convex-auth';
import { api } from '../../convex';
import { userErrorText } from '../../shared/user-error';

type Method = 'username' | 'email' | 'passkey' | 'oauth' | 'anonymous';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Sign in</h1>
    <p class="muted">Six Convex Auth methods, all handled by <code>angular-convex/convex-auth</code>.</p>
    <nav class="tabs" data-testid="login-tabs">
      @for (m of methods; track m[0]) {
        <button type="button" [class.active]="method() === m[0]" (click)="method.set(m[0])" [attr.data-testid]="'tab-' + m[0]">
          {{ m[1] }}
        </button>
      }
    </nav>

    <section class="card">
      @switch (method()) {
        @case ('username') {
          <form class="stack" (ngSubmit)="usernameSubmit()">
            <input name="username" [(ngModel)]="username" placeholder="Username" autocomplete="username" data-testid="up-username" />
            <input name="password" [(ngModel)]="password" type="password" placeholder="Password (8+ chars)" autocomplete="current-password" data-testid="up-password" />
            <div class="row">
              <button type="submit" [disabled]="upIn.pending() || upUp.pending()" data-testid="up-signin">Sign in</button>
              <button type="button" class="ghost" [disabled]="upIn.pending() || upUp.pending()" (click)="usernameSignUp()" data-testid="up-signup">Create account</button>
            </div>
            @if (upIn.userError() || upUp.userError(); as e) {
              <p class="error" data-testid="login-error">{{ text(e) }}</p>
            }
          </form>
        }
        @case ('email') {
          <form class="stack" (ngSubmit)="emailSubmit()">
            <input name="email" [(ngModel)]="email" type="email" placeholder="you@example.com" autocomplete="email" data-testid="ep-email" />
            <input name="password" [(ngModel)]="password" type="password" placeholder="Password (8+ chars)" autocomplete="current-password" data-testid="ep-password" />
            <div class="row">
              <button type="submit" [disabled]="epIn.pending()" data-testid="ep-signin">Sign in</button>
              <button type="button" class="ghost" [disabled]="epUp.pending()" (click)="emailSignUp()" data-testid="ep-signup">Create account</button>
              <button type="button" class="ghost" [disabled]="recovery.pending()" (click)="forgot()" data-testid="ep-forgot">Forgot password</button>
            </div>
            @if (epIn.userError() || epUp.userError() || recovery.userError(); as e) {
              <p class="error" data-testid="login-error">{{ text(e) }}</p>
            }
            @if (notice()) {
              <p class="notice" data-testid="login-notice">{{ notice() }} <a routerLink="/mail">Open the fake mailbox</a></p>
            }
          </form>
        }
        @case ('passkey') {
          <form class="stack" (ngSubmit)="passkeySubmit()">
            <input name="pk" [(ngModel)]="username" placeholder="Username" autocomplete="username webauthn" data-testid="pk-username" />
            <button type="submit" [disabled]="!webauthn || passkey.pending()" data-testid="pk-continue">Continue with a passkey</button>
            <p class="muted">New username → a passkey is created; known username → you sign in with it.
              Autofill: {{ passkey.autofill.status() }}{{ webauthn ? '' : ' (WebAuthn unavailable)' }}</p>
            @if (passkeyError()) {
              <p class="error" data-testid="login-error">{{ passkeyError() }}</p>
            }
          </form>
        }
        @case ('oauth') {
          <div class="stack">
            <button type="button" (click)="github()" data-testid="gh-signin">Continue with GitHub</button>
            <p class="muted">Redirects to GitHub, back to the deployment's <code>/oauth/github/callback</code>, then here with a one-time code.</p>
            <button type="button" (click)="demoIdp()" data-testid="idp-signin">Continue with the demo OIDC provider</button>
            <p class="muted">An OpenID Connect provider served by the backend itself (<code>/idp/*</code>): consent page, PKCE,
              signed <code>id_token</code>, then the same one-time code protocol. A custom method built with <code>bindMethod</code>.</p>
          </div>
        }
        @case ('anonymous') {
          <div class="stack">
            <button type="button" (click)="anonymousSignIn()" [disabled]="anonymous.pending()" data-testid="anon-signin">Continue anonymously</button>
            <p class="muted">A new account with no credentials, every time. Sign out and it is gone for good.</p>
            @if (anonymousError()) {
              <p class="error" data-testid="login-error">{{ anonymousError() }}</p>
            }
          </div>
        }
      }
      @if (oauth.flowError(); as e) {
        <p class="error" data-testid="oauth-error">OAuth sign-in failed: {{ text(e) }}</p>
      }
    </section>
  `,
})
export class LoginPage {
  /** Page to open after signing in (query param, set by the guard). */
  readonly next = input<string>('/todos');

  protected readonly methods = [
    ['username', 'Username + password'],
    ['email', 'Email + password'],
    ['passkey', 'Passkey'],
    ['oauth', 'OAuth'],
    ['anonymous', 'Anonymous'],
  ] as const;
  protected readonly method = signal<Method>('username');
  protected readonly notice = signal('');
  protected readonly passkeyError = signal('');
  protected readonly webauthn = supportsWebAuthn();
  protected username = '';
  protected email = '';
  protected password = '';

  protected readonly upIn = injectSignInWithUsernamePassword(api.auth);
  protected readonly upUp = injectSignUpWithUsernamePassword(api.auth);
  protected readonly epIn = injectSignInWithEmailPassword(api.auth);
  protected readonly epUp = injectSignUpWithEmailPassword(api.auth);
  protected readonly recovery = injectStartPasswordRecovery(api.auth);
  protected readonly passkey = injectSignInWithUsernamePasskey(api.auth);
  protected readonly oauth = injectOauth();
  private readonly githubSignIn = injectSignInWithGithub(api.auth);
  /** Any provider exporting the two OAuth mutations works with the generic hook. */
  private readonly demoIdpSignIn = injectOauthSignIn({
    providerName: 'demoIdp',
    startSignIn: api.auth.startSignInWithDemoIdp,
    completeSignIn: api.auth.completeSignInWithDemoIdp,
  });
  protected readonly anonymous = injectSignInAnonymously(api.auth);
  protected readonly anonymousError = signal('');

  protected readonly text = userErrorText;

  constructor() {
    const auth = injectConvexAuth();
    const router = inject(Router);
    effect(() => {
      if (!auth.isLoading() && auth.isAuthenticated()) void router.navigateByUrl(this.next() || '/todos');
    });
  }

  protected usernameSubmit(): void {
    void this.upIn.signIn({ username: this.username, password: this.password });
  }

  protected usernameSignUp(): void {
    void this.upUp.signUp({ username: this.username, password: this.password });
  }

  protected emailSubmit(): void {
    this.notice.set('');
    void this.epIn.signIn({ email: this.email, password: this.password });
  }

  protected async emailSignUp(): Promise<void> {
    this.notice.set('');
    const result = await this.epUp.signUp({ email: this.email, password: this.password });
    if (result.success) this.notice.set(`Confirmation link sent to ${this.email}.`);
  }

  protected async forgot(): Promise<void> {
    this.notice.set('');
    const result = await this.recovery.startPasswordRecovery({ email: this.email });
    if (result.success) this.notice.set(`If ${this.email} has an account, a reset link was sent.`);
  }

  protected async passkeySubmit(): Promise<void> {
    this.passkeyError.set('');
    const result = await this.passkey.signIn({ username: this.username });
    if (result.status === 'error') this.passkeyError.set(userErrorText(result.userError));
  }

  protected github(): void {
    void this.githubSignIn.signIn({ redirectTo: this.backHere() });
  }

  protected demoIdp(): void {
    void this.demoIdpSignIn.signIn({ redirectTo: this.backHere() });
  }

  protected async anonymousSignIn(): Promise<void> {
    this.anonymousError.set('');
    await this.anonymous.signIn().catch((error: unknown) => this.anonymousError.set(String(error)));
  }

  /** The OAuth flows come back to this page, which then opens `next`. */
  private backHere(): string {
    const back = new URL('/login', window.location.origin);
    back.searchParams.set('next', this.next() || '/todos');
    return back.toString();
  }
}
