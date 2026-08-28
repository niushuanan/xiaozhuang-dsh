import { describe, expect, it } from 'vitest'
import {
  auxiliaryDshWindowUrl, embeddedDshPaneUrl, parseDshWindowContext, sessionSelectionStorageKey,
} from '../src/client/window-context.ts'
import type { SessionId } from '../src/client/index.ts'

describe('DSH window context', () => {
  it('keeps ordinary tabs on the primary navigation key', () => {
    expect(parseDshWindowContext('?foo=bar')).toEqual({ role: 'primary' })
    expect(sessionSelectionStorageKey('?foo=bar')).toBe('dsh.sessions.current')
  })

  it('gives every auxiliary window an isolated selection key', () => {
    const search = '?dsh-window=auxiliary&dsh-window-id=window-2&dsh-session=session-9'
    expect(parseDshWindowContext(search)).toEqual({
      role: 'auxiliary', windowId: 'window-2', sessionId: 'session-9' as SessionId,
    })
    expect(sessionSelectionStorageKey(search)).toBe('dsh.sessions.current.window.window-2')
  })

  it('builds a same-page auxiliary URL without dropping unrelated parameters', () => {
    const url = auxiliaryDshWindowUrl(
      'http://127.0.0.1:3080/?theme=dark',
      'window-3',
      'session-3' as SessionId,
    )
    expect(url).toBe('http://127.0.0.1:3080/?theme=dark&dsh-window=auxiliary&dsh-window-id=window-3&dsh-session=session-3')
  })

  it('marks embedded conversation panes while preserving isolated navigation', () => {
    const url = embeddedDshPaneUrl(
      'http://127.0.0.1:3080/?theme=dark',
      'pane-2',
      'session-2' as SessionId,
    )
    const parsed = new URL(url)
    expect(parseDshWindowContext(parsed.search)).toEqual({
      role: 'auxiliary',
      windowId: 'pane-2',
      sessionId: 'session-2' as SessionId,
      embedded: true,
    })
    expect(sessionSelectionStorageKey(parsed.search)).toBe('dsh.sessions.current.window.pane-2')
  })
})
