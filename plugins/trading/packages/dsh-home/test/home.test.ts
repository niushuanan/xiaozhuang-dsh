import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { dshHomeDir } from '../src/index.ts'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('native trading data directory', () => {
  it('keeps trading stores below the current host home', () => {
    expect(dshHomeDir({})).toBe(join(homedir(), '.dsh', 'trading'))
    expect(dshHomeDir({ DSH_HOME: '   ' })).toBe(join(homedir(), '.dsh', 'trading'))
    expect(dshHomeDir({ DSH_HOME: 'relative-home' })).toBe(resolve('relative-home', 'trading'))
    expect(dshHomeDir({ DSH_HOME: '~/custom-dsh' })).toBe(join(homedir(), 'custom-dsh', 'trading'))
  })

  it('resolves without reading, copying, or replacing existing host data', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-trading-home-'))
    directories.push(home)
    mkdirSync(join(home, 'sessions'))
    writeFileSync(join(home, 'settings.yaml'), 'agentPreset: standard\n')
    writeFileSync(join(home, 'watchlists.json'), '{"legacy":true}')
    expect(dshHomeDir({ DSH_HOME: home })).toBe(join(home, 'trading'))
    expect(existsSync(join(home, 'trading'))).toBe(false)
    expect(readFileSync(join(home, 'settings.yaml'), 'utf8')).toBe('agentPreset: standard\n')
    expect(readFileSync(join(home, 'watchlists.json'), 'utf8')).toBe('{"legacy":true}')
  })
})
