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
    const startedAtMs = Date.now();

    // Create execution record (also snapshots the workflow server-side).
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
        workflowId: args.workflowId,
        triggerData: args.triggerData,
      },
    });

    // Resolve delegated identity for future WHS delegated invocation.
    const identity = await (ctx as any)?.auth?.getUserIdentity?.();
    const externalUserId =
      (identity && typeof identity.subject === "string" && identity.subject) ||
      "dev_anonymous";

    // WHS integration config (optional).
    const whsBaseUrl = normalizeBaseUrl(getEnvString("WHS_CONTROL_PLANE_URL"));
    const whsDelegationSecretRaw = getEnvString("WHS_DELEGATION_SECRET");
    const whsDelegationSecret = whsDelegationSecretRaw
      ? decodeKeyStringBestEffort(whsDelegationSecretRaw)
      : null;

    const canInvokeWhs = Boolean(whsBaseUrl && whsDelegationSecret);

    try {
      // Load execution to get the workflow snapshot (nodes/edges) that was captured at start.
      // This keeps behavior deterministic even if the workflow is edited mid-run.
      const execution = (await (ctx as any).runQuery?.(api.executions.get, {
        id: executionId,
      })) as any;

      const workflowSnapshot = execution?.workflowSnapshot ?? null;
      const nodes = Array.isArray(workflowSnapshot?.nodes)
        ? workflowSnapshot.nodes
        : [];

      // Minimal Phase 1.5-ish execution context:
      // - no DAG planning (still stub)
      // - sequential evaluation in stored order (deterministic)
      // - a small `currentData` object for later templating / node IO
      const currentData: Record<string, unknown> = {
        triggerData: args.triggerData ?? null,
      };

      // If there are no nodes, keep prior behavior (success with stub output),
      // but log that nothing ran so it's obvious in the UI.
      if (nodes.length === 0) {
        await ctx.runMutation(api.executionLogs.append, {
          executionId,
          nodeId: "__end__",
          status: "success",
          output: {
            message: "No nodes to execute (Phase 1.5 stub).",
            canInvokeWhs,
          },
          durationMs: Math.max(0, Date.now() - startedAtMs),
        });

        await ctx.runMutation(api.executions.complete, {
          id: executionId,
          status: "success",
          completedAt: Date.now(),
        });

        return { success: true, executionId };
      }

      // Execute nodes sequentially (MVP behavior).
      for (const node of nodes) {
        const nodeId =
          node && typeof node.id === "string" && node.id
            ? node.id
            : "(unknown)";
        const nodeType =
          node && typeof node.type === "string" && node.type
            ? node.type
            : "unknown";
        const config = node?.config ?? {};

        await ctx.runMutation(api.executionLogs.append, {
          executionId,
          nodeId,
          status: "started",
          input: {
            nodeType,
            config,
            currentDataKeys: Object.keys(currentData),
          },
        });

        // Phase 1 nodes:
        // - log_message: purely local, no WHS
        // - ai_agent: if configured with `whsAgentId`, call WHS (delegated path); otherwise stub
        if (nodeType === "log_message") {
          const msg =
            (config && typeof (config as any).message === "string"
              ? (config as any).message
              : null) ??
            (config && typeof (config as any).text === "string"
              ? (config as any).text
              : null) ??
            "(log_message)";

          await ctx.runMutation(api.executionLogs.append, {
            executionId,
            nodeId,
            status: "success",
            output: { logged: msg },
            durationMs: 0,
          });

          currentData[nodeId] = { logged: msg };
          continue;
        }

        if (nodeType === "ai_agent" || nodeType === "whs_agent") {
          const whsAgentId =
            config && typeof (config as any).whsAgentId === "string"
              ? (config as any).whsAgentId.trim()
              : config && typeof (config as any).agentId === "string"
                ? (config as any).agentId.trim()
                : "";

          const prompt =
            config && typeof (config as any).prompt === "string"
              ? (config as any).prompt
              : "";

          // If a WHS agent id isn't configured, keep behavior deterministic and explicit.
          if (!whsAgentId) {
            const output = {
              message:
                "ai_agent node executed as stub (missing config.whsAgentId).",
              hint: "Set node.config.whsAgentId to a WHS agent id to invoke via WHS.",
              prompt: prompt || null,
            };

            await ctx.runMutation(api.executionLogs.append, {
              executionId,
              nodeId,
              status: "success",
              output,
              durationMs: 0,
            });

            currentData[nodeId] = output;
            continue;
          }

          // Attempt WHS delegated invocation if configured; otherwise fail fast with a clear log.
          if (!canInvokeWhs) {
            const output = {
              message:
                "WHS invocation is not configured for Agentromatic backend execution.",
              requiredEnv: ["WHS_CONTROL_PLANE_URL", "WHS_DELEGATION_SECRET"],
              whsAgentId,
            };

            await ctx.runMutation(api.executionLogs.append, {
              executionId,
              nodeId,
              status: "failed",
              error: "WHS delegation config missing",
              output,
              durationMs: 0,
            });

            throw new Error(
              "WHS delegation config missing (set WHS_CONTROL_PLANE_URL and WHS_DELEGATION_SECRET).",
            );
          }

          const idempotencyKey = `agentromatic:exec:${executionId}:node:${nodeId}:attempt:1`;

          const delegatedBody = {
            delegation: {
              mode: "hmac_v1",
              externalUserId,
              idempotencyKey,
              correlation: {
                workflowId: String(args.workflowId),
                executionId: String(executionId),
                nodeId: String(nodeId),
                attempt: 1,
              },
            },
            invoke: {
              protocol: "invoke/v1",
              traceId: `trc_agentromatic_${String(executionId)}_${String(nodeId)}_attempt_1`,
              sessionId: null,
              input: {
                messages: [
                  {
                    role: "system",
                    content:
                      "You are executing a workflow step from Agentromatic.",
                  },
                  {
                    role: "user",
                    content: prompt || "Run this workflow step.",
                  },
                ],
              },
              metadata: {
                client: { name: "agentromatic", version: "0.0.0" },
              },
            },
          };

          const invoked = await invokeWhsDelegated({
            baseUrl: whsBaseUrl!,
            secret: whsDelegationSecret!,
            agentId: whsAgentId,
            source: "agentromatic",
            externalUserId,
            idempotencyKey,
            body: delegatedBody,
          });

          if (!invoked.ok) {
            await ctx.runMutation(api.executionLogs.append, {
              executionId,
              nodeId,
              status: "failed",
              error: invoked.errorMessage,
              output: {
                whsAgentId,
                status: invoked.status,
                responseSnippet: invoked.responseSnippet,
                note:
                  invoked.status === 404
                    ? "If this is WHS Slice B, implement /v1/delegated/invoke/{agentId} first."
                    : undefined,
              },
              durationMs: invoked.durationMs,
            });

            throw new Error(invoked.errorMessage);
          }

          // Success: persist the response as node output.
          await ctx.runMutation(api.executionLogs.append, {
            executionId,
            nodeId,
            status: "success",
            output: invoked.responseJson ?? { raw: invoked.responseText },
            durationMs: invoked.durationMs,
          });

          currentData[nodeId] = invoked.responseJson ?? invoked.responseText;
          continue;
        }

        // Unknown node type: make it explicit and deterministic.
        await ctx.runMutation(api.executionLogs.append, {
          executionId,
          nodeId,
          status: "skipped",
          output: {
            message: "Node skipped (unknown node type in Phase 1.5 stub).",
            nodeType,
          },
          durationMs: 0,
        });
      }

      await ctx.runMutation(api.executionLogs.append, {
        executionId,
        nodeId: "__end__",
        status: "success",
        output: {
          message: "Execution completed (Phase 1.5 stub runner).",
          nodesExecuted: nodes.length,
          canInvokeWhs,
        },
        durationMs: Math.max(0, Date.now() - startedAtMs),
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
          output: {
            message: "Execution failed (Phase 1.5 stub runner).",
            canInvokeWhs,
          },
          durationMs: Math.max(0, Date.now() - startedAtMs),
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

/**
 * Env helpers (Convex server functions expose env via `globalThis.process.env`).
 * Keep this optional and non-throwy by default; call sites decide whether missing env is fatal.
 */
function getEnvString(name: string): string | null {
  const raw = (globalThis as any)?.process?.env?.[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeBaseUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

/**
 * Best-effort key decoding for `WHS_DELEGATION_SECRET`.
 *
 * Supported:
 * - `hex:<hex-bytes>`
 * - base64url (unpadded) / base64 (padded)
 *
 * IMPORTANT:
 * - This is only used to sign requests; never log the secret.
 */
function decodeKeyStringBestEffort(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("hex:")) {
    return hexToBytes(trimmed.slice(4).trim());
  }

  // Default: treat as base64url/base64.
  try {
    return base64UrlDecode(trimmed);
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const s = hex.trim();
  if (s.length === 0 || s.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byteHex = s.slice(i * 2, i * 2 + 2);
    const n = Number.parseInt(byteHex, 16);
    if (!Number.isFinite(n)) throw new Error("Invalid hex");
    out[i] = n;
  }
  return out;
}

function base64UrlDecode(b64urlOrB64: string): Uint8Array {
  // Normalize base64url -> base64
  let s = b64urlOrB64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  // Pad to multiple of 4
  const padLen = (4 - (s.length % 4)) % 4;
  if (padLen) s += "=".repeat(padLen);

  // Decode base64 without Buffer (compatible with browser-ish runtimes).
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  lookup.fill(255);
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
  }
  lookup["=".charCodeAt(0)] = 254;

  if (s.length % 4 !== 0) throw new Error("Invalid base64");

  let padding = 0;
  if (s.endsWith("==")) padding = 2;
  else if (s.endsWith("=")) padding = 1;

  const outLen = (s.length / 4) * 3 - padding;
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c0 = s.charCodeAt(i);
    const c1 = s.charCodeAt(i + 1);
    const c2 = s.charCodeAt(i + 2);
    const c3 = s.charCodeAt(i + 3);

    const v0 = lookup[c0]!;
    const v1 = lookup[c1]!;
    const v2 = lookup[c2]!;
    const v3 = lookup[c3]!;

    if (v0 === 255 || v1 === 255 || v2 === 255 || v3 === 255) {
      throw new Error("Invalid base64");
    }

    const isPad2 = v2 === 254;
    const isPad3 = v3 === 254;
    if (isPad2 && !isPad3) throw new Error("Invalid base64 padding");

    const b0 = v0 === 254 ? 0 : v0;
    const b1 = v1 === 254 ? 0 : v1;
    const b2 = v2 === 254 ? 0 : v2;
    const b3 = v3 === 254 ? 0 : v3;

    const n = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;

    if (outIdx < outLen) out[outIdx++] = (n >>> 16) & 255;
    if (!isPad2 && outIdx < outLen) out[outIdx++] = (n >>> 8) & 255;
    if (!isPad3 && outIdx < outLen) out[outIdx++] = n & 255;
  }

  return out;
}

function bytesToHexLower(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return s;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function hmacSha256Hex(
  key: Uint8Array,
  data: Uint8Array,
): Promise<string> {
  const subtle: SubtleCrypto | undefined = (globalThis as any)?.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto subtle crypto is not available");

  const cryptoKey = await subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await subtle.sign("HMAC", cryptoKey, toArrayBuffer(data));
  return bytesToHexLower(new Uint8Array(sig));
}

function safeSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars)) + "…";
}

async function invokeWhsDelegated(args: {
  baseUrl: string;
  secret: Uint8Array;
  agentId: string;
  source: string;
  externalUserId: string;
  idempotencyKey: string;
  body: unknown;
}): Promise<{
  ok: boolean;
  status: number;
  durationMs: number;
  responseText: string;
  responseJson: any | null;
  responseSnippet: string;
  errorMessage: string;
}> {
  const startMs = Date.now();

  const url = `${args.baseUrl}/v1/delegated/invoke/${encodeURIComponent(
    args.agentId,
  )}`;

  const rawBody = JSON.stringify(args.body);
  const bodyBytes = new TextEncoder().encode(rawBody);

  const timestampMs = Date.now();
  const signatureHex = await hmacSha256Hex(args.secret, bodyBytes);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-whs-delegation-source": args.source,
      "x-whs-delegation-timestamp": String(timestampMs),
      "x-whs-delegation-signature": `v1=${signatureHex}`,
    },
    body: rawBody,
  });

  const durationMs = Math.max(0, Date.now() - startMs);

  let responseText = "";
  try {
    responseText = await res.text();
  } catch {
    responseText = "";
  }

  let responseJson: any | null = null;
  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = null;
  }

  const ok = res.status >= 200 && res.status < 300;

  return {
    ok,
    status: res.status,
    durationMs,
    responseText,
    responseJson,
    responseSnippet: safeSnippet(responseText || "", 800),
    errorMessage: ok
      ? ""
      : `WHS delegated invoke failed (status ${res.status})`,
  };
}
