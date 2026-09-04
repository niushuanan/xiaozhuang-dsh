import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')

test('uses the native subagent pool by default and escalates selectively', () => {
  assert.match(host, /Native execution is the default/)
  assert.match(host, /Use subagent for fresh independent work and subagent_fork only when/)
  assert.match(host, /Routine implementation, research, and testing stay in this native pool/)
  assert.match(host, /subagent_codex/)
  assert.match(host, /subagent_zcode/)
  assert.match(host, /complete standalone prompt/)
  assert.match(host, /run_in_background: true/)
  assert.match(host, /Do not automatically call an external expert for ordinary tasks/)
  assert.match(host, /genuinely complex, a native attempt is blocked or insufficient/)
})

test('keeps implementation and review independent without always calling both experts', () => {
  assert.match(host, /assign review to a different lane from the implementer/)
  assert.match(host, /A review prompt is read-only by default/)
  assert.match(host, /return findings with severity and evidence/)
  assert.match(host, /Normally use one external reviewer/)
  assert.match(host, /Use both.*only for cross-cutting or unusually high-risk work/)
})

test('applies the existing Teamwork dispatch gate to external collaborators', () => {
  assert.match(host, /TEAMWORK_DELEGATION_TOOLS/)
  assert.match(host, /'subagent_codex'/)
  assert.match(host, /'subagent_zcode'/)
  assert.match(host, /TEAMWORK_DELEGATION_TOOLS\.has\(exec\.name\)/)
  assert.match(host, /runningExternal/)
  assert.match(host, /ctx\.on\('tools\/execute'/)
})
