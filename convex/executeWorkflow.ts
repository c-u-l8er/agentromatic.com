import { action } from "./_generated/server";
import { v } from "convex/values";
import { api as apiTyped } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Phase 1: executeWorkflow action stub
 *
 * Responsibilities:
 * - Create an execution record with a required workflow snapshot (handled in executions.create)
 * - Append at least one log entry so the UI has something to display
 * - Mark the execution as success/failed deterministically
 *
 * Non-goals (Phase 1):
 * - Full DAG planning (topological sort)
 * - Node execution
 * - Conditions/branching
 * - Retries/self-healing
 */

type ExecuteWorkflowResult =
  | { success: true; executionId: Id<"executions"> }
  | { success: false; executionId: Id<"executions">; error: string };

// NOTE:
// Importing the fully-typed api object in the same module can create a TypeScript
// type inference cycle (because the generated API type references this module).
// For Phase 1 (stub action), we intentionally cast api to any to break the cycle.
const api = apiTyped as any;

export const executeWorkflow = action({
  args: {
    workflowId: v.id("workflows"),
    triggerData: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<ExecuteWorkflowResult> => {
    const executionId = (await ctx.runMutation(api.executions.create, {
      workflowId: args.workflowId,
      triggerData: args.triggerData,
      status: "running",
    })) as Id<"executions">;

    await ctx.runMutation(api.executionLogs.append, {
      executionId,
      nodeId: "__start__",
      status: "started",
      input: {
        triggerData: args.triggerData,
      },
    });

    try {
      const stubOutput = {
        message: "Phase 1 stub: execution recorded (no engine yet).",
      };

      await ctx.runMutation(api.executionLogs.append, {
        executionId,
        nodeId: "__end__",
        status: "success",
        output: stubOutput,
        durationMs: 0,
      });

      await ctx.runMutation(api.executions.complete, {
        id: executionId,
        status: "success",
        completedAt: Date.now(),
      });

      return { success: true, executionId };
    } catch (err) {
      const errorMessage = toErrorMessage(err);

      try {
        await ctx.runMutation(api.executionLogs.append, {
          executionId,
          nodeId: "__end__",
          status: "failed",
          error: errorMessage,
        });
      } catch {
        // ignored
      }

      await ctx.runMutation(api.executions.complete, {
        id: executionId,
        status: "failed",
        completedAt: Date.now(),
        error: errorMessage,
      });

      return { success: false, executionId, error: errorMessage };
    }
  },
});

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name + ": " + err.message;
  }
  try {
    return "Error: " + JSON.stringify(err);
  } catch {
    return "Error: (unstringifiable)";
  }
}
