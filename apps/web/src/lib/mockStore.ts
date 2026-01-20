import {
  ExecutionLogEntrySchema,
  ExecutionSchema,
  WorkflowSchema,
  type Execution,
  type ExecutionLogEntry,
  type Workflow,
} from "@agentromatic/shared";

/**
 * Local in-memory mock store (Phase 1 UI wiring helper)
 *
 * Why this exists:
 * - Lets you build UI screens (workflows list/detail + executions/logs) before Convex is initialized.
 * - Uses @agentromatic/shared Zod schemas to keep mock data aligned with backend contracts.
 *
 * Important:
 * - IDs here are plain strings (not Convex Ids).
 * - This is NOT persistent (refresh clears state).
 */

type Listener = () => void;

type StoreSnapshot = {
  workflows: Workflow[];
  executions: Execution[];
  logs: ExecutionLogEntry[];
};

function nowMs(): number {
  return Date.now();
}

function randomId(prefix: string): string {
  // Browser-friendly; Node 19+ also supports crypto.randomUUID().
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);
  return `${prefix}_${uuid}`;
}

function assertSchema<T>(schema: { safeParse: (v: unknown) => any }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    // Keep error readable in dev
    const message = JSON.stringify(parsed.error.format?.() ?? parsed.error, null, 2);
    throw new Error(`MockStore schema validation failed:\n${message}`);
  }
  return parsed.data as T;
}

function deepClone<T>(value: T): T {
  // Good enough for mock store; avoid mutability surprises in UI.
  return JSON.parse(JSON.stringify(value)) as T;
}

function coerceOwner(owner?: Partial<Workflow["owner"]>): Workflow["owner"] {
  // MVP: personal scope only for mock store
  const userId = owner?.userId ?? "user_demo";
  return { userId };
}

function createSeedWorkflow(): Workflow {
  const ts = nowMs();
  const candidate = {
    id: "wf_demo_001",
    name: "Demo: Manual trigger → Placeholder node",
    trigger: { type: "manual", config: {} },
    nodes: [
      {
        id: "node_start",
        type: "manual_trigger",
        position: { x: 120, y: 80 },
        config: {},
      },
      {
        id: "node_step_1",
        type: "http_request",
        position: { x: 420, y: 80 },
        config: { method: "GET", url: "https://example.com" },
      },
    ],
    edges: [{ source: "node_start", target: "node_step_1" }],
    status: "draft",
    owner: { userId: "user_demo" },
    createdAt: ts,
    updatedAt: ts,
  };

  return assertSchema<Workflow>(WorkflowSchema, candidate);
}

class MockStore {
  private state: StoreSnapshot;
  private listeners: Set<Listener>;

