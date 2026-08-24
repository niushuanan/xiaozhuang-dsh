import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { voiceApiHandler } from '../src/voice-host.ts'

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method,
    url,
    headers: {
      host: '127.0.0.1:3080',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
  }) as unknown as IncomingMessage
}

function response(): { res: ServerResponse; body: () => { status: number; value: unknown } } {
  let text = ''
  const headers = new Map<string, string>()
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string) => { headers.set(key, value) },
    end: (value?: string | Buffer) => { text = value?.toString() ?? '' },
  } as unknown as ServerResponse
  return {
    res,
    body: () => ({ status: res.statusCode, value: JSON.parse(text) as unknown }),
  }
}

function context(): Context {
  const stream = vi.fn(async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' } as const
    yield { type: 'text-delta', index: 0, text: '整理后的文字' } as const
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '整理后的文字' } } as const
    yield { type: 'finish', reason: { kind: 'stop' } } as const
  })
  return {
    llm: {
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      listModels: () => Promise.resolve([{
        provider: 'deepseek-official', id: 'deepseek-v4', name: 'DeepSeek V4',
      }]),
      resolveCallConfig: ({ provider, model }: { provider: string; model: string }) => Promise.resolve({ provider, model }),
      stream,
    },
  } as unknown as Context
}

describe('product companion voice host API', () => {
  it('serves only the configured model catalog without credentials', async () => {
    const output = response()
    await voiceApiHandler(context(), request('GET', '/plugins/ui-product-companion/api/voice/models'), output.res)
    expect(output.body()).toEqual({
      status: 200,
      value: {
        groups: [{
          id: 'deepseek-official', name: 'DeepSeek',
          models: [{ id: 'deepseek-v4', name: 'DeepSeek V4' }],
        }],
      },
    })
  })

  it('runs a bounded one-shot model call and returns only processed text', async () => {
    const ctx = context()
    const output = response()
    await voiceApiHandler(ctx, request('POST', '/plugins/ui-product-companion/api/voice/process', {
      provider: 'deepseek-official',
      model: 'deepseek-v4',
      text: '嗯那个请帮我整理一下',
      instruction: '删除口头禅，保持中文。',
    }), output.res)
    expect(output.body()).toEqual({
      status: 200,
      value: { text: '整理后的文字', provider: 'deepseek-official', model: 'deepseek-v4' },
    })
    expect(ctx.llm.stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek-official',
      model: 'deepseek-v4',
      temperature: 0.2,
      maxTokens: 2_048,
    }))
  })

  it('rejects a non-loopback caller before invoking a model', async () => {
    const ctx = context()
    const req = request('POST', '/plugins/ui-product-companion/api/voice/process', { text: 'hello' })
    req.headers.host = 'example.com'
    const output = response()
    await voiceApiHandler(ctx, req, output.res)
    expect(output.body().status).toBe(403)
    expect(ctx.llm.stream).not.toHaveBeenCalled()
  })

  it('auto-selects the first connected model and remembers the working route', async () => {
    const stream = vi.fn(async function* (options: { provider: string }) {
      if (options.provider === 'deepseek-official') {
        yield {
          type: 'finish',
          reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'DeepSeek is not connected' } },
        } as const
        return
      }
      yield { type: 'text-delta', index: 0, text: '可用模型整理结果' } as const
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })
    const ctx = {
      llm: {
        listProviders: () => [
          { id: 'deepseek-official', name: 'DeepSeek' },
          { id: 'kimi-coding', name: 'Kimi' },
        ],
        listModels: (provider: string) => Promise.resolve([{
          provider, id: `${provider}-model`, name: `${provider} model`,
        }]),
        resolveCallConfig: ({ provider, model }: { provider: string; model: string }) => Promise.resolve({ provider, model }),
        stream,
      },
    } as unknown as Context
    const output = response()
    await voiceApiHandler(ctx, request('POST', '/plugins/ui-product-companion/api/voice/process', {
      text: '测试自动模型',
    }), output.res)
    expect(output.body()).toEqual({
      status: 200,
      value: { text: '可用模型整理结果', provider: 'kimi-coding', model: 'kimi-coding-model' },
    })
    expect(stream.mock.calls.map(call => call[0].provider)).toEqual(['deepseek-official', 'kimi-coding'])
  })
})
