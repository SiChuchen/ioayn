# ADR 0005: Use a bounded Cognitive Atlas instead of a repository-wide graph

- Status: Accepted
- Date: 2026-07-21

## Context

Whole-repository dependency graphs become dense hairballs and do not tell a learner where a newly understood slice belongs or how it connects to previous learning.

## Decision

IOAYN maintains a cognition-oriented Atlas whose primary nodes are system areas, learning slices, learning assets, and concepts. Code entities are opt-in anchors. User-facing projections are question-specific and bounded; the Skill defaults to 12 nodes.

## Consequences

- The Atlas reflects formed understanding, not every static code relationship.
- Static graph providers remain useful evidence adapters but do not define the user-facing map.
- A future UI must consume the same Atlas model and projection rules.
