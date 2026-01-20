# Agentromatic — MVP Build Plan (Phase 0–1)
Version: v0.1 (buildable plan)
Owner: Engineering
Scope: Phase 0 (Setup & Guardrails) + Phase 1 (Foundation Data Model & CRUD)

This document turns the product spec + design spec into **implementation decisions**, **deliverables**, and a **sequenced plan** for the first two phases. It also resolves MVP “open decisions” where possible so coding can begin without ambiguity.

---

## 0) Inputs (Source Specs)
- `project_spec/workflow_automation.md` (Product Spec v1.0)
- `project_spec/workflow_automation_design_spec.md` (Design Spec v1)

---

## 1) MVP Decisions (Lock These Before/While Coding)

### 1.1 Condition Language (MVP)
**Decision:** Use a minimal, safe condition model first:
- MVP supports only:
  - `always` (default if no condition)
  - simple comparisons on `currentData` paths: `==`, `!=`, `>`, `>=`, `<`, `<=`
  - boolean ops: `and`, `or`
- No arbitrary JS eval.
- JSON-path-like field access: `$.foo.bar` (or `foo.bar` internally).

**Example (stored as string or structured object):**
- `"$.lead.score >= 80 and $.lead.region == 'US'"`

**Rationale:** Keeps execution deterministic and safe; avoids injection/remote code execution risks.

**Follow-up (post-MVP):** Upgrade to a structured condition AST in storage + small DSL editor.

---

### 1.2 Workflow Snapshotting for Executions
**Decision:** **Required** snapshot on every run.
- On execution start, store `workflowSnapshot` (the workflow definition at that time) in the execution record.
- Any logs refer to snapshot node ids.

**Rationale:** Correctness + auditability + reliable reruns.

---

### 1.3 Execution Model (MVP)
**Decision:** **Strictly sequential** execution (topological order) for MVP.
- Branching allowed, but still executed deterministically (e.g., evaluate condition and follow matching outgoing edge(s)).
- No parallelism in Phase 1.

**Rationale:** Simpler engine and logs; easier to debug.

---

### 1.4 Failure Handling Policy (MVP)
**Decision:**
- If a node fails: mark execution `failed`, stop further nodes.
- Record full error details + node input + partial output if applicable.
- Retriable behavior is node-specific; Phase 1 implements only baseline retry scaffolding (Phase 3/5 expands).

---

### 1.5 Self-Heal Auto-Apply (MVP)
**Decision:** Default **OFF** (suggest-only).
- The system may produce a suggested mapping/fix, but does not modify workflow automatically.
- Future: gated by feature flag + explicit user opt-in.

---

### 1.6 Retention Policy (MVP)
**Decision (baseline):**
- Keep `Execution` metadata: 90 days
- Keep `ExecutionLogEntry` payloads: 30 days (or truncate large payload fields earlier)
- Allow workspace-level override later.

**Rationale:** Cost control while maintaining debugging value.

---

### 1.7 Multi-Tenancy Model (MVP)
**Decision:** Team-first with user fallback:
- Every workflow belongs to exactly one “owner scope”:
  - `teamId` (preferred) or `userId` (personal)
- All queries/mutations must enforce scope checks.

---

### 1.8 Secrets/Credentials (MVP)
**Decision:** Store integration credentials via Convex encrypted storage patterns (as per design intent).
- Never store plaintext tokens in client state.
- Access via server-side functions only.

---

## 2) Phase 0 — Project Setup & Guardrails (Week 1)

### 2.1 Deliverables
1. Repository structure + baseline tooling
2. Local dev environment documented
3. CI checks (typecheck, lint, test, formatting)
4. Security guardrails (secrets handling, env vars, CSP baseline)
5. ADR scaffolding and first ADRs written

### 2.2 Repository Structure (Proposed)
- `apps/web/` — TanStack Start UI (React)
- `convex/` — Convex backend (schema, queries, mutations, actions)
- `packages/shared/` — shared types/schemas (zod, node definitions)
- `project_spec/` — specs, ADRs, plans (this doc)

> Note: If you intentionally want a single-app layout, collapse `apps/web` into root, but keep `convex/` and `packages/shared/`.

---

### 2.3 Tooling Standards (MVP)
- TypeScript strict mode
- Zod for runtime schemas (shared)
- ESLint + Prettier
- Test runner: Vitest (unit), plus minimal Convex function tests where practical
- Commit hooks optional (Phase 0.5)

---

