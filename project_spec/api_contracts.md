# Agentromatic — API Contracts (Convex) — Phase 1
Version: v0.1  
Scope: Phase 1 (Foundation Data Model & CRUD)  
Status: Draft (implementation exists; refine as UI wiring begins)

This document describes the **Convex function contracts** (queries, mutations, actions) for Phase 1, including:
- names and parameters
- return shapes
- authorization rules
- invariants and error behavior
- notes for frontend integration

> Source of truth for implementation is currently under `convex/`:
> - `convex/workflows.ts`
> - `convex/executions.ts`
> - `convex/executionLogs.ts`
> - `convex/executeWorkflow.ts`
> - `convex/schema.ts`

---

## 1) Tenancy & Auth Model (Phase 1)

### 1.1 Identity
All functions assume an authenticated caller. Internally, the backend maps the authenticated identity to an internal `users` table row:
- `users.externalId` = stable external auth subject (e.g., Clerk user id)
- If a user row does not exist, it is created on demand.

### 1.2 Ownership (“scope”)
Every owned document uses **exactly one** ownership field:
- personal scope: `userId` is set, `teamId` is unset
- team scope: `teamId` is set, `userId` is unset

In Phase 1:
- **Personal scope** operations are allowed for the authenticated user.
- **Team scope** operations are allowed only if:
  - the team exists, and
  - `teams.ownerUserId === currentUserId`

> This “team owner only” rule is an MVP simplification. Replace with membership/roles later.

### 1.3 Security boundary rule
For any doc fetched by id:
- reject if doc ownership is invalid (both/neither `teamId`/`userId`)
- reject if doc is not owned by the caller’s allowed scope

### 1.4 Error behavior
Convex functions may throw Errors. For UI wiring, treat errors as:
- `NotFound` (entity missing)
- `Forbidden` (authz boundary)
- `Validation` (bad state/arguments)

Exact error “names” are implementation details, but the UI should show user-friendly messaging.

---

## 2) Data Contracts (stored shapes)

### 2.1 Workflow (stored in `workflows`)
Fields:
- `_id: Id<"workflows">`
- `teamId?: Id<"teams">`
- `userId?: Id<"users">`
- `name: string`
- `trigger: { type: "webhook" | "schedule" | "email" | "manual", config: any }`
- `nodes: Array<{ id: string, type: string, position: {x:number,y:number}, config: any }>`
- `edges: Array<{ source: string, target: string, condition?: string }>`
- `status: "draft" | "active" | "paused"`
- `createdAt: number` (ms)
- `updatedAt: number` (ms)

Notes:
- `nodes[].id` is a stable per-workflow node id (UUID string recommended).
- `edges[].condition` is a **string** (MVP-safe DSL) but **not executed** in Phase 1.

### 2.2 Execution (stored in `executions`)
Fields:
- `_id: Id<"executions">`
- `teamId?: Id<"teams">` (mirrors workflow)
- `userId?: Id<"users">` (mirrors workflow)
- `workflowId: Id<"workflows">`
- `workflowSnapshot: { name, trigger, nodes, edges, status }` (required)
- `status: "queued" | "running" | "success" | "failed" | "canceled"`
- `triggerData?: any` (size-limited/truncated)
- `startedAt: number` (ms)
- `completedAt?: number` (ms)
- `error?: string`

Notes:
- Snapshotting is required for auditability/correctness.
- Phase 1 uses very simple payload truncation for `triggerData`.

### 2.3 Execution Log Entry (stored in `executionLogs`)
Fields:
- `_id: Id<"executionLogs">`
- `executionId: Id<"executions">`
- `nodeId: string`
- `status: "started" | "success" | "failed" | "skipped"`
- `input?: any` (size-limited/truncated)
- `output?: any` (size-limited/truncated)
- `error?: string`
- `durationMs?: number`
- `createdAt: number` (ms)

Notes:
- Logs are appended in chronological order; `list()` returns ascending by `createdAt`.

### 2.4 Users / Teams (minimal Phase 1)
`users`:
- `_id: Id<"users">`
- `externalId: string` (unique, indexed)
- `email?: string`
- `name?: string`
- `createdAt: number`
- `updatedAt: number`

`teams`:
- `_id: Id<"teams">`
- `name: string`
- `ownerUserId?: Id<"users">` (Phase 1 team auth simplification)
- `createdAt: number`
- `updatedAt: number`

---

## 3) Convex Modules & Function Contracts

### 3.1 `workflows` module (`convex/workflows.ts`)

#### 3.1.1 Query: `workflows.list`
**Purpose:** List workflows for the current scope (personal default, or team if `teamId` provided).

**Args:**
- `teamId?: Id<"teams">`
- `limit?: number` (default 50, max 200)

**AuthZ:**
- If `teamId` provided: caller must be the team owner (Phase 1 rule).
- If no `teamId`: lists workflows where `userId === currentUserId`.

