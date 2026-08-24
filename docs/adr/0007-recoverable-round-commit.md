# ADR 0007: Persist a teaching round through one recoverable commit boundary

- Status: Accepted
- Date: 2026-07-21

## Context

A round can create turns, evidence, unknowns, checkpoints, assets, Atlas nodes, and edges. Saving them through unrelated calls risks partial state and makes retries duplicate data.

## Decision

`commit_learning_round` is the canonical transaction boundary. It uses caller-supplied stable IDs, atomic file replacement, and a transaction journal so retries are idempotent and interrupted commits can be diagnosed.

## Consequences

- A round is not resumable until commit succeeds.
- Agents must explicitly report persistence failure.
- JSON storage remains viable for v1.1 while preserving a migration path to SQLite or another transactional store.
