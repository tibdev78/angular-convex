# Coverage of Convex 1.50 and Convex Auth 2.0

This file maps every public feature of `convex@1.50` and `@convex-dev/auth@2.0` to its place in this repository:

- the **library** API that exposes it to Angular;
- the **demo** file that uses it (`app/` is `projects/convex-agl/src/app`, `convex/` is `projects/convex-agl/convex`);
- the **test** that proves it works.

Unit tests are the library's Vitest specs (`*.spec.ts` next to the code). E2e tests are the Playwright specs in [`e2e/`](e2e), and each one saves a screenshot of every step.

## Client — `convex/react` and `convex/browser`

| Convex | angular-convex | Demo | Test |
|---|---|---|---|
| `ConvexReactClient`, `ConvexProvider`, `useConvex` | `provideConvex`, `injectConvex` | `app/app.config.ts` | `provide-convex` (via every spec), all e2e |
| `ConvexClient` options (`skipConvexDeploymentUrlCheck`, `unsavedChangesWarning`, …) | `provideConvex({ url, options })` | `app/app.config.ts` | compat matrix |
| `useQuery`, `"skip"` | `injectQuery`, `skipToken` | every page; `lab.ts` (`normalize` skipped until typed) | `inject-query.spec`, `lab.spec` |
| `useQuery_experimental` (throw on error) | `injectQuery(…, { throwOnError: true })` | `lab.ts` | `inject-query.spec`, `lab.spec` |
| `useQueries` | `injectQueries` | `todos.ts` (per-project stats) | `inject-queries.spec`, `features.spec` (todos) |
| `usePaginatedQuery`, `usePaginatedQuery_experimental` | `injectPaginatedQuery` (`throwOnError` too) | `data.ts`, `chat.ts`, `lab.ts` | `inject-query.spec`, `features.spec` (data), `lab.spec` |
| `useMutation`, `withOptimisticUpdate` | `injectMutation(…).withOptimisticUpdate` | `todos.ts` | `inject-mutation.spec`, `features.spec` (todos) |
| `useAction` | `injectAction` | `notes.ts`, `system.ts`, `lab.ts` | `inject-mutation.spec`, `features.spec`, `lab.spec` |
| `insertAtTop`, `insertAtBottomIfLoaded`, `insertAtPosition`, `optimisticallyUpdateValueInPaginatedQuery` | same names | `chat.ts` | `paginated.spec` |
| `prewarmQuery` | `prewarmQuery`, `injectPrewarmQuery` | `app.ts` (nav links) | `inject-query.spec` |
| `useConvexConnectionState`, `ConvexClient.subscribeToConnectionState` | `injectConvexConnectionState` | `system.ts` | `inject-connection-state.spec`, `features.spec` (system) |
| `ConvexProviderWithAuth`, `useConvexAuth`, `ConvexClient.setAuth` | `provideConvexAuth`, `injectConvexAuth` | `app.config.ts` (through Convex Auth) | `convex-auth.spec`, `auth.spec` |
| `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>`, `<AuthRefreshing>` | `*convexAuthenticated`, `*convexUnauthenticated`, `*convexAuthLoading`, `*convexAuthRefreshing` | `app.ts` | `convex-auth.spec` |
| Access token for your own `fetch` | `injectFetchAccessToken` | `lab.ts` (CORS upload) | `convex-auth.spec`, `lab.spec` |
| `ConvexHttpClient` (`query`, `mutation`, `action`) | `injectConvexHttpClient` | `system.ts` | `features.spec` (system) |
| `ConvexHttpClient.setAuth`, `consistentQuery` | `injectAuthenticatedHttpClient` | `lab.ts` | `convex-auth.spec`, `lab.spec` |
| `ConvexClient.onUpdate`, `onPaginatedUpdate_experimental` | used inside `injectQuery` / `injectPaginatedQuery`; `fromConvexQuery` for RxJS | — | `inject-query.spec` |
| `preloadQuery` + `usePreloadedQuery` | SSR prefetch through `TransferState` (`provideConvex({ ssr })`) | — | `inject-query.spec` (SSR) |
| File upload with `generateUploadUrl` | `injectFileUpload` (progress signal) | `files.ts`, `chat.ts` | `features.spec` (files, chat) |

## Values — `convex/values`

| Convex | Demo | Test |
|---|---|---|
| `v.id`, `v.string`, `v.number` / `v.float64`, `v.boolean`, `v.null`, `v.literal`, `v.union`, `v.array`, `v.object`, `v.optional` | `convex/schema.ts`, every module | all e2e |
| `v.int64` (bigint above 2⁵³), `v.bytes` (ArrayBuffer), `v.record`, `v.any`, `v.nullable` | `convex/lab.ts`, `app/pages/lab.ts` | `lab.spec` |
| `v.commitTs` with `ctx.db.vars.commitTs`, `v.function` (stored function handle) | `convex/lab.ts` | `lab.spec` |
| `ConvexError` with typed data | `convex/lib.ts`, `todos.ts`, `lab.ts` (`boom`) | `features.spec` (system), `lab.spec` |
| `getDocumentSize` | `convex/lab.ts` (`list`) | `lab.spec` |

## Server — functions and context

