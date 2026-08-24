import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function textPayload(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function call(client, name, args = {}) {
  return textPayload(await client.callTool({ name, arguments: args }));
}

const project = mkdtempSync(join(tmpdir(), 'ioayn-v11-smoke-'));
execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: project });
execFileSync('git', ['config', 'user.name', 'Smoke Test'], { cwd: project });
writeFileSync(join(project, 'main.ts'), [
  'export function parse(input: string) { return Number(input); }',
  'export function calculate(value: number) { return value + 1; }',
  'export function main(input: string) { return calculate(parse(input)); }',
  ''
].join('\n'));
execFileSync('git', ['add', '.'], { cwd: project });
execFileSync('git', ['commit', '-m', 'initial'], { cwd: project, stdio: 'ignore' });

const transport = new StdioClientTransport({
  command: 'node',
  args: [resolve('dist/index.js')],
  env: { ...process.env, IOAYN_PROJECT_DIR: project },
  stderr: 'pipe',
});
const client = new Client({ name: 'ioayn-smoke-client', version: '1.1.0' });
await client.connect(transport);

const tools = await client.listTools();
for (const required of ['preflight_learning', 'start_learning_session', 'resume_learning_session', 'commit_learning_round', 'build_atlas_projection', 'resume_learning_context']) {
  if (!tools.tools.some((tool) => tool.name === required)) throw new Error(`${required} tool not found`);
}

const preflight = await call(client, 'preflight_learning');
if (preflight.mode !== 'persistent' || preflight.workspace_schema_version !== '1.1') {
  throw new Error(`unexpected preflight: ${JSON.stringify(preflight)}`);
}
await call(client, 'init_workspace');

await call(client, 'create_goal', {
  id: 'understand-main-io',
  title: 'Understand main I/O',
  target: 'Understand how a string becomes a numeric result',
  questions: ['Who produces the input?', 'Where is it transformed?', 'Who consumes the output?'],
  include: ['main.ts'],
  exclude: ['build system'],
  doneWhen: ['Can reconstruct the input-to-output chain'],
  mode: 'guided',
  startLevel: 'L1',
  targetLevel: 'L4',
});

await call(client, 'start_learning_session', {
  id: 'session-main-io',
  title: 'Main I/O learning',
  initialPrompt: '带我理解 main 的输入如何变成输出',
  goalId: 'understand-main-io',
  abstractionLevel: 'L2',
});

const firstSliceSave = await call(client, 'save_slice', {
  id: 'slice-main-path',
  goalId: 'understand-main-io',
  title: 'Main producer-to-consumer path',
  question: 'How does main transform input?',
  abstractionLevel: 'L2',
  stage: 'flow_traced',
  observableAnchor: { kind: 'function', description: 'main(input)', location: 'main.ts' },
  insideBoundary: ['parse', 'calculate', 'main'],
  outsideBoundary: ['CLI caller'],
  participants: [
    { id: 'main', name: 'main()', kind: 'function', role: 'Receives the external string, sequences parsing and calculation, and returns the final number.', input: { producer: 'caller', type: 'string', meaning: 'raw numeric text' }, output: { consumer: 'caller', type: 'number', meaning: 'calculated result' }, source: { path: 'main.ts', symbol: 'main' } },
    { id: 'parse', name: 'parse()', kind: 'function', role: 'Converts the raw string into a number for the calculator.', input: { producer: 'main', type: 'string', meaning: 'raw numeric text' }, output: { consumer: 'calculate', type: 'number', meaning: 'parsed value' }, source: { path: 'main.ts', symbol: 'parse' } },
    { id: 'calculate', name: 'calculate()', kind: 'function', role: 'Adds one to the parsed value and returns the final result.', input: { producer: 'parse', type: 'number', meaning: 'parsed value' }, output: { consumer: 'main', type: 'number', meaning: 'incremented result' }, source: { path: 'main.ts', symbol: 'calculate' } },
  ],
  nodes: ['main', 'parse', 'calculate'],
  edges: [
    { from: 'main', to: 'parse', relation: 'calls', data: 'input' },
    { from: 'parse', to: 'calculate', relation: 'produces', data: 'number' },
    { from: 'calculate', to: 'main', relation: 'returns', data: 'result' },
  ],
  introducedEntities: [
    { id: 'main', name: 'main()', kind: 'function', role: 'Receives the external string, sequences parsing and calculation, and returns the final number.', input: 'raw string', action: 'orchestrates parse and calculate', output: 'number', source: { path: 'main.ts', symbol: 'main' }, map: false },
    { id: 'parse', name: 'parse()', kind: 'function', role: 'Converts raw numeric text into the number consumed by calculate().', input: 'string', action: 'Number conversion', output: 'number', source: { path: 'main.ts', symbol: 'parse' }, map: true },
    { id: 'calculate', name: 'calculate()', kind: 'function', role: 'Transforms the parsed value into the final result by adding one.', input: 'number', action: 'increments value', output: 'number', source: { path: 'main.ts', symbol: 'calculate' }, map: false },
  ],
});

