# ADR-0002: MVP-Safe Condition Language (No `eval`)
- **Status:** Accepted
- **Date:** 2026-01-20
- **Owners:** Engineering
- **Related Specs:** `project_spec/workflow_automation.md`, `project_spec/workflow_automation_design_spec.md`
- **Decision Scope:** How workflow edge conditions are represented, parsed, and evaluated in MVP

---

## Context

Agentromatic workflows are DAGs with edges that can be conditional (branching). The design spec lists “Open Decisions” including the condition language choice. We need a minimal, safe, deterministic way to:
- Evaluate whether an edge should be taken given `currentData`
- Avoid arbitrary code execution risks
- Keep conditions understandable for users and debuggable in execution logs
- Support future upgrades without breaking stored workflows

Constraints for MVP:
- Multi-tenant system; user-supplied workflows must never execute arbitrary code on the server.
- Conditions should be portable (same behavior everywhere).
- We want to ship quickly; complex expression engines and UI builders are out of scope for MVP.

---

## Decision

### 1) Condition representation in storage (MVP)
Store conditions as an **optional string expression** on `edges[].condition`.

- If `condition` is missing/empty ⇒ treat as **always true**.
- If `condition` is present ⇒ evaluate with the MVP parser/evaluator against `currentData`.

This matches the product spec shape (`condition?: string`) and keeps the workflow schema simple.

---

### 2) Safety model: No `eval`, no arbitrary JS
The condition language must be:
- Parsed into an AST by our own parser (or a constrained parser library) and evaluated by our own evaluator.
- Free of side effects.
- Disallow all function calls, property writes, dynamic code, and prototype access.
- Deterministic and bounded (expression length and parse depth limits).

Explicitly forbidden:
- JavaScript `eval`, `new Function`, or equivalent
- Any interpolation that results in executing user-provided code
- Any ability to call functions (including `Date()`, `Math.*`, etc.) in MVP

---

### 3) MVP feature set (grammar and semantics)

#### 3.1 Data access
- Read-only access to `currentData` via a JSON-path-like syntax:
  - Preferred user-facing: `$.foo.bar` (rooted)
  - Acceptable internal alias: `foo.bar` (rooted at `currentData`)
- Only simple identifiers for segments: `[A-Za-z_][A-Za-z0-9_]*`
- Optional bracket indexing for arrays by integer literal is allowed if needed:
  - `$.items[0].id`
- If a path does not exist, it evaluates to `null` (or `undefined` mapped to `null`) for comparisons.

Security notes:
- Disallow `__proto__`, `prototype`, `constructor` segments.
- Disallow arbitrary bracket keys (e.g. `["__proto__"]`) in MVP.

#### 3.2 Literals
- String literals: single quotes recommended: `'US'`, `'hot'`
- Number literals: integers/decimals: `80`, `3.14`
- Boolean literals: `true`, `false`
- Null literal: `null`

#### 3.3 Operators
Comparisons:
- `==`, `!=`, `>`, `>=`, `<`, `<=`

Boolean logic:
- `and`, `or`
- Optional unary negation: `not`

Grouping:
- Parentheses: `( ... )`

No regex, no contains, no math operators in MVP.

#### 3.4 Type coercion rules (MVP)
- For `==` / `!=`: strict-ish equality:
  - If both sides are same primitive type, compare normally.
  - If types differ, return `false` for `==` and `true` for `!=` (no string-number coercion).
- For ordering comparisons (`>`, `>=`, `<`, `<=`):
  - Only valid when both sides are numbers.
  - Otherwise result is `false` (and evaluator should optionally emit a debug note).

Rationale: predictable behavior, less surprising than JavaScript coercion.

---

### 4) Limits (guardrails)
- Maximum condition string length: **2000 chars**
- Maximum parse depth (nesting): **50**
- Maximum tokens: **500** (approx; implementable limit)

If a condition violates limits or fails to parse:
- The execution should fail the node/edge evaluation step deterministically.
- Record a clear error in execution logs including the condition string (possibly truncated).

---

## Examples

### Allowed
- `$.lead.score >= 80 and $.lead.region == 'US'`
- `not ($.spam == true) and $.email != null`
- `($.tier == 'pro' or $.tier == 'enterprise') and $.seats >= 10`
- `$.items[0].id != null`

### Disallowed (MVP)
- `$.x + 1 > 2` (no arithmetic operators)
- `$.name.includes('foo')` (no function calls)
- `someJsFunction()` (no function calls)
- `$.user['role'] == 'admin'` (no arbitrary bracket keys)
- `$.constructor.prototype` (blocked segments)

---

## Consequences

### Positive
- Prevents remote code execution vectors from user-authored workflows.
- Deterministic, testable behavior across environments.
- Simple enough to implement early and integrate with logs.

### Negative / Tradeoffs
- MVP expressiveness is limited (no string contains, regex, math).
- Storing as a string delays structured UI editing and validation UX.
- Future expansion must preserve backward compatibility.

---

## Implementation Notes (Guidance)

### Parsing & evaluation approach
- Implement a small tokenizer + Pratt parser (or equivalent) to produce a typed AST.
- Evaluate AST against `currentData` in a pure function:
  - `evaluateCondition(expr: string, currentData: unknown): { ok: true, value: boolean } | { ok: false, error: string }`
- Ensure path resolution is safe:
  - Only traverse plain objects/arrays
  - Block prototype chain traversal explicitly
  - Treat missing segments as `null`

### Logging
When evaluating a conditional edge, log:
- `edge.source`, `edge.target`
- `condition` string
- evaluation result (`true/false`) or parse/eval error

### Migration path (post-MVP)
- Introduce a structured `conditionAst` representation while still accepting string conditions.
- Add operators incrementally (e.g., `contains`, `in`, `matches`).
- Add a UI condition builder that emits the same canonical form.

---

## Alternatives Considered

### A) JavaScript expression evaluation (`eval` / `Function`)
Rejected due to severe security risk and non-determinism.

### B) JSON Logic (jsonlogic.com style)
Pros: structured, safe, UI-friendly.
Cons: more verbose for users, additional translation and UX work.
Deferred; may be a good post-MVP upgrade.

### C) Full-featured DSL (CEL, JMESPath, etc.)
Pros: mature features.
Cons: added complexity, mismatch with desired UX, and potentially more overhead than MVP needs.
Deferred.

---

## Acceptance Criteria
- Conditions cannot execute arbitrary code.
- Conditions are deterministic for the same `currentData`.
- Parser rejects invalid syntax with clear error messages.
- Tests cover:
  - happy paths for each operator
  - missing fields and null handling
  - blocked segments (`__proto__`, `constructor`, `prototype`)
  - depth/length limits

---

## Related ADRs
- ADR-0001: Monorepo Structure & Tooling
- ADR-0003: Execution snapshot requirement
- ADR-0004: Secrets storage approach
- ADR-0005: Node ID strategy (UUID v4 strings)