# Agentromatic — UI Routes & Screens (Phase 1)
Version: v0.1  
Scope: Phase 1 (Foundation Data Model & CRUD)  
Audience: Engineering (frontend + backend integration)

This document defines the **initial UI routes**, **screens**, and **data requirements** for Phase 1. Phase 1 UI is intentionally simple (no visual canvas yet). It focuses on CRUD, basic workflow definition editing, and execution/log viewing.

---

## 0) Goals (Phase 1 UI)
- Let a signed-in user:
  1. List workflows (personal scope; team scope later/limited)
  2. Create a workflow
  3. View/edit workflow metadata and JSON definition (temporary)
  4. Trigger a workflow run (stub execution)
  5. View executions list and execution logs
- Provide a signed-out marketing homepage:
  - “Start free” / “Sign in” via Clerk (modal)
  - Templates + pricing/features sections (billing integration later)
- Provide clear loading/error/empty states
- Keep routing stable so Phase 2 can “swap in” the visual builder without breaking navigation

Non-goals (Phase 1 UI):
- Visual workflow canvas (React Flow)
- Natural language workflow generation UI
- Integration credential connect flows
- Advanced branching editor / condition builder UI

---

## 1) Routing Conventions
- Use a shallow route tree to minimize churn:
  - `/workflows` as the main feature area
  - execution details nested under workflows
- Route params:
  - `:workflowId` is the Convex `Id<"workflows">` string
  - `:executionId` is the Convex `Id<"executions">` string

> Note: Exact router/framework is not locked in Phase 1. This doc specifies routes and behavior independent of whether you use TanStack Router, React Router, or TanStack Start file-based routes.

---

## 2) Route Table (Phase 1)

### 2.1 Top-level
1. `/`  
   Signed-out: marketing homepage (templates, pricing, “Start free”).  
   Signed-in: redirect to `/workflows`.

2. `/workflows`  
   Workflows list + create workflow CTA.

3. `/workflows/new`  
   Create workflow form (name + trigger type + optional JSON editor scaffold).

4. `/workflows/:workflowId`  
   Workflow detail:
   - metadata editor (name, status)
   - definition editor (nodes/edges/trigger config)
   - “Run” button (execute stub)
   - recent executions preview (top N)

5. `/workflows/:workflowId/executions`  
   Full executions list for a workflow.

6. `/workflows/:workflowId/executions/:executionId`  
   Execution detail + logs viewer.

### 2.2 Optional utility (Phase 1 nice-to-have)
7. `/runs`  
   Recent executions across workflows (personal scope). (Uses executions.listRecent.)

8. `/settings`  
   Placeholder page (Phase 1: show “coming soon”). Useful as a stable nav anchor.

---

## 3) Global Layout (Phase 1)
### 3.1 Layout components
- `AppShell`
  - Left nav:
    - Workflows
    - Runs (optional)
    - Settings (placeholder)
  - Main content area
  - Minimal header with product name and environment badge (dev/prod) if available

### 3.2 Cross-cutting UI patterns
- `PageHeader`
  - Title
  - Primary action (e.g., “Create workflow”)
- `SectionCard`
- `EmptyState`
- `InlineError`
- `Skeleton` (optional)

---

## 4) Screen Specs

## 4.1 Workflows List — `/workflows`
**Primary goal:** show all workflows the user can access; allow create and quick navigation.

### UI components
- Page header:
  - Title: “Workflows”
  - Primary button: “Create workflow”
- Table/List:
  - Name
  - Status
  - Updated timestamp
  - Actions: View, Run (optional quick-run), Delete (with confirm)
- Empty state:
  - “No workflows yet” + CTA to create

### Data requirements
- Query: `convex/workflows.list({ teamId?, limit? })`
  - Phase 1 default: personal scope (no `teamId`)
- Fields displayed:
  - `name`, `status`, `updatedAt`

### Behaviors
- Create CTA navigates to `/workflows/new`
- Clicking row navigates to `/workflows/:workflowId`
- Delete flow:
  - confirm modal → call `convex/workflows.remove({ id })` → optimistic remove on success
- Error states:
  - show error + retry

---

## 4.2 Create Workflow — `/workflows/new`
**Primary goal:** create a workflow with a valid minimal definition.

### UI components
- Form:
  - Name (required)
  - Trigger type (required): `manual | webhook | schedule | email`
  - Trigger config JSON editor (optional; defaults to `{}`)
- Optional: “Create from template” (Phase 1: hardcoded templates)
  - Example templates:
    - Manual trigger only (no nodes)
    - Webhook trigger (empty config)
- Submit button: “Create workflow”
- Cancel button → back to `/workflows`

### Data requirements
- Mutation: `convex/workflows.create({ name, trigger, nodes?, edges?, status? })`
  - Phase 1 recommended defaults:
    - status: `draft`
    - nodes: `[]`
    - edges: `[]`
    - trigger.config: `{}`

### Behaviors
- On success: navigate to `/workflows/:workflowId`
- Validate locally:
  - name non-empty
  - trigger type selected
  - trigger config JSON parseable (if user edits)

---

## 4.3 Workflow Detail — `/workflows/:workflowId`
**Primary goal:** view/update workflow definition and run it.

