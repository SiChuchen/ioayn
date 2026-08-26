---
# synced-from: skills/view-atlas@1.1.3
name: view-atlas
description: "Show a bounded IOAYN Cognitive Atlas projection for a learned topic: project location, connections to earlier learning, shared concepts, history, or knowledge gaps."
argument-hint: "[focus node id 或学习资产名称]"
disable-model-invocation: true
---

# View IOAYN Cognitive Atlas

Resolve the message text after /view-atlas to an Atlas node using `list_learning_assets` when necessary. Then call `build_atlas_projection` with no more than 12 nodes.

Choose the projection that matches the question:

- `location` — where it sits in the project;
- `connections` — direct semantic relationships;
- `history` — refinements and prior learning;
- `concept` — shared concepts across slices;
- `gaps` — open or disconnected cognition.

Use `find_historical_connections` to explain links to previous days or sessions. Present the structured relationship, but explain each node's role. Render for the medium: in a terminal, show a plain-text sketch and the structured view instead of raw Mermaid code; include Mermaid only where it will actually render. Never render the entire Atlas.
