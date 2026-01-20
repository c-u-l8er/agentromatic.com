import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Agentromatic Convex schema (Phase 1)
 *
 * Notes:
 * - Multi-tenancy: documents include either `teamId` OR `userId` as the owner scope.
 *   Convex schema validation can't enforce "exactly one" at the type level, so enforce
 *   this in queries/mutations via helper functions.
 * - Workflow execution snapshotting: `executions.workflowSnapshot` stores the workflow
 *   definition at run start for correctness/auditability.
 * - Node/edge `config`, trigger `config`, and log `input/output` are `v.any()` in MVP.
 *   We can tighten these with Zod + Convex validation as the node registry stabilizes.
 */

const TriggerType = v.union(
  v.literal("webhook"),
  v.literal("schedule"),
  v.literal("email"),
  v.literal("manual"),
);

const WorkflowStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("paused"),
);

const ExecutionStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("canceled"),
);

const ExecutionLogStatus = v.union(
  v.literal("started"),
  v.literal("success"),
  v.literal("failed"),
  v.literal("skipped"),
);

const IntegrationStatus = v.union(
  v.literal("connected"),
  v.literal("expired"),
  v.literal("error"),
);

const WorkflowTrigger = v.object({
  type: TriggerType,
  config: v.any(),
});

const WorkflowNode = v.object({
  id: v.string(), // stable UUID-like string within the workflow definition
  type: v.string(), // e.g. "http_request", "ai_agent", "send_email"
  position: v.object({
    x: v.number(),
    y: v.number(),
  }),
  config: v.any(),
});

const WorkflowEdge = v.object({
  source: v.string(), // node id
  target: v.string(), // node id
  condition: v.optional(v.string()), // MVP condition DSL stored as string
});

const WorkflowDefinition = v.object({
  name: v.string(),
  trigger: WorkflowTrigger,
  nodes: v.array(WorkflowNode),
  edges: v.array(WorkflowEdge),
  status: WorkflowStatus,
});

export default defineSchema({
  /**
   * Users (minimal table to support workflow ownership and auth mapping)
   *
   * In MVP we store a stable external auth identifier (e.g. Clerk user id) and
   * basic metadata. Application logic should ensure a user row exists for the
   * authenticated principal.
   */
  users: defineTable({
    // External auth provider id (e.g. Clerk userId)
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number(), // ms epoch
    updatedAt: v.number(), // ms epoch
  }).index("by_externalId", ["externalId"]),

  /**
   * Teams (minimal table to support team ownership IDs)
   */
  teams: defineTable({
    name: v.string(),
    // Optional pointer to a "team owner" user for MVP administration UX
    ownerUserId: v.optional(v.id("users")),
    createdAt: v.number(), // ms epoch
    updatedAt: v.number(), // ms epoch
  })
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_name", ["name"]),

  /**
   * Workflows (definitions authored by users/teams)
   */
  workflows: defineTable({
    // Ownership (exactly one scope should be set in application logic)
    teamId: v.optional(v.id("teams")),
    userId: v.optional(v.id("users")),

    // Definition
    name: v.string(),
    trigger: WorkflowTrigger,
    nodes: v.array(WorkflowNode),
    edges: v.array(WorkflowEdge),
    status: WorkflowStatus,

    // Timestamps
    createdAt: v.number(), // ms epoch
    updatedAt: v.number(), // ms epoch
  })
    .index("by_team_updatedAt", ["teamId", "updatedAt"])
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  /**
   * Executions (a single workflow run)
   */
  executions: defineTable({
    // Ownership mirror for fast auth filtering
    teamId: v.optional(v.id("teams")),
    userId: v.optional(v.id("users")),

    workflowId: v.id("workflows"),

    // Required workflow snapshot (auditability + rerun correctness)
    workflowSnapshot: WorkflowDefinition,

    status: ExecutionStatus,

    // Trigger payload/context (stored carefully; size limits enforced in code)
    triggerData: v.optional(v.any()),

    // Timestamps
    startedAt: v.number(), // ms epoch
    completedAt: v.optional(v.number()),

    // Error info for failed runs
    error: v.optional(v.string()),
  })
    .index("by_workflow_startedAt", ["workflowId", "startedAt"])
    .index("by_team_startedAt", ["teamId", "startedAt"])
    .index("by_user_startedAt", ["userId", "startedAt"])
    .index("by_status_startedAt", ["status", "startedAt"]),

  /**
   * Execution log entries (per-node, chronological)
   */
  executionLogs: defineTable({
    executionId: v.id("executions"),
    nodeId: v.string(),

    status: ExecutionLogStatus,

    input: v.optional(v.any()),
    output: v.optional(v.any()),

    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),

    createdAt: v.number(), // ms epoch
  }).index("by_execution_createdAt", ["executionId", "createdAt"]),

  /**
   * Integration credentials (encrypted refs / blobs)
   */
  integrationCredentials: defineTable({
    // Ownership (exactly one scope should be set in application logic)
    teamId: v.optional(v.id("teams")),
    userId: v.optional(v.id("users")),

    provider: v.string(), // e.g. "slack", "google", "generic_api"
    displayName: v.string(),
    status: IntegrationStatus,

    // Implementation-specific encrypted storage pointer/blob reference
    encryptedSecretRef: v.string(),

    scopes: v.optional(v.array(v.string())),

    createdAt: v.number(), // ms epoch
    updatedAt: v.number(), // ms epoch
  })
    .index("by_team_provider", ["teamId", "provider"])
    .index("by_user_provider", ["userId", "provider"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),
});
