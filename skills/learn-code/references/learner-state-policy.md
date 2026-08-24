# Learner state assessment policy

## Purpose

The start level must come from what the learner actually knows, not from a default. A returning learner and a first-contact learner need different entry points for the same repository, and silence about familiarity is not evidence of familiarity.

## Decision tree

Run after preflight, before framing the goal:

1. **Resumable session exists** → use the resume protocol; ask whether to continue or open a new slice.
2. **No session, but prior knowledge exists** (the preflight `knowledge_summary` reports assets, rounds, or Atlas nodes; fall back to `list_learning_assets`) → the learner is returning:
   - show the Atlas `location` projection for the most recent slice;
   - ask which parts they still remember and which have blurred;
   - set `startLevel` to one level below the highest level the learner can still explain confidently;
   - link the new goal to prior assets through Atlas connections instead of teaching from a blank slate.
3. **Empty workspace** → calibrate with at most three plain-language questions:
   - Have you used this product?
   - Have you read any of its source or docs?
   - What concrete question or task brings you here?

In `DEGRADED` mode there is no persisted state; ask the calibration questions directly.

## Calibration mapping

| Calibration answer | Start level |
| --- | --- |
| Never used the product, never read the source | `L0`, outermost black box |
| Used the product | `L0` skippable, start at `L1` |
| Read some source or docs | Ask which areas are familiar; start the unfamiliar area at `L1`/`L2` |
| Returning learner with assets | One below the highest level still explainable with confidence |

The driving question from calibration feeds the goal's `questions`; it must not be discarded after level selection.

## Question style

- Plain language only: "用过吗 / 读过吗 / 想搞懂什么", no jargon such as subsystem names, package names, or level codes.
- At most three calibration questions. The goal is to pick a starting layer, not to interview.
- Returning learners get recall questions about *their own* prior assets ("上次学的 X 你还记得多少"), not generic quizzes.

## Initiative follows from calibration

- Expert with a specific question → co-piloted: menus and joint sub-layer choices are fine.
- First-contact or survey learner → agent-led main path: the agent announces the roadmap, proposes each next round, and never offloads navigation to the learner.

## Conversation-spanning calibration

Calibration answers describe the learner, not the workspace. If the workspace was reset mid-conversation, reuse the answers already given in this conversation (state them back for confirmation) instead of re-asking; only re-ask what has genuinely changed.

## Recording

- Write the outcome into the goal's `startLevel`/`currentLevel`.
- For returning learners, record the self-assessed retention as a low-confidence claim so later rounds can refine it.

## Anti-patterns

- Starting at `L1`/`L2` for a first-contact learner because the protocol "defaults" there.
- Treating an expert answer to one calibration question as expertise in the whole system.
- Skipping assessment because the user gave a broad prompt ("学一下这个项目").
- Re-teaching from zero when assets exist and the learner remembers them.
- Asking calibration questions when a resumable session already answers them.
