#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

const [cmd, ...rest] = process.argv.slice(2)
const force = rest.includes('--force')

try {
  if (cmd === 'install') {
    if (!existsSync(presetSrc)) fatal(`preset template missing: ${presetSrc}`)
    if (existsSync(presetDst()) && !force) {
      const old = installedVersion()
      console.error(`ioayn preset already installed${old ? ` (v${old})` : ''}; rerun with --force to replace (current package v${version})`)
      process.exit(1)
    }
    mkdirSync(join(dshHome(), '.agent-presets'), { recursive: true })
    rmSync(presetDst(), { recursive: true, force: true })
    cpSync(presetSrc, presetDst(), { recursive: true })
    cpSync(join(pkgDir, 'package.json'), join(presetDst(), '.ioayn-dsh-package.json'))
    writeFileSync(join(presetDst(), '.ioayn-dsh-version'), version)
    console.log(`installed IOAYN preset v${version} → ${presetDst()}`)
  } else if (cmd === 'uninstall') {
    if (!existsSync(presetDst())) { console.log('ioayn preset not installed'); process.exit(0) }
    rmSync(presetDst(), { recursive: true, force: true })
    console.log(`removed ${presetDst()}`)
  } else if (cmd === 'status') {
    const libOk = existsSync(join(pkgDir, 'lib', 'index.js'))
    console.log(`package: ioayn-dsh v${version} (plugin build: ${libOk ? 'present' : 'MISSING — run npm run build'})`)
    console.log(`preset: ${existsSync(presetDst()) ? `installed v${installedVersion() ?? 'unknown'}` : 'not installed'} at ${presetDst()}`)
  } else {
    const usage = 'usage: ioayn-dsh install [--force] | uninstall | status'
    if (cmd) { console.error(usage); process.exit(1) }
    console.log(usage)
  }
} catch (error) {
  fatal(String(error?.message ?? error))
}
