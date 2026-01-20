# Agentromatic Workflow Automation Platform — Design Specification & Delivery Phases (v1)

> This document translates `workflow_automation.md` into an implementation-ready design spec: system components, data/contracts, execution semantics, security/tenancy, and a phased delivery plan with measurable acceptance criteria.

---

## 1) Objectives

### 1.1 Product goals (MVP)
1. **Visual Workflow Builder**: users can build, save, and run workflows with a node/edge graph editor.
2. **Natural Language Workflow Creation**: users can describe a workflow and get an editable draft graph.
3. **Self-Healing Workflows**: resilient execution with retries + schema/field mapping fixes when integrations change.
4. **Integration Foundation**: a node-based SDK pattern enabling fast addition of app connectors.
5. **Operational Readiness**: logging, replay, auditability, and safe multi-tenant isolation.

### 1.2 Non-goals (MVP)
- Full marketplace/ecosystem with revenue sharing.
- On-prem execution environments.
- Complex data warehousing / analytics pipeline (basic metrics only).
- End-user scripting language (JS/Python) embedded in nodes (can be post-MVP).

---

## 2) Key Terms & Concepts

- **Workflow**: a persisted DAG (directed acyclic graph) of nodes and edges with a trigger.
- **Node**: a unit of execution (e.g., HTTP request, AI agent, Slack send message).
- **Edge**: connection between nodes; may carry a condition (branching).
- **Execution**: a single run of a workflow from trigger to completion/failure.
- **Run Log**: ordered list of node-level events with inputs/outputs and timings.
- **Integration**: app connector definition + auth + node implementations (actions/triggers).
- **Self-healing**: automatic remediation attempts when requests fail due to schema/config mismatch.

---

## 3) System Overview

### 3.1 High-level architecture
- **Web App (Dashboard + Builder)**: TanStack Start UI hosting:
  - Workflows list & detail pages
  - Visual builder canvas (graph editor)
  - Run history & logs viewer
  - Natural-language workflow creation UI
- **Backend (Convex)**:
  - Data persistence (workflows, executions, integrations, credentials, teams)
  - Server functions for:
    - creating/updating workflows
    - generating workflows from NL
    - executing workflows
    - executing nodes (HTTP, AI agent, integration nodes)
    - self-healing (retry + mapping suggestion)
- **External Services**:
  - OAuth providers / third-party APIs (Slack, etc.)
  - LLM provider via Vercel AI SDK (or equivalent abstraction)
- **Observability**:
  - Execution logs stored in DB for user-facing history
  - Structured server logs (for debugging and ops)

### 3.2 Design principles
- **Deterministic execution** where possible: same inputs → same node order; clear audit trail.
- **Safe-by-default**: credentials never leak to client; strict tenancy checks.
- **Composable nodes**: a stable node interface enables rapid integration growth.
- **Recoverable workflows**: failures are actionable with rerun/replay and targeted fixes.
- **Human-editable AI output**: NL-generated workflows are drafts, not opaque automations.

---

## 4) Data Model & Storage Contracts

> The product spec already sketches `workflowSchema` and execution flow. This section formalizes collections and invariants.

### 4.1 Core entities

#### 4.1.1 Workflow
- `id: string`
- `userId: string`
- `teamId?: string`
- `name: string`
- `status: 'draft' | 'active' | 'paused' | 'archived'`
- `trigger: { type: string; config: Record<string, unknown> }`
- `nodes: Array<{ id: string; type: string; position: {x:number;y:number}; config: Record<string, unknown> }>`
- `edges: Array<{ source: string; target: string; condition?: string }>`
- `createdAt: number | string`
- `updatedAt: number | string`
- Optional but recommended:
  - `version: number` (increments on publish)
  - `publishedAt?: timestamp`
  - `lastRunAt?: timestamp`

**Invariants**
- `nodes.id` unique within workflow.
- Every `edge.source` and `edge.target` refers to an existing `node.id`.
- Graph must be acyclic for MVP (enforce on publish); allow cycles only post-MVP with explicit loop nodes.

#### 4.1.2 Execution
- `id: string`
- `workflowId: string`
- `workflowVersion?: number` (snapshot version at run start)
- `status: 'running' | 'succeeded' | 'failed' | 'canceled'`
- `triggerData: Record<string, unknown>`
- `startedAt: timestamp`
- `completedAt?: timestamp`
- `success?: boolean`
- `error?: { message: string; code?: string; details?: unknown }`
- `log: Array<ExecutionLogEntry>`

#### 4.1.3 ExecutionLogEntry
- `nodeId: string`
- `status: 'started' | 'succeeded' | 'failed' | 'skipped' | 'retried'`
- `attempt?: number`
- `input?: unknown` (redacted)
- `output?: unknown` (redacted)
- `durationMs?: number`
- `error?: { message: string; details?: unknown }`
- `timestamp: timestamp`

