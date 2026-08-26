import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))

test('install/uninstall lifecycle', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ioayn-dsh-home-'))
  const env = { ...process.env, DSH_HOME: home }
  const out = (args) => execFileSync('node', [bin, ...args], { env, encoding: 'utf8' })
  assert.equal(out(['status']).includes('not installed'), true, 'fresh home status must report not installed')
  out(['install'])
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'agent.cordis.yml')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'skills', 'learn-code', 'SKILL.md')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'skills', 'learn-code', 'references', 'agents', 'slice-explorer.md')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', '.ioayn-dsh-version')))
  // dsh resolves bare preset row names from the harness base, not the
  // profile's node_modules — install must rewrite the ioayn-dsh row to an
  // absolute path to this package's plugin entry.
  const installed = readFileSync(join(home, '.agent-presets', 'ioayn', 'agent.cordis.yml'), 'utf8')
  const m = installed.match(/- id: ioayn-tools\n  name: '(.+)'/)
  assert.ok(m, 'ioayn-tools row present in installed copy')
  assert.ok(!m[1].includes('ioayn-dsh') && isAbsolute(m[1]), `rewritten to absolute path, got: ${m[1]}`)
  assert.ok(existsSync(m[1]), 'plugin entry file exists')
  const mod = await import(pathToFileURL(m[1]).href)
  assert.equal(typeof mod.apply, 'function')
  assert.equal(out(['status']).includes('installed v'), true)
  const conflict = spawnSync('node', [bin, 'install'], { env, encoding: 'utf8' })
  assert.equal(conflict.status, 1, 'second install must exit 1 without --force')
  assert.equal(conflict.stderr.includes('already installed'), true, 'conflict must explain already installed')
  out(['install', '--force'])
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', '.ioayn-dsh-version')), 'version marker must survive --force reinstall')
  assert.equal(out(['status']).includes('installed v'), true, 'status must report installed v after --force')
  out(['uninstall'])
  assert.equal(existsSync(join(home, '.agent-presets', 'ioayn')), false)
})

test('usage exits non-zero for unknown command', () => {
  const home = mkdtempSync(join(tmpdir(), 'ioayn-dsh-usage-'))
  const env = { ...process.env, DSH_HOME: home }
  let failed = false
  try { execFileSync('node', [bin, 'bogus'], { env, encoding: 'utf8' }) } catch { failed = true }
  assert.ok(failed)
})
