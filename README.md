# Agentromatic

AI-powered workflow automation platform (MVP in progress).

This repo is a monorepo containing:
- `apps/web`: Web UI (Vite + React + TS) with a Phase 1 Convex-wired debug UI (`AppConvex.tsx`)
- `convex`: Backend (Convex schema + queries/mutations/actions)
- `packages/shared`: Shared TypeScript + Zod schemas/types
- `project_spec`: Product spec, design spec, ADRs, and build plan

> Current state: Phase 0–1 foundations are in place (data model + CRUD + execution stub) and the web UI is now wired end-to-end to Convex for the Phase 1 thin slice (bootstrap user → workflows/executions/logs → run stub action). Visual builder, workflow engine, and AI nodes are planned phases.

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
Run Convex dev (interactive) from repo root:
```/dev/null/sh#L1-1
npx convex dev
```

Until real auth (e.g. Clerk) is wired, enable dev anonymous user mode (dev only):
```/dev/null/sh#L1-1
npx convex env set AGENTROMATIC_DEV_ANON_USER true
```

Env notes:
- Convex writes `CONVEX_URL` to the **repo root** `.env.local`.
- The web app expects `import.meta.env.VITE_CONVEX_URL`.
- The Vite config maps `CONVEX_URL -> VITE_CONVEX_URL` automatically, so you typically do **not** need a separate `apps/web/.env.local`.

If you still see a “Missing VITE_CONVEX_URL” error in the browser, create `apps/web/.env.local` and set:
- `VITE_CONVEX_URL=<value of CONVEX_URL from repo root .env.local>`

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
- The web app is now integrated with Convex via `apps/web/src/AppConvex.tsx` (Phase 1 debug UI).
- You must run `npx convex dev` for the backend, and the web app must have access to the Convex URL.
  - Preferred: let the Vite config read repo root `.env.local` (`CONVEX_URL`) and inject `VITE_CONVEX_URL`.
  - Fallback: set `VITE_CONVEX_URL` in `apps/web/.env.local`.
- Until Clerk (or other auth) is wired, you must enable dev anonymous mode:
  - Convex env var: `AGENTROMATIC_DEV_ANON_USER=true`
  - The UI calls `users.bootstrap` on load to ensure the `dev_anonymous` user row exists before running queries.
- Some workspace scripts (tests/formatting) are placeholders until Phase 0–1 stabilizes.

---

## Contributing (lightweight)
- Keep `packages/shared` environment-agnostic (no server-only or browser-only assumptions).
- Avoid storing secrets in logs or workflow configs.
- Prefer additive changes to shared schemas (avoid breaking existing shapes).

---