### UI components
- Breadcrumb: Workflows → Workflow name
- Header:
  - Workflow name (editable inline or via form)
  - Status dropdown: `draft | active | paused`
  - Buttons:
    - “Save” (if editing locally; optional)
    - “Run” (calls execute action)
- Tabs (or sections):
  1. **Definition**
     - JSON editor for:
       - trigger config
       - nodes array
       - edges array
     - “Validate” button (optional) to run local schema checks
  2. **Executions (Recent)**
     - list last ~10 executions (status, startedAt, completedAt)
     - click-through to execution detail
     - “View all executions” link to `/workflows/:workflowId/executions`

### Data requirements
- Query: `convex/workflows.get({ id })`
- Mutation: `convex/workflows.update({ id, patch })`
- Mutation: `convex/workflows.setStatus({ id, status })` (optional; can be folded into update)
- Action: `convex/executeWorkflow.executeWorkflow({ workflowId, triggerData? })`
- Query (recent runs): `convex/executions.listByWorkflow({ workflowId, limit? })`

### Behaviors
- Edits:
  - Phase 1 approach: store draft edits in local state; submit via update mutation
  - Update patch keys likely used:
    - `name`, `trigger`, `nodes`, `edges`, `status`
- Run:
  - TriggerData input:
    - Provide a small JSON input area (default `{}`)
    - Validate JSON parseable
  - On run success:
    - navigate to `/workflows/:workflowId/executions/:executionId`
  - On run failure:
    - show toast + allow navigation to execution anyway (executionId is returned)
- Guardrails:
  - Never allow editing ownership fields
  - UI should warn if definition JSON is invalid (parse error)

---

## 4.4 Workflow Executions List — `/workflows/:workflowId/executions`
**Primary goal:** list all executions for a workflow.

### UI components
- Header:
  - Title: “Executions”
  - Secondary action: “Run workflow”
- Filters (optional Phase 1):
  - Status filter: running/success/failed/canceled
- Table/List:
  - Status badge
  - StartedAt
  - CompletedAt
  - Duration (computed)
  - Error preview (if failed)
  - “View logs” link

### Data requirements
- Query: `convex/executions.listByWorkflow({ workflowId, limit? })`

### Behaviors
- Selecting an execution navigates to execution detail

---

## 4.5 Execution Detail + Logs — `/workflows/:workflowId/executions/:executionId`
**Primary goal:** show what happened during a run.

### UI components
- Header:
  - Execution status badge
  - StartedAt / CompletedAt / Duration
  - Buttons:
    - “Re-run” (optional in Phase 1; can just call run again)
- Logs viewer:
  - chronological list grouped by nodeId (or flat list for Phase 1)
  - each entry shows:
    - nodeId
    - status
    - durationMs
    - timestamp
  - expandable panels:
    - input JSON
    - output JSON
    - error text (if failed)

### Data requirements
- Query: `convex/executions.get({ id })`
- Query: `convex/executionLogs.list({ executionId, limit? })`

### Behaviors
- If execution is missing/forbidden: show “Not found” or “Forbidden”
- If logs empty: show empty state “No logs recorded”
- Large payloads:
  - If server stored truncated marker objects (e.g., `{__truncated:true,...}`), render with a “truncated” tag

---

## 4.6 Runs (Optional) — `/runs`
**Primary goal:** show recent runs across workflows, personal scope.

### Data requirements
- Query: `convex/executions.listRecent({ teamId?, limit?, status? })`

### UI components
- Table with:
  - workflowId (link to workflow)
  - status
  - startedAt
  - error preview

---

## 5) Navigation Model (Phase 1)
- Left nav:
  - Workflows (default)
  - Runs (optional)
  - Settings (placeholder)
- From Workflows list:
  - click workflow → workflow detail
- From workflow detail:
  - click execution → execution detail
  - click “View all” → workflow executions list

---

## 6) State Handling Requirements (Phase 1)
### Loading
- For list pages: skeleton list (optional) or “Loading…”
- For detail pages: skeleton header + placeholder sections

### Errors
- Show non-technical error summary (“Couldn’t load workflow”) + “Retry”
- Optionally show a collapsible error detail for debugging in dev builds

### Empty states
- Workflows: “Create your first workflow”
- Executions: “No runs yet” + CTA “Run workflow”
- Logs: “No logs recorded” (should be rare once stub action always writes a start log)

---

## 7) Data Validation (UI-side)
- Always validate user-edited JSON fields:
  - parse JSON
  - optionally validate shape using `@agentromatic/shared` schemas
- Never allow secrets input on Phase 1 screens (credentials come later)
- Prevent accidental huge triggerData inputs (client-side size warning)

---

## 8) Phase 1 “Thin Slice” Demo Script
This is the demo path you should be able to follow once the UI is wired:

1. Go to `/workflows`
2. Click “Create workflow”
3. Enter name, choose `manual` trigger, save
4. On workflow detail, optionally edit definition JSON
5. Click “Run” with sample triggerData
6. Navigate to execution detail, see:
   - execution record
   - at least 2 logs: `__start__` and `__end__` (success)
7. Return to executions list and see the run

---

## 9) Phase 2 Compatibility Notes
To avoid rework when adding the visual builder:
- Keep `/workflows/:workflowId` route stable
- Replace Definition JSON editor with React Flow canvas + side panel, but preserve:
  - status control
  - run button
  - executions preview
- Execution and logs routes remain the same

---