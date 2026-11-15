import { defineComponent } from "convex/server";

/**
 * A local stand-in for the `@convex-dev/resend` component.
 *
 * It has the same `lib.sendEmail` mutation signature, so Convex Auth and the
 * app can use it as their email sender, but it only records emails in its
 * `emails` table. The demo exposes that table as a fake inbox.
 */
export default defineComponent("resend");
