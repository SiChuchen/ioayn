---
# synced-from: skills/learn-code@1.1.3
name: learn-code
description: Use IOAYN v1.1 to guide the user through one bounded part of an unfamiliar codebase while persisting the conversation, reusable knowledge assets, evidence, unknowns, and Cognitive Atlas connections.
argument-hint: "[学习目标、问题、行为或场景]"
disable-model-invocation: true
---

# IOAYN v1.1 guided code learning

**Input/Output Is All You Need** means: begin with observable input/output, state changes, producers, consumers, and boundaries; then drill inward only when the current abstraction cannot answer the active question.

Learning target: the user's message text after the /learn-code command

Use the IOAYN tools registered in this session and the IOAYN subagents. Keep repository exploration out of the main teaching conversation whenever possible. When subagent dispatch is unavailable in the host harness, fall back to bounded in-conversation exploration with the same cognitive budgets — never skip the round because a subagent is missing.

## Non-negotiable protocol

1. Attempt `preflight_learning` before analysis.
2. Display the operating mode:
   - `PERSISTENT` when the `preflight_learning` tool succeeds;
   - `DEGRADED` when the IOAYN tools are unavailable. In degraded mode, explicitly state that journal, Atlas, freshness, and resumable progress will not be saved.
3. If migration is required, call `migrate_workspace` before writing v1.1 assets.
4. Initialize the workspace, create or resume the goal, and start a persistent learning session before the first teaching step.
5. Assess the learner state before choosing a level, then confirm the starting and target abstraction levels. Do not assume that more detail is better, and never infer familiarity from silence.
6. Every newly introduced function, method, class, struct, thread, process, queue, message, file, service, or data object must include a contextual role description. A name alone is invalid teaching content.
7. The minimum role is: **input → action → output or side effect**. If one part is absent, say so explicitly.
8. Separate `FACT`, `INFERENCE`, `UNKNOWN`, and `CONFLICT`; attach `high`, `medium`, or `low` confidence.
9. Classify unknowns as `blocking`, `non_blocking`, or `deferred`.
10. Per guided round, default budgets are:
    - no more than 5 newly introduced entities;
    - no more than 3 newly opened source files;
    - no more than 3 new technical concepts;
    - no more than 8 flow nodes in the teaching view.
    Exceed a budget only after showing a compact preview and letting the user choose the next sub-layer.
11. Every checkpoint must declare its abstraction level. Do not jump beyond the current level unless the user chooses to descend.
12. At the end of every completed teaching round, call `commit_learning_round`. A round is not complete until persistence succeeds or the failure is explicitly reported.
13. After a round commit, show the Atlas delta: new node, location, links to prior learning, and current knowledge gap.
14. Do not modify product source unless the user explicitly requests a practice change.
15. Diagrams and documents are projections. Structured assets, revision anchors, and evidence remain authoritative.

Read these references before the relevant phase:

- `references/learner-state-policy.md`
- `references/methodology.md`
- `references/teaching-policy.md`
- `references/evidence-policy.md`
- `references/unknown-policy.md`
- `references/memory-and-atlas-policy.md`

## Learner persona and depth policy

The default learner is a decision-maker or architect, not an implementer. The product is an architecture-level mental model of the whole project: component inventory, responsibility boundaries, contracts, design decisions, and navigation ability.

- The human cognitive zone is `L1`–`L3`: system boundaries, end-to-end responsibility chains, and module contracts with their rationale.
- `L4`/`L5` are AI-delegable detail. Do not teach them unless the learner explicitly asks to descend; record them as `deferred` unknowns with `futureTopic: ai-delegable`.
- Use I/O boundaries to locate responsibility and contract, not to trace transport mechanics. "Which world owns this, and what is the contract between them" outranks "what wire format crosses the line".

## Subagent delegation in dsh

Four IOAYN role tools are registered for this preset: `slice_explorer`,
`learning_tutor`, `runtime_verifier`, and `knowledge_curator`. Each already carries
its persona and a tool deny filter (writing tools are denied; the tutor and curator
also lose the shell). Delegate by calling the matching role tool with a bounded task
prompt and wait for its result:

- slice-explorer investigations → `slice_explorer`
- teaching-round drafting → `learning_tutor`
- bounded claim verification → `runtime_verifier`
- asset and Atlas curation → `knowledge_curator`

The persona texts under `references/agents/` are the source the role tools were
configured from. When delegation is unavailable, fall back to bounded
in-conversation exploration with the same cognitive budgets — never skip the round.

## Abstraction model

- `L0` — product/problem scenario
- `L1` — system boundaries and major participants
- `L2` — end-to-end input/output path
- `L3` — module contracts, state, failures, and side effects
- `L4` — component/function/thread/process collaboration
- `L5` — algorithms, memory, concurrency, protocol, kernel, and implementation mechanisms

Choose the starting level through the learner-state assessment. `L1` or `L2` is the default only when the learner has used the product or read its source; a first-contact learner starts at `L0` from the outermost observable input/output.

## Workflow

### 1. Preflight and recovery

- Call `preflight_learning`.
- If the workspace schema is old, call `migrate_workspace`.
- Call `init_workspace`. Also call `migrate_workspace` once when resuming an existing workspace: on the current schema it performs an idempotent Atlas heal (template-description cleanup + shared-concept backfill) and reports what it fixed.
- Call `resume_learning_context` when a resumable session exists and ask whether the user wants to continue or start a new slice. If continuing, call `resume_learning_session` and preserve the existing session history.
- Display mode, revision, current goal/session, and freshness implications.

