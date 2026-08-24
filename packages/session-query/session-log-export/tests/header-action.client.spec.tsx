// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { SessionLogDownloadController } from '../src/client/controller.ts'
import { SessionLogDownloadHeaderAction } from '../src/client/HeaderAction.tsx'
import type { SessionLogDownloadDialogProps } from '../src/client/Dialog.tsx'
import { en } from '../src/client/locales.ts'

const SID = 'session-export-header' as SessionId

function bindSessionExport(controller: SessionLogDownloadController) {
  return function useSessionLogDownload<T>(selector: (state: ReturnType<typeof controller.store.getSnapshot>) => T): T {
    return useSyncExternalStore(
      listener => controller.store.subscribe(listener),
      () => selector(controller.store.getSnapshot()),
    )
  }
}

function bench() {
  const controller = new SessionLogDownloadController(async () => new Response('zip'), vi.fn())
  const request = vi.fn((sessionId: SessionId, kind: 'archive' | 'image') => controller.download(sessionId, kind))
  const dismiss = vi.fn((sessionId: SessionId) => { controller.dismiss(sessionId) })
  const useSessionLogDownload = bindSessionExport(controller)
  const props = {
    sessionId: SID,
    useSessionLogDownload,
    request,
    dismiss,
    t: (key: keyof typeof en): string => en[key],
  } as unknown as SessionLogDownloadDialogProps
  const view = render(<SessionLogDownloadHeaderAction {...props} />)
  return { controller, request, view }
}

afterEach(cleanup)

describe('Session export Header action', () => {
  it('opens two clear export choices and keeps the archive path on the shared controller', async () => {
    const b = bench()
    const button = b.view.getByRole('button', { name: 'Export' })
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(b.view.getByRole('menuitem', { name: 'Export text record' })).toBeTruthy()
    expect(b.view.getByRole('menuitem', { name: 'Export conversation image' })).toBeTruthy()
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Export text record' }))
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(SID, 'archive') })
    expect(await b.view.findByRole('dialog', { name: 'Session download started' })).toBeTruthy()
  })

  it('routes the image choice without starting the archive request', async () => {
    const b = bench()
    fireEvent.click(b.view.getByRole('button', { name: 'Export' }))
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Export conversation image' }))
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(SID, 'image') })
  })

  it('disables the capsule while either entry path downloads this Session', async () => {
    const b = bench()
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const controller = new SessionLogDownloadController(() => pending, vi.fn())
    const useSessionLogDownload = bindSessionExport(controller)
    b.view.rerender(<SessionLogDownloadHeaderAction {...({
      sessionId: SID,
      useSessionLogDownload,
      request: (sessionId: SessionId, kind: 'archive' | 'image') => controller.download(sessionId, kind),
      dismiss: (sessionId: SessionId) => { controller.dismiss(sessionId) },
      t: (key: keyof typeof en): string => en[key],
    } as unknown as SessionLogDownloadDialogProps)} />)

    const download = controller.download(SID)
    const button = b.view.getByRole('button', { name: 'Export' })
    await waitFor(() => { expect(button.getAttribute('aria-busy')).toBe('true') })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    release(new Response('zip'))
    await download
    await waitFor(() => { expect(button.getAttribute('aria-busy')).toBe('false') })
  })
})
