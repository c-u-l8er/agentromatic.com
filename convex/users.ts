import { mutation, query } from "./_generated/server";
import { getCurrentUser, getOrCreateCurrentUserId } from "./lib/auth";

/**
 * Users module (Phase 1)
 *
 * Purpose:
 * - Provide a bootstrap mutation that ensures a users table row exists for the current identity.
 * - Provide a simple me query for UI debugging.
 */

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getOrCreateCurrentUserId(ctx);
    return { userId };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    // May return null if unauthenticated (unless you enable dev anon user mode).
    return await getCurrentUser(ctx);
  },
});
