# Agentromatic — Marketing Homepage Spec (v0.2) — DevOps & Platform Engineering
Status: Draft  
Owner: Product + Engineering  
Audience: Engineering (web), Design, Growth  
Last updated: 2026-01-20

## 0) Purpose
Define the public, signed-out marketing homepage for Agentromatic in a way that:
- **reflects the DevOps / Platform Engineering vertical** (platform teams, SRE, DevOps leads)
- **stays honest to current implementation** (early-stage product: Convex backend, Clerk auth, Phase 1 workflow/execution/log scaffolding)
- orients the roadmap without overpromising (Temporal-based execution + multi-agent orchestration is the direction; shipping status must be clear)
- maximizes conversion for the initial wedge: **DevOps workflows as code → durable runs → audit-ready logs**

This doc is a marketing spec (copy intent + sections + CTAs + truth constraints), not a UI toolkit spec.

---

## 1) Target user + positioning

### 1.1 Primary audience (ICP)
Platform / DevOps / SRE teams at software companies (roughly 50–500 engineers) who:
- run Kubernetes + IaC (Terraform/Pulumi) and manage CI/CD pipelines
- struggle with fragmented “glue scripts” + ad-hoc runbooks (“integration tax”)
- need reliability, reproducibility, audit trails, and controlled automation (not brittle “best effort”)
- want automation that fits SDLC: Git, PRs, environments, approvals, rollbacks

### 1.2 Secondary audiences
- Platform engineering leads building internal developer platforms (IDPs)
- DevOps consultancies standardizing deployment workflows across clients
- Security/compliance partners who need evidence (SOC2-style audit trails)

### 1.3 Core positioning statement (homepage)
**DevOps workflows as code—durable, auditable, and agent-assisted.**  
Agentromatic is a workflow platform for engineering teams: define workflows in code, run them reliably, and debug with full event history and logs.

### 1.4 One-sentence pitch (homepage)
**“Temporal-style reliability for DevOps workflows: code-first automation with durable runs, audit-ready logs, and agent orchestration.”**

### 1.5 “Reason to believe” (must be spec-aligned)
From `workflow_automation_design_spec.md`, `api_contracts.md`, and ADRs:
- Workflows are DAGs with nodes/edges; executions have structured logs.
- Each execution stores a **workflow snapshot** for correctness/auditability.
- Conditions are MVP-safe and deterministic (ADR-0002: no `eval`).
- Credentials are server-side and safe-by-default (design intent).
- The system is designed for debuggability: inputs/outputs/errors are inspectable per step.

---

## 2) Route + auth behavior

### 2.1 URL behavior
Route: `/`

- **Signed-out**: show marketing homepage.
- **Signed-in**: user should land in the product experience (workflows dashboard / app shell).

### 2.2 Auth CTAs (Clerk)
Homepage CTAs:
- Primary: **Start free** → opens Clerk sign-up (modal).
- Secondary: **Sign in** → opens Clerk sign-in (modal).

Avoid “Request access” unless strategy changes.

---

## 3) Homepage sections (required)

### 3.1 Top navigation
- Brand: Agentromatic
- Anchors (recommended): Use cases, How it works, Integrations, Pricing, FAQ
- CTAs: Sign in, Start free

### 3.2 Hero (above the fold)
Goal: communicate the DevOps/platform value prop in < 5 seconds and drive “Start free”.

Hero requirements:
- Explicitly code-first + SDLC-native (Git/PRs/testing), not “visual automation”
- Emphasize durability + auditability (runs survive restarts; every run is traceable)
- Include a short code snippet that looks like real engineering work (TypeScript/Python)

Hero copy constraints (truth):
- Do not claim “99.999% uptime guarantee” unless backed by an actual SLA.
- Do not claim “predict failures at 90% accuracy” unless measured and shipped.
- Do not claim broad integration counts (“100+ integrations”) unless true.

Suggested trust bullets:
- “No black box: inspect inputs/outputs/errors per step.”
- “Reproducible: each run snapshots the workflow definition.”
- “Safe by default: deterministic rules (no arbitrary code execution).”

### 3.3 Value prop strip (fast scan)
3 cards:
1. **Workflows as code**: TypeScript/Python SDK, diffable, testable, reviewable
2. **Durable execution + observability**: event history, retries, step logs, run replay
3. **DevOps-ready governance**: environments, approvals, RBAC/audit trail (as “planned” if not shipped)

### 3.4 Use cases / templates section (DevOps-native)
Goal: reduce activation friction with templates that match platform team work.

Requirements:
- At least 3 templates (DevOps-specific), each with:
  - what it does
  - triggers (manual, Git webhook, CI event)
  - the “failure mode story” (what happens on failure: rollback, alerts)
  - CTA: **Use this template** → Start free (sign-up modal)

Recommended templates for v0.2:
1. **Kubernetes deploy with smoke tests + rollback**
   - deploy → validate → rollback on failed checks → notify
2. **Terraform plan/apply with policy gates**
   - plan → policy check → apply → drift check → notify/audit
3. **Incident workflow: triage → mitigation runbook → notify**
   - pager event → summarize context → run safe mitigations → post timeline

Templates should be described as “starter templates” and may be labeled “beta” if not fully wired.

