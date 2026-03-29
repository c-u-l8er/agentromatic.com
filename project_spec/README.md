# AgenTroMatic — Automatic Deliberation Engine
## Technical Specification v0.2 (Elixir/OTP)

**Date:** February 21, 2026  
**Status:** Draft  
**Author:** [&] Ampersand Box Design  
**License:** MIT (open core)  
**Stack:** Elixir · OTP · Ra · Phoenix · Ecto · PostgreSQL

---

## 1. Overview

AgenTroMatic is the **automatic deliberation engine** for multi-agent AI systems. When a task arrives, agents bid based on ability, debate when capabilities overlap, elect leaders by consensus, execute under quorum validation, and build reputation over time. No human routing required — ever.

AgenTroMatic is **not** an orchestrator (that's Delegatic) or a framework for building agents (that's Agentelic). It is the automation layer that sits between human-defined governance and raw agent execution — making self-organization reliable, visible, and auditable.

### 1.1 The Problem

Google's Agent-to-Agent (A2A) protocol solves agent discovery and communication, but leaves five critical gaps:

| Gap | Impact |
|-----|--------|
| No built-in consensus mechanism | Conflicting decisions, split-brain failures |
| No durable state management | Long-running workflows lose context |
| Client-server only — no multi-party consensus | Can't do N-agent voting or collective reasoning |
| No machine-readable skill I/O schemas | Orchestrators can't deterministically route tasks |
| Authorization creep — tokens used beyond scope | Security risk in cascading agent chains |

**The analogy:** A2A is TCP/IP for agents. AgenTroMatic is the service mesh that sits on top — adding consensus, resilience, observability, and governance without replacing the underlying protocol.

### 1.2 Design Principles

