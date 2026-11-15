import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideConvex } from 'angular-convex';
import { provideConvexAuthClient } from 'angular-convex/convex-auth';
import { api } from './convex';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideConvex(environment.convexUrl),
    provideConvexAuthClient({ api: api.auth }),
  ],
};
