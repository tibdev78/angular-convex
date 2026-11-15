import { Directive, effect, inject, TemplateRef, untracked, ViewContainerRef } from '@angular/core';
import { ConvexAuthService, type ConvexAuthState } from './convex-auth';

function renderWhen(predicate: (state: ConvexAuthState) => boolean): void {
  const auth = inject(ConvexAuthService);
  const template = inject(TemplateRef);
  const container = inject(ViewContainerRef);
  let shown = false;
  effect(() => {
    const visible = predicate(auth.state());
    if (visible === shown) return;
    shown = visible;
    // Untracked: signals read while building the child view must not become
    // dependencies of this effect (nor count as writes inside it on Angular < 19).
    untracked(() => (visible ? container.createEmbeddedView(template) : container.clear()));
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
