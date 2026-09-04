import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'

import { apply } from '../lib/index.js'

test('runs Z Code app-server with an ephemeral model and thought level', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-zcode-provider-'))
  const configPath = join(root, 'config.json')
  const cliPath = join(root, 'zcode.cjs')
  await writeFile(cliPath, '')
  await writeFile(configPath, JSON.stringify({
    provider: {
      'builtin:zai': {
        name: 'Z.AI test',
        kind: 'anthropic',
        enabled: true,
        options: { apiKey: 'test-secret', baseURL: 'https://example.invalid/api', apiKeyRequired: true },
        models: {
          'GLM-5.3': {
            limit: { context: 100000, output: 10000 },
            modalities: { input: ['text'], output: ['text'] },
            reasoning: { enabled: true, variants: ['low', 'high', 'max'], defaultVariant: 'max' },
          },
        },
      },
    },
  }))

  let provider
  let spawnSpec
  let createParams
  const toProvider = new PassThrough()
  const fromProvider = new PassThrough()
  const stderr = new PassThrough()
  let input = ''
  let terminateProcess
  const done = new Promise(resolve => { terminateProcess = () => resolve({ exitCode: null, signal: 'SIGTERM' }) })

  fromProvider.on('data', (chunk) => {
    input += chunk.toString()
    for (;;) {
      const index = input.indexOf('\n')
      if (index < 0) break
      const line = input.slice(0, index)
      input = input.slice(index + 1)
      if (line.length === 0) continue
      const message = JSON.parse(line)
      if (message.method === 'session/create') {
        createParams = message.params
        toProvider.write(JSON.stringify({
          id: message.id,
          result: {
            messages: [],
            session: { sessionId: 'sess-test' },
            projection: { status: 'idle' },
          },
        }) + '\n')
      } else if (message.method === 'session/send') {
        toProvider.write(JSON.stringify({ id: message.id, result: { accepted: true } }) + '\n')
      } else if (message.method === 'session/read') {
        toProvider.write(JSON.stringify({
          id: message.id,
          result: {
            projection: { status: 'idle' },
            messages: [{
              info: { role: 'assistant', finish: 'stop', time: { completed: Date.now() } },
              parts: [{ type: 'text', text: 'zcode-ready' }],
            }],
          },
        }) + '\n')
      } else if (message.method === 'session/close') {
        toProvider.write(JSON.stringify({ id: message.id, result: {} }) + '\n')
      }
    }
  })

  const processHandle = {
    pid: 123,
    stdin: fromProvider,
    stdout: toProvider,
    stderr,
    collected: {},
    done,
    terminate() { terminateProcess() },
    waitForExit: async () => true,
  }
  const ctx = {
    logger: { warn() {} },
    subagents: { registerProvider(value) { provider = value } },
    subprocess: { spawn(spec) { spawnSpec = spec; return processHandle } },
  }
  apply(ctx, { configPath, cliPath, reasoningEffort: 'high' })

  const run = await provider.start({
    prompt: [{ type: 'text', text: 'Independent review' }],
    signal: new AbortController().signal,
    parent: { session: { header: { cwd: root } } },
  })
  const result = await run.result

  assert.equal(provider.name, 'zcode')
  assert.equal(result.stopReason, 'completed')
  assert.equal(result.output[0].text, 'zcode-ready')
  assert.deepEqual(spawnSpec.argv.slice(-2), [cliPath, 'app-server'])
  assert.deepEqual(spawnSpec.stdio, { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 256 * 1024 } })
  assert.equal(createParams.mode, 'edit')
  assert.equal(createParams.thoughtLevel, 'high')
  assert.equal(createParams.runtimeModel.model.variant, 'high')
  assert.equal(createParams.runtimeModel.provider.apiKey.value, 'test-secret')
  assert.deepEqual(
    createParams.runtimeModel.provider.models[0].reasoning.levels.map(level => level.value),
    ['low', 'high', 'max'],
  )
})
