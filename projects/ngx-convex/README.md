# ngx-convex

[![npm](https://img.shields.io/npm/v/ngx-convex)](https://www.npmjs.com/package/ngx-convex)

Angular bindings for [Convex](https://convex.dev): live queries as **signals**, mutations and actions with optimistic updates, pagination, file storage, connection state, SSR prefetch, and the full **Convex Auth 2.0** client (password, email links, passkeys, OAuth). Nothing from React is involved.

- Angular **17.3 → 22**, zoneless or zone.js, standalone APIs only (`inject*` functions, no decorators to learn).
- `convex` **≥ 1.48**. Every Convex React hook has an Angular counterpart (see the table below).
- Tested against a real deployment on every supported Angular major (see *Compatibility*).

```bash
npm install ngx-convex convex
# optional, for Convex Auth:
npm install @convex-dev/auth @simplewebauthn/browser
```

## Setup

```ts
// app.config.ts
import { provideConvex } from 'ngx-convex';
import { provideConvexAuthClient } from 'ngx-convex/convex-auth'; // only with Convex Auth
import { api } from '../convex/_generated/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideConvex('https://<deployment>.convex.cloud'),
    provideConvexAuthClient({ api: api.auth }),
  ],
};
```

`provideConvex(url | { url, options, client, ssr })` creates one `ConvexClient` per environment injector and closes it when the injector is destroyed. On the server no WebSocket is opened.

## Queries

```ts
@Component({
  template: `
    @if (todos.isLoading()) { Loading… }
    @for (t of todos(); track t._id) { <li>{{ t.text }}</li> }
    @if (todos.error(); as e) { <p>{{ e.message }}</p> }
  `,
})
export class Todos {
  readonly filter = signal<'all' | 'done'>('all');
  // Arguments can read signals: the subscription follows them. Return 'skip' to pause.
  readonly todos = injectQuery(api.todos.list, () => ({ filter: this.filter() }), { keepPreviousData: true });
  readonly me = injectQuery(api.users.me);
}
```

A `ConvexQuery<T>` is a `Signal<T | undefined>` with `data`, `error`, `status` (`pending | success | error | skipped`), `isLoading`, `isSuccess`, `isError` and `isSkipped`. Options: `initialValue`, `keepPreviousData`, `ssr`, `throwOnError`, `injector`. With `throwOnError: true`, reading the signal throws the query's error, like `useQuery_experimental` in React; catch it in a `computed` or let an error handler take it.

| Need | API |
|---|---|
| Many dynamic queries (`useQueries`) | `injectQueries(() => ({ a: { query, args }, … }))` |
| Pagination (`usePaginatedQuery`) | `injectPaginatedQuery(api.events.list, () => ({ kind }), { initialNumItems: 25 })` exposes `results`, `status`, `canLoadMore` and `loadMore(n)` |
| Warm the cache before navigating | `prewarmQuery(ref, args)` in an injection context, or `const prewarm = injectPrewarmQuery(); prewarm(ref, args)` |
| A query and its args as one shareable value | `const todos = convexQueryOptions({ query: api.todos.list, args: {} })`, then `injectQueryFromOptions(todos)` or `prewarmQueryFromOptions(todos)` |
| RxJS | `fromConvexQuery(injectConvex(), ref, args)` returns an `Observable` |
| One-shot HTTP call | `injectConvexHttpClient()` (anonymous, shared) |
| One-shot HTTP call as the signed-in user, `consistentQuery` | `const client = await injectAuthenticatedHttpClient()()` |
| Token for your own `fetch` (HTTP actions) | `const token = await injectFetchAccessToken()?.()` |
| Raw client | `injectConvex()` |

## Mutations and actions

```ts
readonly add = injectMutation(api.todos.add).withOptimisticUpdate((store, { text }) => {
  const list = store.getQuery(api.todos.list, { filter: 'all' });
  if (list) store.setQuery(api.todos.list, { filter: 'all' }, [{ _id: 'tmp', text, done: false }, ...list]);
});
readonly ping = injectAction(api.system.ping, { onError: (e) => console.error(e) });

async save(text: string) {
  await this.add({ text }); // rejects on failure; add.isPending(), add.error() and add.data() follow along
}
```

For paginated optimistic updates, use `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition` and `optimisticallyUpdateValueInPaginatedQuery`. These are the same helpers as `convex/react`.

## Files

```ts
readonly upload = injectFileUpload(api.files.generateUploadUrl);
async onFile(file: File) {
  const storageId = await this.upload.upload(file); // upload.progress() goes 0 → 1
  await this.saveImage({ storageId });
}
```

## Connection and auth state

- `injectConvexConnectionState()` returns a signal of the client's `ConnectionState`.
- `injectConvexAuth()` returns `isLoading`, `isAuthenticated` and `isRefreshing` signals.
- Structural directives: `*convexAuthenticated`, `*convexUnauthenticated`, `*convexAuthLoading` and `*convexAuthRefreshing`.
- To use another identity provider (Auth0, Clerk…), call `provideConvexAuth(() => ({ isLoading, isAuthenticated, fetchAccessToken }))`. It is the equivalent of `ConvexProviderWithAuth`.

## Convex Auth 2.0 — `ngx-convex/convex-auth`

`provideConvexAuthClient({ api: api.auth })` is the equivalent of `<ConvexAuthProvider>`. It restores the stored session, feeds the token to the Convex client and finishes OAuth redirects on page load.

| Method | Injectors |
|---|---|
| Username + password | `injectSignUpWithUsernamePassword`, `injectSignInWithUsernamePassword` |
| Email + password | `injectSignUpWithEmailPassword`, `injectSignInWithEmailPassword`, `injectStartPasswordRecovery`, `injectStartChangeEmail` |
| Email links (routes) | `injectCompleteSignUpWithEmailPassword`, `injectCompletePasswordRecovery`, `injectCompleteChangeEmail` (take `{ emailCode: () => code }`) |
| Passkeys | `injectSignInWithUsernamePasskey` (with autofill), `injectAddPasskey`, `injectRemovePasskey`, `supportsWebAuthn()` |
| OAuth | `injectSignInWithGithub`, `injectSignInWithGoogle`, `injectSignInWithApple`, `injectOauthSignIn(refs)` for any provider exporting the two OAuth mutations, `injectOauth().flowError` |
| Anonymous | `injectSignInAnonymously(api.auth)` (`signIn`, `pending`) |
| Session | `injectAuthActions()` (`signOut`, `setSession`), `injectAuthState()`, `injectAuthToken()` |

```ts
readonly signIn = injectSignInWithUsernamePassword(api.auth);
const result = await this.signIn.signIn({ username, password });
// signIn.pending() and signIn.userError() are signals; expected failures are returned as `userError` and never thrown
```

Each method needs its server side in `convex/auth.ts`, as described in the Convex Auth docs. The demo's [`convex/auth.ts`](../convex-agl/convex/auth.ts) wires all six methods, including two custom ones (anonymous, and an OpenID Connect provider) built with Convex Auth's `bindMethod`.

## Testing — `ngx-convex/testing`

```ts
const convex = new FakeConvexClient();
convex.setQuery(api.todos.list, {}, [{ _id: '1', text: 'a' }]);
convex.onMutation(api.todos.add, ({ text }) => 'new-id');
TestBed.configureTestingModule({ providers: [provideConvexTesting(convex)] });
// convex.calls records every mutation/action; setQueryError, setPaginatedItems, setPaginatedError and setConnectionState are also available
```

## Convex React → ngx-convex

| Convex React | ngx-convex |
|---|---|
| `ConvexReactClient`, `ConvexProvider` | `provideConvex`, `injectConvex` |
| `useQuery` (+ `"skip"`) | `injectQuery` |
| `useQuery_experimental`, `usePaginatedQuery_experimental` | `{ throwOnError: true }` |
| `useQueries` | `injectQueries` |
| `usePaginatedQuery` | `injectPaginatedQuery` |
| `useMutation` + `withOptimisticUpdate` | `injectMutation` |
| `useAction` | `injectAction` |
| `useConvexConnectionState` | `injectConvexConnectionState` |
| `ConvexProviderWithAuth`, `useConvexAuth` | `provideConvexAuth`, `injectConvexAuth` |
| `<Authenticated>` `<Unauthenticated>` `<AuthLoading>` | `*convexAuthenticated` `*convexUnauthenticated` `*convexAuthLoading` |
| `insertAtTop` / `insertAtBottomIfLoaded` / `insertAtPosition` / `optimisticallyUpdateValueInPaginatedQuery` | same names |
| `prewarmQuery` | `prewarmQuery`, `injectPrewarmQuery` |
| `convexQueryOptions` | `convexQueryOptions`, `injectQueryFromOptions`, `prewarmQueryFromOptions` |
| `resetPaginationId` | not needed (no module-level pagination counter) |
| `preloadQuery` + `usePreloadedQuery` | SSR prefetch via `TransferState` (automatic) |
| `ConvexAuthProvider`, `useAuthActions`, `useAuthToken` | `provideConvexAuthClient`, `injectAuthActions`, `injectAuthToken` |
| `ConvexHttpClient` + `setAuth` | `injectAuthenticatedHttpClient` |

The feature-by-feature map, with the demo file and test for each, is in [COVERAGE.md](../../COVERAGE.md).

## Compatibility

Each row is built from the packed tarball in a fresh `ng new` app. The app is then run against a live deployment, which checks that the WebSocket connects, then a query, a sign-up, a mutation and an action.

| Angular | Node | convex | TypeScript |
|---|---|---|---|
| 17.3 | 20 | 1.48 | 5.4 |
| 18 | 20 | 1.48 | 5.5 |
| 19 | 20 | 1.48 | 5.7 |
| 20 | 20 | 1.48 | 5.9 |
| 21 | 20 · 24 | 1.48 · 1.50 | 5.9 |
| 22 | 22 · 24 | 1.50 | 6.0 |

`convex` 1.49 and later require Node 22, so stay on `convex@1.48` while you build on Node 20.

## Notes

- **Pagination on an empty table.** Convex keeps the range a page was first read with. A first page read while the table was empty stays open-ended and grows with every insert. This is Convex behaviour, the same as in React. A fresh subscription paginates normally.
- **Zoneless apps.** Every state the library exposes is a signal. Keep your own state written after an `await` in signals too.

MIT licensed.
