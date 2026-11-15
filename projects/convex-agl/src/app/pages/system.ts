import { Component } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { injectAction, injectConvexConnectionState, injectConvexHttpClient, injectMutation, injectQuery } from 'angular-convex';
import { api } from '../convex';
import { errorText } from '../shared/errors';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-system',
  imports: [JsonPipe],
  template: `
    <h1>System</h1>
    <section class="card">
      <h2>Connection state</h2>
      <pre data-testid="connection-state">{{ connection() | json }}</pre>
    </section>
    <section class="card">
      <h2><code>ctx.meta</code> (query)</h2>
      <pre data-testid="meta">{{ info() | json }}</pre>
    </section>
    <section class="card">
      <h2>Errors</h2>
      <div class="row">
        <button type="button" (click)="triggerError()" data-testid="trigger-error">Call a failing mutation</button>
        @if (fail.error(); as e) { <span class="error" data-testid="error-text">{{ text(e) }}</span> }
      </div>
    </section>
    <section class="card">
      <h2>Action calling an HTTP route · one-shot HTTP client</h2>
      <div class="row">
        <button type="button" (click)="ping.run()" data-testid="ping">Run action</button>
        <button class="ghost" type="button" (click)="oneShot()" data-testid="http-query">ConvexHttpClient query</button>
      </div>
      <pre data-testid="ping-result">{{ ping.data() | json }}</pre>
      <pre data-testid="http-result">{{ http | json }}</pre>
      <p class="muted">HTTP route: <a [href]="site + '/api/health'" target="_blank">{{ site }}/api/health</a></p>
    </section>
  `,
})
export class SystemPage {
  protected readonly site = environment.convexSiteUrl;
  protected readonly connection = injectConvexConnectionState();
  protected readonly info = injectQuery(api.system.info);
  protected readonly fail = injectMutation(api.system.fail);
  protected readonly ping = injectAction(api.system.ping);
  private readonly httpClient = injectConvexHttpClient();
  protected http: unknown;
  protected readonly text = errorText;

  protected triggerError(): void {
    this.fail({ message: 'Intentional failure from the demo' }).catch(() => undefined);
  }

  protected async oneShot(): Promise<void> {
    this.http = await this.httpClient.query(api.system.cronStat, {});
  }
}
