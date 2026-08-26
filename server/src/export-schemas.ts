import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  goalSchema,
  sliceSchema,
  evidenceSchema,
  unknownSchema,
  sessionSchema,
  conversationTurnSchema,
  roundSchema,
  learningAssetSchema,
  atlasNodeSchema,
  atlasEdgeSchema,
  manifestSchema,
} from "./core/schemas.js";

const out = resolve(process.argv[2] || "../schemas");
mkdirSync(out, { recursive: true });
const schemas = {
  "learning-goal": goalSchema,
  "learning-slice": sliceSchema,
  evidence: evidenceSchema,
  unknown: unknownSchema,
  "learning-session": sessionSchema,
  "conversation-turn": conversationTurnSchema,
  "learning-round": roundSchema,
  "learning-asset": learningAssetSchema,
  "atlas-node": atlasNodeSchema,
  "atlas-edge": atlasEdgeSchema,
  manifest: manifestSchema,
};
for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  json.$id = `urn:ioayn:schema:${name}:1.1`;
  json.title = name
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  writeFileSync(resolve(out, `${name}.schema.json`), `${JSON.stringify(json, null, 2)}\n`);
}