1. **Deliberation over routing** — Static routing is the wrong abstraction for overlapping, evolving capabilities. Agents negotiate every time.
2. **A2A-native** — Every inter-agent message flows through standard A2A protocol. AgenTroMatic wraps, not replaces.
3. **Reputation is memory** — The cluster learns who delivers. Past performance shapes future assignments. Overconfident agents lose weight.
4. **Visible by default** — Every deliberation is traceable. The Observatory is not optional — it's the product.
5. **Consensus before commit** — Results publish only when quorum validates. No single agent commits unilaterally.
6. **Ra under the hood** — Leader election, log replication, and heartbeats use Ra (RabbitMQ's battle-tested Raft library for Erlang/OTP).

### 1.3 Why Elixir

The deliberation protocol is fundamentally a **concurrent message-passing system with timeouts, voting, and state machines** — that's literally what the BEAM was designed for.

- Each deliberation is a `GenStateMachine` — states map 1:1 to protocol phases
- Bid collection with timeout — `GenServer.call/3` with `:timeout` is exactly this
- Ra (the RabbitMQ Raft library) is battle-tested, production-grade, Erlang-native — no custom Raft needed
- Phoenix LiveView replaces React for Observatory — real-time deliberation streaming, zero JS bundle
- Process-per-deliberation scales naturally — BEAM handles millions of lightweight processes
- Hot code upgrades — deploy new deliberation logic without dropping active deliberations

### 1.4 One-Liner

> "Your agents don't need a boss. They need a deliberation."

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       AGENTROMATIC                            │
│              Automatic Deliberation Engine (Elixir/OTP)        │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   Phoenix Router                   Phoenix LiveView            │
│   ├── POST /api/v1/tasks           └── Live deliberation view  │
│   ├── GET  /deliberations/:id      └── Reputation dashboard   │
│   ├── GET  /agents/:id/reputation  └── What-if simulation     │
│   ├── POST /clusters               └── Cluster topology       │
│   └── WebSocket /observatory       └── Conflict log           │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐    │
│   │ Deliberation     │  │  Reputation  │  │  A2A Gateway  │    │
│   │ Supervisor       │  │  Engine      │  │              │    │
│   │                  │  │              │  │  Req/Finch   │    │
│   │ DynamicSupervisor│  │  GenServer   │  │  HTTP client │    │
│   │ spawns one       │  │  + ETS cache │  │  per agent   │    │
│   │ GenStateMachine  │  │  + Postgres  │  │  connection. │    │
│   │ per active       │  │  for durable │  │  A2A Agent   │    │
│   │ deliberation.    │  │  scores.     │  │  Card parser.│    │
│   └──────┬───────────┘  └──────┬───────┘  └──────┬───────┘    │
│          │                     │                  │            │
│   ┌──────▼─────────────────────▼──────────────────▼───────┐    │
│   │                 Ra Consensus (Erlang/OTP)               │    │
│   │                                                        │    │
│   │  Leader election · Log replication · Heartbeats        │    │
│   │  Term management · State machine replication           │    │
│   │  Cluster membership · Snapshot/restore                 │    │
│   │  (RabbitMQ's battle-tested Raft — no custom impl)      │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                   │
├────────────────────────────┼───────────────────────────────────┤
│   Storage                  │                                   │
│   ├── ETS — hot reputation cache, active deliberation state    │
│   ├── PostgreSQL — durable reputation, deliberation traces     │
│   └── Ra log — consensus state (Raft log)                      │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 OTP Supervision Tree

```
AgenTroMatic.Application
├── AgenTroMatic.Repo (Ecto/Postgres)
├── AgenTroMaticWeb.Endpoint (Phoenix)
├── AgenTroMatic.Ra.Supervisor (Ra cluster management)
├── AgenTroMatic.ReputationEngine (GenServer + ETS owner)
├── AgenTroMatic.DeliberationSupervisor (DynamicSupervisor)
│   ├── AgenTroMatic.Deliberation (GenStateMachine — task_8f2a)
│   ├── AgenTroMatic.Deliberation (GenStateMachine — task_c91b)
│   └── ... (one process per active deliberation)
├── AgenTroMatic.A2AGateway (GenServer — outbound A2A calls via Finch)
├── AgenTroMatic.ClusterRegistry (Registry — maps cluster_id → agents)
├── AgenTroMatic.TraceWriter (Broadway — batched trace persistence)
└── Phoenix.PubSub (deliberation events → LiveView Observatory)
```

### 2.2 Component Summary

| Component | Responsibility | OTP Pattern |
|-----------|---------------|-------------|
| `AgenTroMatic.Deliberation` | One active deliberation. Progresses through phases: bidding → overlap → negotiation → election → execution → commit → learn. | GenStateMachine under DynamicSupervisor |
| `AgenTroMatic.Ra.Supervisor` | Manages Ra cluster for Raft consensus. Leader election, log replication, quorum validation. | Ra server (Erlang) wrapped in Elixir supervisor |
| `AgenTroMatic.ReputationEngine` | Per-capability scores, calibration tracking, trend detection. ETS for hot reads, Postgres for persistence. | GenServer + ETS table owner |
| `AgenTroMatic.A2AGateway` | HTTP client pool for outbound A2A protocol calls. Agent Card parsing. Bid/rebuttal transport. | GenServer + Finch connection pool |
| `AgenTroMatic.TraceWriter` | Batches deliberation traces for Postgres persistence. Append-only. | Broadway pipeline |
| `AgenTroMaticWeb.ObservatoryLive` | Real-time deliberation visualization. Reputation dashboards. What-if simulation. | Phoenix LiveView |

---

## 3. The Deliberation Protocol

### 3.1 GenStateMachine States

```elixir
defmodule AgenTroMatic.Deliberation do
  use GenStateMachine, callback_mode: :state_functions

  # States mirror the 7-phase protocol exactly
  # :bidding → :overlap_analysis → :negotiation → :election →
  # :execution → :consensus_commit → :reputation_update → :completed

  defstruct [
    :task_id, :task_description, :cluster_id, :raft_term,
    :sub_tasks, :bids, :overlaps, :negotiations,
    :assignments, :results, :trace, :quorum_policy,
    :started_at, :timeout_ref
  ]

  ## ── INIT ──

  def init({task, cluster_id, quorum_policy}) do
    sub_tasks = decompose_task(task)
    broadcast_to_cluster(cluster_id, {:bid_request, task, sub_tasks})

    # Set bid collection timeout
    timeout_ref = Process.send_after(self(), :bid_timeout, 2_000)

    data = %__MODULE__{
      task_id: task.id,
      task_description: task.description,
      cluster_id: cluster_id,
      raft_term: AgenTroMatic.Ra.current_term(),
      sub_tasks: sub_tasks,
      bids: [],
      quorum_policy: quorum_policy,
      started_at: System.monotonic_time(:millisecond),
      timeout_ref: timeout_ref,
      trace: %{phases: %{broadcast: %{started_at: DateTime.utc_now()}}}
    }

    {:ok, :bidding, data}
  end

  ## ── PHASE 1: BIDDING ──

  def bidding(:cast, {:bid, bid}, data) do
    data = %{data | bids: [bid | data.bids]}

    # Broadcast to Observatory
    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "deliberation:#{data.task_id}",
      {:bid_received, bid}
    )

    {:keep_state, data}
  end

  def bidding(:info, :bid_timeout, data) do
    # Move to overlap analysis
    data = put_in(data.trace.phases[:bidding], %{
      bids_received: length(data.bids),
      completed_at: DateTime.utc_now()
    })
    {:next_state, :overlap_analysis, data, [{:next_event, :internal, :analyze}]}
  end

  ## ── PHASE 2: OVERLAP ANALYSIS ──

  def overlap_analysis(:internal, :analyze, data) do
    overlaps = detect_overlaps(data.bids, data.sub_tasks)

    data = %{data | overlaps: overlaps}
    |> put_in([:trace, :phases, :overlap], %{
      overlaps_detected: length(overlaps),
      completed_at: DateTime.utc_now()
    })

    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "deliberation:#{data.task_id}",
      {:overlaps_detected, overlaps}
    )

    case overlaps do
      [] -> {:next_state, :election, data, [{:next_event, :internal, :assign_direct}]}
      _  -> {:next_state, :negotiation, data, [{:next_event, :internal, :start_negotiation}]}
    end
  end

  ## ── PHASE 3: NEGOTIATION ──

  def negotiation(:internal, :start_negotiation, data) do
    # For each overlap, ask competing agents to argue
    for overlap <- data.overlaps do
      for agent <- overlap.competing_agents do
        AgenTroMatic.A2AGateway.request_argument(agent, overlap)
      end
    end

    # Set negotiation timeout
    Process.send_after(self(), :negotiation_timeout, 5_000)
    {:keep_state, data}
  end

  def negotiation(:cast, {:argument, agent_id, subtask, argument}, data) do
    data = record_argument(data, agent_id, subtask, argument)

    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "deliberation:#{data.task_id}",
      {:argument_received, agent_id, subtask, argument}
    )

    {:keep_state, data}
  end

  def negotiation(:cast, {:vote, voter_id, subtask, for_agent, reason}, data) do
    data = record_vote(data, voter_id, subtask, for_agent, reason)
    {:keep_state, data}
  end

  def negotiation(:info, :negotiation_timeout, data) do
    {:next_state, :election, data, [{:next_event, :internal, :elect}]}
  end

  ## ── PHASE 4: ELECTION ──

  def election(:internal, :elect, data) do
    assignments = resolve_assignments(data)

    data = %{data | assignments: assignments}
    |> put_in([:trace, :phases, :election], %{
      leaders: Map.new(assignments, fn {st, a} -> {st, a.leader} end),
      completed_at: DateTime.utc_now()
    })

    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "deliberation:#{data.task_id}",
      {:leaders_elected, assignments}
    )

    {:next_state, :execution, data, [{:next_event, :internal, :dispatch}]}
  end

  def election(:internal, :assign_direct, data) do
    # No overlaps — assign highest bidder directly
    assignments = direct_assignments(data)
    data = %{data | assignments: assignments}
    {:next_state, :execution, data, [{:next_event, :internal, :dispatch}]}
  end

  ## ── PHASE 5: EXECUTION ──

  def execution(:internal, :dispatch, data) do
    for {subtask, assignment} <- data.assignments do
      AgenTroMatic.A2AGateway.dispatch_task(assignment.leader, subtask)
    end

    Process.send_after(self(), :execution_timeout, 30_000)
    {:keep_state, data}
  end

  def execution(:cast, {:result, agent_id, subtask, result}, data) do
    data = record_result(data, agent_id, subtask, result)

    if all_subtasks_complete?(data) do
      {:next_state, :consensus_commit, data, [{:next_event, :internal, :validate}]}
    else
      {:keep_state, data}
    end
  end

  ## ── PHASE 6: CONSENSUS COMMIT ──

  def consensus_commit(:internal, :validate, data) do
    case validate_quorum(data.results, data.quorum_policy) do
      :ok ->
        # Commit via Ra (Raft consensus)
        :ok = AgenTroMatic.Ra.propose({:commit, data.task_id, data.results})
        {:next_state, :reputation_update, data, [{:next_event, :internal, :update}]}

      {:escalate, reason} ->
        escalate_to_human(data, reason)
        {:next_state, :completed, data}
    end
  end

  ## ── PHASE 7: REPUTATION UPDATE ──

  def reputation_update(:internal, :update, data) do
    for {subtask, assignment} <- data.assignments do
      result = Map.get(data.results, subtask)
      AgenTroMatic.ReputationEngine.record_outcome(
        assignment.leader, subtask,
        assignment.bid_confidence, result.quality_score
      )
    end

    # Persist full trace
    AgenTroMatic.TraceWriter.write(build_final_trace(data))

    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "deliberation:#{data.task_id}",
      {:deliberation_complete, data.task_id}
    )

    {:next_state, :completed, data}
  end

  def completed(:cast, _, data), do: {:keep_state, data}
end
```

### 3.2 Latency Budget

| Phase | Target | Notes |
|-------|--------|-------|
| Broadcast + bid collection | 1–3s | Parallel; timeout configurable |
| Overlap analysis | 200–500ms | Single LLM call via Task.async |
| Negotiation (if triggered) | 2–5s | 1–2 rounds of argumentation |
| Assignment | < 100ms | Deterministic from vote tallies |
| **Total deliberation overhead** | **3–8s** | Only for complex tasks |

Simple, unambiguous tasks (one agent clearly best-fit, no overlap) complete in < 2s. Negotiation fires for ~20–40% of tasks.

---

## 4. Data Structures

### 4.1 Bid

```elixir
defmodule AgenTroMatic.Bid do
  defstruct [
    :agent_id,
    :task_id,
    :confidence,        # 0.0 – 1.0
    :reasoning,         # Natural language explanation
    :claimed_subtasks,  # ["clause_extraction", "risk_classification"]
    :estimated_tokens,
    :estimated_latency_ms,
    :cost_estimate_usd,
    :timestamp,
    :raft_term
  ]
end
```

### 4.2 Negotiation Round

```elixir
defmodule AgenTroMatic.NegotiationRound do
  defstruct [
    :subtask,
    :round,
    :competitors,       # [%{agent_id, argument, reputation_score}]
    :votes,             # [%{voter, for_agent, reason}]
    :result             # %{leader, support, method, margin}
  ]
end
```

### 4.3 Reputation Record (Ecto)

```elixir
defmodule AgenTroMatic.Reputation.AgentScore do
  use Ecto.Schema

  schema "agent_scores" do
    field :agent_id, :string
    field :global_score, :float
    field :capabilities, :map        # %{"clause_extraction" => %{score, samples, trend}}
    field :calibration, :map         # %{mean_confidence, mean_quality, error, overconfident?}
    field :peer_endorsements, :integer, default: 0
    field :total_bids, :integer, default: 0
    field :total_wins, :integer, default: 0
    field :total_support_roles, :integer, default: 0

    timestamps()
  end
end
```

### 4.4 Deliberation Trace (Ecto)

```elixir
defmodule AgenTroMatic.Traces.Trace do
  use Ecto.Schema
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "deliberation_traces" do
    field :task_id, :string
    field :task_description, :string
    field :cluster_id, :string
    field :raft_term, :integer
    field :phases, :map              # Full phase-by-phase breakdown
    field :assignments, :map         # {subtask → leader}
    field :total_latency_ms, :integer
    field :quorum_policy, :string
    field :outcome, :string          # "committed" | "escalated" | "failed"

    timestamps(updated_at: false)    # Append-only
  end
end
```

---

## 5. Ra (Raft) Integration

### 5.1 Why Ra

Ra is RabbitMQ's Raft implementation for Erlang/OTP. It handles leader election, log replication, heartbeats, and cluster membership — battle-tested at massive scale. No need to write custom Raft.

### 5.2 Ra State Machine

```elixir
defmodule AgenTroMatic.Ra.Machine do
  @behaviour :ra_machine

  @impl true
  def init(_config) do
    %{committed_tasks: %{}, term: 0}
  end

  @impl true
  def apply(_meta, {:commit, task_id, results}, state) do
    new_state = put_in(state, [:committed_tasks, task_id], %{
      results: results,
      committed_at: DateTime.utc_now()
    })
    {new_state, :ok, []}
  end

  @impl true
  def apply(_meta, {:update_reputation, agent_id, updates}, state) do
    # Reputation updates are also committed through Raft
    # for cluster-wide consistency
    {state, :ok, [{:mod_call, AgenTroMatic.ReputationEngine, :apply_update, [agent_id, updates]}]}
  end
end
```

### 5.3 Cluster Setup

```elixir
defmodule AgenTroMatic.Ra.Supervisor do
  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    :ra.start()

    cluster_name = :agentromatic_consensus
    nodes = Application.get_env(:agentromatic, :ra_nodes, [node()])

    members = Enum.map(nodes, fn n -> {cluster_name, n} end)

    :ra.start_cluster(:default, cluster_name, {AgenTroMatic.Ra.Machine, %{}}, members)

    children = []  # Ra manages its own processes
    Supervisor.init(children, strategy: :one_for_one)
  end
end
```

---

## 6. Reputation System

### 6.1 Engine

```elixir
defmodule AgenTroMatic.ReputationEngine do
  use GenServer

  @ets_table :agentromatic_reputation

  def init(_) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    warm_from_db()
    {:ok, %{}}
  end

  @doc "Microsecond lookup for agent reputation on a capability."
  def score(agent_id, capability) do
    case :ets.lookup(@ets_table, {agent_id, capability}) do
      [{{^agent_id, ^capability}, score}] -> score
      [] -> 0.5  # Unknown → neutral
    end
  end

  @doc "Record a deliberation outcome and update scores."
  def record_outcome(agent_id, capability, bid_confidence, actual_quality) do
    GenServer.cast(__MODULE__, {:outcome, agent_id, capability, bid_confidence, actual_quality})
  end

  def handle_cast({:outcome, agent_id, cap, confidence, quality}, state) do
    # Update capability score (weighted recency)
    current = score(agent_id, cap)
    new_score = current * 0.85 + quality * 0.15

    # Update calibration
    calibration_error = confidence - quality

    :ets.insert(@ets_table, {{agent_id, cap}, new_score})

    # Persist async
    AgenTroMatic.Repo.insert(%AgenTroMatic.Reputation.Outcome{
      agent_id: agent_id,
      capability: cap,
      bid_confidence: confidence,
      actual_quality: quality,
      calibration_error: calibration_error,
    })

    # Broadcast to Observatory
    Phoenix.PubSub.broadcast(
      AgenTroMatic.PubSub,
      "reputation:#{agent_id}",
      {:score_updated, agent_id, cap, new_score}
    )

    {:noreply, state}
  end

  @doc "Tiebreaker score when negotiation is tied."
  def tiebreak_score(agent_id, capability) do
    cap_score = score(agent_id, capability)
    calibration = calibration_penalty(agent_id)
    win_rate = win_rate(agent_id, capability)

    cap_score * 0.5 + calibration * 0.3 + win_rate * 0.2
  end

  defp calibration_penalty(agent_id) do
    # Perfect calibration → 1.0. Off by 0.2 → 0.8.
    error = abs(mean_confidence(agent_id) - mean_quality(agent_id))
    1.0 - error
  end
end
```

### 6.2 Reputation Dynamics

| Event | Effect |
|-------|--------|
| Win + quality ≥ confidence | Score increases. Calibration improves. |
| Win + quality < confidence | Score decreases. Marked overconfident. |
| Abstain from capability area | Neutral — no penalty. |
| Peer endorsement | Small boost to endorsed capability. |
| Inactive > 30 days on capability | Score decays toward 0.5 (uncertainty). |

---

## 7. A2A Integration

### 7.1 Gateway

```elixir
defmodule AgenTroMatic.A2AGateway do
  use GenServer

  @doc "Broadcast bid request to all agents in a cluster."
  def broadcast_bid_request(cluster_id, task, sub_tasks) do
    agents = AgenTroMatic.ClusterRegistry.agents(cluster_id)

    tasks = Enum.map(agents, fn agent ->
      Task.async(fn ->
        case Req.post(agent.url <> "/a2a/bid", json: %{task: task, sub_tasks: sub_tasks}) do
          {:ok, %{status: 200, body: bid}} -> {:ok, agent.id, bid}
          {:ok, %{status: _}} -> {:abstained, agent.id}
          {:error, _} -> {:timeout, agent.id}
        end
      end)
    end)

    Task.yield_many(tasks, timeout: 2_000)
    |> Enum.map(fn
      {_task, {:ok, result}} -> result
      {_task, nil} -> :timeout
    end)
  end

  @doc "Send execution task to elected leader."
  def dispatch_task(agent, subtask) do
    Req.post(agent.url <> "/a2a/execute", json: %{subtask: subtask})
  end

  @doc "Request negotiation argument from competing agent."
  def request_argument(agent, overlap) do
    Req.post(agent.url <> "/a2a/argue", json: %{overlap: overlap})
  end
end
```

### 7.2 Agent Card Enrichment

```elixir
defmodule AgenTroMatic.A2A.AgentCard do
  @doc "Enriches a standard A2A Agent Card with reputation metadata."
  def enrich(agent_card, agent_id) do
    Map.put(agent_card, "x-agentromatic", %{
      cluster_id: AgenTroMatic.ClusterRegistry.cluster_for(agent_id),
      reputation: %{
        global_score: AgenTroMatic.ReputationEngine.global_score(agent_id),
        capabilities: AgenTroMatic.ReputationEngine.all_scores(agent_id),
        calibration_error: AgenTroMatic.ReputationEngine.calibration_error(agent_id),
        win_rate: AgenTroMatic.ReputationEngine.win_rate(agent_id),
      },
      last_active: AgenTroMatic.ClusterRegistry.last_active(agent_id),
    })
  end
end
```

### 7.3 Elixir SDK (for agent developers)

```elixir
# 3 lines to join a deliberation cluster
defmodule MyAgent do
  use AgenTroMatic.Agent,
    cluster_url: "https://cluster.agentromatic.com/prod_01",
    capabilities: ["clause_extraction", "risk_classification"]

  @impl AgenTroMatic.Agent
  def handle_bid(task, sub_tasks) do
    %AgenTroMatic.Bid{
      confidence: 0.87,
      reasoning: "Indemnification clauses map to my training domain",
      claimed_subtasks: ["clause_extraction", "risk_classification"],
    }
  end

  @impl AgenTroMatic.Agent
  def handle_argue(overlap) do
    "Risk classification requires understanding clause intent, not just numerical exposure."
  end

  @impl AgenTroMatic.Agent
  def handle_execute(subtask) do
    # Do the actual work
    {:ok, %{output: "...", quality_self_assessment: 0.88}}
  end
end
```

---

## 8. Observatory (Phoenix LiveView)

```elixir
defmodule AgenTroMaticWeb.ObservatoryLive do
  use AgenTroMaticWeb, :live_view

  def mount(%{"task_id" => task_id}, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(AgenTroMatic.PubSub, "deliberation:#{task_id}")
    end

    {:ok,
     socket
     |> assign(:task_id, task_id)
     |> assign(:phase, :waiting)
     |> assign(:bids, [])
     |> assign(:overlaps, [])
     |> assign(:arguments, [])
     |> assign(:votes, [])
     |> assign(:assignments, %{})}
  end

  # Real-time updates from the Deliberation GenStateMachine
  def handle_info({:bid_received, bid}, socket) do
    {:noreply, update(socket, :bids, &[bid | &1]) |> assign(:phase, :bidding)}
  end

  def handle_info({:overlaps_detected, overlaps}, socket) do
    {:noreply, assign(socket, overlaps: overlaps, phase: :overlap)}
  end

  def handle_info({:argument_received, agent_id, subtask, argument}, socket) do
    {:noreply, update(socket, :arguments, &[{agent_id, subtask, argument} | &1])
     |> assign(:phase, :negotiation)}
  end

  def handle_info({:leaders_elected, assignments}, socket) do
    {:noreply, assign(socket, assignments: assignments, phase: :elected)}
  end

  def handle_info({:deliberation_complete, _task_id}, socket) do
    {:noreply, assign(socket, :phase, :completed)}
  end
end
```

### 8.1 Views

| View | Description |
|------|-------------|
| **Live Deliberation** | Real-time bid/argument/vote stream via PubSub → LiveView |
| **Decision Trace** | Click any output → full deliberation chain from Postgres |
| **Reputation Dashboard** | Agent scores, calibration trends, trajectories (LiveView + charting) |
| **What-If Simulation** | Replay past deliberation with different agents/thresholds |
| **Cluster Topology** | D3.js embedded in LiveView — agent nodes, connections, state |

---

## 9. Quorum Policies

```elixir
defmodule AgenTroMatic.Quorum do
  @doc "Validates results against quorum policy."
  def validate(results, :majority) do
    approvals = Enum.count(results, & &1.approved)
    if approvals > length(results) / 2, do: :ok, else: {:escalate, :no_majority}
  end

  def validate(results, :unanimous) do
    if Enum.all?(results, & &1.approved), do: :ok, else: {:escalate, :not_unanimous}
  end

  def validate(results, :weighted) do
    weighted_sum = Enum.sum(for r <- results, r.approved, do: r.voter_reputation)
    total_weight = Enum.sum(for r <- results, do: r.voter_reputation)
    if weighted_sum / total_weight >= 0.7, do: :ok, else: {:escalate, :below_threshold}
  end

  def validate(_results, :human_in_the_loop) do
    {:escalate, :requires_human_approval}
  end
end
```

### Domain Templates

```elixir
# Financial services
%AgenTroMatic.QuorumPolicy{
  default: :weighted,
  overrides: %{
    "risk_assessment" => :unanimous,
    "trade_execution" => :human_in_the_loop,
    "reporting" => :majority
  },
  escalation: %{max_rounds: 2, target: "compliance_team"}
}
```

---

## 10. Delegatic & Deliberatic Integration

### 10.1 Delegatic (Governance)

```elixir
defmodule AgenTroMatic.PolicyCheck do
  @doc "Checks Delegatic governance before executing."
  def authorize(org_id, task) do
    with {:ok, policy} <- Delegatic.PolicyEngine.compute_effective(org_id),
         :ok <- check_workflow_create(policy),
         :ok <- check_external_api(policy, task),
         :ok <- check_agent_limit(policy, task) do
      :ok
    end
  end

  defp check_workflow_create(%{allow_workflow_create: false}),
    do: {:error, "Org policy denies workflow creation"}
  defp check_workflow_create(_), do: :ok

  defp check_external_api(%{allow_external_api: false}, %{requires_external_api: true}),
    do: {:error, "Org policy denies external API access"}
  defp check_external_api(_, _), do: :ok
end
```

### 10.2 Deliberatic (Decision Protocol)

Deliberatic is the formal argumentation and consensus protocol that powers AgenTroMatic's deliberation engine. Where AgenTroMatic is the automation runtime (bidding, overlap detection, reputation), Deliberatic provides the decision science underneath — formal semantics, Byzantine fault tolerance, constitutional guardrails, and Merkle-chained evidence chains.

```elixir
defmodule AgenTroMatic.Deliberatic do
  @moduledoc """
  Bridge to the Deliberatic argumentation protocol.
  AgenTroMatic delegates all structured decision-making to Deliberatic's DAF engine.
  """

  alias Deliberatic.{DAF, Constitution, EvidenceChain, Consensus}

  @doc "Opens a Deliberatic round when overlap is detected between competing bids."
  def open_round(overlapping_bids, constitution_path) do
    with {:ok, constitution} <- Constitution.load(constitution_path),
         positions <- Enum.map(overlapping_bids, &bid_to_position/1),
         {:ok, round} <- DAF.open(positions, constitution) do
      {:ok, round}
    end
  end

  @doc "Submits an agent's argument with typed evidence into the DAF."
  def submit_argument(round_id, agent_id, argument, evidence) do
    DAF.submit_position(round_id, %{
      author: agent_id,
      argument: argument,
      evidence: evidence,
      reputation: AgenTroMatic.ReputationEngine.score(agent_id, :general)
    })
  end

  @doc "Triggers graded semantics resolution and returns the verdict."
  def resolve(round_id) do
    with {:ok, verdict} <- Consensus.resolve(round_id),
         {:ok, chain} <- EvidenceChain.finalize(round_id) do
      {:ok, %{verdict: verdict, evidence_chain: chain, merkle_root: chain.root}}
    end
  end

  defp bid_to_position(bid) do
    %Deliberatic.Position{
      author: bid.agent_id,
      claim: bid.claimed_subtasks,
      evidence: [
        %{type: :performance, value: bid.confidence, confidence: 0.1},
        %{type: :historical, value: bid.reputation_score, confidence: 0.05}
      ],
      weight: bid.confidence * bid.reputation_score
    }
  end
end
```

**Key integration points:**

| Deliberatic Concept | AgenTroMatic Usage |
|--------------------|--------------------|
| DAF (Argumentation Framework) | Structures the negotiation phase — competing bids become formal positions with attack/support relations |
| Graded Semantics (σ) | Computes acceptability scores that drive leader election |
| Constitution DSL | Hard boundaries from Delegatic policies + soft preferences from cluster config |
| Evidence Chains | Every deliberation produces a Merkle-chained audit log for compliance |
| Two-Phase Consensus | Fast path (Raft) for clear winners, conflict path (PBFT) for close calls |
| Reputation (ρ) | Deliberatic's ELO-derived reputation feeds back into AgenTroMatic's ReputationEngine |
| Vindicated Dissent | Agents who correctly dissented get 1.5× reputation bonus — prevents groupthink |

---

## 11. Portfolio Integration

### 11.1 Position in the [&] Stack

```
SPECPROMPT (specifications — Elixir)
  │  defines contracts that...
  ▼
AGENTELIC (collaboration — Elixir/OTP)
  │  builds agents that...
  ▼
FLEETPROMPT (skills — Elixir/OTP)
  │  distributes skills to...
  ▼
AGENTROMATIC ← (automation — Elixir/OTP + Ra)
  │  self-organizes agents using decisions from...
  ▼
DELIBERATIC (decisions — Elixir/OTP + DAF)
  │  formal argumentation, consensus, evidence chains for...
  ▼
DELEGATIC (governance — Elixir/OTP)
  │  enforces policies checked by...
  ▼
GRAPHONOMOUS (learning — Elixir/OTP + Arcana)
  │  improves via...
  ▼
OPENSENTIENCE (runtime — Elixir/OTP)
  │  runs on...
  ▼
WEBHOST SYSTEMS (hosting)
```

All Elixir. One BEAM. Shared PubSub. Shared Ecto Repo. Shared Telemetry. Shared deployment.

### 11.2 Integration Contracts

| Integration | Mechanism |
|-------------|-----------|
| SpecPrompt → AgenTroMatic | Agents reference specs during bidding. Bids validated against capability contracts. |
| Agentelic → AgenTroMatic | Telespace events trigger deliberations via PubSub. |
| FleetPrompt → AgenTroMatic | Cluster queries FleetPrompt for available capabilities. |
| AgenTroMatic → Deliberatic | `Deliberatic.open_round/2` when overlaps detected. Graded semantics drive leader election. Evidence chains logged. |
| AgenTroMatic → Delegatic | `PolicyCheck.authorize/2` before every execution. Delegatic policies feed Deliberatic constitutions. |
| AgenTroMatic → Graphonomous | Deliberation outcomes feed continual learning engine. |
| AgenTroMatic → WHS | Agent invocations dispatched to WHS runtime. |

---

## 12. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | Elixir 1.17+ | BEAM concurrency = perfect for deliberation protocol |
| Consensus | Ra (Erlang) | RabbitMQ's battle-tested Raft. No custom impl. |
| Framework | Phoenix 1.8+ | LiveView for Observatory. PubSub for real-time events. |
| State Machine | GenStateMachine | States map 1:1 to deliberation phases. |
| Database | PostgreSQL 16+ | Durable reputation scores, deliberation traces. |
| Hot Cache | ETS | Reputation lookups, active deliberation state. |
| Trace Pipeline | Broadway | Batched trace writes with back-pressure. |
| HTTP Client | Req + Finch | A2A protocol calls. Connection pooling. |
| Background Jobs | Oban | Reputation decay, cleanup, notifications. |
| Telemetry | :telemetry + Prometheus | Deliberation latency, bid collection timing. |
| Deployment | Mix release + Docker | Single BEAM or clustered via libcluster + Ra. |

---

## 13. Acceptance Test Criteria

Acceptance tests derived from spec invariants. Each maps to a verifiable assertion:

**Deliberation Protocol:**
- Given a task with 3 bidding agents → all 3 bids are collected within `bid_timeout_ms`; late bids are rejected
- Given overlapping capabilities in 2+ bids → overlap_analysis phase detects and reports overlapping subtasks
- Given a negotiation round → agents exchange positions; round completes within `negotiation_timeout_ms`
- Given a Ra quorum with 3 nodes → commit succeeds with 2/3 agreement; fails with 1/3
- Given a successful consensus_commit → reputation scores update for all participants within 1s
- Given a deliberation timeout at any phase → GenStateMachine transitions to `:failed` with phase-specific error

**Reputation System:**
- Given an agent with 10 successful outcomes → reputation score increases monotonically per domain
- Given an agent with calibration Brier score > 0.3 → confidence-adjusted reputation is discounted
- Given an ETS reputation lookup → response time < 5μs p99
- Given a reputation decay cycle (Oban job) → stale scores decrease by configured decay factor

**A2A Integration:**
- Given an A2A bid message → A2AGateway parses, validates, and routes to the correct deliberation GenServer
- Given an invalid A2A message → returns structured error (not crash); deliberation continues with remaining agents

**Observatory:**
- Given an active deliberation → LiveView renders phase transitions within 50ms of PubSub broadcast
- Given a completed deliberation → full trace (all phases, timings, bids, votes) is persisted via Broadway

### 13.1 `&govern` Integration

AgenTroMatic integrates with the `&govern` primitive:

**`&govern.telemetry` — Deliberation Telemetry:**
Every deliberation emits structured telemetry events via `&govern.telemetry.emit`:
- `deliberation.started` — task_id, participating agents, quorum policy
- `deliberation.phase_changed` — phase name, duration, agent count
- `deliberation.completed` — outcome, winner, consensus type, total duration
- `deliberation.failed` — failure reason, phase at failure

These events enable Delegatic `budget_check` enforcement — deliberation token/compute costs are tracked per org.

**`&govern.escalation` — HITL Escalation:**
When a deliberation reaches an impasse (no quorum after max rounds) or when the task's confidence falls below `escalate_when.confidence_below`, AgenTroMatic escalates via `&govern.escalation.escalate`:
- `trigger`: `confidence_below` or `no_quorum`
- `proposed_action`: the highest-ranked bid's action plan
- `context`: full deliberation trace for human review

**`&govern.identity` — Agent Verification in Deliberation:**
Before accepting bids, the deliberation coordinator verifies each agent's identity via `&govern.identity.verify`:
- Manifest hash matches registered identity
- Agent's declared capabilities include the required subtask capabilities
- Prevents impersonation attacks (OS-007 threat: agent impersonation)

---

## 14. Roadmap

### Phase 1: MVP — The Deliberation Engine (Q2 2026)
- [ ] GenStateMachine deliberation loop
- [ ] Ra cluster setup for consensus
- [ ] Basic ReputationEngine (ETS + Postgres)
- [ ] A2AGateway with Req/Finch
- [ ] CLI Observatory (IEx helpers + :observer)
- [ ] Open-source release + Hex package
- [ ] Elixir SDK (`use AgenTroMatic.Agent`)

### Phase 2: Observatory + Platform (Q3 2026)
- [ ] Phoenix LiveView Observatory (live deliberation view)
- [ ] Reputation dashboard LiveView
- [ ] What-if simulation (replay deliberations)
- [ ] Quorum policy templates

### Phase 3: Enterprise (Q4 2026)
- [ ] Deliberatic protocol integration (DAF engine, graded semantics, evidence chains)
- [ ] Deliberatic Constitution DSL for cluster governance
- [ ] Delegatic policy integration (feeds Deliberatic constitutions)
- [ ] HITL escalation via Oban jobs
- [ ] SOC 2 audit trace exports (Merkle-chained evidence from Deliberatic)
- [ ] Industry quorum templates

### Phase 4: Intelligence (2027)
- [ ] Self-optimizing deliberation (Graphonomous feedback loop)
- [ ] Cross-org reputation federation (distributed Erlang)
- [ ] Capability evolution detection
- [ ] Property-based testing with StreamData

---

## 15. Pricing

| Plan | Price | Agents | Deliberations/mo | Features |
|------|-------|--------|-------------------|----------|
| **Open Source** | Free | 5 | 1,000 | Core engine, basic reputation, CLI observatory |
| **Team** | $99/mo | 25 | 25,000 | Full Observatory, reputation dashboard, A2A middleware |
| **Business** | $349/mo | 100 | 100,000 | Governance, HITL, SSO, what-if simulation |
| **Enterprise** | Custom | Unlimited | Unlimited | SLA, on-prem, compliance packages |

---

## 16. Success Metrics

| Metric | Target |
|--------|--------|
| Deliberation latency (simple, no overlap) | < 2s |
| Deliberation latency (complex + negotiation) | < 8s |
| Reputation lookup (ETS hot) | < 5μs p99 |
| Concurrent active deliberations | > 10K (BEAM process limit: millions) |
| Observatory LiveView latency | < 50ms event-to-render |

---

## 17. Why This Wins

1. **Right abstraction.** Static routing is wrong for overlapping, evolving capabilities. Deliberation is how teams work.
2. **Deliberatic is the science.** Formal argumentation semantics (Dung/Potyka), Byzantine fault tolerance, and constitutional guardrails give AgenTroMatic academic rigor and enterprise trust that no competitor has.
3. **The demo is a moat.** Watching agents deliberate in the LiveView Observatory is inherently compelling. Viral content that converts.
4. **Reputation compounds.** Longer runtime → better routing. Switching costs increase. Reputation data is irreplaceable.
5. **A2A is the trojan horse.** Native A2A → inherit 150+ org ecosystem. Every team hitting the "routing wall" finds AgenTroMatic.
6. **Observability sells governance.** Deliberatic evidence chains = Merkle-chained audit trails. One feature, two markets.
7. **BEAM advantage.** Process-per-deliberation, Ra for consensus, LiveView for Observatory, PubSub for real-time — all native. Zero glue code.

---

*AgenTroMatic: Your agents don't need a boss. They need a deliberation.*