**Returns:**
- `Array<WorkflowDoc>` ordered by `updatedAt desc`

**Notes:**
- UI should pass `limit` if implementing pagination (Phase 1: simple “take N”).
- Team listing will be expanded to membership-based access later.

---

#### 3.1.2 Query: `workflows.get`
**Purpose:** Fetch one workflow by id.

**Args:**
- `id: Id<"workflows">`

**AuthZ:**
- Workflow must be owned by caller’s scope (personal or team owner).

**Returns:**
- `WorkflowDoc`

---

#### 3.1.3 Mutation: `workflows.create`
**Purpose:** Create a new workflow.

**Args:**
- `teamId?: Id<"teams">` (if provided, create team-owned)
- `name: string`
- `trigger: { type: "webhook" | "schedule" | "email" | "manual", config: any }`
- `nodes?: Array<{ id: string, type: string, position: {x,y}, config: any }>` (default [])
- `edges?: Array<{ source: string, target: string, condition?: string }>` (default [])
- `status?: "draft" | "active" | "paused"` (default "draft")

**AuthZ:**
- If `teamId` provided: caller must be team owner (Phase 1 rule)
- Else: workflow is created under the authenticated user

**Returns:**
- `Id<"workflows">` (new workflow id)

**Invariants:**
- Exactly one of (`teamId`, `userId`) is set in the created record.
- `createdAt` and `updatedAt` set to `Date.now()`.

---

#### 3.1.4 Mutation: `workflows.update`
**Purpose:** Patch workflow definition fields.

**Args:**
- `id: Id<"workflows">`
- `patch: {`
  - `name?: string`
  - `trigger?: Trigger`
  - `nodes?: Node[]`
  - `edges?: Edge[]`
  - `status?: WorkflowStatus`
  `}`

**AuthZ:**
- Must have access to the workflow by id.

**Returns:**
- `{ ok: true }`

**Notes:**
- Ownership cannot be changed in Phase 1.
- `updatedAt` is always updated server-side.

---

#### 3.1.5 Mutation: `workflows.setStatus`
**Purpose:** Update only workflow status (convenience).

**Args:**
- `id: Id<"workflows">`
- `status: "draft" | "active" | "paused"`

**AuthZ:**
- Must have access to the workflow.

**Returns:**
- `{ ok: true }`

---

#### 3.1.6 Mutation: `workflows.remove`
**Purpose:** Delete a workflow (hard delete in Phase 1).

**Args:**
- `id: Id<"workflows">`

**AuthZ:**
- Must have access to the workflow.

**Returns:**
- `{ ok: true }`

**Notes:**
- Phase 1 does not cascade delete executions/logs. If this becomes an issue, add:
  - soft delete, or
  - cascade cleanup job.

---

### 3.2 `executions` module (`convex/executions.ts`)

#### 3.2.1 Query: `executions.listByWorkflow`
**Purpose:** List executions for a given workflow.

**Args:**
- `workflowId: Id<"workflows">`
- `limit?: number` (default 50, max 200)

**AuthZ:**
- Caller must have access to the workflow.

**Returns:**
- `Array<ExecutionDoc>` ordered by `startedAt desc`

---

#### 3.2.2 Query: `executions.get`
**Purpose:** Fetch a single execution by id.

**Args:**
- `id: Id<"executions">`

**AuthZ:**
- Execution must be owned by caller’s allowed scope.

**Returns:**
- `ExecutionDoc`

---

#### 3.2.3 Query: `executions.listRecent`
**Purpose:** List recent executions for personal scope or team scope.

**Args:**
- `teamId?: Id<"teams">`
- `limit?: number` (default 50, max 200)
- `status?: "queued" | "running" | "success" | "failed" | "canceled"`

**AuthZ:**
- If `teamId` provided: caller must be team owner (Phase 1 rule)
- Else: uses `userId === currentUserId`

**Returns:**
- `Array<ExecutionDoc>` ordered by `startedAt desc` (may overscan + filter in-memory when status filter is used)

**Notes:**
- If status filtering becomes common, add compound indexes (Phase 2+).

---

#### 3.2.4 Mutation: `executions.create`
**Purpose:** Create an execution record with a required workflow snapshot.

**Args:**
- `workflowId: Id<"workflows">`
- `triggerData?: any`
- `status?: "queued" | "running" | "success" | "failed" | "canceled"` (default "queued")

**AuthZ:**
- Caller must have access to the workflow.

**Returns:**
- `Id<"executions">`

**Behavior:**
- Server reads workflow doc and constructs `workflowSnapshot` from it.
- Ownership fields mirror the workflow ownership.
- `startedAt` is set at creation time.
- `triggerData` is truncated if too large.

**Notes:**
- Clients never provide `workflowSnapshot` directly (prevents tampering).

