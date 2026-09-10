/** Native sidebar entry, workspace navigation and return-to-conversation behavior.
 * @vitest-environment jsdom
 */
import { useSyncExternalStore, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { TradingEntry, TradingWorkspace } from '../src/client/TradingWorkspace.tsx'
import { createObservable, createSelectionStore, createWatchlistGroupsStore, createWatchlistStore, type Observable } from '../src/client/store.ts'
import { createChartStateStore } from '../src/client/chart-state.ts'
import { indicators } from '../src/client/indicator-registry.ts'
import { applyColorModeToRoot } from '../src/client/color-mode.ts'
import { setHoldingsPanelOpen } from '../src/client/holdings-store.ts'
import type { MarketLocaleKey } from '../src/client/contract.ts'
import { stageViews } from '../src/client/stage-views.ts'

vi.mock('../src/client/TvChart.tsx', () => ({ TvChart: () => null, toBar: (bar: unknown) => bar, toVolume: (bar: unknown) => bar }))

beforeEach(() => {
  localStorage.clear()
  setHoldingsPanelOpen(false)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function selectorHook<T>(store: Observable<T>) {
  return <S,>(select: (value: T) => S): S => select(useSyncExternalStore(store.subscribe, store.getSnapshot))
}

function setup() {
  const open = createObservable(false)
  const selection = createSelectionStore()
  const watchlists = createWatchlistStore()
  const groups = createWatchlistGroupsStore()
  const chart = createChartStateStore(indicators)
  const props = {
    t: (key: MarketLocaleKey) => key,
    useOpen: selectorHook(open), useSelection: selectorHook(selection), useWatchlists: selectorHook(watchlists),
    useGroups: selectorHook(groups), useChart: selectorHook(chart),
    closeTrading: () => open.set(false), openSession: vi.fn(),
    addInstrument: watchlists.add, removeInstrument: watchlists.remove, selectInstrument: selection.select,
    createGroup: groups.create, renameGroup: groups.rename, deleteGroup: groups.delete,
    assignGroupMember: groups.assignMember, setActiveGroup: groups.setActiveGroup,
    toggleIndicator: chart.togglePreset, setIndicatorParams: chart.setParams,
    setIndicatorVisible: vi.fn(), removeIndicator: vi.fn(), deleteIndicator: vi.fn(async () => true),
  } as unknown as ComponentProps<typeof TradingWorkspace>
  return render(<>
    <div data-native-conversation="">Existing conversation</div>
    <TradingEntry {...({ t: props.t, useOpen: props.useOpen, openTrading: () => open.set(true), wide: true } as ComponentProps<typeof TradingEntry>)} />
    <TradingWorkspace {...props} />
  </>)
}

describe('optional Trading workspace', () => {
  it('keeps the native conversation visible by default and restores it after close', () => {
    const view = setup()
    expect(view.queryByRole('dialog')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'workspace.title' }))
    expect(view.getByRole('dialog', { name: 'workspace.title' })).toBeTruthy()
    expect(view.container.querySelector('[data-dshtrading-quote-pane]')).toBeTruthy()
    expect(view.container.querySelector('[data-native-conversation]')?.textContent).toBe('Existing conversation')
    expect(document.body.dataset.dshtradingChatFolded).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--dsw-futu-up')).toBe('')
    fireEvent.click(view.getByRole('button', { name: 'workspace.backToConversation' }))
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.getByText('Existing conversation')).toBeTruthy()
  })

  it('exposes research views, holdings and scheduled tasks inside the same workspace', () => {
    stageViews.register({ id: 'strategy', titleKey: 'stage.strategy', render: () => <span>Strategy workspace</span> })
    stageViews.register({ id: 'knowledge', titleKey: 'stage.knowledge', render: () => <span>Knowledge workspace</span> })
    const view = setup()
    try {
      fireEvent.click(view.getByRole('button', { name: 'workspace.title' }))
      fireEvent.click(view.getByRole('tab', { name: 'stage.strategy' }))
      expect(view.getByText('Strategy workspace')).toBeTruthy()
      fireEvent.click(view.getByRole('tab', { name: 'stage.knowledge' }))
      expect(view.getByText('Knowledge workspace')).toBeTruthy()
      fireEvent.click(view.getByRole('button', { name: 'trade.holdings.panel.title' }))
      expect(view.container.querySelector('[data-dshtrading-holdings-panel]')).toBeTruthy()
      fireEvent.click(view.getByRole('button', { name: 'tasks.open' }))
      expect(view.getByRole('region', { name: 'tasks.open' })).toBeTruthy()
      fireEvent.click(view.getByRole('button', { name: 'workspace.market' }))
      expect(view.container.querySelector('[data-dshtrading-middle-stage]')).toBeTruthy()
      fireEvent.click(view.getByRole('button', { name: 'sidebar.expand' }))
      expect(view.getByRole('button', { name: 'workspace.backToQuote' }).getAttribute('aria-expanded')).toBe('true')
    } finally { stageViews.unregister('strategy'); stageViews.unregister('knowledge') }
  })

  it('limits trading colors to the Trading surface', () => {
    const view = setup()
    fireEvent.click(view.getByRole('button', { name: 'workspace.title' }))
    applyColorModeToRoot('green-up')
    const surface = view.getByRole('dialog')
    expect(surface.style.getPropertyValue('--dsw-futu-up')).toBe('#2ba471')
    expect(document.documentElement.style.getPropertyValue('--dsw-futu-up')).toBe('')
    expect(document.body.getAttribute('data-dshtrading-color-mode')).toBeNull()
  })
})
