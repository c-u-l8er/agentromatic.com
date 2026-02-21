# Agentromatic — Spec-to-Implementation REALIGNMENT PLAN (v1)

Status: actionable checklist  
Audience: Engineering (Agentromatic), with integration touchpoints for WHS + Agentelic  
Goal: ensure the current specs are internally consistent **and** consistent with the intended MVP implementation approach.

> Note: This plan is written assuming the specs under `agentromatic.com/project_spec/` are the source of truth. If the implementation (libs/apps) already diverged, treat this plan as the “spec patch + code patch” tracker.

---

## 0) What this file is for

This file is a **single place** to answer:

1) What is the “real” contract we’re building (data model, API surface, engine semantics)?  
2) What is inconsistent today?  
3) What exact changes do we make to:
- specs (documents)
- implementation (libs/apps)
- tests
to realign?

This plan is intentionally written as:
- **Spec patches** (docs to change)
- **Implementation tasks** (code changes to make)
- **Acceptance tests** (how you prove alignment)

---

## 1) Canonical v1 decisions (lock these)

These are the decisions Agentromatic v1 MUST follow across all docs and code:

### 1.1 Execution snapshotting is REQUIRED
- On execution creation, persist `workflowSnapshot` (workflow definition at run start).
- Logs reference snapshot node ids.

### 1.2 `currentData` is ACCUMULATED, not overwritten
Canonical shape (v1):
- `currentData = { trigger: triggerData, nodes: { [nodeId]: nodeOutput }, meta?: {...} }`

### 1.3 Execution logs are stored as SEPARATE RECORDS
Normative v1:
- `Execution` does **not** embed `log[]`.
- Instead, persist `ExecutionLogEntry` records keyed by `executionId` (and `nodeId`) in chronological order.

### 1.4 Status enums are normalized
Use these enums consistently in docs and code:
- Execution `status`: `queued | running | success | failed | canceled`
- LogEntry `status`: `started | success | failed | skipped | retried`

### 1.5 Condition language: safe, minimal DSL (no eval)
- No arbitrary JS evaluation.
- Comparisons + boolean ops only (MVP).
- Deterministic ordering on multi-edge matches.

### 1.6 Secret handling
- No plaintext secrets in:
  - workflow config
  - execution logs
  - errors returned to clients
- Log redaction + payload truncation required.

---

## 2) Current known spec inconsistencies to fix (spec patches)

### 2.1 Embedded execution logs vs separate log entries
**Problem**
Some docs imply `Execution.log: Array<ExecutionLogEntry>` while the MVP plan expects separate log records.

**Spec patch**
- Update `workflow_automation_design_spec.md`:
  - Remove embedded `Execution.log` field.
  - Add “Log storage (normative v1 decision): separate records”.

- Ensure `mvp_build_plan.md` and `api_contracts.md` reflect:
  - `executionLogs.list({ executionId })`
  - `executionLogs.append({ executionId, entry })`

**Acceptance**
- Spec search for `Execution.log` should only appear in historical/explicitly deprecated sections.

---

### 2.2 `currentData = result` overwrite pattern in pseudocode
**Problem**
Some product-spec pseudocode overwrites `currentData` per node, which breaks downstream references and prevents self-heal mapping safety.

**Spec patch**
- Update `workflow_automation.md`:
  - Clarify the code is pseudocode, and ensure the shown algorithm stores node outputs under `currentData.nodes[nodeId]`.

**Acceptance**
- No doc shows `currentData = result` as the recommended runtime algorithm.

---

### 2.3 Status naming mismatch (`succeeded` vs `success`)
**Problem**
Mixed terminology increases implementation drift and complicates UI.

**Spec patch**
- Normalize to `success` everywhere:
  - `workflow_automation_design_spec.md`
  - `api_contracts.md`
  - any UI/route docs that name statuses

**Acceptance**
- A single enum set appears across specs (see §1.4).

---

### 2.4 Snapshotting described as optional in some places
**Problem**
If snapshotting is optional, executions become non-reproducible and auditing is compromised.

**Spec patch**
- Wherever snapshotting is described as “recommended”, change to **required** for v1.

**Acceptance**
- Every execution creation contract includes `workflowSnapshot` or an equivalent immutable reference.

---

## 3) Implementation realignment checklist (code work)

> These tasks are written in “what to implement”, not framework-specific steps. Apply them to your actual runtime stack.

### 3.1 Data model / persistence (Convex or equivalent)
**Implement**
- `workflows` collection/table:
  - owner scope (user/team)
  - nodes/edges
  - status
  - timestamps
  - versioning (optional but recommended)

- `executions` collection/table:
  - `workflowId`
  - `workflowSnapshot` (required)
  - `status`
  - `owner` scope for auth filtering
  - timestamps
  - `triggerData` (bounded; may store a reference later)

- `executionLogEntries` (or `executionLogs`) collection/table:
  - `executionId`
  - `nodeId`
  - `status`
  - `attempt`
  - `durationMs`
  - `input`/`output` (redacted + truncated)
  - `error` (safe)
  - timestamps
  - index by `executionId + createdAt`

