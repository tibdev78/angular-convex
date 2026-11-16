import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectFileUpload, injectMutation, injectPaginatedQuery, injectQuery, insertAtTop } from 'ngx-convex';
import { api, type Id } from '../convex';

/** Rounded so the presence query only re-subscribes every 10 s. */
const bucket = () => Math.floor((Date.now() - 30_000) / 10_000) * 10_000;

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  template: `
    <h1>Real-time chat</h1>
    <div class="tabs">
      @for (c of channels; track c) {
        <button type="button" [class.active]="channel() === c" (click)="channel.set(c)" [attr.data-testid]="'channel-' + c">#{{ c }}</button>
      }
      <span class="grow"></span>
      <span class="muted" data-testid="presence">
        Online: {{ online().map(u => u.name).join(', ') || '—' }}
        @if (typing().length) { · {{ typing().join(', ') }} typing… }
      </span>
    </div>

    <section class="card">
      <form class="row" (ngSubmit)="sendMessage()">
        <input class="grow" name="body" [(ngModel)]="body" (input)="ping(true)" placeholder="Message #{{ channel() }}" data-testid="chat-input" />
        <input type="file" accept="image/*" (change)="pick($event)" data-testid="chat-file" />
        <button type="submit" [disabled]="(!body.trim() && !file) || upload.isUploading()" data-testid="chat-send">Send</button>
      </form>
      @if (upload.isUploading()) { <p class="muted">Uploading {{ upload.progress() }}%</p> }
    </section>

    <section class="card">
      <ul class="list" data-testid="chat-messages">
        @for (m of messages.results(); track m._id) {
          <li data-testid="chat-message" [class.muted]="m._id.startsWith('optimistic:')">
            <strong>{{ m.author?.name ?? '?' }}</strong>
            <span class="grow">{{ m.body }}</span>
            @if (m.imageUrl) { <img [src]="m.imageUrl" alt="" width="64" /> }
          </li>
        } @empty {
          <li class="muted">No messages yet.</li>
        }
      </ul>
      <div class="row">
        <span class="muted" data-testid="chat-status">{{ messages.status() }} · {{ messages.results().length }} loaded</span>
        <button class="ghost" type="button" [disabled]="!messages.canLoadMore()" (click)="messages.loadMore(10)" data-testid="chat-more">Load older</button>
      </div>
    </section>

    <section class="card">
      <h2>Search in #{{ channel() }}</h2>
      <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search messages…" data-testid="chat-search" />
      <ul class="list">
        @for (m of hits() ?? []; track m._id) { <li>{{ m.author?.name }}: {{ m.body }}</li> }
      </ul>
    </section>
  `,
})
export class ChatPage {
  protected readonly channels = ['general', 'random'];
  protected readonly channel = signal('general');
  protected readonly query = signal('');
  private readonly since = signal(bucket());
  protected body = '';
  protected file: File | undefined;

  protected readonly messages = injectPaginatedQuery(api.messages.list, () => ({ channel: this.channel() }), {
    initialNumItems: 10,
  });
  protected readonly hits = injectQuery(api.messages.search, () =>
    this.query().trim() ? { channel: this.channel(), text: this.query() } : 'skip',
  );
  private readonly presence = injectQuery(api.presence.list, () => ({ channel: this.channel(), since: this.since() }));
  protected readonly online = computed(() => this.presence() ?? []);
  protected readonly typing = computed(() => this.online().filter((u) => u.typing).map((u) => u.name));

  private readonly me = injectQuery(api.users.me);
  // Text messages show at once, before the server confirms: insertAtTop puts
  // a placeholder on the first page (the list is newest first).
  private readonly send = injectMutation(api.messages.send).withOptimisticUpdate((localQueryStore, args) => {
    if (args.imageId) return;
    insertAtTop({
      paginatedQuery: api.messages.list,
      argsToMatch: { channel: args.channel },
      localQueryStore,
      item: {
        _id: `optimistic:${Date.now()}` as Id<'messages'>,
        _creationTime: Date.now(),
        channel: args.channel,
        authorId: (this.me()?._id ?? '') as Id<'users'>,
        body: args.body.trim(),
        author: { name: this.me()?.name ?? 'me', avatarUrl: null },
        imageUrl: null,
      },
    });
  });
  private readonly heartbeat = injectMutation(api.presence.heartbeat);
  protected readonly upload = injectFileUpload(api.files.generateUploadUrl);

  constructor() {
    this.ping(false);
    const timer = setInterval(() => {
      this.since.set(bucket());
      this.ping(false);
    }, 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected ping(typing: boolean): void {
    void this.heartbeat({ channel: this.channel(), typing }).catch(() => undefined);
  }

  protected pick(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0];
  }

  protected async sendMessage(): Promise<void> {
    const imageId = this.file ? ((await this.upload.upload(this.file)) as Id<'_storage'>) : undefined;
    await this.send({ channel: this.channel(), body: this.body, imageId });
    this.body = '';
    this.file = undefined;
    this.ping(false);
  }
}