const firstRoundInput = {
  roundId: 'round-main-1',
  sessionId: 'session-main-io',
  goalId: 'understand-main-io',
  sliceId: 'slice-main-path',
  index: 1,
  abstractionLevel: 'L2',
  activeQuestion: 'How does raw input become the result?',
  summary: 'The caller provides a string; parse converts it to a number; calculate increments it; main returns the result.',
  introducedEntities: [
    { id: 'main', name: 'main()', kind: 'function', role: 'Receives the external string, sequences parsing and calculation, and returns the final number.', input: 'raw string', action: 'orchestrates', output: 'number', source: { path: 'main.ts', symbol: 'main' }, map: false },
    { id: 'parse', name: 'parse()', kind: 'function', role: 'Converts raw numeric text into the number consumed by calculate().', input: 'string', action: 'Number conversion', output: 'number', source: { path: 'main.ts', symbol: 'parse' }, map: true },
    { id: 'calculate', name: 'calculate()', kind: 'function', role: 'Transforms the parsed value into the final result by adding one.', input: 'number', action: 'increments value', output: 'number', source: { path: 'main.ts', symbol: 'calculate' }, map: false },
  ],
  claims: [
    { type: 'fact', text: 'parse() converts the string before calculate() consumes it.', confidence: 'high', evidenceRefs: ['round-main-1-evidence-1'] },
    { type: 'inference', text: 'main() is an orchestration boundary rather than the transformation owner.', confidence: 'medium', evidenceRefs: ['round-main-1-evidence-1'], basisRefs: ['round-main-1-claim-1'] },
  ],
  evidence: [
    { claim: 'parse() feeds calculate()', claimType: 'fact', kind: 'source', source: { path: 'main.ts', symbol: 'main', lines: '3' }, confidence: 'high' },
  ],
  unknowns: [
    { description: 'Invalid numeric text behavior is not yet verified.', classification: 'non_blocking', whyItMatters: 'It affects the failure path but not the normal I/O chain.', currentAssumption: 'Number() returns NaN.', confidence: 'medium', resolutionPlan: ['Run a focused test with invalid input'] },
  ],
  checkpoint: { level: 'L2', question: 'Which function owns the representation change from string to number?', expectedElements: ['parse()'], userAnswer: 'parse()', assessment: 'passed' },
  learningAsset: {
    id: 'asset-main-io-path',
    type: 'flow_understanding',
    title: 'Main string-to-number I/O path',
    question: 'How does raw string input become the returned number?',
    bodyMarkdown: 'The caller provides a raw string. `main()` delegates representation conversion to `parse()`, passes the number to `calculate()`, and returns the incremented result.',
    systemArea: 'application/main-flow',
    input: { source: 'caller', type: 'string', meaning: 'raw numeric text' },
    output: { consumer: 'caller', type: 'number', meaning: 'incremented value' },
    concepts: ['producer-consumer', 'representation-boundary'],
    status: 'verified',
  },
  nextActions: ['Trace invalid input behavior'],
};
const firstCommit = await call(client, 'commit_learning_round', firstRoundInput);
if (!firstCommit.persisted || !firstCommit.atlas_update?.focus_node_id) throw new Error('first round was not persisted');
if (firstCommit.learning_asset?.body_markdown !== undefined) throw new Error('commit response must be compact: no body_markdown echo');
if (!firstCommit.counts || typeof firstCommit.counts.claims !== 'number') throw new Error('commit response missing counts');
if (firstCommit.round?.checkpoint?.assessment !== 'passed') throw new Error('commit response missing compact round summary');
const replay = await call(client, 'commit_learning_round', firstRoundInput);
if (!replay.idempotent_replay) throw new Error('round commit was not idempotent');
const replayJournal = await call(client, 'list_session_turns', { sessionId: 'session-main-io', limit: 100 });
if (replayJournal.total !== 2) throw new Error(`idempotent replay duplicated journal turns: ${JSON.stringify(replayJournal)}`);

