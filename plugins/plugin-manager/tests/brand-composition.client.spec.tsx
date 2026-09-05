// @vitest-environment jsdom
import { resolve } from 'node:path'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { SlotTestRuntime, stubSettingsScope, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import * as Layout from '@deepseek-ai/dsh-client-ui-layout/client'
import * as Sidebar from '@deepseek-ai/dsh-client-ui-sidebar/client'
import * as SettingsShell from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { en, zh } from '../../../packages/client/locale/src/locales/index.ts'
import * as PluginCatalog from '../src/client/index.ts'

usePinnedBrowserLanguages('zh-CN')
let runtime: SlotTestRuntime | undefined
let fixtureDirectory: string | undefined

afterEach(async () => {
  cleanup()
  await runtime?.dispose()
  await runtime?.ctx.fiber.dispose()
  if (fixtureDirectory !== undefined) await rm(fixtureDirectory, { recursive: true, force: true })
  fixtureDirectory = undefined
  runtime = undefined
  document.title = ''
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('product brand Loader composition', () => {
  it('shows the product identity and restores the upstream fallback when the plugin unloads', async () => {
    vi.stubEnv('DSH_CLIENT_VERSION', '0.1.3-alpha.1')
    vi.stubEnv('DSH_CLIENT_GIT_DIRTY', 'true')
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    runtime = await SlotTestRuntime.create()
    const ctx = runtime.ctx
    const locale = new LocaleRuntime(ctx)
    locale.register('common', { en, zh })
    ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    ctx.provide('theme', new ThemeRuntime(ctx, stubSettingsScope().scope))
    ctx.provide('uiWorkspace', { startSession() {} } as never)
    ctx.provide('connection', {
      state: { getSnapshot: () => 'connected', subscribe: () => () => {} },
      reconnect() {},
    } as never)
    ctx.provide('settingsScope', stubSettingsScope().scope)
    ctx.provide('remote', { $host: { isLoopback: false } } as never)
    ctx.provide('remote.settings', {} as never)

    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-client-ui-sidebar/client', Sidebar],
      ['@deepseek-ai/dsh-client-ui-layout/client', Layout],
      ['@deepseek-ai/dsh-client-ui-plugin-catalog/client', PluginCatalog],
      ['@deepseek-ai/dsh-client-ui-settings-general/client', SettingsShell],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    fixtureDirectory = await mkdtemp(resolve(tmpdir(), 'dsh-product-brand-'))
    const fixturePath = resolve(fixtureDirectory, 'cordis.yml')
    await copyFile(resolve('plugins/plugin-manager/tests/fixtures/brand.cordis.yml'), fixturePath)
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(fixturePath).href },
    })
    await ctx.loader.await()

    const rendered = runtime.renderRoot()
    expect(rendered.getByText('Xiaozhuang DSH')).toBeTruthy()
    expect(rendered.queryByText('DSH 本地构建')).toBeNull()
    expect(rendered.queryByText('0.1.3-alpha.1-dirty')).toBeNull()
    expect(document.title).toBe('Xiaozhuang DSH')

    const id = await runtime.sessions.add({
      id: 'brand-session' as never,
      summary: { title: '项目进度', displayTitle: '项目进度' },
      session: {},
    }, { current: true })
    expect(document.title).toBe('项目进度 — Xiaozhuang DSH')
    await runtime.sessions.updateSummary(id, { title: '更新的项目进度' })
    expect(document.title).toBe('更新的项目进度 — Xiaozhuang DSH')

    fireEvent.click(rendered.getByRole('button', { name: '设置', exact: true }))
    const productRow = rendered.getByRole('button', { name: '小庄的插件', exact: true })
    expect(productRow.querySelector('svg path')?.getAttribute('d'))
      .toBe('M6.1 3.1Q6.6 7.8 11.3 8.3Q6.6 8.8 6.1 13.5Q5.6 8.8 0.9 8.3Q5.6 7.8 6.1 3.1Z')
    const generalGlyph = rendered.getByRole('button', { name: '通用设置', exact: true }).querySelector('svg')!.innerHTML

    const product = [...ctx.loader.entries()].find(entry => entry.options.id === 'product-catalog')!
    await act(async () => { await product.fiber!.dispose() })
    expect(rendered.queryByText('Xiaozhuang DSH')).toBeNull()
    expect(rendered.getByText('DSH 本地构建')).toBeTruthy()
    expect(document.title).toBe('更新的项目进度 — DSH 本地构建')
    expect(rendered.queryByRole('button', { name: '小庄的插件', exact: true })).toBeNull()
    expect(rendered.getByRole('button', { name: '通用设置', exact: true }).querySelector('svg')!.innerHTML)
      .toBe(generalGlyph)
  })
})
