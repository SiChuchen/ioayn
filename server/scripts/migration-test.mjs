import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function textPayload(result) {
  return JSON.parse(result.content?.find((item) => item.type === 'text')?.text ?? '{}');
}
async function call(client, name, args = {}) {
  return textPayload(await client.callTool({ name, arguments: args }));
}

const project = mkdtempSync(join(tmpdir(), 'ioayn-migration-'));
execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: project });
execFileSync('git', ['config', 'user.name', 'Migration Test'], { cwd: project });
writeFileSync(join(project, 'main.c'), 'int main(void) { return 0; }\n');
execFileSync('git', ['add', '.'], { cwd: project });
execFileSync('git', ['commit', '-m', 'initial'], { cwd: project, stdio: 'ignore' });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
const now = new Date().toISOString();
const workspace = join(project, '.ioayn');
for (const dir of ['goals', 'slices', 'evidence', 'unknowns', 'runtime']) mkdirSync(join(workspace, dir), { recursive: true });
writeFileSync(join(workspace, 'manifest.json'), JSON.stringify({
  schema_version: '1.0', project_id: 'migration-project', project_root: '.', created_at: now, updated_at: now, current_goal_id: 'goal-old',
  initialized_revision: { branch: 'master', commit, dirty: false, is_git_repository: true, captured_at: now }
}, null, 2));
writeFileSync(join(workspace, 'goals', 'goal-old.json'), JSON.stringify({
  schema_version: '1.0', id: 'goal-old', project_id: 'migration-project', title: 'Old goal', target: 'Understand main', questions: ['What is main?'],
  scope: { include: ['main.c'], exclude: [] }, entry_hypotheses: [], done_when: ['Can explain main'], mode: 'guided', status: 'active',
  revision: { branch: 'master', commit, dirty: false }, created_at: now, updated_at: now
}, null, 2));
writeFileSync(join(workspace, 'slices', 'slice-old.json'), JSON.stringify({
  schema_version: '1.0', id: 'slice-old', goal_id: 'goal-old', title: 'Old slice', question: 'What does main return?', stage: 'flow_traced',
  boundary: { inside: ['main'], outside: [] }, participants: [{ id: 'main', name: 'main()', kind: 'function', role: 'Returns process success.', source: { path: 'main.c', symbol: 'main' } }],
  flow: { nodes: ['main'], edges: [] }, evidence_refs: [], unknown_refs: [], revision: { branch: 'master', commit, dirty: false }, created_at: now, updated_at: now
}, null, 2));

const transport = new StdioClientTransport({ command: 'node', args: [resolve('dist/index.js')], env: { ...process.env, IOAYN_PROJECT_DIR: project }, stderr: 'pipe' });
const client = new Client({ name: 'migration-client', version: '1.1.0' });
await client.connect(transport);
const preflight = await call(client, 'preflight_learning');
if (!preflight.migration_required) throw new Error('migration should have been required');
const migrated = await call(client, 'migrate_workspace');
if (!migrated.migrated || migrated.to !== '1.1') throw new Error(`migration failed: ${JSON.stringify(migrated)}`);
const validation = await call(client, 'validate_workspace');
if (!validation.valid) throw new Error(`migrated workspace invalid: ${JSON.stringify(validation)}`);
await client.close();
console.log('IOAYN v1.0 to v1.1 migration test passed');
