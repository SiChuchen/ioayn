# ADR 0006: Make automatic conversation capture explicitly opt-in

- Status: Accepted
- Date: 2026-07-21

## Context

Plugin Hooks can observe user prompts and assistant turn completion. Capturing every Claude Code conversation by default would violate the project's privacy boundary and create unrelated data in project storage.

## Decision

Hooks write only while an active IOAYN learning-session marker exists. `start_learning_session` activates capture; finishing or pausing the session removes or disables the marker. Captured personal data is gitignored by default.

## Consequences

- Ordinary Claude Code use is not recorded by IOAYN.
- The initial prompt must be passed directly to session creation because activation happens after the first prompt event.
- Hook capture is a turn journal, not a complete record of internal reasoning or all tool calls.
