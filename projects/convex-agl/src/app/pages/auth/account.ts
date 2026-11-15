import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { injectMutation, injectQuery } from 'angular-convex';
import {
  injectAddPasskey,
  injectAuthActions,
  injectAuthState,
  injectAuthToken,
  injectRemovePasskey,
  injectStartChangeEmail,
} from 'angular-convex/convex-auth';
import { api } from '../../convex';
import { errorText } from '../../shared/errors';
import { userErrorText } from '../../shared/user-error';

/** Profile and the account-management flows of each sign-in method. */
@Component({
  selector: 'app-account',
  imports: [FormsModule, DatePipe],
  template: `
    <h1>Account</h1>
    @if (me(); as user) {
      <section class="card" data-testid="account">
        <div class="row">
          @if (user.avatarUrl) { <img [src]="user.avatarUrl" alt="" width="40" height="40" style="border-radius: 50%" /> }
          <div class="grow">
            <strong data-testid="account-name">{{ user.name }}</strong>
            <div class="muted">
              <span class="badge" data-testid="account-method">{{ user.method }}</span>
              @if (user.username) { · &#64;{{ user.username }} }
              @if (user.email) { · <span data-testid="account-email">{{ user.email }}</span> }
              · <code data-testid="account-id">{{ user._id }}</code>
            </div>
          </div>
          <button type="button" class="ghost" (click)="signOut()" data-testid="sign-out">Sign out</button>
        </div>
        <form class="row" (ngSubmit)="saveName()" style="margin-top: var(--space-2)">
          <input class="grow" name="name" [(ngModel)]="name" placeholder="Display name" data-testid="rename-input" />
          <button type="submit" data-testid="rename-save">Rename</button>
        </form>
      </section>

      <section class="card" data-testid="session">
        <h2>Session</h2>
        <p class="muted">
          <code>injectAuthState()</code>: authenticated {{ authState().isAuthenticated }}, loading {{ authState().isLoading }}.
          <code>injectAuthToken()</code>:
          @if (tokenExpiry(); as exp) { JWT valid until <span data-testid="session-expiry">{{ exp | date: 'HH:mm:ss' }}</span> } @else { no token }
        </p>
      </section>

      @if (user.method === 'usernamePassword' || user.method === 'emailPassword') {
        <section class="card">
          <h2>Change password</h2>
          <form class="row" (ngSubmit)="changePassword(user.method)">
            <input name="cur" [(ngModel)]="currentPassword" type="password" placeholder="Current password" autocomplete="current-password" data-testid="cp-current" />
            <input name="new" [(ngModel)]="newPassword" type="password" placeholder="New password" autocomplete="new-password" data-testid="cp-new" />
            <button type="submit" data-testid="cp-save">Change</button>
          </form>
        </section>
      }

      @if (user.method === 'emailPassword') {
        <section class="card">
          <h2>Change email</h2>
          <form class="row" (ngSubmit)="changeEmail()">
            <input name="ne" [(ngModel)]="newEmail" type="email" placeholder="new@example.com" data-testid="ce-email" />
            <input name="pw" [(ngModel)]="currentPassword" type="password" placeholder="Current password" data-testid="ce-password" />
            <button type="submit" [disabled]="startChangeEmail.pending()" data-testid="ce-send">Send confirmation</button>
          </form>
        </section>
      }

      @if (user.method === 'usernamePasskey') {
        <section class="card">
          <div class="row"><h2 class="grow">Passkeys</h2>
            <button type="button" (click)="addPasskey()" [disabled]="add.pending()" data-testid="pk-add">Add a passkey</button></div>
          <ul class="list" data-testid="pk-list">
            @for (p of passkeys(); track p.passkeyId) {
              <li data-testid="pk-item">
                <span class="grow">{{ p.name ?? 'Passkey' }} <span class="muted">{{ p.createdAt | date: 'short' }}</span></span>
                <button type="button" class="danger" (click)="removePasskey(p.passkeyId)" [disabled]="remove.pending()">Remove</button>
              </li>
            }
          </ul>
        </section>
      }

      @if (message()) { <p class="notice" data-testid="account-message">{{ message() }}</p> }
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class AccountPage {
  private readonly router = inject(Router);
  protected readonly me = injectQuery(api.users.me);
  protected readonly authState = injectAuthState();
  private readonly token = injectAuthToken();
  /** Expiry read from the JWT payload (`exp`, in seconds). */
  protected readonly tokenExpiry = computed(() => {
    const payload = this.token()?.split('.')[1];
    if (!payload) return null;
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return exp ? new Date(exp * 1000) : null;
  });
  protected readonly passkeyList = injectQuery(api.auth.listPasskeys, () =>
    this.me()?.method === 'usernamePasskey' ? {} : 'skip',
  );
  protected readonly rename = injectMutation(api.users.rename);
  protected readonly changeUsernamePassword = injectMutation(api.auth.changeUsernamePassword);
  protected readonly changeEmailPassword = injectMutation(api.auth.changePassword);
  protected readonly startChangeEmail = injectStartChangeEmail(api.auth);
  protected readonly add = injectAddPasskey(api.auth);
  protected readonly remove = injectRemovePasskey(api.auth);
  private readonly actions = injectAuthActions();

  protected readonly message = signal('');
  protected name = '';
  protected currentPassword = '';
  protected newPassword = '';
  protected newEmail = '';

  protected passkeys() {
    const list = this.passkeyList();
    return list?.success ? list.passkeys : [];
  }

  protected async signOut(): Promise<void> {
    await this.actions.signOut();
    await this.router.navigateByUrl('/login');
  }

  protected async saveName(): Promise<void> {
    await this.rename({ name: this.name });
    this.message.set('Name saved.');
  }

  protected async changePassword(method: string): Promise<void> {
    const args = { currentPassword: this.currentPassword, newPassword: this.newPassword };
    try {
      const result =
        method === 'emailPassword' ? await this.changeEmailPassword(args) : await this.changeUsernamePassword(args);
      this.message.set(result.success ? 'Password changed.' : userErrorText(result.userError));
    } catch (error) {
      this.message.set(errorText(error));
    }
  }

  protected async changeEmail(): Promise<void> {
    const result = await this.startChangeEmail.startChangeEmail({ newEmail: this.newEmail, currentPassword: this.currentPassword });
    this.message.set(result.success ? `Confirmation sent to ${this.newEmail} — see the fake mailbox.` : userErrorText(result.userError));
  }

  protected async addPasskey(): Promise<void> {
    const result = await this.add.addPasskey();
    this.message.set(result.success ? 'Passkey added.' : userErrorText(result.userError));
  }

  protected async removePasskey(passkeyId: string): Promise<void> {
    const result = await this.remove.removePasskey(passkeyId);
    this.message.set(result.success ? 'Passkey removed.' : userErrorText(result.userError));
  }
}
