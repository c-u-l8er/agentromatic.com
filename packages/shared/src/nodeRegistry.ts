import { z } from "zod";
import {
  JsonValueSchema,
  NodePositionSchema,
  NonEmptyStringSchema,
  type NodePosition,
} from "./schemas";

/**
 * Minimal Node Registry (MVP)
 *
 * Goals:
 * - Provide a stable, shared catalog of node types for Phase 1–2 UI + Phase 3 engine
 * - Define per-node config schemas + sane defaults
 * - Keep this package environment-agnostic (no Convex imports, no browser-only APIs)
 *
 * Non-goals (MVP):
 * - Execution/runtime implementations (engine lives server-side)
 * - Full type-safe dataflow between nodes
 * - Rich condition/branch nodes (Phase 3+)
 */

/**
 * Kinds are used for UI grouping and future engine behavior.
 */
export const NodeKindSchema = z.enum([
  "trigger",
  "action",
  "control",
  "transform",
]);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * Node type identifiers.
 *
 * NOTE:
 * - Workflow storage currently uses `nodes[].type: string` (no registry enforcement in Phase 1).
 * - This registry is the source of truth for the *intended* MVP node set.
 */
export const NodeTypeSchema = z.enum([
  // Triggers (optional modeling; workflow.trigger is the primary trigger in storage)
  "manual_trigger",

  // Actions
  "http_request",
  "ai_agent",
  "log_message",

  // Controls (placeholder for later)
  "noop",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NodeIdSchema = NonEmptyStringSchema.describe(
  "Stable node id within a workflow (UUID string recommended)",
);
export type NodeId = z.infer<typeof NodeIdSchema>;

// NOTE: NodePositionSchema + NodePosition are defined in `./schemas`.
// Reuse them here to avoid duplicate exports when re-exporting from `src/index.ts`.

/**
 * IO metadata (for UI hints and future validation).
 * MVP keeps this intentionally lightweight.
 */
export const NodePortSchema = z.object({
  key: NonEmptyStringSchema.max(64),
  label: NonEmptyStringSchema.max(128).optional(),
  description: z.string().max(500).optional(),
  // A JSON-schema-like hint for UI rendering; not enforced in MVP.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaHint: z.any().optional(),
});
export type NodePort = z.infer<typeof NodePortSchema>;

export type NodeDefinition<TConfig = unknown> = {
  type: NodeType;
  kind: NodeKind;

  /**
   * Human-friendly metadata for UI palettes/tooltips.
   */
  title: string;
  description?: string;
  icon?: string; // e.g. "globe", "sparkles" (icon mapping belongs to UI)

  /**
   * Lightweight IO shape hints.
   * - `inputs` is what the node expects (from currentData / prior nodes)
   * - `outputs` is what the node contributes to currentData
   */
  inputs: NodePort[];
  outputs: NodePort[];

  /**
   * Runtime config validation (shared).
   */
  configSchema: z.ZodType<TConfig>;
  defaultConfig: TConfig;

  /**
   * Optional guardrails for UX/engine planning.
   */
  isMvpReady: boolean;
};

/**
 * MVP Node Config Schemas
 */

/**
 * Manual trigger node (optional in UI).
 * Storage still uses `workflow.trigger` as the trigger-of-record.
 */
export const ManualTriggerConfigSchema = z.object({
  note: z
    .string()
    .max(2000)
    .optional()
    .describe("Optional note for humans; has no runtime effect."),
});
export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpRequestConfigSchema = z.object({
  url: z.string().url(),
  method: HttpMethodSchema.default("GET"),
  headers: z.record(z.string()).default({}),
  /**
   * Body is modeled as JSON in MVP (engine may later support string/binary).
   * For GET requests, engine should ignore body.
   */
  body: JsonValueSchema.optional(),
  /**
   * Future: timeoutMs, retries, authRef, etc.
   */
});
export type HttpRequestConfig = z.infer<typeof HttpRequestConfigSchema>;

export const AiAgentConfigSchema = z.object({
  /**
   * Prompt template or instruction.
   * Engine will later supply `currentData` context.
   */
  prompt: NonEmptyStringSchema.max(20_000),
  /**
   * Model hint. Keep as string for portability (provider-specific mapping server-side).
   */
  model: z.string().max(128).optional(),
  /**
   * Whether the agent is allowed to use tools (http request, search, etc).
   * Defaults off in MVP for safety; enable later behind policy/feature flag.
   */
  toolsEnabled: z.boolean().default(false),
});
export type AiAgentConfig = z.infer<typeof AiAgentConfigSchema>;

export const LogMessageConfigSchema = z.object({
  message: NonEmptyStringSchema.max(10_000),
  /**
   * Optional structured data to include.
   */
  data: JsonValueSchema.optional(),
});
export type LogMessageConfig = z.infer<typeof LogMessageConfigSchema>;

export const NoopConfigSchema = z.object({
  note: z.string().max(2000).optional(),
});
export type NoopConfig = z.infer<typeof NoopConfigSchema>;

/**
 * Registry
 */
export const nodeRegistry: Record<NodeType, NodeDefinition<any>> = {
  manual_trigger: {
    type: "manual_trigger",
    kind: "trigger",
    title: "Manual Trigger",
    description: "Start the workflow manually.",
    icon: "play",
    inputs: [],
    outputs: [
      {
        key: "triggerData",
        label: "triggerData",
        description: "Data provided when the workflow run is triggered.",
      },
    ],
    configSchema: ManualTriggerConfigSchema,
    defaultConfig: {},
    isMvpReady: true,
  },

  http_request: {
    type: "http_request",
    kind: "action",
    title: "HTTP Request",
    description: "Call an HTTP endpoint and store the response.",
    icon: "globe",
    inputs: [
      {
        key: "currentData",
        label: "currentData",
        description: "The workflow's current data object.",
      },
    ],
    outputs: [
      {
        key: "response",
        label: "response",
        description: "HTTP response data (status, headers, body).",
      },
    ],
    configSchema: HttpRequestConfigSchema,
    defaultConfig: {
      url: "https://example.com",
      method: "GET",
      headers: {},
    },
    isMvpReady: false, // engine not implemented yet
  },

  ai_agent: {
    type: "ai_agent",
    kind: "action",
    title: "AI Agent",
    description: "Run an AI agent step (LLM).",
    icon: "sparkles",
    inputs: [
      {
        key: "currentData",
        label: "currentData",
        description: "The workflow's current data object.",
      },
    ],
    outputs: [
      {
        key: "result",
        label: "result",
        description: "Agent output/result object.",
      },
    ],
    configSchema: AiAgentConfigSchema,
    defaultConfig: {
      prompt: "Summarize the following data:\n\n{{currentData}}",
      toolsEnabled: false,
    },
    isMvpReady: false, // engine not implemented yet
  },

  log_message: {
    type: "log_message",
    kind: "action",
    title: "Log Message",
    description: "Write a message to execution logs.",
    icon: "terminal",
    inputs: [
      {
        key: "currentData",
        label: "currentData",
        description: "The workflow's current data object.",
      },
    ],
    outputs: [],
    configSchema: LogMessageConfigSchema,
    defaultConfig: {
      message: "Hello from Agentromatic",
    },
    isMvpReady: true, // can be implemented very early in engine
  },

  noop: {
    type: "noop",
    kind: "control",
    title: "No-op",
    description: "Does nothing (useful as a placeholder).",
    icon: "minus",
    inputs: [],
    outputs: [],
    configSchema: NoopConfigSchema,
    defaultConfig: {},
    isMvpReady: true,
  },
} as const;

export function isNodeType(value: string): value is NodeType {
  return (NodeTypeSchema.options as readonly string[]).includes(value);
}

export function getNodeDefinition(type: NodeType): NodeDefinition<any> {
  return nodeRegistry[type];
}

/**
 * Return registry entries in a stable, user-friendly order for UI palettes.
 */
export function listNodeDefinitions(): NodeDefinition<any>[] {
  const order: NodeType[] = [
    "manual_trigger",
    "http_request",
    "ai_agent",
    "log_message",
    "noop",
  ];
  return order.map((t) => nodeRegistry[t]);
}

/**
 * Given a `type`, validate/normalize config (applying defaults).
 *
 * This is useful when:
 * - building UI forms
 * - importing templates
 * - sanitizing user-edited JSON definitions before saving
 */
export function parseNodeConfig<T extends NodeType>(
  type: T,
  config: unknown,
): z.infer<(typeof nodeRegistry)[T]["configSchema"]> {
  const def = nodeRegistry[type] as NodeDefinition<any>;
  // Zod default handling is schema-specific; we manually fall back to defaultConfig for undefined.
  const value = config === undefined ? def.defaultConfig : config;
  return def.configSchema.parse(value);
}

/**
 * Minimal "default node" constructor for UI templates.
 *
 * NOTE:
 * - ID generation is intentionally NOT included in @agentromatic/shared.
 *   Pass an `id` from the app (web) so the shared package stays environment-agnostic.
 */
export function createDefaultNode<T extends NodeType>(args: {
  id: string;
  type: T;
  position?: NodePosition;
  config?: unknown;
}): {
  id: string;
  type: T;
  position: NodePosition;
  config: z.infer<(typeof nodeRegistry)[T]["configSchema"]>;
} {
  const position = args.position ?? { x: 0, y: 0 };
  const config = parseNodeConfig(args.type, args.config);

  return {
    id: args.id,
    type: args.type,
    position: NodePositionSchema.parse(position),
    config,
  };
}
