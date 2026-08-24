import { describe, expect, it } from 'vitest'
import {
  auxiliaryDshWindowUrl, parseDshWindowContext, sessionSelectionStorageKey,
} from '../src/client/window-context.ts'

describe('DSH window context', () => {
  it('keeps ordinary tabs on the primary navigation key', () => {
    expect(parseDshWindowContext('?foo=bar')).toEqual({ role: 'primary' })
    expect(sessionSelectionStorageKey('?foo=bar')).toBe('dsh.sessions.current')
  })

  it('gives every auxiliary window an isolated selection key', () => {
    const search = '?dsh-window=auxiliary&dsh-window-id=window-2&dsh-session=session-9'
    expect(parseDshWindowContext(search)).toEqual({
      role: 'auxiliary', windowId: 'window-2', sessionId: 'session-9',
    })
    expect(sessionSelectionStorageKey(search)).toBe('dsh.sessions.current.window.window-2')
  })

  it('builds a same-page auxiliary URL without dropping unrelated parameters', () => {
    const url = auxiliaryDshWindowUrl('http://127.0.0.1:3080/?theme=dark', 'window-3', 'session-3')
    expect(url).toBe('http://127.0.0.1:3080/?theme=dark&dsh-window=auxiliary&dsh-window-id=window-3&dsh-session=session-3')
  })
})
