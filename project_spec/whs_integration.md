# Agentromatic ↔ WHS Integration Spec (Delegated Invoke, Option A)
Version: 1.0  
Status: Draft (normative for implementation once adopted)  
Audience: Engineering (Agentromatic + WebHost.Systems)  
Last updated: 2026-01-24

This document defines how **Agentromatic** (workflow orchestration) invokes **WHS (WebHost.Systems)** (agent runtime) during workflow execution, using a **server-to-server delegated HMAC authentication model**.

Context (Option A, confirmed):
- **Agentromatic** executes workflows (DAG) in its backend (Convex actions):
  - owns workflow definitions, executions, execution logs, condition evaluation, snapshotting
- **WHS** executes agents (runtime providers) and owns:
  - agents, deployments, invocation gateway (`invoke/v1` semantics), telemetry, limits/billing
- A workflow node type `whs_agent_invoke` is the integration bridge:
  - Agentromatic orchestrates and calls WHS to run “agent steps”

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 0) Goals and non-goals

### 0.1 Goals
1. Allow Agentromatic to invoke WHS agents from a workflow execution step **server-side** (no browser token dependency).
2. Preserve tenant correctness:
   - invocations are authorized and billed as the correct user/tenant in WHS.
3. Provide deterministic idempotency to prevent duplicate side effects and costs under retries.
4. Provide observability:
   - Agentromatic execution logs reference WHS `traceId` and optional `sessionId`.
5. Keep security posture consistent with WHS:
   - signed requests over raw bytes (HMAC), bounded payloads, normalized errors.

### 0.2 Non-goals
- Agentromatic does not deploy WHS agents (deployment remains a WHS control-plane operation).
- Agentromatic does not ingest WHS telemetry (telemetry is WHS-owned).
- This spec does not define Agentelic/Delegatic behavior; it only defines the Agentromatic ↔ WHS invoke bridge.

---

## 1) Architecture stance (hard boundaries)

### 1.1 Source of truth
- Agentromatic is the source of truth for:
  - workflow definitions, execution records, execution logs
- WHS is the source of truth for:
  - agent definitions, deployments, invocation protocol, telemetry, tier gating, billing/limits

### 1.2 References, not copies
Agentromatic MUST store only:
- WHS invocation references (`traceId`, optional `sessionId`, optional `requestId`)
- bounded safe summaries/snippets (optional; redacted)

Agentromatic MUST NOT:
- copy WHS telemetry events into its DB
- store WHS secrets or tokens
- store large raw transcripts or tool traces beyond bounded logs

---

## 2) Security model: delegated invocation via HMAC (v1)

### 2.1 Why delegated HMAC
Agentromatic executes workflows via backend actions. It cannot rely on a browser JWT at execution time and should not mint/handle long-lived user tokens.

Therefore:
- Agentromatic calls WHS using a shared HMAC secret:
  - WHS validates integrity/authenticity of the request body bytes.
  - WHS performs user mapping and enforces entitlements as the delegated user.

This model is similar in spirit to WHS telemetry integrity (signed events over raw bytes), but used for server-side delegation.

### 2.2 Delegation headers (REQUIRED)
For delegated invoke requests, Agentromatic MUST send:

- `X-WHS-Delegation-Source: agentromatic`
- `X-WHS-Delegation-Timestamp: <epoch_ms>` (string)
- `X-WHS-Delegation-Signature: v1=<hex(hmac_sha256(raw_body_bytes, WHS_DELEGATION_SECRET))>`

WHS MUST:
- verify the signature over the exact raw bytes received
- reject missing/invalid signatures (`UNAUTHENTICATED`)
- enforce a timestamp skew window:
  - recommended: accept if `abs(nowMs - timestampMs) <= 5 * 60_000`
  - reject outside window (`UNAUTHENTICATED` or `INVALID_REQUEST` with safe message)

Anti-replay (recommended but MVP-optional):
- WHS SHOULD dedupe/reject replays using:
  - `(delegation.idempotencyKey, delegation.timestamp)` or a separate nonce, if introduced later.

### 2.3 Secrets
- `WHS_DELEGATION_SECRET` MUST be stored server-side only (Convex env + WHS env).
- The secret MUST NOT be logged.
- The secret MUST NOT be sent to clients.

### 2.4 Threat model notes
This scheme assumes:
- Agentromatic backend is trusted to request delegated invocations.
- WHS is authoritative for:
  - user/tenant mapping, agent ownership checks, and billing/limits.

If Agentromatic is compromised, it could attempt delegated invocations “as other users.” Therefore WHS MUST:
- enforce that the delegated `externalUserId` is part of the request body and is used as the identity for authorization and billing
- reject attempts to invoke agents that user cannot invoke (ownership/entitlement)
- treat the HMAC as proof of “Agentromatic backend” identity, not proof of end-user authorization.

---

## 3) Endpoint shape (WHS side)

### 3.1 New endpoint (recommended)
WHS SHOULD expose a dedicated internal endpoint for delegation:

- `POST /v1/delegated/invoke/:agentId`