| Convex | Demo | Test |
|---|---|---|
| `query`, `mutation`, `action` with `args` and `returns` validators | every module; `returns` in `lab.ts`, `users.ts` | all e2e |
| `internalQuery`, `internalMutation`, `internalAction` | `lab.ts`, `notes.ts`, `node.ts`, `system.ts` | `lab.spec`, `features.spec` |
| `"use node"` runtime (`node:crypto`) | `convex/node.ts` | `lab.spec` (digest) |
| `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` | `notes.ts`, `mail.ts`, `lab.ts` | `features.spec` (notes, mail), `lab.spec` |
| `runQuery` options `transactionLimits`, `useStaleSnapshot` | `lab.ts` (`nested`) | `lab.spec` |
| `ctx.meta` | `system.ts` | `features.spec` (system) |
| `ctx.auth.getUserIdentity` | `lab.ts`, `http.ts` | `lab.spec` |
| Typed `env` from `_generated/server` | `convex/auth.ts` (`SITE_URL`) | `auth.spec` (emailed links) |
| `createFunctionHandle`, scheduling a handle | `lab.ts` (`bumpLater`) | `lab.spec` |
| `httpRouter`, `httpAction`, `pathPrefix`, CORS preflight, bearer auth | `convex/http.ts` | `lab.spec`, `features.spec` (system) |
| `defineApp`, `defineComponent`, calling a component | `convex/convex.config.ts`, `convex/resend/` | `features.spec` (mail) |
| `schema.doc(table)`, `paginationOptsValidator`, `paginationResultValidator` | `lab.ts` | `lab.spec` |

## Server — database

| Convex | Demo | Test |
|---|---|---|
| `db.insert`, `db.patch`, `db.replace`, `db.delete`, `db.get` (with and without a table name) | `todos.ts`, `lab.ts` | `features.spec`, `lab.spec` |
| `db.normalizeId` | `lab.ts` | `lab.spec` |
| `withIndex` with `eq`, `gte`, `lt` ranges; `order`; `first`, `unique`, `take`, `collect`, `paginate` | `events.ts`, `lab.ts`, `todos.ts` | `features.spec` (data), `lab.spec` |
| Async iteration (`for await` over a query) | `lab.ts` (`overview`) | `lab.spec` |
| `filter` with `q.and`, `q.or`, `q.neq`, `q.field` | `events.ts`, `lab.ts` | `features.spec` (data), `lab.spec` |
| Search index (`withSearchIndex`, filter fields) | `todos.ts`, `messages.ts` | `features.spec` (todos, chat) |
| Vector index (`ctx.vectorSearch`) | `notes.ts` | `features.spec` (notes) |
| `db.system.get` / `db.system.query` on `_storage` and `_scheduled_functions` | `files.ts`, `jobs.ts`, `lab.ts` | `features.spec` (files, jobs), `lab.spec` |
| Batched writes (1,000 rows over several mutations) | `events.ts` | `features.spec` (data) |

## Server — storage, scheduler, crons

| Convex | Demo | Test |
|---|---|---|
| `storage.generateUploadUrl`, `getUrl`, `delete` | `files.ts`, `messages.ts` | `features.spec` (files, chat) |
| `storage.store`, `storage.get` (from an action and an HTTP action) | `lab.ts` (`digest`), `http.ts` | `lab.spec` |
| `scheduler.runAfter`, `scheduler.runAt`, `scheduler.cancel` | `jobs.ts`, `mail.ts`, `lab.ts` | `features.spec` (jobs, mail), `lab.spec` |
| `crons.interval`, `crons.cron`, `hourly`, `daily`, `weekly`, `monthly` | `convex/crons.ts` | `features.spec` (jobs counter), `lab.spec` (stats) |

## Convex Auth 2.0 — `angular-convex/convex-auth`

| Convex Auth | angular-convex | Demo | Test |
|---|---|---|---|
| `ConvexAuthProvider`, token storage, OAuth redirect completion | `provideConvexAuthClient` | `app.config.ts` | `provide-convex-auth-client.spec` |
| `useAuthActions` (`signOut`), `useAuthToken` | `injectAuthActions`, `injectAuthToken`, `injectAuthState` | `account.ts` | `auth.spec` |
| Username + password (sign up, sign in, change password) | `injectSignUpWithUsernamePassword`, `injectSignInWithUsernamePassword` | `login.ts`, `account.ts` | `password.spec`, `auth.spec` |
| Email + password (verification link, recovery, change email) | `injectSignUpWithEmailPassword`, `injectSignInWithEmailPassword`, `injectStartPasswordRecovery`, `injectStartChangeEmail`, `injectComplete…` | `login.ts`, email link pages | `password.spec`, `auth.spec` |
| Passkeys (autofill, add, remove) | `injectSignInWithUsernamePasskey`, `injectAddPasskey`, `injectRemovePasskey`, `supportsWebAuthn` | `login.ts`, `account.ts` | `passkey.spec`, `auth.spec` (virtual authenticator) |
| OAuth (GitHub, Google, Apple, generic) | `injectSignInWithGithub`, `injectSignInWithGoogle`, `injectSignInWithApple`, `injectOauthSignIn`, `injectOauth` | `login.ts` (GitHub) | `oauth.spec`, `auth.spec` (up to github.com; the full flow was tested by hand) |
| `TokenStorage`, `InMemoryStorage` | re-exported | — | `provide-convex-auth-client.spec` |

## Not covered, on purpose

| Convex | Why |
|---|---|
| `resetPaginationId` | Only resets an internal counter for React tests; `FakeConvexClient` does not need it. |
| `convexQueryOptions` (TanStack Query) | Framework-neutral already; import it from `convex` if you use TanStack Query for Angular. |
| `db.table()` | Declared in the 1.50 types, but missing from the runtime (`database_impl`). The demo uses `db.get/patch/replace/delete(table, id)` instead. |
| `log.audit` | Convex Enterprise only. |
| `getServiceToken`, `getServiceUrl` | For Convex-managed services (AI gateway); not available on a self-serve deployment. |
| `storage.getMetadata` | Deprecated; the demo reads `_storage` with `db.system.get`. |
| Dashboard-only features (logs, data editor, deploy keys) | No client API. The dashboard screenshots are in [`docs/screenshots/`](docs/screenshots). |
