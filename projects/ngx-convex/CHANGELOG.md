# Changelog

## 0.1.0

Clean-code pass on the whole library. Nothing changes at runtime for an app that only uses the documented API; the breaking changes below touch exports that were internal or loosely typed.

### Breaking

- **Explicit public API.** The three entry points now list every export by name. Internal helpers that leaked through `export *` are gone:
  - `ngx-convex`: `toConvexQuery`, `postFile`, `createCall`, `CONVEX_AUTH_PROVIDER` (use `provideConvexAuth`).
  - `ngx-convex/convex-auth`: `authClientStorage`, `AuthClientStorage`, `EMAIL_PASSWORD_SECRET_STORAGE_KEYS`, `OAUTH_SETUP_ID`, `OAUTH_ACTIONS_KEY`, `OAUTH_FLOW_ERROR_KEY`.
- **`SignInEnvelopeLike` is replaced by `SignInEnvelope`**, the type of `@convex-dev/auth` itself, re-exported.
- **Function references are Convex's own types.** `QueryReference`, `MutationReference` and `ActionReference` accept both `FunctionReference` and `FunctionReference_future`; `ArgsOf` and `ReturnOf` are `FunctionArgs` and `FunctionReturnType` from `convex/server`. Convex Auth methods take `AuthMutationReference` (`FunctionReference<'mutation', 'public'>`), which is what `@convex-dev/auth` accepts.

### Fixed

- `injectQuery(api.x.y)` on a query declared without arguments no longer requires an argument object: the rule is Convex's (`EmptyArgs`).

### Added

- `flushEffects(rounds?)` in `ngx-convex/testing`: runs effects and change detection, then lets pending promises settle, on Angular 17 to latest.
- `EmptyArgs`, `AuthMutationReference` and `ConvexMutationApi` are exported.

### Internal

- No `as never` left in the library or its tests (50 before); `npm run typecheck:lib` checks the specs in CI, since the unit-test builder does not type-check.
- Sign-in flows share one `runSignIn` (no `tokens!` assertion); `email-password` and the passkey ceremonies are split by responsibility.

## 0.0.1

First release.
