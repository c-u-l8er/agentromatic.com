# AgenTroMatic Documentation

> **Your agents don't need a boss. They need a deliberation.**

Welcome to the documentation hub for **AgenTroMatic** — the automatic deliberation
engine for multi-agent AI systems. When a task arrives, agents bid based on ability,
debate when capabilities overlap, elect leaders by consensus, execute under quorum
validation, and build reputation over time. No human routing required — ever.

AgenTroMatic is **not** an orchestrator (that's Delegatic) or a framework for
building agents (that's Agentelic). It is the automation layer that sits between
human-defined governance and raw agent execution — making self-organization
reliable, visible, and auditable.

---

## How It Works

1. **Task arrives** — submitted via Phoenix API or A2A protocol
2. **Agents bid** — each agent evaluates capability fit and submits a bid
3. **Deliberation** — overlapping capabilities trigger structured debate
4. **Consensus** — Ra (Raft) elects a leader; quorum validates the result
5. **Execution** — winning agent executes under governance constraints
6. **Reputation update** — outcomes feed back into reputation scores

AgenTroMatic is the **automation layer** of the [&] Protocol ecosystem — the
service mesh that adds consensus, resilience, observability, and governance on
top of Google's A2A protocol.

---

## Documentation Map


```{toctree}
:maxdepth: 1
:caption: Homepages

[&] Ampersand Box <https://ampersandboxdesign.com>
Graphonomous <https://graphonomous.com>
BendScript <https://bendscript.com>
WebHost.Systems <https://webhost.systems>
Agentelic <https://agentelic.com>
AgenTroMatic <https://agentromatic.com>
Delegatic <https://delegatic.com>
Deliberatic <https://deliberatic.com>
FleetPrompt <https://fleetprompt.com>
GeoFleetic <https://geofleetic.com>
OpenSentience <https://opensentience.org>
SpecPrompt <https://specprompt.com>
TickTickClock <https://ticktickclock.com>
```

```{toctree}
:maxdepth: 1
:caption: Root Docs

[&] Protocol Docs <https://docs.ampersandboxdesign.com>
Graphonomous Docs <https://docs.graphonomous.com>
BendScript Docs <https://docs.bendscript.com>
WebHost.Systems Docs <https://docs.webhost.systems>
Agentelic Docs <https://docs.agentelic.com>
AgenTroMatic Docs <https://docs.agentromatic.com>
Delegatic Docs <https://docs.delegatic.com>
Deliberatic Docs <https://docs.deliberatic.com>
FleetPrompt Docs <https://docs.fleetprompt.com>
GeoFleetic Docs <https://docs.geofleetic.com>
OpenSentience Docs <https://docs.opensentience.org>
SpecPrompt Docs <https://docs.specprompt.com>
TickTickClock Docs <https://docs.ticktickclock.com>
```

```{toctree}
:maxdepth: 2
:caption: AgenTroMatic Docs

spec/README
```

---

## Architecture at a Glance

| Component | Role | OTP Pattern |
|-----------|------|-------------|
| **Deliberation Supervisor** | Spawns one process per deliberation | DynamicSupervisor |
| **Reputation Engine** | Tracks agent performance via ETS cache | GenServer + ETS |
| **A2A Gateway** | HTTP client per agent for inter-agent comms | Req/Finch |
| **Observatory** | Real-time deliberation streaming UI | Phoenix LiveView |
| **Ra Consensus** | Leader election and log replication | Ra (Raft) |

---

## Design Principles

1. **Deliberation over routing** — Static routing is the wrong abstraction for
   overlapping, evolving capabilities. Agents negotiate every time.
2. **A2A-native** — Every inter-agent message flows through standard A2A protocol.
3. **Reputation is memory** — Past performance shapes future assignments.
   Overconfident agents lose weight.
4. **Visible by default** — Every deliberation is traceable. The Observatory is
   not optional — it's the product.
5. **Consensus before commit** — Results publish only when quorum validates.
6. **Ra under the hood** — Battle-tested Raft from RabbitMQ.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Elixir 1.17+ |
| Framework | Phoenix 1.8+ (LiveView for Observatory) |
| Consensus | Ra (Raft library from RabbitMQ) |
| Database | PostgreSQL 16+ via Ecto |
| Hot Cache | ETS (reputation lookups) |
| Agent Comms | A2A v0.3+ via Req/Finch |

---

## Project Links

- **Spec:** [Technical Specification](spec/README.md)
- **[&] Protocol ecosystem:** `AmpersandBoxDesign/`

---

*[&] Ampersand Box Design — agentromatic.com*