**Acceptance tests**
- You can create an execution and then list log entries without reading a giant embedded array.
- Payload truncation prevents oversized inserts.

---

### 3.2 Backend API surface alignment
**Implement**
Workflows:
- `workflows.list(ownerScope)`
- `workflows.get(id)` (authz enforced)
- `workflows.create(payload)`
- `workflows.update(id, patch)` (validate)
- `workflows.setStatus(id, status)`
- `workflows.delete(id)` (soft delete optional)

Executions:
- `executions.create({ workflowId, triggerData })`:
  - loads workflow
  - snapshots workflow
  - creates execution row
- `executions.get(id)`
- `executions.listByWorkflow(workflowId)`

Logs:
- `executionLogs.append({ executionId, entry })`
- `executionLogs.list({ executionId, cursor? })`

**Acceptance tests**
- Cross-tenant IDOR is blocked:
  - cannot get execution/logs if not owner/member in scope.
- Logs pagination works (cursor-based).

---

### 3.3 Engine semantics: sequential MVP with deterministic branching
**Implement**
- Validate graph:
  - node ids unique
  - edges refer to nodes
  - cycle detection (enforce on publish/active)
- Planner:
  - topological sort for deterministic order
- Runner:
  - evaluate edge conditions against `currentData`
  - run nodes sequentially
  - on node success: `currentData.nodes[nodeId] = output`
  - on node failure: fail-fast (v1)
  - log started/success/failed

**Acceptance tests**
- Given same workflowSnapshot + triggerData, node run order is deterministic.
- A failure stops further nodes and final status is `failed`.

---

### 3.4 Condition DSL implementation (MVP)
**Implement**
- Parser + evaluator for:
  - literals (string/number/bool)
  - path lookup into `currentData` (e.g., `$.trigger.foo`, `$.nodes.nodeA.bar`)
  - comparisons (`==`, `!=`, `>`, `>=`, `<`, `<=`)
  - boolean ops (`and`, `or`)
- Reject:
  - function calls
  - arbitrary JS
  - any token not in grammar

**Acceptance tests**
- DSL evaluation is deterministic and safe.
- Invalid expressions are rejected at publish time (or at run time with clear error).

---

### 3.5 Redaction + payload truncation (non-optional)
**Implement**
- A single shared utility:
  - takes `(nodeType, input/output/error)` and produces redacted object
  - supports:
    - `sensitivePaths` per node type
    - generic key-based redaction for `token`, `authorization`, `apiKey`, etc.
- Size bounds:
  - cap serialized payload size (e.g., 32KB each for `input` and `output`)
  - store `truncated: true` flags

**Acceptance tests**
- Known secret fields never persist in logs.
- Oversized payloads do not crash execution logging.

---

### 3.6 Rerun behavior
**Implement**
- “Re-run execution” creates a new execution using:
  - same workflowSnapshot (default)
  - same triggerData (default) or user-provided override

**Acceptance tests**
- Rerun produces a new execution id and its own log stream.

---

## 4) Spec-to-code mapping table (what to trust)

Use this to prevent “spec drift by ambiguity”.

| Domain | Canonical spec file(s) | Notes |
|---|---|---|
| Execution semantics | `workflow_automation_design_spec.md`, `mvp_build_plan.md` | Design spec should be normative; product spec is descriptive. |
| API surface | `api_contracts.md` (Agentromatic), plus integration bridge docs | Treat as normative for backend + UI contracts. |
| UI routes/pages | `ui_routes.md` | UI can lag; don’t break API to match UI. |
| WHS integration | `whs_integration.md` | Must align to WHS delegated invocation + auth. |

---

## 5) Realign libs to spec plan (if implementation already exists)

If your implementation differs today, do this in order:

1) **Freeze the canonical spec** (this file + the spec patches in §2).  
2) **Add “compat shims” only if needed**:
   - If current API returns embedded logs, keep it temporarily but mark it deprecated and migrate UI to `executionLogs.list`.
3) **Migrate storage**:
   - Backfill log entries if you previously stored embedded logs.
4) **Update UI**:
   - logs viewer reads from `executionLogs.list` with pagination.
5) **Lock with tests**:
   - IDOR tests
   - condition DSL tests
   - truncation/redaction tests
   - deterministic execution order test

Definition of done for realignment:
- A single golden-path workflow can be created, run, inspected via logs, re-run, and audited, with all server-side authz enforced and no secret leakage.

---

## 6) Open questions (must answer to finish v1 cleanly)

1) **Owner scope**: user-only vs team-first? If both, how do you choose scope for workflows and executions?  
2) **Trigger types**: which triggers are real in v1 (webhook/schedule/manual)?  
3) **Branching semantics**: if multiple edges match, do you allow fan-out (run multiple) or first-match only?  
4) **Retention defaults**: exact days for executions vs logs; do you allow per-workspace overrides?

When answered, capture as ADRs under `project_spec/adr/`.

---