  constructor(seed?: Partial<StoreSnapshot>) {
    this.listeners = new Set();

    const workflows = seed?.workflows?.length ? seed.workflows : [createSeedWorkflow()];
    const executions = seed?.executions ?? [];
    const logs = seed?.logs ?? [];

    // Validate initial state with schemas
    const validatedWorkflows = workflows.map((w) => assertSchema<Workflow>(WorkflowSchema, w));
    const validatedExecutions = executions.map((e) => assertSchema<Execution>(ExecutionSchema, e));
    const validatedLogs = logs.map((l) => assertSchema<ExecutionLogEntry>(ExecutionLogEntrySchema, l));

    this.state = {
      workflows: validatedWorkflows,
      executions: validatedExecutions,
      logs: validatedLogs,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  getSnapshot(): StoreSnapshot {
    return deepClone(this.state);
  }

  // --------------------
  // Workflows
  // --------------------

  listWorkflows(): Workflow[] {
    return deepClone([...this.state.workflows].sort((a, b) => b.updatedAt - a.updatedAt));
  }

  getWorkflow(id: string): Workflow | null {
    const wf = this.state.workflows.find((w) => w.id === id);
    return wf ? deepClone(wf) : null;
  }

  createWorkflow(input: {
    name: string;
    triggerType: Workflow["trigger"]["type"];
    triggerConfig?: unknown;
    owner?: Partial<Workflow["owner"]>;
  }): Workflow {
    const ts = nowMs();

    const candidate = {
      id: randomId("wf"),
      name: input.name,
      trigger: {
        type: input.triggerType,
        config: (input.triggerConfig ?? {}) as any,
      },
      nodes: [],
      edges: [],
      status: "draft",
      owner: coerceOwner(input.owner),
      createdAt: ts,
      updatedAt: ts,
    };

    const workflow = assertSchema<Workflow>(WorkflowSchema, candidate);
    this.state.workflows = [workflow, ...this.state.workflows];
    this.emit();
    return deepClone(workflow);
  }

  updateWorkflow(id: string, patch: Partial<Omit<Workflow, "id" | "createdAt" | "owner">>): Workflow {
    const idx = this.state.workflows.findIndex((w) => w.id === id);
    if (idx < 0) throw new Error(`Workflow not found: ${id}`);

    const existing = this.state.workflows[idx];
    const updatedCandidate = {
      ...existing,
      ...patch,
      // preserve invariants
      id: existing.id,
      createdAt: existing.createdAt,
      owner: existing.owner,
      updatedAt: nowMs(),
    };

    const updated = assertSchema<Workflow>(WorkflowSchema, updatedCandidate);
    const next = [...this.state.workflows];
    next[idx] = updated;
    this.state.workflows = next;
    this.emit();
    return deepClone(updated);
  }

  deleteWorkflow(id: string): void {
    const before = this.state.workflows.length;
    this.state.workflows = this.state.workflows.filter((w) => w.id !== id);

    // Optional: keep executions/logs; for mock store we’ll also remove them for cleanliness.
    const executionIdsToRemove = new Set(
      this.state.executions.filter((e) => e.workflowId === id).map((e) => e.id),
    );
    this.state.executions = this.state.executions.filter((e) => !executionIdsToRemove.has(e.id));
    this.state.logs = this.state.logs.filter((l) => !executionIdsToRemove.has(l.executionId));

    if (this.state.workflows.length !== before) this.emit();
  }

  // --------------------
  // Executions + Logs
  // --------------------

  listExecutionsByWorkflow(workflowId: string): Execution[] {
    const rows = this.state.executions
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => b.startedAt - a.startedAt);
    return deepClone(rows);
  }

  getExecution(id: string): Execution | null {
    const ex = this.state.executions.find((e) => e.id === id);
    return ex ? deepClone(ex) : null;
  }

  listLogs(executionId: string): ExecutionLogEntry[] {
    const rows = this.state.logs
      .filter((l) => l.executionId === executionId)
      .sort((a, b) => a.createdAt - b.createdAt);
    return deepClone(rows);
  }

  /**
   * Phase 1 behavior:
   * - Create an execution record with a workflowSnapshot
   * - Append "__start__" and "__end__" log entries
   * - Immediately mark success (stub)
   */
  runWorkflow(workflowId: string, triggerData?: unknown): { executionId: string } {
    const workflow = this.state.workflows.find((w) => w.id === workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const startedAt = nowMs();
    const executionId = randomId("ex");

    const executionCandidate = {
      id: executionId,
      workflowId: workflow.id,
      workflowSnapshot: {
        // snapshot must satisfy ExecutionSchema -> WorkflowSchema shape
        ...workflow,
        // ExecutionSchema expects workflowSnapshot: WorkflowSchema
      },
      owner: workflow.owner,
      status: "running",
      startedAt,
      triggerData: triggerData as any,
    };

    const execution = assertSchema<Execution>(ExecutionSchema, executionCandidate);

    const startLogCandidate = {
      executionId,
      nodeId: "__start__",
      status: "started",
      input: { triggerData },
      createdAt: nowMs(),
    };

    const endLogCandidate = {
      executionId,
      nodeId: "__end__",
      status: "success",
      output: { message: "MockStore stub: execution recorded (no engine yet)." },
      durationMs: 0,
      createdAt: nowMs(),
    };

    const startLog = assertSchema<ExecutionLogEntry>(ExecutionLogEntrySchema, startLogCandidate);
    const endLog = assertSchema<ExecutionLogEntry>(ExecutionLogEntrySchema, endLogCandidate);

    // Commit
    this.state.executions = [execution, ...this.state.executions];
    this.state.logs = [...this.state.logs, startLog, endLog];

    // Complete the execution
    const completed: Execution = assertSchema<Execution>(ExecutionSchema, {
      ...execution,
      status: "success",
      completedAt: nowMs(),
      error: undefined,
    });

    this.state.executions = this.state.executions.map((e) => (e.id === executionId ? completed : e));

    this.emit();
    return { executionId };
  }

  // Utility: reset store (useful for dev)
  reset(): void {
    this.state = {
      workflows: [createSeedWorkflow()],
      executions: [],
      logs: [],
    };
    this.emit();
  }
}

// Export a singleton instance for easy use in the UI.
export const mockStore = new MockStore();

// Also export types for consumers that want them.
export type { StoreSnapshot };
export { MockStore };
