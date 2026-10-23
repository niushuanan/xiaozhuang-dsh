import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.ts'
import type { EgoContext } from '../src/types.ts'

vi.mock('../src/ffmpeg-installation.ts', () => ({
  getSharedFfmpegInstallationManager: () => ({ check: async () => ({}) }),
}))

function registeredTools(status: string) {
  const tools: ToolDefinition[] = []
  const reader = { readFrom: () => ({ text: status, nextOffset: status.length, lossy: false }) }
  const ctx: EgoContext = {
    tools: { register: tool => { tools.push(tool as ToolDefinition) } },
    subprocess: { spawn: () => ({
      done: Promise.resolve({ exitCode: 0, signal: null }),
      collected: { stdout: reader },
    }) },
  }
  apply(ctx)
  return tools
}

describe('browser startup', () => {
  it.skipIf(process.platform !== 'darwin')('uses the Mac desktop without requiring an X server', async () => {
    const runtime = await import(new URL('../runtime/ego-linux/src/chrome.mjs', import.meta.url).href)
    await expect(runtime.ensureXDisplay()).resolves.toMatchObject({ pid: null, launched: false })
  })

  it('reports an installed CLI separately from a running browser', async () => {
    const tool = registeredTools('{"running":false}').find(tool => tool.name === 'ego_status')!
    expect(await tool.execute({}, {} as ToolRunContext)).toMatchObject({
      ok: true, installed: true, available: false, running: false,
    })
  })

  it('keeps one browser script tool and uses readable action titles', () => {
    const tools = registeredTools('{"running":false}')
    expect(tools.some(tool => tool.name === 'ego_cli')).toBe(false)
    expect(tools.some(tool => tool.name === 'ego_script')).toBe(true)
    const navigate = tools.find(tool => tool.name === 'ego_navigate')!
    expect(navigate.presentCall?.({ url: 'https://example.com' })).toMatchObject({ title: '浏览网页' })
  })
})
