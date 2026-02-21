import React, { useEffect, useState } from "react";
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import MarketingHome from "./MarketingHome";

function mustGetConvexUrl(): string {
  const url = (import.meta as any).env?.VITE_CONVEX_URL as string | undefined;
  if (!url || typeof url !== "string") {
    throw new Error(
      `Missing VITE_CONVEX_URL.

Preferred setup:
- Run \`npx convex dev\` once; it writes \`CONVEX_URL\` to the repo root \`.env.local\`.
- The web app's Vite config maps \`CONVEX_URL\` -> \`VITE_CONVEX_URL\` automatically.

Fallback:
- Create \`apps/web/.env.local\` and set:
  VITE_CONVEX_URL=<value of CONVEX_URL>`,
    );
  }
  return url;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // IMPORTANT: must be a valid string literal.
    return '"(unserializable)"';
  }
}

function parseJsonOrThrow<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${message}`);
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as any;
    const data = anyErr?.data;

    const dataBlock = data !== undefined ? `\n\ndata:\n${safeJson(data)}` : "";

    const stackBlock = err.stack ? `\n\nstack:\n${err.stack}` : "";

    return `${err.name}: ${err.message}${dataBlock}${stackBlock}`;
  }

  return safeJson(err);
}

type TabKey = "workflows" | "executions";

export default function AppConvex(): React.ReactElement {
  // Providers are set up in `src/main.tsx` (ClerkProvider + ConvexProviderWithClerk).

  return (
    <>
      <SignedOut>
        <MarketingHome />
      </SignedOut>

      <SignedIn>
        <AppInner />
      </SignedIn>
    </>
  );
}

function AppInner(): React.ReactElement {
  const { isLoaded, isSignedIn, userId } = useAuth();

  const convexUrl = mustGetConvexUrl();

  const bootstrap = useMutation(api.users.bootstrap);

  const [bootstrappedUserId, setBootstrappedUserId] =
    useState<Id<"users"> | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const isBootstrapped = bootstrappedUserId !== null;

  // Gate queries until bootstrap succeeds (prevents missing-user-row errors from crashing the app).
  const me = useQuery(api.users.me, isBootstrapped ? {} : "skip");

  useEffect(() => {
    let alive = true;

    // If auth isn't ready yet, do nothing.
    if (!isLoaded) return;

    // If signed out, clear local bootstrap state.
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

  const [tab, setTab] = useState<TabKey>("workflows");

  const workflows = useQuery(
    api.workflows.list,
    isBootstrapped ? { limit: 50 } : "skip",
  );
  const createWorkflow = useMutation(api.workflows.create);
  const updateWorkflow = useMutation(api.workflows.update);
  const removeWorkflow = useMutation(api.workflows.remove);
  const setWorkflowStatus = useMutation(api.workflows.setStatus);

  const executeWorkflow = useAction(api.executeWorkflow.executeWorkflow);

  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState<Id<"workflows"> | null>(null);
  const selectedWorkflow = useQuery(
    api.workflows.get,
    isBootstrapped && selectedWorkflowId ? { id: selectedWorkflowId } : "skip",
  );

  const executionsForWorkflow = useQuery(
    api.executions.listByWorkflow,
    isBootstrapped && selectedWorkflowId
      ? { workflowId: selectedWorkflowId, limit: 50 }
      : "skip",
  );

  const [selectedExecutionId, setSelectedExecutionId] =
    useState<Id<"executions"> | null>(null);
  const selectedExecution = useQuery(
    api.executions.get,
    isBootstrapped && selectedExecutionId
      ? { id: selectedExecutionId }
      : "skip",
  );
  const executionLogs = useQuery(
    api.executionLogs.list,
    isBootstrapped && selectedExecutionId
      ? { executionId: selectedExecutionId, limit: 500 }
      : "skip",
  );

  const [newWorkflowName, setNewWorkflowName] = useState<string>("My workflow");
  const [createError, setCreateError] = useState<string | null>(null);

  // Advanced editor (kept for debugging / editing non-visual fields like trigger/name/status).
  const [workflowEditorText, setWorkflowEditorText] = useState<string>("");
  const [workflowEditorDirty, setWorkflowEditorDirty] =
    useState<boolean>(false);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(
    null,
  );

  const [triggerDataText, setTriggerDataText] = useState<string>(safeJson({}));
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<string | null>(null);

  // Keep editors in sync when selection changes, unless the user has modified them.
  useEffect(() => {
    if (!selectedWorkflow) return;

    if (!workflowEditorDirty) {
      setWorkflowEditorText(safeJson(selectedWorkflow));
      setWorkflowSaveError(null);
    }
  }, [selectedWorkflow, workflowEditorDirty]);

  async function onCreateWorkflow(): Promise<void> {
    setCreateError(null);
    try {
      const id = await createWorkflow({
        name: newWorkflowName.trim() || "Untitled workflow",
        trigger: { type: "manual", config: {} },
        nodes: [],
        edges: [],
        status: "draft",
      });
      setSelectedWorkflowId(id);
      setTab("workflows");
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setCreateError(message);
    }
  }

  async function onSaveWorkflowJson(): Promise<void> {
    if (!selectedWorkflowId) return;

    setWorkflowSaveError(null);

    try {
      const parsed =
        parseJsonOrThrow<Record<string, unknown>>(workflowEditorText);

      // We only allow patching whitelisted fields in Phase 1.
      // Backend expects: { id, patch: { name?, trigger?, nodes?, edges?, status? } }
      const patch: Record<string, unknown> = {};

      if ("name" in parsed) patch.name = parsed.name;
      if ("trigger" in parsed) patch.trigger = parsed.trigger;
      if ("nodes" in parsed) patch.nodes = parsed.nodes;
      if ("edges" in parsed) patch.edges = parsed.edges;
      if ("status" in parsed) patch.status = parsed.status;

      await updateWorkflow({ id: selectedWorkflowId, patch: patch as any });
      setWorkflowEditorDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setWorkflowSaveError(message);
    }
  }

  async function onDeleteWorkflow(): Promise<void> {
    if (!selectedWorkflowId) return;
    const ok = window.confirm(
      "Delete this workflow? This is permanent in Phase 1.",
    );
    if (!ok) return;

    try {
      await removeWorkflow({ id: selectedWorkflowId });
      setSelectedWorkflowId(null);
      setSelectedExecutionId(null);
      setWorkflowEditorText("");
      setWorkflowEditorDirty(false);
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setWorkflowSaveError(message);
    }
  }

  async function onToggleWorkflowStatus(): Promise<void> {
    if (!selectedWorkflowId || !selectedWorkflow) return;

    const next =
      selectedWorkflow.status === "draft"
        ? "active"
        : selectedWorkflow.status === "active"
          ? "paused"
          : "active";

    try {
      await setWorkflowStatus({ id: selectedWorkflowId, status: next });
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setWorkflowSaveError(message);
    }
  }

  async function onRunWorkflow(): Promise<void> {
    if (!selectedWorkflowId) return;

    setRunError(null);
    setLastRunResult(null);

    try {
      const triggerData = triggerDataText.trim()
        ? parseJsonOrThrow(triggerDataText)
        : undefined;
      const res = await executeWorkflow({
        workflowId: selectedWorkflowId,
        triggerData,
      });
      setLastRunResult(safeJson(res));
      setTab("executions");
      setSelectedExecutionId(res.executionId);
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setRunError(message);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>Agentromatic</div>
          {import.meta.env.DEV ? (
            <div style={styles.subtle}>
              Phase 1 UI → Convex wiring (dev only)
            </div>
          ) : null}
        </div>

        <div style={styles.headerRight}>
          <button
            style={tab === "workflows" ? styles.tabActive : styles.tab}
            onClick={() => setTab("workflows")}
            type="button"
          >
            Workflows
          </button>
          <button
            style={tab === "executions" ? styles.tabActive : styles.tab}
            onClick={() => setTab("executions")}
            type="button"
          >
            Executions
          </button>

          <div
            style={{ marginLeft: 12, display: "flex", alignItems: "center" }}
          >
            <UserButton />
          </div>
        </div>
      </header>

      {import.meta.env.DEV ? (
        <section style={styles.noticeBar}>
          <div style={styles.noticeRow}>
            <span style={styles.noticeLabel}>Convex URL:</span>
            <span style={styles.mono}>{convexUrl}</span>
          </div>

          <div style={styles.noticeRow}>
            <span style={styles.noticeLabel}>Bootstrap:</span>
            {bootstrapError ? (
              <pre style={{ ...styles.pre, flex: 1 }}>{bootstrapError}</pre>
            ) : (
              <span style={styles.mono}>
                {bootstrappedUserId
                  ? `OK userId=${bootstrappedUserId}`
                  : "loading..."}
              </span>
            )}
          </div>

          <div style={styles.noticeRow}>
            <span style={styles.noticeLabel}>Auth:</span>
            <span style={styles.mono}>
              {!isLoaded
                ? "loading..."
                : isSignedIn
                  ? `signed-in userId=${userId ?? "(unknown)"}`
                  : "signed-out"}
            </span>
          </div>

          <div style={styles.noticeRow}>
            <span style={styles.noticeLabel}>users.me:</span>
            <pre style={{ ...styles.pre, flex: 1 }}>
              {me === undefined ? "loading..." : safeJson(me)}
            </pre>
          </div>
        </section>
      ) : null}

      <main style={styles.main}>
        <div style={styles.sidebar}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Create workflow</div>
            <div style={styles.field}>
              <label style={styles.label}>Name</label>
              <input
                style={styles.input}
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                placeholder="Workflow name"
              />
            </div>
            <button
              style={styles.button}
              type="button"
              onClick={onCreateWorkflow}
            >
              Create
            </button>
            {createError ? <div style={styles.error}>{createError}</div> : null}
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Workflows</div>
            {workflows === undefined ? (
              <div style={styles.subtle}>Loading...</div>
            ) : workflows.length === 0 ? (
              <div style={styles.subtle}>No workflows yet.</div>
            ) : (
              <div style={styles.list}>
                {workflows.map((w) => (
                  <button
                    key={w._id}
                    type="button"
                    style={
                      w._id === selectedWorkflowId
                        ? styles.listItemActive
                        : styles.listItem
                    }
                    onClick={() => {
                      setSelectedWorkflowId(w._id);
                      setSelectedExecutionId(null);

                      setWorkflowEditorDirty(false);
                      setWorkflowSaveError(null);

                      setTab("workflows");
                    }}
                    title={w._id}
                  >
                    <div style={styles.listItemTitle}>{w.name}</div>
                    <div style={styles.listItemMeta}>
                      <span style={styles.badge}>{w.status}</span>
                      <span style={styles.monoSmall}>{w._id}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.content}>
          {tab === "workflows" ? (
            <div style={styles.panel}>
              <div style={styles.panelTitle}>Workflow</div>

              {!selectedWorkflowId ? (
                <div style={styles.subtle}>Select a workflow.</div>
              ) : selectedWorkflow === undefined ? (
                <div style={styles.subtle}>Loading workflow...</div>
              ) : (
                <>
                  <div style={styles.row}>
                    <div style={styles.rowLeft}>
                      <div style={styles.subtle}>
                        <span style={styles.noticeLabel}>ID:</span>{" "}
                        <span style={styles.mono}>{selectedWorkflow._id}</span>
                      </div>
                      <div style={styles.subtle}>
                        <span style={styles.noticeLabel}>Status:</span>{" "}
                        <span style={styles.badge}>
                          {selectedWorkflow.status}
                        </span>
                      </div>
                    </div>

                    <div style={styles.rowRight}>
                      <button
                        style={styles.buttonSecondary}
                        type="button"
                        onClick={onToggleWorkflowStatus}
                      >
                        Toggle status
                      </button>
                      <button
                        style={styles.buttonDanger}
                        type="button"
                        onClick={onDeleteWorkflow}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Definition (Visual)</label>

                    <a
                      href={`/workflows/${selectedWorkflow._id}/visual`}
                      style={{
                        ...styles.buttonSecondary,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textDecoration: "none",
                      }}
                    >
                      Open visual editor
                    </a>

                    <div style={styles.subtle}>
                      The visual workflow builder now lives on its own page for
                      a full-canvas editing experience.
                    </div>
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                      Advanced: Edit workflow JSON
                    </summary>

                    <div style={{ height: 10 }} />

                    <div style={styles.field}>
                      <label style={styles.label}>Workflow (JSON)</label>
                      <textarea
                        style={styles.textarea}
                        value={workflowEditorText}
                        onChange={(e) => {
                          setWorkflowEditorText(e.target.value);
                          setWorkflowEditorDirty(true);
                        }}
                        spellCheck={false}
                      />
                      <div style={styles.subtle}>
                        You can edit `name`, `trigger`, `nodes`, `edges`, and
                        `status` only. Other fields are ignored on save.
                      </div>
                    </div>

                    <div style={styles.row}>
                      <button
                        style={styles.buttonSecondary}
                        type="button"
                        onClick={onSaveWorkflowJson}
                        disabled={!workflowEditorDirty}
                      >
                        Save JSON changes
                      </button>
                      {workflowEditorDirty ? (
                        <span style={styles.subtle}>Unsaved JSON changes</span>
                      ) : (
                        <span style={styles.subtle}>JSON saved</span>
                      )}
                    </div>

                    {workflowSaveError ? (
                      <div style={styles.error}>{workflowSaveError}</div>
                    ) : null}
                  </details>

                  <hr style={styles.hr} />

                  <div style={styles.panelTitle}>Run (stub action)</div>
                  <div style={styles.field}>
                    <label style={styles.label}>triggerData (JSON)</label>
                    <textarea
                      style={{ ...styles.textarea, height: 140 }}
                      value={triggerDataText}
                      onChange={(e) => setTriggerDataText(e.target.value)}
                      spellCheck={false}
                    />
                  </div>

                  <div style={styles.row}>
                    <button
                      style={styles.button}
                      type="button"
                      onClick={onRunWorkflow}
                    >
                      Run workflow
                    </button>
                    {runError ? (
                      <span style={styles.errorInline}>{runError}</span>
                    ) : null}
                  </div>

                  {lastRunResult ? (
                    <div style={styles.field}>
                      <label style={styles.label}>Last run result</label>
                      <pre style={styles.pre}>{lastRunResult}</pre>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div style={styles.panel}>
              <div style={styles.panelTitle}>Executions</div>

              {!selectedWorkflowId ? (
                <div style={styles.subtle}>Select a workflow first.</div>
              ) : executionsForWorkflow === undefined ? (
                <div style={styles.subtle}>Loading executions...</div>
              ) : (
                <div style={styles.grid2}>
                  <div>
                    <div style={styles.panelTitleSmall}>For workflow</div>
                    <div style={styles.subtle}>
                      <span style={styles.noticeLabel}>workflowId:</span>{" "}
                      <span style={styles.mono}>{selectedWorkflowId}</span>
                    </div>

                    <div style={{ height: 12 }} />

                    {executionsForWorkflow.length === 0 ? (
                      <div style={styles.subtle}>
                        No executions yet. Run the workflow to create one.
                      </div>
                    ) : (
                      <div style={styles.list}>
                        {executionsForWorkflow.map((ex) => (
                          <button
                            key={ex._id}
                            type="button"
                            style={
                              ex._id === selectedExecutionId
                                ? styles.listItemActive
                                : styles.listItem
                            }
                            onClick={() => setSelectedExecutionId(ex._id)}
                            title={ex._id}
                          >
                            <div style={styles.listItemTitle}>
                              <span style={styles.badge}>{ex.status}</span>{" "}
                              <span style={styles.monoSmall}>{ex._id}</span>
                            </div>
                            <div style={styles.listItemMeta}>
                              <span style={styles.subtle}>startedAt:</span>{" "}
                              <span style={styles.monoSmall}>
                                {String(ex.startedAt)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={styles.panelTitleSmall}>Selected execution</div>
                    {!selectedExecutionId ? (
                      <div style={styles.subtle}>Select an execution.</div>
                    ) : selectedExecution === undefined ? (
                      <div style={styles.subtle}>Loading execution...</div>
                    ) : (
                      <>
                        <div style={styles.field}>
                          <label style={styles.label}>Execution</label>
                          <pre style={styles.pre}>
                            {safeJson(selectedExecution)}
                          </pre>
                        </div>

                        <div style={styles.field}>
                          <label style={styles.label}>Logs</label>
                          {executionLogs === undefined ? (
                            <div style={styles.subtle}>Loading logs...</div>
                          ) : executionLogs.length === 0 ? (
                            <div style={styles.subtle}>No logs yet.</div>
                          ) : (
                            <pre style={styles.pre}>
                              {safeJson(executionLogs)}
                            </pre>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer style={styles.footer}>
        <div style={styles.subtle}>
          Notes: This UI now expects Clerk auth. Ensure your Convex backend is
          configured for Clerk via
          <span style={styles.mono}> convex/auth.config.ts </span>
          and that the Convex env var
          <span style={styles.mono}> CLERK_JWT_ISSUER_DOMAIN </span>
          is set for the deployment.
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#111827",
    background: "#f9fafb",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: "1px solid #e5e7eb",
    background: "#ffffff",
  },
  brand: { fontWeight: 800, fontSize: 18 },
  subtle: { color: "#6b7280", fontSize: 13 },
  headerRight: { display: "flex", gap: 8 },
  tab: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
  },
  tabActive: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
  },
  noticeBar: {
    padding: "10px 20px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  noticeRow: { display: "flex", gap: 10, alignItems: "baseline" },
  noticeLabel: { fontWeight: 600, color: "#374151" },
  mono: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    color: "#111827",
  },
  monoSmall: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 11,
    color: "#374151",
  },
  main: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 16,
    padding: 16,
    alignItems: "start",
  },
  sidebar: { display: "flex", flexDirection: "column", gap: 16 },
  content: { display: "flex", flexDirection: "column", gap: 16 },
  panel: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 14,
  },
  panelTitle: { fontWeight: 700, marginBottom: 12 },
  panelTitleSmall: { fontWeight: 700, marginBottom: 8, fontSize: 13 },
  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 700, color: "#374151" },
  input: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
  },
  textarea: {
    height: 240,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    outline: "none",
    resize: "vertical",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
  },
  pre: {
    margin: 0,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    overflowX: "auto",
    fontSize: 12,
    lineHeight: 1.4,
  },
  button: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  buttonSecondary: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 700,
  },
  buttonDanger: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "#ef4444",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  error: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: 13,
    whiteSpace: "pre-wrap",
  },
  errorInline: { color: "#991b1b", fontSize: 13 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  listItem: {
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
  },
  listItemActive: {
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
  },
  listItemTitle: {
    fontWeight: 700,
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  listItemMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    background: "#e5e7eb",
    color: "#111827",
    fontSize: 12,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  rowLeft: { display: "flex", flexDirection: "column", gap: 4 },
  rowRight: { display: "flex", gap: 8, alignItems: "center" },
  hr: { border: 0, borderTop: "1px solid #e5e7eb", margin: "12px 0" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  footer: {
    padding: "12px 20px",
    borderTop: "1px solid #e5e7eb",
    background: "#fff",
  },
};