await call(client, 'save_slice', {
  id: 'slice-invalid-input',
  goalId: 'understand-main-io',
  title: 'Invalid input path',
  question: 'What happens when parse receives non-numeric text?',
  abstractionLevel: 'L3',
  stage: 'boundary_modeled',
  insideBoundary: ['parse', 'calculate'],
  outsideBoundary: ['caller'],
  participants: [
    { id: 'parse-invalid', name: 'parse()', kind: 'function', role: 'Converts invalid text to NaN, which becomes the downstream value.', input: { producer: 'caller', type: 'string', meaning: 'non-numeric text' }, output: { consumer: 'calculate', type: 'number', meaning: 'NaN' }, source: { path: 'main.ts', symbol: 'parse' } },
    { id: 'calculate-invalid', name: 'calculate()', kind: 'function', role: 'Consumes NaN and preserves it through arithmetic, producing NaN as output.', input: { producer: 'parse', type: 'number', meaning: 'NaN' }, output: { consumer: 'caller', type: 'number', meaning: 'NaN' }, source: { path: 'main.ts', symbol: 'calculate' } },
  ],
  nodes: ['parse-invalid', 'calculate-invalid'],
  edges: [{ from: 'parse-invalid', to: 'calculate-invalid', relation: 'produces', data: 'NaN' }],
  introducedEntities: [
    { id: 'parse-invalid', name: 'parse()', kind: 'function', role: 'Converts invalid text into NaN for downstream arithmetic.', input: 'invalid string', action: 'Number conversion', output: 'NaN', source: { path: 'main.ts', symbol: 'parse' }, map: false },
    { id: 'calculate-invalid', name: 'calculate()', kind: 'function', role: 'Consumes NaN and returns NaN because arithmetic cannot recover a numeric value.', input: 'NaN', action: 'adds one', output: 'NaN', source: { path: 'main.ts', symbol: 'calculate' }, map: false },
  ],
});

const secondCommit = await call(client, 'commit_learning_round', {
  roundId: 'round-main-2',
  sessionId: 'session-main-io',
  goalId: 'understand-main-io',
  sliceId: 'slice-invalid-input',
  index: 2,
  abstractionLevel: 'L3',
  activeQuestion: 'How does invalid input propagate?',
  summary: 'Invalid text becomes NaN at parse() and remains NaN through calculate().',
  introducedEntities: [
    { id: 'parse-invalid', name: 'parse()', kind: 'function', role: 'Converts invalid text into NaN for downstream arithmetic.', input: 'invalid string', action: 'Number conversion', output: 'NaN', source: { path: 'main.ts', symbol: 'parse' }, map: false },
    { id: 'calculate-invalid', name: 'calculate()', kind: 'function', role: 'Consumes NaN and returns NaN because arithmetic cannot recover a numeric value.', input: 'NaN', action: 'adds one', output: 'NaN', source: { path: 'main.ts', symbol: 'calculate' }, map: false },
  ],
  claims: [{ type: 'fact', text: 'Invalid input produces NaN and there is no validation boundary.', confidence: 'high', evidenceRefs: ['round-main-2-evidence-1'] }],
  evidence: [{ claim: 'No validation is present before Number conversion.', claimType: 'fact', kind: 'source', source: { path: 'main.ts', symbol: 'parse', lines: '1' }, confidence: 'high' }],
  checkpoint: { level: 'L3', question: 'Where would a validation contract need to be introduced?', expectedElements: ['before or inside parse()'], assessment: 'pending' },
  learningAsset: {
    id: 'asset-invalid-input-path',
    type: 'error_path',
    title: 'Invalid input propagation',
    question: 'How does non-numeric text propagate through the flow?',
    bodyMarkdown: 'Non-numeric text becomes `NaN` inside `parse()`. Because no validation boundary intervenes, `calculate()` consumes and returns `NaN`.',
    systemArea: 'application/main-flow/error-path',
    input: { source: 'caller', type: 'string', meaning: 'invalid text' },
    output: { consumer: 'caller', type: 'number', meaning: 'NaN' },
    concepts: ['producer-consumer', 'validation-boundary'],
    status: 'verified',
  },
  connections: [{ targetNodeId: firstCommit.atlas_update.focus_node_id, relation: 'REFINES', label: 'adds the invalid-input branch', confidence: 'high', evidenceRefs: ['round-main-2-evidence-1'] }],
  nextActions: ['Compare validation at caller versus parse()'],
});
if (!secondCommit.persisted) throw new Error('second round was not persisted');

