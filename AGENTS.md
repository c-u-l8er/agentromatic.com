# AgenTroMatic — Agent Interface

AgenTroMatic is the automatic deliberation engine for multi-agent AI systems in the [&] Protocol ecosystem.

## For agents

AgenTroMatic provides deliberation-as-a-service for multi-agent decisions:

### Task Submission
- Submit tasks via Phoenix API or A2A protocol
- Agents bid based on capability fit
- Overlapping capabilities trigger structured deliberation

### Deliberation Protocol
- Bid collection with timeout
- Leader election via Ra (Raft consensus)
- Quorum validation before commit
- Reputation updates from outcomes

### Observatory
- Real-time deliberation streaming via WebSocket
- Reputation dashboard
- What-if simulation
- Conflict log viewer

## Protocol Integration

- Accepts from: Delegatic (governance), any A2A-capable agent
- Feeds into: executing agents, reputation store, audit log
- Transport: A2A v0.3+ / Phoenix API

## Status

Spec complete. Implementation pending. See `docs/spec/README.md`.
