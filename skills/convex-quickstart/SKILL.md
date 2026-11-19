---
name: convex-quickstart
description: "Get a barebones Convex + Angular app (ngx-convex) running from a one-sentence idea."
---

<!-- Adapted from get-convex/agent-skills `convex-quickstart` @ `b32286cad1672916953ece2692535f72013f55d2`, Apache-2.0 © Convex, Inc. Changes: the Next.js recipe (fetched online) is replaced by explicit Angular CLI, ngx-convex and Convex CLI steps; the recipe rule is rewritten for those steps. The backend rules are unchanged. -->

# Quickstart: a barebones Convex + Angular app, running

Stand up a barebones Angular + Convex app from the idea, locally, with a dev deployment. Minimal by design: local dev servers, no publish step, no pre-baked auth.

## Workflow

1. **Create the Angular app** (skip if the user already has one): `npx @angular/cli@latest new <app> --defaults --ssr=false`, then `cd <app>`. On Node 20 use `@angular/cli@21` instead of `@latest`: Angular 22 needs Node 22.
2. **Install** `npm install ngx-convex convex`. On Node 20 install `convex@1.48`: later versions need Node 22.
3. **Start the backend once** to create the deployment: `npx convex dev --once` when `npx convex whoami` succeeds, and `CONVEX_AGENT_MODE=anonymous npx convex dev --once` ONLY when it does not. It writes `.env.local` (the deployment URL is `CONVEX_URL`) and `convex/_generated/`.
4. **Write the backend** from the idea under `convex/` (`schema.ts`, one module per feature), following the rules below and the `convex-expert` skill. Push with `npx convex dev --once` until it is clean: the push regenerates `convex/_generated/` from the schema, so run `npx tsc --noEmit -p convex` after it, not before (the root `tsconfig.json` is Angular's).
5. **Wire Angular** as the `convex-angular` skill describes: `ng generate environments`, put the `CONVEX_URL` value (a local deployment gives `http://127.0.0.1:<port>`: copy it, do not assume 3210) as `convexUrl` in both `src/environments/environment.ts` and `environment.development.ts` (`ng build` reads the first, `ng serve` the second), `provideConvex(environment.convexUrl)` in `src/app/app.config.ts`, then one component that lists data with `injectQuery` and adds an item with `injectMutation`, importing `api` from `convex/_generated/api` at the project root (`../../convex/_generated/api` from `src/app/`; `Id` comes from `convex/_generated/dataModel`). Replace the placeholder content of `app.html` and update `app.spec.ts` to match, so `ng test` still passes.
6. **Run it**: `npx convex dev` (keeps pushing backend changes) and `npx ng serve` in parallel; pass `--port <n>` when 4200 is taken. When it prints the dev URL, open it for the user. `npx ng build` must pass too; the default 500 kB initial-bundle warning is expected with the Convex client: raise `maximumWarning` in `angular.json` rather than ignore it.
7. Present a short plan and CONFIRM before building features beyond the template.

## Rules

- Never re-run steps 1–3 once they succeeded: `ng new` and the first `convex dev` are one-time.
- Never import `convex/react` in the Angular app; the client side is ngx-convex only.
- Delegate any code under `convex/` to the `convex-expert` capability.
- Don't add Postgres/Redis/Express — use Convex primitives.
- Don't add hosting/publish or pre-baked auth here — keep the template minimal unless the user asks for more.
- DEGRADATION RULE — if the scaffold cannot run (non-interactive session, no network, a sandboxed temp dir, or the user just wants code, not an app): skip the recipe and write a standard Convex project directly. ALL backend code goes under `convex/` (schema.ts, functions) — NEVER at the project root; Convex functions only run from the `convex/` directory. Write ZERO scaffold/documentation files (no START_HERE.md, ARCHITECTURE.md, MANIFEST.txt, README walls) unless explicitly asked. "Build me a backend" means code, not ceremony.
- Data access + imports — before writing any convex/*.ts: never an unbounded `.collect()` on a table that can grow — use `.withIndex(...)` and `.paginate(...)`/`.take(n)`. Use an index, not `.filter()`, for anything that would be a SQL WHERE. `.withIndex(...)` callbacks only have `eq`/`gt`/`gte`/`lt`/`lte` — there is no `.range(...)` method. Imports: `query`/`mutation`/`action`/`internalQuery`/`internalMutation`/`internalAction` come from `./_generated/server`; `api`/`internal` come from `./_generated/api`; NEVER import from `convex/server` in application code. `v.literal("exact value")` for fixed string/enum members, not a bare string. `"use node"` only at the top of action-only modules — never in a file that also exports a `query` or `mutation`. Never import a Node builtin (`crypto`/`fs`/`path`/`http`/`child_process`/`os`, with or without the `node:` prefix) into a file lacking `"use node"` — including `http.ts` route handlers; use Web Crypto (`crypto.subtle`) instead of `import`ing `crypto` where possible.
- Reserved names — never `export const <jsReservedWord> = ...` (e.g. `delete`, `new`, `class`, `function`, `return`) as a query/mutation/action export name; esbuild fails to parse it. Never a table or index name starting with `_` (e.g. `_migrations: defineTable(...)`) — `_` is reserved and errors at push as `TableNameReserved`/`IndexNameReserved`.
- HTTP routes — `httpRouter` has no Express-style `:param` segments (`path: "/users/:id"` only matches that literal string and is dead code); use `pathPrefix` and parse the trailing segment yourself. Every `http.route({...})` `handler:` must be wrapped in `httpAction(...)` from `./_generated/server` — a bare `async (ctx, request) => {...}` type-checks but isn't a valid HTTP action.
- `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` need a codegen'd function reference (`api.foo.bar`/`internal.foo.bar`), never a raw imported module member (`import * as queries from "./queries"; ctx.runQuery(queries.getX, ...)` compiles but fails at runtime).
- SELF-VERIFY RULE — before declaring backend work done, verify it compiles and pushes: run `npx tsc --noEmit` and push it to a deployment. Prefer the project's existing one; otherwise `npx convex dev --once` when `npx convex whoami` succeeds, and `CONVEX_AGENT_MODE=anonymous npx convex dev --once` ONLY when it does not. Forcing anonymous on a signed-in user rebinds `.env.local` and costs them the persistent, publishable cloud deployment they expect. Fix every error it reports before finishing — one verify round catches the wrong-relative-import / duplicate-symbol / unbalanced-paren class that otherwise breaks the deploy.
