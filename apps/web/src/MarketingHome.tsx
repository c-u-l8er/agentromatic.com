import React, { useMemo, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";

/**
 * Marketing homepage for signed-out users.
 *
 * Positioning (current wedge):
 * - Zapier replacement angle
 * - Webhook → AI triage → route → notify (Slack / Mattermost / Discord)
 *
 * Notes:
 * - Pricing CTAs include `data-plan` attributes so you can later wire Lemon Squeezy
 *   checkout links without refactoring the layout.
 * - This page intentionally uses inline styles to avoid new styling dependencies.
 */

type PlanKey = "free" | "pro" | "business" | "enterprise";

function useNowIso(): string {
  // Deterministic-enough timestamp for example payloads; recomputed only once per mount.
  return useMemo(() => new Date().toISOString(), []);
}

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
            webhook.example
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
  const nowIso = useNowIso();

  const [activeTemplate, setActiveTemplate] = useState<
    "slack" | "mattermost" | "discord"
  >("slack");

  const webhookPayload = useMemo(() => {
    // This is an intentionally-generic payload; teams can map their real webhook schema.
    const base = {
      id: "evt_9u3k2a",
      receivedAt: nowIso,
      source: "webhook",
      request: {
        path: "/webhook/inbound",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_18f2d",
        },
      },
      customer: {
        name: "A. Customer",
        email: "acustomer@example.com",
        plan: "pro",
      },
      message: {
        subject: "Login is broken for multiple users",
        body:
          "We are seeing 500 errors in production. This started ~10 minutes ago. " +
          "Can someone take a look ASAP?",
      },
      // What AI triage might extract (example):
      triage: {
        intent: "support",
        category: "incident",
        urgency: "high",
        suggestedOwner: "oncall",
        summary:
          "Customer reports production login failures and 500 errors starting ~10 minutes ago.",
      },
    };

    return JSON.stringify(base, null, 2);
  }, [nowIso]);

  const templateCopy = useMemo(() => {
    const common = {
      title: "Webhook → AI triage → route → notify",
      subtitle:
        "Classify inbound requests, apply safe routing rules, and notify the right channel with context.",
      routing:
        "Example routing:\n" +
        "- if triage.urgency == 'high' → #on-call\n" +
        "- else if triage.category == 'billing' → #billing\n" +
        "- else → #support",
    };

    if (activeTemplate === "mattermost") {
      return {
        ...common,
        destination: "Mattermost",
        notifyLine:
          "Post a richly formatted message to a Mattermost channel with urgency, summary, and a link back to the run logs.",
        channelExamples: "#on-call, #support, #billing",
      };
    }

    if (activeTemplate === "discord") {
      return {
        ...common,
        destination: "Discord",
        notifyLine:
          "Send an embed-style notification to Discord with priority tags and a quick summary.",
        channelExamples: "#triage, #mods, #support",
      };
    }

    return {
      ...common,
      destination: "Slack",
      notifyLine:
        "Send a Slack message with extracted fields (intent/urgency/summary) and the raw webhook context when needed.",
      channelExamples: "#on-call, #support, #billing",
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
              Templates
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
                <Pill>Webhook-first</Pill>
                <Pill>AI triage + rules</Pill>
                <Pill>Slack • Mattermost • Discord (beta)</Pill>
              </div>

              <h1 style={styles.h1}>
                AI webhook triage that routes to the right channel—fast.
              </h1>

              <p style={styles.lede}>
                Classify inbound webhooks, apply deterministic routing rules,
                and notify Slack/Mattermost/Discord (beta)—with{" "}
                <strong>logs for every run</strong>.
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
                  webhook → ai.triage → route → chat.notify
                </div>
              </div>

              <div style={styles.timeline}>
                {[
                  {
                    label: "webhook.receive",
                    status: "success",
                    meta: "200ms",
                    detail: "Inbound event captured",
                  },
                  {
                    label: "ai.triage",
                    status: "success",
                    meta: "1.9s",
                    detail: "Extract intent/urgency/summary",
                  },
                  {
                    label: "route.conditions",
                    status: "success",
                    meta: "12ms",
                    detail: "Matched: urgency == high",
                  },
                  {
                    label: "chat.notify",
                    status: "success",
                    meta: "180ms",
                    detail: `Posted to ${templateCopy.destination}`,
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
                  title="Example webhook payload"
                  code={webhookPayload}
                />
              </div>
            </div>
          </div>

          {/* WHAT YOU CAN BUILD */}
          <Section
            eyebrow="Outcome"
            title="Inbound triage that actually stays reliable"
            subtitle="The fastest path from raw webhook payloads to routed action in chat."
          >
            <div style={styles.grid3}>
              <Card
                icon="1"
                title="Triage with AI"
                description="Classify intent, extract structured fields, and summarize—so routing doesn’t rely on fragile string matching."
              />
              <Card
                icon="2"
                title="Route with rules"
                description="Use safe, deterministic conditions to choose paths based on extracted fields (priority, category, owner)."
              />
              <Card
                icon="3"
                title="Notify chat instantly"
                description="Slack, Mattermost, or Discord notifications with the context your team needs to act immediately."
              />
            </div>
          </Section>

          {/* TEMPLATES */}
          <Section
            id="templates"
            eyebrow="Templates"
            title="Start from a proven webhook triage workflow"
            subtitle="Pick a destination, start free, and run a test payload to see logs immediately. Chat connectors are in beta."
          >
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}
            >
              <div style={styles.templateTabs}>
                {(
                  [
                    { key: "slack", label: "Slack" },
                    { key: "mattermost", label: "Mattermost" },
                    { key: "discord", label: "Discord" },
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
                      <li>Receives a webhook payload</li>
                      <li>AI extracts: intent, category, urgency, summary</li>
                      <li>Routes based on safe conditions</li>
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
                      Example routing
                    </div>
                    <div style={styles.miniPre}>{templateCopy.routing}</div>
                    <div
                      style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}
                    >
                      Example channels:{" "}
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
                  title="Instant gratification"
                  description="Start free, run a test payload, and land directly on the run logs."
                />
                <Card
                  icon="🧭"
                  title="Predictable routing"
                  description="Routing logic is explicit and deterministic. You always know why a path was chosen."
                />
                <Card
                  icon="🧾"
                  title="Audit trail by default"
                  description="Every run leaves structured logs you can use to debug, improve, and trust automations."
                />
              </div>
            </div>
          </Section>

          {/* HOW IT WORKS */}
          <Section
            id="how"
            eyebrow="How it works"
            title="From webhook to routed chat notification"
            subtitle="Setup is simple: send a payload, triage it, route it, notify your team."
          >
            <div style={styles.grid2}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Card
                  icon="①"
                  title="Receive the webhook"
                  description="Start with a webhook-style JSON payload from any system. Hosted webhook endpoints are rolling out—test runs instantly with sample data."
                />
                <Card
                  icon="②"
                  title="Triage with AI"
                  description="Extract structured fields (intent, urgency, category, summary) from the payload."
                />
                <Card
                  icon="③"
                  title="Route and notify"
                  description="Apply safe rules to pick a path, then post to Slack/Mattermost/Discord with the right context."
                />
              </div>

              <div>
                <div style={styles.callout}>
                  <div style={{ fontWeight: 950, color: "#111827" }}>
                    Why teams switch from Zapier/Make
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
                        <strong>Inspectability:</strong> inputs → outputs →
                        errors for every step.
                      </li>
                      <li>
                        <strong>Reproducibility:</strong> each run snapshots the
                        workflow definition.
                      </li>
                      <li>
                        <strong>Safety:</strong> deterministic condition
                        evaluation (no arbitrary code execution).
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
                    Start with a template, send one test webhook, and check the
                    logs. That’s the fastest “aha.”
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* PRICING */}
          <Section
            id="pricing"
            eyebrow="Pricing"
            title="Pricing that scales with usage"
            subtitle="Credit-based plans: start free and upgrade when it’s saving you real time."
          >
            <div style={styles.pricingGrid}>
              <PricingCard
                plan="free"
                title="Free"
                tagline="Try triage automation"
                price="$0"
                features={[
                  "Webhook workflows",
                  "Runs & basic logs (short retention)",
                  "Templates to get started",
                ]}
                cta={
                  <SignUpButton mode="modal">
                    <span>
                      <PrimaryButton data-plan="free">Start free</PrimaryButton>
                    </span>
                  </SignUpButton>
                }
                finePrint="Best for prototypes and getting to your first successful run."
              />

              <PricingCard
                plan="pro"
                title="Pro"
                tagline="Ship triage workflows for a team"
                price="$—"
                highlighted
                features={[
                  "More included credits / higher run limits",
                  "Longer log retention",
                  "Team workspace basics",
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
                    Get Pro
                  </button>
                }
                finePrint="Wire this button to Lemon Squeezy later (plan=pro)."
              />

              <PricingCard
                plan="business"
                title="Business"
                tagline="Higher volume + control"
                price="$—"
                features={[
                  "Higher limits for ops-heavy teams",
                  "Advanced retention controls",
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
                tagline="Security & compliance"
                price="Custom"
                features={[
                  "Custom limits and retention",
                  "Security review support",
                  "Contractual terms + dedicated support",
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
                finePrint="We’ll align on security needs and rollout timeline."
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
            subtitle="If you’re replacing Zapier for triage + routing, these are the questions that matter."
          >
            <div style={styles.grid2}>
              <div style={styles.faq}>
                <div style={styles.faqQ}>What can I connect today?</div>
                <div style={styles.faqA}>
                  Webhook in, chat notify out (beta): <strong>Slack</strong>,{" "}
                  <strong>Mattermost</strong>, and <strong>Discord</strong>. If
                  you can send a webhook, you can automate triage and routing
                  here.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>Do I need to code?</div>
                <div style={styles.faqA}>
                  No for common templates. You can start with a template, send a
                  test webhook, and adjust routing rules. Power users can
                  customize payload mappings and workflow structure.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>How do I trust AI routing?</div>
                <div style={styles.faqA}>
                  AI produces structured fields
                  (intent/urgency/category/summary), and routing is controlled
                  by explicit conditions. Every run is logged so you can verify
                  decisions and iterate safely.
                </div>
              </div>

              <div style={styles.faq}>
                <div style={styles.faqQ}>
                  What happens when something fails?
                </div>
                <div style={styles.faqA}>
                  You can see exactly where it failed and what data it had at
                  that step. The platform is designed around reproducible runs
                  and detailed logs so failures are debuggable—not mysterious.
                </div>
              </div>
            </div>
          </Section>

          {/* FINAL CTA */}
          <div style={styles.finalCta}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ fontSize: 26, fontWeight: 950, color: "#111827" }}>
                Start free and route your first webhook today.
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "#374151",
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                Pick a template, send one test payload, and inspect the run
                logs. That’s the fastest path from “idea” to “automation you
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
              Built for reliable automation in the AI era.
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
