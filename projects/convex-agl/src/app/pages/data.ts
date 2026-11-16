import { Component, signal } from '@angular/core';
import { injectMutation, injectPaginatedQuery, injectQuery } from 'ngx-convex';
import { api } from '../convex';

type Kind = 'info' | 'warning' | 'error';

@Component({
  selector: 'app-data',
  template: `
    <h1>Large dataset</h1>
    <section class="card row">
      <span class="grow">Rows in <code>events</code>: <strong data-testid="event-count">{{ count() ?? '…' }}</strong></span>
      <button type="button" (click)="seed({ total: 1000 })" data-testid="seed">Seed 1,000 rows</button>
    </section>
    <section class="card">
      <div class="tabs">
        <button type="button" [class.active]="kind() === undefined" (click)="kind.set(undefined)">all</button>
        @for (k of kinds; track k) {
          <button type="button" [class.active]="kind() === k" (click)="kind.set(k)" [attr.data-testid]="'kind-' + k">{{ k }}</button>
        }
      </div>
      <table style="width: 100%">
        <thead><tr><th align="left">Message</th><th align="left">Kind</th><th align="right">Value</th></tr></thead>
        <tbody data-testid="event-rows">
          @for (e of events.results(); track e._id) {
            <tr><td>{{ e.message }}</td><td>{{ e.kind }}</td><td align="right">{{ e.value }}</td></tr>
          }
        </tbody>
      </table>
      <div class="row">
        <span class="muted" data-testid="event-status">{{ events.status() }} · {{ events.results().length }} loaded</span>
        <button class="ghost" type="button" [disabled]="!events.canLoadMore()" (click)="events.loadMore(50)" data-testid="event-more">Load 50 more</button>
      </div>
    </section>
  `,
})
export class DataPage {
  protected readonly kinds: Kind[] = ['info', 'warning', 'error'];
  protected readonly kind = signal<Kind | undefined>(undefined);
  protected readonly count = injectQuery(api.events.count);
  protected readonly events = injectPaginatedQuery(api.events.list, () => ({ kind: this.kind() }), { initialNumItems: 25 });
  protected readonly seed = injectMutation(api.events.seed);
}