**Redaction policy**
- Never store raw secrets/tokens in `input`/`output`.
- Support “sensitive fields” annotations per node type to redact before persistence.

#### 4.1.4 Integration & Credentials
**Integration**
- `id: string`
- `teamId?: string`
- `userId: string`
- `provider: string` (e.g., `slack`)
- `status: 'connected' | 'error' | 'revoked'`
- `createdAt`, `updatedAt`

**Credential**
- `id: string`
- `integrationId: string`
- `type: 'oauth' | 'api_key'`
- `encryptedPayload: string` (server-side encrypted blob)
- `scopes?: string[]`
- `expiresAt?: timestamp`

> Implementation note: encryption keys must be server-only and never shipped to the client.

### 4.2 Workflow snapshots (recommended for correctness)
When an execution starts, persist a **snapshot** of the workflow definition:
- `execution.workflowSnapshot = { trigger, nodes, edges, name, version }`

This prevents “editing the workflow while it runs” from changing behavior mid-execution and improves auditability.

---

## 5) Node System Design

### 5.1 Node type registry
Create a registry mapping `node.type` → implementation:

- `http.request`
- `ai.agent`
- `slack.send_message` (example)
- `transform.map` (optional MVP helper)
- `control.if` / `control.branch` (optional MVP; otherwise use edge `condition`)

Each node type defines:
- `id` / `name` / `icon` / `category`
- `inputs` / `outputs` schema (JSON Schema-like)
- `configSchema` for the builder UI (to validate config)
- `execute(context): Promise<{ output: unknown; next?: string[] }>`
- `sensitivePaths` for log redaction

### 5.2 Execution context
Each node receives:
- `executionId`, `workflowId`, `nodeId`
- `triggerData` (immutable)
- `currentData` (accumulated outputs)
- `integrations` access (server-only)
- `logger` (structured)
- `abortSignal` (optional)

### 5.3 Data flow model (`currentData`)
Adopt a predictable structure:
- `currentData = { trigger: triggerData, nodes: { [nodeId]: nodeOutput }, meta: { ... } }`

This allows later nodes to reference:
- `{{trigger.foo}}`
- `{{nodes.nodeA.bar}}`

### 5.4 Conditions & branching
For MVP, support simple branching with:
- `edge.condition` evaluated against `currentData` using a safe expression engine.

**Rules**
- No arbitrary code execution.
- Allow a small DSL (e.g., comparisons, boolean ops, exists).
- If multiple outgoing edges match, execute them in deterministic order (e.g., as stored).

### 5.5 Idempotency & retries
Nodes should be categorized:
- **Idempotent** (safe to retry): GET requests, some POSTs with idempotency keys.
- **Non-idempotent**: sending messages, creating records.

For non-idempotent actions:
- Encourage use of provider idempotency keys when available.
- Provide node config option: `idempotencyKeyTemplate`.

---

## 6) Workflow Execution Engine

### 6.1 Execution planning
At start:
1. Load workflow (or snapshot version).
2. Validate graph.
3. Build `executionOrder` (topological sort) OR perform dynamic traversal from trigger node(s).

Given the spec mentions an `executionOrder`, implement topological sort for deterministic linear execution in MVP, with optional branching.

### 6.2 Runtime algorithm (MVP)
1. Initialize `currentData` with `triggerData`.
2. For each node in planned order:
   - Determine if node should run (based on incoming edge conditions / prior failures).
   - Log `started`.
   - Execute node with retry policy (per node type).
   - On success: store output to `currentData.nodes[nodeId]` and log `succeeded`.
   - On failure: log `failed` and stop execution (MVP). (Post-MVP: partial continuation or error branches.)

### 6.3 Failure handling policy
MVP policy:
- Fail-fast per execution unless:
  - Node is explicitly marked “continue on error” (optional)
  - A self-healing attempt succeeds and the node can be retried safely

### 6.4 Replay & re-run
- **Re-run**: start a new execution with the same workflow version and same triggerData (or user-edited triggerData).
- **Replay** (post-MVP): re-run from a specific node, reusing prior outputs.

---

## 7) Self-Healing Design

### 7.1 HTTP request retries (baseline)
- Implement bounded retry with exponential backoff + jitter.
- Retry on:
  - network errors/timeouts
  - 429 / 5xx
  - selected 4xx that are transient (configurable)
- Do not retry on:
  - auth failures (401/403) unless token refresh is possible
  - schema mismatches unless a fix is attempted

### 7.2 Schema fix assistant
When an HTTP/integration node fails due to schema mismatch (common cases: field renamed, required field missing):
1. Collect failure context:
   - request config (redacted)
   - error response (redacted)
   - provider “expected fields” if known
