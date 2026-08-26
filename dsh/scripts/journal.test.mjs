import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('capture is gated by active marker and dedupes', async () => {
  const m = await import('../lib/index.js')
  const project = mkdtempSync(join(tmpdir(), 'ioayn-dsh-journal-'))
  const ws = join(project, '.ioayn')
  mkdirSync(join(ws, 'runtime'), { recursive: true })
  writeFileSync(join(ws, 'runtime', 'active-session.json'), JSON.stringify({ active: true, learning_session_id: 's1' }))
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第一问' }), 'captured')
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第一问' }), 'duplicate')
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '' }), 'empty')
  const line = JSON.parse(readFileSync(join(ws, 'journal', 's1.jsonl'), 'utf8').trim())
  assert.equal(line.actor, 'user'); assert.equal(line.session_id, 's1')
  assert.equal(m.deferCapture(project), true)
  assert.equal(JSON.parse(readFileSync(join(ws, 'runtime', 'active-session.json'), 'utf8')).active, false)
  assert.equal(m.captureEvent({ cwd: project, actor: 'user', kind: 'prompt', content: '第二问' }), 'inactive')
})

test('no workspace yields no-workspace', async () => {
  const m = await import('../lib/index.js')
  const empty = mkdtempSync(join(tmpdir(), 'ioayn-dsh-none-'))
  assert.equal(m.captureEvent({ cwd: empty, actor: 'agent', kind: 'teaching', content: 'x' }), 'no-workspace')
})

test('attachJournal routes session events with subagent and plugin gating', async () => {
  const m = await import('../lib/index.js')
  const project = mkdtempSync(join(tmpdir(), 'ioayn-dsh-route-'))
  const ws = join(project, '.ioayn')
  mkdirSync(join(ws, 'runtime'), { recursive: true })
  mkdirSync(join(ws, 'sessions'), { recursive: true })
  mkdirSync(join(ws, 'rounds'), { recursive: true })
  writeFileSync(join(ws, 'runtime', 'active-session.json'), JSON.stringify({ active: true, learning_session_id: 's2' }))
  writeFileSync(join(ws, 'sessions', 's2.json'), JSON.stringify({ id: 's2', current_round_id: 'r1', external_session_ids: [], updated_at: '2026-01-01T00:00:00Z' }))
  writeFileSync(join(ws, 'rounds', 'r1.json'), JSON.stringify({ id: 'r1', introduced_entities: [{ id: 'ent-1' }], learning_asset_id: null, user_turn_refs: [], agent_turn_refs: [], updated_at: '2026-01-01T00:00:00Z' }))
  const listeners = {}
  const ctx = { on: (name, fn) => { listeners[name] = fn } }
  m.apply({ ...ctx, tools: { register: () => {} }, logger: { warn: () => {} } })
  const session = { header: { cwd: project, id: 'ext-1', delegationDepth: 0 } }
  listeners['session/event'](session, { type: 'user/message', data: { content: [{ type: 'text', text: '路由测试' }], source: { kind: 'human' } } })
  listeners['session/event'](session, { type: 'assistant/message', data: { content: [{ type: 'text', text: '教学回答' }] } })
  listeners['session/event'](session, { type: 'user/message', data: { content: [{ type: 'text', text: '插件注入' }], source: { kind: 'plugin' } } }) // 应被忽略
  listeners['session/event']({ header: { cwd: project, delegationDepth: 2 } }, { type: 'assistant/message', data: { content: [{ type: 'text', text: '子代理输出' }] } }) // 应被忽略
  listeners['agent/disposed']({ agent: { session: { header: { cwd: project } } } })
  const lines = readFileSync(join(ws, 'journal', 's2.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(lines.length, 2)
  assert.equal(lines[0].actor, 'user'); assert.equal(lines[0].content, '路由测试'); assert.equal(lines[0].external_session_id, 'ext-1')
  assert.equal(lines[1].actor, 'agent'); assert.equal(lines[1].content, '教学回答')
  // 回写断言：session.external_session_ids 同步 + round turn refs 回填
  assert.deepEqual(JSON.parse(readFileSync(join(ws, 'sessions', 's2.json'), 'utf8')).external_session_ids, ['ext-1'])
  const round = JSON.parse(readFileSync(join(ws, 'rounds', 'r1.json'), 'utf8'))
  assert.equal(round.user_turn_refs.length, 1); assert.equal(round.agent_turn_refs.length, 1)
  assert.deepEqual(lines[0].related_entities, ['ent-1']); assert.deepEqual(lines[1].related_entities, ['ent-1'])
  assert.equal(JSON.parse(readFileSync(join(ws, 'runtime', 'active-session.json'), 'utf8')).active, false)
})
