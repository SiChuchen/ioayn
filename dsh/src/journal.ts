import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { findWorkspace } from '../../server/src/core/workspace.js'

const DEDUPE_WINDOW_MS = 5000

interface CaptureTurn {
  schema_version: string; id: string; session_id: string; round_id?: string
  external_session_id?: string; actor: string; kind: string; content: string
  related_entities: string[]; related_assets: string[]; created_at: string
}

const textOf = (blocks: unknown): string =>
  Array.isArray(blocks)
    ? blocks.filter((b): b is { type: 'text'; text: string } =>
        typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text')
      .map(b => b.text).join('\n')
    : ''

function readJson(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function readJsonLines(path: string): any[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

function safeId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 119)
  return normalized || `dsh-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

const appendUnique = (list: unknown, value: string): string[] => [...new Set([...(Array.isArray(list) ? list : []), value])]

/** 与 capture-hook.mjs 相同的写入管线：marker 门控 → dedupe → journal 追加 → session/round/asset 回写（回写失败静默降级，journal 优先）。 */
export function captureEvent(input: {
  cwd: string; actor: 'user' | 'agent'; kind: 'prompt' | 'teaching'
  content: string; externalSessionId?: string
}): 'captured' | 'no-workspace' | 'inactive' | 'empty' | 'duplicate' {
  const workspace = findWorkspace(input.cwd)
  if (!workspace) return 'no-workspace'
  const markerPath = join(workspace, 'runtime', 'active-session.json')
  const marker = readJson(markerPath)
  if (!marker?.active || !marker.learning_session_id) return 'inactive'
  if (!input.content) return 'empty'
  const sessionId = String(marker.learning_session_id)
  const sessionPath = join(workspace, 'sessions', `${sessionId}.json`)
  const session = readJson(sessionPath)
  const activeRoundId = session?.current_round_id ? String(session.current_round_id) : undefined
  let round: any = null
  let relatedEntities: string[] = []
  let relatedAssets: string[] = []
  if (activeRoundId) {
    round = readJson(join(workspace, 'rounds', `${activeRoundId}.json`))
    if (round) {
      relatedEntities = Array.isArray(round.introduced_entities) ? round.introduced_entities.map((e: { id: string }) => e.id).filter(Boolean) : []
      if (round.learning_asset_id) relatedAssets = [String(round.learning_asset_id)]
    }
  }
  const createdAt = new Date().toISOString()
  const journalPath = join(workspace, 'journal', `${sessionId}.jsonl`)
  const duplicate = readJsonLines(journalPath).slice(-20).some(t =>
    Date.now() - Date.parse(String(t.created_at || '')) >= 0
    && Date.now() - Date.parse(String(t.created_at || '')) <= DEDUPE_WINDOW_MS
    && t.actor === input.actor && t.kind === input.kind && t.content === input.content
    && String(t.external_session_id || '') === String(input.externalSessionId || ''))
  if (duplicate) return 'duplicate'
  const fingerprint = createHash('sha256').update([input.externalSessionId, input.actor, input.kind, input.content].join('|')).digest('hex').slice(0, 16)
  const turn: CaptureTurn = {
    schema_version: '1.1',
    id: safeId(`dsh-${input.kind}-${fingerprint}-${Date.now().toString(36)}`),
    session_id: sessionId,
    ...activeRoundId ? { round_id: activeRoundId } : {},
    ...input.externalSessionId ? { external_session_id: input.externalSessionId } : {},
    actor: input.actor, kind: input.kind, content: input.content,
    related_entities: relatedEntities, related_assets: relatedAssets, created_at: createdAt,
  }
  mkdirSync(dirname(journalPath), { recursive: true })
  appendFileSync(journalPath, `${JSON.stringify(turn)}\n`, 'utf8')

  // 以下回写与 capture-hook.mjs 对齐：journal 已落盘，回写失败只静默降级（journal capture remains the priority）。
  if (input.externalSessionId && session) {
    try {
      const ids: Set<string> = new Set(Array.isArray(session.external_session_ids) ? session.external_session_ids : [])
      ids.add(input.externalSessionId)
      session.external_session_ids = [...ids]
      session.updated_at = createdAt
      atomicWrite(sessionPath, session)
    } catch { /* journal capture remains the priority */ }
  }
  if (round && activeRoundId) {
    try {
      const roundPath = join(workspace, 'rounds', `${activeRoundId}.json`)
      if (input.actor === 'user') round.user_turn_refs = appendUnique(round.user_turn_refs, turn.id)
      if (input.actor === 'agent') round.agent_turn_refs = appendUnique(round.agent_turn_refs, turn.id)
      round.updated_at = createdAt
      atomicWrite(roundPath, round)
    } catch { /* journal capture remains the priority */ }
  }
  if (round?.learning_asset_id) {
    try {
      const assetPath = join(workspace, 'assets', `${round.learning_asset_id}.json`)
      if (existsSync(assetPath)) {
        const asset = readJson(assetPath)
        if (asset) {
          asset.source_turn_refs = appendUnique(asset.source_turn_refs, turn.id)
          asset.updated_at = createdAt
          atomicWrite(assetPath, asset)
        }
      }
    } catch { /* journal capture remains the priority */ }
  }
  return 'captured'
}

/** agent/disposed 的 SessionEnd 语义：active marker 置 false（deferred capture）。 */
export function deferCapture(cwd: string): boolean {
  const workspace = findWorkspace(cwd)
  if (!workspace) return false
  const markerPath = join(workspace, 'runtime', 'active-session.json')
  const marker = readJson(markerPath)
  if (!marker?.active) return false
  const now = new Date().toISOString()
  atomicWrite(markerPath, { active: false, learning_session_id: marker.learning_session_id, deferred_at: now, updated_at: now })
  return true
}

export function attachJournal(ctx: Context): void {
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    // 子代理会话不入 journal：SessionHeader.delegationDepth 顶层缺省或 0，子代理 >0（dsh-session lib/types/types.d.ts:70）。
    if ((session.header.delegationDepth ?? 0) > 0) return
    const cwd = session.header.cwd
    if (!cwd) return
    if (event.type === 'user/message') {
      // data 即 UserMessage 本体（types.d.ts:262 'user/message': UserMessage）：文本在 data.content，来源在 data.source。
      const data = event.data as { content?: unknown; source?: { kind?: string } } | undefined
      const kind = data?.source?.kind
      if (kind !== undefined && kind !== 'user') return // 插件/工具注入的 user 消息不记；无 source 或无 kind 时放行（dsh-llm lib/types/message.d.ts:94 kind 仅 user/plugin/model/tool）
      captureEvent({ cwd, actor: 'user', kind: 'prompt', content: textOf(data?.content), externalSessionId: session.header.id })
    } else if (event.type === 'assistant/message') {
      // data 形状为 { turn, step, message: AssistantMessage, usage? }（types.d.ts:275-280）：文本在 data.message.content。
      const data = event.data as { message?: { content?: unknown } } | undefined
      captureEvent({ cwd, actor: 'agent', kind: 'teaching', content: textOf(data?.message?.content), externalSessionId: session.header.id })
    }
  })

  ctx.on('agent/disposed', ({ agent }: { agent: Agent }) => {
    // 子代理 dispose 不关 marker（delegationDepth > 0 直接 return）：只有顶层 agent 结束才 deferCapture。
    if ((agent.session.header.delegationDepth ?? 0) > 0) return
    deferCapture(agent.session.header.cwd ?? process.cwd())
  })
}
