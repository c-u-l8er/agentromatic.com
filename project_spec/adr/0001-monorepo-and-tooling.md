# ADR-0001: Monorepo Structure & Tooling (npm workspaces)

- **Status:** Accepted
- **Date:** 2026-01-20
- **Owners:** Engineering
- **Related Specs:** `project_spec/workflow_automation.md`, `project_spec/workflow_automation_design_spec.md`
- **Decision Scope:** Repository layout + package manager/workspace strategy + baseline tooling

---

## Context

Agentromatic is a full-stack workflow automation product with:
- A web UI (workflow builder + logs viewer)
- A backend (Convex) for data, actions, and workflow execution
- Shared schemas/types used by both UI and backend (e.g., workflow definitions, execution/log contracts, node config schemas)

We need a repo structure that:
- Keeps frontend/backend concerns separated but close
- Encourages reuse of shared types without copy/paste
- Supports incremental delivery phases (Phase 0 setup, Phase 1 CRUD, later execution engine, integrations, etc.)
- Is straightforward to run locally and in CI

---

## Decision

### 1) Use a monorepo with explicit top-level folders

Repository layout:

- `apps/web/` — web application (TanStack Start later; currently scaffolded for UI)
- `convex/` — Convex backend (schema, queries, mutations, actions)
- `packages/shared/` — shared TypeScript types and Zod schemas (workflow/execution/log contracts, node config schemas)
- `project_spec/` — specifications, ADRs, and planning docs

This keeps product code discoverable and supports growth (additional apps like `apps/docs/` or `apps/worker/` later).

### 2) Use **npm workspaces** as the workspace/package manager strategy

- Workspace root `package.json` defines `"workspaces": ["apps/*", "packages/*"]`
- Shared code is referenced as a workspace dependency, e.g. `@agentromatic/shared: "workspace:*"`

Rationale:
- npm is installed by default in most Node environments; simplest onboarding path
- Sufficient for Phase 0–1 and early MVP without adding dependency-manager complexity
- Works with standard CI runners and lockfile expectations

### 3) Tooling baseline: TypeScript + Zod + ESLint (strict by default)

- TypeScript in `strict` mode (shared package must be strict)
- Zod for runtime schemas and validation shared across frontend/backend
- ESLint for basic linting
- Formatting/testing are optional in Phase 0 but should be added early once the core code settles

---

## Alternatives Considered

### A) Multiple repositories (frontend repo + backend repo + shared repo)
**Pros**
- Clear separation, independent release cycles

**Cons**
- Friction for shared types: versioning, publishing, and coordination overhead
- Harder to keep schema contracts consistent across UI and backend
- Slower iteration speed early in a product

**Decision:** Rejected (too much coordination overhead for MVP).

### B) pnpm workspaces
**Pros**
- Fast installs, strict dependency graph, good monorepo ergonomics

**Cons**
- Requires installing pnpm; slightly higher onboarding/CI setup cost

**Decision:** Deferred. We can migrate later if install speed or node_modules size becomes an issue.

### C) Turborepo / Nx build orchestration
**Pros**
- Excellent caching and task orchestration at scale

**Cons**
- Adds complexity before we have enough packages/apps to justify it

**Decision:** Rejected for MVP; revisit when build/test time becomes a bottleneck.

### D) Yarn Berry (PnP)
**Pros**
- Fast and deterministic dependency management

**Cons**
- PnP compatibility issues with some tooling; higher cognitive overhead for contributors

**Decision:** Rejected for MVP.

---

## Consequences

### Positive
- Shared schemas/types live in one place and are imported consistently
- Simple local development and CI story: one workspace install, then run scripts
- Clear growth path for adding apps/packages without restructuring

### Negative / Tradeoffs
- npm is not the fastest for large monorepos; may slow down as the project grows
- Without additional tooling (e.g., Turborepo), cross-workspace task orchestration is basic
- Requires discipline to keep `packages/shared` stable and not coupled to app-specific runtime assumptions

---

## Implementation Notes (Guidance)

### Workspace scripts (root)
The root should provide convenience scripts that delegate to workspaces, for example:
- `npm run dev` (web dev)
- `npm run typecheck` (all workspaces)
- `npm run lint` (all workspaces)

### Shared package guidelines
- `packages/shared` must remain environment-agnostic:
  - No DOM-only APIs
  - No Convex-only imports
  - No server-only secrets handling
- Prefer Zod schemas and plain TS types/interfaces
- Keep exports stable and additive to avoid churn across apps

### Directory ownership rules
- `apps/web`: UI concerns (routes, pages, components, React Flow, etc.)
- `convex`: persistence + server-side actions (workflow CRUD, execution records/logs, later execution engine actions)
- `packages/shared`: contracts and validation used by both

---

## Follow-ups / Revisit Criteria

Revisit this ADR if any of the following occur:
- Workspace install times become a meaningful contributor pain point
- We add multiple apps/packages and need task caching (consider Turborepo/Nx)
- Convex + web app require more complex local orchestration (consider a `docker-compose`-style dev harness or scripts)
- We need stricter dependency constraints between packages (consider pnpm)

---

## Related ADRs

- ADR-0002: Condition language (MVP DSL)
- ADR-0003: Execution snapshot requirement
- ADR-0004: Secrets storage approach
- ADR-0005: Node ID strategy (UUID v4 string IDs)