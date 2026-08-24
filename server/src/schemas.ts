import { z } from "zod";
import {
  ABSTRACTION_LEVELS,
  ATLAS_EDGE_TYPES,
  ATLAS_NODE_TYPES,
  CLAIM_TYPES,
  CONFIDENCE_LEVELS,
  SCHEMA_VERSION,
  UNKNOWN_CLASSIFICATIONS,
} from "./constants.js";

export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);
export const timestampSchema = z.string().datetime();
export const abstractionLevelSchema = z.enum(ABSTRACTION_LEVELS);
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export const claimTypeSchema = z.enum(CLAIM_TYPES);
export const unknownClassificationSchema = z.enum(UNKNOWN_CLASSIFICATIONS);

export const revisionSchema = z.object({
  branch: z.string().min(1),
  commit: z.string().min(7),
  dirty: z.boolean(),
});

export const sourceSchema = z.object({
  path: z.string().optional(),
  symbol: z.string().optional(),
  lines: z.string().optional(),
  command: z.string().optional(),
  artifact: z.string().optional(),
  observation: z.string().optional(),
});

export const roleEntitySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.string().min(1).default("code_entity"),
  role: z.string().min(1),
  input: z.string().optional(),
  action: z.string().optional(),
  output: z.string().optional(),
  source: sourceSchema.optional(),
  map: z.boolean().default(false),
});

export const participantSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.string().optional(),
  role: z.string().min(1),
  input: z
    .object({
      producer: z.string().optional(),
      type: z.string().optional(),
      meaning: z.string().optional(),
      preconditions: z.array(z.string()).optional(),
    })
    .optional(),
  reads: z.array(z.string()).optional(),
  transformations: z.array(z.string()).optional(),
  output: z
    .object({
      consumer: z.string().optional(),
      type: z.string().optional(),
      meaning: z.string().optional(),
    })
    .optional(),
  writes: z.array(z.string()).optional(),
  side_effects: z.array(z.string()).optional(),
  failures: z.array(z.string()).optional(),
  source: sourceSchema.optional(),
});

export const flowEdgeSchema = z.object({
  from: idSchema,
  to: idSchema,
  relation: z.enum([
    "calls",
    "produces",
    "consumes",
    "transforms",
    "reads",
    "writes",
    "publishes",
    "receives",
    "transitions",
    "returns",
    "fails_to",
  ]),
  data: z.string().optional(),
  condition: z.string().optional(),
  evidence_refs: z.array(idSchema).optional(),
});

export const claimSchema = z.object({
  id: idSchema,
  type: claimTypeSchema,
  text: z.string().min(1),
  confidence: confidenceSchema,
  evidence_refs: z.array(idSchema).default([]),
  basis_refs: z.array(idSchema).default([]),
  limitations: z.array(z.string()).default([]),
});

export const checkpointSchema = z.object({
  id: idSchema,
  level: abstractionLevelSchema,
  difficulty: z.enum(["foundation", "current_level", "stretch"]).default("current_level"),
  question: z.string().min(1),
  expected_elements: z.array(z.string()).default([]),
  user_answer: z.string().optional(),
  assessment: z.enum(["not_asked", "pending", "passed", "needs_repair"]).default("not_asked"),
  feedback: z.string().optional(),
});

