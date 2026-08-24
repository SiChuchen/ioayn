# v1.1.0 Release Scope

## Release name

**Persistent Learning Memory & Cognitive Atlas**

## Objective

Turn IOAYN from a prompt-guided methodology into a repeatable learning protocol that preserves the learning process, curates reusable knowledge, and locates each learned slice inside a bounded project cognition map.

## Included

### Learning protocol

- MCP preflight and explicit persistent/degraded mode;
- L0–L5 start, target, and current abstraction levels;
- mandatory contextual roles for introduced entities;
- typed claims and confidence;
- classified unknowns;
- cognitive budgets;
- level-consistent checkpoints;
- mandatory per-round commit.

### Persistent memory

- LearningSession;
- ConversationTurn;
- LearningRound;
- opt-in hook journal capture;
- reusable LearningAsset;
- resumable context;
- personal/shared storage separation.

### Cognitive Atlas

- system area, slice, asset, concept, and optional code-entity nodes;
- semantic edge vocabulary;
- location, connections, history, concept, and gap projections;
- bounded Mermaid rendering;
- historical connection discovery;
- Atlas delta after round commit.

### Reliability

- atomic JSON writes;
- recoverable/idempotent round transaction;
- v1.0 to v1.1 migration;
- revision and source-aware freshness anchors that ignore knowledge-only `.ioayn/` commits;
- referential workspace validation;
- generated JSON Schemas;
- end-to-end MCP, hook, and migration smoke tests.

### Distribution

- installable Claude Code plugin directory;
- bundled stdio MCP server;
- Skills, subagents, hooks, and development source;
- developer and Agent handoff documentation.

## Excluded

- dedicated graphical Atlas application;
- collaborative server and authentication;
- full semantic search or vector database;
- general AST/LSP/SCIP code index;
- browser automation and automatic UI feature discovery;
- runtime trace adapters for every language/platform;
- automatic secret redaction guarantees;
- automatic promotion of raw dialogue to verified knowledge;
- mastery scoring or course-completion percentage;
- source modification practice mode.

## Release gates

A distributable v1.1 package must pass:

1. repository structure and branding checks;
2. TypeScript strict typecheck;
3. MCP bundle build;
4. complete Goal → Session → Slice → Round → Asset → Atlas smoke test;
5. journal Hook capture test;
6. v1.0 → v1.1 migration test;
7. JSON parsing and generated-schema presence checks;
8. archive inspection with `node_modules` excluded;
9. SHA-256 generation.

Claude Code's own plugin validator should be run in an environment where the CLI is installed. It was not available in the v1.1 build container and therefore must not be reported as passed by this release.

## Field-validation gate after release

The next P0 field test must run against a real repository with the MCP active and demonstrate:

- persistent session creation;
- round-by-round assets;
- restart and resume;
- Atlas historical links;
- freshness after a source change;
- explicit degraded behavior when MCP is intentionally disabled.