---

#### 3.2.5 Mutation: `executions.markRunning`
**Purpose:** Mark a non-terminal execution as `running`.

**Args:**
- `id: Id<"executions">`

**AuthZ:**
- Caller must have access to the execution.

**Returns:**
- `{ ok: true }`

**Validation rules:**
- Cannot transition a terminal execution (`success|failed|canceled`) to `running`.

---

#### 3.2.6 Mutation: `executions.complete`
**Purpose:** Mark an execution as terminal.

**Args:**
- `id: Id<"executions">`
- `status: "success" | "failed" | "canceled"`
- `completedAt?: number` (default `Date.now()`)
- `error?: string` (required when status is `"failed"`)

**AuthZ:**
- Caller must have access to the execution.

**Returns:**
- `{ ok: true }`

**Validation rules:**
- Cannot complete an already terminal execution.
- Failed requires `error`.

---

### 3.3 `executionLogs` module (`convex/executionLogs.ts`)

#### 3.3.1 Query: `executionLogs.list`
**Purpose:** List logs for an execution in chronological order.

**Args:**
- `executionId: Id<"executions">`
- `limit?: number` (default 200, max 1000)

**AuthZ:**
- Caller must have access to the parent execution.

**Returns:**
- `Array<ExecutionLogDoc>` ordered by `createdAt asc`

---

#### 3.3.2 Mutation: `executionLogs.append`
**Purpose:** Append a log entry to an execution.

**Args:**
- `executionId: Id<"executions">`
- `nodeId: string`
- `status: "started" | "success" | "failed" | "skipped"`
- `input?: any`
- `output?: any`
- `error?: string`
- `durationMs?: number`

**AuthZ:**
- Caller must have access to the execution.

**Returns:**
- `Id<"executionLogs">` (new log entry id)

**Guardrails:**
- `input` and `output` are truncated if too large.

**Notes:**
- In later phases, the workflow engine/action should be the primary writer of logs.
- UI should treat logs as append-only.

---

### 3.4 Workflow execution action (`convex/executeWorkflow.ts`)

#### 3.4.1 Action: `executeWorkflow.executeWorkflow`
**Purpose:** Phase 1 “run workflow” stub. Creates an execution, writes start/end logs, and completes successfully (unless unexpected error).

**Args:**
- `workflowId: Id<"workflows">`
- `triggerData?: any`

**AuthZ:**
- Enforced indirectly:
  - action calls `executions.create` which enforces workflow access
  - action calls `executionLogs.append` which enforces execution access

**Returns:**
- On success: `{ success: true, executionId: Id<"executions"> }`
- On failure: `{ success: false, executionId: Id<"executions">, error: string }`

**Behavior:**
1. Creates execution with `status: "running"`.
2. Appends log entry with `nodeId: "__start__"`, `status: "started"`.
3. Appends log entry with `nodeId: "__end__"`, `status: "success"` and a stub output.
4. Completes execution as `success`.

**Notes / Next phases:**
- Phase 3 will replace stub output with:
  - DAG planning (topological sort)
  - sequential node execution
  - condition evaluation and branching
  - retries and richer failure policy

---

## 4) Frontend Integration Notes (Phase 1 UI wiring)

### 4.1 Suggested UI calls
- Workflows list:
  - `workflows.list({ teamId? })`
- Workflow detail:
  - `workflows.get({ id })`
  - `workflows.update({ id, patch })`
  - `workflows.setStatus({ id, status })`
  - `workflows.remove({ id })`
- Run workflow:
  - `executeWorkflow.executeWorkflow({ workflowId, triggerData })`
- Executions list:
  - `executions.listByWorkflow({ workflowId })`
- Execution detail:
  - `executions.get({ id })`
  - `executionLogs.list({ executionId })`

### 4.2 Data consistency
- Expect real-time updates from Convex once the web app is wired to a Convex client.
- Log list is chronological. For UI “live tail”, poll/subscribe and append new logs.

### 4.3 Payload safety
- Phase 1 truncation is coarse; UI should display:
  - `__truncated` previews clearly
  - avoid auto-expanding giant payloads in the browser

---

## 5) Planned Additions (Phase 2+)
Not in Phase 1 contracts yet:
- proper team membership/roles tables and checks
- integrations CRUD and OAuth flows
- workflow node registry validation and config schemas
- webhook trigger endpoints (public URLs)
- schedule trigger setup (cron)
- full execution engine + condition evaluator
- audit events / change history
- billing/credits enforcement

---

## 6) Quick Checklist (Phase 1 completeness)
- [x] Workflows CRUD contracts defined
- [x] Executions CRUD contracts defined
- [x] Execution logs list/append contracts defined
- [x] Run workflow stub action contract defined
- [x] Tenancy model described (with Phase 1 limitation)
- [x] Snapshotting requirement documented