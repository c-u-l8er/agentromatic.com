# Agentromatic — Marketing Homepage Spec (v0.1)
Status: Draft  
Owner: Product + Engineering  
Audience: Engineering (web), Design, Growth  
Last updated: 2026-01-20

## 0) Purpose
Define the public, signed-out marketing homepage for Agentromatic in a way that:
- **aligns with the product + design specs** (workflow automation, agents, logs, snapshots, safe conditions, integrations foundation)
- **aligns with current implementation reality** (hosted dashboard, Clerk auth, Convex backend, early-stage connectors)
- maximizes conversion for the initial wedge: **Webhook → AI triage → route → notify (chat)**

This doc is a marketing spec, not a UI toolkit spec. It describes sections, copy intent, CTAs, and truth constraints.

---

## 1) Target user + positioning

### 1.1 Primary audience
Zapier/Make power users and ops teams who:
- rely on inbound signals (webhooks from forms, apps, internal services)
- route/triage requests to teams via chat
- are frustrated with brittle automations + opaque failures
- want AI to help with classification but need **control + auditability**

### 1.2 Core positioning statement (homepage)
**AI webhook triage that routes to the right channel—fast.**  
Webhook-first automation with AI + deterministic rules + run logs.

### 1.3 “Reason to believe” (must be spec-aligned)
From `workflow_automation_design_spec.md` and ADRs:
- Workflows are DAGs with nodes/edges; executions have logs.
- Execution logs are structured and stored.
- Snapshotting is required for correctness/auditability (documented in build plan/contracts).
- Conditions are MVP-safe and deterministic (ADR-0002: no `eval`).
- Credentials are server-side and safe-by-default (design intent).

Homepage should avoid deep infra terms in the hero, but can use them in proof sections.

---

## 2) Route + auth behavior

### 2.1 URL behavior
Route: `/`

- **Signed-out**: show marketing homepage.
- **Signed-in**: user should land in the product experience (currently workflows dashboard / app shell).

This is a deliberate divergence from the earlier Phase 1 route assumption (“redirect to /workflows”) and is now the intended behavior.

### 2.2 Auth CTAs (Clerk)
Homepage CTAs:
- Primary: **Start free** → opens Clerk sign-up (modal).
- Secondary: **Sign in** → opens Clerk sign-in (modal).

No gating copy like “request access” unless the business strategy changes.

---

## 3) Homepage sections (required)

### 3.1 Top navigation
- Brand: Agentromatic
- Anchors: Templates, How it works, Pricing, FAQ
- CTAs: Sign in, Start free

### 3.2 Hero (above the fold)
Goal: communicate the wedge in < 5 seconds and get “Start free” clicks.

Hero requirements:
- Plain-language value prop for Zapier replacement buyers
- Mentions webhook-first + routing + chat notify
- Includes “trust” proof line(s): logs, reproducibility, safe rules

Hero copy constraints:
- Do not claim “100+ integrations” unless true in product.
- If chat connectors are not fully shipped, mark them as **beta** (or avoid explicit naming).

Suggested trust bullets:
- “No black box: inspect inputs/outputs/errors.”
- “Reproducible: each run is snapshotted.”
- “Safe rules: deterministic conditions (no arbitrary code execution).”

### 3.3 “Outcome” / value prop strip
Goal: fast scanning.

3 cards:
1. Triage with AI (classify/extract/summarize)
2. Route with rules (safe deterministic conditions)
3. Notify chat (Slack/Mattermost/Discord *if true*; otherwise “chat tools”)

### 3.4 Templates section
Goal: reduce activation friction and increase “Start free”.

Requirements:
- At least 3 templates, keyed by destination:
  - Slack template
  - Mattermost template
  - Discord template
- Each template explains:
  - what it does
  - an example routing rule (pseudocode)
- CTA per template: **Use this template** → Start free (sign-up modal)

### 3.5 “How it works” section
3-step flow:
1. Receive webhook payload
2. AI triage extracts structured fields
3. Route + notify to the correct channel

