import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUserId } from "./lib/auth";

/**
 * Users module (Phase 1)
 *
 * Purpose:
 * - Provide a bootstrap mutation that ensures a users table row exists for the current identity.
 * - Provide a simple me query for UI debugging.
 */

type BootstrapErrorData = {
  code: "BOOTSTRAP_FAILED";
  message: string;
  hint?: string;
  details?: string;
};

function errorToDetails(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function hintForBootstrapError(err: unknown): string | undefined {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  // Common production misconfigurations / deploy issues:
  // - schema not deployed (missing table/index)
  // - wrong deployment URL (frontend points at a deployment without this schema)
  // - auth config missing in Convex env
  if (msg.includes("does not exist") && msg.includes("table")) {
    return [
      "Your Convex deployment appears to be missing the schema tables.",
      "Fix:",
      "- Deploy the backend functions + schema to this deployment (e.g. run `npx convex deploy`).",
      "- Ensure the web app is pointing at the same deployment URL you deployed to.",
      "- Verify `convex/schema.ts` defines the `users` table.",
    ].join("\n");
  }

  if (msg.includes("does not exist") && msg.includes("index")) {
    return [
      "Your Convex deployment appears to have an out-of-date schema (missing an index).",
      "Fix:",
      "- Deploy the backend schema updates to this deployment (e.g. `npx convex deploy`).",
      "- Confirm `users` has index `by_externalId` in `convex/schema.ts`.",
    ].join("\n");
  }

  if (msg.includes("missing clerk_jwt_issuer_domain")) {
    return [
      "Convex auth config is missing `CLERK_JWT_ISSUER_DOMAIN` in the Convex environment.",
      "Fix:",
      "- Set `CLERK_JWT_ISSUER_DOMAIN` to the Issuer URL from Clerk JWT template named `convex`.",
      "- Re-deploy Convex after setting the env var.",
    ].join("\n");
  }

  return undefined;
}

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await getOrCreateCurrentUserId(ctx);
      return { userId };
    } catch (err) {
      // Preserve existing ConvexError codes/data (e.g. AUTH_UNAUTHENTICATED, AUTH_USER_NOT_FOUND).
      if (err instanceof ConvexError) {
        throw err;
      }

      const hint = hintForBootstrapError(err);
      throw new ConvexError<BootstrapErrorData>({
        code: "BOOTSTRAP_FAILED",
        message:
          "users.bootstrap failed on the server. This is often caused by deploying the web app against the wrong Convex deployment URL, or by not deploying the latest Convex schema/functions to this deployment.",
        hint,
        details: errorToDetails(err),
      });
    }
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    // May return null if unauthenticated (unless you enable dev anon user mode).
    return await getCurrentUser(ctx);
  },
});
