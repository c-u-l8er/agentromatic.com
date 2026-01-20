# Convex Setup (Interactive Initialization)

This repo includes a `convex/` backend (schema + functions), but Convex requires an **interactive one-time initialization** to:
- log in / authenticate
- create or select a Convex project
- generate `convex/_generated/*` (client/server bindings)
- write local config files (e.g., `.convex/`)

Because initialization is interactive, you must run it yourself in a real terminal.

---

## 0) Prerequisites

- Node.js >= 20
- npm
- Repo dependencies installed

From repo root:

```sh
npm install
```

---

## 1) Initialize / Link Convex (interactive)

From the repo root (`agentromatic.com/`), run:

```sh
npx convex dev
```

You should see prompts like:
- Log in to Convex (browser-based login)
- Create a new project or select an existing one
- Choose a deployment (dev)

Convex will then:
- create a `.convex/` directory (local project metadata)
- generate `convex/_generated/` based on your schema and functions
- start the Convex dev process (watches backend code)

### What to commit vs not commit
- **Do not commit**:
  - `.convex/` (local machine / environment metadata)
  - `convex/_generated/` (generated; depends on local config and Convex tooling)
- This repo’s `.gitignore` already ignores both:
  - `.convex/`
  - `convex/_generated/`

---

## 2) Run the Web App

In another terminal, from repo root:

```sh
npm run dev
```

That starts `apps/web` (currently a Phase 1 scaffold).

---

## 3) Common Issues

### “Cannot prompt for input in non-interactive terminals”
You’re running Convex in a terminal context that can’t accept interactive prompts (CI, a restricted terminal UI, or piped input).

Fix:
- Run `npx convex dev` in a normal interactive terminal (local shell).

### “Unauthenticated” errors (before auth integration)
Right now the backend functions assume an authenticated identity exists. If you haven’t wired Clerk (or any auth provider) yet, calls may fail with “Unauthenticated”.

To unblock local development **temporarily**, the backend supports an **anonymous dev user mode**:

- Set the Convex environment variable:
  - `AGENTROMATIC_DEV_ANON_USER=true`

How to set it (run in an interactive terminal, after you’ve linked/initialized Convex):

- For your dev deployment:
  - `npx convex env set AGENTROMATIC_DEV_ANON_USER true`

Notes:
- This mode is meant only for local dev scaffolding while auth is being integrated.
- Keep it **OFF by default** and do not enable it in production deployments.

### Login / account issues
If the login flow fails:
- try running `npx convex dev` again
- ensure your browser can open the login URL and complete auth

### Generated files missing
If `convex/_generated` doesn’t appear:
- confirm `npx convex dev` actually completed initialization
- check you’re running it from the repo root (where `convex/` exists)

---

## 4) What “working” looks like

After successful init:
- `.convex/` exists at repo root
- `convex/_generated/` exists and includes at least:
  - `api.d.ts` / `api.js` (or equivalents)
  - `dataModel.d.ts` / `server.d.ts` (or equivalents)
- `npx convex dev` stays running and prints that it’s watching your Convex functions

---

## 5) Next Steps After Convex is Running (Phase 1 wiring)

Once Convex is initialized and the dev process is running, we’ll do the real integration work:

1. Add a Convex client to `apps/web`
2. Create UI screens:
   - workflows list + create
   - workflow detail (JSON editor for now)
   - executions list + execution detail/log viewer
3. Wire UI to Convex functions:
   - `workflows.list`, `workflows.get`, `workflows.create`, `workflows.update`, `workflows.remove`
   - `executions.listByWorkflow`, `executions.get`
   - `executionLogs.list`
   - action: `executeWorkflow.executeWorkflow` (Phase 1 stub)

Reference:
- `project_spec/api_contracts.md`
- `project_spec/ui_routes.md`

---

## 6) Quick Checklist

- [ ] `npm install` from repo root
- [ ] `npx convex dev` (interactive) completes successfully
- [ ] `.convex/` created (NOT committed)
- [ ] `convex/_generated/` created (NOT committed)
- [ ] (Optional, before auth integration) `npx convex env set AGENTROMATIC_DEV_ANON_USER true`
- [ ] `npm run dev` starts the web app
