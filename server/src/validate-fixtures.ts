import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atlasEdgeSchema,
  atlasNodeSchema,
  conversationTurnSchema,
  evidenceSchema,
  goalSchema,
  learningAssetSchema,
  manifestSchema,
  roundSchema,
  sessionSchema,
  sliceSchema,
  unknownSchema,
} from "./schemas.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseDirectory(path: string, parser: { parse(value: unknown): unknown }): unknown[] {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parser.parse(readJson(join(path, name))));
}

const templates = join(root, "skills", "learn-code", "templates");
goalSchema.parse(readJson(join(templates, "learning-goal.template.json")));
sliceSchema.parse(readJson(join(templates, "learning-slice.template.json")));
roundSchema.parse(readJson(join(templates, "learning-round.template.json")));
learningAssetSchema.parse(readJson(join(templates, "learning-asset.template.json")));
atlasNodeSchema.parse(readJson(join(templates, "atlas-node.template.json")));
atlasEdgeSchema.parse(readJson(join(templates, "atlas-edge.template.json")));

const sample = join(root, "examples", "sample-assets", ".ioayn");
manifestSchema.parse(readJson(join(sample, "manifest.json")));
const goals = parseDirectory(join(sample, "goals"), goalSchema) as Array<{ id: string }>;
const slices = parseDirectory(join(sample, "slices"), sliceSchema) as Array<{ id: string }>;
const evidence = parseDirectory(join(sample, "evidence"), evidenceSchema) as Array<{ id: string }>;
const unknowns = parseDirectory(join(sample, "unknowns"), unknownSchema) as Array<{ id: string }>;
const sessions = parseDirectory(join(sample, "sessions"), sessionSchema) as Array<{ id: string }>;
const rounds = parseDirectory(join(sample, "rounds"), roundSchema) as Array<{ id: string }>;
const assets = parseDirectory(join(sample, "assets"), learningAssetSchema) as Array<{
  id: string;
  source_turn_refs: string[];
}>;
const nodes = parseDirectory(join(sample, "atlas", "nodes"), atlasNodeSchema) as Array<{ id: string }>;
const edges = parseDirectory(join(sample, "atlas", "edges"), atlasEdgeSchema) as Array<{ from: string; to: string }>;

const turns: Array<{ id: string }> = [];
const journalDir = join(sample, "journal");
if (existsSync(journalDir)) {
  for (const name of readdirSync(journalDir).filter((item) => item.endsWith(".jsonl"))) {
    const lines = readFileSync(join(journalDir, name), "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) turns.push(conversationTurnSchema.parse(JSON.parse(line)));
  }
}

const ids = {
  goals: new Set(goals.map((item) => item.id)),
  slices: new Set(slices.map((item) => item.id)),
  evidence: new Set(evidence.map((item) => item.id)),
  unknowns: new Set(unknowns.map((item) => item.id)),
  sessions: new Set(sessions.map((item) => item.id)),
  rounds: new Set(rounds.map((item) => item.id)),
  assets: new Set(assets.map((item) => item.id)),
  nodes: new Set(nodes.map((item) => item.id)),
  turns: new Set(turns.map((item) => item.id)),
};

if (!ids.goals.size || !ids.slices.size || !ids.sessions.size || !ids.rounds.size || !ids.assets.size || !ids.nodes.size) {
  throw new Error("v1.1 sample must contain the complete persistent learning model");
}
for (const edge of edges) {
  if (!ids.nodes.has(edge.from) || !ids.nodes.has(edge.to)) throw new Error(`sample Atlas edge has missing endpoint: ${edge.from} -> ${edge.to}`);
}
for (const asset of assets) {
  if (!asset.source_turn_refs.length) throw new Error(`sample learning asset has no conversation provenance: ${asset.id}`);
  for (const turnId of asset.source_turn_refs) {
    if (!ids.turns.has(turnId)) throw new Error(`sample learning asset references missing turn: ${turnId}`);
  }
}

console.log("IOAYN v1.1 schema and fixture validation passed");
