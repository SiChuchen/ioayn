# IOAYN v1.1 schemas

These schemas define the persistent learning-memory and Cognitive Atlas model used by the MCP Server.

Authoritative entities:

- `learning-goal`
- `learning-slice`
- `evidence`
- `unknown`
- `learning-session`
- `conversation-turn`
- `learning-round`
- `learning-asset`
- `atlas-node`
- `atlas-edge`
- `manifest`

The JSON Schemas are generated from the Zod definitions in `server/src/schemas.ts` by `server/src/export-schemas.ts`. Do not hand-edit generated entity schemas; update the Zod model and regenerate them.

Regenerate:

```bash
cd server
npx esbuild src/export-schemas.ts --bundle --platform=node --format=esm --target=node20 --outfile=/tmp/ioayn-export-schemas.mjs
node /tmp/ioayn-export-schemas.mjs ../schemas
```

`common.schema.json` is a human-facing index of shared primitive concepts. The generated entity schemas are self-contained and are the files used for external integration.
