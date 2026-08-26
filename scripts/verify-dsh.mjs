#!/usr/bin/env node
// verify-dsh: five-layer release gate for the ioayn-dsh preset/plugin.
//
//   layer 1     preset structure   agent.cordis.yml rows + name allowlist, preset.yml meta, delegation role tools
//   layer 2     skill frontmatter  the three preset SKILL.md contracts + residual host-token scan
//   layer 3     tool alignment     dsh/lib IOAYN_TOOLS vs IOAYN_TOOL_PARAMS (27 tools, param-name sets)
//   layer 3.5   copy drift         preset reference/template copies vs skills/ and agents/ sources; embedded personas
//   layer 4     install drill      bin.mjs install into a fresh temporary DSH_HOME
//
// Run via `npm run verify:dsh` (which rebuilds dsh/lib first), or directly after
// `npm --prefix dsh run build`.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dshDir = join(root, 'dsh')

if (!existsSync(join(dshDir, 'lib', 'index.js'))) {
  console.error('verify-dsh: dsh/lib/index.js is missing — run `npm --prefix dsh run build` first')
  process.exit(1)
}

// yaml is a devDependency of the dsh package; resolve it from dsh's own tree.
const requireFromDsh = createRequire(join(dshDir, 'package.json'))
const { parse: parseYaml } = requireFromDsh('yaml')

const failures = []
const fail = (layer, message) => failures.push(`verify-dsh [${layer}]: ${message}`)

const readText = (path) => readFileSync(path, 'utf8')

const toRel = (path) => relative(root, path).replaceAll('\\', '/')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

// ── layer 1: preset structure ────────────────────────────────────────────────

// In-box dsh rows the preset may mount, plus the two non-in-box names:
// the ioayn-dsh plugin itself and the cordis group row.
const ALLOWED_ROW_NAMES = new Set([
  '@deepseek-ai/dsh-persona',
  '@deepseek-ai/dsh-agent-instructions',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill',
  '@deepseek-ai/dsh-plan-mode',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-command-compact',
  '@deepseek-ai/dsh-compaction-tool-result-pruner',
  '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents',
  '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-workflow-worker-thread',
  '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-todo',
  '@deepseek-ai/dsh-tool-web',
  'ioayn-dsh',
  'cordis:group',
])

const ROLE_TOOL_NAMES = ['slice_explorer', 'learning_tutor', 'runtime_verifier', 'knowledge_curator']
const rolePersonas = {} // toolName -> persona text, consumed by layer 3.5

