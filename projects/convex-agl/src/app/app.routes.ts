import { Routes } from '@angular/router';

const page = (title: string, load: () => Promise<unknown>) => ({ title, loadComponent: load as never });

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'todos' },
  { path: 'todos', ...page('Todos', () => import('./pages/todos').then((m) => m.TodosPage)) },
  { path: 'chat', ...page('Chat', () => import('./pages/chat').then((m) => m.ChatPage)) },
  { path: 'data', ...page('Data', () => import('./pages/data').then((m) => m.DataPage)) },
  { path: 'files', ...page('Files', () => import('./pages/files').then((m) => m.FilesPage)) },
  { path: 'notes', ...page('Notes', () => import('./pages/notes').then((m) => m.NotesPage)) },
  { path: 'jobs', ...page('Jobs', () => import('./pages/jobs').then((m) => m.JobsPage)) },
  { path: 'mail', ...page('Mail', () => import('./pages/mail').then((m) => m.MailPage)) },
  { path: 'system', ...page('System', () => import('./pages/system').then((m) => m.SystemPage)) },
];
