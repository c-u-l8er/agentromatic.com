import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getOrCreateCurrentUserId } from "./lib/auth";

/**
 * Workflows CRUD (Phase 1)
 *
 * Multi-tenancy model (MVP):
 * - A workflow is owned by exactly one scope: either `userId` OR `teamId`.
 * - Personal scope: always allowed for the authenticated user.
 * - Team scope (MVP simplification): allowed only if the team exists and `teams.ownerUserId`
 *   matches the authenticated user. (We will replace this with proper team membership/roles.)
 *
 * Notes:
 * - Node types/configs are stored as-is (no registry validation in Phase 1).
 * - Conditions are stored as strings (parsed/evaluated by the execution engine later).
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

async function requireWorkflowAccess(
  ctx: { db: any },
  workflowId: Id<"workflows">,
  userId: Id<"users">,
) {
  const workflow = await ctx.db.get(workflowId);
  if (!workflow) throw new NotFoundError("Workflow not found");

  // Enforce "exactly one of teamId/userId" at runtime.
  const hasTeam = Boolean(workflow.teamId);
  const hasUser = Boolean(workflow.userId);

  if (hasTeam && hasUser) {
    throw new ForbiddenError("Invalid workflow ownership: both teamId and userId are set");
  }
  if (!hasTeam && !hasUser) {
    throw new ForbiddenError("Invalid workflow ownership: neither teamId nor userId is set");
  }

  if (workflow.userId) {
    if (workflow.userId !== userId) throw new ForbiddenError("Forbidden");
    return workflow;
  }

  // Team-owned
  await requireTeamOwnedByUser(ctx, workflow.teamId, userId);
  return workflow;
}

/**
 * Validators (must match `convex/schema.ts`)
 */
const TriggerType = v.union(
  v.literal("webhook"),
  v.literal("schedule"),
  v.literal("email"),
  v.literal("manual"),
);

const WorkflowStatus = v.union(v.literal("draft"), v.literal("active"), v.literal("paused"));

const WorkflowTrigger = v.object({
  type: TriggerType,
  config: v.any(),
});

const WorkflowNode = v.object({
  id: v.string(),
  type: v.string(),
  position: v.object({ x: v.number(), y: v.number() }),
  config: v.any(),
});

const WorkflowEdge = v.object({
  source: v.string(),
  target: v.string(),
  condition: v.optional(v.string()),
});

/**
 * Query: list workflows for current user scope (personal) or team scope.
 *
 * Team scope (MVP): only team owner can list.
 */
export const list = query({
  args: {
    teamId: v.optional(v.id("teams")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    if (args.teamId) {
      await requireTeamOwnedByUser(ctx, args.teamId, authedUserId);
      return await ctx.db
        .query("workflows")
        .withIndex("by_team_updatedAt", (q: any) => q.eq("teamId", args.teamId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("workflows")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", authedUserId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Query: get a single workflow by id (requires access).
 */
export const get = query({
  args: {
    id: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);
    return await requireWorkflowAccess(ctx, args.id, authedUserId);
  },
});

/**
 * Mutation: create a workflow.
 *
 * Ownership:
 * - If `teamId` provided: team-owned (MVP: only team owner can create)
 * - Else: user-owned (current user)
 */
export const create = mutation({
  args: {
    teamId: v.optional(v.id("teams")),
    name: v.string(),
    trigger: WorkflowTrigger,
    nodes: v.optional(v.array(WorkflowNode)),
    edges: v.optional(v.array(WorkflowEdge)),
    status: v.optional(WorkflowStatus),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);
    const ts = nowMs();

    const nodes = args.nodes ?? [];
    const edges = args.edges ?? [];
    const status = args.status ?? "draft";

    if (args.teamId) {
      await requireTeamOwnedByUser(ctx, args.teamId, authedUserId);
      const workflowId = await ctx.db.insert("workflows", {
        teamId: args.teamId,
        userId: undefined,
        name: args.name,
        trigger: args.trigger,
        nodes,
        edges,
        status,
        createdAt: ts,
        updatedAt: ts,
      });
      return workflowId;
    }

    const workflowId = await ctx.db.insert("workflows", {
      teamId: undefined,
      userId: authedUserId,
      name: args.name,
      trigger: args.trigger,
      nodes,
      edges,
      status,
      createdAt: ts,
      updatedAt: ts,
    });

    return workflowId;
  },
});

/**
 * Mutation: update a workflow.
 *
 * Only allows patching workflow definition fields; ownership cannot be changed in MVP.
 */
export const update = mutation({
  args: {
    id: v.id("workflows"),
    patch: v.object({
      name: v.optional(v.string()),
      trigger: v.optional(WorkflowTrigger),
      nodes: v.optional(v.array(WorkflowNode)),
      edges: v.optional(v.array(WorkflowEdge)),
      status: v.optional(WorkflowStatus),
    }),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    // Enforce access and fetch current doc (also ensures valid ownership fields).
    await requireWorkflowAccess(ctx, args.id, authedUserId);

    const patch: Record<string, unknown> = { ...args.patch, updatedAt: nowMs() };

    await ctx.db.patch(args.id, patch);
    return { ok: true as const };
  },
});

/**
 * Mutation: set workflow status.
 */
export const setStatus = mutation({
  args: {
    id: v.id("workflows"),
    status: WorkflowStatus,
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    await requireWorkflowAccess(ctx, args.id, authedUserId);

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: nowMs(),
    });

    return { ok: true as const };
  },
});

/**
 * Mutation: delete a workflow.
 *
 * In Phase 1 we hard-delete. Later we can implement soft delete + retention.
 */
export const remove = mutation({
  args: {
    id: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const authedUserId = await getOrCreateCurrentUserId(ctx);

    await requireWorkflowAccess(ctx, args.id, authedUserId);

    await ctx.db.delete(args.id);
    return { ok: true as const };
  },
});