{
  const layer = 'layer 1 preset structure'

  let rows
  try {
    // `!!js` function tags are not plain YAML; neutralize them before parsing
    // (the file itself is not modified).
    const raw = readText(join(dshDir, 'preset', 'agent.cordis.yml'))
    rows = parseYaml(raw.replace(/ !!js /g, ' '))
  } catch (error) {
    fail(layer, `agent.cordis.yml is not parseable YAML: ${error.message}`)
  }

  if (rows !== undefined) {
    const usedRowNames = new Set()
    const visit = (entries, where) => {
      if (!Array.isArray(entries)) {
        fail(layer, `${where}: expected an array of rows`)
        return
      }
      for (const row of entries) {
        if (!row || typeof row !== 'object' || typeof row.name !== 'string' || row.name === '') {
          fail(layer, `${where}: row without a non-empty string name: ${JSON.stringify(row)?.slice(0, 100)}`)
          continue
        }
        usedRowNames.add(row.name)
        if (!ALLOWED_ROW_NAMES.has(row.name)) {
          fail(layer, `${where}: row id=${JSON.stringify(row.id)} uses name ${JSON.stringify(row.name)} outside the allowlist — check the re-sync base noted at the top of dsh/preset/agent.cordis.yml before extending ALLOWED_ROW_NAMES`)
        }
        if (row.name === 'cordis:group' && row.config !== undefined) visit(row.config, `${where}/${row.id} (group config)`)
      }
    }
    visit(rows, 'agent.cordis.yml')
    // The allowlist is bidirectional: an entry no row uses anymore is stale.
    // ioayn-dsh and cordis:group are structural names, so they stay exempt.
    const structurallyExempt = new Set(['ioayn-dsh', 'cordis:group'])
    for (const name of ALLOWED_ROW_NAMES) {
      if (!usedRowNames.has(name) && !structurallyExempt.has(name)) {
        fail(layer, `allowlist entry ${name} is not used by any row in agent.cordis.yml (stale ALLOWED_ROW_NAMES entry — remove it)`)
      }
    }
  }

  const delegation = Array.isArray(rows) ? rows.find((row) => row?.id === 'delegation') : undefined
  if (!delegation || delegation.name !== 'cordis:group' || delegation.group !== true) {
    fail(layer, 'agent.cordis.yml: delegation row must be a cordis:group with group: true')
  } else if (Array.isArray(delegation.config)) {
    const subagentRows = delegation.config.filter(
      (entry) => entry?.name === '@deepseek-ai/dsh-tool-subagent' && typeof entry?.config?.toolName === 'string',
    )
    for (const role of ROLE_TOOL_NAMES) {
      const hits = subagentRows.filter((entry) => entry.config.toolName === role)
      if (hits.length !== 1) {
        fail(layer, `delegation role tool ${role}: expected exactly one row, found ${hits.length}`)
        continue
      }
      const { persona, toolFilter } = hits[0].config
      if (typeof persona !== 'string' || persona.trim() === '') {
        fail(layer, `delegation role tool ${role}: persona must be a non-empty string`)
      } else if (persona.includes('disallowedTools')) {
        fail(layer, `delegation role tool ${role}: persona must not contain 'disallowedTools'`)
      } else {
        rolePersonas[role] = persona
      }
      const deny = toolFilter?.deny
      if (!Array.isArray(deny) || deny.some((item) => typeof item !== 'string')) {
        fail(layer, `delegation role tool ${role}: toolFilter.deny must be an array of strings`)
      }
    }
  }

  let presetMeta
  try {
    presetMeta = parseYaml(readText(join(dshDir, 'preset', 'preset.yml')))
  } catch (error) {
    fail(layer, `preset.yml is not parseable YAML: ${error.message}`)
  }
  if (presetMeta !== undefined) {
    if (typeof presetMeta.name !== 'string' || presetMeta.name.trim() === '') {
      fail(layer, 'preset.yml: name must be a non-empty string')
    }
    if (typeof presetMeta.description !== 'string' || presetMeta.description.trim() === '') {
      fail(layer, 'preset.yml: description must be a non-empty string')
    }
    if (typeof presetMeta.order !== 'number' || !Number.isFinite(presetMeta.order)) {
      fail(layer, `preset.yml: order must be a finite number, found ${JSON.stringify(presetMeta.order)}`)
    }
  }

  // The preset id is the directory bin.mjs installs into; it must stay a valid slug.
  const binText = readText(join(dshDir, 'bin.mjs'))
  const presetId = binText.match(/['"]\.agent-presets['"]\s*,\s*['"]([^'"]+)['"]/)?.[1]
  if (presetId === undefined) {
    fail(layer, 'bin.mjs: could not locate the .agent-presets install target')
  } else if (!/^[a-z0-9][a-z0-9-]*$/.test(presetId)) {
    fail(layer, `preset id ${JSON.stringify(presetId)} must match ^[a-z0-9][a-z0-9-]*$`)
  }
}

// ── layer 2: skill frontmatter ───────────────────────────────────────────────

{
  const layer = 'layer 2 skill frontmatter'
  const skillsDir = join(dshDir, 'preset', 'skills')
  const expectedSkills = ['learn-code', 'resume-learning', 'view-atlas']

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  for (const expected of expectedSkills) {
    if (!skillDirs.includes(expected)) fail(layer, `missing preset skill directory ${expected}/`)
  }
  for (const dir of skillDirs) {
    if (!expectedSkills.includes(dir)) {
      fail(layer, `unexpected preset skill directory ${dir}/ (preset skills must match the expected set exactly)`)
    }
  }

  for (const dir of skillDirs) {
    const skillPath = join(skillsDir, dir, 'SKILL.md')
    if (!existsSync(skillPath)) {
      fail(layer, `skill directory ${dir}/ has no SKILL.md`)
      continue
    }
    const text = readText(skillPath)
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (!match) {
      fail(layer, `${dir}/SKILL.md has no frontmatter block`)
      continue
    }
    const frontmatterText = match[1]
    if (!frontmatterText.includes('# synced-from:')) {
      fail(layer, `${dir}/SKILL.md frontmatter is missing the '# synced-from:' provenance comment`)
    }
    let frontmatter
    try {
      frontmatter = parseYaml(frontmatterText)
    } catch (error) {
      fail(layer, `${dir}/SKILL.md frontmatter is not parseable YAML: ${error.message}`)
      continue
    }
    if (frontmatter?.name !== dir) {
      fail(layer, `${dir}/SKILL.md: name ${JSON.stringify(frontmatter?.name)} must equal the directory name`)
    }
    if (typeof frontmatter?.name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(frontmatter.name)) {
      fail(layer, `${dir}/SKILL.md: name ${JSON.stringify(frontmatter?.name)} is not kebab-case`)
    }
    if (typeof frontmatter?.description !== 'string' || frontmatter.description.trim() === '') {
      fail(layer, `${dir}/SKILL.md: description must be a non-empty string`)
    }
    if (frontmatter?.['disable-model-invocation'] !== true) {
      fail(layer, `${dir}/SKILL.md: disable-model-invocation must be exactly true`)
    }
  }

  // Residual Claude-host tokens must not survive the dsh adaptation.
  // ('MCP' needs no entry here: the /mcp/i check below covers it.)
  const bannedTokens = ['CLAUDE_SKILL_DIR', '$ARGUMENTS', '/ioayn:']
  for (const file of walk(skillsDir)) {
    const rel = toRel(file)
    const text = readText(file)
    for (const token of bannedTokens) {
      if (text.includes(token)) fail(layer, `${rel}: residual token ${JSON.stringify(token)} found`)
    }
    if (/mcp/i.test(text)) fail(layer, `${rel}: case-insensitive 'mcp' residual found`)
  }
}

// ── layer 3: tool alignment ──────────────────────────────────────────────────

{
  const layer = 'layer 3 tool alignment'
  let lib
  try {
    lib = await import(pathToFileURL(join(dshDir, 'lib', 'index.js')).href)
  } catch (error) {
    fail(layer, `cannot import dsh/lib/index.js: ${error.message}`)
  }
  if (lib) {
    const tools = lib.IOAYN_TOOLS
    const params = lib.IOAYN_TOOL_PARAMS
    if (!Array.isArray(tools) || tools.length !== 27) {
      fail(layer, `IOAYN_TOOLS must hold 27 tools, found ${Array.isArray(tools) ? tools.length : typeof tools}`)
    }
    if (!params || typeof params !== 'object' || Object.keys(params).length !== 27) {
      fail(layer, `IOAYN_TOOL_PARAMS must hold 27 entries, found ${params && typeof params === 'object' ? Object.keys(params).length : typeof params}`)
    }
    if (Array.isArray(tools) && params && typeof params === 'object') {
      const toolNames = new Set(tools.map((tool) => tool?.name))
      const paramNames = new Set(Object.keys(params))
      for (const name of toolNames) {
        if (!paramNames.has(name)) fail(layer, `tool ${name} has no IOAYN_TOOL_PARAMS entry`)
      }
      for (const name of paramNames) {
        if (!toolNames.has(name)) fail(layer, `IOAYN_TOOL_PARAMS entry ${name} has no matching IOAYN_TOOLS tool`)
      }
      for (const tool of tools) {
        const spec = params[tool?.name]
        if (!spec) continue
        const shapeKeys = Object.keys(tool.inputSchema?.shape ?? {})
        const specKeys = Object.keys(spec)
        const schemaOnly = shapeKeys.filter((key) => !Object.hasOwn(spec, key))
        const specOnly = specKeys.filter((key) => !shapeKeys.includes(key))
        if (schemaOnly.length) fail(layer, `${tool.name}: inputSchema params missing from the dsh DSL spec: ${schemaOnly.join(', ')}`)
        if (specOnly.length) fail(layer, `${tool.name}: dsh DSL spec has params absent from inputSchema: ${specOnly.join(', ')}`)
      }
    }
  }
}

// ── layer 3.5: copy drift ────────────────────────────────────────────────────

{
  const layer = 'layer 3.5 copy drift'
  const directoryPairs = [
    { preset: 'preset/skills/learn-code/references', source: 'skills/learn-code/references' },
    { preset: 'preset/skills/learn-code/references/agents', source: 'agents' },
    { preset: 'preset/skills/learn-code/templates', source: 'skills/learn-code/templates' },
  ]
  for (const { preset, source } of directoryPairs) {
    const presetDir = join(dshDir, preset)
    const sourceDir = join(root, source)
    let presetFiles
    let sourceFiles
    try {
      // Compare every regular file, not just *.md copies: isFile() filtering
      // also keeps nested directories (e.g. references/agents/) out of the
      // comparison on both sides.
      presetFiles = readdirSync(presetDir).filter((name) => statSync(join(presetDir, name)).isFile())
      sourceFiles = readdirSync(sourceDir).filter((name) => statSync(join(sourceDir, name)).isFile())
    } catch (error) {
      fail(layer, `cannot list ${preset} / ${source}: ${error.message}`)
      continue
    }
    for (const name of presetFiles) {
      if (!sourceFiles.includes(name)) fail(layer, `dsh/${preset}/${name} has no source counterpart at ${source}/${name}`)
    }
    for (const name of sourceFiles) {
      if (!presetFiles.includes(name)) fail(layer, `${source}/${name} is not mirrored into dsh/${preset}/`)
    }
    for (const name of presetFiles) {
      if (!sourceFiles.includes(name)) continue
      if (!readFileSync(join(presetDir, name)).equals(readFileSync(join(sourceDir, name)))) {
        fail(layer, `dsh/${preset}/${name} differs from ${source}/${name} (copy drift — re-sync the preset)`)
      }
    }
  }

  // The four delegation personas are embedded copies of the agents/<role>.md
  // bodies. Both sides are normalized by stripping the frontmatter, dropping
  // leading blank lines, trimEnd, and one trailing newline (the YAML `|`
  // block keeps exactly one trailing newline).
  const roleFiles = {
    slice_explorer: 'slice-explorer.md',
    learning_tutor: 'learning-tutor.md',
    runtime_verifier: 'runtime-verifier.md',
    knowledge_curator: 'knowledge-curator.md',
  }
  const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const normalizeBody = (text) => text.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd() + '\n'
  for (const role of ROLE_TOOL_NAMES) {
    const persona = rolePersonas[role]
    if (persona === undefined) continue // layer 1 already reported the missing row
    const body = stripFrontmatter(readText(join(root, 'agents', roleFiles[role])))
    if (normalizeBody(body) !== normalizeBody(persona)) {
      fail(layer, `delegation persona ${role} drifted from the body of agents/${roleFiles[role]}`)
    }
  }
}

// ── layer 4: install drill ───────────────────────────────────────────────────

{
  const layer = 'layer 4 install drill'
  const home = mkdtempSync(join(tmpdir(), 'ioayn-verify-home-'))
  try {
    execFileSync('node', [join(dshDir, 'bin.mjs'), 'install'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const installed = join(home, '.agent-presets', 'ioayn')
    for (const rel of ['agent.cordis.yml', 'preset.yml', 'skills/learn-code/SKILL.md', '.ioayn-dsh-version']) {
      if (!existsSync(join(installed, rel))) fail(layer, `install drill: ${rel} missing from ${installed}`)
    }
    // bin.mjs must rewrite the ioayn-dsh row of the INSTALLED copy to an
    // absolute path to the plugin entry (dsh resolves bare row names from
    // the harness base, not the profile's node_modules). The source template
    // keeps the bare name, so layer 1's allowlist needs no change.
    const installedRowName = readText(join(installed, 'agent.cordis.yml'))
      .match(/- id: ioayn-tools\r?\n  name: '(.*)'/)?.[1]
    if (installedRowName === undefined || !isAbsolute(installedRowName) || !existsSync(installedRowName)) {
      fail(layer, `install drill: ioayn-tools row in the installed copy must be an absolute path to an existing file, got ${JSON.stringify(installedRowName)}`)
    }
  } catch (error) {
    fail(layer, `install drill failed: ${error.stderr?.toString().trim() ?? error.message}`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`verify-dsh FAILED (${failures.length} problem${failures.length === 1 ? '' : 's'}):`)
  for (const problem of failures) console.error(`  ${problem}`)
  process.exitCode = 1
} else {
  console.log('verify-dsh: OK')
}