export const goalSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  project_id: idSchema,
  title: z.string().min(1).max(160),
  target: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1).max(8),
  scope: z.object({ include: z.array(z.string()), exclude: z.array(z.string()) }),
  entry_hypotheses: z.array(z.string()).default([]),
  done_when: z.array(z.string().min(1)).min(1),
  mode: z.enum(["guided", "survey", "deep_dive", "reference"]).default("guided"),
  abstraction: z.object({
    start_level: abstractionLevelSchema,
    target_level: abstractionLevelSchema,
    current_level: abstractionLevelSchema,
  }),
  status: z.enum(["active", "paused", "completed", "abandoned"]),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const sliceSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  goal_id: idSchema,
  title: z.string().min(1).max(160),
  question: z.string().min(1),
  abstraction_level: abstractionLevelSchema,
  stage: z.enum([
    "goal_defined",
    "entry_discovered",
    "boundary_modeled",
    "flow_traced",
    "unknowns_classified",
    "details_expanded",
    "runtime_verified",
    "user_checked",
    "completed",
  ]),
  observable_anchor: z
    .object({ kind: z.string().optional(), description: z.string().optional(), location: z.string().optional() })
    .optional(),
  boundary: z.object({ inside: z.array(z.string()), outside: z.array(z.string()) }),
  participants: z.array(participantSchema).min(1).max(30),
  flow: z.object({ nodes: z.array(idSchema).min(1).max(30), edges: z.array(flowEdgeSchema) }),
  state_changes: z.array(z.string()).default([]),
  side_effects: z.array(z.string()).default([]),
  failure_paths: z.array(z.string()).default([]),
  introduced_entities: z.array(roleEntitySchema).default([]),
  evidence_refs: z.array(idSchema).default([]),
  unknown_refs: z.array(idSchema).default([]),
  round_refs: z.array(idSchema).default([]),
  checkpoint: checkpointSchema.optional(),
  summary: z.string().optional(),
  atlas_node_id: idSchema.optional(),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const evidenceSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  goal_id: idSchema,
  slice_id: idSchema.optional(),
  round_id: idSchema.optional(),
  claim: z.string().min(1),
  claim_type: claimTypeSchema,
  kind: z.enum(["source", "test", "runtime_trace", "log", "network", "database", "git", "documentation"]),
  source: sourceSchema.refine((value) => Object.keys(value).length > 0, "source needs at least one field"),
  confidence: confidenceSchema,
  basis_refs: z.array(idSchema).default([]),
  limitations: z.array(z.string()).default([]),
  revision: revisionSchema,
  verified_at: timestampSchema,
});

export const unknownSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  goal_id: idSchema,
  slice_id: idSchema.optional(),
  round_id: idSchema.optional(),
  description: z.string().min(1),
  classification: unknownClassificationSchema,
  why_it_matters: z.string().min(1),
  current_assumption: z.string().optional(),
  confidence: confidenceSchema.default("low"),
  resolution_plan: z.array(z.string()).default([]),
  future_topic: z.string().optional(),
  status: z.enum(["open", "investigating", "resolved", "accepted_limitation"]),
  resolution: z.object({ answer: z.string().optional(), evidence_refs: z.array(idSchema).default([]) }).optional(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const sessionSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  project_id: idSchema,
  goal_id: idSchema.optional(),
  slice_id: idSchema.optional(),
  title: z.string().min(1).max(160),
  initial_prompt: z.string().min(1),
  mode: z.enum(["persistent", "degraded"]),
  status: z.enum(["active", "paused", "completed"]),
  external_session_ids: z.array(z.string()).default([]),
  capture: z.object({ enabled: z.boolean(), journal_path: z.string() }),
  current_round_id: idSchema.optional(),
  current_abstraction_level: abstractionLevelSchema,
  revision: revisionSchema,
  started_at: timestampSchema,
  updated_at: timestampSchema,
  ended_at: timestampSchema.optional(),
});

export const conversationTurnSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  session_id: idSchema,
  round_id: idSchema.optional(),
  external_session_id: z.string().optional(),
  actor: z.enum(["user", "agent", "tool", "system"]),
  kind: z.enum([
    "prompt",
    "teaching",
    "checkpoint",
    "answer",
    "tool_observation",
    "compact_summary",
    "event",
  ]),
  content: z.string(),
  related_entities: z.array(idSchema).default([]),
  related_assets: z.array(idSchema).default([]),
  created_at: timestampSchema,
});

