# Persistent learning memory and Cognitive Atlas policy

## Two layers of memory

1. **Learning Journal** — opt-in raw user/agent/tool/session history. It is personal and gitignored by default.
2. **Reusable Learning Assets** — curated contracts, flows, concepts, claims, evidence, and unknowns. These are project-scoped and may be committed.

Never treat raw dialogue as verified knowledge. A reusable asset must carry evidence, confidence, revision, and provenance.

## Atlas purpose

The Atlas is not a completion percentage. It answers:

- Where does this learned topic sit in the project?
- What came before and after it?
- Which previous learning shares a concept or participant?
- What new learning refines or contradicts older knowledge?
- Where is the current cognitive chain disconnected?

## Atlas node policy

Default visible node types:

- system area;
- learning slice;
- learning asset;
- concept.

Code entities are opt-in (`map: true`). Do not map every symbol.

## Projection policy

Every projection must be question-specific and bounded. Default maximum is 12 nodes. Never show the complete Atlas as a force-directed hairball.

Supported projections:

- location;
- connections;
- history;
- concept;
- gaps.

## Round commit

Each round should update the journal, reusable asset, Atlas, claims, unknowns, checkpoint, and next path as one recoverable, idempotent commit.
