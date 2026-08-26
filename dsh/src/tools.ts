import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec, type ParameterPropertySpec } from '@deepseek-ai/dsh-tools'
import { IOAYN_TOOLS } from '../../server/src/core/tools.js'
import { findWorkspace, createStore } from '../../server/src/core/workspace.js'
import type { WorkspaceStore } from '../../server/src/core/storage.js'

const jsonOutput = { type: 'object', additionalProperties: true } as const
const renderJson = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]

// 共享嵌套形状（与 server/src/core/schemas.ts 逐字段对应；min/max/default 等约束由 zod 复验兜底）。

const sourceSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    symbol: { type: 'string' },
    lines: { type: 'string' },
    command: { type: 'string' },
    artifact: { type: 'string' },
    observation: { type: 'string' },
  },
  additionalProperties: true,
}

// evidence 系 source 在 server 端必填（evidenceCommitInput / record_evidence），此处为带 required 的变体
const sourceRequiredSpec: ParameterPropertySpec = { ...sourceSpec, required: true }

// roleEntitySchema
const roleEntitySpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    kind: { type: 'string' },
    role: { type: 'string', required: true },
    input: { type: 'string' },
    action: { type: 'string' },
    output: { type: 'string' },
    source: sourceSpec,
    map: { type: 'boolean' },
  },
  additionalProperties: true,
}

// participantSchema
const participantSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    kind: { type: 'string' },
    role: { type: 'string', required: true },
    input: {
      type: 'object',
      properties: {
        producer: { type: 'string' },
        type: { type: 'string' },
        meaning: { type: 'string' },
        preconditions: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
    reads: { type: 'array', items: { type: 'string' } },
    transformations: { type: 'array', items: { type: 'string' } },
    output: {
      type: 'object',
      properties: {
        consumer: { type: 'string' },
        type: { type: 'string' },
        meaning: { type: 'string' },
      },
      additionalProperties: true,
    },
    writes: { type: 'array', items: { type: 'string' } },
    side_effects: { type: 'array', items: { type: 'string' } },
    failures: { type: 'array', items: { type: 'string' } },
    source: sourceSpec,
  },
  additionalProperties: true,
}

// flowEdgeSchema
const flowEdgeSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    relation: {
      type: 'string',
      required: true,
      enum: [
        'calls',
        'produces',
        'consumes',
        'transforms',
        'reads',
        'writes',
        'publishes',
        'receives',
        'transitions',
        'returns',
        'fails_to',
      ],
    },
    data: { type: 'string' },
    condition: { type: 'string' },
    evidence_refs: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

// checkpointSchema（save_slice.checkpoint 使用；snake_case）
const checkpointSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    id: { type: 'string', required: true },
    level: { type: 'string', required: true, enum: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] },
    difficulty: { type: 'string', enum: ['foundation', 'current_level', 'stretch'] },
    question: { type: 'string', required: true },
    expected_elements: { type: 'array', items: { type: 'string' } },
    user_answer: { type: 'string' },
    assessment: { type: 'string', enum: ['not_asked', 'pending', 'passed', 'needs_repair'] },
    feedback: { type: 'string' },
  },
  additionalProperties: true,
}

// evidenceCommitInput（record_evidence 与 commit_learning_round.evidence 共用形状）
const evidenceCommitSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    claim: { type: 'string', required: true },
    claimType: { type: 'string', required: true, enum: ['fact', 'inference', 'unknown', 'conflict'] },
    kind: {
      type: 'string',
      required: true,
      enum: ['source', 'test', 'runtime_trace', 'log', 'network', 'database', 'git', 'documentation'],
    },
    source: sourceRequiredSpec,
    confidence: { type: 'string', required: true, enum: ['high', 'medium', 'low'] },
    basisRefs: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

// unknownCommitInput（record_unknown 与 commit_learning_round.unknowns 共用形状）
const unknownCommitSpec: ParameterPropertySpec = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    description: { type: 'string', required: true },
    classification: { type: 'string', required: true, enum: ['blocking', 'non_blocking', 'deferred'] },
    whyItMatters: { type: 'string', required: true },
    currentAssumption: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    resolutionPlan: { type: 'array', items: { type: 'string' } },
    futureTopic: { type: 'string' },
    status: { type: 'string', enum: ['open', 'investigating', 'resolved', 'accepted_limitation'] },
  },
  additionalProperties: true,
}

