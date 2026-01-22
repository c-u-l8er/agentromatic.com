import React, { useMemo, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";

/**
 * Marketing homepage for signed-out users.
 *
 * Positioning (updated vertical):
 * - DevOps & Platform Engineering
 * - Workflows-as-code + durable execution + audit-ready history
 * - "Temporal for DevOps workflows" (application layer: templates, agents, SDLC integration)
 *
 * Notes:
 * - Pricing CTAs include `data-plan` attributes so you can later wire Lemon Squeezy
 *   checkout links without refactoring the layout.
 * - This page intentionally uses inline styles to avoid new styling dependencies.
 */

type PlanKey = "free" | "pro" | "business" | "enterprise";

function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Pill(props: { children: React.ReactNode }): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "rgba(255,255,255,0.7)",
        color: "#111827",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.1,
      }}
    >
      {props.children}
    </span>
  );
}

function PrimaryButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  "data-plan"?: PlanKey;
}): React.ReactElement {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      data-plan={props["data-plan"]}
      style={{
        appearance: "none",
        border: "1px solid #111827",
        background: "#111827",
        color: "#ffffff",
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 14,
        lineHeight: 1,
        boxShadow: "0 8px 24px rgba(17,24,39,0.14)",
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  "data-plan"?: PlanKey;
}): React.ReactElement {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      data-plan={props["data-plan"]}
      style={{
        appearance: "none",
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        color: "#111827",
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 14,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </button>
  );
}

function Section(props: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      id={props.id}
      style={{
        padding: "56px 0",
        borderTop: "1px solid rgba(229,231,235,0.8)",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        {props.eyebrow ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.2,
              color: "#6b7280",
              textTransform: "uppercase",
            }}
          >
            {props.eyebrow}
          </div>
        ) : null}

        <div style={{ fontSize: 28, fontWeight: 900, color: "#111827" }}>
          {props.title}
        </div>

        {props.subtitle ? (
          <div style={{ marginTop: 8, color: "#374151", fontSize: 15 }}>
            {props.subtitle}
          </div>
        ) : null}
      </div>

      {props.children}
    </section>
  );
}

function Card(props: {
  title: string;
  description: string;
  icon?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
        boxShadow: "0 1px 0 rgba(17,24,39,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        {props.icon ? (
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              color: "#111827",
            }}
          >
            {props.icon}
          </div>
        ) : null}
        <div style={{ fontWeight: 900, color: "#111827" }}>{props.title}</div>
      </div>
      <div
        style={{
          marginTop: 8,
          color: "#374151",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {props.description}
      </div>
      {props.children ? (
        <div style={{ marginTop: 12 }}>{props.children}</div>
      ) : null}
    </div>
  );
}

function CodeBlock(props: {
  title?: string;
  code: string;
}): React.ReactElement {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        overflow: "hidden",
        background: "#0b1220",
      }}
    >
      {props.title ? (
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.8)",
            fontSize: 12,
            fontWeight: 800,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{props.title}</span>
          <span style={{ fontFamily: styles.mono.fontFamily, opacity: 0.85 }}>
            workflow.ts
          </span>
        </div>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: 12,
          color: "rgba(255,255,255,0.92)",
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: "auto",
          fontFamily: styles.mono.fontFamily,
          whiteSpace: "pre",
        }}
      >
        {props.code}
      </pre>
    </div>
  );
}

function PricingCard(props: {
  plan: PlanKey;
  title: string;
  tagline: string;
  price: string;
  highlighted?: boolean;
  features: string[];
  cta: React.ReactNode;
  finePrint?: string;
}): React.ReactElement {
  return (
    <div
      style={{
        border: props.highlighted ? "1px solid #111827" : "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 18,
        background: props.highlighted ? "rgba(17,24,39,0.02)" : "#fff",
        boxShadow: props.highlighted
          ? "0 18px 50px rgba(17,24,39,0.10)"
          : "none",
        position: "relative",
      }}
    >
      {props.highlighted ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "#111827",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          Most popular
        </div>
      ) : null}

      <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
        {props.title}
      </div>
      <div style={{ marginTop: 6, color: "#374151", fontSize: 13 }}>
        {props.tagline}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 26, color: "#111827" }}>
          {props.price}
        </div>
        <div style={{ color: "#6b7280", fontSize: 13 }}>per month</div>
      </div>

      <div style={{ marginTop: 14 }}>{props.cta}</div>

      <ul
        style={{
          marginTop: 14,
          paddingLeft: 18,
          color: "#111827",
          fontSize: 13,
        }}
      >
        {props.features.map((f) => (
          <li key={f} style={{ marginTop: 8, color: "#374151" }}>
            <span style={{ color: "#111827", fontWeight: 800 }}>✓</span>{" "}
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {props.finePrint ? (
        <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>
          {props.finePrint}
        </div>
      ) : null}
    </div>
  );
}

function statusDotStyle(status: string): React.CSSProperties {
  const color =
    status === "success"
      ? "#16a34a"
      : status === "failed"
        ? "#dc2626"
        : "#6b7280";

  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color,
    boxShadow: `0 0 0 4px rgba(22,163,74,0.10)`,
    flex: "0 0 auto",
  };
}

