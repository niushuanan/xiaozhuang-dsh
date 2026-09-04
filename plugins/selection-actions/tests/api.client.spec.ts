import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryUnavailableError, rememberSelection } from '../src/client/api.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('selection memory API recovery', () => {
  it('identifies a disabled memory plugin instead of leaking a JSON or HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })))

    await expect(rememberSelection({
      selectedText: '核心功能', context: '上下文', sessionId: 's1', sourceType: 'dsh',
      messageRole: 'assistant', messageSeq: 8,
      rect: { left: 0, top: 0, bottom: 0, width: 0 },
    })).rejects.toBeInstanceOf(MemoryUnavailableError)
  })
})
