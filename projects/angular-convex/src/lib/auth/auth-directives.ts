import { Directive, effect, inject, TemplateRef, ViewContainerRef } from '@angular/core';
import { ConvexAuthService, type ConvexAuthState } from './convex-auth';

function renderWhen(predicate: (state: ConvexAuthState) => boolean): void {
  const auth = inject(ConvexAuthService);
  const template = inject(TemplateRef);
  const container = inject(ViewContainerRef);
  let shown = false;
  effect(() => {
    const visible = predicate(auth.state());
    if (visible && !shown) container.createEmbeddedView(template);
    if (!visible && shown) container.clear();
    shown = visible;
  });
}

/** Renders its content only when signed in to Convex (React `<Authenticated>`). */
@Directive({ selector: '[convexAuthenticated]', standalone: true })
export class ConvexAuthenticated {
  constructor() {
    renderWhen((s) => !s.isLoading && s.isAuthenticated);
  }
}

/** Renders its content only when signed out (React `<Unauthenticated>`). */
@Directive({ selector: '[convexUnauthenticated]', standalone: true })
export class ConvexUnauthenticated {
  constructor() {
    renderWhen((s) => !s.isLoading && !s.isAuthenticated);
  }
}

/** Renders its content while the auth state is being resolved (React `<AuthLoading>`). */
@Directive({ selector: '[convexAuthLoading]', standalone: true })
export class ConvexAuthLoading {
  constructor() {
    renderWhen((s) => s.isLoading);
  }
}

/** Renders its content while a token refresh is in flight (React `<AuthRefreshing>`). */
@Directive({ selector: '[convexAuthRefreshing]', standalone: true })
export class ConvexAuthRefreshing {
  constructor() {
    renderWhen((s) => s.isRefreshing);
  }
}
