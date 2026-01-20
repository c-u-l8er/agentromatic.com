import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

import { ids } from "../lib/ids";
import {
  createDefaultNode,
  isNodeType,
  listNodeDefinitions,
  parseNodeConfig,
  type NodeType,
} from "@agentromatic/shared";

/**
 * Storage-compatible workflow shapes (Phase 1)
 * (Convex stores edges without an id; React Flow requires edge ids at runtime.)
 */
export type WorkflowNodeShape = {
  id: string;
  type: string;
  position: { x: number; y: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
};

export type WorkflowEdgeShape = {
  source: string;
  target: string;
  condition?: string;
};

export type WorkflowGraphValue = {
  nodes: WorkflowNodeShape[];
  edges: WorkflowEdgeShape[];
};

type Props = {
  value: WorkflowGraphValue;
  onChange: (next: WorkflowGraphValue) => void;

  /**
   * Optional UX toggles.
   */
  readOnly?: boolean;

  /**
   * Optional styling hooks.
   */
  className?: string;
  style?: React.CSSProperties;
};

type NodeData = {
  nodeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  label: string;
};

type EdgeData = {
  condition?: string;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
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

function edgeKey(source: string, target: string): string {
  return `${source}→${target}`;
}

/**
 * We need stable React Flow edge ids even though storage edges have no id.
 * Strategy: derive an id from (source,target,indexAmongSamePair) deterministically.
 */
function toReactFlowEdges(storageEdges: WorkflowEdgeShape[]): Edge<EdgeData>[] {
  const counts = new Map<string, number>();

  return storageEdges.map((e) => {
    const key = edgeKey(e.source, e.target);
    const idx = counts.get(key) ?? 0;
    counts.set(key, idx + 1);

    const id = `edge_${e.source}_${e.target}_${idx}`;
    const label = e.condition?.trim() ? e.condition.trim() : "";

    return {
      id,
      source: e.source,
      target: e.target,
      label,
      data: { condition: e.condition },
      type: "default",
    };
  });
}

function fromReactFlowEdges(flowEdges: Edge<EdgeData>[]): WorkflowEdgeShape[] {
  // Preserve order as provided by React Flow state.
  // (Order doesn’t currently matter for engine MVP; keep deterministic anyway.)
  return flowEdges.map((e) => {
    const condition =
      typeof e.data?.condition === "string" &&
      e.data.condition.trim().length > 0
        ? e.data.condition.trim()
        : undefined;

    return { source: e.source, target: e.target, condition };
  });
}

function toReactFlowNodes(storageNodes: WorkflowNodeShape[]): Node<NodeData>[] {
  return storageNodes.map((n) => {
    const label = n.type || "(node)";
    return {
      id: n.id,
      position: n.position,
      data: {
        nodeType: n.type,
        config: n.config,
        label,
      },
      type: "default",
    };
  });
}

function fromReactFlowNodes(flowNodes: Node<NodeData>[]): WorkflowNodeShape[] {
  return flowNodes.map((n) => {
    const nodeType = n.data?.nodeType ?? "noop";
    return {
      id: n.id,
      type: nodeType,
      position: { x: n.position.x, y: n.position.y },
      config: n.data?.config ?? {},
    };
  });
}

export function WorkflowBuilder(props: Props): React.ReactElement {
  const { value, onChange, readOnly } = props;

  const palette = useMemo(() => listNodeDefinitions(), []);

  // Keep a local React Flow state for smooth interactions.
  const [nodes, setNodes] = useState<Node<NodeData>[]>(() =>
    toReactFlowNodes(value.nodes),
  );
  const [edges, setEdges] = useState<Edge<EdgeData>[]>(() =>
    toReactFlowEdges(value.edges),
  );

  /**
   * Prevent controlled-prop feedback loops from resetting internal state.
   *
   * When the user edits the graph, we:
   *  1) update local ReactFlow state immediately, and
   *  2) call `onChange(...)` so the parent persists the new nodes/edges.
   *
   * The parent then re-renders with a new `value` object, which would normally
   * trigger our "sync from props" effect and re-set `nodes/edges` again.
   *
   * To avoid that, we record the latest serialized value we *just emitted*.
   * When the parent echoes it back, the effect becomes a no-op.
   */
  const lastSerializedRef = useRef<string>("");
  useEffect(() => {
    const serialized = safeJson(value);
    if (serialized === lastSerializedRef.current) return;

    lastSerializedRef.current = serialized;
    setNodes(toReactFlowNodes(value.nodes));
    setEdges(toReactFlowEdges(value.edges));
  }, [value]);

  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

  const pushChange = useCallback(
    (nextNodes: Node<NodeData>[], nextEdges: Edge<EdgeData>[]) => {
      const nextValue = {
        nodes: fromReactFlowNodes(nextNodes),
        edges: fromReactFlowEdges(nextEdges),
      };

      // Critical: set this BEFORE calling onChange so the prop echo doesn't resync/reset.
      lastSerializedRef.current = safeJson(nextValue);

      onChange(nextValue);
    },
    [onChange],
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev);
        // Keep storage in sync on any change (positions, deletions, etc.).
        pushChange(next, edges);
        return next;
      });
    },
    [edges, pushChange],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev);
        pushChange(nodes, next);
        return next;
      });
    },
    [nodes, pushChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;

      const { source, target } = connection;
      if (!source || !target) return;

      // Disallow duplicate edges for the same pair in MVP (keeps storage unambiguous).
      const alreadyExists = edges.some(
        (e) => e.source === source && e.target === target,
      );
      if (alreadyExists) return;

      const newEdge: Edge<EdgeData> = {
        id: `edge_${ids.edge()}`,
        source,
        target,
        data: {},
        label: "",
        type: "default",
      };

      setEdges((prev) => {
        const next = addEdge(newEdge, prev);
        pushChange(nodes, next);
        return next;
      });
    },
    [edges, nodes, pushChange, readOnly],
  );

  /**
   * Selection + inspector panel
   */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    (sel: { nodes: Node[]; edges: Edge[] }) => {
      const nodeId = sel.nodes?.[0]?.id ?? null;
      const edgeId = sel.edges?.[0]?.id ?? null;

      setSelectedNodeId(nodeId);
      setSelectedEdgeId(edgeId);

      // Prefer node selection if both exist.
      if (nodeId) setSelectedEdgeId(null);
    },
    [],
  );

  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? (nodes.find((n) => n.id === selectedNodeId) ?? null)
        : null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () =>
      selectedEdgeId
        ? (edges.find((e) => e.id === selectedEdgeId) ?? null)
        : null,
    [edges, selectedEdgeId],
  );

  /**
   * Inspector: node config JSON editor
   */
  const [nodeTypeDraft, setNodeTypeDraft] = useState<string>("");
  const [nodeConfigText, setNodeConfigText] = useState<string>("");
  const [nodeConfigError, setNodeConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedNode) {
      setNodeTypeDraft("");
      setNodeConfigText("");
      setNodeConfigError(null);
      return;
    }

    setNodeTypeDraft(selectedNode.data?.nodeType ?? "");
    setNodeConfigText(safeJson(selectedNode.data?.config ?? {}));
    setNodeConfigError(null);
  }, [selectedNodeId, selectedNode]);

  const commitSelectedNodeType = useCallback(
    (nextTypeRaw: string) => {
      if (!selectedNodeId) return;

      // We keep workflow storage permissive (string) but prefer registry-backed types.
      const nextType: string = nextTypeRaw;

      // If the new type is a known NodeType, reset config to validated defaults for that type.
      // Otherwise, preserve config as-is.
      let nextConfig: unknown = selectedNode?.data?.config ?? {};
      if (isNodeType(nextType)) {
        const validated = parseNodeConfig(nextType, undefined);
        nextConfig = validated;
        setNodeConfigText(safeJson(validated));
      }

      setNodes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== selectedNodeId) return n;
          const label = nextType || "(node)";
          return {
            ...n,
            data: {
              ...n.data,
              nodeType: nextType,
              config: nextConfig,
              label,
            },
          };
        });

        pushChange(next, edges);
        return next;
      });
    },
    [edges, pushChange, selectedNode?.data?.config, selectedNodeId],
  );

  const commitSelectedNodeConfig = useCallback(() => {
    if (!selectedNodeId || !selectedNode) return;

    setNodeConfigError(null);

    try {
      const parsed = parseJsonOrThrow<unknown>(nodeConfigText);

      // If node type is known, validate against its config schema.
      const nodeType = selectedNode.data?.nodeType ?? "";
      const validatedConfig = isNodeType(nodeType)
        ? parseNodeConfig(nodeType, parsed)
        : parsed;

      setNodes((prev) => {
        const next = prev.map((n) => {
          if (n.id !== selectedNodeId) return n;
          return {
            ...n,
            data: {
              ...n.data,
              config: validatedConfig,
            },
          };
        });

        pushChange(next, edges);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNodeConfigError(msg);
    }
  }, [edges, nodeConfigText, pushChange, selectedNode, selectedNodeId]);

  /**
   * Inspector: edge condition
   */
  const [edgeConditionText, setEdgeConditionText] = useState<string>("");
  useEffect(() => {
    if (!selectedEdge) {
      setEdgeConditionText("");
      return;
    }
    const cond = selectedEdge.data?.condition;
    setEdgeConditionText(typeof cond === "string" ? cond : "");
  }, [selectedEdgeId, selectedEdge]);

  const commitSelectedEdgeCondition = useCallback(() => {
    if (!selectedEdgeId) return;

    setEdges((prev) => {
      const next = prev.map((e) => {
        if (e.id !== selectedEdgeId) return e;
        const trimmed = edgeConditionText.trim();
        const condition = trimmed.length > 0 ? trimmed : undefined;
        return {
          ...e,
          data: { ...(e.data ?? {}), condition },
          label: condition ?? "",
        };
      });

      pushChange(nodes, next);
      return next;
    });
  }, [edgeConditionText, nodes, pushChange, selectedEdgeId]);

  /**
   * Actions
   */
  const addNode = useCallback(
    (type: NodeType) => {
      if (readOnly) return;

      const id = ids.node();

      // If we have a viewport instance, add at center; otherwise use a default position.
      const instance = reactFlowRef.current;
      const position = instance
        ? instance.screenToFlowPosition({
            x: window.innerWidth * 0.35,
            y: window.innerHeight * 0.3,
          })
        : { x: 60, y: 60 };

      const storageNode = createDefaultNode({
        id,
        type,
        position,
      });

      const flowNode: Node<NodeData> = {
        id: storageNode.id,
        position: storageNode.position,
        data: {
          nodeType: storageNode.type,
          config: storageNode.config,
          label: storageNode.type,
        },
        type: "default",
      };

      setNodes((prev) => {
        const next = [...prev, flowNode];
        pushChange(next, edges);
        return next;
      });

      setSelectedNodeId(id);
      setSelectedEdgeId(null);
    },
    [edges, pushChange, readOnly],
  );

  const deleteSelected = useCallback(() => {
    if (readOnly) return;

    if (selectedNodeId) {
      setNodes((prev) => {
        const nextNodes = prev.filter((n) => n.id !== selectedNodeId);
        // Remove connected edges too.
        const nextEdges = edges.filter(
          (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
        );

        setEdges(nextEdges);
        pushChange(nextNodes, nextEdges);

        return nextNodes;
      });

      setSelectedNodeId(null);
      return;
    }

    if (selectedEdgeId) {
      setEdges((prev) => {
        const nextEdges = prev.filter((e) => e.id !== selectedEdgeId);
        pushChange(nodes, nextEdges);
        return nextEdges;
      });
      setSelectedEdgeId(null);
    }
  }, [edges, nodes, pushChange, readOnly, selectedEdgeId, selectedNodeId]);

  const clearGraph = useCallback(() => {
    if (readOnly) return;

    const ok = window.confirm("Clear all nodes and edges?");
    if (!ok) return;

    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    pushChange([], []);
  }, [pushChange, readOnly]);

  const canEdit = !readOnly;

  return (
    <div
      className={props.className}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "stretch",
        width: "100%",
        height: "80vh",
        minHeight: 520,
        ...props.style,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: 10,
            borderBottom: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 800, color: "#111827" }}>
            Workflow Builder
          </div>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={deleteSelected}
            disabled={!canEdit || (!selectedNodeId && !selectedEdgeId)}
            style={buttonStyle(
              !canEdit || (!selectedNodeId && !selectedEdgeId),
            )}
          >
            Delete selected
          </button>

          <button
            type="button"
            onClick={clearGraph}
            disabled={!canEdit || (nodes.length === 0 && edges.length === 0)}
            style={buttonStyle(
              !canEdit || (nodes.length === 0 && edges.length === 0),
            )}
          >
            Clear
          </button>
        </div>

        <div
          style={{ width: "100%", height: "calc(80vh - 52px)", minHeight: 468 }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={(instance) => {
              reactFlowRef.current = instance;
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect as OnConnect}
            onSelectionChange={onSelectionChange}
            fitView
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={true}
            edgesFocusable={true}
            edgesUpdatable={!readOnly}
          >
            <Background gap={16} size={1} />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <aside
        style={{
          width: 340,
          flex: "0 0 340px",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "#fff",
          overflow: "auto",
        }}
      >
        <Section title="Palette">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {palette.map((d) => (
              <button
                key={d.type}
                type="button"
                onClick={() => addNode(d.type)}
                disabled={!canEdit}
                style={buttonStyle(!canEdit)}
                title={d.description}
              >
                <div style={{ fontWeight: 800 }}>{d.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{d.type}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Inspector">
          {selectedNode ? (
            <>
              <div style={labelStyle}>Selected node</div>
              <div style={monoSmallStyle}>{selectedNode.id}</div>

              <div style={{ height: 10 }} />

              <label style={labelStyle}>Type</label>
              <select
                value={nodeTypeDraft}
                onChange={(e) => {
                  const next = e.target.value;
                  setNodeTypeDraft(next);
                  if (canEdit) commitSelectedNodeType(next);
                }}
                disabled={!canEdit}
                style={inputStyle}
              >
                {/* Prefer registry types in the dropdown */}
                {palette.map((d) => (
                  <option key={d.type} value={d.type}>
                    {d.title} ({d.type})
                  </option>
                ))}

                {/* If the node has a non-registry type, still show it so it isn’t lost */}
                {nodeTypeDraft && !isNodeType(nodeTypeDraft) ? (
                  <option value={nodeTypeDraft}>
                    {nodeTypeDraft} (custom)
                  </option>
                ) : null}
              </select>

              <div style={{ height: 10 }} />

              <label style={labelStyle}>Config (JSON)</label>
              <textarea
                value={nodeConfigText}
                onChange={(e) => setNodeConfigText(e.target.value)}
                spellCheck={false}
                style={{ ...textareaStyle, height: 180 }}
                disabled={!canEdit}
              />

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={commitSelectedNodeConfig}
                  disabled={!canEdit}
                  style={buttonStyle(!canEdit)}
                >
                  Apply config
                </button>
                {nodeConfigError ? (
                  <span style={{ color: "#991b1b", fontSize: 12 }}>
                    {nodeConfigError}
                  </span>
                ) : (
                  <span style={{ color: "#6b7280", fontSize: 12 }}>
                    {isNodeType(nodeTypeDraft)
                      ? "Validated"
                      : "Unvalidated (custom type)"}
                  </span>
                )}
              </div>
            </>
          ) : selectedEdge ? (
            <>
              <div style={labelStyle}>Selected edge</div>
              <div style={monoSmallStyle}>
                {selectedEdge.source} → {selectedEdge.target}
              </div>

              <div style={{ height: 10 }} />

              <label style={labelStyle}>Condition (MVP DSL)</label>
              <input
                value={edgeConditionText}
                onChange={(e) => setEdgeConditionText(e.target.value)}
                onBlur={() => {
                  if (canEdit) commitSelectedEdgeCondition();
                }}
                placeholder="e.g. $.lead.score >= 80 and $.lead.region == 'US'"
                style={inputStyle}
                disabled={!canEdit}
              />

              <div style={{ height: 10 }} />

              <button
                type="button"
                onClick={commitSelectedEdgeCondition}
                disabled={!canEdit}
                style={buttonStyle(!canEdit)}
              >
                Apply condition
              </button>

              <div style={{ height: 10 }} />

              <div style={{ fontSize: 12, color: "#6b7280" }}>
                In Phase 1, conditions are stored but not executed yet.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Select a node or edge to edit its details.
            </div>
          )}
        </Section>

        <Section title="Storage Preview">
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            This is the persisted shape (no React Flow ids).
          </div>
          <pre style={preStyle}>
            {safeJson({
              nodes: fromReactFlowNodes(nodes),
              edges: fromReactFlowEdges(edges),
            })}
          </pre>
        </Section>
      </aside>
    </div>
  );
}

function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
      <div style={{ fontWeight: 800, color: "#111827", marginBottom: 10 }}>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: disabled ? "#f3f4f6" : "#fff",
    color: "#111827",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    textAlign: "left",
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#374151",
};

const monoSmallStyle: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  color: "#111827",
  wordBreak: "break-word",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 13,
  color: "#111827",
  background: "#fff",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  resize: "vertical",
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  color: "#111827",
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  overflowX: "auto",
  fontSize: 12,
  lineHeight: 1.4,
  color: "#111827",
};