export default function MarketingHome(): React.ReactElement {
  const [activeTemplate, setActiveTemplate] = useState<
    "k8sDeploy" | "terraformPlan" | "incidentRollback"
  >("k8sDeploy");

  const templateCopy = useMemo(() => {
    const common = {
      title: "Workflows as code → durable execution → audit-ready history",
      subtitle:
        "Define infrastructure workflows in code, run them durably, and ship with the observability and safety teams expect.",
      gates:
        "Example gates:\n" +
        "- if policy.requireApprovals == true → request approval\n" +
        "- if checks.smoke.passed == false → rollback\n" +
        "- if security.cves.high > 0 → block deploy\n" +
        "- else → proceed",
    };

    if (activeTemplate === "terraformPlan") {
      return {
        ...common,
        destination: "Terraform Plan → Apply",
        notifyLine:
          "Plan/apply with approvals, drift visibility, and a human-readable audit trail tied to the execution history.",
        channelExamples: "dev / staging / prod",
      };
    }

    if (activeTemplate === "incidentRollback") {
      return {
        ...common,
        destination: "Incident Auto-Rollback",
        notifyLine:
          "Detect elevated error rates, roll back safely, and notify on-call with the exact evidence trail.",
        channelExamples: "service=payments-api, env=prod",
      };
    }

    return {
      ...common,
      destination: "Kubernetes Deploy",
      notifyLine:
        "Roll out to Kubernetes with built-in verification steps and a rollback path when tests or SLOs fail.",
      channelExamples: "service=payments-api, env=prod",
    };
  }, [activeTemplate]);

  return (
    <div style={styles.page}>
      <div style={styles.heroBg} aria-hidden="true" />

      <div style={styles.container}>
        <header style={styles.nav}>
          <div style={styles.brandRow}>
            <div style={styles.logoMark} aria-hidden="true">
              A
            </div>
            <div>
              <div style={styles.brand}>Agentromatic</div>
              <div style={styles.brandTagline}>
                Automation with a heartbeat.
              </div>
            </div>
          </div>

          <nav style={styles.navLinks} aria-label="Primary">
            <button
              style={styles.navLink}
              type="button"
              onClick={() => scrollToId("templates")}
            >
              Use cases
            </button>

            <button
              style={styles.navLink}
              type="button"
              onClick={() => scrollToId("integrations")}
            >
              Integrations
            </button>
            <button
              style={styles.navLink}
              type="button"
              onClick={() => scrollToId("how")}
            >
              How it works
            </button>
            <button
              style={styles.navLink}
              type="button"
              onClick={() => scrollToId("pricing")}
            >
              Pricing
            </button>
            <button
              style={styles.navLink}
              type="button"
              onClick={() => scrollToId("faq")}
            >
              FAQ
            </button>
          </nav>

          <div style={styles.navCtas}>
            <SignInButton mode="modal">
              <button type="button" style={styles.signInBtn}>
                Sign in
              </button>
            </SignInButton>

            <SignUpButton mode="modal">
              <span>
                <PrimaryButton>Start free</PrimaryButton>
              </span>
            </SignUpButton>
          </div>
        </header>

        <main style={{ paddingBottom: 40 }}>
          {/* HERO */}
          <div style={styles.hero}>
            <div style={styles.heroLeft}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Pill>Workflows as code</Pill>
                <Pill>Durable execution</Pill>
                <Pill>Git • CI/CD • Kubernetes • Terraform</Pill>
              </div>

              <h1 style={styles.h1}>
                Temporal-style reliability for DevOps workflows—built for
                platform teams.
              </h1>

              <p style={styles.lede}>
                Orchestrate deployments, tests, rollbacks, and compliance checks
                as code—then get{" "}
                <strong>logs and an audit trail for every run</strong>.
              </p>

              <div style={styles.heroButtons}>
                <SignUpButton mode="modal">
                  <span>
                    <PrimaryButton>Start free</PrimaryButton>
                  </span>
                </SignUpButton>

                <SecondaryButton onClick={() => scrollToId("templates")}>
                  Use a template
                </SecondaryButton>

                <SecondaryButton onClick={() => scrollToId("pricing")}>
                  View pricing
                </SecondaryButton>
              </div>

              <div style={styles.trustRow}>
                <span style={styles.trustItem}>
                  <strong style={{ color: "#111827" }}>No black box:</strong>{" "}
                  inspect inputs, outputs, and errors.
                </span>
                <span style={styles.trustItem}>
                  <strong style={{ color: "#111827" }}>Reproducible:</strong>{" "}
                  run snapshots prevent “it changed since yesterday.”
                </span>
                <span style={styles.trustItem}>
                  <strong style={{ color: "#111827" }}>Safe rules:</strong>{" "}
                  deterministic conditions (no arbitrary code execution).
                </span>
              </div>
            </div>

            <div style={styles.heroRight}>
              <div style={styles.previewHeader}>
                <div style={{ fontWeight: 950, color: "#111827" }}>
                  Mission Control (example run)
                </div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  git.push → plan → deploy → verify → rollback
                </div>
              </div>

              <div style={styles.timeline}>
                {[
                  {
                    label: "git.event",
                    status: "success",
                    meta: "180ms",
                    detail: "Commit detected and linked to workflow run",
                  },
                  {
                    label: "plan.policy",
                    status: "success",
                    meta: "420ms",
                    detail: "Approvals + safety checks evaluated",
                  },
                  {
                    label: "deploy.execute",
                    status: "success",
                    meta: "2.4s",
                    detail: "Canary rollout started with retries enabled",
                  },
                  {
                    label: "verify.notify",
                    status: "success",
                    meta: "220ms",
                    detail: `Recorded history and notified: ${templateCopy.destination}`,
                  },
                ].map((step) => (
                  <div key={step.label} style={styles.step}>
                    <div style={styles.stepLeft}>
                      <div
                        style={statusDotStyle(step.status)}
                        aria-hidden="true"
                      />
                      <div>
                        <div style={styles.stepTitle}>{step.label}</div>
                        <div style={styles.stepDetail}>{step.detail}</div>
                      </div>
                    </div>
                    <div style={styles.stepMeta}>{step.meta}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <CodeBlock
                  title="Example workflow (TypeScript)"
                  code={`// Pseudocode example (illustrative): workflows-as-code for DevOps
import { workflow, agent } from "@agentromatic/sdk";

export const deployToProd = workflow("deploy-to-prod", async (ctx) => {
  // Deploy
  const deployment = await agent("deploy", {
    env: "production",
    service: ctx.params.service,
    sha: ctx.params.sha,
    strategy: "canary",
  });

  // Verify
  const smoke = await agent("smokeTest", { deploymentId: deployment.id });
  if (!smoke.passed) {
    // Rollback is first-class
    await agent("rollback", {
      deploymentId: deployment.id,
      reason: smoke.errors,
    });
    throw new Error("Smoke tests failed — rolled back");
  }

  // Guardrails
  await agent("securityCheck", { deploymentId: deployment.id });

  // Notify + audit-ready context
  await agent("notify", {
    channel: "#platform-oncall",
    summary: "Deploy succeeded",
    deploymentId: deployment.id,
  });

  return { ok: true, deploymentId: deployment.id };
});`}
                />
              </div>
            </div>
          </div>

          {/* WHAT YOU CAN BUILD */}
          <Section
            eyebrow="Outcome"
            title="DevOps workflows that don’t break under pressure"
            subtitle="Replace glue scripts and brittle CI steps with durable, observable execution."
          >
            <div style={styles.grid3}>
              <Card
                icon="1"
                title="Plan with agents"
                description="Turn messy inputs (commits, alerts, change tickets) into a clear execution plan with structured context."
              />
              <Card
                icon="2"
                title="Execute durably"
                description="Run long-lived deploy and infra workflows with retries, checkpoints, and an immutable execution history."
              />
              <Card
                icon="3"
                title="Audit + observe"
                description="Every step is logged with inputs/outputs/errors so debugging and compliance stop being guesswork."
              />
            </div>
          </Section>

          {/* TEMPLATES */}
          <Section
            id="templates"
            eyebrow="Use cases"
            title="Start from a proven platform workflow"
            subtitle="Pick a template, start free, and run a dry-run to see the full execution history. Integrations are rolling out with design partners."
          >
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}
            >
              <div style={styles.templateTabs}>
                {(
                  [
                    { key: "k8sDeploy", label: "Kubernetes deploy" },
                    { key: "terraformPlan", label: "Terraform plan/apply" },
                    { key: "incidentRollback", label: "Incident rollback" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTemplate(t.key)}
                    style={
                      activeTemplate === t.key ? styles.tabActive : styles.tab
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={styles.templateCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 950,
                        fontSize: 18,
                        color: "#111827",
                      }}
                    >
                      {templateCopy.title} → {templateCopy.destination}
                    </div>
                    <div
                      style={{ marginTop: 6, color: "#374151", fontSize: 14 }}
                    >
                      {templateCopy.subtitle}
                    </div>
                  </div>

                  <div
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <SignUpButton mode="modal">
                      <span>
                        <PrimaryButton>Use this template</PrimaryButton>
                      </span>
                    </SignUpButton>
                    <SecondaryButton onClick={() => scrollToId("how")}>
                      See setup
                    </SecondaryButton>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 900,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      What it does
                    </div>
                    <ul
                      style={{
                        paddingLeft: 18,
                        margin: 0,
                        color: "#374151",
                        fontSize: 14,
                        lineHeight: 1.7,
                      }}
                    >
                      <li>Ingests an SDLC/infra event (git, CI, alert)</li>
                      <li>
                        Agents extract and validate structured context (env,
                        service, risk)
                      </li>
                      <li>
                        Applies deterministic gates (approvals, checks,
                        policies)
                      </li>
                      <li>{templateCopy.notifyLine}</li>
                    </ul>
                  </div>

                  <div>
                    <div
                      style={{
                        fontWeight: 900,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      Example gates
                    </div>
                    <div style={styles.miniPre}>{templateCopy.gates}</div>
                    <div
                      style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}
                    >
                      Example targets:{" "}
                      <span style={styles.mono}>
                        {templateCopy.channelExamples}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.grid3}>
                <Card
                  icon="⚡"
                  title="Fast to first run"
                  description="Start free, run a dry-run, and land directly on the execution history."
                />
                <Card
                  icon="🧭"
                  title="Predictable gates"
                  description="Approvals and safety checks are explicit and deterministic. You always know why a step ran (or didn’t)."
                />
                <Card
                  icon="🧾"
                  title="Audit trail by default"
                  description="Every run leaves structured logs you can use to debug incidents, satisfy reviews, and iterate safely."
                />
              </div>
            </div>
          </Section>

          {/* HOW IT WORKS */}
          <Section
            id="how"
            eyebrow="How it works"
            title="From commit or alert to a durable workflow run"
            subtitle="Write a workflow once, run it reliably, and inspect every decision."
          >
            <div style={styles.grid2}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Card
                  icon="①"
                  title="Trigger from SDLC"
                  description="Start from Git events, CI signals, or incident alerts. Use sample payloads for dry-runs while integrations are rolling out."
                />
                <Card
                  icon="②"
                  title="Plan and verify"
                  description="Agents produce structured context and proposed steps; deterministic gates decide what’s allowed to run."
                />
                <Card
                  icon="③"
                  title="Execute and record"
                  description="Deploy, test, roll back, and notify—with a durable history you can replay and audit."
                />
              </div>

              <div>
                <div style={styles.callout}>
                  <div style={{ fontWeight: 950, color: "#111827" }}>
                    Why platform teams switch from ad-hoc scripts
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: "#374151",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>
                        <strong>Durability:</strong> long-lived workflows don’t
                        fall apart on retries, restarts, or flaky dependencies.
                      </li>
                      <li>
                        <strong>Auditability:</strong> each run records what
                        happened, with the workflow definition tied to the run.
                      </li>
                      <li>
                        <strong>Safety:</strong> deterministic gates and
                        explicit approvals instead of hidden side effects.
                      </li>
                    </ul>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      color: "#6b7280",
                      fontWeight: 900,
                      fontSize: 12,
                      textTransform: "uppercase",
                    }}
                  >
                    Tip
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#374151",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    Start with a template, run a dry-run, and inspect the
                    execution history. That’s the fastest “aha.”
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* INTEGRATIONS */}
          <Section
            id="integrations"
            eyebrow="Integrations"
            title="Go deep on the tools platform teams already run"
            subtitle="We’re building a small set of first-class DevOps integrations (rolling out with design partners). Start validating workflow shapes now with templates + dry-runs."
          >
            <div style={styles.grid3}>
              <Card
                icon="⎇"
                title="Git providers"
                description="GitHub/GitLab events to trigger workflows, link runs to commits/PRs, and keep an audit trail."
              />
              <Card
                icon="☸"
                title="Kubernetes"
                description="Deploy orchestration with verification steps, rollbacks, and run history you can replay."
              />
              <Card
                icon="▦"
                title="IaC + policy"
                description="Terraform/Pulumi plan/apply flows with explicit gates (approvals, checks, policy) and drift-aware logs."
              />
              <Card
                icon="📈"
                title="Observability"
                description="Datadog/Prometheus signals to verify deploys and trigger automated rollback workflows."
              />
              <Card
                icon="🚨"
                title="Incident response"
                description="PagerDuty + chat notifications to keep on-call in the loop with the exact evidence trail."
              />
              <Card
                icon="🔐"
                title="Security checks"
                description="Vulnerability and policy checks as first-class workflow steps (block, require approval, or proceed)."
              />
            </div>

            <div
              style={{
                marginTop: 12,
                color: "#6b7280",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "#374151" }}>Note:</strong> If you need a
              specific integration first (e.g., GitHub + Kubernetes), you can
              still start from templates and model the workflow now—then wire
              credentials/connectors as they ship.
            </div>
          </Section>

          {/* PRICING */}
          <Section
            id="pricing"
            eyebrow="Pricing"
            title="Pricing for DevOps & platform teams"
            subtitle="Credit-based plans: start free, then upgrade as you standardize deploy and infra workflows across environments."
          >
            <div style={styles.pricingGrid}>
              <PricingCard
                plan="free"
                title="Free"
                tagline="Prototype durable workflows"
                price="$0"
                features={[
                  "Workflow templates + dry-runs",
                  "Runs & basic logs (short retention)",
                  "Single environment",
                ]}
                cta={
                  <SignUpButton mode="modal">
                    <span>
                      <PrimaryButton data-plan="free">Start free</PrimaryButton>
                    </span>
                  </SignUpButton>
                }
                finePrint="Best for proving value on one workflow before rolling out across a team."
              />

              <PricingCard
                plan="pro"
                title="Team"
                tagline="Standardize deploy workflows"
                price="$299/mo"
                highlighted
                features={[
                  "10,000 workflow executions/month",
                  "3 environments (dev/staging/prod)",
                  "Longer log retention",
                  "Priority support",
                ]}
                cta={
                  <button
                    type="button"
                    data-plan="pro"
                    style={{
                      ...styles.lemonPlaceholderCta,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                    }}
                    onClick={() => {
                      // Placeholder for Lemon Squeezy checkout (wire later).
                      // Example: window.location.href = checkoutUrlForPlan("pro");
                      scrollToId("pricing");
                    }}
                  >
                    Get Team
                  </button>
                }
                finePrint="Wire this button to Lemon Squeezy later (plan=pro)."
              />

              <PricingCard
                plan="business"
                title="Business"
                tagline="Scale platform automation"
                price="$999/mo"
                features={[
                  "100,000 workflow executions/month",
                  "Unlimited environments",
                  "SOC2-oriented audit trail features",
                  "Priority support",
                ]}
                cta={
                  <button
                    type="button"
                    data-plan="business"
                    style={styles.lemonPlaceholderCta}
                    onClick={() => {
                      // Placeholder for Lemon Squeezy checkout (wire later).
                      scrollToId("pricing");
                    }}
                  >
                    Start Business
                  </button>
                }
                finePrint="Wire this button to Lemon Squeezy later (plan=business)."
              />

              <PricingCard
                plan="enterprise"
                title="Enterprise"
                tagline="Security, control, and support"
                price="$2,500+/mo"
                features={[
                  "Unlimited executions (custom)",
                  "SSO/RBAC + advanced audit controls",
                  "On-prem / VPC options",
                  "Dedicated support + SLA",
                ]}
                cta={
                  <a
                    href="mailto:founders@agentromatic.com?subject=Agentromatic%20Enterprise"
                    style={{
                      display: "inline-flex",
                      justifyContent: "center",
                      width: "100%",
                      textDecoration: "none",
                      textAlign: "center",
                      borderRadius: 12,
                      padding: "12px 14px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#111827",
                      fontWeight: 900,
                      fontSize: 14,
                    }}
                  >
                    Talk to sales
                  </a>
                }
                finePrint="We’ll align on security needs, integrations, and rollout timeline."
              />
            </div>

            <div
              style={{
                marginTop: 14,
                color: "#6b7280",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "#374151" }}>Note:</strong> Plan prices
              and checkout will be integrated with Lemon Squeezy. The layout and
              CTAs are already structured for plan wiring.
            </div>
          </Section>

          {/* FAQ */}
          <Section
            id="faq"
            eyebrow="FAQ"
            title="Questions, answered"
            subtitle="If you’re standardizing deploy and infra workflows, these are the questions that matter."
          >
            <div style={styles.grid2}>
              <div style={styles.faq}>
                <div style={styles.faqQ}>What can I connect today?</div>
                <div style={styles.faqA}>
                  The focus is DevOps workflows: Git/CI events in, durable
                  execution and audit history out. Integrations like{" "}
                  <strong>GitHub</strong>, <strong>Kubernetes</strong>,{" "}
                  <strong>Terraform</strong>, and{" "}
                  <strong>PagerDuty/Slack</strong> are being built alongside
                  design partners—use templates and dry-runs to validate your
                  workflow shape now.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>Do I need to code?</div>
                <div style={styles.faqA}>
                  This is designed to be code-first (TypeScript workflows), but
                  you can start from templates and iterate. The goal is to make
                  workflows fit your SDLC: version control, reviews, and
                  testing.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>
                  How do I trust agents in production?
                </div>
                <div style={styles.faqA}>
                  Agents can propose plans and extract structured context, but
                  execution is governed by explicit gates (approvals, checks,
                  policies). Every step is logged with inputs/outputs/errors so
                  you can verify decisions and tighten controls over time.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>What happens when a deploy fails?</div>
                <div style={styles.faqA}>
                  You can see exactly which step failed and what evidence it had
                  (tests, checks, errors). Workflows are built around durable,
                  reproducible runs so failures are debuggable—and rollback
                  paths are first-class.
                </div>
              </div>
            </div>
          </Section>

          {/* FINAL CTA */}
          <div style={styles.finalCta}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ fontSize: 26, fontWeight: 950, color: "#111827" }}>
                Start free and run your first DevOps workflow today.
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "#374151",
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                Pick a template, run a dry-run, and inspect the execution
                history. That’s the fastest path from “idea” to “automation you
                trust.”
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <SignUpButton mode="modal">
                  <span>
                    <PrimaryButton>Start free</PrimaryButton>
                  </span>
                </SignUpButton>

                <SignInButton mode="modal">
                  <span>
                    <SecondaryButton>Sign in</SecondaryButton>
                  </span>
                </SignInButton>

                <SecondaryButton onClick={() => scrollToId("templates")}>
                  Browse templates
                </SecondaryButton>
              </div>
            </div>
          </div>
        </main>

        <footer style={styles.footer}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ color: "#6b7280", fontSize: 12 }}>
              © {new Date().getFullYear()} Agentromatic ... Powered by{" "}
              <a href="https://ampersandboxdesign.com">[&]</a>
            </div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>
              Built for platform teams shipping reliable systems.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#111827",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    position: "relative",
    overflowX: "hidden",
  },
  heroBg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(1200px 600px at 20% 0%, rgba(17,24,39,0.10), rgba(255,255,255,0) 60%)," +
      "radial-gradient(900px 500px at 90% 10%, rgba(99,102,241,0.12), rgba(255,255,255,0) 55%)",
    pointerEvents: "none",
  },
  container: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1120,
    margin: "0 auto",
    padding: "22px 20px 0",
  },
  mono: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },

  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    paddingBottom: 18,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.18)",
    background: "rgba(255,255,255,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 950,
    color: "#111827",
    boxShadow: "0 10px 24px rgba(17,24,39,0.06)",
  },
  brand: { fontWeight: 950, letterSpacing: -0.2 },
  brandTagline: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  navLinks: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  navLink: {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "#374151",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
  },
  navCtas: { display: "flex", gap: 10, alignItems: "center" },
  signInBtn: {
    appearance: "none",
    border: "1px solid rgba(229,231,235,1)",
    background: "rgba(255,255,255,0.9)",
    color: "#111827",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  hero: {
    display: "grid",
    // Responsive without media queries:
    // - wide: two columns
    // - narrow: collapses to one column automatically
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 22,
    padding: "18px 0 10px",
    alignItems: "start",
  },
  heroLeft: { paddingTop: 8 },
  heroRight: {},
  h1: {
    margin: "14px 0 10px",
    fontWeight: 950,
    fontSize: 46,
    lineHeight: 1.04,
    letterSpacing: -0.8,
    color: "#111827",
  },
  lede: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.65,
    color: "#374151",
    maxWidth: 680,
  },
  heroButtons: {
    marginTop: 16,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  trustRow: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 1.5,
  },
  trustItem: {
    border: "1px solid rgba(229,231,235,0.9)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.78)",
    padding: "10px 12px",
  },

  previewHeader: {
    border: "1px solid rgba(229,231,235,0.9)",
    borderRadius: 16,
    padding: 14,
    background: "rgba(255,255,255,0.85)",
  },
  timeline: {
    marginTop: 12,
    border: "1px solid rgba(229,231,235,0.9)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.92)",
    overflow: "hidden",
  },
  step: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderTop: "1px solid rgba(229,231,235,0.85)",
  },
  stepLeft: { display: "flex", gap: 10, alignItems: "center" },
  stepTitle: {
    fontWeight: 900,
    color: "#111827",
    fontSize: 13,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  stepDetail: { marginTop: 3, color: "#6b7280", fontSize: 12 },
  stepMeta: { color: "#6b7280", fontSize: 12, fontWeight: 900 },

  grid2: {
    display: "grid",
    // Collapses automatically on smaller widths.
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 14,
    alignItems: "start",
  },
  grid3: {
    display: "grid",
    // Automatically becomes 2-up / 1-up depending on width.
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
    alignItems: "start",
  },

  templateTabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  tab: {
    appearance: "none",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },
  tabActive: {
    appearance: "none",
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },
  templateCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    background: "#fff",
    boxShadow: "0 1px 0 rgba(17,24,39,0.03)",
  },
  miniPre: {
    whiteSpace: "pre-wrap",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    color: "#111827",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 10,
    lineHeight: 1.5,
  },

  callout: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.9)",
  },

  pricingGrid: {
    display: "grid",
    // Responsive pricing cards without media queries.
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    alignItems: "start",
  },
  lemonPlaceholderCta: {
    display: "inline-flex",
    justifyContent: "center",
    width: "100%",
    textDecoration: "none",
    textAlign: "center",
    borderRadius: 12,
    padding: "12px 14px",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
  },

  faq: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    background: "#fff",
  },
  faqQ: { fontWeight: 950, color: "#111827" },
  faqA: { marginTop: 8, color: "#374151", fontSize: 14, lineHeight: 1.6 },

  finalCta: {
    marginTop: 22,
    borderRadius: 22,
    border: "1px solid rgba(229,231,235,0.9)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(249,250,251,0.95))",
    padding: 22,
    boxShadow: "0 18px 60px rgba(17,24,39,0.08)",
  },

  footer: {
    padding: "22px 0 26px",
    borderTop: "1px solid rgba(229,231,235,0.8)",
  },
};

// Responsiveness is handled via CSS grid `auto-fit/minmax(...)` in the `styles` object above.
// This avoids risky runtime monkey-patching (e.g., overriding React.createElement) and keeps
// the marketing page predictable and safe.