const evidenceKindEnum = ['source', 'test', 'runtime_trace', 'log', 'network', 'database', 'git', 'documentation'] as const
const abstractionLevelEnum = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const
const confidenceEnum = ['high', 'medium', 'low'] as const
const atlasEdgeTypeEnum = [
  'PART_OF',
  'PRECEDES',
  'PRODUCES',
  'CONSUMES',
  'TRANSFORMS',
  'DEPENDS_ON',
  'IMPLEMENTS',
  'OBSERVED_IN',
  'LEARNED_THROUGH',
  'CONNECTS_TO',
  'CONTRADICTS',
  'REFINES',
  'SUPERSEDES',
  'EXPLAINS',
  'SHARES_CONCEPT_WITH',
] as const
const assetTypeEnum = ['goal', 'slice', 'evidence', 'unknown', 'session', 'round', 'learning_asset', 'atlas_node', 'atlas_edge'] as const

/**
 * dsh DSL 仅是模型面参数表；min/max/pattern/default 等全部约束不进 DSL，
 * 由 registerIoaynTools 内的 inputSchema.parse（zod 复验）作为唯一执行点。
 * 字段名与必填/可选逐字对齐 server/src/core/tools.ts 的 inputSchema。
 */
// 新增工具时：同步补 DSL entry 与参数 description（模型面指引），对齐由 verify-dsh 检查强制。
export const IOAYN_TOOL_PARAMS: Record<string, ParameterSchemaSpec> = {
  preflight_learning: {},
  init_workspace: {},
  migrate_workspace: {},
  project_snapshot: {},
  create_goal: {
    id: { type: 'string' },
    title: { type: 'string', required: true },
    target: { type: 'string', required: true },
    questions: { type: 'array', items: { type: 'string' }, required: true },
    include: { type: 'array', items: { type: 'string' } },
    exclude: { type: 'array', items: { type: 'string' } },
    entryHypotheses: { type: 'array', items: { type: 'string' } },
    doneWhen: { type: 'array', items: { type: 'string' }, required: true },
    mode: { type: 'string', enum: ['guided', 'survey', 'deep_dive', 'reference'] },
    startLevel: { type: 'string', enum: abstractionLevelEnum },
    targetLevel: { type: 'string', enum: abstractionLevelEnum },
    currentLevel: { type: 'string', enum: abstractionLevelEnum },
  },
  save_slice: {
    id: { type: 'string', required: true },
    goalId: { type: 'string', required: true },
    title: { type: 'string', required: true },
    question: { type: 'string', required: true },
    abstractionLevel: { type: 'string', required: true, enum: abstractionLevelEnum },
    stage: {
      type: 'string',
      required: true,
      enum: [
        'goal_defined',
        'entry_discovered',
        'boundary_modeled',
        'flow_traced',
        'unknowns_classified',
        'details_expanded',
        'runtime_verified',
        'user_checked',
        'completed',
      ],
    },
    observableAnchor: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
      },
      additionalProperties: true,
    },
    insideBoundary: { type: 'array', items: { type: 'string' } },
    outsideBoundary: { type: 'array', items: { type: 'string' } },
    participants: { type: 'array', items: participantSpec, required: true },
    nodes: { type: 'array', items: { type: 'string' }, required: true },
    edges: { type: 'array', items: flowEdgeSpec },
    stateChanges: { type: 'array', items: { type: 'string' } },
    sideEffects: { type: 'array', items: { type: 'string' } },
    failurePaths: { type: 'array', items: { type: 'string' } },
    introducedEntities: { type: 'array', items: roleEntitySpec },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
    unknownRefs: { type: 'array', items: { type: 'string' } },
    roundRefs: { type: 'array', items: { type: 'string' } },
    checkpoint: checkpointSpec,
    summary: { type: 'string' },
    atlasNodeId: { type: 'string' },
  },
  record_evidence: {
    id: { type: 'string' },
    goalId: { type: 'string', required: true },
    sliceId: { type: 'string' },
    roundId: { type: 'string' },
    claim: { type: 'string', required: true },
    claimType: { type: 'string', required: true, enum: ['fact', 'inference', 'unknown', 'conflict'] },
    kind: { type: 'string', required: true, enum: evidenceKindEnum },
    source: sourceRequiredSpec,
    confidence: { type: 'string', required: true, enum: confidenceEnum },
    basisRefs: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  record_unknown: {
    id: { type: 'string' },
    goalId: { type: 'string', required: true },
    sliceId: { type: 'string' },
    roundId: { type: 'string' },
    description: { type: 'string', required: true },
    classification: { type: 'string', required: true, enum: ['blocking', 'non_blocking', 'deferred'] },
    whyItMatters: { type: 'string', required: true },
    currentAssumption: { type: 'string' },
    confidence: { type: 'string', enum: confidenceEnum },
    resolutionPlan: { type: 'array', items: { type: 'string' } },
    futureTopic: { type: 'string' },
    status: { type: 'string', enum: ['open', 'investigating', 'resolved', 'accepted_limitation'] },
    resolution: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        evidence_refs: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  start_learning_session: {
    id: { type: 'string' },
    title: { type: 'string', required: true },
    initialPrompt: { type: 'string', required: true },
    goalId: { type: 'string' },
    sliceId: { type: 'string' },
    abstractionLevel: { type: 'string', enum: abstractionLevelEnum },
    externalSessionId: { type: 'string' },
  },
  resume_learning_session: {
    sessionId: { type: 'string', required: true },
    externalSessionId: { type: 'string' },
  },
  append_conversation_turn: {
    id: { type: 'string' },
    sessionId: { type: 'string', required: true },
    roundId: { type: 'string' },
    externalSessionId: { type: 'string' },
    actor: { type: 'string', required: true, enum: ['user', 'agent', 'tool', 'system'] },
    kind: {
      type: 'string',
      required: true,
      enum: ['prompt', 'teaching', 'checkpoint', 'answer', 'tool_observation', 'compact_summary', 'event'],
    },
    content: { type: 'string', required: true },
    relatedEntities: { type: 'array', items: { type: 'string' } },
    relatedAssets: { type: 'array', items: { type: 'string' } },
  },
  list_session_turns: {
    sessionId: { type: 'string', required: true },
    limit: { type: 'integer' },
  },
  finish_learning_session: {
    sessionId: { type: 'string', required: true },
    status: { type: 'string', enum: ['paused', 'completed'] },
  },
  commit_learning_round: {
    roundId: { type: 'string', required: true },
    sessionId: { type: 'string', required: true },
    goalId: { type: 'string', required: true },
    sliceId: { type: 'string', required: true },
    index: { type: 'integer', required: true },
    abstractionLevel: { type: 'string', required: true, enum: abstractionLevelEnum },
    activeQuestion: { type: 'string', required: true },
    summary: { type: 'string', required: true },
    introducedEntities: { type: 'array', items: roleEntitySpec },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', required: true, enum: ['fact', 'inference', 'unknown', 'conflict'] },
          text: { type: 'string', required: true },
          confidence: { type: 'string', required: true, enum: confidenceEnum },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          basisRefs: { type: 'array', items: { type: 'string' } },
          limitations: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: true,
      },
    },
    evidence: { type: 'array', items: evidenceCommitSpec },
    unknowns: { type: 'array', items: unknownCommitSpec },
    checkpoint: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        level: { type: 'string', required: true, enum: abstractionLevelEnum },
        difficulty: { type: 'string', enum: ['foundation', 'current_level', 'stretch'] },
        question: { type: 'string', required: true },
        expectedElements: { type: 'array', items: { type: 'string' } },
        userAnswer: { type: 'string' },
        assessment: { type: 'string', enum: ['not_asked', 'pending', 'passed', 'needs_repair'] },
        feedback: { type: 'string' },
      },
      additionalProperties: true,
    },
    userTurns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string', required: true },
          kind: { type: 'string', enum: ['prompt', 'answer'] },
        },
        additionalProperties: true,
      },
    },
    agentTurns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string', required: true },
          kind: { type: 'string', enum: ['teaching', 'checkpoint'] },
        },
        additionalProperties: true,
      },
    },
    learningAsset: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          required: true,
          enum: [
            'flow_understanding',
            'contract',
            'concept',
            'decision',
            'error_path',
            'state_model',
            'architecture_fragment',
          ],
        },
        title: { type: 'string', required: true },
        question: { type: 'string', required: true },
        bodyMarkdown: { type: 'string', required: true },
        systemArea: { type: 'string', required: true },
        input: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            type: { type: 'string' },
            meaning: { type: 'string' },
          },
          additionalProperties: true,
        },
        output: {
          type: 'object',
          properties: {
            consumer: { type: 'string' },
            type: { type: 'string' },
            meaning: { type: 'string' },
          },
          additionalProperties: true,
        },
        concepts: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['draft', 'verified', 'revised', 'superseded'] },
      },
      additionalProperties: true,
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetNodeId: { type: 'string', required: true },
          relation: { type: 'string', required: true, enum: atlasEdgeTypeEnum },
          label: { type: 'string' },
          confidence: { type: 'string', enum: confidenceEnum },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: true,
      },
    },
    nextActions: { type: 'array', items: { type: 'string' } },
  },
  upsert_atlas_node: {
    id: { type: 'string', required: true },
    type: {
      type: 'string',
      required: true,
      enum: [
        'system_area',
        'learning_slice',
        'learning_asset',
        'concept',
        'code_entity',
        'data_object',
        'state',
        'boundary',
        'external_system',
      ],
    },
    label: { type: 'string', required: true },
    description: { type: 'string' },
    refType: {
      type: 'string',
      required: true,
      enum: ['goal', 'slice', 'learning_asset', 'concept', 'code_entity', 'system_area', 'none'],
    },
    refId: { type: 'string' },
    systemArea: { type: 'string' },
    modelStatus: { type: 'string', enum: ['observed', 'modeled', 'verified', 'revised'] },
    connectionStatus: { type: 'string', enum: ['isolated', 'connected'] },
    freshness: { type: 'string', enum: ['current', 'stale', 'unknown'] },
    unknownStatus: { type: 'string', enum: ['open', 'clear'] },
    tags: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
    unknownRefs: { type: 'array', items: { type: 'string' } },
  },
  link_atlas_nodes: {
    id: { type: 'string' },
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    relation: { type: 'string', required: true, enum: atlasEdgeTypeEnum },
    label: { type: 'string' },
    confidence: { type: 'string', required: true, enum: confidenceEnum },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
  },
  build_atlas_projection: {
    focusNodeId: { type: 'string', required: true },
    view: { type: 'string', enum: ['location', 'connections', 'history', 'concept', 'gaps'] },
    maxDepth: { type: 'integer' },
    maxNodes: { type: 'integer' },
  },
  find_historical_connections: {
    focusNodeId: { type: 'string', required: true },
    maxResults: { type: 'integer' },
  },
  resume_learning_context: {
    sessionId: { type: 'string' },
    recentTurns: { type: 'integer' },
  },
  list_learning_assets: {
    type: { type: 'string', enum: assetTypeEnum },
  },
  get_learning_asset: {
    type: { type: 'string', required: true, enum: assetTypeEnum },
    id: { type: 'string', required: true },
  },
  validate_workspace: {},
  freshness_report: {},
  close_goal: {
    goalId: { type: 'string', required: true },
    status: { type: 'string', enum: ['completed', 'abandoned'] },
  },
  reset_workspace: {
    confirm: { type: 'string', required: true, enum: ['RESET'] },
  },
  build_project_index: {},
  get_project_index: {
    section: { type: 'string', enum: ['packages', 'docs', 'notes', 'top_dirs'] },
    query: { type: 'string' },
  },
}

