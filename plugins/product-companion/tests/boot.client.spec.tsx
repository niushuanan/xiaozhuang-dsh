// @vitest-environment jsdom
import * as React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as stores from '@deepseek-ai/dsh-client-store'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

it('activates the companion through the real target slot registry and services', async () => {
  const runtime = await SlotTestRuntime.create()
  try {
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    runtime.ctx.provide('uiWorkspace', { startSession() {}, openSession() {} } as never)
    runtime.slots.register({ name: 'root', children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
      'settings.section.icon': { kind: 'keyed', scope: 'root' },
    } } as never, (() => null) as never)
    let bundled: { factory: (require: (id: string) => unknown) => { apply: typeof apply; inject: typeof inject } } | undefined
    const code = readFileSync('plugins/product-companion/lib/client.js', 'utf8')
    Function('window', 'document', code)({ __ModuleLoader__: { load: (row: typeof bundled) => { bundled = row } } }, document)
    const plugin = bundled!.factory(id => {
      if (id === 'react') return React
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      if (id === '@deepseek-ai/dsh-client-store') return stores
      if (id === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment }
      throw Error(id)
    })
    await runtime.mount(plugin)
    expect(runtime.slots.entries('shell.overlay')).toHaveLength(1)
    expect(runtime.slots.entries('settings.section')).toHaveLength(1)
    expect(runtime.slots.entries('settings.section.icon')).toHaveLength(1)
  } finally { await runtime.dispose() }
})
