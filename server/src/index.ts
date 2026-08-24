import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ABSTRACTION_LEVELS,
  ASSET_FOLDERS,
  ASSET_TYPES,
  ATLAS_EDGE_TYPES,
  ATLAS_NODE_TYPES,
  CLAIM_TYPES,
  CONFIDENCE_LEVELS,
  SCHEMA_VERSION,
  UNKNOWN_CLASSIFICATIONS,
  VERSION,
  type AssetType,
} from "./constants.js";
import {
  abstractionLevelSchema,
  atlasEdgeSchema,
  atlasNodeSchema,
  checkpointSchema,
  claimSchema,
  claimTypeSchema,
  confidenceSchema,
  conversationTurnSchema,
  evidenceSchema,
  flowEdgeSchema,
  goalSchema,
  idSchema,
  learningAssetSchema,
  participantSchema,
  roleEntitySchema,
  roundSchema,
  schemaMap,
  sessionSchema,
  sliceSchema,
  sourceSchema,
  unknownClassificationSchema,
  unknownSchema,
  type AtlasEdge,
  type AtlasNode,
  type Evidence,
  type Goal,
  type LearningAsset,
  type LearningRound,
  type Session,
  type Slice,
  type Unknown,
} from "./schemas.js";
import { WorkspaceStore } from "./storage.js";
import {
  buildAtlasProjection,
  ensureConcepts,
  ensureSystemAreaPath,
  findHistoricalConnections,
  healAtlas,
  linkSharedConcepts,
  makeEdgeId,
  upsertAtlasEdge,
  upsertAtlasNode,
} from "./atlas.js";

const rootDir = resolve(process.env.IOAYN_PROJECT_DIR || process.cwd());
const store = new WorkspaceStore(rootDir);

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function currentRevision() {
  return store.revision();
}

function requireCurrentWorkspace(): void {
  store.ensureWorkspace();
  const version = store.manifestVersion();
  if (version !== SCHEMA_VERSION) {
    throw new Error(`workspace schema ${version} requires migrate_workspace before v${SCHEMA_VERSION} tools can write assets`);
  }
}

function existingCreatedAt(type: AssetType, id: string): string {
  const current = store.getAsset(type, id) as { created_at?: string } | null;
  return current?.created_at || store.now();
}

