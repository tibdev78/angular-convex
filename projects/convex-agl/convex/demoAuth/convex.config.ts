import { defineComponent } from "convex/server";

/**
 * Storage for the demo's two custom sign-in methods (see ../auth.ts):
 *
 * - **anonymous**: one account per sign-in, no credentials;
 * - **demo OIDC**: an OpenID Connect provider served by the demo's own HTTP
 *   routes (../idp.ts), so the whole OAuth authorization-code flow runs, and
 *   is tested end to end, without a third-party account.
 *
 * Convex Auth records this component as the one that authenticated the user.
 */
export default defineComponent("demoAuth");