### 2.4 ADRs to Create (Phase 0)
Create these in `project_spec/adr/`:
- ADR-0001: Monorepo layout & package manager choice
- ADR-0002: Condition language (MVP DSL)
- ADR-0003: Execution snapshot requirement
- ADR-0004: Secrets storage approach
- ADR-0005: ID strategy for workflow nodes (UUID v4 strings)

---

### 2.5 Environment Variables (Draft)
(Names may vary by provider; document exact requirements before first deploy.)

Frontend:
- `VITE_CONVEX_URL` (or framework equivalent)
- Clerk publishable key
- PostHog key (optional MVP)

Backend (Convex):
- Clerk secret
- Sentry DSN (optional MVP)
- Lemon Squeezy secret (Phase 2+)
- Provider keys for integrations (Slack/Twilio/etc) (Phase 5)

---

### 2.6 Definition of Done (Phase 0)
- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes (even if minimal)
- Dev can run web app + Convex backend locally following README
- ADR folder exists + at least 2 ADRs captured (snapshot + tenancy)

---

## 3) Phase 1 — Foundation Data Model & CRUD (Weeks 1–4)

### 3.1 Objectives
- Store workflows (definitions), integrations, executions, and logs
- CRUD flows in UI for workflows
- Minimal execution launcher (even if engine is Phase 3, we wire the skeleton)
- End-to-end: create workflow → save → list → view → (optional) run stub → see execution record/log placeholder

---

## 4) Data Model (Phase 1 Contracts)

### 4.1 Entities (MVP)

#### Workflow
Fields:
- `id`
- `name`
- `trigger` (type + config)
- `nodes[]` (id/type/position/config)
- `edges[]` (source/target/condition?)
- `status`: `draft | active | paused`
- `owner`: `{ teamId?: Id, userId?: Id }`
- `createdAt`, `updatedAt`
- (optional) `version` integer for future optimistic locking

Notes:
- Node `id` is a stable string UUID.
- Node `type` refers to a registry entry (Phase 2/3 expands).

#### Execution
Fields:
- `id`
- `workflowId`
- `workflowSnapshot` (full workflow object)
- `status`: `queued | running | success | failed | canceled`
- `startedAt`, `completedAt`
- `error` (optional)
- `owner` (teamId/userId) for fast auth filtering
- `triggerData` (optional; may be stored or referenced)

#### ExecutionLogEntry
Fields:
- `executionId`
- `nodeId`
- `status`: `started | success | failed | skipped`
- `input` (optional, possibly truncated)
- `output` (optional, possibly truncated)
- `error` (optional)
- `durationMs`
- `createdAt`

#### IntegrationCredential
Fields:
- `owner` (teamId/userId)
- `provider`: e.g. `slack`, `google`, `generic_api`
- `displayName`
- `status`: `connected | expired | error`
- `encryptedSecretRef` (or encrypted blob)
- `scopes` (optional)
- `createdAt`, `updatedAt`

---

### 4.2 Indexing / Query Patterns (MVP)
- Workflows by owner (team/user), sorted by updatedAt
- Executions by workflowId
- Executions by owner (global “Recent runs”)
- Logs by executionId

---

### 4.3 Payload Size Controls (MVP Guardrail)
- Limit `ExecutionLogEntry.input/output` stored size (e.g., 32KB each).
- Store truncated fields + `truncated: true` metadata if needed.
- Avoid storing raw secrets in any log.

---

## 5) Backend API Surface (Convex) — Phase 1

### 5.1 Workflows
Queries:
- `workflows.list({ owner })`
- `workflows.get({ id })`

Mutations:
- `workflows.create({ name, owner, trigger, nodes, edges })`
- `workflows.update({ id, patch })` (validate shape)
- `workflows.delete({ id })`
- `workflows.setStatus({ id, status })`

Key rules:
- AuthZ: owner enforcement on every operation
- Validation: zod schema for workflow object; reject unknown node types only if registry exists (Phase 2). For Phase 1, allow but store.

---

### 5.2 Executions
Queries:
- `executions.listByWorkflow({ workflowId })`
- `executions.get({ id })`

Mutations:
- `executions.create({ workflowId, owner, workflowSnapshot, triggerData? })`
- `executions.markRunning({ id })`
- `executions.complete({ id, status, completedAt, error? })`

---

### 5.3 Execution Logs
Queries:
- `executionLogs.list({ executionId })`

Mutations:
- `executionLogs.append({ executionId, entry })`

---

