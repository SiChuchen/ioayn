# ADR 0004: Separate raw learning journal from curated knowledge assets

- Status: Accepted
- Date: 2026-07-21

## Context

User–Agent dialogue contains valuable provenance but also incorrect guesses, temporary hypotheses, sensitive details, and conversational noise. Treating the entire transcript as verified project knowledge would corrupt the knowledge base and create privacy risk.

## Decision

IOAYN stores two separate layers:

1. an opt-in, personal, append-only Learning Journal;
2. curated LearningAssets with evidence, confidence, revision, and provenance.

Journal/session/round/checkpoint directories are gitignored by default. Assets and Atlas data may be shared only after curation.

## Consequences

- Knowledge promotion requires an explicit round commit.
- Conversation history remains available for replay and correction.
- Agents must not cite raw dialogue as source-code fact.
- Future search must preserve the distinction between provenance and authoritative asset.
