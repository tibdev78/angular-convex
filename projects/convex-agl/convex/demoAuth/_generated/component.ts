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
      claimRequest: FunctionReference<
        "mutation",
        "internal",
        { stateHash: string },
        { codeVerifier: string; redirectTo: string } | null,
        Name
      >;
      claimTicket: FunctionReference<
        "mutation",
        "internal",
        { stateHash: string; ticketHash: string },
        {
          email: string;
          emailVerified: boolean;
          name: string;
          sub: string;
        } | null,
        Name
      >;
      createAccessToken: FunctionReference<
        "mutation",
        "internal",
        {
          profile: {
            email: string;
            emailVerified: boolean;
            name: string;
            sub: string;
          };
          tokenHash: string;
        },
        null,
        Name
      >;
      createAccount: FunctionReference<
        "mutation",
        "internal",
        { provider: string; subject: string; userId: string },
        null,
        Name
      >;
      createCode: FunctionReference<
        "mutation",
        "internal",
        {
          clientId: string;
          codeChallenge: string;
          codeHash: string;
          profile: {
            email: string;
            emailVerified: boolean;
            name: string;
            sub: string;
          };
          redirectUri: string;
        },
        null,
        Name
      >;
      createRequest: FunctionReference<
        "mutation",
        "internal",
        { codeVerifier: string; redirectTo: string; stateHash: string },
        null,
        Name
      >;
      createTicket: FunctionReference<
        "mutation",
        "internal",
        {
          profile: {
            email: string;
            emailVerified: boolean;
            name: string;
            sub: string;
          };
          stateHash: string;
          ticketHash: string;
        },
        null,
        Name
      >;
      getAccount: FunctionReference<
        "query",
        "internal",
        { provider: string; subject: string },
        string | null,
        Name
      >;
      redeemCode: FunctionReference<
        "mutation",
        "internal",
        { codeHash: string },
        {
          clientId: string;
          codeChallenge: string;
          profile: {
            email: string;
            emailVerified: boolean;
            name: string;
            sub: string;
          };
          redirectUri: string;
        } | null,
        Name
      >;
      userInfo: FunctionReference<
        "query",
        "internal",
        { tokenHash: string },
        {
          email: string;
          emailVerified: boolean;
          name: string;
          sub: string;
        } | null,
        Name
      >;
    };
  };