const atlasEdgeFiles = readdirSync(join(project, '.ioayn', 'atlas', 'edges'));
const sharedEdgeFile = atlasEdgeFiles.find((name) => name.includes('shares_concept_with'));
if (!sharedEdgeFile) throw new Error('auto SHARES_CONCEPT_WITH edge between concept-sharing assets is missing');
const sharedEdge = JSON.parse(readFileSync(join(project, '.ioayn', 'atlas', 'edges', sharedEdgeFile), 'utf8'));
if (!sharedEdge.label?.includes('producer-consumer')) throw new Error('shared-concept edge label must list the shared concepts');
const atlasNodeFiles = readdirSync(join(project, '.ioayn', 'atlas', 'nodes'));
const conceptFile = atlasNodeFiles.find((name) => name.startsWith('concept-'));
const conceptNode = JSON.parse(readFileSync(join(project, '.ioayn', 'atlas', 'nodes', conceptFile), 'utf8'));
if ((conceptNode.description || '').startsWith('Concept connected')) throw new Error('concept node description still uses the template');
if (!firstSliceSave.slice?.id || typeof firstSliceSave.counts?.participants !== 'number') throw new Error('save_slice response must be compact with counts');
if (typeof firstCommit.journal_backfilled !== 'number' || firstCommit.journal_backfilled < 1) throw new Error('journal round_id backfill did not attribute pre-commit turns');

await call(client, 'upsert_atlas_node', {
  id: 'concept-legacy-noise',
  type: 'concept',
  label: 'legacy',
  description: 'Concept connected through IOAYN learning assets: legacy',
  refType: 'concept',
  refId: 'concept-legacy-noise',
});
const healRun = await call(client, 'migrate_workspace');
if (!healRun.healed || healRun.healed.cleaned_descriptions < 1) throw new Error('atlas heal did not clean legacy template descriptions');

const projection = await call(client, 'build_atlas_projection', {
  focusNodeId: secondCommit.atlas_update.focus_node_id,
  view: 'connections',
  maxDepth: 2,
  maxNodes: 12,
});
if (!projection.nodes?.length || !projection.mermaid?.includes('flowchart')) throw new Error('Atlas projection failed');

const historical = await call(client, 'find_historical_connections', {
  focusNodeId: secondCommit.atlas_update.focus_node_id,
  maxResults: 10,
});
if (!historical.connections?.some((item) => item.node?.id === firstCommit.atlas_update.focus_node_id)) {
  throw new Error(`historical connection not found: ${JSON.stringify(historical)}`);
}

execFileSync('git', ['add', '.ioayn'], { cwd: project });
execFileSync('git', ['commit', '-m', 'add IOAYN knowledge assets'], { cwd: project, stdio: 'ignore' });
const knowledgeOnlyFreshness = await call(client, 'freshness_report');
const currentAsset = knowledgeOnlyFreshness.items.find((item) => item.type === 'learning_asset' && item.id === 'asset-main-io-path');
if (currentAsset?.status !== 'current') {
  throw new Error(`knowledge-only commit incorrectly made asset stale: ${JSON.stringify(currentAsset)}`);
}
writeFileSync(join(project, 'main.ts'), [
  'export function parse(input: string) { return Number(input); }',
  'export function calculate(value: number) { return value + 2; }',
  'export function main(input: string) { return calculate(parse(input)); }',
  ''
].join('\n'));
execFileSync('git', ['add', 'main.ts'], { cwd: project });
execFileSync('git', ['commit', '-m', 'change product source'], { cwd: project, stdio: 'ignore' });
const sourceFreshness = await call(client, 'freshness_report');
const staleAsset = sourceFreshness.items.find((item) => item.type === 'learning_asset' && item.id === 'asset-main-io-path');
if (staleAsset?.status !== 'stale' || !staleAsset.changed_source_files?.includes('main.ts')) {
  throw new Error(`source commit did not make asset stale: ${JSON.stringify(staleAsset)}`);
}

