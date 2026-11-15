import { Routes } from '@angular/router';
import { authGuard } from './shared/auth-guard';

const page = (title: string, load: () => Promise<unknown>) => ({ title, loadComponent: load as never });
const auth = () => import('./pages/auth/email-links');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'todos' },
  // Public pages: sign-in, links from the auth emails, fake mailbox, diagnostics.
  { path: 'login', ...page('Sign in', () => import('./pages/auth/login').then((m) => m.LoginPage)) },
  { path: 'auth/validate-email', ...page('Confirm email', () => auth().then((m) => m.ValidateEmailPage)) },
  { path: 'auth/confirm-email-change', ...page('Confirm new email', () => auth().then((m) => m.ConfirmEmailChangePage)) },
  { path: 'auth/reset-password', ...page('Reset password', () => auth().then((m) => m.ResetPasswordPage)) },
  { path: 'mail', ...page('Mail', () => import('./pages/mail').then((m) => m.MailPage)) },
  { path: 'system', ...page('System', () => import('./pages/system').then((m) => m.SystemPage)) },
  // Signed-in pages.
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      { path: 'account', ...page('Account', () => import('./pages/auth/account').then((m) => m.AccountPage)) },
      { path: 'todos', ...page('Todos', () => import('./pages/todos').then((m) => m.TodosPage)) },
      { path: 'chat', ...page('Chat', () => import('./pages/chat').then((m) => m.ChatPage)) },
      { path: 'data', ...page('Data', () => import('./pages/data').then((m) => m.DataPage)) },
      { path: 'files', ...page('Files', () => import('./pages/files').then((m) => m.FilesPage)) },
      { path: 'notes', ...page('Notes', () => import('./pages/notes').then((m) => m.NotesPage)) },
      { path: 'jobs', ...page('Jobs', () => import('./pages/jobs').then((m) => m.JobsPage)) },
    ],
  },
];
