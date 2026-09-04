import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const host = await readFile(new URL('src/plugin.ts', root), 'utf8')
const client = await readFile(new URL('src/client/index.ts', root), 'utf8')
const engine = await readFile(new URL('src/client/useSmoothStreamContent.ts', root), 'utf8')
const follow = await readFile(new URL('src/client/teleprompterGlide.ts', root), 'utf8')
const assistant = await readFile(new URL('src/client/TypewriterAssistantNodeView.tsx', root), 'utf8')

test('is a Xiaozhuang-owned Harness package rather than the upstream package', () => {
  assert.equal(manifest.name, '@deepseek-ai/dsh-fluent-output')
  assert.equal(manifest.version, '1.0.0')
  assert.match(host, /export const name = '@deepseek-ai\/dsh-fluent-output'/)
})

test('uses hot-plug as the only enable state and respects manual thinking control', () => {
  assert.match(client, /registrant: 'fluent-output'/)
  assert.match(client, /thinkAutoExpand: false/)
  assert.doesNotMatch(client, /settings\.plugin\.item|SmoothStreamCard|SettingsCell/)
})

test('covers assistant output and every agent-owned tool or workflow row', () => {
  assert.match(client, /key: 'assistant-step'/)
  assert.match(client, /wrapAgentChatRows/)
  assert.match(client, /ctx\.on\('slots\/changed'/)
  assert.match(client, /SKIP_WRAP = new Set\(\['assistant-step', 'user', 'steering', 'command-input'\]\)/)
})

test('retains adaptive reveal, bounded backlog and reader-controlled follow', () => {
  assert.match(engine, /computeAdaptiveQueueStep/)
  assert.match(engine, /LIVE_LAG_CHAR_CEILING/)
  assert.match(engine, /BACKLOG_SECOND_CEILING/)
  assert.match(follow, /readerScrolledUp/)
  assert.match(follow, /FOLLOW_REPIN_PX/)
  assert.match(assistant, /prefers-reduced-motion: reduce/)
})