// WorkspaceStore 无内存态；缓存仅避免重复构造，reset_workspace 后旧实例与新实例读写同一文件集。
const storeCache = new Map<string, WorkspaceStore>()

// 注册期注入的宿主日志（避免 storeFor 依赖 ctx）
let ctxLogger: ((msg: string) => void) | undefined
const warnedFallbackRoots = new Set<string>()

function storeFor(cwd: string | undefined): WorkspaceStore {
  const start = cwd ?? process.cwd()
  if (cwd === undefined && !warnedFallbackRoots.has(start)) {
    warnedFallbackRoots.add(start)
    ctxLogger?.(`ioayn-dsh: tool call carried no session cwd; falling back to process.cwd() (${start})`)
  }
  const ioaynDir = findWorkspace(start) ?? join(start, '.ioayn') // 与 MCP 路径一致：无工作区时以 cwd 为根（init_workspace 负责创建）
  const root = dirname(ioaynDir)
  let store = storeCache.get(root)
  if (!store) { store = createStore(root); storeCache.set(root, store) }
  return store
}

export function registerIoaynTools(ctx: Context): void {
  ctxLogger = (msg: string) => { ctx.logger.warn(msg) }
  const cwdOf = (exec: unknown): string | undefined =>
    (exec as { agent?: { session?: { header?: { cwd?: string } } } })?.agent?.session?.header?.cwd

  for (const proto of IOAYN_TOOLS) {
    const params = IOAYN_TOOL_PARAMS[proto.name]
    if (params === undefined) throw new Error(`ioayn-dsh: no ParameterSchemaSpec for tool ${proto.name}`)
    ctx.tools.register(defineTool({
      name: proto.name,
      description: proto.description,
      parameters: params,
      output: { schema: jsonOutput, render: renderJson },
      async execute(args, exec) {
        const store = storeFor(cwdOf(exec))
        let validated: unknown
        try {
          validated = proto.inputSchema.parse(args) // zod 复验：DSL 不承载的约束在此执行
        } catch (error) {
          const issues = (error as { issues?: Array<{ path: Array<string | number | symbol>; message: string }> }).issues
          if (Array.isArray(issues)) {
            const brief = issues.slice(0, 8).map(i => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ')
            throw new Error(`invalid ${proto.name} arguments: ${brief}${issues.length > 8 ? ` (+${issues.length - 8} more)` : ''}`)
          }
          throw error
        }
        const result = (await proto.execute(validated, store)) as unknown
        const envelope = result as { content?: Array<{ type?: string; text?: string }> } | null
        const text = Array.isArray(envelope?.content)
          ? envelope.content.find(block => block.type === 'text')?.text
          : undefined
        if (text !== undefined) {
          try {
            return JSON.parse(text) as never
          } catch {
            return { text } as never
          }
        }
        return result as never
      },
    }))
  }
}
