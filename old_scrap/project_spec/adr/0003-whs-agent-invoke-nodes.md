# ADR-0003: WHS Agent Invocation Nodes (Agentromatic ↔ WebHost.Systems integration)
- **Status:** Accepted
- **Date:** 2026-01-24
- **Owners:** Engineering
- **Decision Scope:** How Agentromatic executes “agent steps” during workflow runs by invoking WebHost.Systems (WHS) agents, including auth model, idempotency, logging, and error mapping.
- **Related Specs:**
  - `project_spec/workflow_automation.md`
  - `project_spec/workflow_automation_design_spec.md`
  - `project_spec/api_contracts.md`
  - `project_spec/mvp_build_plan.md`
  - `project_spec/adr/0001-monorepo-and-tooling.md`
  - `project_spec/adr/0002-condition-language-mvp.md`
  - WebHost.Systems spec set: `ProjectWHS/WebHost.Systems/project_spec/spec_v1/*` (control-plane/data-plane boundary, invoke protocol, normalized errors, telemetry integrity)

---

## 1) Context

Agentromatic is a workflow automation product:
- Users author workflows (DAGs of nodes/edges).
- Runs create Executions and append ExecutionLogs.
- The system’s long-term value depends on **auditability**, **debuggability**, and **multi-tenant safety**.

WebHost.Systems (WHS) is an agent hosting/control-plane:
- Owns agent definitions, immutable deployments, invocation gateway (`invoke/v1`), telemetry, limits/billing, and runtime provider adapters.
- Enforces cost/usage gating and emits telemetry.

We need a clear integration model so that:
- Agentromatic can run workflows (orchestration-of-record).
- WHS can run AI agent calls (runtime-of-record).
- Costs/limits/telemetry are centralized (WHS).
- Workflow correctness + audit trail remain centralized (Agentromatic).
- We avoid duplicating “agent runtime” logic inside Agentromatic (e.g., running models directly inside Convex actions).

The portfolio TODO requires:
- “agentromatic workflow agents are WHS agents”
- (Option A) Agentromatic executes workflows; WHS executes agent steps.

Constraints:
- Agentromatic execution runs server-side (Convex actions).
- We must not depend on browser tokens to invoke WHS from the backend.
- Multi-tenant: we must not accidentally let one tenant invoke another tenant’s WHS agents.
- We want MVP-safe, deterministic behavior with clean failure modes.

---

## 2) Decision

### 2.1 Introduce a first-class workflow node type: `whs_agent_invoke`

Agentromatic workflows will include nodes that represent “call a WHS agent”.

Canonical node type:
- `type = "whs_agent_invoke"`

Required config fields (MVP):
- `whsAgentId: string` (opaque WHS agent id)
Optional config fields (MVP):
- `deploymentPin?: string | null` (optional; if null, WHS routes via active deployment)
- `inputMode?: "messages" | "prompt"` (MVP default: `"messages"`)
- `systemPromptOverride?: string | null` (bounded; optional)
- `toolPolicy?: { mode: "deny_by_default" | "allow_by_default", allow?: string[], deny?: string[] }` (optional; if WHS supports it)

Agentromatic remains responsible for:
- workflow orchestration algorithm (planning, sequential execution in MVP)
- condition evaluation (ADR-0002)
- snapshotting workflow definition per execution
- execution logs + step-by-step audit history

WHS remains responsible for:
- agent runtime invocation protocol and execution
- runtime provider selection and deploy/invoke adapters
- telemetry integrity, metering, limits, billing

---

### 2.2 Auth model: server-to-server delegated invocation (HMAC)

Because Agentromatic executes server-side, it MUST invoke WHS through a server-authenticated mechanism.

Decision:
- Agentromatic will call a WHS “delegated invoke” endpoint using an HMAC signature over raw request bytes (v1 scheme).

Requirements:
- Agentromatic stores a shared secret `WHS_DELEGATION_SECRET` in its backend environment (server-side only).
- Each delegated invocation request includes:
  - `delegation.actor.externalUserId` (the authenticated end user’s external id, e.g., Clerk subject)
  - correlation metadata (`workflowId`, `executionId`, `nodeId`, etc.)
  - a stable idempotency key (see §2.3)
- WHS verifies signature and resolves the user from `externalUserId`, then enforces WHS-side entitlements/limits/ownership as that user.

Why:
- Avoids passing browser JWTs from client → Agentromatic → WHS.
- Keeps billing/limits enforcement authoritative inside WHS.
- Maintains a clean boundary: Agentromatic is orchestrator; WHS is runtime.

Security rules (normative):
- Agentromatic MUST NOT send end-user auth tokens to WHS.
- WHS MUST NOT trust Agentromatic blindly for authorization; WHS MUST enforce ownership/entitlements based on resolved user identity.
- Delegated invoke requests MUST be replay-protected (timestamp window or nonce) on the WHS side if/when implemented. If not implemented in MVP, idempotency still must exist (see §2.3) and scope must be tenant-safe.

---

### 2.3 Idempotency: derived from execution + node + attempt

Agent calls can be retried due to:
- transient upstream failures
- Agentromatic execution restarts
- user-triggered re-runs with the same execution id (if supported)
- internal “continue” mechanisms in future phases

Decision:
- Every WHS delegated invocation MUST include an idempotency key derived from Agentromatic execution identity:

Canonical format:
- `agentromatic:exec:<executionId>:node:<nodeId>:attempt:<attemptNumber>`

Rules:
- `attemptNumber` starts at 1 for the first attempt.
- The idempotency key MUST NOT include secrets or user message content.
- WHS SHOULD dedupe on this idempotency key (scoped to user + agentId at minimum).

