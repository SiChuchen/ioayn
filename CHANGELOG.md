# Changelog

## 1.1.3 — Teacher Index & Full-Session Hardening (2026-08-17)

Every change comes from the second live learning goal (plugin development) run against dsh, including learner feedback raised mid-session.

Teacher-side index:

- Added `build_project_index` / `get_project_index`: a one-time scan of package manifests (with `dsh.bundle`/`dsh.profile` detection), doc headings, and architecture-note inventories, stored under `.ioayn/runtime` and anchored to the git revision, with paths normalized to forward slashes. The teacher locates anchors and specimens by lookup instead of live re-exploration every round. `get_project_index` takes `section` + `query` filters and returns at most 40 items with a `truncated` flag (counts-only when no section is given) so the teacher never pulls the whole index into context. The no-hairball invariant is restated as protecting the learner's view, not the teacher's knowledge: the index is never rendered to the learner. SKILL workflow step 2.7 and protocol §5 now consult it before exploring. Live validation on dsh: 221 packages / 215 docs / 1369 notes indexed in ~0.4s; a `packages?bundle` query returns the three official bundles in ~0.3s.

Context economy and healing:

- `resume_learning_context` responses are now compact: sessions/goals/rounds reduced to identity and state, recent turns truncated to 400 chars, assets reduced to id/title/status/atlas node (use `get_learning_asset` for full bodies).
- `migrate_workspace` now performs an idempotent Atlas heal even on the current schema: it clears legacy template descriptions ("Concept connected through…", "System area: …") and backfills `SHARES_CONCEPT_WITH` edges for every existing learning asset, reporting what it fixed.

State machine automation:

- `commit_learning_round` advances `goal.current_level` to the highest committed abstraction level; `close_goal` marks the goal's slices `stage: completed` and reports the count.
- Commits backfill `round_id` onto unattributed journal turns of the session (the initial prompt and pre-commit checkpoint answers now carry round provenance automatically); the commit response reports `journal_backfilled`.

Teaching policy (from mid-session learner feedback):

- Metaphor scaffolding: every metaphor label carries its real-name anchor inline from first use; real names progressively take over; graduation checkpoints ask in real names; the name-mapping table is revisited at round closes.
- Edge annotation: flow arrows must label what flows (relation verb + payload), never bare arrows.
- Hands-on rounds: specimen before skeleton; expect schema-vs-instance confusion at config boundaries and separate blank-form (schema) from filled-form (value) with a one-glance discriminator; after two failed repairs on the same confusion, switch the teaching device.

Evals: added `metaphor-to-name-handoff`; extended `diagram-language-and-granularity` with edge annotation. Smoke tests now cover the teacher index, compact resume, Atlas heal, journal backfill, goal level advance, and slice completion.

## 1.1.2 — Context Economy & Atlas Cognition Network (2026-08-16)

From the first full-session retrospective: five rounds cost ~25–30K tokens of persistence overhead, and the most valuable cross-round knowledge links existed only implicitly.

- **Compact tool responses**: `commit_learning_round` and `save_slice` no longer echo full inputs. Responses now carry ids, counts, checkpoint state, and the Atlas update — cutting persistence overhead by roughly half. Idempotent replay returns the compact form too.
- **Atlas auto-nodes cleaned**: auto-created concept and system-area nodes no longer carry the `Concept connected through IOAYN learning assets: X` / `System area: X` template descriptions; the label is the name. ASCII names already slug into readable ids (`concept-agent-loop`); non-ASCII names keep their deterministic hash (id charset is ASCII-only by schema).
- **Automatic `SHARES_CONCEPT_WITH` edges**: when a committed learning asset shares at least one concept with an earlier asset, the server now creates an explicit asset↔asset edge labeled with the shared concepts (idempotent, deduplicated in both directions). Cross-round cognition links that previously existed only implicitly through shared concept nodes are now first-class, queryable graph edges.
- Smoke tests now assert the compact shape, the template-free concept descriptions, and the auto shared-concept edge.

## 1.1.1 — Real-Project Hardening from dsh Field Testing (2026-08-16)

Every change in this release comes from a full live learning session run against the DeepSeek Harness (dsh) repository with the plugin, hooks, and MCP server connected.

