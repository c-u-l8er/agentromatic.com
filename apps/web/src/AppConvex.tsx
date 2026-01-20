import { useEffect, useState, useSyncExternalStore } from "react";
import { ConvexProvider, ConvexReactClient, useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import "./App.css";

type Route =
  | { name: "workflows" }
  | { name: "workflow"; workflowId: Id<"workflows"> }
  | { name: "execution"; executionId: Id<"executions"> };

function parseRoute(hash: string): Route {
  const raw = (hash || "").startsWith("#") ? (hash || "").slice(1) : hash || "";
  const path = raw.startsWith("/") ? raw : "/" + raw;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "workflows" };
  const head = parts[0];
  const a = parts[1];
  if (head === "workflows") return a ? { name: "workflow", workflowId: a as any } : { name: "workflows" };
  if (head === "executions") return a ? { name: "execution", executionId: a as any } : { name: "workflows" };
  return { name: "workflows" };
}

function useHashRoute(): Route {
  return useSyncExternalStore(
    (listener) => {
      const onChange = () => listener();
      window.addEventListener("hashchange", onChange);
      return () => window.removeEventListener("hashchange", onChange);
    },
    () => parseRoute(window.location.hash),
    () => ({ name: "workflows" }),
  );
}

function setRoute(route: Route) {
  if (route.name === "workflows") {
    window.location.hash = "#/workflows";
    return;
  }
  if (route.name === "workflow") {
    window.location.hash = "#/workflows/" + encodeURIComponent(String(route.workflowId));
    return;
  }
  window.location.hash = "#/executions/" + encodeURIComponent(String(route.executionId));
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return ""(unserializable)"";
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid JSON" };
  }
}

function formatDateTime(ms?: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function btn(primary?: boolean): React.CSSProperties {
  return {
    padding: primary ? "10px 12px" : "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    background: primary ? "white" : "transparent",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: primary ? 900 : 800,
  };
}

function input(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
  };
}

function ta(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.4,
  };
}

function pre(): React.CSSProperties {
  return {
    marginTop: 8,
    marginBottom: 0,
    padding: 12,
    overflowX: "auto",
    background: "rgba(0,0,0,0.06)",
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.4,
  };
}

function AppInner() {
  const route = useHashRoute();

  const bootstrap = useMutation(api.users.bootstrap);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        await bootstrap({});
        if (!canceled) setBootstrapped(true);
      } catch (err) {
        if (!canceled) setBootstrapError(err instanceof Error ? err.message : "Bootstrap failed");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [bootstrap]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Agentromatic</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Phase 1: Workflows CRUD + executions + logs.</p>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            Hash: <code>{window.location.hash || "#/workflows"}</code>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => setRoute({ name: "workflows" })} style={btn()}>
            Workflows
          </button>
        </nav>
      </header>

      {!bootstrapped ? (
        <section className="card" style={{ marginTop: 16, textAlign: "left" }}>
          <h2 style={{ marginTop: 0 }}>Connecting…</h2>
          <p style={{ opacity: 0.85, marginBottom: 0 }}>
            Bootstrapping your user record. If you have not wired auth yet, enable dev anonymous mode in Convex.
          </p>
          {bootstrapError ? (
            <div style={{ marginTop: 12, color: "#991b1b", fontWeight: 800, whiteSpace: "pre-wrap" }}>{bootstrapError}</div>
          ) : null}
        </section>
      ) : route.name === "workflows" ? (
        <WorkflowsList
          onOpenWorkflow={(id) => setRoute({ name: "workflow", workflowId: id })}
          onOpenExecution={(id) => setRoute({ name: "execution", executionId: id })}
        />
      ) : route.name === "workflow" ? (
        <WorkflowDetail
          workflowId={route.workflowId}
          onBack={() => setRoute({ name: "workflows" })}
          onOpenExecution={(id) => setRoute({ name: "execution", executionId: id })}
        />
      ) : (
        <ExecutionDetail executionId={route.executionId} onBack={() => setRoute({ name: "workflows" })} />
      )}

      <footer style={{ marginTop: 20, fontSize: 12, opacity: 0.7 }}>
        Hash routes: <code>#/workflows</code> · <code>#/workflows/&lt;id&gt;</code> · <code>#/executions/&lt;id&gt;</code>
      </footer>
    </div>
  );
}