Rationale:
- keeps separation between user-authenticated invoke and service-auth delegated invoke
- easier to apply specialized auth logic and rate limiting
- reduces ambiguity about auth scheme

Alternative (acceptable):
- `POST /v1/invoke/:agentId` can accept either user JWT or delegated headers, but this increases complexity and risk.

This spec assumes the dedicated endpoint exists.

### 3.2 Request body schema (Agentromatic → WHS)
Request JSON MUST be:

```json
{
  "delegation": {
    "mode": "hmac_v1",
    "externalUserId": "string",
    "source": "agentromatic",
    "workflow": {
      "workflowId": "string",
      "executionId": "string",
      "nodeId": "string",
      "attempt": 1
    },
    "idempotencyKey": "string"
  },
  "invoke": {
    "input": {
      "messages": [
        { "role": "system", "content": "..." },
        { "role": "user", "content": "..." }
      ]
    },
    "sessionId": "string|null",
    "options": {
      "maxSteps": 10,
      "temperature": 0.2,
      "toolPolicy": {
        "mode": "deny_by_default",
        "allow": []
      }
    },
    "metadata": {
      "traceId": "string|null",
      "correlation": {
        "workflowExecutionId": "string",
        "workflowId": "string",
        "nodeId": "string"
      }
    }
  }
}
```

Notes:
- `delegation.externalUserId` MUST be the stable external auth subject (e.g., Clerk user id).
- `delegation.idempotencyKey` MUST be deterministic per node attempt (see §5).
- `invoke.options` MAY omit fields; WHS should apply defaults.
- `invoke.metadata.correlation` SHOULD be preserved in WHS logs/telemetry as safe metadata.

### 3.3 Response body schema (WHS → Agentromatic)
On success, WHS MUST return the standard invoke response shape:

```json
{
  "output": {
    "text": "string",
    "messages": [
      { "role": "assistant", "content": "..." }
    ]
  },
  "sessionId": "string|null",
  "usage": {
    "tokens": 0,
    "computeMs": 0,
    "toolCalls": 0
  },
  "traceId": "string",
  "error": null
}
```

On failure, WHS MUST return a normalized error response (see §4).

Streaming:
- v1 integration assumes non-streaming. Streaming MAY be added later by adding:
  - `POST /v1/delegated/invoke/:agentId/stream` (SSE)
- If streaming is added, Agentromatic MUST still record a final WHS `traceId` and status in execution logs.

---

## 4) Error normalization (required)

### 4.1 WHS error envelope
WHS must return stable errors compatible with its own API contract norms, including:

- `code`: `UNAUTHENTICATED | UNAUTHORIZED | NOT_FOUND | LIMIT_EXCEEDED | RUNTIME_ERROR | INVALID_REQUEST | INTERNAL`
- `message`: safe, user-displayable (no secrets)
- `details?`: optional; MUST NOT contain secrets

Agentromatic MUST map WHS errors into workflow execution outcomes deterministically:
- Node status: `failed`
- Execution behavior: follow Agentromatic workflow failure policy (MVP default: fail execution and stop)

### 4.2 Retry classification
WHS SHOULD include a hint for retryability (optional field), e.g.:
- `retryable: boolean`
or encode it in `code`.

Agentromatic SHOULD apply bounded retry policy ONLY if:
- the node is configured as retryable, AND
- error is retryable, AND
- idempotency is in place (it is, per spec)

---

## 5) Idempotency (critical)

### 5.1 Agentromatic idempotency key format (REQUIRED)
Agentromatic MUST generate an idempotency key for each WHS invocation attempt as:

- `agentromatic:exec:<executionId>:node:<nodeId>:attempt:<attemptNumber>`

Where:
- `executionId` is the Agentromatic execution record id (string)
- `nodeId` is the workflow snapshot node id (string UUID recommended)
- `attemptNumber` starts at 1 and increments per retry attempt

Example:
- `agentromatic:exec:ex_123:node:node_abc:attempt:1`

The idempotency key MUST:
- be stable across retries of the same attempt
- NOT include secret values or message content
- be bounded length (<= 200 chars recommended)

### 5.2 WHS idempotency behavior (REQUIRED)
WHS MUST dedupe delegated invocations by `(externalUserId, agentId, idempotencyKey)` such that:
- If a request with the same tuple is received again:
  - return the same logical result or a stable reference to the original result
  - do not double-charge or double-execute side effects

Implementation strategies (WHS):
- Store a small idempotency ledger table keyed by tuple with:
  - request hash
  - response payload (bounded) or response reference
  - createdAtMs / completedAtMs
  - traceId/sessionId

If the same idempotencyKey is reused with a materially different request body:
- return `CONFLICT` (or `INVALID_REQUEST`) with safe message:
  - “Idempotency key reused with different payload.”

### 5.3 Agentromatic behavior on retries
Agentromatic MUST:
- reuse the same idempotency key for a given attempt if it is retrying the HTTP request due to transport failure where it cannot tell if the upstream executed
- only increment attemptNumber when it is semantically performing a new retry attempt

---

## 6) Node contract: `whs_agent_invoke`

### 6.1 Node config (minimum)
Agentromatic MUST support a node type that references a WHS agent.

