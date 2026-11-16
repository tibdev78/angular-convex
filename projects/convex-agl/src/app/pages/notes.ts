import { Component } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { injectAction, injectMutation, injectQuery } from 'ngx-convex';
import { api } from '../convex';

@Component({
  selector: 'app-notes',
  imports: [FormsModule, DecimalPipe],
  template: `
    <h1>Vector search</h1>
    <section class="card">
      <form class="row" (ngSubmit)="addNote()">
        <input name="title" [(ngModel)]="title" placeholder="Title" data-testid="note-title" />
        <input class="grow" name="body" [(ngModel)]="body" placeholder="Body" data-testid="note-body" />
        <button type="submit" [disabled]="!title.trim()" data-testid="note-add">Add note</button>
      </form>
      <ul class="list" data-testid="note-list">
        @for (n of notes() ?? []; track n._id) {
          <li><strong>{{ n.title }}</strong><span class="grow muted">{{ n.body }}</span>
            <button class="danger" type="button" (click)="remove({ id: n._id })">✕</button></li>
        }
      </ul>
    </section>
    <section class="card">
      <h2>Find similar notes (action + <code>ctx.vectorSearch</code>)</h2>
      <form class="row" (ngSubmit)="similar.run({ text: query })">
        <input class="grow" name="q" [(ngModel)]="query" placeholder="Describe what you look for" data-testid="note-query" />
        <button type="submit" [disabled]="similar.isPending()" data-testid="note-search">Search</button>
      </form>
      <ul class="list" data-testid="note-hits">
        @for (hit of similar.data() ?? []; track hit._id) {
          <li><strong>{{ hit.title }}</strong><span class="grow muted">{{ hit.body }}</span><code>{{ hit.score | number: '1.2-2' }}</code></li>
        }
      </ul>
    </section>
  `,
})
export class NotesPage {
  protected title = '';
  protected body = '';
  protected query = '';
  protected readonly notes = injectQuery(api.notes.list);
  protected readonly add = injectMutation(api.notes.add);
  protected readonly remove = injectMutation(api.notes.remove);
  protected readonly similar = injectAction(api.notes.similar);

  protected async addNote(): Promise<void> {
    await this.add({ title: this.title, body: this.body });
    this.title = this.body = '';
  }
}