2. Call an LLM with a constrained schema output:
   - `fixAvailable: boolean`
   - `suggestedMapping: Record<string, string | unknown>`
   - `explanation: string`
3. Apply suggested mapping **only** if:
   - It maps from existing `currentData` fields to required fields, and
   - The node type marks the mapping as safe, and
   - User/team policy allows auto-fix (default: “suggest only” in early MVP)

**MVP recommendation**
- Start with “suggest fix” surfaced in UI.
- Add “auto-apply & retry” behind a feature flag.

### 7.3 Auditability
Every self-healing action must be logged:
- what changed (before/after)
- why (LLM explanation)
- who/what initiated (system vs user)

---

## 8) Natural Language Workflow Creation

### 8.1 Contract
Input:
- `description: string`
- `userId: string`

Output:
- A draft workflow matching the workflow schema:
  - `name`
  - `trigger`
  - `nodes[]`
  - `edges[]`

### 8.2 Safety & constraints
- LLM output must validate against schema.
- Do not allow the model to invent credentials; instead:
  - If an integration is required but not connected, create node config placeholders and mark workflow as `draft`.
- Provide a “review checklist” UI:
  - confirm trigger
  - confirm each node config
  - connect integrations

### 8.3 Prompting strategy (implementation guidance)
- System prompt: you generate a workflow graph, using only supported node types.
- Provide model with:
  - available integrations for user/team
  - supported node types and their config schemas
  - examples of valid graphs (few-shot)
- Enforce JSON schema parsing using structured output.

---

## 9) Integration SDK & Connector Model

### 9.1 Connector definition
Each connector package exports:
- `providerId` (e.g., `slack`)
- `auth` strategy:
  - OAuth: authorization URL, token exchange, refresh
  - API Key: input form spec and validation
- `nodes[]`: action nodes and optional triggers

### 9.2 Node execution
Connector nodes ultimately execute HTTP requests using stored credentials:
- Build request with headers/body templates referencing `currentData`.
- Apply redaction policy to logs.
- Normalize errors into a common error type for self-healing logic.

### 9.3 Versioning
- Connector definitions should be versioned to avoid breaking existing workflows.
- Store `node.type` and optional `node.version`.

---

## 10) UI/UX Requirements

### 10.1 Visual builder
- Canvas with drag/drop nodes, edges, pan/zoom.
- Inspector panel for node config with schema-driven forms.
- Validation errors shown inline.
- Publish/Run actions:
  - “Save Draft”
  - “Publish”
  - “Run now”
- Run history panel:
  - list executions
  - click into log timeline by node

### 10.2 Logs viewer
- Timeline view: each node entry with status, duration, attempts.
- Expand to show (redacted) input/output.
- Provide “Copy error details” and “Suggest fix” button.

### 10.3 NL workflow creation UI
- Text area prompt + examples.
- Shows generated graph immediately in builder.
- “Connect required integrations” step.

---

## 11) Security, Privacy, and Multi-Tenancy

### 11.1 Tenancy model
- Every read/write must be scoped by `userId` and/or `teamId`.
- Workflows and executions must enforce access checks server-side (never rely on client filters).

### 11.2 Credentials security
- Credentials stored only server-side, encrypted at rest.
- Redact secrets from logs and UI.
- Token refresh handled server-side.

### 11.3 Data handling
- PII in triggerData and node outputs: minimize storage, allow retention settings (post-MVP).
- Provide “delete workflow” and “delete execution history” operations.

### 11.4 LLM safety
- Never send secrets to LLM.
- If node outputs contain PII, gate sending to LLM behind an explicit user/team setting.
- Log when LLM was used and what high-level data was shared (without sensitive contents).

---

## 12) Observability & Operations

### 12.1 Metrics (MVP)
Track:
- workflow runs/day
- success rate
- median + p95 execution duration
- retry counts
- self-heal suggestion rate and acceptance rate
- cost/credits consumed per execution

### 12.2 Alerts (basic)
- Elevated failure rate per provider
- Elevated 429 rate (rate limiting)
- LLM call failures

### 12.3 Rate limiting
- Per-user and per-team limits on:
  - executions per minute
  - LLM calls per minute
  - outbound HTTP requests per minute

---

## 13) Testing Strategy

### 13.1 Unit tests
- Graph validation and topological sort
- Condition evaluator
- Redaction utility
- Retry backoff logic

### 13.2 Integration tests
- HTTP node execution (mock server)
- Connector node execution with mocked OAuth tokens
- End-to-end: create workflow → run → inspect logs

### 13.3 “Golden workflows”
Maintain a set of canonical workflows used to validate:
- schema compatibility
- UI rendering
- execution correctness across releases

