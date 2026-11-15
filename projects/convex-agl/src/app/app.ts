import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConvexAuthenticated, ConvexAuthLoading, ConvexUnauthenticated, injectConvexConnectionState, injectQuery } from 'angular-convex';
import { api } from './convex';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConvexAuthenticated, ConvexUnauthenticated, ConvexAuthLoading],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly connection = injectConvexConnectionState();
  protected readonly me = injectQuery(api.users.me);
  protected readonly links = [
    ['todos', 'Todos'],
    ['chat', 'Chat'],
    ['data', 'Data'],
    ['files', 'Files'],
    ['notes', 'Notes'],
    ['jobs', 'Jobs'],
    ['mail', 'Mail'],
    ['system', 'System'],
  ] as const;
}
