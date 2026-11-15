import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { injectConvexConnectionState } from 'angular-convex';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly connection = injectConvexConnectionState();
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
