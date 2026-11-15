import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { injectMutation, injectQuery } from 'angular-convex';
import { api } from '../convex';

@Component({
  selector: 'app-jobs',
  imports: [FormsModule, DatePipe],
  template: `
    <h1>Scheduler & crons</h1>
    <section class="card">
      <form class="row" (ngSubmit)="schedule({ label, delayMs: delay * 1000 })">
        <input class="grow" name="label" [(ngModel)]="label" data-testid="job-label" />
        <label>in <input type="number" name="delay" [(ngModel)]="delay" min="0" style="width: 5em" data-testid="job-delay" /> s</label>
        <button type="submit" data-testid="job-schedule">Schedule</button>
      </form>
      <ul class="list" data-testid="job-list">
        @for (j of jobs() ?? []; track j._id) {
          <li data-testid="job-item">
            <span class="grow">{{ j.label }} <span class="muted">· runs {{ j.runAt | date: 'HH:mm:ss' }}</span></span>
            <span class="badge" [attr.data-status]="j.status">{{ j.status }}</span>
            <span class="muted">system: {{ j.system ?? '—' }}</span>
            @if (j.status === 'scheduled') { <button class="danger" type="button" (click)="cancel({ id: j._id })">Cancel</button> }
          </li>
        }
      </ul>
    </section>
    <section class="card">
      <h2>Cron</h2>
      <p>The <code>heartbeat stat</code> cron ran <strong data-testid="cron-count">{{ cron()?.value ?? 0 }}</strong> times
        @if (cron(); as c) { <span class="muted">(last {{ c.updatedAt | date: 'HH:mm:ss' }})</span> }.</p>
    </section>
  `,
})
export class JobsPage {
  protected label = 'Say hello';
  protected delay = 5;
  protected readonly jobs = injectQuery(api.jobs.list);
  protected readonly cron = injectQuery(api.system.cronStat);
  protected readonly schedule = injectMutation(api.jobs.schedule);
  protected readonly cancel = injectMutation(api.jobs.cancel);
}
