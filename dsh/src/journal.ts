import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
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

/** 与 capture-hook.mjs 相同的写入管线：marker 门控 → dedupe → journal 追加。（round/asset 反向链接本版略——capture-hook 的反向链接依赖 round 学习资产结构，dsh v1 先记录 related_* 空数组，结构字段保留。） */
export function captureEvent(input: {
  cwd: string; actor: 'user' | 'agent'; kind: 'prompt' | 'teaching'
  content: string; externalSessionId?: string
}): 'captured' | 'no-workspace' | 'inactive' | 'empty' | 'duplicate' {
  if (!input.content) return 'empty'
  const workspace = findWorkspace(input.cwd)
  if (!workspace) return 'no-workspace'
  const markerPath = join(workspace, 'runtime', 'active-session.json')
  const marker = readJson(markerPath)
  if (!marker?.active || !marker.learning_session_id) return 'inactive'
  const sessionId = String(marker.learning_session_id)
  const sessionPath = join(workspace, 'sessions', `${sessionId}.json`)
  const session = readJson(sessionPath)
  const activeRoundId = session?.current_round_id ? String(session.current_round_id) : undefined
  let relatedEntities: string[] = []
  let relatedAssets: string[] = []
  if (activeRoundId) {
    const round = readJson(join(workspace, 'rounds', `${activeRoundId}.json`))
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
  const sessionCwd = (session: unknown): string | undefined =>
    (session as { header?: { cwd?: string } })?.header?.cwd
  const sessionIdOf = (session: unknown): string | undefined =>
    (session as { header?: { id?: string } })?.header?.id

  ctx.on('session/event', (session: unknown, event: { type: string; data?: unknown }) => {
    const header = (session as { header?: { delegationDepth?: number } })?.header
    if (header?.delegationDepth && header.delegationDepth > 0) return // 子代理会话不入 journal
    const cwd = sessionCwd(session)
    if (!cwd) return
    if (event.type === 'user/message') {
      const data = event.data as { content?: unknown; source?: { kind?: string } } | undefined
      if (data?.source?.kind && data.source.kind !== 'human') return // 插件注入的 user 消息不记
      captureEvent({ cwd, actor: 'user', kind: 'prompt', content: textOf(data?.content), externalSessionId: sessionIdOf(session) })
    } else if (event.type === 'assistant/message') {
      const data = event.data as { content?: unknown } | undefined
      captureEvent({ cwd, actor: 'agent', kind: 'teaching', content: textOf(data?.content), externalSessionId: sessionIdOf(session) })
    }
  })

  ctx.on('agent/disposed', ({ agent }: { agent: { session?: { header?: { cwd?: string } } } }) => {
    deferCapture(agent?.session?.header?.cwd ?? process.cwd())
  })
}
