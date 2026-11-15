import { Component, computed, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import {
  injectAction,
  injectAuthenticatedHttpClient,
  injectFetchAccessToken,
  injectMutation,
  injectPaginatedQuery,
  injectQuery,
  injectQueryFromOptions,
} from 'angular-convex';
import { labSamples } from '../shared/queries';
import { api, type Id } from '../convex';
import { errorText } from '../shared/errors';
import { environment } from '../../environments/environment';

/** Text ⇄ bytes for the `v.bytes()` field. */
const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const decode = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

/** `a=1, b=2` → `{ a: 1, b: 2 }` for the `v.record()` field. */
function parseCounts(text: string): Record<string, number> {
  const entries = text.split(',').map((part) => part.split('=').map((s) => s.trim()));
  return Object.fromEntries(entries.filter(([k, n]) => k && n !== undefined && !isNaN(Number(n))).map(([k, n]) => [k, Number(n)]));
}

@Component({
  selector: 'app-lab',
  imports: [JsonPipe],
  template: `
    <h1>Lab</h1>
    <p class="muted">Server primitives not used elsewhere: every value type, <code>db.replace</code>, <code>normalizeId</code>, function handles, nested queries, the Node runtime, storage from actions and HTTP routes.</p>

    <section class="card">
      <h2>Every value type (<code>v.record · v.bytes · v.int64 · v.any · v.nullable · v.commitTs · v.function</code>)</h2>
      <div class="row">
        <input [value]="label()" (input)="label.set(value($event))" placeholder="label" data-testid="lab-label" />
        <input [value]="counts()" (input)="counts.set(value($event))" placeholder="a=1, b=2" data-testid="lab-counts" />
        <input [value]="payload()" (input)="payload.set(value($event))" placeholder="bytes (text)" data-testid="lab-payload" />
        <input [value]="big()" (input)="big.set(value($event))" placeholder="int64" data-testid="lab-big" />
        <input [value]="extra()" (input)="extra.set(value($event))" placeholder="any (JSON)" data-testid="lab-extra" />
        <input [value]="note()" (input)="note.set(value($event))" placeholder="note (empty = null)" data-testid="lab-note" />
        <button type="button" (click)="createSample()" [disabled]="create.isPending()" data-testid="lab-create">Insert</button>
      </div>
      @if (formError(); as e) { <p class="error" data-testid="lab-form-error">{{ e }}</p> }
      <table>
        <thead><tr><th>label</th><th>record</th><th>bytes</th><th>int64</th><th>any</th><th>nullable</th><th>rev</th><th>commitTs</th><th>size</th><th></th></tr></thead>
        <tbody data-testid="lab-rows">
          @for (row of samples() ?? []; track row.doc._id) {
            <tr data-testid="lab-row" [attr.data-id]="row.doc._id">
              <td>{{ row.doc.label }}</td>
              <td>{{ row.doc.counts | json }}</td>
              <td>{{ row.doc.payload.byteLength }} B “{{ text(row.doc.payload) }}”</td>
              <td data-testid="lab-big-cell">{{ row.doc.big.toString() }}n ({{ typeOf(row.doc.big) }})</td>
              <td>{{ row.doc.extra | json }}</td>
              <td>{{ row.doc.note === null ? 'null' : row.doc.note }}</td>
              <td data-testid="lab-revision">{{ row.doc.revision }}</td>
              <td data-testid="lab-commit">{{ row.doc.committedAt === undefined ? '—' : typeOf(row.doc.committedAt) }}</td>
              <td>{{ row.size }} B</td>
              <td class="row">
                <button class="ghost" type="button" (click)="replace({ id: row.doc._id, label: row.doc.label + ' (replaced)' })" data-testid="lab-replace">Replace</button>
                <button class="ghost" type="button" (click)="bumpLater({ id: row.doc._id })" data-testid="lab-bump">+10 via handle</button>
                <button class="ghost" type="button" (click)="remove({ id: row.doc._id })" data-testid="lab-delete">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (bumpLater.data(); as handle) { <p class="muted" data-testid="lab-handle">Scheduled function handle: <code>{{ handle }}</code></p> }
      <ul class="muted" data-testid="lab-scheduled">
        @for (job of scheduled() ?? []; track job._id) { <li>{{ job.name }} · {{ job.state }}</li> }
      </ul>
    </section>

    <section class="card">
      <h2><code>.first()</code>, <code>for await</code>, <code>q.and</code> filter, <code>ctx.auth.getUserIdentity()</code>, <code>paginationResultValidator</code></h2>
      <pre data-testid="lab-overview">{{ overview() | json }}</pre>
      <p data-testid="lab-page">Page of 2: {{ page.results().length }} loaded · {{ page.status() }}</p>
      <button class="ghost" type="button" (click)="page.loadMore(2)" [disabled]="!page.canLoadMore()" data-testid="lab-page-more">Load 2 more</button>
    </section>

    <section class="card">
      <h2><code>db.normalizeId</code></h2>
      <input [value]="rawId()" (input)="rawId.set(value($event))" placeholder="paste any string or id" data-testid="lab-raw-id" />
      <pre data-testid="lab-normalized">{{ normalized() | json }}</pre>
    </section>

    <section class="card">
      <h2>Nested queries: <code>transactionLimits</code> and <code>useStaleSnapshot</code></h2>
      <button type="button" (click)="nested({})" data-testid="lab-nested">Run mutation</button>
      <pre data-testid="lab-nested-result">{{ nested.data() | json }}</pre>
    </section>

    <section class="card">
      <h2>Action → Node runtime (<code>"use node"</code>) → <code>ctx.storage.store</code></h2>
      <div class="row">
        <input [value]="digestText()" (input)="digestText.set(value($event))" data-testid="lab-digest-text" />
        <button type="button" (click)="digest({ text: digestText() })" [disabled]="digest.isPending()" data-testid="lab-digest">Hash and store</button>
      </div>
      @if (digest.data(); as d) {
        <pre data-testid="lab-digest-result">{{ d | json }}</pre>
        @if (d.url) { <a [href]="d.url" target="_blank" data-testid="lab-digest-link">stored file</a> }
      }
    </section>

    <section class="card">
      <h2>HTTP action with CORS: bearer token, <code>storage.store</code>, <code>storage.get</code></h2>
      <div class="row">
        <button type="button" (click)="uploadOverHttp()" data-testid="lab-http-upload">POST a blob to {{ site }}/api/lab/upload</button>
        <button class="ghost" type="button" (click)="uploadAnonymously()" data-testid="lab-http-anon">Same without a token</button>
      </div>
      <pre data-testid="lab-http-result">{{ httpResult() | json }}</pre>
      @if (httpReadBack(); as text) { <p data-testid="lab-http-readback">GET /api/lab/file → “{{ text }}”</p> }
    </section>

    <section class="card">
      <h2>Authenticated <code>ConvexHttpClient</code>: <code>query</code> and <code>consistentQuery</code></h2>
      <button type="button" (click)="oneShot()" data-testid="lab-consistent">Run both</button>
      <pre data-testid="lab-consistent-result">{{ oneShotResult() | json }}</pre>
    </section>

    <section class="card">
      <h2><code>throwOnError</code> (the <code>useQuery_experimental</code> behaviour)</h2>
      <p data-testid="lab-default-error">Default: status <b>{{ failing.status() }}</b>, value {{ failing() ?? 'undefined' }}, error() = {{ failing.error() ? text2(failing.error()) : '—' }}</p>
      <p data-testid="lab-thrown">With throwOnError, reading the signal throws: <b>{{ thrown() }}</b></p>
    </section>

    <section class="card">
      <h2><code>ctx.db.table(name)</code>: insert, patch, get, query, delete on one table</h2>
      <button type="button" (click)="viaTable({})" data-testid="lab-via-table">Run mutation</button>
      <pre data-testid="lab-via-table-result">{{ viaTable.data() | json }}</pre>
    </section>

    <section class="card">
      <h2>Plan-dependent APIs: <code>log.audit</code>, <code>getServiceUrl</code>, <code>getServiceToken</code>, <code>storage.getMetadata</code></h2>
      <p class="muted">Each one is called for real; the page shows what this deployment answers.</p>
      <div class="row">
        <button type="button" (click)="audit({})" data-testid="lab-audit">log.audit from a mutation</button>
        <button type="button" (click)="platform({})" [disabled]="platform.isPending()" data-testid="lab-platform">Probe from an action</button>
      </div>
      <pre data-testid="lab-audit-result">{{ audit.data() | json }}</pre>
      <pre data-testid="lab-platform-result">{{ platform.data() | json }}</pre>
      <p class="muted">Convex keeps <code>log.audit</code> durably only on Enterprise, and refuses it inside actions: an action audits through <code>ctx.runMutation</code>. Every event is also written to the <code>auditEvents</code> table, read live here.</p>
      <ul data-testid="lab-audit-trail">
        @for (e of auditTrail() ?? []; track e.id) { <li>{{ e.action }} · {{ e.source }}</li> } @empty { <li class="muted">No audit event yet.</li> }
      </ul>
    </section>

    <section class="card">
      <h2>Crons: <code>cron</code> expression, <code>hourly</code>, <code>daily</code>, <code>weekly</code>, <code>monthly</code></h2>
      <ul data-testid="lab-crons">
        @for (c of cronStats() ?? []; track c.name) { <li>{{ c.name }}: {{ c.value }} run(s)</li> } @empty { <li class="muted">No run yet (the expression cron fires every 2 minutes).</li> }
      </ul>
    </section>
  `,
})
export class LabPage {
  protected readonly site = environment.convexSiteUrl;
  protected readonly label = signal('first sample');
  protected readonly counts = signal('apples=3, pears=5');
  protected readonly payload = signal('hello bytes');
  protected readonly big = signal('9007199254740993');
  protected readonly extra = signal('{"nested":{"list":[1,"two",true]}}');
  protected readonly note = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly rawId = signal('');
  protected readonly digestText = signal('angular-convex');
  protected readonly httpResult = signal<unknown>(null);
  protected readonly httpReadBack = signal<string | null>(null);
  protected readonly oneShotResult = signal<unknown>(null);

  protected readonly samples = injectQueryFromOptions(labSamples);
  protected readonly overview = injectQuery(api.lab.overview);
  protected readonly page = injectPaginatedQuery(api.lab.page, {}, { initialNumItems: 2 });
  protected readonly normalized = injectQuery(api.lab.normalize, () => (this.rawId() ? { id: this.rawId() } : 'skip'));
  protected readonly cronStats = injectQuery(api.lab.cronStats);
  protected readonly auditTrail = injectQuery(api.lab.auditTrail);
  protected readonly scheduled = injectQuery(api.lab.scheduledBumps);
  protected readonly failing = injectQuery(api.lab.boom, { code: 'LAB_FAILURE' });
  private readonly failingThrows = injectQuery(api.lab.boom, { code: 'LAB_THROWN' }, { throwOnError: true });
  protected readonly thrown = computed(() => {
    try {
      return `no error yet (${String(this.failingThrows())})`;
    } catch (e) {
      return `caught ${errorText(e)}`;
    }
  });

  protected readonly create = injectMutation(api.lab.create);
  protected readonly replace = injectMutation(api.lab.replace);
  protected readonly remove = injectMutation(api.lab.remove);
  protected readonly bumpLater = injectMutation(api.lab.bumpLater);
  protected readonly nested = injectMutation(api.lab.nested);
  protected readonly digest = injectAction(api.lab.digest);
  protected readonly viaTable = injectMutation(api.lab.viaTable);
  protected readonly audit = injectMutation(api.lab.audit);
  protected readonly platform = injectAction(api.lab.platform);
  private readonly authenticatedHttp = injectAuthenticatedHttpClient();
  private readonly fetchToken = injectFetchAccessToken();

  protected readonly text = decode;
  protected readonly text2 = errorText;
  protected typeOf(value: unknown): string {
    return typeof value;
  }
  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async createSample(): Promise<void> {
    this.formError.set(null);
    try {
      await this.create({
        label: this.label(),
        counts: parseCounts(this.counts()),
        payload: encode(this.payload()),
        big: BigInt(this.big()),
        extra: this.extra() ? JSON.parse(this.extra()) : null,
        note: this.note() || null,
      });
    } catch (e) {
      this.formError.set(errorText(e));
    }
  }

  protected async uploadOverHttp(): Promise<void> {
    await this.upload(await this.fetchToken());
  }

  protected async uploadAnonymously(): Promise<void> {
    await this.upload(null);
  }

  private async upload(token: string | null): Promise<void> {
    this.httpReadBack.set(null);
    const res = await fetch(`${this.site}/api/lab/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: `uploaded over HTTP at ${new Date().toISOString()}`,
    });
    const body = res.ok ? ((await res.json()) as { storageId: Id<'_storage'> }) : await res.text();
    this.httpResult.set({ status: res.status, body });
    if (res.ok && typeof body === 'object') {
      const file = await fetch(`${this.site}/api/lab/file?id=${body.storageId}`);
      this.httpReadBack.set(await file.text());
    }
  }

  protected async oneShot(): Promise<void> {
    const client = await this.authenticatedHttp();
    const [plain, consistent] = await Promise.all([
      client.query(api.lab.overview, {}),
      client.consistentQuery(api.lab.list, {}),
    ]);
    this.oneShotResult.set({ identitySubject: plain.identity?.subject ?? null, latest: plain.latestLabel, consistentCount: consistent.length });
  }
}
