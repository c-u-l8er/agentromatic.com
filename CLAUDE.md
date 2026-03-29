# AgenTroMatic — Automatic Deliberation Engine

Automatic deliberation engine for multi-agent AI systems. Agents bid, debate, elect leaders by consensus, execute under quorum, and build reputation over time.

## Source-of-truth spec

- `docs/spec/README.md` — AgenTroMatic technical specification

## Role in [&] Ecosystem

AgenTroMatic is the **automation layer** — the service mesh that sits between governance (Delegatic) and raw agent execution. It adds consensus, resilience, observability, and reputation tracking on top of Google's A2A protocol.

## Design principles

1. Deliberation over routing — agents negotiate every time
2. A2A-native — all inter-agent messages flow through standard A2A protocol
3. Reputation is memory — past performance shapes future assignments
4. Visible by default — every deliberation is traceable via the Observatory
5. Consensus before commit — Ra (Raft) quorum validation required
6. Governance-aware — respects Delegatic policy boundaries

## Tech stack

Elixir/OTP, Phoenix LiveView, Ra (Raft), PostgreSQL, ETS

## Status

This is a spec + marketing site. No implementation code yet. Implementation will be Elixir/OTP.
