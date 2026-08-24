import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = mkdtempSync(join(tmpdir(), 'ioayn-hook-'));
const workspace = join(project, '.ioayn');
mkdirSync(join(workspace, 'runtime'), { recursive: true });
mkdirSync(join(workspace, 'sessions'), { recursive: true });
mkdirSync(join(workspace, 'rounds'), { recursive: true });
mkdirSync(join(workspace, 'assets'), { recursive: true });
writeFileSync(join(workspace, 'runtime', 'active-session.json'), JSON.stringify({ active: true, learning_session_id: 'session-hook-test' }, null, 2));
writeFileSync(join(workspace, 'sessions', 'session-hook-test.json'), JSON.stringify({
  schema_version: '1.1',
  id: 'session-hook-test',
  current_round_id: 'round-hook-test',
  external_session_ids: [],
  updated_at: new Date().toISOString()
}, null, 2));
writeFileSync(join(workspace, 'rounds', 'round-hook-test.json'), JSON.stringify({
  schema_version: '1.1',
  id: 'round-hook-test',
  introduced_entities: [{ id: 'sender' }, { id: 'receiver' }],
  learning_asset_id: 'asset-hook-test',
  user_turn_refs: [],
  agent_turn_refs: [],
  updated_at: new Date().toISOString()
}, null, 2));
writeFileSync(join(workspace, 'assets', 'asset-hook-test.json'), JSON.stringify({
  schema_version: '1.1',
  id: 'asset-hook-test',
  source_turn_refs: [],
  updated_at: new Date().toISOString()
}, null, 2));

const hook = resolve('..', 'scripts', 'capture-hook.mjs');
function invoke(payload) {
  const result = spawnSync('node', [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: project,
  });
  if (result.status !== 0) throw new Error(`hook failed: ${result.stderr}`);
}

const userPayload = {
  session_id: 'claude-session-1',
  cwd: project,
  hook_event_name: 'UserPromptSubmit',
  prompt: '继续学习 sender 与 receiver 的关系'
};
const agentPayload = {
  session_id: 'claude-session-1',
  cwd: project,
  hook_event_name: 'Stop',
  last_assistant_message: '本轮确认 sender 生产探测请求，receiver 消费网络响应。'
};
invoke(userPayload);
invoke(agentPayload);
invoke(agentPayload); // rapid duplicate must not create a second journal turn

const journalPath = join(workspace, 'journal', 'session-hook-test.jsonl');
if (!existsSync(journalPath)) throw new Error('journal file was not created');
const lines = readFileSync(journalPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
if (lines.length !== 2 || lines[0].actor !== 'user' || lines[1].actor !== 'agent') {
  throw new Error(`unexpected hook journal: ${JSON.stringify(lines)}`);
}
if (!lines.every((turn) => turn.round_id === 'round-hook-test')) throw new Error('hook turns were not linked to current round');
if (!lines[1].related_assets.includes('asset-hook-test')) throw new Error('agent teaching turn was not linked to learning asset');

const session = JSON.parse(readFileSync(join(workspace, 'sessions', 'session-hook-test.json'), 'utf8'));
if (!session.external_session_ids.includes('claude-session-1')) throw new Error('external Claude session id was not recorded');
const round = JSON.parse(readFileSync(join(workspace, 'rounds', 'round-hook-test.json'), 'utf8'));
if (!round.user_turn_refs.includes(lines[0].id) || !round.agent_turn_refs.includes(lines[1].id)) {
  throw new Error('round provenance refs were not updated');
}
const asset = JSON.parse(readFileSync(join(workspace, 'assets', 'asset-hook-test.json'), 'utf8'));
if (!asset.source_turn_refs.includes(lines[0].id) || !asset.source_turn_refs.includes(lines[1].id)) {
  throw new Error('learning asset provenance refs were not updated');
}
console.log('IOAYN hook capture test passed');
