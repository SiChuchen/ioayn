import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))

test('install/uninstall lifecycle', () => {
  const home = mkdtempSync(join(tmpdir(), 'ioayn-dsh-home-'))
  const env = { ...process.env, DSH_HOME: home }
  const out = (args) => execFileSync('node', [bin, ...args], { env, encoding: 'utf8' })
  out(['install'])
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'agent.cordis.yml')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'skills', 'learn-code', 'SKILL.md')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', 'skills', 'learn-code', 'references', 'agents', 'slice-explorer.md')))
  assert.ok(existsSync(join(home, '.agent-presets', 'ioayn', '.ioayn-dsh-version')))
  assert.equal(out(['status']).includes('installed v'), true)
  let failed = false
  try { out(['install']) } catch { failed = true }
  assert.ok(failed, 'second install must fail without --force')
  out(['install', '--force'])
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
