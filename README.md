# Agentromatic

AI-powered workflow automation platform (MVP in progress).

This repo is a monorepo containing:
- `apps/web`: Web UI (currently scaffolded with Vite + React + TS)
- `convex`: Backend (Convex schema + queries/mutations/actions)
- `packages/shared`: Shared TypeScript + Zod schemas/types
- `project_spec`: Product spec, design spec, ADRs, and build plan

> Current state: Phase 0–1 foundations are being built (data model + CRUD + execution stub). Visual builder, workflow engine, and AI nodes are planned phases.

---

## Tech Stack (current)
- Node.js (local dev)
- TypeScript
- Convex (backend DB + server functions)
- React (UI scaffold)
- Zod (shared runtime validation)

> Planned/target (per specs): TanStack Start, React Flow, shadcn/ui, Clerk auth, Lemon Squeezy billing, etc.

---

## Prerequisites
- **Node.js**: >= 20 (recommended)
- npm (comes with Node)

Check versions:
```/dev/null/sh#L1-3
node -v
npm -v
```

---

## Install
From repo root:
```/dev/null/sh#L1-2
npm install
```

This uses npm workspaces to install dependencies for:
- `apps/web`
- `packages/shared`
- plus root tooling deps

---

## Local Development

### 1) Web app (UI)
Run:
```/dev/null/sh#L1-2
npm run dev
```

This delegates to `apps/web`.

### 2) Convex backend
Convex is installed as a dependency, but you still need to **initialize and run Convex locally**.

Typical flow (high-level):
1. Create a Convex project (or link an existing one)
2. Configure auth (later) and environment variables
3. Run the Convex dev process in parallel with the web dev server

> The exact Convex initialization commands depend on how you want to configure the project (local vs hosted dev). If you haven’t initialized Convex in this repo yet, do that next.

---

## Workspace Scripts (root)
Run from repo root:
- `npm run dev` — run the web app dev server
- `npm run build` — build the web app
- `npm run preview` — preview the web build
- `npm run typecheck` — TypeScript typecheck across workspaces
- `npm run lint` — lint across workspaces
- `npm run test` — tests across workspaces (mostly placeholders right now)
- `npm run clean` — clean build artifacts across workspaces

---

## What’s Implemented (MVP Phase 0–1)
### Repo + shared contracts
- Monorepo workspace layout
- `@agentromatic/shared` package with Zod schemas:
  - `Workflow`, `Execution`, `ExecutionLogEntry`, `IntegrationCredential`

### Convex schema + server functions (Phase 1)
Convex schema includes:
- `users`
- `teams`
- `workflows`
- `executions`
- `executionLogs`
- `integrationCredentials`

Server modules:
- `convex/workflows.ts`: workflow CRUD
- `convex/executions.ts`: executions CRUD
- `convex/executionLogs.ts`: logs list/append
- `convex/executeWorkflow.ts`: **execution action stub** that creates an execution + logs and marks success

### Tenancy model (MVP simplification)
- A document is owned by either:
  - `userId` (personal), or
  - `teamId` (team-owned)
- Team authorization is currently simplified to `teams.ownerUserId === currentUserId`.
  - This will evolve to real team membership/roles.

---

## Important Design Decisions (ADRs)
See `project_spec/adr/`:
- ADR-0001: Monorepo structure & tooling
- ADR-0002: MVP condition language (no `eval`)

Build plan:
- `project_spec/mvp_build_plan.md`

---

## Next Steps (planned)
Phase 1 completion:
- Wire UI to Convex functions
- Workflows list/detail pages
- Executions list/detail + logs viewer

Phase 2+:
- Visual workflow builder (React Flow)
- Execution engine (DAG planning, sequential runtime, branching)
- AI agent node + natural language workflow generation
- Integrations SDK + connectors
- Auth (Clerk), billing, observability

---

## Notes / Caveats
- The web app is currently a scaffold and not yet integrated with Convex.
- The Convex backend requires project initialization before it can run.
- Some workspace scripts (tests/formatting) are placeholders until Phase 0–1 stabilizes.

---

## Contributing (lightweight)
- Keep `packages/shared` environment-agnostic (no server-only or browser-only assumptions).
- Avoid storing secrets in logs or workflow configs.
- Prefer additive changes to shared schemas (avoid breaking existing shapes).

---