const indexBuild = await call(client, 'build_project_index');
if (!indexBuild.persisted || !indexBuild.revision?.commit) throw new Error('teacher index build failed');
const indexRead = await call(client, 'get_project_index');
if (!indexRead.available || !indexRead.fresh) throw new Error('teacher index not readable or stale right after build');

const resumed = await call(client, 'resume_learning_context', { sessionId: 'session-main-io' });
if (!resumed.resumable || resumed.current_round?.id !== 'round-main-2') throw new Error('resume context failed');
if (resumed.recent_assets?.some((asset) => asset.body_markdown !== undefined)) throw new Error('resume response must be compact: no body_markdown echo');
if (!resumed.session?.id || !resumed.goal?.id) throw new Error('compact resume lost session or goal identity');
await call(client, 'finish_learning_session', { sessionId: 'session-main-io', status: 'paused' });
const autoLocated = await call(client, 'resume_learning_context');
if (!autoLocated.resumable || autoLocated.session?.id !== 'session-main-io') throw new Error('latest saved session was not auto-located');
const reactivated = await call(client, 'resume_learning_session', { sessionId: 'session-main-io', externalSessionId: 'claude-resumed-session' });
if (reactivated.session?.status !== 'active') throw new Error('resume_learning_session failed');
const resumedPreflight = await call(client, 'preflight_learning');
if (!resumedPreflight.capture_active) throw new Error('resumed session did not reactivate hook capture');

const journal = await call(client, 'list_session_turns', { sessionId: 'session-main-io', limit: 100 });
if (journal.total < 3) throw new Error(`journal was not persisted: ${JSON.stringify(journal)}`);

const validation = await call(client, 'validate_workspace');
if (!validation.valid) throw new Error(`workspace validation failed: ${JSON.stringify(validation)}`);

await call(client, 'finish_learning_session', { sessionId: 'session-main-io', status: 'completed' });
const attributed = await call(client, 'list_session_turns', { sessionId: 'session-main-io', limit: 100 });
if (attributed.turns.some((turn) => !turn.round_id)) throw new Error('journal round_id backfill left unattributed turns');
if (!existsSync(join(project, '.ioayn', 'assets', 'asset-main-io-path.json'))) throw new Error('learning asset file missing');
if (!existsSync(join(project, '.ioayn', 'atlas', 'nodes'))) throw new Error('Atlas directory missing');
if (!readFileSync(join(project, '.ioayn', '.gitignore'), 'utf8').includes('journal/')) throw new Error('personal data gitignore missing');

const preResetSummary = await call(client, 'preflight_learning');
if (!preResetSummary.knowledge_summary?.counts?.goal || !preResetSummary.knowledge_summary?.counts?.learning_asset) {
  throw new Error(`preflight knowledge_summary missing counts: ${JSON.stringify(preResetSummary.knowledge_summary)}`);
}
if (!preResetSummary.knowledge_summary?.last_learning_asset?.title) throw new Error('preflight knowledge_summary missing last asset');

const closedGoal = await call(client, 'close_goal', { goalId: 'understand-main-io', status: 'completed' });
if (closedGoal.goal?.status !== 'completed') throw new Error('close_goal did not complete the goal');
if (closedGoal.goal?.abstraction?.current_level !== 'L3') throw new Error(`goal current_level did not advance to highest round level: ${JSON.stringify(closedGoal.goal?.abstraction)}`);
const postClosePreflight = await call(client, 'preflight_learning');
if (postClosePreflight.current_goal_id === 'understand-main-io') throw new Error('close_goal did not release the current goal');
const closedSlice = JSON.parse(readFileSync(join(project, '.ioayn', 'slices', 'slice-main-path.json'), 'utf8'));
if (closedSlice.stage !== 'completed') throw new Error('close_goal did not mark its slices completed');

const reset = await call(client, 'reset_workspace', { confirm: 'RESET' });
if (!reset.reset || !reset.removed?.goals) throw new Error(`reset_workspace did not report removals: ${JSON.stringify(reset)}`);
const postResetPreflight = await call(client, 'preflight_learning');
const counts = postResetPreflight.knowledge_summary?.counts || {};
if (Object.values(counts).some((count) => count > 0)) throw new Error(`workspace not empty after reset: ${JSON.stringify(counts)}`);
if (postResetPreflight.current_goal_id || postResetPreflight.current_session_id) throw new Error('reset did not clear manifest pointers');

await client.close();
console.log('IOAYN v1.1 smoke test passed');
