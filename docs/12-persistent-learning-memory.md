# Persistent Learning Memory

## 1. Purpose

IOAYN does not treat a learning conversation as disposable chat. A useful code learning session produces two different kinds of value:

1. **Learning Journal** — the chronological record of how the learner and Agent reached an understanding.
2. **Reusable Learning Assets** — curated, evidence-aware knowledge that can be reused in later sessions or by other learners.

These layers must remain separate. Raw dialogue contains questions, wrong guesses, intermediate hypotheses, tool noise, and conclusions that may later be revised. It is valuable provenance, but it is not automatically trustworthy project knowledge.

## 2. Memory layers

### 2.1 Learning Journal

The Journal records:

- user prompts;
- the Agent's final teaching response for each turn;
- explicit checkpoints and answers;
- selected tool observations;
- compact summaries and session lifecycle events;
- the revision and learning session under which the exchange occurred.

Journal records are append-only JSON Lines under:

```text
.ioayn/journal/<learning-session-id>.jsonl
```

They are personal by default and are excluded by `.ioayn/.gitignore`.

### 2.2 Reusable Learning Assets

A `LearningAsset` captures the stable outcome of one or more rounds:

- the question being answered;
- a curated Markdown teaching body that can be read outside the original chat;
- references back to the source conversation turns;
- the system area and abstraction level;
- input and output contracts;
- contextual roles for key entities;
- relevant concepts;
- typed claims and confidence;
- evidence and unknown references;
- provenance to the source session and round;
- Git revision and freshness state.

Assets live under:

```text
.ioayn/assets/
```

An asset is eligible for sharing only after curation. Raw conversation content must not be copied into an asset without removing irrelevant or sensitive details.

## 3. Opt-in capture

Automatic journal capture is deliberately opt-in.

`start_learning_session` creates an active-session marker under `.ioayn/runtime/`. `resume_learning_session` reactivates an existing session without overwriting its journal or previous rounds. Claude Code Hooks only write when this marker exists and is active. Outside an IOAYN learning session, the Hooks exit without recording anything.

The initial user prompt is supplied directly to `start_learning_session` because the first `UserPromptSubmit` hook occurs before the learning session can be activated.

The Hooks currently capture:

- subsequent user prompts via `UserPromptSubmit`;
- the Agent's final message for a turn via `Stop`;
- assistant failures via `StopFailure`;
- compact summaries via `PostCompact`;
- session lifecycle events.

This is a **turn journal**, not a lossless recording of every internal reasoning step or every intermediate tool call. Deterministic tool observations that matter to a claim should be saved explicitly through the MCP evidence and round-commit APIs.

## 4. Round curation lifecycle

A completed teaching round follows this lifecycle:

```text
raw turns
  → identify new entities and concepts
  → type claims as FACT / INFERENCE / UNKNOWN / CONFLICT
  → attach evidence and limitations
  → record checkpoint and learner answer
  → curate or revise a LearningAsset
  → connect the asset into the Cognitive Atlas
  → atomically commit the round
```

`commit_learning_round` is the canonical write boundary. It creates a recoverable transaction record and uses stable IDs so a retry does not silently duplicate the same round.

## 5. Revision and correction

Knowledge is not immutable.

- `REFINES` adds detail without invalidating the earlier model.
- `SUPERSEDES` replaces an earlier claim or asset.
- `CONTRADICTS` records unresolved evidence conflict.
- `REVISED` marks an asset whose previous interpretation was changed.
- `STALE` indicates that source revision changes may have invalidated the asset.

Agents must preserve provenance rather than rewriting history invisibly. A learner should be able to see not only the current answer, but how and why it changed.

## 6. Privacy and sharing boundary

Default policy:

| Data | Default location | Git status | Sharing expectation |
|---|---|---|---|
| Journal | `.ioayn/journal/` | ignored | personal |
| Sessions | `.ioayn/sessions/` | ignored | personal |
| Rounds | `.ioayn/rounds/` | ignored | personal |
| Checkpoints | `.ioayn/checkpoints/` | ignored | personal |
| Goals and slices | `.ioayn/goals/`, `.ioayn/slices/` | shareable | project-scoped |
| Evidence and unknowns | `.ioayn/evidence/`, `.ioayn/unknowns/` | shareable after review | project-scoped |
| Learning assets and Atlas | `.ioayn/assets/`, `.ioayn/atlas/` | shareable after review | reusable knowledge |

A future multi-user system may move personal memory to a user-scoped database, but the separation must remain part of the domain model.

## 7. Non-goals in v1.1

v1.1 does not provide:

- semantic vector search over all conversations;
- automatic redaction of every possible secret;
- a collaborative server with user accounts;
- automatic promotion of raw dialogue into verified knowledge;
- a full replay UI.

The release establishes the storage model, capture protocol, provenance, and curation transaction needed for those capabilities later.
