---
name: convex-angular
description: "Angular frontend for a Convex backend with ngx-convex: live queries as signals, mutations and actions with optimistic updates, pagination, file upload, connection state, SSR prefetch, the Convex Auth client, and tests with a fake client. Use for any Angular code (components, services, app.config.ts, specs) that reads or writes Convex data, and whenever a Convex guide, skill or example shows `convex/react` or `@convex-dev/auth/react` code to apply in an Angular app."
---

# Convex in Angular (ngx-convex)

The Angular counterpart of `convex/react`. Every React hook has an `inject*` function that returns signals; there are no services to write and no subscriptions to manage. Works on Angular 17.3 and later, zoneless or with zone.js, standalone APIs only.

The installed package is the reference: read `node_modules/ngx-convex/README.md`, and the types in `node_modules/ngx-convex/types/*.d.ts` when an option or a return shape matters. Never invent an API that is not there.

## Workflow

1. Install: `npm install ngx-convex convex` (plus `@convex-dev/auth @simplewebauthn/browser` for Convex Auth). On Node 20 pin `convex@1.48`: later versions need Node 22.
2. Provide the client once in `app.config.ts`: `provideConvex(url)`. The URL comes from the deployment (`.env.local` written by `npx convex dev`, `CONVEX_URL` / `VITE_CONVEX_URL`); put it in an Angular environment file or inject it at build time, never hard-code a production URL in a component.
3. Import function references from `convex/_generated/api` and pass them to the `inject*` functions. Types flow from the backend: do not annotate the result, do not cast.
4. Read data with `injectQuery`, write with `injectMutation` / `injectAction`, in a field initializer of a component, directive, service or route guard.
5. Render with the built-in control flow (`@if`, `@for … track`), reading the signals: `todos()`, `todos.isLoading()`, `todos.error()`.
6. Test with `ngx-convex/testing` (`FakeConvexClient`, `provideConvexTesting`, `flushEffects`), then run the app against the dev deployment.

## API map (Convex React → ngx-convex)

| Convex React | ngx-convex |
|---|---|
| `ConvexReactClient`, `<ConvexProvider>` | `provideConvex(url \| { url, options, client, ssr })`, `injectConvex()` |
| `useQuery(ref, args \| "skip")` | `injectQuery(ref, () => args \| 'skip', { initialValue, keepPreviousData, ssr, throwOnError })` |
| `useQueries` | `injectQueries(() => ({ key: { query, args } }))` |
| `usePaginatedQuery` | `injectPaginatedQuery(ref, () => args, { initialNumItems })` → `results`, `status`, `canLoadMore`, `loadMore(n)` |
| `useMutation(ref).withOptimisticUpdate(fn)` | `injectMutation(ref).withOptimisticUpdate(fn)` |
| `useAction` | `injectAction(ref, { onSuccess, onError })` |
| `useConvexConnectionState` | `injectConvexConnectionState()` |
| `ConvexProviderWithAuth`, `useConvexAuth` | `provideConvexAuth(() => ({ isLoading, isAuthenticated, fetchAccessToken }))`, `injectConvexAuth()` |
| `<Authenticated>` `<Unauthenticated>` `<AuthLoading>` | `*convexAuthenticated` `*convexUnauthenticated` `*convexAuthLoading` (and `*convexAuthRefreshing`) |
| `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`, `optimisticallyUpdateValueInPaginatedQuery` | same names, from `ngx-convex` |
| `prewarmQuery`, `convexQueryOptions` | `prewarmQuery`, `injectPrewarmQuery`, `convexQueryOptions`, `injectQueryFromOptions`, `prewarmQueryFromOptions` |
| `preloadQuery` + `usePreloadedQuery` | nothing to write: with SSR, queries are prefetched and handed over through `TransferState` |
| `ConvexHttpClient` (+ `setAuth`) | `injectConvexHttpClient()`, `await injectAuthenticatedHttpClient()()` |
| file upload by hand | `injectFileUpload(api.files.generateUploadUrl)` → `upload(file)`, `progress()` |
| RxJS | `fromConvexQuery(injectConvex(), ref, args)` |
| `ConvexAuthProvider` (`@convex-dev/auth/react`) | `provideConvexAuthClient({ api: api.auth })` from `ngx-convex/convex-auth` |
| `useAuthActions`, `useAuthToken` | `injectAuthActions()` (`signOut`, `setSession`), `injectAuthToken()`, `injectAuthState()` |
| Convex Auth method hooks (`useSignInWithUsernamePassword`, …) | the same names with `inject` (`injectSignInWithUsernamePassword(api.auth)`, …): see the `convex-auth` skill |