export default function App() {
  const url = (import.meta as any).env?.VITE_CONVEX_URL as string | undefined;

  if (!url) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Agentromatic</h1>
        <section className="card" style={{ marginTop: 16, textAlign: "left" }}>
          <h2 style={{ marginTop: 0 }}>Missing VITE_CONVEX_URL</h2>
          <p style={{ opacity: 0.85 }}>
            Create <code>apps/web/.env.local</code> and set <code>VITE_CONVEX_URL</code> to your Convex deployment URL.
          </p>
          <p style={{ opacity: 0.85, marginBottom: 0 }}>
            Convex wrote <code>CONVEX_URL</code> into the repo root <code>.env.local</code> when you ran <code>npx convex dev</code>. Copy that value.
          </p>
        </section>
      </div>
    );
  }

  const client = new ConvexReactClient(url);

  return (
    <ConvexProvider client={client}>
      <AppInner />
    </ConvexProvider>
  );
}

function WorkflowsList(props: {
  onOpenWorkflow: (id: Id<"workflows">) => void;
  onOpenExecution: (id: Id<"executions">) => void;
}) {
  const workflows = useQuery(api.workflows.list, { limit: 50 });
  const createWorkflow = useMutation(api.workflows.create);
  const removeWorkflow = useMutation(api.workflows.remove);
  const runWorkflow = useAction(api.executeWorkflow.executeWorkflow);

  const [name, setName] = useState("New workflow");
  const [triggerType, setTriggerType] = useState<"manual" | "webhook" | "schedule" | "email">("manual");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 16 }}>
      <section className="card" style={{ textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>Create workflow</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={input()} />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Trigger</div>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as any)} style={input()}>
              <option value="manual">manual</option>
              <option value="webhook">webhook</option>
              <option value="schedule">schedule</option>
              <option value="email">email</option>
            </select>
          </label>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const id = await createWorkflow({
                  name: name.trim() || "Untitled workflow",
                  trigger: { type: triggerType, config: {} },
                  status: "draft",
                });
                props.onOpenWorkflow(id);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Create failed");
              }
            }}
            style={btn(true)}
          >
            Create
          </button>
        </div>
        {error ? <div style={{ marginTop: 12, color: "#991b1b", fontWeight: 800, whiteSpace: "pre-wrap" }}>{error}</div> : null}
      </section>

      <section className="card" style={{ marginTop: 16, textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>Workflows</h2>
        {!workflows ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : workflows.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No workflows yet.</div>
        ) : (
          <div style={{ marginTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            {workflows.map((w) => (
              <div
                key={String(w._id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 200px auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <button
                  type="button"
                  onClick={() => props.onOpenWorkflow(w._id)}
                  style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{w.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    <code>{String(w._id)}</code>
                  </div>
                </button>

                <div style={{ fontSize: 12, fontWeight: 800 }}>{w.status}</div>

                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Updated <code>{formatDateTime(w.updatedAt)}</code>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await runWorkflow({ workflowId: w._id, triggerData: { example: true } });
                      props.onOpenExecution(res.executionId);
                    }}
                    style={btn()}
                  >
                    Run
                  </button>
                  <button type="button" onClick={() => props.onOpenWorkflow(w._id)} style={btn()}>
                    View
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = window.confirm("Delete this workflow? This is a hard delete in Phase 1.");
                      if (!ok) return;
                      await removeWorkflow({ id: w._id });
                    }}
                    style={{ ...btn(), color: "#b42318" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WorkflowDetail(props: {
  workflowId: Id<"workflows">;
  onBack: () => void;
  onOpenExecution: (id: Id<"executions">) => void;
}) {
  const workflow = useQuery(api.workflows.get, { id: props.workflowId });
  const executions = useQuery(api.executions.listByWorkflow, { workflowId: props.workflowId, limit: 20 });

  const update = useMutation(api.workflows.update);
  const setStatus = useMutation(api.workflows.setStatus);
  const run = useAction(api.executeWorkflow.executeWorkflow);

  const [name, setName] = useState("");
  const [triggerText, setTriggerText] = useState(safeJson({ type: "manual", config: {} }));
  const [nodesText, setNodesText] = useState("[]");
  const [edgesText, setEdgesText] = useState("[]");
  const [triggerDataText, setTriggerDataText] = useState(safeJson({ example: true }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setTriggerText(safeJson(workflow.trigger));
    setNodesText(safeJson(workflow.nodes));
    setEdgesText(safeJson(workflow.edges));
  }, [workflow?._id]);

  const onSave = async () => {
    setError(null);
    if (!workflow) return;

    const t = parseJson(triggerText);
    if (!t.ok) return setError("Trigger JSON error: " + t.error);
    const n = parseJson(nodesText);
    if (!n.ok) return setError("Nodes JSON error: " + n.error);
    const e = parseJson(edgesText);
    if (!e.ok) return setError("Edges JSON error: " + e.error);

    try {
      await update({
        id: workflow._id,
        patch: {
          name: name.trim() || workflow.name,
          trigger: t.value as any,
          nodes: n.value as any,
          edges: e.value as any,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onRun = async () => {
    setError(null);
    if (!workflow) return;

    const td = parseJson(triggerDataText);
    if (!td.ok) return setError("triggerData JSON error: " + td.error);

    try {
      const res = await run({ workflowId: workflow._id, triggerData: td.value });
      props.onOpenExecution(res.executionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <section className="card" style={{ textAlign: "left" }}>
        <button type="button" onClick={props.onBack} style={btn()}>
          ← Workflows
        </button>

        {!workflow ? (
          <div style={{ marginTop: 12, opacity: 0.8 }}>Loading…</div>
        ) : (
          <>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>{workflow.name}</h2>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  id: <code>{String(workflow._id)}</code>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={onSave} style={btn()}>
                  Save
                </button>
                <button type="button" onClick={onRun} style={btn()}>
                  Run (stub)
                </button>
              </div>
            </div>

            {error ? <div style={{ marginTop: 12, color: "#991b1b", fontWeight: 800, whiteSpace: "pre-wrap" }}>{error}</div> : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 12, marginTop: 14 }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Name</div>
                <input value={name} onChange={(e) => setName(e.target.value)} style={input()} />
              </label>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Status</div>
                <select
                  value={workflow.status}
                  onChange={async (e) => {
                    await setStatus({ id: workflow._id, status: e.target.value as any });
                  }}
                  style={input()}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Trigger</div>
                <textarea value={triggerText} onChange={(e) => setTriggerText(e.target.value)} rows={7} style={ta()} />
              </label>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Nodes</div>
                <textarea value={nodesText} onChange={(e) => setNodesText(e.target.value)} rows={8} style={ta()} />
              </label>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Edges</div>
                <textarea value={edgesText} onChange={(e) => setEdgesText(e.target.value)} rows={7} style={ta()} />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Run (stub)</h3>
              <textarea value={triggerDataText} onChange={(e) => setTriggerDataText(e.target.value)} rows={6} style={ta()} />
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={onRun} style={btn()}>
                  Run now
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card" style={{ marginTop: 16, textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>Executions</h2>
        {!executions ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : executions.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No runs yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {executions.map((x) => (
              <div
                key={String(x._id)}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>
                    <code>{String(x._id)}</code>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    started: <code>{formatDateTime(x.startedAt)}</code> · completed: <code>{formatDateTime(x.completedAt)}</code>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{x.status}</div>
                  <button type="button" onClick={() => props.onOpenExecution(x._id)} style={btn()}>
                    View logs
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ExecutionDetail(props: { executionId: Id<"executions">; onBack: () => void }) {
  const execution = useQuery(api.executions.get, { id: props.executionId });
  const logs = useQuery(api.executionLogs.list, { executionId: props.executionId, limit: 500 });

  return (
    <div style={{ marginTop: 16 }}>
      <section className="card" style={{ textAlign: "left" }}>
        <button type="button" onClick={props.onBack} style={btn()}>
          ← Workflows
        </button>

        {!execution ? (
          <div style={{ marginTop: 12, opacity: 0.8 }}>Loading…</div>
        ) : (
          <>
            <h2 style={{ marginTop: 10 }}>Execution</h2>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              id: <code>{String(execution._id)}</code> · workflow: <code>{String(execution.workflowId)}</code>
            </div>
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Started</div>
                <div style={{ fontWeight: 800 }}>{formatDateTime(execution.startedAt)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Completed</div>
                <div style={{ fontWeight: 800 }}>{formatDateTime(execution.completedAt)}</div>
              </div>
            </div>
            {execution.error ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#991b1b",
                  fontWeight: 800,
                  whiteSpace: "pre-wrap",
                }}
              >
                {execution.error}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="card" style={{ marginTop: 16, textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>Logs</h2>
        {!logs ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No logs recorded.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {logs.map((l) => (
              <div key={String(l._id)} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 900 }}>
                    node: <code>{l.nodeId}</code>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {l.status} · <code>{formatDateTime(l.createdAt)}</code>
                  </div>
                </div>
                {l.error ? <div style={{ marginTop: 10, color: "#991b1b", fontWeight: 800, whiteSpace: "pre-wrap" }}>{l.error}</div> : null}
                {l.input !== undefined ? (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>Input</summary>
                    <pre style={pre()}>{safeJson(l.input)}</pre>
                  </details>
                ) : null}
                {l.output !== undefined ? (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>Output</summary>
                    <pre style={pre()}>{safeJson(l.output)}</pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
