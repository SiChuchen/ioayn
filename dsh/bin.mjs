#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const pkgDir = fileURLToPath(new URL('.', import.meta.url))
const presetSrc = join(pkgDir, 'preset')
const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function presetDst() {
  return join(dshHome(), '.agent-presets', 'ioayn')
}
function installedVersion() {
  const marker = join(presetDst(), '.ioayn-dsh-version')
  return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
}
function fatal(msg) {
  console.error(msg)
  process.exit(1)
}
function pluginEntry() {
  return join(pkgDir, 'lib', 'index.js')
}
// The source template keeps the bare row name; only the installed copy is
// rewritten. dsh resolves bare preset row names from the harness install's
// own base, not the profile's node_modules, so a bare 'ioayn-dsh' row fails
// to mount with MODULE_NOT_FOUND. Absolute row names are supported by
// dsh-agent-presets (isAbsolute → pathToFileURL → internal import).
const BARE_ROW = "name: 'ioayn-dsh'"
function rewritePluginRow() {
  const ymlPath = join(presetDst(), 'agent.cordis.yml')
  const raw = readFileSync(ymlPath, 'utf8')
  if (raw.split(BARE_ROW).length !== 2) {
    fatal(`expected exactly one ${BARE_ROW} row in ${ymlPath} (template drift — check dsh/preset/agent.cordis.yml)`)
  }
  writeFileSync(ymlPath, raw.replace(BARE_ROW, `name: '${pluginEntry()}'`))
}

const [cmd, ...rest] = process.argv.slice(2)
const force = rest.includes('--force')

try {
  if (cmd === 'install') {
    if (!existsSync(presetSrc)) fatal(`preset template missing: ${presetSrc}`)
    // Check before any mutation: a failed install must not leave a
    // marker-less preset copy behind.
    if (!existsSync(pluginEntry())) {
      fatal(`plugin build missing: ${pluginEntry()} — run npm run build before install (the preset ioayn-tools row must point at it)`)
    }
    if (existsSync(presetDst()) && !force) {
      const old = installedVersion()
      console.error(`ioayn preset already installed${old ? ` (v${old})` : ''}; rerun with --force to replace (current package v${version})`)
      process.exit(1)
    }
    mkdirSync(join(dshHome(), '.agent-presets'), { recursive: true })
    rmSync(presetDst(), { recursive: true, force: true })
    cpSync(presetSrc, presetDst(), { recursive: true })
    rewritePluginRow()
    cpSync(join(pkgDir, 'package.json'), join(presetDst(), '.ioayn-dsh-package.json'))
    writeFileSync(join(presetDst(), '.ioayn-dsh-version'), version)
    console.log(`installed IOAYN preset v${version} → ${presetDst()}`)
  } else if (cmd === 'uninstall') {
    if (!existsSync(presetDst())) { console.log('ioayn preset not installed'); process.exit(0) }
    rmSync(presetDst(), { recursive: true, force: true })
    console.log(`removed ${presetDst()}`)
  } else if (cmd === 'status') {
    const libOk = existsSync(pluginEntry())
    console.log(`package: ioayn-dsh v${version} (plugin build: ${libOk ? 'present' : 'MISSING — run npm run build'})`)
    console.log(`preset: ${existsSync(presetDst()) ? `installed v${installedVersion() ?? 'unknown'}` : 'not installed'} at ${presetDst()}`)
    if (existsSync(presetDst())) {
      const rowName = readFileSync(join(presetDst(), 'agent.cordis.yml'), 'utf8')
        .match(/- id: ioayn-tools\r?\n  name: '(.*)'/)?.[1]
      const linkOk = rowName !== undefined && isAbsolute(rowName) && existsSync(rowName)
      console.log(`plugin link: ${linkOk ? 'ok' : 'MISSING — rerun ioayn-dsh install'}`)
    }
  } else {
    const usage = 'usage: ioayn-dsh install [--force] | uninstall | status'
    if (cmd) { console.error(usage); process.exit(1) }
    console.log(usage)
  }
} catch (error) {
  fatal(String(error?.message ?? error))
}