This provides:
- defense-in-depth against duplicate side effects/cost
- deterministic behavior on retries

---

### 2.4 Logging: Agentromatic logs must record WHS references

Agentromatic ExecutionLogs must capture enough to debug and audit WHS invocations without copying WHS telemetry.

When a `whs_agent_invoke` node runs, Agentromatic MUST record at least:

On start:
- nodeId, status `started`, createdAt
- `whsAgentId`
- `idempotencyKey`
- safe input summary (bounded, redacted)

On completion:
- status `success|failed`
- `whsTraceId` (required if WHS returns one)
- optional `whsSessionId`
- safe output snippet (bounded, redacted) OR just a reference depending on UX
- duration
- normalized error info on failure (see §2.5)

Agentromatic MUST NOT:
- store WHS secrets
- store full tool traces by default
- store raw upstream bodies unbounded
- log bearer tokens or signature headers

---

### 2.5 Error normalization: map WHS errors into Agentromatic step failures deterministically

WHS defines normalized error semantics (codes like `UNAUTHENTICATED`, `UNAUTHORIZED`, `LIMIT_EXCEEDED`, `RUNTIME_ERROR`, etc.).

Decision:
- Agentromatic’s `whs_agent_invoke` step must translate WHS responses into:
  - step success: node log `success` with output summary/reference
  - step failure: node log `failed` with a safe error summary and stable code

MVP mapping rules:
- If WHS returns `LIMIT_EXCEEDED`:
  - Agentromatic marks the node as failed with `errorCode="LIMIT_EXCEEDED"` and stops the execution (MVP default failure policy).
- If WHS returns `UNAUTHORIZED` / `UNAUTHENTICATED`:
  - treat as non-retryable failure (unless you add an auth refresh mechanism later).
- If WHS returns transient errors (`UPSTREAM_ERROR`, timeouts, network errors):
  - treat as retryable if/when Agentromatic adds retries; for MVP sequential engine, default is fail-fast unless a node policy explicitly allows retry.

In all cases:
- Agentromatic must store only safe, bounded error messages.

---

## 3) Consequences

### 3.1 Positive
- Clear division of responsibilities:
  - Agentromatic = orchestration + audit trail
  - WHS = runtime + telemetry + limits/billing
- One canonical agent invocation protocol surface (WHS).
- Easier long-term observability: WHS handles metering/telemetry; Agentromatic handles workflow-level debugging.
- Avoids re-implementing model execution and tool routing in Agentromatic MVP.

### 3.2 Tradeoffs
- Requires a delegated invocation endpoint in WHS (or equivalent service-to-service auth mechanism).
- Adds operational coupling: Agentromatic needs WHS base URL and shared secret.
- Requires careful correlation and idempotency to avoid double charges or duplicate actions.

---

## 4) Implementation Notes (Guidance)

### 4.1 Agentromatic changes (minimum)
1. Add `whs_agent_invoke` to the workflow node registry schema in `packages/shared`.
2. Update execution engine to recognize this node type and call WHS via delegated invoke.
3. Update ExecutionLogs schema (or log payloads) to store:
   - `whsAgentId`, `whsTraceId`, `whsSessionId?`, `idempotencyKey`
4. Add env vars:
   - `WHS_CONTROL_PLANE_URL`
   - `WHS_DELEGATION_SECRET`

### 4.2 WHS requirements (minimum to support this ADR)
WHS must expose a server-authenticated invocation path that:
- verifies HMAC signature over raw request bytes (v1)
- resolves `externalUserId` to WHS user row
- enforces:
  - agent ownership/visibility
  - entitlements/limits
- supports idempotency keys

This can be implemented as:
- a dedicated endpoint (e.g., `/v1/delegated/invoke/:agentId`), OR
- an internal variant of `invoke/v1` with additional auth mode

### 4.3 Correlation fields (recommended)
Every delegated invocation should include correlation metadata:
- `workflowId`
- `executionId`
- `nodeId`
- `attemptNumber`
These may be passed to WHS in `metadata` and may also appear in WHS telemetry as safe, non-secret attributes.

---

## 5) Alternatives Considered

### A) Agentromatic runs models directly (no WHS)
Rejected:
- duplicates runtime concerns (provider adapters, telemetry, billing/limits)
- increases security risk and scope
- conflicts with portfolio architecture (WHS is the runtime layer)

### B) Workflows are deployed as WHS agents (WHS executes workflows)
Deferred:
- larger architectural change
- requires workflow engine packaging as a runtime artifact
- complicates MVP; Option A is faster and matches current Agentromatic execution scaffolding

### C) Agentromatic forwards end-user JWT to WHS
Rejected:
- mixes user auth tokens into server-to-server flows
- increases leakage risk
- makes backend execution dependent on browser session semantics

---

## 6) Acceptance Criteria
- A workflow containing a `whs_agent_invoke` node can run end-to-end:
  1. Agentromatic creates an execution and logs step start.
  2. Agentromatic invokes WHS via delegated invoke with HMAC auth.
  3. WHS enforces user ownership/limits and returns `traceId`.
  4. Agentromatic logs completion with `whsTraceId` and safe output summary/reference.
- Retries do not create duplicate WHS side effects:
  - idempotency key derived from `(executionId, nodeId, attempt)` is used and honored.
- No secrets (tokens, shared secret, raw credentials) appear in:
  - Agentromatic logs
  - Agentromatic execution log payloads
  - error envelopes
- Failure mapping is deterministic:
  - WHS normalized errors map to step failure codes in Agentromatic.