function turnId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`.toLowerCase();
}

function appendTurn(input: {
  id?: string;
  sessionId: string;
  roundId?: string;
  externalSessionId?: string;
  actor: "user" | "agent" | "tool" | "system";
  kind: "prompt" | "teaching" | "checkpoint" | "answer" | "tool_observation" | "compact_summary" | "event";
  content: string;
  relatedEntities?: string[];
  relatedAssets?: string[];
}) {
  const parsed = conversationTurnSchema.parse({
    schema_version: SCHEMA_VERSION,
    id: input.id || turnId(`turn-${input.actor}`),
    session_id: input.sessionId,
    round_id: input.roundId,
    external_session_id: input.externalSessionId,
    actor: input.actor,
    kind: input.kind,
    content: input.content,
    related_entities: input.relatedEntities || [],
    related_assets: input.relatedAssets || [],
    created_at: store.now(),
  });
  store.appendConversationTurn(parsed);
  return parsed;
}

function migrateV10Asset(type: "goal" | "slice" | "evidence" | "unknown", raw: Record<string, unknown>) {
  const now = store.now();
  if (type === "goal") {
    return goalSchema.parse({
      ...raw,
      schema_version: SCHEMA_VERSION,
      abstraction: raw.abstraction || { start_level: "L1", target_level: "L3", current_level: "L1" },
      updated_at: raw.updated_at || now,
    });
  }
  if (type === "slice") {
    const oldCheckpoint = raw.checkpoint as Record<string, unknown> | undefined;
    const checkpoint = oldCheckpoint?.question
      ? {
          id: `${String(raw.id)}-checkpoint`.slice(0, 119),
          level: "L2",
          difficulty: "current_level",
          question: oldCheckpoint.question,
          expected_elements: oldCheckpoint.expected_elements || [],
          assessment: oldCheckpoint.status || "not_asked",
        }
      : undefined;
    const participants = Array.isArray(raw.participants) ? (raw.participants as Array<Record<string, unknown>>) : [];
    return sliceSchema.parse({
      ...raw,
      schema_version: SCHEMA_VERSION,
      abstraction_level: raw.abstraction_level || "L2",
      introduced_entities:
        raw.introduced_entities ||
        participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          kind: participant.kind || "code_entity",
          role: participant.role,
          input: (participant.input as Record<string, unknown> | undefined)?.meaning,
          action: Array.isArray(participant.transformations) ? participant.transformations.join("; ") : undefined,
          output: (participant.output as Record<string, unknown> | undefined)?.meaning,
          source: participant.source,
          map: false,
        })),
      state_changes: raw.state_changes || [],
      side_effects: raw.side_effects || [],
      failure_paths: raw.failure_paths || [],
      round_refs: raw.round_refs || [],
      checkpoint,
      updated_at: raw.updated_at || now,
    });
  }
  if (type === "evidence") {
    return evidenceSchema.parse({
      ...raw,
      schema_version: SCHEMA_VERSION,
      claim_type: raw.claim_type || "fact",
      basis_refs: raw.basis_refs || [],
      limitations: raw.limitations || [],
    });
  }
  return unknownSchema.parse({
    ...raw,
    schema_version: SCHEMA_VERSION,
    confidence: raw.confidence || "low",
    resolution_plan: raw.resolution_plan || [],
    updated_at: raw.updated_at || now,
  });
}

const server = new McpServer({ name: "ioayn", version: VERSION });

server.registerTool(
  "preflight_learning",
  {
    title: "Run IOAYN learning preflight",
    description:
      "Verify MCP persistence, workspace schema, Git revision, active session, and resumable context before a guided learning workflow starts.",
    inputSchema: z.object({}),
  },
  async () => {
    store.ensureWorkspace();
    const manifest = store.manifest();
    const schemaVersion = String(manifest.schema_version || "unknown");
    const currentSessionId = typeof manifest.current_session_id === "string" ? manifest.current_session_id : null;
    const currentGoalId = typeof manifest.current_goal_id === "string" ? manifest.current_goal_id : null;
    const sessions = (store.listAssets("session").session || []) as Session[];
    const latestSession = sessions.sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] || null;
    return textResult({
      mode: "persistent",
      mcp_connected: true,
      server_version: VERSION,
      workspace_schema_version: schemaVersion,
      migration_required: schemaVersion !== SCHEMA_VERSION,
      snapshot: store.getSnapshot(),
      current_session_id: currentSessionId,
      resumable_session_id: currentSessionId || latestSession?.id || null,
      current_goal_id: currentGoalId,
      capture_active: Boolean(store.getActiveSessionId()),
      knowledge_summary: store.knowledgeSummary(),
      next_required_action: schemaVersion === SCHEMA_VERSION ? "resume_or_start_session" : "migrate_workspace",
    });
  },
);

server.registerTool(
  "init_workspace",
  {
    title: "Initialize IOAYN workspace",
    description:
      "Create the project-local .ioayn knowledge workspace, private journal directories, cognitive atlas directories, and manifest. Product source files are never edited.",
    inputSchema: z.object({}),
  },
  async () => {
    store.ensureWorkspace();
    return textResult({ workspace: store.workspaceDir, manifest: store.manifest(), snapshot: store.getSnapshot() });
  },
);

server.registerTool(
  "migrate_workspace",
  {
    title: "Migrate IOAYN workspace to schema 1.1",
    description:
      "Back up and upgrade v1.0 goals, slices, evidence, unknowns, and manifest to v1.1. New persistent-memory and Atlas directories are created. The operation is idempotent.",
    inputSchema: z.object({}),
  },
  async () => {
    store.ensureWorkspace();
    const manifestPath = join(store.workspaceDir, "manifest.json");
    const manifest = store.manifest();
    const fromVersion = String(manifest.schema_version || "unknown");
    if (fromVersion === SCHEMA_VERSION) {
      const healed = healAtlas(store);
      return textResult({ migrated: false, reason: "already_current", schema_version: SCHEMA_VERSION, healed });
    }
    if (fromVersion !== "1.0") {
      throw new Error(`unsupported workspace schema for automatic migration: ${fromVersion}`);
    }

    const migratedCounts: Record<string, number> = { goal: 0, slice: 0, evidence: 0, unknown: 0 };
    store.backupFile(manifestPath);
    for (const type of ["goal", "slice", "evidence", "unknown"] as const) {
      const values = store.listAssets(type)[type] || [];
      for (const raw of values) {
        const id = String((raw as Record<string, unknown>).id);
        const path = store.assetPath(type, id);
        store.backupFile(path);
        store.atomicWriteJson(path, migrateV10Asset(type, raw as Record<string, unknown>));
        migratedCounts[type] += 1;
      }
    }
    const snapshot = store.getSnapshot();
    const nextManifest = {
      ...manifest,
      schema_version: SCHEMA_VERSION,
      current_session_id: null,
      updated_at: store.now(),
      capabilities: {
        persistent_memory: true,
        automatic_journal_capture: true,
        cognitive_atlas: true,
        recoverable_round_commit: true,
      },
      initialized_revision: {
        ...(manifest.initialized_revision as Record<string, unknown>),
        branch: snapshot.branch,
        commit: snapshot.commit,
        dirty: snapshot.dirty,
        is_git_repository: snapshot.is_git_repository,
        captured_at: snapshot.captured_at,
      },
    };
    store.atomicWriteJson(manifestPath, nextManifest);
    const healed = healAtlas(store);
    return textResult({ migrated: true, from: fromVersion, to: SCHEMA_VERSION, migrated_counts: migratedCounts, healed });
  },
);

server.registerTool(
  "project_snapshot",
  {
    title: "Get project and Git snapshot",
    description: "Return the canonical project root, Git branch, commit, and dirty-working-tree status used to anchor knowledge.",
    inputSchema: z.object({}),
  },
  async () => textResult(store.getSnapshot()),
);

server.registerTool(
  "create_goal",
  {
    title: "Create or update a learning goal",
    description:
      "Persist a bounded learning goal with explicit starting, target, and current abstraction levels, questions, scope, and completion criteria.",
    inputSchema: z.object({
      id: idSchema.optional(),
      title: z.string().min(1).max(160),
      target: z.string().min(1),
      questions: z.array(z.string().min(1)).min(1).max(8),
      include: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
      entryHypotheses: z.array(z.string()).default([]),
      doneWhen: z.array(z.string().min(1)).min(1),
      mode: z.enum(["guided", "survey", "deep_dive", "reference"]).default("guided"),
      startLevel: abstractionLevelSchema.default("L1"),
      targetLevel: abstractionLevelSchema.default("L3"),
      currentLevel: abstractionLevelSchema.optional(),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const snapshot = store.getSnapshot();
    const manifest = store.manifest();
    const id = input.id || store.slug(input.title);
    const goal = goalSchema.parse({
      schema_version: SCHEMA_VERSION,
      id,
      project_id: String(manifest.project_id),
      title: input.title,
      target: input.target,
      questions: input.questions,
      scope: { include: input.include, exclude: input.exclude },
      entry_hypotheses: input.entryHypotheses,
      done_when: input.doneWhen,
      mode: input.mode,
      abstraction: {
        start_level: input.startLevel,
        target_level: input.targetLevel,
        current_level: input.currentLevel || input.startLevel,
      },
      status: "active",
      revision: store.revision(snapshot),
      created_at: existingCreatedAt("goal", id),
      updated_at: store.now(),
    });
    store.saveAsset("goal", goal);
    store.updateManifest({ current_goal_id: id });
    return textResult(goal);
  },
);

server.registerTool(
  "save_slice",
  {
    title: "Save a bounded learning slice",
    description:
      "Persist a producer-to-consumer learning slice with abstraction level, contextual roles for every participant, flow, evidence, unknowns, and checkpoint.",
    inputSchema: z.object({
      id: idSchema,
      goalId: idSchema,
      title: z.string().min(1).max(160),
      question: z.string().min(1),
      abstractionLevel: abstractionLevelSchema,
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
      observableAnchor: z
        .object({ kind: z.string().optional(), description: z.string().optional(), location: z.string().optional() })
        .optional(),
      insideBoundary: z.array(z.string()).default([]),
      outsideBoundary: z.array(z.string()).default([]),
      participants: z.array(participantSchema).min(1).max(30),
      nodes: z.array(idSchema).min(1).max(30),
      edges: z.array(flowEdgeSchema).default([]),
      stateChanges: z.array(z.string()).default([]),
      sideEffects: z.array(z.string()).default([]),
      failurePaths: z.array(z.string()).default([]),
      introducedEntities: z.array(roleEntitySchema).max(12).default([]),
      evidenceRefs: z.array(idSchema).default([]),
      unknownRefs: z.array(idSchema).default([]),
      roundRefs: z.array(idSchema).default([]),
      checkpoint: checkpointSchema.optional(),
      summary: z.string().optional(),
      atlasNodeId: idSchema.optional(),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const participantIds = new Set(input.participants.map((participant) => participant.id));
    for (const node of input.nodes) {
      if (!participantIds.has(node)) throw new Error(`flow node is not a participant: ${node}`);
    }
    const value = sliceSchema.parse({
      schema_version: SCHEMA_VERSION,
      id: input.id,
      goal_id: input.goalId,
      title: input.title,
      question: input.question,
      abstraction_level: input.abstractionLevel,
      stage: input.stage,
      observable_anchor: input.observableAnchor,
      boundary: { inside: input.insideBoundary, outside: input.outsideBoundary },
      participants: input.participants,
      flow: { nodes: input.nodes, edges: input.edges },
      state_changes: input.stateChanges,
      side_effects: input.sideEffects,
      failure_paths: input.failurePaths,
      introduced_entities: input.introducedEntities,
      evidence_refs: input.evidenceRefs,
      unknown_refs: input.unknownRefs,
      round_refs: input.roundRefs,
      checkpoint: input.checkpoint,
      summary: input.summary,
      atlas_node_id: input.atlasNodeId,
      revision: currentRevision(),
      created_at: existingCreatedAt("slice", input.id),
      updated_at: store.now(),
    });
    store.saveAsset("slice", value);
    return textResult({
      persisted: true,
      slice: { id: value.id, title: value.title, stage: value.stage, abstraction_level: value.abstraction_level },
      counts: {
        participants: value.participants.length,
        flow_nodes: value.flow.nodes.length,
        flow_edges: value.flow.edges.length,
      },
    });
  },
);

server.registerTool(
  "record_evidence",
  {
    title: "Record typed learning evidence",
    description:
      "Record a fact, inference, unknown, or conflict with confidence, source/runtime evidence, basis references, limitations, and Git revision.",
    inputSchema: z.object({
      id: idSchema.optional(),
      goalId: idSchema,
      sliceId: idSchema.optional(),
      roundId: idSchema.optional(),
      claim: z.string().min(1),
      claimType: claimTypeSchema,
      kind: z.enum(["source", "test", "runtime_trace", "log", "network", "database", "git", "documentation"]),
      source: sourceSchema.refine((value) => Object.keys(value).length > 0, "source needs at least one field"),
      confidence: confidenceSchema,
      basisRefs: z.array(idSchema).default([]),
      limitations: z.array(z.string()).default([]),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const id = input.id || `evidence-${randomUUID().slice(0, 8)}`;
    const value = evidenceSchema.parse({
      schema_version: SCHEMA_VERSION,
      id,
      goal_id: input.goalId,
      slice_id: input.sliceId,
      round_id: input.roundId,
      claim: input.claim,
      claim_type: input.claimType,
      kind: input.kind,
      source: input.source,
      confidence: input.confidence,
      basis_refs: input.basisRefs,
      limitations: input.limitations,
      revision: currentRevision(),
      verified_at: store.now(),
    });
    store.saveAsset("evidence", value);
    return textResult(value);
  },
);

server.registerTool(
  "record_unknown",
  {
    title: "Record or update an unknown",
    description:
      "Track a blocking, non-blocking, or deferred unknown with explicit confidence and a resolution plan without indiscriminate drill-down.",
    inputSchema: z.object({
      id: idSchema.optional(),
      goalId: idSchema,
      sliceId: idSchema.optional(),
      roundId: idSchema.optional(),
      description: z.string().min(1),
      classification: unknownClassificationSchema,
      whyItMatters: z.string().min(1),
      currentAssumption: z.string().optional(),
      confidence: confidenceSchema.default("low"),
      resolutionPlan: z.array(z.string()).default([]),
      futureTopic: z.string().optional(),
      status: z.enum(["open", "investigating", "resolved", "accepted_limitation"]).default("open"),
      resolution: z.object({ answer: z.string().optional(), evidence_refs: z.array(idSchema).default([]) }).optional(),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const id = input.id || `unknown-${randomUUID().slice(0, 8)}`;
    const value = unknownSchema.parse({
      schema_version: SCHEMA_VERSION,
      id,
      goal_id: input.goalId,
      slice_id: input.sliceId,
      round_id: input.roundId,
      description: input.description,
      classification: input.classification,
      why_it_matters: input.whyItMatters,
      current_assumption: input.currentAssumption,
      confidence: input.confidence,
      resolution_plan: input.resolutionPlan,
      future_topic: input.futureTopic,
      status: input.status,
      resolution: input.resolution,
      created_at: existingCreatedAt("unknown", id),
      updated_at: store.now(),
    });
    store.saveAsset("unknown", value);
    return textResult(value);
  },
);

server.registerTool(
  "start_learning_session",
  {
    title: "Start persistent learning memory",
    description:
      "Start an opt-in learning session, save the initial user prompt, enable automatic Claude Code hook capture, and bind the session to the current revision.",
    inputSchema: z.object({
      id: idSchema.optional(),
      title: z.string().min(1).max(160),
      initialPrompt: z.string().min(1),
      goalId: idSchema.optional(),
      sliceId: idSchema.optional(),
      abstractionLevel: abstractionLevelSchema.default("L1"),
      externalSessionId: z.string().optional(),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const manifest = store.manifest();
    const id = input.id || `session-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    if (store.getAsset("session", id)) {
      throw new Error(`session already exists: ${id}; use resume_learning_session`);
    }
    const session = sessionSchema.parse({
      schema_version: SCHEMA_VERSION,
      id,
      project_id: String(manifest.project_id),
      goal_id: input.goalId,
      slice_id: input.sliceId,
      title: input.title,
      initial_prompt: input.initialPrompt,
      mode: "persistent",
      status: "active",
      external_session_ids: input.externalSessionId ? [input.externalSessionId] : [],
      capture: { enabled: true, journal_path: `.ioayn/journal/${id}.jsonl` },
      current_abstraction_level: input.abstractionLevel,
      revision: currentRevision(),
      started_at: store.now(),
      updated_at: store.now(),
    });
    store.saveAsset("session", session);
    store.setActiveSession(id);
    const initialTurn = appendTurn({
      id: `${id}-initial-user`.slice(0, 119),
      sessionId: id,
      externalSessionId: input.externalSessionId,
      actor: "user",
      kind: "prompt",
      content: input.initialPrompt,
    });
    return textResult({ session, initial_turn: initialTurn, automatic_capture: "enabled_after_this_tool_call" });
  },
);