Minimum config:

```json
{
  "type": "whs_agent_invoke",
  "config": {
    "whsAgentId": "string",
    "deploymentPin": "string|null",
    "inputMode": "messages",
    "systemPrompt": "string|null",
    "toolPolicy": {
      "mode": "deny_by_default",
      "allow": []
    }
  }
}
```

Semantics:
- `whsAgentId` is required and identifies the WHS agent to invoke.
- `deploymentPin` is optional:
  - if null: invoke WHS agent’s active deployment
  - if set: WHS MAY route to that deployment if WHS supports a deployment override (optional feature)
- `systemPrompt`:
  - if provided, Agentromatic uses it as the system prompt (bounded)
  - if null, use workflow/global defaults for the agent node
- `toolPolicy`:
  - Agentromatic SHOULD pass through to WHS `invoke.options.toolPolicy` if WHS supports it
  - if WHS ignores it, it must be safe (deny-by-default on WHS side is still recommended)

### 6.2 Input assembly (Agentromatic side)
Agentromatic SHOULD construct `invoke.input.messages` from:
- a system message describing the workflow context and constraints (secret-free)
- the current node input (derived from workflow `currentData` and triggerData)
- optionally, room/telespace context when triggered by Agentelic (but Agentelic is out of scope here)

Agentromatic MUST:
- bound message sizes (avoid sending huge histories)
- avoid embedding secrets
- avoid embedding raw prior tool traces unless explicitly allowed and safe

---

## 7) Observability: what Agentromatic logs

### 7.1 Execution log fields (REQUIRED)
When executing a `whs_agent_invoke` node, Agentromatic MUST write execution log entries that include:
- `nodeId`
- `status: started|success|failed`
- `durationMs`
- `input` (bounded, redacted; ideally references rather than full messages)
- `output` (bounded, redacted)
- `error` (safe message)
- WHS references:
  - `whsAgentId`
  - `whsTraceId`
  - `whsSessionId?`

Agentromatic SHOULD also include:
- `idempotencyKey`
- `attemptNumber`

### 7.2 Correlation
Agentromatic SHOULD include in WHS `invoke.metadata`:
- `workflowId`
- `executionId`
- `nodeId`
So WHS telemetry can be correlated back to workflow runs without Agentromatic ingesting telemetry.

---

## 8) Rate limits and backpressure

### 8.1 WHS remains authoritative
WHS is authoritative for:
- per-user tier limits
- request limits and gating
- compute/token budgets (as implemented)

WHS SHOULD apply strict rate limiting to delegated endpoints to prevent abuse if Agentromatic floods requests.

### 8.2 Agentromatic behavior on limit exceeded
If WHS returns `LIMIT_EXCEEDED`:
- Agentromatic MUST treat it as a node failure.
- Agentromatic SHOULD classify it as non-retryable unless the workflow is explicitly configured to retry after delay.

---

## 9) Required environment variables

### 9.1 Agentromatic backend (Convex)
Agentromatic backend MUST have:
- `WHS_CONTROL_PLANE_URL` (base URL for WHS API)
- `WHS_DELEGATION_SECRET` (shared HMAC key)

Recommended:
- `WHS_DELEGATION_CLOCK_SKEW_MS` (e.g., 300000)
- `WHS_HTTP_TIMEOUT_MS` (e.g., 30000)

### 9.2 WHS control plane
WHS MUST have:
- `WHS_DELEGATION_SECRET` (same shared HMAC key)
- `WHS_DELEGATION_ALLOWED_SOURCES` (optional allowlist, e.g., includes `agentromatic`)
- `WHS_DELEGATION_CLOCK_SKEW_MS` (timestamp validation)

---

## 10) Acceptance criteria (Definition of Done for this integration)

Integration is “done” when:

1. Agentromatic can execute a workflow containing a `whs_agent_invoke` node and:
   - create an execution record
   - write node logs
   - call WHS delegated invoke endpoint successfully
   - store WHS `traceId` in the execution logs

2. WHS enforces correctness:
   - validates HMAC over raw bytes
   - validates timestamp window
   - resolves the delegated user from `externalUserId`
   - enforces agent access (cannot invoke another user’s agent)
   - enforces limits/billing/entitlements
   - dedupes repeated calls by idempotency key

3. Idempotency is proven:
   - retrying the same node attempt (same idempotencyKey) does not create duplicate invocations/cost
   - reusing an idempotency key with different body yields a deterministic conflict error

4. Errors are safe:
   - no secrets in error messages or logs
   - Agentromatic maps WHS errors to node failure deterministically

---

## 11) Open decisions (follow-up ADR candidates)
1. Streaming support:
   - whether to add delegated SSE endpoint and how Agentromatic logs partial deltas
2. Deployment pinning:
   - whether WHS supports invoking a specific deployment id for a given agent
3. Tool policy enforcement:
   - whether WHS supports `toolPolicy` and how strict it is by default
4. Anti-replay:
   - nonce vs ledger vs timestamp-only window
5. Cross-product identity:
   - confirm all systems share the same Clerk issuer/subject ids

---