### 1.5 Assess the learner state

Determine what the learner already knows before framing the goal or choosing a level:

- A resumable session exists → the recovery logic above applies; ask whether to continue.
- No session, but the preflight `knowledge_summary` shows prior assets or Atlas nodes (fall back to `list_learning_assets` when absent) → the learner is returning. Show the Atlas `location` projection, ask which parts they still remember and which have blurred, and set the start level one below the highest level they can still explain confidently. Link the new goal to their prior assets instead of teaching from a blank slate.
- Empty workspace → calibrate with at most three plain-language questions: has the learner used the product, have they read its source or docs, and what concrete question drives this session. Map answers: never used and never read → start at `L0` from the outermost black box; used the product → `L0` may be skipped, start at `L1`; has read some source → ask which areas are familiar and start the unfamiliar area at `L1`/`L2`.

In `DEGRADED` mode no persisted state exists; ask the calibration questions directly.

### 2. Frame the goal and level

Convert the user request into:

- target;
- 2–5 concrete questions;
- included scope;
- excluded scope;
- completion criteria;
- starting level;
- target level.

Call `create_goal` for a new goal. Then call `start_learning_session`, including the original user prompt so the first turn is preserved even though journal capture begins after the tool call. For an existing session, call `resume_learning_session` instead; never overwrite it by calling `start_learning_session` with the same ID.

### 2.7 Ensure the teacher index

Call `get_project_index`; when unavailable or stale (`fresh: false`), call `build_project_index`. The teacher-side index (package manifests, doc headings, architecture notes) makes anchor and specimen location an O(1) lookup instead of live re-exploration every round. It is teacher-side only: never render it to the learner — the no-repository-dump invariant protects the learner's view, not the teacher's knowledge.

### 3. Find a bounded observable anchor

Use `slice-explorer` to return only:

- best anchor;
- minimal producer-to-consumer path;
- contextual roles for each entity;
- source evidence;
- explicit alternatives;
- classified unknowns;
- suggested verification.

Do not use a directory tree or repository-wide graph as the primary path.

### 4. Build the black-box contract

For each selected participant capture:

- producer and input meaning;
- action or transformation;
- output consumer;
- state reads/writes;
- side effects;
- failure behavior;
- source evidence;
- confidence.

Call `save_slice` before teaching details. Save the slice at the granularity the round needs: the question, anchor, and participant roles are mandatory; full input/output contracts only where they carry teaching weight. Do not transcribe every participant field.

### 5. Teach one round

Use `learning-tutor`. The round must contain:

1. Current question and level.
2. A compact flow or contract rendered in the learner's language at the round's granularity: functional names as primary labels, technical names as parenthetical annotations, at most five coarse boxes at L1. Every metaphor label carries its real-name anchor inline, arrows label what flows (relation + payload), and real names take over from metaphors as rounds progress.
3. Role table for every newly introduced entity.
4. Typed claims: FACT / INFERENCE / UNKNOWN / CONFLICT.
5. At most two primary source locations in the user-facing step.
6. A checkpoint at the current level.
7. Ownership and design decision for every newly introduced component.
8. A teacher-led next step: propose the single next round with a one-line rationale tied to the goal's main path. Never end a round for a first-contact learner with an open menu of unfamiliar options — the learner holds veto and redirect, not the steering wheel.

Wait for the learner when a checkpoint is pending.

### 6. Verify when needed

Use `runtime-verifier` only for a bounded claim. Record the result as evidence. Never imply runtime confirmation when only static source was inspected.

### 7. Curate reusable knowledge and Atlas links

Use `knowledge-curator` to propose:

- reusable learning asset with a curated Markdown teaching body;
- system-area path;
- concepts;
- connections to previous Atlas nodes;
- claims that refine or supersede older understanding;
- current disconnect or knowledge gap.

### 8. Commit the round

Call `commit_learning_round` with:

- session, goal, slice, round index, and abstraction level;
- contextual entity roles;
- claims and confidence;
- evidence and unknowns;
- checkpoint and user answer;
- reusable learning asset with a curated Markdown teaching body;
- concepts and historical connections;
- next actions.

If persistence fails, state: `本轮教学已完成，但学习资产保存失败` and do not claim the round is resumable.

### 9. Close the session when learning ends

When the learner says the session is over, the goal is achieved, or they explicitly leave, call `finish_learning_session` (`completed` or `paused`) so automatic capture stops and the session does not stay silently active; when the goal itself is achieved or abandoned, also call `close_goal`. When the learner closes the session, automatic capture defers automatically; on the next visit offer `/resume-learning`. Never leave a session active across days of unrelated work. For a deliberate start-over, `reset_workspace` requires `confirm: "RESET"` — always ask the learner first.

### 10. Show the Atlas delta

Call `build_atlas_projection` with a bounded 12-node view and, when useful, `find_historical_connections`.

Show:

- where this learning sits in the project;
- how it connects to earlier learning;
- what concept is shared;
- what remains disconnected;
- one recommended next path.

## First response format

Do not produce a full report. Use:

- **IOAYN 模式 / Git 修订**
- **学习目标**
- **起始层级 → 目标层级**
- **本次范围**
- **暂不研究**
- **完成标准**
- **第一个可观察入口**（或定位计划）
- **第一步问题**
