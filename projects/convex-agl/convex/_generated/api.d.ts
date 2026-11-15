/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as idp from "../idp.js";
import type * as jobs from "../jobs.js";
import type * as lab from "../lab.js";
import type * as lib from "../lib.js";
import type * as mail from "../mail.js";
import type * as messages from "../messages.js";
import type * as node from "../node.js";
import type * as notes from "../notes.js";
import type * as presence from "../presence.js";
import type * as projects from "../projects.js";
import type * as system from "../system.js";
import type * as todos from "../todos.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  events: typeof events;
  files: typeof files;
  http: typeof http;
  idp: typeof idp;
  jobs: typeof jobs;
  lab: typeof lab;
  lib: typeof lib;
  mail: typeof mail;
  messages: typeof messages;
  node: typeof node;
  notes: typeof notes;
  presence: typeof presence;
  projects: typeof projects;
  system: typeof system;
  todos: typeof todos;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  authPasskey: import("@convex-dev/auth/components/passkey/_generated/component.js").ComponentApi<"authPasskey">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
  resend: import("../resend/_generated/component.js").ComponentApi<"resend">;
  demoAuth: import("../demoAuth/_generated/component.js").ComponentApi<"demoAuth">;
};
