import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getOrCreateCurrentUserId } from "./lib/auth";

/**
 * Execution logs (Phase 1)
 *
 * Implements:
 * - list({ executionId, limit? }): list log entries for an execution, chronological
 * - append({ executionId, nodeId, status, input?, output?, error?, durationMs? }): add a log entry
 *
 * Multi-tenancy model (MVP):
 * - Logs are accessible if (and only if) you can access the parent execution.
 * - Team scope (MVP simplification): only team owner can access team-owned executions.
 *
 * Guardrails:
 * - Payload truncation for input/output to keep docs small and reduce risk of leaking large data.
 */

class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
}
class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}

function nowMs(): number {
  return Date.now();
}

/**
 * Limit stored payload size to control costs and avoid huge docs.
 * This is a coarse MVP guardrail; later phases should add:
 * - deep truncation with path-level indicators
 * - secret redaction heuristics
 */
function limitPayloadForStorage(value: unknown, maxChars: number): unknown {
  if (value === undefined) return undefined;

  try {
    const json = JSON.stringify(value);
    if (json.length <= maxChars) return value;

    return {
      __truncated: true,
      maxChars,
      preview: json.slice(0, maxChars),
    };
  } catch {
    return { __unserializable: true };
  }
}

async function requireTeamOwnedByUser(
  ctx: { db: any },
  teamId: Id<"teams">,
  userId: Id<"users">,
): Promise<void> {
  const team = await ctx.db.get(teamId);
  if (!team) throw new NotFoundError("Team not found");
  if (!team.ownerUserId) throw new ForbiddenError("Team has no ownerUserId (MVP restriction)");
  if (team.ownerUserId !== userId) throw new ForbiddenError("Forbidden: not team owner");
}

async function requireExecutionAccess(
  ctx: { db: any },
  executionId: Id<"executions">,
  userId: Id<"users">,
) {
  const execution = await ctx.db.get(executionId);
  if (!execution) throw new NotFoundError("Execution not found");

  const hasTeam = Boolean(execution.teamId);
  const hasUser = Boolean(execution.userId);

  if (hasTeam && hasUser) {
    throw new ForbiddenError("Invalid execution ownership: both teamId and userId are set");
  }
  if (!hasTeam && !hasUser) {
    throw new ForbiddenError("Invalid execution ownership: neither teamId nor userId is set");
  }

  if (execution.userId) {
    if (execution.userId !== userId) throw new ForbiddenError("Forbidden");
    return execution;
  }

  await requireTeamOwnedByUser(ctx, execution.teamId, userId);
  return execution;
}

/**
 * Validators (must match `convex/schema.ts`)
 */
const ExecutionLogStatus = v.union(
  v.literal("started"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("skipped"),
);

/**
 * Query: list logs for an execution (chronological).
 */
export const list = query({
  args: {
    executionId: v.id("executions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    // Ensure caller has access to the execution (tenant boundary).
    await requireExecutionAccess(ctx, args.executionId, authedUserId);

    const limit = Math.max(1, Math.min(args.limit ?? 200, 1000));

    return await ctx.db
      .query("executionLogs")
      .withIndex("by_execution_createdAt", (q: any) => q.eq("executionId", args.executionId))
      .order("asc")
      .take(limit);
  },
});

/**
 * Mutation: append a log entry for an execution.
 *
 * Note:
 * - In Phase 1, this is called by server actions (and potentially UI for test/stub runs).
 * - Input/output are truncated to avoid huge documents.
 */
export const append = mutation({
  args: {
    executionId: v.id("executions"),
    nodeId: v.string(),
    status: ExecutionLogStatus,

    input: v.optional(v.any()),
    output: v.optional(v.any()),

    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    // Enforce access (tenant boundary).
    await requireExecutionAccess(ctx, args.executionId, authedUserId);

    const createdAt = nowMs();

    const input = limitPayloadForStorage(args.input, 32_000);
    const output = limitPayloadForStorage(args.output, 32_000);

    const logId = await ctx.db.insert("executionLogs", {
      executionId: args.executionId,
      nodeId: args.nodeId,

      status: args.status,

      input,
      output,

      error: args.error,
      durationMs: args.durationMs,

      createdAt,
    });

    return logId;
  },
});
