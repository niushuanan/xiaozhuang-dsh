// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  SidebarFooterActionOwnerProps, SidebarPrimaryActionOwnerProps, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function mountShell(
  { collapsed = false, width = 300, chat = false }: { collapsed?: boolean; width?: number; chat?: boolean } = {},
) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  const useSessions = ((selector: (state: { byId: Record<string, { agentPreset?: string }>; current: string }) => unknown) =>
    selector({ byId: { s1: { agentPreset: chat ? 'chat' : 'standard' } }, current: 's1' })) as never
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  let primaryActionOwner: SidebarPrimaryActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={useSessions} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.primary.action') {
          primaryActionOwner = owner
          return <button type="button">Start chat</button>
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    primaryActionOwner: () => {
      if (primaryActionOwner === undefined) throw new Error('primary action owner not rendered')
      return primaryActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('routes the segmented mode switch: Agent & Coding starts a session, Chat rides the slot', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // One capsule, two segments: the wordmark alone keeps the extra start route.
    expect(screen.getAllByRole('button', { name: 'Start work' })).toHaveLength(2)
    const agentSegment = screen.getByRole('group', { name: 'Work mode' })
      .querySelector('button') as HTMLButtonElement
    expect(agentSegment.textContent).toContain('Agent & Coding')
    // Expanded segments are text-only; the rail keeps the icons.
    expect(agentSegment.querySelector('svg')).toBeNull()
    expect(agentSegment.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(agentSegment)
    expect(b.startSession).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Start chat' })).toBeTruthy()
    expect(b.primaryActionOwner().wide).toBe(true)
    expect(b.primaryActionOwner().segment).toBe(true)
    expect(b.primaryActionOwner().active).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('presses the chat segment when the current session is a plain chat', () => {
    const b = mountShell({ chat: true })
    const agentSegment = screen.getByRole('group', { name: 'Work mode' })
      .querySelector('button') as HTMLButtonElement
    expect(agentSegment.getAttribute('aria-pressed')).toBe('false')
    expect(b.primaryActionOwner().active).toBe(true)
  })

  it('keeps segment icons on the collapsed rail and drops them when wide', () => {
    vi.useFakeTimers()
    const b = mountShell()
    const group = () => screen.getByRole('group', { name: 'Work mode' })
    expect((group().querySelector('button') as HTMLButtonElement).querySelector('svg')).toBeNull()

    b.rerender({ collapsed: true })
    act(() => { vi.advanceTimersByTime(200) })
    // The agent segment keeps its rail icon; the chat segment's icon is
    // ui-chat's own rendering, and the shell hands it the rail posture.
    const agentRailSegment = group().querySelector('button') as HTMLButtonElement
    expect(agentRailSegment.querySelector('svg')).not.toBeNull()
    expect(b.primaryActionOwner().wide).toBe(false)
  })

  it('renders generic brand fallbacks when no package fills the slots', () => {
    vi.stubEnv('DSH_CLIENT_COMMIT_HASH', '0123456')
    const useSessions = ((selector: (state: { byId: Record<string, { agentPreset?: string }>; current: string }) => unknown) =>
      selector({ byId: { s1: { agentPreset: 'standard' } }, current: 's1' })) as never
    const { container } = render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={useSessions} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    const wordmark = Array.from(container.querySelectorAll('svg'))
      .find(svg => svg.getAttribute('viewBox') === '26 0 156 24')
    expect(wordmark).toBeTruthy()
    expect(screen.queryByText('DeepSeek Harness')).toBeNull()
    expect(screen.queryByText('0123456')).toBeNull()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })
})
