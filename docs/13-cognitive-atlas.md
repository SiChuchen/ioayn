# IOAYN Cognitive Atlas

## 1. Definition

The Cognitive Atlas is a map of **formed understanding**, not a graph of every symbol in the repository and not a percentage-based progress tracker.

It answers:

- Where does the current learning slice sit in the project?
- What inputs arrive before it and what outputs leave after it?
- Which earlier learning shares a concept, participant, state, or boundary?
- Does the new understanding refine, contradict, or supersede older understanding?
- Where is the learner's current explanatory chain still disconnected?

## 2. Why a separate Atlas is necessary

Static code graphs model implementation relationships such as calls, imports, and inheritance. They are useful evidence providers, but they do not represent the learner's current mental model.

The Atlas instead links:

```text
system area
↕
learning slice
↕
reusable learning asset
↔ concept
↔ prior learning
```

Code entities are optional anchors. They are not the default map surface.

## 3. Node types

### System area

A stable high-level region such as `engine/trunscan`, `task/scheduler`, or `android/framework/binder`.

### Learning slice

A bounded question-driven path the learner has explored, such as “存活探测 I/O 路径”.

### Learning asset

The curated explanation produced from a slice and one or more learning rounds.

### Concept

A reusable concept that can connect distant slices, such as:

- producer–consumer;
- fork memory isolation;
- shared queue;
- representation boundary;
- state transition;
- permission check.

When a committed learning asset shares at least one concept with an earlier asset, `commit_learning_round` derives an explicit `SHARES_CONCEPT_WITH` edge between the two asset nodes, labeled with the shared concepts (idempotent, deduplicated in both directions). Cross-round cognition links are therefore first-class graph edges, not something the reader must reconstruct from shared concept nodes.

### Code entity

A selected function, struct, queue, process, or service. It enters the Atlas only when `map: true` and when it improves orientation. Mapping every symbol is prohibited.

### Other supported anchors

The schema also supports data objects, state, boundaries, and external systems for future projections.

## 4. Relationship vocabulary

Core relations include:

- `PART_OF`
- `PRECEDES`
- `PRODUCES`
- `CONSUMES`
- `TRANSFORMS`
- `DEPENDS_ON`
- `IMPLEMENTS`
- `OBSERVED_IN`
- `LEARNED_THROUGH`
- `CONNECTS_TO`
- `CONTRADICTS`
- `REFINES`
- `SUPERSEDES`
- `EXPLAINS`
- `SHARES_CONCEPT_WITH`

Every relation carries confidence and may carry evidence references. Semantic connections inferred only from labels must be marked as inference rather than fact.

## 5. Cognitive state, not completion percentage

An Atlas node has multiple independent status dimensions:

- **model**: observed, modeled, verified, revised;
- **connection**: isolated or connected;
- **freshness**: current, stale, or unknown;
- **unknowns**: open or clear.

A node can therefore be “verified but isolated” or “connected but stale”. This is more informative than “60% learned”.

## 6. Bounded projections

The underlying Atlas may grow, but the learner-facing view must remain bounded and question-specific. v1.1 supports five projections:

### Location

Shows the system-area hierarchy around the current asset.

### Connections

Shows upstream, downstream, and direct semantic relationships.

### History

Shows how current knowledge refines, contradicts, supersedes, or connects to earlier assets.

### Concept

Shows other slices that share one concept.

### Gaps

Shows open unknowns, isolated nodes, stale links, or a missing upstream/downstream connection.

Default maximum: 12 visible nodes in the Skill. The MCP tool allows a larger bounded value for programmatic use, but a complete unfiltered graph is not a valid teaching projection.

## 7. Atlas update after every round

A round may add:

- one learning asset node;
- its system-area path;
- concept nodes;
- selected code anchors;
- relations to previous nodes;
- freshness and unknown status updates.

The Agent must show an Atlas delta after persistence:

```text
Location: engine → Trunscan → live probe
New asset: 存活探测 I/O 路径
Connected to: Trunscan 调度
Shared concept: producer–consumer / shared queue
Current gap: 存活目标如何进入后续深度扫描尚未确认
```

## 8. Preventing the hairball failure mode

The Atlas must never repeat the failure of repository-wide force graphs.

Rules:

1. Map learning assets and concepts before individual symbols.
2. Add a code entity only when it is a durable orientation anchor.
3. Use one projection question at a time.
4. Limit nodes and depth.
5. Prefer hierarchy and flow over force-directed placement.
6. Show relation labels and contextual roles.
7. Treat source-code graph providers as evidence sources, not as the learner-facing Atlas.

## 9. Future UI contract

A future IOAYN Studio should render the same structured Atlas, not introduce a parallel model. The minimum UI should support:

- zoom from system area to learning asset to source evidence;
- timeline overlay for yesterday/today connections;
- stale and open-unknown indicators;
- focus filters by concept, feature, process, or data object;
- “why are these connected?” evidence inspection;
- return from a node to its original learning dialogue and checkpoint.

v1.1 intentionally provides JSON and Mermaid projections first so the data model can stabilize before a dedicated UI is built.
