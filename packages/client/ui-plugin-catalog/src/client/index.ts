/** Browser half of the native Xiaozhuang plugin catalog. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginCatalogSection, type PluginArchive, type PluginCatalogInjected, type PluginStatusSnapshot } from './PluginCatalogSection.tsx'

const API_PATH = '/plugins/xiaozhuang-plugins/api'
export const inject = ['slots']

async function jsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? fallback)
  return body
}

async function loadStatus(): Promise<PluginStatusSnapshot> {
  return jsonResponse(await fetch(`${API_PATH}/status`, { cache: 'no-store' }), '无法读取插件状态')
}

async function togglePlugin(id: string, enabled: boolean): Promise<PluginStatusSnapshot> {
  return jsonResponse(await fetch(`${API_PATH}/toggle`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, enabled }),
  }), '插件切换失败')
}

function responseFilename(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded !== undefined) return decodeURIComponent(encoded)
  return disposition.match(/filename="([^"]+)"/i)?.[1] ?? 'xiaozhuang-dsh-plugins.zip'
}

async function exportPlugins(ids: readonly string[]): Promise<PluginArchive> {
  const response = await fetch(`${API_PATH}/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? '插件导出失败')
  }
  return { blob: await response.blob(), filename: responseFilename(response) }
}

function saveArchive(archive: PluginArchive): void {
  const url = URL.createObjectURL(archive.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = archive.filename
  anchor.click()
  globalThis.setTimeout(() => { URL.revokeObjectURL(url) }, 0)
}

/** Contribute the native catalog as one Settings section. */
export function apply(ctx: ClientContext): void {
  const injected = (): PluginCatalogInjected => ({ loadStatus, togglePlugin, exportPlugins, saveArchive })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'xiaozhuang-plugins',
    order: 1,
    label: () => '小庄的插件',
    inject: injected,
  }, PluginCatalogSection))
}
