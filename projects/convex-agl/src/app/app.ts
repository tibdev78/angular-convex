import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  ConvexAuthenticated,
  ConvexAuthLoading,
  ConvexAuthRefreshing,
  ConvexUnauthenticated,
  injectConvexConnectionState,
  injectPrewarmQuery,
  injectQuery,
} from 'angular-convex';
import { api } from './convex';
import { labSamples } from './shared/queries';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConvexAuthenticated, ConvexUnauthenticated, ConvexAuthLoading, ConvexAuthRefreshing],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly connection = injectConvexConnectionState();
  protected readonly me = injectQuery(api.users.me);
  private readonly prewarm = injectPrewarmQuery();
  /** Hovering a link subscribes to the page's first query, so it renders instantly. */
  protected warm(path: string): void {
    if (path === 'todos') this.prewarm(api.todos.list, { filter: 'all' });
    if (path === 'mail') this.prewarm(api.mail.inbox, {});
    if (path === 'lab') this.prewarm(labSamples.query, labSamples.args);
  }
  protected readonly links = [
    ['todos', 'Todos'],
    ['chat', 'Chat'],
    ['data', 'Data'],
    ['files', 'Files'],
    ['notes', 'Notes'],
    ['jobs', 'Jobs'],
    ['lab', 'Lab'],
    ['mail', 'Mail'],
    ['system', 'System'],
  ] as const;
}
