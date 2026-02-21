import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getOrCreateCurrentUserId } from "./lib/auth";

/**
 * Executions + logs (Phase 1)
 *
 * This file implements:
 * - execution record queries/mutations (create, list, get, markRunning, complete)
 *
 * Multi-tenancy model (MVP):
 * - An execution is owned by exactly one scope: either `userId` OR `teamId` (mirrored from workflow)
 * - Personal scope: allowed for the authenticated user
 * - Team scope (MVP simplification): allowed only if `teams.ownerUserId` matches authenticated user
 *
 * Snapshotting:
 * - `executions.workflowSnapshot` is required and is derived from the workflow at run creation time.
 * - Clients never supply the snapshot directly (prevents tampering).
 */

class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
}
class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}
class ValidationError extends Error {
  override readonly name = "ValidationError";
}

function nowMs(): number {
  return Date.now();
}

/**
 * Limit stored payload size to control costs and avoid huge docs.
 * This is a coarse MVP guardrail; in later phases we should:
 * - truncate deeply with path-level indicators
 * - redact secrets from known providers
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
    // If it can't be stringified, store a safe marker.
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
  if (!team.ownerUserId)
    throw new ForbiddenError("Team has no ownerUserId (MVP restriction)");
  if (team.ownerUserId !== userId)
    throw new ForbiddenError("Forbidden: not team owner");
}

async function requireWorkflowAccess(
  ctx: { db: any },
  workflowId: Id<"workflows">,
  userId: Id<"users">,
) {
  const workflow = await ctx.db.get(workflowId);
  if (!workflow) throw new NotFoundError("Workflow not found");

  const hasTeam = Boolean(workflow.teamId);
  const hasUser = Boolean(workflow.userId);

  if (hasTeam && hasUser) {
    throw new ForbiddenError(
      "Invalid workflow ownership: both teamId and userId are set",
    );
  }
  if (!hasTeam && !hasUser) {
    throw new ForbiddenError(
      "Invalid workflow ownership: neither teamId nor userId is set",
    );
  }

  if (workflow.userId) {
    if (workflow.userId !== userId) throw new ForbiddenError("Forbidden");
    return workflow;
  }

  await requireTeamOwnedByUser(ctx, workflow.teamId, userId);
  return workflow;
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
    throw new ForbiddenError(
      "Invalid execution ownership: both teamId and userId are set",
    );
  }
  if (!hasTeam && !hasUser) {
    throw new ForbiddenError(
      "Invalid execution ownership: neither teamId nor userId is set",
    );
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
const ExecutionStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("canceled"),
);

/**
 * Query: list executions for a workflow (requires workflow access).
 */
export const listByWorkflow = query({
  args: {
    workflowId: v.id("workflows"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    // Ensure caller can access the workflow (enforces tenant boundary).
    await requireWorkflowAccess(ctx, args.workflowId, authedUserId);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    return await ctx.db
      .query("executions")
      .withIndex("by_workflow_startedAt", (q: any) =>
        q.eq("workflowId", args.workflowId),
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Query: get a single execution by id (requires execution access).
 */
export const get = query({
  args: {
    id: v.id("executions"),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);
    return await requireExecutionAccess(ctx, args.id, authedUserId);
  },
});

/**
 * Query: list recent executions for the current user (personal) or a team.
 *
 * Team scope (MVP): only team owner can list.
 */
export const listRecent = query({
  args: {
    teamId: v.optional(v.id("teams")),
    limit: v.optional(v.number()),
    status: v.optional(ExecutionStatus),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    if (args.teamId) {
      await requireTeamOwnedByUser(ctx, args.teamId, authedUserId);

      // If status filter is used, we don't have an index that starts with (teamId, status).
      // For MVP, keep it simple: query by team and filter in memory (bounded by `limit` + small overscan).
      const overscan = Math.min(limit * 5, 500);

      const rows = await ctx.db
        .query("executions")
        .withIndex("by_team_startedAt", (q: any) => q.eq("teamId", args.teamId))
        .order("desc")
        .take(overscan);

      return args.status
        ? rows.filter((r: any) => r.status === args.status).slice(0, limit)
        : rows.slice(0, limit);
    }

    const overscan = Math.min(limit * 5, 500);

    const rows = await ctx.db
      .query("executions")
      .withIndex("by_user_startedAt", (q: any) => q.eq("userId", authedUserId))
      .order("desc")
      .take(overscan);

    return args.status
      ? rows.filter((r: any) => r.status === args.status).slice(0, limit)
      : rows.slice(0, limit);
  },
});

/**
 * Mutation: create an execution record.
 *
 * This is intentionally minimal; the full workflow engine lives in an Action later.
 * In Phase 1 this can be used by an Action to create a run record with a snapshot.
 */
export const create = mutation({
  args: {
    workflowId: v.id("workflows"),
    triggerData: v.optional(v.any()),
    /**
     * Optional override for status; default `queued`.
     * Actions may create directly as `running`.
     */
    status: v.optional(ExecutionStatus),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    const workflow = await requireWorkflowAccess(
      ctx,
      args.workflowId,
      authedUserId,
    );

    const startedAt = nowMs();

    const workflowSnapshot = {
      name: workflow.name,
      trigger: workflow.trigger,
      nodes: workflow.nodes,
      edges: workflow.edges,
      status: workflow.status,
    };

    // `workflowSnapshot` is derived from an already-validated `workflows` document.
    // Convex will validate the `workflowSnapshot` field again against `schema.ts` on write.

    const triggerData = limitPayloadForStorage(args.triggerData, 32_000);

    const executionId = await ctx.db.insert("executions", {
      teamId: workflow.teamId,
      userId: workflow.userId,

      workflowId: args.workflowId,
      workflowSnapshot,

      status: args.status ?? "queued",

      triggerData,

      startedAt,
      completedAt: undefined,

      error: undefined,
    });

    return executionId;
  },
});

/**
 * Mutation: mark an execution as running.
 * Useful when an Action creates a queued execution and begins processing.
 */
export const markRunning = mutation({
  args: {
    id: v.id("executions"),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    const execution = await requireExecutionAccess(ctx, args.id, authedUserId);

    if (
      execution.status === "success" ||
      execution.status === "failed" ||
      execution.status === "canceled"
    ) {
      throw new ValidationError(
        `Cannot mark execution as running from status: ${execution.status}`,
      );
    }

    await ctx.db.patch(args.id, {
      status: "running",
    });

    return { ok: true as const };
  },
});

/**
 * Mutation: complete an execution (success/failed/canceled).
 */
export const complete = mutation({
  args: {
    id: v.id("executions"),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    const execution = await requireExecutionAccess(ctx, args.id, authedUserId);

    if (
      execution.status === "success" ||
      execution.status === "failed" ||
      execution.status === "canceled"
    ) {
      throw new ValidationError(
        `Execution is already terminal: ${execution.status}`,
      );
    }

    if (args.status === "failed" && !args.error) {
      throw new ValidationError(
        "Failed executions must include an error message",
      );
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      completedAt: args.completedAt ?? nowMs(),
      error: args.status === "failed" ? args.error : undefined,
    });

    return { ok: true as const };
  },
});