---

## 14) Delivery Phases & Milestones

> Timelines map to the implementation plan in the product spec but add concrete deliverables and acceptance criteria.

### Phase 0 — Project Setup & Guardrails (Week 1)
**Deliverables**
- Repo structure finalized (UI, backend functions, shared types)
- CI checks (lint, typecheck, tests)
- Basic auth + user identity available to backend
- Team model scaffolding (even if teams are post-MVP)

**Acceptance criteria**
- A signed-in user can load the dashboard shell.
- Backend functions can securely read `userId` and enforce access checks.

---

### Phase 1 — Foundation Data Model & CRUD (Weeks 1–4)
**Deliverables**
- Data models: workflows, executions, integrations, credentials
- Workflow CRUD:
  - create, update, list, delete
  - draft vs active status
- Minimal execution record creation (without full engine)

**Acceptance criteria**
- User can create and save a workflow with nodes/edges.
- A workflow read returns exactly what was saved (positions included).
- Unauthorized reads/writes are blocked server-side.

---

### Phase 2 — Visual Workflow Builder (Weeks 5–8)
**Deliverables**
- Builder canvas + inspector forms
- Schema-driven node config forms for MVP node set:
  - `http.request`
  - `ai.agent` (config shell if not executable yet)
  - 1–2 integration nodes (e.g., Slack send message)
- Graph validation on publish:
  - missing required config
  - invalid edges
  - cycle detection (MVP)

**Acceptance criteria**
- You can drag nodes, connect edges, edit config, and publish without errors.
- Validation prevents publishing invalid workflows and shows actionable messages.

---

### Phase 3 — Workflow Engine (Weeks 9–12)
**Deliverables**
- `executeWorkflow` backend function:
  - create execution record
  - plan execution order
  - execute nodes sequentially (MVP)
  - persist logs and completion status
- HTTP node execution with retries and redaction
- Executions list + log viewer UI

**Acceptance criteria**
- A published workflow with HTTP nodes runs end-to-end and produces a readable log.
- Failures show the node that failed, error message, and stop execution cleanly.
- Re-run creates a new execution with independent logs.

---

### Phase 4 — AI Agent Node + NL Workflow Generation (Weeks 13–16)
**Deliverables**
- AI agent node execution:
  - tool-enabled model access (HTTP request + web search if enabled by product spec)
  - strict redaction of secrets/PII
- Natural language workflow generation:
  - structured output validated against workflow schema
  - generated draft opens in builder for user edits
- Credit/metering hooks (at least internal accounting):
  - LLM tokens / calls
  - HTTP requests

**Acceptance criteria**
- An AI agent node can run and produce output stored in execution logs (redacted).
- Given a prompt, the system generates a valid workflow draft that renders in the builder.
- Credit usage for AI runs is recorded and visible in execution details (basic).

---

### Phase 5 — Integrations + Self-Healing + Launch Readiness (Weeks 17–20)
**Deliverables**
- Integration SDK pattern finalized:
  - provider definition
  - node definitions
  - auth handling
- At least 3 production-grade integrations (example target):
  - Slack (send message)
  - Gmail (send email) OR Google Sheets (append row)
  - Webhook trigger (incoming)
- Self-healing:
  - improved retry policy
  - schema fix suggestions (UI surfaced)
- Launch readiness:
  - onboarding flow
  - basic billing/credits enforcement (at least soft limits)
  - retention/cleanup for old executions (optional)

**Acceptance criteria**
- A user can connect an integration, use its node in a workflow, and run successfully.
- When a schema mismatch occurs, the system suggests a mapping fix and displays it clearly.
- Platform meets baseline reliability targets for MVP (define target, e.g., >95% run success excluding external provider outages).

---

## 15) Post-MVP Roadmap (Optional Extensions)
- Parallel execution for independent branches.
- Partial retries / replay from a node.
- Advanced branching, loop constructs, and human-in-the-loop approvals.
- Marketplace for community connectors.
- Team collaboration: comments, version diffs, approvals.
- Execution environments: managed workers, VPC egress, customer-owned secrets.

---

## 16) Open Decisions (To finalize before build)
1. **Condition language**: pick a minimal safe DSL and document it for users.
2. **Auto-apply self-heal**: default off vs on; feature flag strategy.
3. **Workflow snapshotting**: required for every run vs optional.
4. **Execution model**: strictly sequential MVP vs limited parallel branches.
5. **Retention policy**: how long to keep execution logs and payloads.

---

## 17) Definition of Done (MVP)
- Users can build workflows visually, generate drafts via natural language, run workflows, inspect logs, and connect at least a few integrations.
- Execution is reliable with retries and clear error reporting.
- Multi-tenant security is enforced.
- Costs are measurable and can be translated to credits.

---