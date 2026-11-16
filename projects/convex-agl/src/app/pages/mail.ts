import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { injectMutation, injectQuery } from 'ngx-convex';
import { api } from '../convex';

@Component({
  selector: 'app-mail',
  imports: [FormsModule, DatePipe],
  template: `
    <h1>Fake mailbox</h1>
    <p class="muted">Every email of the deployment — including Convex Auth verification and recovery links — lands here. Nothing is really sent.</p>
    <section class="card">
      <form class="row" (ngSubmit)="sendMail()">
        <input name="to" [(ngModel)]="to" placeholder="to@example.com" data-testid="mail-to" />
        <input class="grow" name="subject" [(ngModel)]="subject" placeholder="Subject" data-testid="mail-subject" />
        <label>delay <input type="number" name="delay" [(ngModel)]="delay" min="0" style="width: 4em" /> s</label>
        <button type="submit" data-testid="mail-send">Send</button>
      </form>
      <textarea name="text" [(ngModel)]="text" rows="2" style="width: 100%; margin-top: var(--space-2)"></textarea>
    </section>
    <section class="card">
      <div class="row"><h2 class="grow">Inbox ({{ inbox()?.length ?? 0 }})</h2>
        <button class="danger" type="button" (click)="clear()" data-testid="mail-clear">Empty inbox</button></div>
      <ul class="list" data-testid="mail-list">
        @for (m of inbox() ?? []; track m._id) {
          <li data-testid="mail-item" (click)="open.set(m._id)" style="cursor: pointer">
            <span class="grow"><strong>{{ m.subject }}</strong> <span class="muted">→ {{ m.to.join(', ') }}</span></span>
            <span class="muted">{{ m._creationTime | date: 'HH:mm:ss' }}</span>
          </li>
          @if (open() === m._id) {
            <li><div class="mail-body" data-testid="mail-body" [innerHTML]="m.html ?? m.text"></div></li>
          }
        } @empty {
          <li class="muted">Empty.</li>
        }
      </ul>
    </section>
  `,
})
export class MailPage {
  protected to = 'friend@example.com';
  protected subject = 'Hello from Convex';
  protected text = 'This email went through a scheduled mutation and the fake Resend component.';
  protected delay = 0;
  protected readonly open = signal<string | undefined>(undefined);
  protected readonly inbox = injectQuery(api.mail.inbox, {});
  protected readonly send = injectMutation(api.mail.send);
  protected readonly clear = injectMutation(api.mail.clear);

  protected sendMail(): Promise<null> {
    return this.send({ to: this.to, subject: this.subject, text: this.text, delayMs: this.delay * 1000 });
  }
}