## Example

```ts
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [provideConvex(environment.convexUrl)],
};

// todos.ts
@Component({
  selector: 'app-todos',
  template: `
    @if (todos.isLoading()) { <p>Loading…</p> }
    @if (todos.error(); as e) { <p role="alert">{{ e.message }}</p> }
    <ul>
      @for (t of todos(); track t._id) { <li>{{ t.text }}</li> }
    </ul>
    <button (click)="save('New')" [disabled]="add.isPending()">Add</button>
  `,
})
export class Todos {
  readonly filter = signal<'all' | 'done'>('all');
  readonly todos = injectQuery(api.todos.list, () => ({ filter: this.filter() }), { keepPreviousData: true });
  readonly add = injectMutation(api.todos.add);

  async save(text: string) {
    await this.add({ text }); // rejects on failure; add.error() also holds it
  }
}
```

## Rules

- **Injection context.** `inject*` functions run where `inject()` is allowed: a field initializer, a constructor, a provider factory, or `runInInjectionContext`. Not in `ngOnInit`, an event handler or after an `await`. To create one later, pass `{ injector }` (captured with `inject(Injector)` in a field).
- **Reactive arguments are a function.** `() => ({ id: this.id() })` re-subscribes when the signals it reads change; a plain object is read once; a query without arguments takes none (`injectQuery(api.items.list)`). Return `'skip'` (or `skipToken`) to pause the query while an input is missing, never `undefined` args or an `if` around the injector.
- **No manual subscriptions.** Do not call `client.onUpdate`, wrap queries in `effect` + `set`, or copy a query into another signal: use the query signal directly, `computed` for derived values. The subscription ends with the injector that created it.
- **Undefined means loading.** A query signal is `undefined` until the first result; check `isLoading()` / `status()`, and use `initialValue` only for a real default. Read `error()`; set `throwOnError: true` only when an `ErrorHandler` or a `@defer` `@error` block is meant to catch it.
- **Mutations and actions are promises.** `await this.add(args)` rejects on failure; `isPending()`, `error()`, `data()` follow the latest call. Catch where the user needs feedback; never leave the promise floating without `onError`.
- **Optimistic updates** go through `withOptimisticUpdate((store, args) => …)` with `store.getQuery` / `store.setQuery`, and never mutate the array returned by `getQuery`: build a new one. For paginated lists use `insertAtTop` and friends.
- **Zoneless.** Every state ngx-convex exposes is a signal, so it renders without zone.js. Keep your own state written after an `await` in signals too, or the view will not update. Zoneless is the default from Angular 21 (`provideZonelessChangeDetection()` on 20, experimental before).
- **Auth.** With Convex Auth use `provideConvexAuthClient` (the `convex-auth` skill wires the server and the methods); with another identity provider use `provideConvexAuth`. Gate templates with `*convexAuthenticated` / `*convexUnauthenticated`; on the server, `ctx.auth.getUserIdentity()` stays the source of truth.
- **Never import `convex/react` or `@convex-dev/auth/react` in an Angular app**, and never port a React hook by hand: if an `inject*` counterpart seems missing, read the package README first.
- **Tests.** `new FakeConvexClient()`, `setQuery(ref, args, value)`, `onMutation(ref, handler)`, `provideConvexTesting(fake)` in `TestBed`, then `await flushEffects()` before asserting. `fake.calls` records mutations and actions. Do not mock `ConvexClient` yourself.
- **Done means** `ng build` passes, the specs pass, and the page shows live data from the dev deployment (a change made in the dashboard or by a mutation appears without reload).