server.registerTool(
  "resume_learning_session",
  {
    title: "Resume persistent learning memory",
    description:
      "Reactivate an existing paused or completed IOAYN learning session, preserve its journal and round history, bind an optional new Claude session id, and re-enable opt-in hook capture.",
    inputSchema: z.object({
      sessionId: idSchema,
      externalSessionId: z.string().optional(),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const current = store.getAsset("session", input.sessionId) as Session | null;
    if (!current) throw new Error(`session not found: ${input.sessionId}`);
    const externalIds = new Set(current.external_session_ids);
    if (input.externalSessionId) externalIds.add(input.externalSessionId);
    const next = sessionSchema.parse({
      ...current,
      status: "active",
      external_session_ids: [...externalIds],
      capture: { ...current.capture, enabled: true },
      revision: currentRevision(),
      updated_at: store.now(),
      ended_at: undefined,
    });
    store.saveAsset("session", next);
    store.setActiveSession(input.sessionId);
    const event = appendTurn({
      id: `${input.sessionId}-resume-${Date.now().toString(36)}`.slice(0, 119),
      sessionId: input.sessionId,
      roundId: current.current_round_id,
      externalSessionId: input.externalSessionId,
      actor: "system",
      kind: "event",
      content: `Resumed learning session ${input.sessionId}.`,
      relatedAssets: current.current_round_id
        ? [
            ((store.getAsset("round", current.current_round_id) as LearningRound | null)?.learning_asset_id || ""),
          ].filter(Boolean)
        : [],
    });
    return textResult({ session: next, resume_event: event, automatic_capture: "enabled" });
  },
);

server.registerTool(
  "append_conversation_turn",
  {
    title: "Append a learning conversation turn",
    description:
      "Explicitly append user, agent, tool, or system content to the session journal. This complements automatic hook capture and is useful for structured checkpoints or tool observations.",
    inputSchema: z.object({
      id: idSchema.optional(),
      sessionId: idSchema,
      roundId: idSchema.optional(),
      externalSessionId: z.string().optional(),
      actor: z.enum(["user", "agent", "tool", "system"]),
      kind: z.enum(["prompt", "teaching", "checkpoint", "answer", "tool_observation", "compact_summary", "event"]),
      content: z.string(),
      relatedEntities: z.array(idSchema).default([]),
      relatedAssets: z.array(idSchema).default([]),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    if (!store.getAsset("session", input.sessionId)) throw new Error(`session not found: ${input.sessionId}`);
    return textResult(appendTurn(input));
  },
);

server.registerTool(
  "list_session_turns",
  {
    title: "Read a learning conversation journal",
    description: "Return the chronological user, agent, tool, checkpoint, compact-summary, and lifecycle turns for one learning session.",
    inputSchema: z.object({ sessionId: idSchema, limit: z.number().int().positive().max(500).default(100) }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const turns = store.listConversationTurns(input.sessionId);
    return textResult({ session_id: input.sessionId, total: turns.length, turns: turns.slice(-input.limit) });
  },
);

server.registerTool(
  "finish_learning_session",
  {
    title: "Finish or pause a learning session",
    description: "Close automatic capture and mark a persistent learning session completed or paused without deleting its journal or assets.",
    inputSchema: z.object({ sessionId: idSchema, status: z.enum(["paused", "completed"]).default("completed") }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const current = store.getAsset("session", input.sessionId) as Session | null;
    if (!current) throw new Error(`session not found: ${input.sessionId}`);
    const next = sessionSchema.parse({
      ...current,
      status: input.status,
      updated_at: store.now(),
      ended_at: input.status === "completed" ? store.now() : current.ended_at,
    });
    store.saveAsset("session", next);
    const round = current.current_round_id
      ? (store.getAsset("round", current.current_round_id) as LearningRound | null)
      : null;
    const event = appendTurn({
      id: `${input.sessionId}-${input.status}-${Date.now().toString(36)}`.slice(0, 119),
      sessionId: input.sessionId,
      roundId: current.current_round_id,
      actor: "system",
      kind: "event",
      content: `${input.status === "completed" ? "Completed" : "Paused"} learning session ${input.sessionId}.`,
      relatedAssets: round?.learning_asset_id ? [round.learning_asset_id] : [],
    });
    if (store.getActiveSessionId() === input.sessionId) store.setActiveSession(null);
    return textResult({ session: next, lifecycle_event: event });
  },
);

const evidenceCommitInput = z.object({
  id: idSchema.optional(),
  claim: z.string().min(1),
  claimType: claimTypeSchema,
  kind: z.enum(["source", "test", "runtime_trace", "log", "network", "database", "git", "documentation"]),
  source: sourceSchema.refine((value) => Object.keys(value).length > 0, "source needs at least one field"),
  confidence: confidenceSchema,
  basisRefs: z.array(idSchema).default([]),
  limitations: z.array(z.string()).default([]),
});

const unknownCommitInput = z.object({
  id: idSchema.optional(),
  description: z.string().min(1),
  classification: unknownClassificationSchema,
  whyItMatters: z.string().min(1),
  currentAssumption: z.string().optional(),
  confidence: confidenceSchema.default("low"),
  resolutionPlan: z.array(z.string()).default([]),
  futureTopic: z.string().optional(),
  status: z.enum(["open", "investigating", "resolved", "accepted_limitation"]).default("open"),
});

const learningAssetCommitInput = z.object({
  id: idSchema.optional(),
  type: z.enum(["flow_understanding", "contract", "concept", "decision", "error_path", "state_model", "architecture_fragment"]),
  title: z.string().min(1).max(180),
  question: z.string().min(1),
  bodyMarkdown: z.string().min(1),
  systemArea: z.string().min(1),
  input: z.object({ source: z.string().optional(), type: z.string().optional(), meaning: z.string().optional() }).optional(),
  output: z.object({ consumer: z.string().optional(), type: z.string().optional(), meaning: z.string().optional() }).optional(),
  concepts: z.array(z.string().min(1)).default([]),
  status: z.enum(["draft", "verified", "revised", "superseded"]).default("draft"),
});

server.registerTool(
  "commit_learning_round",
  {
    title: "Commit a complete IOAYN learning round",
    description:
      "Idempotently persist one teaching round, typed claims, evidence, unknowns, checkpoint, reusable knowledge asset, contextual entity roles, and bounded Cognitive Atlas updates. A recoverable transaction journal records the batch.",
    inputSchema: z.object({
      roundId: idSchema,
      sessionId: idSchema,
      goalId: idSchema,
      sliceId: idSchema,
      index: z.number().int().positive(),
      abstractionLevel: abstractionLevelSchema,
      activeQuestion: z.string().min(1),
      summary: z.string().min(1),
      introducedEntities: z.array(roleEntitySchema).max(12).default([]),
      claims: z
        .array(
          z.object({
            id: idSchema.optional(),
            type: claimTypeSchema,
            text: z.string().min(1),
            confidence: confidenceSchema,
            evidenceRefs: z.array(idSchema).default([]),
            basisRefs: z.array(idSchema).default([]),
            limitations: z.array(z.string()).default([]),
          }),
        )
        .default([]),
      evidence: z.array(evidenceCommitInput).default([]),
      unknowns: z.array(unknownCommitInput).default([]),
      checkpoint: z
        .object({
          id: idSchema.optional(),
          level: abstractionLevelSchema,
          difficulty: z.enum(["foundation", "current_level", "stretch"]).default("current_level"),
          question: z.string().min(1),
          expectedElements: z.array(z.string()).default([]),
          userAnswer: z.string().optional(),
          assessment: z.enum(["not_asked", "pending", "passed", "needs_repair"]).default("not_asked"),
          feedback: z.string().optional(),
        })
        .optional(),
      userTurns: z.array(z.object({ id: idSchema.optional(), content: z.string(), kind: z.enum(["prompt", "answer"]).default("answer") })).default([]),
      agentTurns: z
        .array(z.object({ id: idSchema.optional(), content: z.string(), kind: z.enum(["teaching", "checkpoint"]).default("teaching") }))
        .default([]),
      learningAsset: learningAssetCommitInput.optional(),
      connections: z
        .array(
          z.object({
            targetNodeId: idSchema,
            relation: z.enum(ATLAS_EDGE_TYPES),
            label: z.string().optional(),
            confidence: confidenceSchema.default("medium"),
            evidenceRefs: z.array(idSchema).default([]),
          }),
        )
        .default([]),
      nextActions: z.array(z.string()).default([]),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const session = store.getAsset("session", input.sessionId) as Session | null;
    const goal = store.getAsset("goal", input.goalId) as Goal;
    const slice = store.getAsset("slice", input.sliceId) as Slice | null;
    if (!session) throw new Error(`session not found: ${input.sessionId}`);
    if (!goal) throw new Error(`goal not found: ${input.goalId}`);
    if (!slice) throw new Error(`slice not found: ${input.sliceId}`);

    const existingTransaction = store.getTransaction(input.roundId);
    if (existingTransaction?.status === "committed") {
      if (existingTransaction.payload_hash !== store.hashPayload(input)) {
        throw new Error(`round ${input.roundId} was already committed with a different payload`);
      }
      return textResult({
        ...(existingTransaction.result as Record<string, unknown>),
        idempotent_replay: true,
      });
    }

    const transactionPath = store.createTransaction("commit_learning_round", input.roundId, input);
    try {
      const revision = currentRevision();
      const userTurns = input.userTurns.map((turn, index) =>
        appendTurn({
          id: turn.id || `${input.roundId}-user-${index + 1}`,
          sessionId: input.sessionId,
          roundId: input.roundId,
          actor: "user",
          kind: turn.kind,
          content: turn.content,
        }),
      );
      const agentTurns = input.agentTurns.map((turn, index) =>
        appendTurn({
          id: turn.id || `${input.roundId}-agent-${index + 1}`,
          sessionId: input.sessionId,
          roundId: input.roundId,
          actor: "agent",
          kind: turn.kind,
          content: turn.content,
        }),
      );

      const evidence: Evidence[] = input.evidence.map((item, index) => {
        const id = item.id || `${input.roundId}-evidence-${index + 1}`;
        const value = evidenceSchema.parse({
          schema_version: SCHEMA_VERSION,
          id,
          goal_id: input.goalId,
          slice_id: input.sliceId,
          round_id: input.roundId,
          claim: item.claim,
          claim_type: item.claimType,
          kind: item.kind,
          source: item.source,
          confidence: item.confidence,
          basis_refs: item.basisRefs,
          limitations: item.limitations,
          revision,
          verified_at: store.now(),
        });
        return store.saveAsset("evidence", value) as Evidence;
      });

      const unknowns: Unknown[] = input.unknowns.map((item, index) => {
        const id = item.id || `${input.roundId}-unknown-${index + 1}`;
        const value = unknownSchema.parse({
          schema_version: SCHEMA_VERSION,
          id,
          goal_id: input.goalId,
          slice_id: input.sliceId,
          round_id: input.roundId,
          description: item.description,
          classification: item.classification,
          why_it_matters: item.whyItMatters,
          current_assumption: item.currentAssumption,
          confidence: item.confidence,
          resolution_plan: item.resolutionPlan,
          future_topic: item.futureTopic,
          status: item.status,
          created_at: existingCreatedAt("unknown", id),
          updated_at: store.now(),
        });
        return store.saveAsset("unknown", value) as Unknown;
      });

      const evidenceRefs = unique([
        ...evidence.map((item) => item.id),
        ...input.claims.flatMap((claim) => claim.evidenceRefs),
      ]);
      const unknownRefs = unique(unknowns.map((item) => item.id));
      const claims = input.claims.map((claim, index) =>
        claimSchema.parse({
          id: claim.id || `${input.roundId}-claim-${index + 1}`,
          type: claim.type,
          text: claim.text,
          confidence: claim.confidence,
          evidence_refs: claim.evidenceRefs,
          basis_refs: claim.basisRefs,
          limitations: claim.limitations,
        }),
      );
      const checkpoint = input.checkpoint
        ? checkpointSchema.parse({
            id: input.checkpoint.id || `${input.roundId}-checkpoint`,
            level: input.checkpoint.level,
            difficulty: input.checkpoint.difficulty,
            question: input.checkpoint.question,
            expected_elements: input.checkpoint.expectedElements,
            user_answer: input.checkpoint.userAnswer,
            assessment: input.checkpoint.assessment,
            feedback: input.checkpoint.feedback,
          })
        : undefined;

      const sliceNodeId = slice.atlas_node_id || `atlas-slice-${store.slug(input.sliceId)}`.slice(0, 119);
      const sliceNode = upsertAtlasNode(store, {
        id: sliceNodeId,
        type: "learning_slice",
        label: slice.title,
        description: slice.question,
        ref_type: "slice",
        ref_id: slice.id,
        status: {
          model: slice.stage === "runtime_verified" || slice.stage === "completed" ? "verified" : "modeled",
          connection: "connected",
          freshness: "current",
          unknowns: unknowns.some((item) => item.classification === "blocking" && item.status === "open") ? "open" : "clear",
        },
        tags: ["learning-slice", input.abstractionLevel],
        evidence_refs: evidenceRefs,
        unknown_refs: unknownRefs,
        revision,
      });

      let learningAsset: LearningAsset | undefined;
      const atlasNodes: AtlasNode[] = [sliceNode];
      const atlasEdges: AtlasEdge[] = [];
      let assetNodeId: string | undefined;

      if (input.learningAsset) {
        const assetId = input.learningAsset.id || `asset-${input.roundId}`;
        assetNodeId = `atlas-${store.slug(assetId)}`.slice(0, 119);
        learningAsset = learningAssetSchema.parse({
          schema_version: SCHEMA_VERSION,
          id: assetId,
          goal_id: input.goalId,
          slice_id: input.sliceId,
          type: input.learningAsset.type,
          title: input.learningAsset.title,
          question: input.learningAsset.question,
          body_markdown: input.learningAsset.bodyMarkdown,
          source_turn_refs: [...userTurns, ...agentTurns].map((turn) => turn.id),
          context: { system_area: input.learningAsset.systemArea, abstraction_level: input.abstractionLevel },
          input: input.learningAsset.input,
          output: input.learningAsset.output,
          key_entities: input.introducedEntities,
          concepts: input.learningAsset.concepts,
          claims,
          evidence_refs: evidenceRefs,
          unknown_refs: unknownRefs,
          learned_from: { session_id: input.sessionId, round_id: input.roundId },
          atlas_node_id: assetNodeId,
          status: input.learningAsset.status,
          revision,
          created_at: existingCreatedAt("learning_asset", assetId),
          updated_at: store.now(),
        });
        store.saveAsset("learning_asset", learningAsset);

        const area = ensureSystemAreaPath(store, input.learningAsset.systemArea, revision);
        atlasNodes.push(...area.nodes);
        atlasEdges.push(...area.edges);
        const assetNode = upsertAtlasNode(store, {
          id: assetNodeId,
          type: "learning_asset",
          label: learningAsset.title,
          description: learningAsset.question,
          ref_type: "learning_asset",
          ref_id: learningAsset.id,
          system_area: input.learningAsset.systemArea,
          status: {
            model: input.learningAsset.status === "verified" ? "verified" : input.learningAsset.status === "revised" ? "revised" : "modeled",
            connection: "connected",
            freshness: "current",
            unknowns: unknowns.some((item) => item.classification === "blocking" && item.status === "open") ? "open" : "clear",
          },
          tags: ["learning-asset", input.learningAsset.type, input.abstractionLevel],
          evidence_refs: evidenceRefs,
          unknown_refs: unknownRefs,
          revision,
        });
        atlasNodes.push(assetNode);
        const partOfArea = upsertAtlasEdge(store, {
          id: makeEdgeId(store, assetNodeId, "PART_OF", area.leafId),
          from: assetNodeId,
          to: area.leafId,
          relation: "PART_OF",
          label: "located in",
          confidence: "high",
          evidence_refs: evidenceRefs,
        });
        const learnedThrough = upsertAtlasEdge(store, {
          id: makeEdgeId(store, assetNodeId, "LEARNED_THROUGH", sliceNodeId),
          from: assetNodeId,
          to: sliceNodeId,
          relation: "LEARNED_THROUGH",
          label: "learned through",
          confidence: "high",
          evidence_refs: evidenceRefs,
        });
        atlasEdges.push(partOfArea, learnedThrough);
        const concepts = ensureConcepts(store, input.learningAsset.concepts, assetNodeId, revision);
        atlasNodes.push(...concepts.nodes);
        atlasEdges.push(...concepts.edges);
        atlasEdges.push(...linkSharedConcepts(store, assetNodeId, concepts.nodes.map((node) => node.id)));

        for (const entity of input.introducedEntities.filter((item) => item.map)) {
          const entityNodeId = `entity-${store.slug(entity.id)}`.slice(0, 119);
          const entityNode = upsertAtlasNode(store, {
            id: entityNodeId,
            type: "code_entity",
            label: entity.name,
            description: entity.role,
            ref_type: "code_entity",
            ref_id: entity.id,
            system_area: input.learningAsset.systemArea,
            status: { model: "modeled", connection: "connected", freshness: "current", unknowns: "clear" },
            tags: [entity.kind],
            evidence_refs: evidenceRefs,
            unknown_refs: [],
            revision,
          });
          const entityEdge = upsertAtlasEdge(store, {
            id: makeEdgeId(store, assetNodeId, "EXPLAINS", entityNodeId),
            from: assetNodeId,
            to: entityNodeId,
            relation: "EXPLAINS",
            label: "explains role of",
            confidence: "high",
            evidence_refs: evidenceRefs,
          });
          atlasNodes.push(entityNode);
          atlasEdges.push(entityEdge);
        }
      }

      const connectionSource = assetNodeId || sliceNodeId;
      for (const connection of input.connections) {
        if (!store.getAsset("atlas_node", connection.targetNodeId)) {
          throw new Error(`connection target atlas node not found: ${connection.targetNodeId}`);
        }
        atlasEdges.push(
          upsertAtlasEdge(store, {
            id: makeEdgeId(store, connectionSource, connection.relation, connection.targetNodeId),
            from: connectionSource,
            to: connection.targetNodeId,
            relation: connection.relation,
            label: connection.label,
            confidence: connection.confidence,
            evidence_refs: connection.evidenceRefs,
          }),
        );
      }

      const round = roundSchema.parse({
        schema_version: SCHEMA_VERSION,
        id: input.roundId,
        session_id: input.sessionId,
        goal_id: input.goalId,
        slice_id: input.sliceId,
        index: input.index,
        abstraction_level: input.abstractionLevel,
        active_question: input.activeQuestion,
        summary: input.summary,
        user_turn_refs: userTurns.map((turn) => turn.id),
        agent_turn_refs: agentTurns.map((turn) => turn.id),
        introduced_entities: input.introducedEntities,
        claims,
        evidence_refs: evidenceRefs,
        unknown_refs: unknownRefs,
        checkpoint,
        learning_asset_id: learningAsset?.id,
        atlas_node_refs: unique(atlasNodes.map((node) => node.id)),
        atlas_edge_refs: unique(atlasEdges.map((edge) => edge.id)),
        next_actions: input.nextActions,
        revision,
        created_at: existingCreatedAt("round", input.roundId),
        updated_at: store.now(),
      });
      store.saveAsset("round", round);
      const backfilledTurns = store.backfillJournalRoundIds(input.sessionId, input.roundId);
      const levelOrder = ABSTRACTION_LEVELS as readonly string[];
      const goalCurrentLevel = String(goal.abstraction.current_level);
      if (levelOrder.indexOf(input.abstractionLevel) > levelOrder.indexOf(goalCurrentLevel)) {
        store.saveAsset(
          "goal",
          goalSchema.parse({
            ...goal,
            abstraction: { ...goal.abstraction, current_level: input.abstractionLevel },
            updated_at: store.now(),
          }),
        );
      }

      const nextSlice = sliceSchema.parse({
        ...slice,
        abstraction_level: input.abstractionLevel,
        introduced_entities: uniqueById([...slice.introduced_entities, ...input.introducedEntities]),
        evidence_refs: unique([...slice.evidence_refs, ...evidenceRefs]),
        unknown_refs: unique([...slice.unknown_refs, ...unknownRefs]),
        round_refs: unique([...slice.round_refs, input.roundId]),
        checkpoint: checkpoint || slice.checkpoint,
        summary: input.summary,
        atlas_node_id: sliceNodeId,
        revision,
        updated_at: store.now(),
      });
      store.saveAsset("slice", nextSlice);

      const nextSession = sessionSchema.parse({
        ...session,
        goal_id: input.goalId,
        slice_id: input.sliceId,
        current_round_id: input.roundId,
        current_abstraction_level: input.abstractionLevel,
        updated_at: store.now(),
      });
      store.saveAsset("session", nextSession);
      store.updateManifest({ current_goal_id: input.goalId, current_session_id: input.sessionId });
      appendTurn({
        id: `${input.roundId}-commit-event`.slice(0, 119),
        sessionId: input.sessionId,
        roundId: input.roundId,
        actor: "system",
        kind: "event",
        content: `Committed learning round ${input.roundId}: ${input.summary}`,
        relatedEntities: input.introducedEntities.map((entity) => entity.id),
        relatedAssets: learningAsset ? [learningAsset.id] : [],
      });

      const result = {
        persisted: true,
        round: {
          id: round.id,
          index: round.index,
          abstraction_level: round.abstraction_level,
          checkpoint: checkpoint ? { id: checkpoint.id, assessment: checkpoint.assessment } : null,
        },
        learning_asset: learningAsset
          ? { id: learningAsset.id, title: learningAsset.title, status: learningAsset.status, atlas_node_id: assetNodeId }
          : null,
        counts: {
          introduced_entities: input.introducedEntities.length,
          claims: claims.length,
          evidence: evidence.length,
          unknowns: unknowns.length,
          user_turns: userTurns.length,
          agent_turns: agentTurns.length,
        },
        evidence_ids: evidenceRefs,
        unknown_ids: unknownRefs,
        journal_backfilled: backfilledTurns,
        atlas_update: {
          nodes: unique(atlasNodes.map((node) => node.id)),
          edges: unique(atlasEdges.map((edge) => edge.id)),
          focus_node_id: assetNodeId || sliceNodeId,
        },
      };
      store.finishTransaction(transactionPath, result);
      return textResult(result);
    } catch (error) {
      store.failTransaction(transactionPath, error);
      throw error;
    }
  },
);

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

server.registerTool(
  "upsert_atlas_node",
  {
    title: "Upsert a Cognitive Atlas node",
    description: "Create or update a bounded project-area, learning-slice, learning-asset, concept, or selectively exposed code-entity node.",
    inputSchema: z.object({
      id: idSchema,
      type: z.enum(ATLAS_NODE_TYPES),
      label: z.string().min(1).max(180),
      description: z.string().default(""),
      refType: z.enum(["goal", "slice", "learning_asset", "concept", "code_entity", "system_area", "none"]),
      refId: idSchema.optional(),
      systemArea: z.string().optional(),
      modelStatus: z.enum(["observed", "modeled", "verified", "revised"]).default("modeled"),
      connectionStatus: z.enum(["isolated", "connected"]).default("isolated"),
      freshness: z.enum(["current", "stale", "unknown"]).default("current"),
      unknownStatus: z.enum(["open", "clear"]).default("clear"),
      tags: z.array(z.string()).default([]),
      evidenceRefs: z.array(idSchema).default([]),
      unknownRefs: z.array(idSchema).default([]),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const node = upsertAtlasNode(store, {
      id: input.id,
      type: input.type,
      label: input.label,
      description: input.description,
      ref_type: input.refType,
      ref_id: input.refId,
      system_area: input.systemArea,
      status: {
        model: input.modelStatus,
        connection: input.connectionStatus,
        freshness: input.freshness,
        unknowns: input.unknownStatus,
      },
      tags: input.tags,
      evidence_refs: input.evidenceRefs,
      unknown_refs: input.unknownRefs,
      revision: currentRevision(),
    });
    return textResult(node);
  },
);

server.registerTool(
  "link_atlas_nodes",
  {
    title: "Link Cognitive Atlas nodes",
    description: "Create or update an evidence-aware semantic relationship between two existing Atlas nodes.",
    inputSchema: z.object({
      id: idSchema.optional(),
      from: idSchema,
      to: idSchema,
      relation: z.enum(ATLAS_EDGE_TYPES),
      label: z.string().optional(),
      confidence: confidenceSchema,
      evidenceRefs: z.array(idSchema).default([]),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    if (!store.getAsset("atlas_node", input.from)) throw new Error(`atlas node not found: ${input.from}`);
    if (!store.getAsset("atlas_node", input.to)) throw new Error(`atlas node not found: ${input.to}`);
    const edge = upsertAtlasEdge(store, {
      id: input.id || makeEdgeId(store, input.from, input.relation, input.to),
      from: input.from,
      to: input.to,
      relation: input.relation,
      label: input.label,
      confidence: input.confidence,
      evidence_refs: input.evidenceRefs,
    });
    return textResult(edge);
  },
);

server.registerTool(
  "build_atlas_projection",
  {
    title: "Build a bounded Cognitive Atlas projection",
    description:
      "Return a small structured and Mermaid map showing where the learned topic sits, how it connects to previous learning, shared concepts, or current knowledge gaps. Never returns an all-repository hairball.",
    inputSchema: z.object({
      focusNodeId: idSchema,
      view: z.enum(["location", "connections", "history", "concept", "gaps"]).default("connections"),
      maxDepth: z.number().int().min(1).max(4).default(2),
      maxNodes: z.number().int().min(3).max(30).default(12),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    return textResult(
      buildAtlasProjection(store, {
        focusNodeId: input.focusNodeId,
        view: input.view,
        maxDepth: input.maxDepth,
        maxNodes: input.maxNodes,
      }),
    );
  },
);

server.registerTool(
  "find_historical_connections",
  {
    title: "Find connections to prior learning",
    description:
      "Find earlier learning assets connected to the focus through shared concepts or explicit Atlas relationships, explaining why each connection exists.",
    inputSchema: z.object({ focusNodeId: idSchema, maxResults: z.number().int().min(1).max(30).default(10) }),
  },
  async (input) => {
    requireCurrentWorkspace();
    return textResult(findHistoricalConnections(store, input.focusNodeId, input.maxResults));
  },
);

server.registerTool(
  "resume_learning_context",
  {
    title: "Resume a persistent IOAYN learning context",
    description:
      "Restore the user's last goal, slice, abstraction level, recent journal turns, reusable knowledge assets, blocking unknowns, Atlas location, historical connections, and next paths.",
    inputSchema: z.object({ sessionId: idSchema.optional(), recentTurns: z.number().int().min(1).max(100).default(20) }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const manifest = store.manifest();
    const latestSession = ((store.listAssets("session").session || []) as Session[])
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] || null;
    const sessionId = input.sessionId
      || (typeof manifest.current_session_id === "string" ? manifest.current_session_id : null)
      || latestSession?.id
      || null;
    if (!sessionId) return textResult({ resumable: false, reason: "no_saved_session" });
    const session = store.getAsset("session", sessionId) as Session | null;
    if (!session) return textResult({ resumable: false, reason: "session_not_found", session_id: sessionId });
    const goal = session.goal_id ? (store.getAsset("goal", session.goal_id) as Goal | null) : null;
    const slice = session.slice_id ? (store.getAsset("slice", session.slice_id) as Slice | null) : null;
    const round = session.current_round_id ? (store.getAsset("round", session.current_round_id) as LearningRound | null) : null;
    const assets = (store.listAssets("learning_asset").learning_asset || []) as LearningAsset[];
    const relatedAssets = assets
      .filter((asset) => asset.goal_id === session.goal_id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 8);
    const unknowns = (store.listAssets("unknown").unknown || []) as Unknown[];
    const blockingUnknowns = unknowns.filter(
      (item) => item.goal_id === session.goal_id && item.classification === "blocking" && ["open", "investigating"].includes(item.status),
    );
    const turns = store.listConversationTurns(sessionId).slice(-input.recentTurns) as Array<{
      id: string;
      actor: string;
      kind: string;
      round_id?: string;
      created_at: string;
      content: string;
    }>;
    const focusNodeId = relatedAssets[0]?.atlas_node_id || slice?.atlas_node_id;
    const atlasLocation = focusNodeId
      ? buildAtlasProjection(store, { focusNodeId, view: "location", maxDepth: 3, maxNodes: 12 })
      : null;
    const historicalConnections = focusNodeId ? findHistoricalConnections(store, focusNodeId, 8) : null;
    const compactTurns = turns.map((turn: { id: string; actor: string; kind: string; round_id?: string; created_at: string; content: string }) => ({
      id: turn.id,
      actor: turn.actor,
      kind: turn.kind,
      round_id: turn.round_id ?? undefined,
      created_at: turn.created_at,
      content: turn.content.length > 400 ? `${turn.content.slice(0, 400)}…` : turn.content,
    }));
    return textResult({
      resumable: true,
      session: {
        id: session.id,
        title: session.title,
        goal_id: session.goal_id,
        status: session.status,
        current_round_id: session.current_round_id,
        current_abstraction_level: session.current_abstraction_level,
        started_at: session.started_at,
      },
      goal: goal
        ? { id: goal.id, title: goal.title, status: goal.status, abstraction: goal.abstraction, done_when: goal.done_when }
        : null,
      slice: slice
        ? { id: slice.id, title: slice.title, stage: slice.stage, abstraction_level: slice.abstraction_level }
        : null,
      current_round: round
        ? {
          id: round.id,
          index: round.index,
          abstraction_level: round.abstraction_level,
          summary: round.summary,
          checkpoint: round.checkpoint ? { assessment: round.checkpoint.assessment, question: round.checkpoint.question } : null,
          next_actions: round.next_actions,
        }
        : null,
      recent_turns: compactTurns,
      recent_assets: relatedAssets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        status: asset.status,
        atlas_node_id: asset.atlas_node_id,
        updated_at: asset.updated_at,
      })),
      blocking_unknowns: blockingUnknowns.map((item) => ({ id: item.id, description: item.description })),
      atlas_location: atlasLocation,
      historical_connections: historicalConnections,
      recommended_next_paths: round?.next_actions || [],
    });
  },
);

server.registerTool(
  "list_learning_assets",
  {
    title: "List persistent IOAYN assets",
    description: "List goals, slices, evidence, unknowns, sessions, rounds, reusable knowledge assets, and Atlas nodes/edges.",
    inputSchema: z.object({ type: z.enum(ASSET_TYPES).optional() }),
  },
  async (input) => {
    requireCurrentWorkspace();
    return textResult(store.listAssets(input.type));
  },
);

server.registerTool(
  "get_learning_asset",
  {
    title: "Get one persistent IOAYN asset",
    description: "Read one structured learning, memory, evidence, or Atlas asset by type and safe identifier.",
    inputSchema: z.object({ type: z.enum(ASSET_TYPES), id: idSchema }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const value = store.getAsset(input.type, input.id);
    if (!value) throw new Error(`${input.type} not found: ${input.id}`);
    return textResult(value);
  },
);

server.registerTool(
  "validate_workspace",
  {
    title: "Validate IOAYN knowledge workspace",
    description:
      "Validate structured assets, journal turns, contextual role requirements, cross-references, Atlas integrity, and schema freshness.",
    inputSchema: z.object({}),
  },
  async () => {
    store.ensureWorkspace();
    const errors: Array<{ type: string; file: string; error: string }> = [];
    const warnings: Array<{ type: string; file: string; warning: string }> = [];
    const version = store.manifestVersion();
    if (version !== SCHEMA_VERSION) {
      errors.push({ type: "manifest", file: "manifest.json", error: `migration required: ${version} -> ${SCHEMA_VERSION}` });
      return textResult({ valid: false, schema_version: version, errors, warnings });
    }

    const ids = {} as Record<AssetType, Set<string>>;
    const parsed = {} as Record<AssetType, unknown[]>;
    for (const type of ASSET_TYPES) {
      ids[type] = new Set<string>();
      parsed[type] = [];
      const folder = join(store.workspaceDir, ASSET_FOLDERS[type]);
      const files = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".json")) : [];
      for (const file of files) {
        try {
          const item = schemaMap[type].parse(store.readJson(join(folder, file)));
          ids[type].add(item.id);
          parsed[type].push(item);
        } catch (error) {
          errors.push({ type, file, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    for (const raw of parsed.slice as Slice[]) {
      if (!ids.goal.has(raw.goal_id)) errors.push({ type: "slice", file: `${raw.id}.json`, error: `missing goal: ${raw.goal_id}` });
      const participantIds = new Set(raw.participants.map((item) => item.id));
      for (const node of raw.flow.nodes) {
        if (!participantIds.has(node)) errors.push({ type: "slice", file: `${raw.id}.json`, error: `flow node is not a participant: ${node}` });
      }
      for (const participant of raw.participants) {
        if (!participant.role.trim()) errors.push({ type: "slice", file: `${raw.id}.json`, error: `participant has no contextual role: ${participant.name}` });
      }
      for (const ref of raw.evidence_refs) if (!ids.evidence.has(ref)) errors.push({ type: "slice", file: `${raw.id}.json`, error: `missing evidence: ${ref}` });
      for (const ref of raw.unknown_refs) if (!ids.unknown.has(ref)) errors.push({ type: "slice", file: `${raw.id}.json`, error: `missing unknown: ${ref}` });
      for (const ref of raw.round_refs) if (!ids.round.has(ref)) errors.push({ type: "slice", file: `${raw.id}.json`, error: `missing round: ${ref}` });
    }

    for (const raw of parsed.round as LearningRound[]) {
      if (!ids.session.has(raw.session_id)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing session: ${raw.session_id}` });
      if (!ids.goal.has(raw.goal_id)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing goal: ${raw.goal_id}` });
      if (!ids.slice.has(raw.slice_id)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing slice: ${raw.slice_id}` });
      if (raw.introduced_entities.length > 5) warnings.push({ type: "round", file: `${raw.id}.json`, warning: `introduced ${raw.introduced_entities.length} entities; guided default budget is 5` });
      for (const entity of raw.introduced_entities) {
        if (!entity.role.trim()) errors.push({ type: "round", file: `${raw.id}.json`, error: `name-only entity is forbidden: ${entity.name}` });
      }
      for (const ref of raw.evidence_refs) if (!ids.evidence.has(ref)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing evidence: ${ref}` });
      for (const ref of raw.unknown_refs) if (!ids.unknown.has(ref)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing unknown: ${ref}` });
      if (raw.learning_asset_id && !ids.learning_asset.has(raw.learning_asset_id)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing learning asset: ${raw.learning_asset_id}` });
      for (const ref of raw.atlas_node_refs) if (!ids.atlas_node.has(ref)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing atlas node: ${ref}` });
      for (const ref of raw.atlas_edge_refs) if (!ids.atlas_edge.has(ref)) errors.push({ type: "round", file: `${raw.id}.json`, error: `missing atlas edge: ${ref}` });
    }

    for (const raw of parsed.learning_asset as LearningAsset[]) {
      if (!ids.goal.has(raw.goal_id)) errors.push({ type: "learning_asset", file: `${raw.id}.json`, error: `missing goal: ${raw.goal_id}` });
      if (!ids.slice.has(raw.slice_id)) errors.push({ type: "learning_asset", file: `${raw.id}.json`, error: `missing slice: ${raw.slice_id}` });
      if (!ids.session.has(raw.learned_from.session_id)) errors.push({ type: "learning_asset", file: `${raw.id}.json`, error: `missing session: ${raw.learned_from.session_id}` });
      if (!ids.round.has(raw.learned_from.round_id)) errors.push({ type: "learning_asset", file: `${raw.id}.json`, error: `missing round: ${raw.learned_from.round_id}` });
      if (!ids.atlas_node.has(raw.atlas_node_id)) errors.push({ type: "learning_asset", file: `${raw.id}.json`, error: `missing atlas node: ${raw.atlas_node_id}` });
    }

    for (const raw of parsed.atlas_edge as AtlasEdge[]) {
      if (!ids.atlas_node.has(raw.from)) errors.push({ type: "atlas_edge", file: `${raw.id}.json`, error: `missing from node: ${raw.from}` });
      if (!ids.atlas_node.has(raw.to)) errors.push({ type: "atlas_edge", file: `${raw.id}.json`, error: `missing to node: ${raw.to}` });
      for (const ref of raw.evidence_refs) if (!ids.evidence.has(ref)) warnings.push({ type: "atlas_edge", file: `${raw.id}.json`, warning: `evidence reference is not present: ${ref}` });
    }

    for (const raw of parsed.session as Session[]) {
      for (const [index, turn] of store.listConversationTurns(raw.id).entries()) {
        try {
          conversationTurnSchema.parse(turn);
        } catch (error) {
          errors.push({ type: "journal", file: `${raw.id}.jsonl:${index + 1}`, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    return textResult({
      valid: errors.length === 0,
      schema_version: SCHEMA_VERSION,
      counts: Object.fromEntries(ASSET_TYPES.map((type) => [type, ids[type].size])),
      errors,
      warnings,
    });
  },
);

server.registerTool(
  "freshness_report",
  {
    title: "Report knowledge freshness",
    description:
      "Compare revision-bound goals, slices, evidence, sessions, rounds, knowledge assets, and Atlas nodes with the current Git revision.",
    inputSchema: z.object({}),
  },
  async () => {
    requireCurrentWorkspace();
    const snapshot = store.getSnapshot();
    const assets = store.listAssets();
    const revisionTypes: AssetType[] = ["goal", "slice", "evidence", "session", "round", "learning_asset", "atlas_node"];
    const items: Array<Record<string, unknown>> = [];
    for (const type of revisionTypes) {
      for (const raw of assets[type] || []) {
        const asset = raw as { id?: string; revision?: { commit?: string; dirty?: boolean } };
        const assetCommit = asset.revision?.commit || null;
        const sameCommit = assetCommit === snapshot.commit;
        const changedSourceFiles = assetCommit && !sameCommit
          ? store.changedSourceFiles(assetCommit, snapshot.commit)
          : [];
        const sourceChanged = changedSourceFiles === null || changedSourceFiles.length > 0;
        let status: "current" | "verify_dirty_worktree" | "stale" | "unknown";
        let reason: string;
        if (!snapshot.is_git_repository || !assetCommit) {
          status = "unknown";
          reason = "no_comparable_git_revision";
        } else if (snapshot.dirty || asset.revision?.dirty) {
          status = "verify_dirty_worktree";
          reason = snapshot.dirty ? "product_source_worktree_is_dirty" : "asset_was_created_from_dirty_source";
        } else if (sameCommit || !sourceChanged) {
          status = "current";
          reason = sameCommit ? "same_source_commit" : "only_ioayn_or_non_source_revision_changed";
        } else {
          status = "stale";
          reason = "product_source_changed_since_asset_revision";
        }
        items.push({
          type,
          id: asset.id,
          asset_commit: assetCommit,
          current_commit: snapshot.commit,
          current_source_dirty: snapshot.dirty,
          current_knowledge_dirty: snapshot.knowledge_dirty,
          changed_source_files: changedSourceFiles,
          status,
          reason,
        });
      }
    }
    return textResult({ snapshot, items });
  },
);

server.registerTool(
  "close_goal",
  {
    title: "Close a learning goal",
    description:
      "Mark a learning goal completed or abandoned and release it as the workspace's current goal. Closing keeps its slices, rounds, assets, and Atlas nodes for future reference.",
    inputSchema: z.object({
      goalId: idSchema,
      status: z.enum(["completed", "abandoned"]).default("completed"),
    }),
  },
  async (input) => {
    requireCurrentWorkspace();
    const current = store.getAsset("goal", input.goalId) as Goal | null;
    if (!current) throw new Error(`goal not found: ${input.goalId}`);
    const next = goalSchema.parse({
      ...current,
      status: input.status,
      updated_at: store.now(),
    });
    store.saveAsset("goal", next);
    const goalSlices = (store.listAssets("slice").slice || []) as Array<Record<string, unknown>>;
    let completedSlices = 0;
    for (const sliceAsset of goalSlices) {
      if (sliceAsset.goal_id === input.goalId && sliceAsset.stage !== "completed") {
        store.saveAsset("slice", sliceSchema.parse({ ...sliceAsset, stage: "completed", updated_at: store.now() }));
        completedSlices += 1;
      }
    }
    if (store.manifest().current_goal_id === input.goalId) {
      store.updateManifest({ current_goal_id: null, updated_at: store.now() });
    }
    return textResult({ goal: next, completed_slices: completedSlices });
  },
);

server.registerTool(
  "reset_workspace",
  {
    title: "Reset the IOAYN learning workspace",
    description:
      "Delete every goal, slice, evidence, unknown, session, round, learning asset, Atlas node/edge, journal entry, checkpoint, and runtime marker under .ioayn, then reinitialize an empty workspace. Destructive and irreversible; requires confirm='RESET'.",
    inputSchema: z.object({ confirm: z.literal("RESET") }),
  },
  async () => {
    const { removed } = store.resetWorkspace();
    return textResult({ reset: true, removed, manifest: store.manifest(), snapshot: store.getSnapshot() });
  },
);

const INDEX_SKIP_DIRS = new Set(["node_modules", "dist", "vendor", ".git", ".ioayn", "lib", "build", "coverage"]);

function walkDirectories(base: string, depth: number): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || INDEX_SKIP_DIRS.has(entry.name)) continue;
    const path = join(base, entry.name);
    out.push(path);
    if (depth > 0) out.push(...walkDirectories(path, depth - 1));
  }
  return out;
}

function scanProjectIndex(): { packages: unknown[]; docs: unknown[]; notes: string[]; top_dirs: string[] } {
  const root = store.canonicalRoot;
  const packages: unknown[] = [];
  const scanPackages = (base: string) => {
    if (!existsSync(base)) return;
    for (const dir of [base, ...walkDirectories(base, 3)]) {
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: string;
          description?: string;
          dsh?: { bundle?: { patch?: string }; profile?: { bundles?: string[] } };
        };
        packages.push({
          dir: relative(root, dir).replaceAll("\\", "/"),
          name: raw.name ?? basename(dir),
          description: raw.description ?? "",
          bundle: Boolean(raw.dsh?.bundle?.patch),
          profile: Boolean(raw.dsh?.profile?.bundles),
        });
      } catch {
        // unreadable manifests are skipped
      }
    }
  };
  scanPackages(join(root, "packages"));
  scanPackages(join(root, "apps"));

  const docs: unknown[] = [];
  const scanDocs = (base: string) => {
    if (!existsSync(base)) return;
    for (const dir of [base, ...walkDirectories(base, 2)]) {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of entries.filter((item) => item.endsWith(".md"))) {
        const path = join(dir, name);
        try {
          const text = readFileSync(path, "utf8");
          const title = text.match(/^#\s+(.+)$/m)?.[1] ?? name;
          const sections = [...text.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]).slice(0, 12);
          docs.push({ path: relative(root, path).replaceAll("\\", "/"), title, sections });
        } catch {
          // unreadable docs are skipped
        }
      }
    }
  };
  scanDocs(join(root, "docs"));

  const notes: string[] = [];
  const notesBase = join(root, ".agents", "notes");
  if (existsSync(notesBase)) {
    for (const dir of walkDirectories(notesBase, 4)) {
      try {
        for (const name of readdirSync(dir).filter((item) => item.endsWith(".md"))) {
          notes.push(relative(root, join(dir, name)).replaceAll("\\", "/"));
        }
      } catch {
        // unreadable note dirs are skipped
      }
    }
  }

  let topDirs: string[] = [];
  try {
    topDirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !INDEX_SKIP_DIRS.has(entry.name))
      .map((entry) => entry.name);
  } catch {
    // unreadable roots yield an empty top-level list
  }
  return { packages, docs, notes, top_dirs: topDirs };
}

server.registerTool(
  "build_project_index",
  {
    title: "Build the teacher-side project index",
    description:
      "Scan package manifests, documentation headings, and architecture-note inventories into a fast-lookup index stored under .ioayn/runtime, anchored to the current git revision. Teacher-side only: use it to locate anchors and specimens in O(1); never render it to the learner. Rebuild when the revision changes.",
    inputSchema: z.object({}),
  },
  async () => {
    const scanned = scanProjectIndex();
    const value = {
      revision: currentRevision(),
      built_at: store.now(),
      ...scanned,
    };
    store.writeTeacherIndex(value as Record<string, unknown>);
    return textResult({
      persisted: true,
      revision: value.revision,
      counts: {
        packages: scanned.packages.length,
        docs: scanned.docs.length,
        notes: scanned.notes.length,
        top_dirs: scanned.top_dirs.length,
      },
    });
  },
);

server.registerTool(
  "get_project_index",
  {
    title: "Read the teacher-side project index",
    description:
      "Return the stored project index with freshness against the current git revision, filtered by section (packages/docs/notes/top_dirs) and an optional substring query so only the needed slice is returned — never pull the whole index into context. Omit section to get counts and freshness only. When unavailable or stale, rebuild with build_project_index.",
    inputSchema: z.object({
      section: z.enum(["packages", "docs", "notes", "top_dirs"]).optional(),
      query: z.string().min(1).max(120).optional(),
    }),
  },
  async (input) => {
    const stored = store.readTeacherIndex();
    if (!stored) return textResult({ available: false, fresh: false, next: "build_project_index" });
    const snapshot = store.getSnapshot();
    const storedCommit = (stored.revision as { commit?: string } | undefined)?.commit;
    const fresh = storedCommit === snapshot.commit;
    const counts = {
      packages: (stored.packages as unknown[]).length,
      docs: (stored.docs as unknown[]).length,
      notes: (stored.notes as unknown[]).length,
      top_dirs: (stored.top_dirs as unknown[]).length,
    };
    if (!input.section) {
      return textResult({ available: true, fresh, revision: stored.revision, counts });
    }
    let items = stored[input.section] as unknown[];
    if (input.query) {
      const needle = input.query.toLowerCase();
      items = items.filter((item) =>
        input.section === "packages"
          ? String((item as { name?: string }).name ?? "").toLowerCase().includes(needle)
            || String((item as { dir?: string }).dir ?? "").toLowerCase().includes(needle)
            || String((item as { description?: string }).description ?? "").toLowerCase().includes(needle)
          : input.section === "docs"
            ? JSON.stringify(item).toLowerCase().includes(needle)
            : String(item).toLowerCase().includes(needle),
      );
    }
    const total = (stored[input.section] as unknown[]).length;
    return textResult({
      available: true,
      fresh,
      revision: stored.revision,
      counts,
      section: input.section,
      query: input.query ?? null,
      matched: items.length,
      total,
      items: items.slice(0, 40),
      truncated: items.length > 40,
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`IOAYN MCP ${VERSION} connected for ${store.canonicalRoot}`);