### 3.5 “How it works” section (engineering flow)
3-step flow:
1. **Define** workflows in code and store in Git (PR reviews, tests)
2. **Run** via UI/CLI/webhook and get durable execution (retries, resumability)
3. **Observe** runs with a trace + logs + audit trail (what ran, when, why)

Include a “why this vs GitHub Actions scripts” callout:
- Workflows aren’t tied to a repo runner lifecycle
- Durable state and event history
- Consistent governance across environments

### 3.6 Integrations section (honest and focused)
Goal: show you understand the ecosystem without claiming breadth.

Requirements:
- List only integrations that are real or explicitly “planned”.
- Prefer a small list of deep integrations:
  - GitHub/GitLab (planned/partial)
  - Kubernetes (planned)
  - Terraform/Pulumi (planned)
  - Datadog/Prometheus (planned)
  - Slack/PagerDuty (planned)

Copy guidance:
- Use “Roadmap” or “Rolling out” language for anything not shipping today.
- Avoid implying “click-to-connect OAuth” unless it exists.

### 3.7 Pricing section (Lemon Squeezy-ready)
Goal: set expectations and make checkout wiring easy later.

Requirements:
- Plans: Free, Team, Business, Enterprise
- Usage-based framing: executions, environments, retention (credits optional but should map cleanly)
- CTAs:
  - Free: Start free (Clerk sign-up modal)
  - Team/Business: placeholder buttons with plan identifiers (e.g., `data-plan="pro"`)
  - Enterprise: contact link (email or form)
- Prices may be shown if you want to commit; otherwise use placeholders.

Recommended feature shape (truth-guarded):
- Free: limited executions + single environment + basic logs
- Team: dev/staging/prod + more executions + baseline integrations
- Business: higher volume + longer retention + audit exports (mark “planned” if not shipped)
- Enterprise: SSO/RBAC/on-prem (mark “planned” if not shipped)

### 3.8 FAQ
Minimum questions (DevOps-specific):
- What is Agentromatic (and how is it different from CI/CD tools)?
- Do I need to adopt a new UI, or can I keep Git/PR workflows?
- How do rollbacks/retries work?
- How do you handle audit trails and compliance needs?
- What integrations are available today?

Answers must be honest: label roadmap vs shipped.

### 3.9 Final CTA
Re-state the “Start free” CTA with a crisp activation promise:
- “Pick a template → run a staging deployment workflow → inspect the trace and logs.”

---

## 4) Messaging guardrails (truth constraints)

### 4.1 Allowed to claim now (spec-aligned)
- Workflow automation platform with structured executions/logs.
- Workflow snapshotting per run (auditability/correctness).
- Safe deterministic rule evaluation (ADR-0002: no `eval`).
- Code-first workflows are a product direction (if implemented, claim as shipped; otherwise phrase as “building”).

### 4.2 Avoid claiming until implemented / verified
- Hard SLA claims (e.g., “99.999% uptime guarantee”).
- Numerical accuracy claims for AI (e.g., “90% failure prediction accuracy”).
- “Self-healing automatically fixes everything” (MVP decision: auto-apply OFF).
- Broad connector counts or “native integrations with everything”.
- “On-prem available” unless actually delivered.

### 4.3 How to talk about Temporal / durability
It’s OK to say “built on Temporal” only if it’s true in the codebase/deployment.
If it’s not yet true, use: “Temporal-compatible direction” or “Temporal-style durable execution” and place it under “Roadmap”.

---

## 5) Design notes (robotic/romantic theme, DevOps edition)
Brand vibe: “robotic reliability with romantic warmth,” expressed through:
- telemetry / mission-control motifs (run timeline, status dots, trace-like UI)
- copy that is crisp and literal (no fluff in the hero)
- subtle warmth in microcopy (“Automation with a heartbeat.”)

Avoid “developer meme” humor. This page should feel credible to platform teams.

---

## 6) Analytics / conversion instrumentation (recommended)
Track:
- CTA clicks: Start free (hero), Start free (pricing), Use template
- Scroll depth to Use cases/Integrations/Pricing
- Template selection (which use case resonates)
- Sign-up completion rate (Clerk)

Implementation note:
- Put stable attributes on CTAs (e.g., `data-cta="start-free-hero"`, `data-plan="pro"`).

---

## 7) Acceptance criteria (Definition of Done)
- Signed-out users at `/` see the DevOps/platform marketing homepage.
- Primary CTA “Start free” opens Clerk sign-up.
- Secondary CTA “Sign in” opens Clerk sign-in.
- Page includes: Hero, Use cases/Templates, How it works, Integrations, Pricing, FAQ, Final CTA.
- Pricing section includes stable plan identifiers for later Lemon Squeezy wiring.
- Copy does not overpromise (no hard SLA/accuracy claims unless verified).
- Production build does not expose dev-only debug banners or internal diagnostics on the marketing homepage.

---

## 8) Implementation notes (alignment to current web app)
- Marketing homepage should be rendered only for signed-out users to preserve “get into the product quickly” UX.
- Keep the marketing homepage independent of backend queries when signed out.
- Use anchors for navigation (no routing complexity required for v0.2).
- Styling can remain lightweight (inline styles are acceptable for now).

---