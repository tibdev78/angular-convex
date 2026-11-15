import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vIdpProfile = v.object({ sub: v.string(), name: v.string(), email: v.string(), emailVerified: v.boolean() });

export default defineSchema({
  /** Identity (method + subject) → app user id. */
  accounts: defineTable({ provider: v.string(), subject: v.string(), userId: v.string() }).index("by_subject", ["provider", "subject"]),
  /** A started sign-in: what the callback needs, keyed by the hash of `state`. */
  requests: defineTable({ stateHash: v.string(), redirectTo: v.string(), codeVerifier: v.string(), expiresAt: v.number() }).index("by_state", ["stateHash"]),
  /** Authorization codes issued by the demo IdP. */
  codes: defineTable({
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    profile: vIdpProfile,
    expiresAt: v.number(),
  }).index("by_code", ["codeHash"]),
  /** Access tokens issued by the demo IdP, for its userinfo endpoint. */
  accessTokens: defineTable({ tokenHash: v.string(), profile: vIdpProfile, expiresAt: v.number() }).index("by_token", ["tokenHash"]),
  /** One-time tickets the callback hands to the app (`?convexAuthCode=`). */
  tickets: defineTable({ ticketHash: v.string(), stateHash: v.string(), profile: vIdpProfile, expiresAt: v.number() }).index("by_ticket", ["ticketHash"]),
});