### 5.4 “Run Workflow” (Phase 1 Stub or Thin Slice)
Action (server-side):
- `executeWorkflow({ workflowId, triggerData })`
  - create execution record with snapshot
  - append a “started” log entry
  - (Phase 1 stub) mark success immediately OR call a placeholder node executor for a single node type (like `http_request` later)

This gives UI something real to hook into without needing full engine yet.

---

## 6) Frontend UI (Phase 1)

### 6.1 Pages / Screens (MVP)
1. **Dashboard / Workflows List**
   - list workflows
   - create workflow button
2. **Workflow Detail**
   - basic metadata editor (name, status)
   - JSON editor view of definition (temporary until Phase 2 canvas)
3. **Executions List (per workflow)**
   - show execution status, timestamps
4. **Execution Detail / Logs Viewer**
   - show per-node logs in chronological order

### 6.2 Minimal UX Requirements
- Every API call has loading + error states
- Empty states: “No workflows yet”, “No runs yet”
- Soft delete confirmation (modal)

---

## 7) Validation & Shared Types (Phase 1)
Create shared zod schemas for:
- `Workflow`
- `Execution`
- `ExecutionLogEntry`
- `IntegrationCredential` (partial)

Also create:
- `NodeDefinition` interface (even if registry is minimal)
- `NodeType` string union for initial nodes (can start with: `manual_trigger`, `webhook_trigger`, `http_request`, `ai_agent` as placeholders)

---

## 8) Testing Plan (Phase 0–1)

### 8.1 Unit Tests (must-have)
- Workflow schema validation tests
- Condition parser/evaluator tests (even if Phase 1 stores conditions, implement evaluator scaffolding early)
- AuthZ helper tests (owner enforcement)

### 8.2 Integration Tests (nice-to-have in Phase 1)
- Create workflow → list → get → update → delete
- Start execution → log append → complete → fetch logs

---

## 9) Milestones & Task Breakdown

### Week 1 (Phase 0 + start Phase 1)
- [ ] Repo scaffolding + scripts
- [ ] Convex initialized + schema scaffolding
- [ ] Shared types package
- [ ] ADRs for key decisions
- [ ] Workflow CRUD backend
- [ ] Workflows list UI

### Week 2
- [ ] Workflow detail editor (basic form + JSON view)
- [ ] Execution entities + CRUD
- [ ] Logs entities + CRUD
- [ ] “Run workflow” action stub wired

### Week 3
- [ ] Execution detail/log viewer UI
- [ ] Owner enforcement hardened across all functions
- [ ] Payload truncation guardrails

### Week 4
- [ ] Polish + documentation
- [ ] Golden-path demo: create → run → view logs
- [ ] Prep for Phase 2 (visual builder): define node registry contract

---

## 10) Acceptance Criteria (Phase 0–1)

### Phase 0
- A new dev can run app + backend locally
- CI passes on main branch
- Decisions captured (ADRs)

### Phase 1
- You can:
  1. Create a workflow (stored in DB)
  2. View/edit workflow metadata and definition
  3. Trigger a run (stub ok)
  4. See an execution record and at least one log entry
- All data access is scoped to user/team (no cross-tenant access)
- Logs do not leak secrets; payloads are size-limited

---

## 11) Known Gaps After Phase 1 (Expected)
- No visual canvas (Phase 2)
- No real execution engine/topological planner beyond stub (Phase 3)
- No NL workflow generation (Phase 4)
- No real integrations or OAuth flows (Phase 5)

---

## 12) Risks & Mitigations (Early)
- **Risk:** Ambiguous ownership rules (team vs personal)
  - **Mitigation:** Implement a single `owner` helper used everywhere.
- **Risk:** Workflow definition churn breaks executions
  - **Mitigation:** Snapshot on execution create.
- **Risk:** Large payloads blow up storage/cost
  - **Mitigation:** Truncation + retention policy from day one.
- **Risk:** Condition evaluation becomes a security footgun
  - **Mitigation:** No eval; minimal DSL only.

---

## 13) Next Doc to Produce (After This Review)
If you confirm the decisions above, the next “coding-ready” docs to generate are:
- `project_spec/adr/ADR-0002-condition-language.md`
- `project_spec/api_contracts.md` (Convex function signatures + zod schemas)
- `project_spec/ui_routes.md` (routes + components + states)
- `project_spec/seed_nodes_registry.md` (initial node types + config schemas)

(Those are optional, but they reduce rework once Phase 2/3 begins.)