/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      clear: FunctionReference<"mutation", "internal", {}, number, Name>;
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          from: string;
          html?: string;
          subject?: string;
          text?: string;
          to: Array<string>;
        }>,
        Name
      >;
      sendEmail: FunctionReference<
        "mutation",
        "internal",
        {
          from: string;
          html?: string;
          options: {
            apiKey: string;
            initialBackoffMs: number;
            retryAttempts: number;
            testMode: boolean;
          };
          subject?: string;
          text?: string;
          to: Array<string>;
        },
        string,
        Name
      >;
    };
  };
