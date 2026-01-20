import { z } from "zod";

/**
 * Shared Zod schemas for Agentromatic.
 *
 * Goals:
 * - Validate core storage contracts (Workflow, Execution, Logs, IntegrationCredential)
 * - Keep schemas compatible with Convex (IDs are strings here; Convex `Id<"table">` is serialized)
 * - Avoid unsafe evaluation primitives (conditions are stored as strings in MVP)
 */

/**
 * Common helpers
 */
export const TimestampMsSchema = z
  .number()
  .int()
  .nonnegative()
  .describe("Unix epoch timestamp in milliseconds");

export const NonEmptyStringSchema = z.string().min(1);

export const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const JsonValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

export type JsonValue = z.infer<typeof JsonValueSchema>;

export const OwnerSchema = z
  .object({
    teamId: z.string().optional(),
    userId: z.string().optional(),
  })
  .refine((v) => Boolean(v.teamId) || Boolean(v.userId), {
    message: "Owner must include either teamId or userId",
  })
  .refine((v) => !(v.teamId && v.userId), {
    message: "Owner must not include both teamId and userId (pick one scope)",
  });

export type Owner = z.infer<typeof OwnerSchema>;

/**
 * Workflow
 */
export const WorkflowStatusSchema = z.enum(["draft", "active", "paused"]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const TriggerTypeSchema = z.enum(["webhook", "schedule", "email", "manual"]);
export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const TriggerSchema = z.object({
  type: TriggerTypeSchema,
  /**
   * Trigger-specific config. Examples:
   * - webhook: { secret?: string, path?: string }
   * - schedule: { cron: string }
   */
  config: JsonValueSchema,
});

export type Trigger = z.infer<typeof TriggerSchema>;

export const NodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type NodePosition = z.infer<typeof NodePositionSchema>;

export const WorkflowNodeSchema = z.object({
  /**
   * Stable node id within the workflow (UUID string recommended).
   */
  id: NonEmptyStringSchema,
  /**
   * Node type identifier. Examples: "http_request", "ai_agent", "send_email"
   */
  type: NonEmptyStringSchema,
  position: NodePositionSchema,
  /**
   * Node-specific config.
   */
  config: JsonValueSchema,
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

/**
 * MVP condition language:
 * - stored as a string for now (no eval)
 * - parsed/evaluated by engine later
 */
export const ConditionSchema = z
  .string()
  .min(1)
  .max(2000)
  .describe("MVP condition expression string (safe DSL, no eval)");

export type Condition = z.infer<typeof ConditionSchema>;

export const WorkflowEdgeSchema = z.object({
  source: NonEmptyStringSchema,
  target: NonEmptyStringSchema,
  condition: ConditionSchema.optional(),
});

export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema.max(200),
  trigger: TriggerSchema,
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),

  status: WorkflowStatusSchema.default("draft"),

  /**
   * Ownership / tenancy. Prefer team workflows; support personal workflows.
   */
  owner: OwnerSchema,

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * Execution + logs
 */
export const ExecutionStatusSchema = z.enum(["queued", "running", "success", "failed", "canceled"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionSchema = z.object({
  id: NonEmptyStringSchema,
  workflowId: NonEmptyStringSchema,

  /**
   * Required snapshot for correctness/auditability.
   */
  workflowSnapshot: WorkflowSchema,

  owner: OwnerSchema,

  status: ExecutionStatusSchema,
  startedAt: TimestampMsSchema,
  completedAt: TimestampMsSchema.optional(),

  /**
   * Data passed from trigger (webhook payload, schedule context, etc.).
   * Store carefully (size limits + no secrets).
   */
  triggerData: JsonValueSchema.optional(),

  /**
   * For failed executions.
   */
  error: z.string().max(10_000).optional(),
});

export type Execution = z.infer<typeof ExecutionSchema>;

export const ExecutionLogStatusSchema = z.enum(["started", "success", "failed", "skipped"]);
export type ExecutionLogStatus = z.infer<typeof ExecutionLogStatusSchema>;

export const ExecutionLogEntrySchema = z.object({
  id: NonEmptyStringSchema.optional().describe("Optional log entry id (if stored separately)"),
  executionId: NonEmptyStringSchema,
  nodeId: NonEmptyStringSchema,

  status: ExecutionLogStatusSchema,

  input: JsonValueSchema.optional(),
  output: JsonValueSchema.optional(),

  error: z.string().max(10_000).optional(),

  durationMs: z.number().int().nonnegative().optional(),
  createdAt: TimestampMsSchema,
});

export type ExecutionLogEntry = z.infer<typeof ExecutionLogEntrySchema>;

/**
 * Integrations / credentials (minimal Phase 1)
 */
export const IntegrationProviderSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("Provider key, e.g. 'slack', 'google', 'generic_api'");

export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationStatusSchema = z.enum(["connected", "expired", "error"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationCredentialSchema = z.object({
  id: NonEmptyStringSchema,
  owner: OwnerSchema,

  provider: IntegrationProviderSchema,
  displayName: NonEmptyStringSchema.max(200),

  status: IntegrationStatusSchema,

  /**
   * Reference to encrypted secret material (implementation-specific).
   * In Convex you might store an encrypted blob or pointer.
   */
  encryptedSecretRef: NonEmptyStringSchema,

  scopes: z.array(z.string().min(1)).optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type IntegrationCredential = z.infer<typeof IntegrationCredentialSchema>;

/**
 * Useful “input” schemas for API functions (Convex mutations/actions)
 */
export const CreateWorkflowInputSchema = z.object({
  name: NonEmptyStringSchema.max(200),
  trigger: TriggerSchema,
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  owner: OwnerSchema,
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowInputSchema>;

export const UpdateWorkflowPatchSchema = WorkflowSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UpdateWorkflowPatch = z.infer<typeof UpdateWorkflowPatchSchema>;

export const ExecuteWorkflowInputSchema = z.object({
  workflowId: NonEmptyStringSchema,
  triggerData: JsonValueSchema.optional(),
});

export type ExecuteWorkflowInput = z.infer<typeof ExecuteWorkflowInputSchema>;
