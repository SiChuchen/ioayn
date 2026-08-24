# IOAYN Learning Protocol v1.1

This document is the normative execution protocol for Agents. Methodology describes *why* IOAYN works; this protocol defines *what must happen* in a real session.

## 1. Protocol states

```text
PRECHECK
→ GOAL_FRAMED
→ LEVEL_CONFIRMED
→ ENTRY_DISCOVERED
→ BOUNDARY_MODELED
→ ROUND_TAUGHT
→ ROUND_COMMITTED
→ ATLAS_UPDATED
→ WAITING_OR_CONTINUING
```

No state may be silently skipped when its preconditions are required.

## 2. PRECHECK

The Agent calls `preflight_learning` before repository analysis.

Output shown to the learner:

- operating mode: `PERSISTENT` or `DEGRADED`;
- current branch, commit, and dirty state;
- workspace schema and migration requirement;
- resumable goal/session when present.

In `DEGRADED` mode the Agent may continue using the methodology, but it must not claim that journal, assets, Atlas, or progress are saved.

## 3. GOAL_FRAMED

The goal contains:

- one target;
- 2–5 answerable questions;
- included scope;
- excluded scope;
- completion criteria.

“Understand the project” is not yet a valid bounded goal. The Agent must propose a minimum useful initial slice rather than dumping a repository overview.

## 4. LEVEL_CONFIRMED

The Agent identifies:

- start level;
- target level;
- current level.

Before fixing the start level the Agent assesses the learner state:

- a resumable session exists → the resume protocol applies;
- prior assets or Atlas nodes exist without an active session → show the Atlas `location` projection, ask what the learner still remembers, start one level below the highest still-confident level, and connect the new goal to prior assets rather than teaching from a blank slate;
- empty workspace → calibrate with at most three plain-language questions: used the product? read source or docs? what concrete question brings the learner here?

Calibration mapping: never used and never read → `L0` outermost black box; used the product → `L0` skippable, start at `L1`; has read some source → start the unfamiliar area at `L1`/`L2`.

Levels:

- L0 product/problem scenario;
- L1 system boundary;
- L2 end-to-end I/O path;
- L3 module contract and state;
- L4 component/function/process collaboration;
- L5 implementation mechanism.

Absent an explicit user choice, the assessment outcome decides the start level; `L1`/`L2` is the fallback only for learners who have used the product or read its source. Never infer that “detailed” means “start at L5”, and never infer familiarity from silence.

The default learner persona is a decision-maker or architect. The human cognitive zone is L1–L3 (boundaries, responsibility chains, contracts and rationale); L4/L5 are AI-delegable detail — teach them only on an explicit request to descend, otherwise record them as `deferred` with `futureTopic: ai-delegable`. I/O boundaries locate responsibility and contract; they are not themselves the teaching target.

## 5. ENTRY_DISCOVERED

Locate anchors through the teacher-side index (`get_project_index`, rebuild via `build_project_index` when stale) instead of live repository exploration; fall back to exploration only for gaps the index cannot answer. The index is teacher-side only and is never rendered to the learner.

Select one observable anchor appropriate to the question:

- UI action or visible result;
- API/CLI/file/message input;
- test case;
- log or error stack;
- object creation;
- Binder/syscall/ioctl boundary;
- function caller or consumer for a local-only question.

Return a minimal producer-to-consumer path, not the full call graph.

## 6. BOUNDARY_MODELED

Each selected participant receives a contextual contract:

```text
input source and meaning
→ action/transformation
→ output consumer or side effect
```

Include relevant state reads/writes, failures, and source evidence. A symbol name without its role is not a valid node.

## 7. ROUND_TAUGHT

A guided round contains:

1. active question and current level;
2. a compact flow or contract in the learner's language at the round's granularity — functional names as primary labels, technical names as parenthetical annotations, at most five coarse boxes at L1, refined as rounds descend; every metaphor label carries its real-name anchor inline, arrows label what flows (relation + payload), and real names progressively take over from metaphors;
3. role table for every newly introduced entity;
4. ownership and design decision for every newly introduced component — what it owns, what it does not, why it exists separately, what is replaceable beside it;
5. typed claims and confidence;
6. explicit unknowns and classification;
7. no more than two primary source locations in the main explanation;
8. checkpoint at the current level;
9. a teacher-led next step: the agent proposes the single next round with a one-line rationale tied to the goal's main path. The learner holds veto and redirect, not the steering wheel; open menus of options only for expert learners with a specific question, or genuine budget decisions.

Default cognitive budget:

- 5 new entities;
- 3 new source files;
- 3 new technical concepts;
- 8 visible flow nodes.

Repository exploration can read more internally, but the teaching surface must stay within the budget unless the user chooses a larger sub-layer.

## 8. Claim protocol

- `FACT`: directly supported by source, test, runtime, log, network, DB, Git, or documentation evidence.
- `INFERENCE`: interpretation derived from facts; includes basis references.
- `UNKNOWN`: evidence is insufficient.
- `CONFLICT`: evidence or models disagree.

Every important claim includes `high`, `medium`, or `low` confidence and limitations where relevant.

Unknowns are classified:

- `blocking` — current question cannot be answered without resolving it;
- `non_blocking` — important but not required for the active path;
- `deferred` — belongs to another future slice.

## 9. Checkpoint protocol

A checkpoint tests the learner's mental model. It must:

- declare L0–L5 level;
- remain at or below the current level unless the user opts into descent;
- require prediction, explanation, ordering, boundary identification, or failure reasoning;
- store the user's answer and assessment.

Do not ask “do you understand?”. Do not immediately reveal the answer before the user attempts it.

## 10. ROUND_COMMITTED

`commit_learning_round` is required after a completed round in persistent mode. The commit includes:

- conversation references;
- entities and contextual roles;
- claims, evidence, and unknowns;
- checkpoint and answer;
- reusable learning asset;
- concepts and Atlas connections;
- next actions.

If the commit fails, report the failure explicitly. Do not mark the round resumable.

## 11. ATLAS_UPDATED

After commit, show:

- current location in the system;
- new or revised asset;
- connection to prior learning;
- shared concept or participant;
- current gap;
- one recommended next path.

The projection is bounded to 12 nodes by default.

## 12. Resume protocol

A resumed session begins with `resume_learning_context`. After the user confirms the session, call `resume_learning_session` to re-enable opt-in capture without replacing earlier history. Then present:

- last goal and slice;
- current abstraction level;
- last committed round;
- open blocking unknowns;
- connected historical assets;
- current Atlas location;
- recommended next actions.

The Agent must distinguish what was committed from what only appeared in an uncommitted conversation turn.

## 13. Exit conditions

A slice can be completed when:

- its completion criteria are met;
- blocking unknowns are resolved or accepted as limitations;
- principal claims have evidence or are clearly labeled inference;
- the learner has completed an appropriate checkpoint;
- the final asset and Atlas links are committed.

The user may stop earlier. In that case the slice remains paused, not falsely completed.