Include a “why switch” callout:
- Inspectability (logs)
- Reproducibility (snapshots)
- Safety (no eval / deterministic rules)

### 3.6 Pricing section (Lemon Squeezy-ready)
Goal: set expectations and provide a structure to wire billing later.

Requirements:
- Plans: Free, Pro, Business, Enterprise
- Credit-based framing (aligns to `workflow_automation.md` pricing model: credits vs tasks)
- CTAs:
  - Free: Start free (Clerk sign-up modal)
  - Pro/Business: placeholder buttons with plan identifiers usable for checkout wiring (e.g., `data-plan="pro"`)
  - Enterprise: contact link (email or form)
- Do not invent final prices if not committed; placeholders are acceptable.
- Plan features must align with real or committed roadmap:
  - retention controls, team features, support tiers are acceptable to list if they’re planned; mark as “coming soon” if not implemented.

### 3.7 FAQ
Minimum questions:
- What can I connect today?
- Do I need to code?
- How do I trust AI routing?
- What happens when something fails?

Answers must be honest to current product state; avoid overpromising integrations and self-healing beyond MVP implementation.

### 3.8 Final CTA
Re-state the “Start free” CTA with a crisp activation promise:
- “Pick a template → send a test webhook → see the run logs.”

---

## 4) Messaging guardrails (truth constraints)

### 4.1 Allowed to claim now (spec-aligned)
- Workflow automation platform with AI steps
- Structured execution logs
- Workflow snapshotting as a principle/feature (if present in the execution record contract)
- Safe condition evaluation (ADR-0002) — can say “no eval” / “deterministic rules”

### 4.2 Avoid claiming until implemented
- “Self-healing automatically fixes workflows” (unless actually shipped; MVP decision says auto-apply OFF)
- “100+ integrations” (unless shipped)
- “Conversational debugging” (unless shipped)
- “Email triggers” (unless shipped)
- “Webhook endpoints hosted + configurable auth” (only if shipped)

### 4.3 Beta labeling
If Slack/Mattermost/Discord notify are not fully shipped, label:
- “Slack/Mattermost/Discord (beta)” or “chat notify (beta)”
and keep copy from implying full parity with Zapier’s connector breadth.

---

## 5) Design notes (robotic/romantic theme)
Brand vibe: “robotic reliability with romantic warmth.”

Guidelines:
- Keep hero copy literal; put theme into:
  - microcopy (“Automation with a heartbeat.”)
  - visuals (mission control timeline, status dots)
  - subtle gradients and telemetry UI patterns

Avoid humor or whimsy that obscures what the product is.

---

## 6) Analytics / conversion instrumentation (recommended)
(Not required for MVP, but suggested.)

Track:
- CTA clicks: Start free (hero), Start free (pricing), Use template
- Scroll depth to Templates and Pricing
- Template tab selection (Slack vs Mattermost vs Discord)
- Sign-up completion rate (Clerk)

Implementation note:
- Put stable attributes on CTAs (e.g., `data-cta="start-free-hero"`, `data-plan="pro"`) to avoid fragile selector-based tracking.

---

## 7) Acceptance criteria (Definition of Done)
- Signed-out users at `/` see the marketing homepage.
- Primary CTA “Start free” opens Clerk sign-up.
- Secondary CTA “Sign in” opens Clerk sign-in.
- Pricing section includes plan structure + stable plan identifiers for later Lemon Squeezy wiring.
- Copy is consistent with the product/design specs and does not overpromise integrations or self-healing beyond MVP.
- Production build does not show dev-only debug banners or internal environment diagnostics on the marketing homepage.

---

## 8) Implementation notes (alignment to current web app)
- Marketing homepage should be rendered only for signed-out users to preserve “hosted dashboard immediately” promise.
- Keep the marketing homepage independent of backend queries to avoid requiring Convex data when signed out.
- Avoid adding routing complexity in Phase 1; anchor links are acceptable.
- Styling can be lightweight; do not block on Tailwind/shadcn if not already in use.

---