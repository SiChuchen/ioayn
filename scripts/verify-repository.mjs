import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const RELEASE_VERSION = readFileSync(join(root, 'VERSION'), 'utf8').trim();
const SCHEMA_VERSION = '1.1';

const required = [
  '.claude-plugin/plugin.json',
  '.mcp.json',
  'hooks/hooks.json',
  'scripts/capture-hook.mjs',
  'skills/learn-code/SKILL.md',
  'skills/learn-code/references/teaching-policy.md',
  'skills/learn-code/references/evidence-policy.md',
  'skills/learn-code/references/unknown-policy.md',
  'skills/learn-code/references/memory-and-atlas-policy.md',
  'skills/learn-code/evals/cases.json',
  'skills/resume-learning/SKILL.md',
  'skills/view-atlas/SKILL.md',
  'agents/slice-explorer.md',
  'agents/runtime-verifier.md',
  'agents/learning-tutor.md',
  'agents/knowledge-curator.md',
  'server/src/index.ts',
  'server/src/schemas.ts',
  'server/src/storage.ts',
  'server/src/atlas.ts',
  'server/src/validate-fixtures.ts',
  'server/dist/index.js',
  'schemas/learning-session.schema.json',
  'schemas/conversation-turn.schema.json',
  'schemas/learning-round.schema.json',
  'schemas/learning-asset.schema.json',
  'schemas/atlas-node.schema.json',
  'schemas/atlas-edge.schema.json',
  'docs/01-methodology.md',
  'docs/10-agent-handoff.md',
  'docs/12-persistent-learning-memory.md',
  'docs/13-cognitive-atlas.md',
  'docs/14-learning-protocol-v1.1.md',
  'docs/15-p0-real-project-findings.md',
  'docs/16-release-scope-v1.1.md',
  'docs/17-v1.1-validation-report.md',
  'docs/adr/0004-separate-journal-from-curated-assets.md',
  'docs/adr/0005-bounded-cognitive-atlas.md',
  'docs/adr/0006-opt-in-hook-capture.md',
  'docs/adr/0007-recoverable-round-commit.md',
];

const generatedSchemas = [
  'learning-goal',
  'learning-slice',
  'evidence',
  'unknown',
  'learning-session',
  'conversation-turn',
  'learning-round',
  'learning-asset',
  'atlas-node',
  'atlas-edge',
  'manifest',
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

const failures = [];
for (const file of required) {
  try {
    readFileSync(join(root, file));
  } catch {
    failures.push(`missing required file: ${file}`);
  }
}

for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (rel === 'server/dist/index.js' || rel === 'server/package-lock.json' || rel === 'scripts/verify-repository.mjs') continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (/(codebase-learning|code-learning|codelearn|\.codelearn|CODELEARN)/i.test(text)) {
    failures.push(`legacy branding found: ${rel}`);
  }
  if (rel.endsWith('.json')) {
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`invalid JSON ${rel}: ${error.message}`);
    }
  }
}

const manifest = readJson('.claude-plugin/plugin.json');
const rootPackage = readJson('package.json');
const serverPackage = readJson('server/package.json');
const lock = readJson('server/package-lock.json');
const buildInfo = readJson('BUILD_INFO.json');
const hooks = readJson('hooks/hooks.json');
const evals = readJson('skills/learn-code/evals/cases.json');

if (manifest.name !== 'ioayn') failures.push('plugin name must be ioayn');
if (manifest.version !== RELEASE_VERSION) failures.push(`plugin version must be ${RELEASE_VERSION}`);
if (rootPackage.version !== RELEASE_VERSION) failures.push(`root package version must be ${RELEASE_VERSION}`);
if (serverPackage.version !== RELEASE_VERSION) failures.push(`server package version must be ${RELEASE_VERSION}`);
if (lock.version !== RELEASE_VERSION || lock.packages?.['']?.version !== RELEASE_VERSION) {
  failures.push(`server package-lock root version must be ${RELEASE_VERSION}`);
}
const lockText = readFileSync(join(root, 'server/package-lock.json'), 'utf8');
if (/applied-caas-gateway|internal\.api\.openai\.org/.test(lockText)) {
  failures.push('server package-lock contains a non-portable internal registry URL');
}
if (readFileSync(join(root, 'VERSION'), 'utf8').trim() !== RELEASE_VERSION) {
  failures.push(`VERSION must be ${RELEASE_VERSION}`);
}
if (buildInfo.version !== RELEASE_VERSION) failures.push(`BUILD_INFO version must be ${RELEASE_VERSION}`);
if (evals.version !== SCHEMA_VERSION) failures.push(`eval version must be ${SCHEMA_VERSION}`);
const constantsText = readFileSync(join(root, 'server/src/constants.ts'), 'utf8');
const constantsVersion = constantsText.match(/export const VERSION = "([^"]+)"/)?.[1];
if (constantsVersion !== RELEASE_VERSION) {
  failures.push(`server VERSION constant must be ${RELEASE_VERSION} (found ${constantsVersion || 'none'})`);
}

for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure', 'PostCompact', 'SessionEnd']) {
  if (!hooks.hooks?.[event]) failures.push(`hooks.json missing ${event}`);
}

for (const name of generatedSchemas) {
  const schema = readJson(`schemas/${name}.schema.json`);
  if (!String(schema.$id ?? '').includes(`:${SCHEMA_VERSION}`)) {
    failures.push(`schema ${name} must use version ${SCHEMA_VERSION}`);
  }
}

for (const template of [
  'learning-goal.template.json',
  'learning-slice.template.json',
  'learning-round.template.json',
  'learning-asset.template.json',
  'atlas-node.template.json',
  'atlas-edge.template.json',
]) {
  const data = readJson(`skills/learn-code/templates/${template}`);
  if (data.schema_version !== SCHEMA_VERSION) failures.push(`${template} must use schema_version ${SCHEMA_VERSION}`);
}

const bundle = readFileSync(join(root, 'server/dist/index.js'), 'utf8');
if (!bundle.startsWith('#!/usr/bin/env node')) failures.push('server/dist/index.js must be an executable Node bundle');
if (!bundle.includes('commit_learning_round') || !bundle.includes('build_atlas_projection')) {
  failures.push('server bundle is missing v1.1 MCP capabilities');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('IOAYN v1.1 repository checks passed.');