export const learningAssetSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  goal_id: idSchema,
  slice_id: idSchema,
  type: z.enum([
    "flow_understanding",
    "contract",
    "concept",
    "decision",
    "error_path",
    "state_model",
    "architecture_fragment",
  ]),
  title: z.string().min(1).max(180),
  question: z.string().min(1),
  body_markdown: z.string().min(1),
  source_turn_refs: z.array(idSchema).default([]),
  context: z.object({ system_area: z.string().min(1), abstraction_level: abstractionLevelSchema }),
  input: z.object({ source: z.string().optional(), type: z.string().optional(), meaning: z.string().optional() }).optional(),
  output: z.object({ consumer: z.string().optional(), type: z.string().optional(), meaning: z.string().optional() }).optional(),
  key_entities: z.array(roleEntitySchema).default([]),
  concepts: z.array(z.string().min(1)).default([]),
  claims: z.array(claimSchema).default([]),
  evidence_refs: z.array(idSchema).default([]),
  unknown_refs: z.array(idSchema).default([]),
  learned_from: z.object({ session_id: idSchema, round_id: idSchema }),
  atlas_node_id: idSchema,
  status: z.enum(["draft", "verified", "revised", "superseded"]),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const atlasNodeSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  type: z.enum(ATLAS_NODE_TYPES),
  label: z.string().min(1).max(180),
  description: z.string().default(""),
  ref_type: z.enum(["goal", "slice", "learning_asset", "concept", "code_entity", "system_area", "none"]),
  ref_id: idSchema.optional(),
  system_area: z.string().optional(),
  status: z.object({
    model: z.enum(["observed", "modeled", "verified", "revised"]),
    connection: z.enum(["isolated", "connected"]),
    freshness: z.enum(["current", "stale", "unknown"]),
    unknowns: z.enum(["open", "clear"]),
  }),
  tags: z.array(z.string()).default([]),
  evidence_refs: z.array(idSchema).default([]),
  unknown_refs: z.array(idSchema).default([]),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const atlasEdgeSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  from: idSchema,
  to: idSchema,
  relation: z.enum(ATLAS_EDGE_TYPES),
  label: z.string().optional(),
  confidence: confidenceSchema,
  evidence_refs: z.array(idSchema).default([]),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const roundSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  id: idSchema,
  session_id: idSchema,
  goal_id: idSchema,
  slice_id: idSchema,
  index: z.number().int().positive(),
  abstraction_level: abstractionLevelSchema,
  active_question: z.string().min(1),
  summary: z.string().min(1),
  user_turn_refs: z.array(idSchema).default([]),
  agent_turn_refs: z.array(idSchema).default([]),
  introduced_entities: z.array(roleEntitySchema).max(12).default([]),
  claims: z.array(claimSchema).default([]),
  evidence_refs: z.array(idSchema).default([]),
  unknown_refs: z.array(idSchema).default([]),
  checkpoint: checkpointSchema.optional(),
  learning_asset_id: idSchema.optional(),
  atlas_node_refs: z.array(idSchema).default([]),
  atlas_edge_refs: z.array(idSchema).default([]),
  next_actions: z.array(z.string()).default([]),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const manifestSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  project_id: idSchema,
  project_root: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  current_goal_id: idSchema.nullable(),
  current_session_id: idSchema.nullable(),
  initialized_revision: z.object({
    branch: z.string(),
    commit: z.string(),
    dirty: z.boolean(),
    is_git_repository: z.boolean(),
    captured_at: timestampSchema,
  }),
  capabilities: z.object({
    persistent_memory: z.boolean(),
    automatic_journal_capture: z.boolean(),
    cognitive_atlas: z.boolean(),
    recoverable_round_commit: z.boolean(),
  }),
});

export const schemaMap = {
  goal: goalSchema,
  slice: sliceSchema,
  evidence: evidenceSchema,
  unknown: unknownSchema,
  session: sessionSchema,
  round: roundSchema,
  learning_asset: learningAssetSchema,
  atlas_node: atlasNodeSchema,
  atlas_edge: atlasEdgeSchema,
} as const;

export type Goal = z.infer<typeof goalSchema>;
export type Slice = z.infer<typeof sliceSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Unknown = z.infer<typeof unknownSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type LearningRound = z.infer<typeof roundSchema>;
export type LearningAsset = z.infer<typeof learningAssetSchema>;
export type AtlasNode = z.infer<typeof atlasNodeSchema>;
export type AtlasEdge = z.infer<typeof atlasEdgeSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
