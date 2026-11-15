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
| `convexQueryOptions` (a query reference and its args as one value) | `convexQueryOptions`, `injectQueryFromOptions`, `prewarmQueryFromOptions` | `app/shared/queries.ts`, `lab.ts`, `app.ts` (prewarm) | `query-options.spec`, `lab.spec` |
| `resetPaginationId` | not needed: see below | — | — |
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
| `defineApp`, `defineComponent`, calling a component | `convex/convex.config.ts`, `convex/resend/`, `convex/demoAuth/` | `features.spec` (mail), `auth.spec` (anonymous, demo OIDC) |
| `log.audit` with `log.vars` (`requestId`, `convexActor`, `ip`, `userAgent`, `now`) | `lab.ts` (`audit` mutation; `platform` action → `auditEvent` internal mutation; `auditEvents` table + `auditTrail` query) | `lab.spec`: recorded from a mutation and **from an action** through `ctx.runMutation` (a direct call in an action is refused by Convex: "Audit logging is not yet supported in actions"); both events appear in the live audit trail. Convex keeps `log.audit` durably only on Enterprise, so every event is also written to the `auditEvents` table, readable on any plan |
| `getServiceUrl`, `getServiceToken` (Convex-managed services) | `lab.ts` (`platform`) | `lab.spec`: the AI gateway URL everywhere. The token depends on the deployment: an anonymous local backend asks for `npx convex login`, a free-plan cloud team gets "The Convex AI gateway is not enabled for your team", a paid team gets the token. On a paid team, run the suite with `E2E_EXPECT_SERVICE_TOKEN=1` to require the token (not yet run: the demo team is on the free plan) |
| `schema.doc(table)`, `paginationOptsValidator`, `paginationResultValidator` | `lab.ts` | `lab.spec` |

## Server — database

| Convex | Demo | Test |
|---|---|---|
| `db.insert`, `db.patch`, `db.replace`, `db.delete`, `db.get` (with and without a table name) | `todos.ts`, `lab.ts` | `features.spec`, `lab.spec` |
| `db.table(name)` (`insert`, `patch`, `get`, `query`, `delete` scoped to one table) | `lab.ts` (`viaTable`) | `lab.spec` |
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
| `storage.getMetadata` (deprecated, still served) | `lab.ts` (`platform`) | `lab.spec` |
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
| OAuth (GitHub, Google, Apple, generic) | `injectSignInWithGithub`, `injectSignInWithGoogle`, `injectSignInWithApple`, `injectOauthSignIn`, `injectOauth` | `login.ts`; `convex/auth.ts` mounts `setupGithub`, `setupGoogle`, `setupApple` (components under `/oauth/<provider>`); `oauthProviders` query disables a provider whose variables are `not-configured` | `oauth.spec`; `auth.spec`: GitHub up to github.com, and the **full GitHub round trip** with a dedicated test account in `github-roundtrip.spec` (tag `@secrets`, no trace or report artifact; skipped without its secrets; `scripts/check-github-password.mjs` checks the account's password alone); Google up to accounts.google.com (redirect URI, PKCE S256, `openid` scope); both full flows were run by hand (account page shows the `google` method, name, email, avatar); Apple: the disabled state, and with variables set, the redirect to appleid.apple.com; the **whole** flow against the demo OIDC provider (consent, PKCE, `id_token`, return to the same account, denial → `ACCESS_DENIED`) |
| Custom methods (`bindMethod`, `ctx.convexAuth.completeSignUp` / `completeSignIn`) | — (server side) | `convex/auth.ts` (`anonymous`, `demoIdp`), `convex/idp.ts`, `convex/demoAuth/` | `auth.spec` |
| Anonymous sign-in (`signInAnonymously`) | `injectSignInAnonymously` | `login.ts` | `anonymous.spec`, `auth.spec` |
| `TokenStorage`, `InMemoryStorage` | re-exported | — | `provide-convex-auth-client.spec` |

## Dashboard features — from the CLI

[`scripts/dashboard-cli.sh`](scripts/dashboard-cli.sh) drives what the dashboard does through `npx convex`, against any deployment. CI runs it after the e2e suite and keeps its output with the evidence.

| Dashboard | CLI | Note |
|---|---|---|
| Data browser (tables, rows, component tables) | `convex data`, `convex data <table>`, `--component` | |
| Function runner, ad-hoc query | `convex run`, `convex run --inline-query` | |
| Function list | `convex function-spec` | |
| Import, export / snapshots | `convex import --append`, `convex export --path` | Adds two `events` rows; the export goes to a temporary directory. |
| Environment variables | `convex env list` | Names only. |
| Logs | `convex logs --history` | |
| Health insights | `convex insights` | Cloud deployments only. |

Screenshots of the cloud dashboard (functions, tables, crons) are in [`docs/screenshots/`](docs/screenshots).

## Notes

| Convex | Why there is no Angular counterpart |
|---|---|
| `resetPaginationId` | It resets a module-level counter used by React's `usePaginatedQuery` so test runs get stable ids. `angular-convex` keeps no such counter: paginated subscriptions belong to the `ConvexClient`. Tests isolate by creating a new `FakeConvexClient` (or calling `close()`), which drops every paginated listener. |
| Convex Auth's `setupAnonymous` and generic OAuth server setup | Shipped in `@convex-dev/auth` 2.0 but not exported. The demo builds the same methods with `bindMethod` (see above). |
| Sign in with Apple, live | Wired and tested up to Apple's authorize page. Signing in for real needs a paid Apple Developer account: set `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY` (they default to `not-configured`, which disables the button). |
