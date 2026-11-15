import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  injectCompleteChangeEmail,
  injectCompletePasswordRecovery,
  injectCompleteSignUpWithEmailPassword,
} from 'angular-convex/convex-auth';
import { api } from '../../convex';
import { userErrorText } from '../../shared/user-error';

/** `/auth/validate-email?code=…` — finishes the email + password sign-up. */
@Component({
  selector: 'app-validate-email',
  imports: [RouterLink],
  template: `
    <h1>Confirm your email</h1>
    <section class="card" data-testid="link-state">
      @switch (state().status) {
        @case ('loading') { <p class="muted">Checking the link…</p> }
        @case ('complete') { <p class="notice">Email confirmed — you are signed in. <a routerLink="/account">Go to your account</a></p> }
        @case ('error') { <p class="error">This link cannot be used: {{ errorOf(state()) }}</p> }
      }
    </section>
  `,
})
export class ValidateEmailPage {
  readonly code = input<string>('');
  protected readonly state = injectCompleteSignUpWithEmailPassword(api.auth, { emailCode: () => this.code() });
  protected errorOf(state: unknown): string {
    return userErrorText((state as { userError?: unknown }).userError);
  }
}

/** `/auth/confirm-email-change?code=…` — switches the account to the new address. */
@Component({
  selector: 'app-confirm-email-change',
  imports: [RouterLink],
  template: `
    <h1>Confirm the new email</h1>
    <section class="card" data-testid="link-state">
      @switch (state().status) {
        @case ('loading') { <p class="muted">Checking the link…</p> }
        @case ('complete') { <p class="notice">Your email address was changed. <a routerLink="/account">Back to your account</a></p> }
        @case ('error') { <p class="error">This link cannot be used: {{ errorOf(state()) }}</p> }
      }
    </section>
  `,
})
export class ConfirmEmailChangePage {
  readonly code = input<string>('');
  protected readonly state = injectCompleteChangeEmail(api.auth, { emailCode: () => this.code() });
  protected errorOf(state: unknown): string {
    return userErrorText((state as { userError?: unknown }).userError);
  }
}

/** `/auth/reset-password?code=…` — checks the link, then sets a new password. */
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Choose a new password</h1>
    <section class="card" data-testid="link-state">
      @let s = state();
      @switch (s.status) {
        @case ('loading') { <p class="muted">Checking the link…</p> }
        @case ('ready') {
          <form class="stack" (ngSubmit)="submit()">
            <input name="pw" [(ngModel)]="password" type="password" placeholder="New password (8+ chars)" autocomplete="new-password" data-testid="reset-password" />
            <button type="submit" [disabled]="s.pending" data-testid="reset-submit">Save and sign in</button>
            @if (error()) { <p class="error" data-testid="reset-error">{{ error() }}</p> }
          </form>
        }
        @case ('complete') { <p class="notice">Password changed — you are signed in. <a routerLink="/account">Go to your account</a></p> }
        @case ('error') { <p class="error">This link cannot be used: {{ errorOf(s) }}</p> }
      }
    </section>
  `,
})
export class ResetPasswordPage {
  readonly code = input<string>('');
  protected readonly state = injectCompletePasswordRecovery(api.auth, { emailCode: () => this.code() });
  protected password = '';
  protected readonly error = signal('');

  protected async submit(): Promise<void> {
    const s = this.state();
    if (s.status !== 'ready') return;
    const result = (await s.completePasswordRecovery({ newPassword: this.password })) as { status?: string; success?: boolean; userError?: unknown };
    this.error.set(result.userError ? userErrorText(result.userError) : '');
  }

  protected errorOf(state: unknown): string {
    return userErrorText((state as { userError?: unknown }).userError);
  }
}
