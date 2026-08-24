# IOAYN methodology reference

## Core proposition

Input/output is the **epistemic entry point**, not a claim that internal mechanisms are irrelevant.

A bounded Learning Slice explains one real question as:

`observable input → boundary → producer → consumer → transformation → state/side effect → output → next consumer`

The input or output may be a parameter, event, object, state transition, error, message, file, syscall, Binder transaction, database mutation, model request, or any other observable boundary.

## Depth policy

Use these levels:

1. Observable behavior or symptom.
2. System, process, or trust boundary.
3. End-to-end path skeleton.
4. Participant contracts.
5. Internal mechanism.
6. Statement-level, algorithmic, or data-structure detail.

Move down only when the current level cannot answer the active question.

The default learner is a decision-maker: the human zone is levels 2–4 of this list (boundary, path skeleton, participant contracts). Levels 5–6 are AI-delegable implementation detail — teach them only on an explicit request to descend, otherwise record them as `deferred` unknowns with `futureTopic: ai-delegable`.

## Unknown classification

- `blocking`: the active path cannot be explained or distinguished without resolving it.
- `non_blocking`: the role is enough for the current slice.
- `deferred`: belongs to another learning target.

Never follow a dependency merely because it exists.

## Slice quality

A strong slice:

- starts at an observable or semantically meaningful anchor;
- answers one named question;
- teaches with 5–12 key nodes;
- distinguishes control, data, state, side effect, and failure;
- records uncertainty;
- links important claims to evidence;
- can be recursively expanded without full-repository knowledge.

A weak slice:

- mirrors the directory tree;
- starts from `main` by default;
- includes every referenced symbol;
- mixes unrelated goals;
- uses a repository-wide hairball graph;
- claims runtime behavior from static code alone;
- ends with a report but no learner checkpoint.

## Local-to-global synthesis

Complete several verified vertical slices, identify repeated participants, contracts, data types, states, and infrastructure, then synthesize the system horizontally.
