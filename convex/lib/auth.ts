import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Auth helpers
 *
 * Purpose:
 * - Map the authenticated principal (Convex identity) to an internal `users` table record
 * - Provide "require" helpers that fail fast when unauthenticated
 *
 * Assumptions:
 * - `users.externalId` stores a stable external auth user identifier.
 *   For most providers (including Clerk), `identity.subject` is a stable unique user id.
 *
 * Notes:
 * - These helpers do NOT implement team membership/authorization checks. They only ensure
 *   we can identify (and create) a `users` row for the current identity.
 * - For local development before auth is wired, you can enable an anonymous dev user:
 *   set `AGENTROMATIC_DEV_ANON_USER=true` in your Convex environment variables.
 */

export type AnyAuthedCtx = Pick<QueryCtx | MutationCtx | ActionCtx, "auth">;

/**
 * Convex context typing notes:
 * - Queries have a read-only DB (`DatabaseReader`).
 * - Mutations have a read/write DB (`DatabaseWriter`).
 * - Actions do not have `db` (they call queries/mutations via `runQuery`/`runMutation`).
 *
 * Therefore, any helper that may `insert`/`patch` must gracefully handle being
 * called from a query context (read-only) vs mutation context (read/write).
 */
export type QueryAuthedCtx = Pick<QueryCtx, "auth" | "db">;
export type MutationAuthedCtx = Pick<MutationCtx, "auth" | "db">;

/**
 * Union of "DB-bearing" contexts we support in this file.
 * (Actions are excluded because they don't have `db`.)
 */
export type AnyAuthedDbCtx = QueryAuthedCtx | MutationAuthedCtx;

type ConvexIdentity = NonNullable<
  Awaited<ReturnType<AnyAuthedCtx["auth"]["getUserIdentity"]>>
>;

export class AuthError extends Error {
  readonly name = "AuthError";
}

function nowMs(): number {
  return Date.now();
}

function isDevAnonymousUserModeEnabled(): boolean {
  // Convex supports environment variables; for local dev you can set this via "npx convex env set".
  // Keep this OFF by default. Never enable in production.
  const env = (globalThis as any)?.process?.env as Record<string, string | undefined> | undefined;
  return env?.AGENTROMATIC_DEV_ANON_USER === "true";
}

type DbReader = QueryCtx["db"];
type DbWriter = MutationCtx["db"];

function isDbWriter(db: DbReader | DbWriter): db is DbWriter {
  // Convex writers have `insert/patch/delete`. Readers do not.
  return (
    typeof (db as any).insert === "function" &&
    typeof (db as any).patch === "function"
  );
}

function identityToExternalId(identity: ConvexIdentity): string {
  // In Convex, `subject` is the stable user identifier from the auth provider.
  // If you ever need provider disambiguation, consider using `tokenIdentifier` instead.
  return identity.subject;
}

/**
 * Fetches the Convex identity, or throws if unauthenticated.
 */
export async function requireIdentity(
  ctx: AnyAuthedCtx,
): Promise<ConvexIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new AuthError("Unauthenticated");
  return identity;
}

/**
 * Returns the identity if authenticated, otherwise null.
 */
export async function getIdentity(
  ctx: AnyAuthedCtx,
): Promise<ConvexIdentity | null> {
  return await ctx.auth.getUserIdentity();
}

/**
 * Finds the current user row, or null if not found or unauthenticated.
 */
export async function getCurrentUser(ctx: AnyAuthedDbCtx): Promise<{
  _id: Id<"users">;
  externalId: string;
  email?: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
} | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const externalId = identityToExternalId(identity);
  return await ctx.db
    .query("users")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .unique();
}

/**
 * Ensures a `users` table record exists for the current authenticated identity.
 * Creates it if missing. Returns the user id.
 *
 * Intended usage:
 * - Call at the start of most mutations/actions that need a stable internal `userId`.
 */
/**
 * Returns the internal `users` table id for the current principal.
 *
 * Behavior by context:
 * - In a **mutation** (db writer): creates the user row if missing (and may patch profile fields).
 * - In a **query** (db reader): returns the user id if it exists; otherwise throws with guidance.
 *
 * Rationale:
 * - Queries are read-only in Convex and cannot `insert`/`patch`.
 * - We still want queries to be able to resolve the internal `userId` for tenancy filters.
 *
 * Dev anonymous mode:
 * - If `AGENTROMATIC_DEV_ANON_USER=true`, unauthenticated calls will use the stable externalId "dev_anonymous".
 * - The first time you use that externalId, it must be created from a mutation (writer context).
 */
export async function getOrCreateCurrentUserId(
  ctx: AnyAuthedDbCtx,
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();

  const externalId = identity
    ? identityToExternalId(identity)
    : "dev_anonymous";
  if (!identity && !isDevAnonymousUserModeEnabled()) {
    throw new AuthError("Unauthenticated");
  }

  const db = ctx.db as DbReader | DbWriter;

  const existing = await db
    .query("users")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .unique();

  const timestamp = nowMs();

  // Only pull profile details when an identity is available.
  const email = identity?.email ?? undefined;

  // Convex identity `name` can be absent; prefer it when available.
  const name =
    identity?.name ??
    identity?.preferredUsername ??
    identity?.nickname ??
    identity?.givenName ??
    undefined;

  if (existing) {
    // Only writers can patch profile fields.
    if (isDbWriter(db)) {
      // Opportunistically keep profile info fresh.
      // Avoid overwriting existing non-empty values with undefined.
      const patch: Partial<{
        email: string;
        name: string;
        updatedAt: number;
      }> = { updatedAt: timestamp };

      if (email && email !== existing.email) patch.email = email;
      if (name && name !== existing.name) patch.name = name;

      // Only patch if we'd change something meaningful (updatedAt always changes).
      await db.patch(existing._id, patch);
    }

    return existing._id;
  }

  // We can't create users from a query context.
  if (!isDbWriter(db)) {
    throw new AuthError(
      "User record not found. Run a bootstrap mutation first to create your user row (or create it once in dev anonymous mode from a mutation).",
    );
  }

  const userId = await db.insert("users", {
    externalId,
    email,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return userId;
}

/**
 * Same as `getOrCreateCurrentUserId`, but returns the full user document.
 */
export async function getOrCreateCurrentUser(ctx: AnyAuthedDbCtx) {
  const userId = await getOrCreateCurrentUserId(ctx);
  const user = await ctx.db.get(userId);
  // Should never be null immediately after insert/patch.
  if (!user)
    throw new Error("Invariant violation: user not found after getOrCreate");
  return user;
}

/**
 * Convenience helper for server code that wants to fail fast and also get the user row.
 */
export async function requireCurrentUser(ctx: AnyAuthedDbCtx) {
  const user = await getCurrentUser(ctx);
  if (user) return user;

  // If the user doc is missing:
  // - Mutations can create it.
  // - Queries must throw (read-only).
  const db = ctx.db as DbReader | DbWriter;
  if (!isDbWriter(db)) {
    throw new AuthError(
      "User record not found. Run a bootstrap mutation first to create your user row.",
    );
  }

  return await getOrCreateCurrentUser(ctx);
}
