import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

import { WorkflowBuilder, type WorkflowGraphValue } from "./WorkflowBuilder";

/* eslint-disable react-hooks/set-state-in-effect -- Visual editor intentionally syncs local draft state from auth/query results */

/* Workflow id is now provided via props (no URL parsing here). */

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '"(unserializable)"';
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const maybeWithData = err as { data?: unknown };
    const data = maybeWithData.data;

    const dataBlock = data !== undefined ? `\n\ndata:\n${safeJson(data)}` : "";
    const stackBlock = err.stack ? `\n\nstack:\n${err.stack}` : "";

    return `${err.name}: ${err.message}${dataBlock}${stackBlock}`;
  }
  return safeJson(err);
}

/**
 * Full-page visual editor for a single workflow.
 *
 * Intended to be mounted at its own URL (e.g. `/workflows/:id/visual`).
 * This component:
 * - boots the current user (so Convex queries/mutations don't fail on missing user rows),
 * - loads the workflow,
 * - renders `WorkflowBuilder` as the entire page,
 * - provides a small floating save affordance.
 */
export default function WorkflowVisualEditorPage(props: {
  workflowId: Id<"workflows">;
}): React.ReactElement {
  const { workflowId } = props;

  const { isLoaded, isSignedIn, userId } = useAuth();

  const bootstrap = useMutation(api.users.bootstrap);
  const updateWorkflow = useMutation(api.workflows.update);

  const [bootstrappedUserId, setBootstrappedUserId] =
    useState<Id<"users"> | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const isBootstrapped = bootstrappedUserId !== null;

  useEffect(() => {
    let alive = true;

    if (!isLoaded) return;

    if (!isSignedIn) {
      setBootstrappedUserId(null);
      setBootstrapError(null);
      return;
    }

    void (async () => {
      try {
        const res = await bootstrap({});
        if (!alive) return;
        setBootstrappedUserId(res.userId);
        setBootstrapError(null);
      } catch (err) {
        if (!alive) return;
        setBootstrapError(describeError(err));
      }
    })();

    return () => {
      alive = false;
    };
  }, [bootstrap, isLoaded, isSignedIn, userId]);

  const workflow = useQuery(
    api.workflows.get,
    isBootstrapped ? { id: workflowId } : "skip",
  );
  type UpdateWorkflowPatch = Parameters<typeof updateWorkflow>[0]["patch"];

  const [graphDraft, setGraphDraft] = useState<WorkflowGraphValue>({
    nodes: [],
    edges: [],
  });
  const [graphDirty, setGraphDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  // Keep the visual draft in sync with the loaded workflow unless the user has started editing.
  useEffect(() => {
    if (!workflow) return;
    if (graphDirty) return;

    setGraphDraft({
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
    });
    setSaveError(null);
    setSaveState("idle");
  }, [graphDirty, workflow]);

  const onSave = useCallback(async () => {
    setSaveError(null);
    setSaveState("saving");

    try {
      const patch: UpdateWorkflowPatch = {
        nodes: graphDraft.nodes,
        edges: graphDraft.edges,
      };

      await updateWorkflow({
        id: workflowId,
        patch,
      });

      setGraphDirty(false);
      setSaveState("saved");

      // Auto-reset the saved badge after a moment.
      window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 1200);
    } catch (err) {
      setSaveState("idle");
      setSaveError(describeError(err));
    }
  }, [graphDraft.edges, graphDraft.nodes, updateWorkflow, workflowId]);

  const canShowEditor =
    isLoaded &&
    isSignedIn &&
    isBootstrapped &&
    workflow !== undefined &&
    workflow !== null;

  if (!isLoaded) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        Loading auth…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        You must be signed in to edit workflows.
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
          whiteSpace: "pre-wrap",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
        }}
      >
        Bootstrap error:
        {"\n\n"}
        {bootstrapError}
      </div>
    );
  }

  if (!isBootstrapped) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        Preparing editor…
      </div>
    );
  }

  if (workflow === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        Loading workflow…
      </div>
    );
  }

  if (workflow === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        Workflow not found:{" "}
        <span style={{ fontWeight: 900 }}>{String(workflowId)}</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Full-page editor */}
      <WorkflowBuilder
        value={graphDraft}
        onChange={(next) => {
          setGraphDraft(next);
          setGraphDirty(true);
          setSaveState("idle");
        }}
        style={{
          // Ensure the builder truly owns the viewport.
          height: "100vh",
        }}
      />

      {/* Floating save/status control (kept out of the builder's own top bar) */}
      {canShowEditor ? (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
            pointerEvents: "none",
          }}
        >
          {saveError ? (
            <div
              style={{
                maxWidth: 520,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(239,68,68,0.45)",
                background: "rgba(239,68,68,0.14)",
                color: "#fee2e2",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                pointerEvents: "auto",
              }}
            >
              {saveError}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              pointerEvents: "auto",
            }}
          >
            <a
              href="/"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(10, 14, 28, 0.88)",
                color: "#e5e7eb",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 12,
                backdropFilter: "blur(10px)",
              }}
              title="Back to app"
            >
              Back
            </a>

            <button
              type="button"
              onClick={onSave}
              disabled={!graphDirty || saveState === "saving"}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background:
                  !graphDirty || saveState === "saving"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(59,130,246,0.92)",
                color: "#e5e7eb",
                cursor:
                  !graphDirty || saveState === "saving"
                    ? "not-allowed"
                    : "pointer",
                fontWeight: 900,
                fontSize: 12,
                backdropFilter: "blur(10px)",
              }}
              title={graphDirty ? "Save workflow definition" : "No changes"}
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Save"}
            </button>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(10, 14, 28, 0.72)",
                color: "rgba(229,231,235,0.80)",
                fontSize: 12,
                fontWeight: 800,
                backdropFilter: "blur(10px)",
              }}
              title="Workflow info"
            >
              {workflow.name ?? "Workflow"}{" "}
              <span style={{ opacity: 0.75 }}>•</span>{" "}
              {workflow.status ?? "unknown"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