Protocol (who the learner is and who steers):

- Added the learner-state assessment phase (SKILL workflow 1.5, protocol §4): returning learners with prior assets get an Atlas location view and a retention probe instead of a blank-slate restart; first-contact learners get at most three plain-language calibration questions mapping to start level (never used/never read → `L0`).
- Added the architect persona and depth policy: the default learner is a decision-maker; the human cognitive zone is `L1`–`L3`, `L4`/`L5` are AI-delegable and recorded as `deferred` unknowns with `futureTopic: ai-delegable`. Component rounds must carry ownership, design decision, and replaceability alongside I/O roles.
- Added agent-led progression: the agent owns the path — survey goals announce a roadmap, each round ends with a single proposed next round plus rationale, and open menus appear only for expert learners or genuine budget decisions.
- Added diagram language and granularity policy: functional names in the learner's language as primary labels, technical names as annotations, at most five coarse boxes at L1, refined as rounds descend.

Lifecycle and safety:

- Fixed the capture lifecycle privacy gap: the SessionEnd hook defers the active-session marker so an unfinished session cannot silently journal the next unrelated Claude session; workflow step 9 now closes sessions via `finish_learning_session` (plus `close_goal` for achieved goals).
- Aligned `resume-learning` with agent-led progression (main-path progress from the latest round's `next_actions`, single proposed next station).
- Added a subagent-dispatch fallback for harnesses without an Agent tool.

Server tools:

- Added `close_goal` (completed/abandoned, releases the manifest's current goal) and `reset_workspace` (irreversible full wipe, requires `confirm: "RESET"`).
- `preflight_learning` now returns a `knowledge_summary` (per-type counts, last activity, latest asset) so the learner-state assessment branches without extra calls.

Fixes:

- Fixed `skills/view-atlas/SKILL.md` frontmatter: the unquoted description containing `: ` made the YAML unparseable, silently dropping all skill metadata at runtime.
- Fixed the Windows build: single-quoted `--banner:js='#!/usr/bin/env node'` is split by cmd.exe at the space; switched to escaped double quotes.
- Added `.claude-plugin/marketplace.json` for local-marketplace installation.
- Fixed `scripts/verify-repository.mjs` hardcoding the release version: it now reads the `VERSION` file as the single source of truth, so version bumps no longer break `npm run verify`.

Evals: added `first-contact-calibration`, `returning-learner-bridge`, `architect-level-teaching`, `agent-led-progression`, `diagram-language-and-granularity`, `session-close-privacy`, `resume-agent-led`; smoke tests now cover `close_goal`, `knowledge_summary`, and `reset_workspace`.

- Fixed the capture lifecycle privacy gap: the SessionEnd hook now defers the active-session marker so an unfinished learning session cannot silently journal the next unrelated Claude session; `resume_learning_session` re-enables it. Added workflow step 9 (close the session via `finish_learning_session` when learning ends) so sessions no longer stay active indefinitely. Added the `session-close-privacy` eval case.
- Aligned `resume-learning` with agent-led progression: it now reconstructs main-path progress from the latest round's `next_actions` and proposes the single next station instead of offering path menus. Added the `resume-agent-led` eval case.
- Added a subagent-dispatch fallback: when the host harness cannot dispatch the IOAYN subagents, the skill falls back to bounded in-conversation exploration under the same budgets instead of skipping the round.
- Relaxed `save_slice` weight guidance: mandatory question, anchor, and participant roles; full I/O contracts only where they carry teaching weight.
- Bench-on-redirect rule in teaching policy: learner redirects close a pending checkpoint explicitly instead of accumulating them.
- `view-atlas` renders for the medium: plain-text sketch in terminals, Mermaid only where it renders.

- Added diagram language and granularity policy (SKILL workflow step 5, protocol §7, teaching reference): teaching diagrams use the learner's language with functional names as primary labels and technical names as parenthetical annotations; an L1 overview is at most five coarse boxes with one-sentence duties, refined as rounds descend; one relationship per diagram; a functional↔real name mapping table supports navigation without memorization. Added the `diagram-language-and-granularity` eval case.

- Added agent-led progression (SKILL workflow step 5, protocol §7, teaching & learner-state references): the agent is the teacher and owns the path — survey goals announce a roadmap up front, each round ends with a single proposed next round plus rationale, and open drill-down menus appear only for expert learners with a specific question or genuine budget decisions. A first-contact learner is never asked to choose between territories they have never seen. Added the `agent-led-progression` eval case.

- Added the architect persona and depth policy (SKILL, protocol §4/§7, teaching & methodology references): the default learner is a decision-maker; the human cognitive zone is `L1`–`L3` (boundaries, responsibility chains, contracts and rationale), `L4`/`L5` are AI-delegable and recorded as `deferred` unknowns with `futureTopic: ai-delegable` instead of being taught. Component rounds must now carry ownership, design decision, and replaceability alongside input → action → output roles. Added the `architect-level-teaching` eval case.
- Added the learner-state assessment phase (SKILL workflow 1.5, protocol §4): returning learners with prior assets get an Atlas location view and a retention probe instead of a blank-slate restart; first-contact learners get at most three plain-language calibration questions mapping to start level (never used/never read → `L0`).
- Level selection now requires the assessment outcome; `L1`/`L2` is the fallback only when the learner has used the product or read its source, and familiarity is never inferred from silence.
- Added `skills/learn-code/references/learner-state-policy.md` and two eval cases (`first-contact-calibration`, `returning-learner-bridge`).
- Fixed `skills/view-atlas/SKILL.md` frontmatter: the unquoted description containing `: ` made the YAML unparseable, silently dropping all skill metadata at runtime.
- Fixed the Windows build: `server/package.json` used single-quoted `--banner:js='#!/usr/bin/env node'`, which cmd.exe splits at the space so esbuild saw two input files; switched to escaped double quotes (portable across cmd and sh).
- Added `.claude-plugin/marketplace.json` so the plugin can be installed from a local marketplace for development and testing.

## 1.1.0 — Persistent Learning Memory & Cognitive Atlas

- Added MCP preflight and explicit `PERSISTENT` / `DEGRADED` workflow semantics.
- Added L0–L5 abstraction levels to goals, slices, rounds, sessions, checkpoints, and teaching policy.
- Made contextual entity roles mandatory: input → action → output/side effect.
- Added claim types: FACT, INFERENCE, UNKNOWN, CONFLICT with confidence and basis references.
- Added cognitive budgets for entities, files, concepts, and flow nodes.
- Added `LearningSession`, `ConversationTurn`, `LearningRound`, and `LearningAsset` schemas.
- Added reusable `LearningAsset.body_markdown` and source-turn provenance so teaching content can be rendered as a knowledge base and traced back to the original dialogue.
- Added opt-in Claude Code Hooks for user prompt, assistant response, compact summary, lifecycle, and failure capture.
- Added recoverable, idempotent `commit_learning_round`, including safe same-payload replay and rejection of conflicting round payloads.
- Added Cognitive Atlas nodes, edges, system-area hierarchy, concept connections, historical connections, and bounded Mermaid projections.
- Added `/ioayn:resume-learning`, `/ioayn:view-atlas`, and `knowledge-curator`.
- Added session recovery/reactivation, latest-session discovery, Atlas delta workflow, and personal/shared storage separation through `.ioayn/.gitignore`.
- Added v1.0 → v1.1 migration with backups.
- Modularized the MCP source into constants, schemas, storage, Atlas, and server registration.
- Made Zod schemas the source for generated JSON Schemas.
- Added full MCP, Hook capture/provenance, migration, Atlas, historical-link, resume, freshness, idempotency, template, and fixture tests.
- Added source-aware freshness that ignores `.ioayn/`-only commits but detects product-source changes.
- Added a portable public-registry npm lockfile and clean-install validation.
- Incorporated findings from the first real WVSS engine-analysis learning test.

## 1.0.0 — Foundational Release

- Established the IOAYN name and bounded input/output-driven learning methodology.
- Added `/ioayn:learn-code`, three Subagents, and the local stdio MCP Server.
- Added Goal, Slice, Evidence, Unknown, Git freshness, validation, docs, and initial smoke tests.
