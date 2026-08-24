# P0 Real-Project Findings: WVSS engine-analysis

## Test record

- Date: 2026-07-21
- Target project: WVSS `engine-analysis`
- Learning slice: live-probe I/O path
- Interaction: five guided rounds
- Tool state: IOAYN methodology used manually; IOAYN MCP and subagents were not connected

## Learning path observed

```text
engine-level I/O
→ Trunscan live-probe scheduling
→ libsping sender/receiver collaboration
→ fork memory semantics and the actual IPC path
```

The learner moved from not knowing the engine's role to independently reasoning that post-fork overwrites of `targets` would not update the other process and that the locked/shared queue was the meaningful cross-process channel.

This is preliminary evidence that boundary-first, on-demand drill-down, and checkpoint-driven learning can produce a real mental-model change in a C codebase.

## P0 defects found

### 1. Missing contextual function roles — severe

The Agent introduced names such as `analyse()`, `preprocess_frame()`, `add_live_ip()`, and `entry()` without a one-sentence role. Since the full functions were not shown, the learner could not infer their purpose.

Resolution in v1.1:

- every newly introduced entity requires input → action → output/side effect;
- no-name-only-node assertion;
- role tables are mandatory in teaching views;
- contextual roles are represented in Slice, Round, and LearningAsset schemas.

### 2. Incorrect starting abstraction — medium

The Agent initially proposed a detailed `Trunscan → ZMQ → rsasd` handshake path. The learner had to redirect it to the engine's overall input and output.

Resolution in v1.1:

- L0–L5 abstraction model;
- start and target levels must be confirmed;
- L1/L2 is the default when unspecified;
- checkpoints carry a level.

### 3. MCP toolchain absent — severe

No Goal, Slice, Evidence, Unknown, Session, Round, LearningAsset, or Atlas data was persisted. Revision anchoring and freshness could not be tested.

Resolution in v1.1:

- mandatory `preflight_learning`;
- explicit `PERSISTENT / DEGRADED` modes;
- `start_learning_session` and opt-in journal capture;
- recoverable `commit_learning_round`;
- resume and migration tests.

### 4. Fact/inference/unknown distinction was implicit — medium

Some statements were plausible inferences but appeared with the fluency of facts.

Resolution in v1.1:

- `FACT / INFERENCE / UNKNOWN / CONFLICT` schema;
- confidence and limitations;
- unknown classification and explicit end-of-round ledger.

### 5. Information density grew too fast — low

The later stage inspected roughly 2,500 lines across four C files. The resulting seven-node teaching view still contained too much new mechanism at once.

Resolution in v1.1:

- per-round budgets for entities, files, concepts, and visible nodes;
- user chooses among sub-layer alternatives before exceeding a budget.

### 6. Checkpoint difficulty jumped — low

The final checkpoint required pcap, pthread, timeout, and global-state knowledge, while the prior round had remained at a higher level.

Resolution in v1.1:

- checkpoints are level-tagged;
- no descent beyond current level without learner choice;
- checkpoint answer and assessment are persisted.

## Evaluation delta

v1.1 adds assertions for:

- MCP preflight and mode disclosure;
- abstraction-level confirmation;
- contextual roles for all introduced entities;
- no name-only diagram nodes;
- typed claims and confidence;
- explicit unknown ledger;
- cognitive-budget enforcement;
- checkpoint-level consistency;
- round persistence;
- Atlas delta and historical connection.

## Remaining validation gap

The P0 test validated the methodology but not the full framework. The next release gate is a repeated run of the same live-probe slice with:

1. MCP visibly connected;
2. workspace initialized or migrated;
3. session and raw turns saved;
4. each round committed;
5. a new Claude session resumed from the last committed round;
6. an edited source file causing freshness to become stale;
7. Atlas location and historical connections rendered.

Until that succeeds, v1.1 should be described as an implemented and internally smoke-tested framework, not as a fully field-validated learning system.
