#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const SCHEMA_VERSION = '1.1';
const DEDUPE_WINDOW_MS = 5000;

function readStdin() {
  return new Promise((resolveInput) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolveInput(data));
  });
}

function findWorkspace(cwd) {
  let current = resolve(cwd || process.cwd());
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, '.ioayn');
    if (existsSync(candidate)) return candidate;
    if (current === root) return null;
    current = dirname(current);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

function safeId(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 119);
  return normalized || `hook-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function appendUnique(list, value) {
  return [...new Set([...(Array.isArray(list) ? list : []), value])];
}

const raw = await readStdin();
if (!raw.trim()) process.exit(0);

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const workspace = findWorkspace(input.cwd);
if (!workspace) process.exit(0);
const markerPath = join(workspace, 'runtime', 'active-session.json');
if (!existsSync(markerPath)) process.exit(0);

let marker;
try {
  marker = readJson(markerPath);
} catch {
  process.exit(0);
}
if (!marker.active || !marker.learning_session_id) process.exit(0);

const sessionId = String(marker.learning_session_id);
const sessionPath = join(workspace, 'sessions', `${sessionId}.json`);
let session = null;
try {
  if (existsSync(sessionPath)) session = readJson(sessionPath);
} catch {
  session = null;
}

const event = String(input.hook_event_name || 'Event');
let actor = 'system';
let kind = 'event';
let content = '';

if (event === 'UserPromptSubmit') {
  actor = 'user';
  kind = 'prompt';
  content = String(input.prompt || '');
} else if (event === 'Stop') {
  actor = 'agent';
  kind = 'teaching';
  content = String(input.last_assistant_message || '');
} else if (event === 'StopFailure') {
  actor = 'system';
  kind = 'event';
  content = `Assistant turn failed: ${String(input.error || 'unknown')}${input.error_details ? ` — ${String(input.error_details)}` : ''}`;
} else if (event === 'PostCompact') {
  actor = 'system';
  kind = 'compact_summary';
  content = String(input.compact_summary || '');
} else if (event === 'SessionStart') {
  content = `Claude Code session started or resumed (${String(input.source || 'unknown')}).`;
} else if (event === 'SessionEnd') {
  content = `Claude Code session ended (${String(input.reason || 'unknown')}).`;
} else {
  process.exit(0);
}

if (!content && !['SessionStart', 'SessionEnd'].includes(event)) process.exit(0);

const activeRoundId = ['UserPromptSubmit', 'Stop', 'StopFailure'].includes(event) && session?.current_round_id
  ? String(session.current_round_id)
  : undefined;
let round = null;
let relatedEntities = [];
let relatedAssets = [];
if (activeRoundId) {
  const roundPath = join(workspace, 'rounds', `${activeRoundId}.json`);
  try {
    if (existsSync(roundPath)) {
      round = readJson(roundPath);
      relatedEntities = Array.isArray(round.introduced_entities)
        ? round.introduced_entities.map((entity) => entity.id).filter(Boolean)
        : [];
      if (round.learning_asset_id) relatedAssets = [String(round.learning_asset_id)];
    }
  } catch {
    round = null;
  }
}

const createdAt = new Date().toISOString();
const externalSessionId = input.session_id ? String(input.session_id) : undefined;
const journalPath = join(workspace, 'journal', `${sessionId}.jsonl`);
const recentTurns = readJsonLines(journalPath).slice(-20);
const duplicate = recentTurns.find((turn) => {
  const age = Date.now() - Date.parse(String(turn.created_at || ''));
  return age >= 0 && age <= DEDUPE_WINDOW_MS
    && turn.actor === actor
    && turn.kind === kind
    && turn.content === content
    && String(turn.external_session_id || '') === String(externalSessionId || '');
});
if (duplicate) process.exit(0);

const fingerprint = createHash('sha256')
  .update([
    externalSessionId,
    event,
    input.turn_id,
    input.message_id,
    input.index,
    input.transcript_path,
    content,
  ].join('|'))
  .digest('hex')
  .slice(0, 16);
const id = safeId(`hook-${event}-${fingerprint}-${Date.now().toString(36)}`);
const turn = {
  schema_version: SCHEMA_VERSION,
  id,
  session_id: sessionId,
  round_id: activeRoundId,
  external_session_id: externalSessionId,
  actor,
  kind,
  content,
  related_entities: relatedEntities,
  related_assets: relatedAssets,
  created_at: createdAt,
};

mkdirSync(dirname(journalPath), { recursive: true });
appendFileSync(journalPath, `${JSON.stringify(turn)}\n`, 'utf8');

// Session end defers capture: an active marker must not leak journaling into
// the next unrelated Claude session. resume_learning_session re-enables it.
if (event === 'SessionEnd') {
  try {
    atomicWrite(markerPath, { active: false, learning_session_id: sessionId, deferred_at: createdAt, updated_at: createdAt });
  } catch {
    // Journal capture remains the priority; a stale marker is cleaned by resume/finish.
  }
}

if (session) {
  try {
    const ids = new Set(Array.isArray(session.external_session_ids) ? session.external_session_ids : []);
    if (externalSessionId) ids.add(externalSessionId);
    session.external_session_ids = [...ids];
    session.updated_at = createdAt;
    atomicWrite(sessionPath, session);
  } catch {
    // Journal capture remains useful even if session metadata cannot be updated.
  }
}

if (round && activeRoundId) {
  try {
    const roundPath = join(workspace, 'rounds', `${activeRoundId}.json`);
    if (actor === 'user') round.user_turn_refs = appendUnique(round.user_turn_refs, id);
    if (actor === 'agent') round.agent_turn_refs = appendUnique(round.agent_turn_refs, id);
    round.updated_at = createdAt;
    atomicWrite(roundPath, round);

    if (round.learning_asset_id) {
      const assetPath = join(workspace, 'assets', `${round.learning_asset_id}.json`);
      if (existsSync(assetPath)) {
        const asset = readJson(assetPath);
        asset.source_turn_refs = appendUnique(asset.source_turn_refs, id);
        asset.updated_at = createdAt;
        atomicWrite(assetPath, asset);
      }
    }
  } catch {
    // The raw journal remains durable even if post-commit provenance linking fails.
  }
}
