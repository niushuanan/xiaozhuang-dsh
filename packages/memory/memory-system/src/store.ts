/** Fixed-path atomic persistence for the two global memory documents. */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  MemoryDocumentKind, MemoryDocumentView, MemoryMaintenanceFailure, MemoryState, MemoryWriteReason,
} from './types.ts'

export type { MemoryDocumentKind, MemoryDocumentView, MemoryState, MemoryWriteReason } from './types.ts'

const MISSING_REVISION = 'missing'
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

export class MemoryStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function revisionOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function filenameFor(kind: MemoryDocumentKind): string {
  return kind === 'user' ? 'user.md' : 'ai.md'
}

async function existsFile(path: string): Promise<boolean> {
  return stat(path).then(info => info.isFile(), (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false
    throw error
  })
}

function validCursor(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function validFailure(value: unknown): MemoryMaintenanceFailure | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const failure = value as Record<string, unknown>
  if (typeof failure.at !== 'string' || typeof failure.message !== 'string') return undefined
  return { at: failure.at, message: failure.message }
}

/** Owns only `${DSH_HOME}/memory/*`; callers never supply a path. */
export class MemoryDocumentStore {
  private readonly root: string
  private readonly history: string
  private readonly statePath: string

  constructor(dshHome: string) {
    this.root = join(dshHome, 'memory')
    this.history = join(this.root, 'history')
    this.statePath = join(this.root, 'state.json')
  }

  async read(kind: MemoryDocumentKind): Promise<MemoryDocumentView> {
    const path = join(this.root, filenameFor(kind))
    const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    const canRestore = (await this.historyFiles(kind)).length > 0
    if (info === undefined) {
      return { kind, path, exists: false, content: '', revision: MISSING_REVISION, canRestore }
    }
    if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) {
      throw new MemoryStoreError(info.size > MAX_DOCUMENT_BYTES ? 413 : 400, `${filenameFor(kind)} is not an editable memory document`)
    }
    const content = await readFile(path, 'utf8')
    return {
      kind,
      path,
      exists: true,
      content,
      revision: revisionOf(content),
      updatedAt: info.mtime.toISOString(),
      canRestore,
    }
  }

  async write(
    kind: MemoryDocumentKind,
    content: string,
    expectedRevision: string,
    reason: MemoryWriteReason,
  ): Promise<MemoryDocumentView> {
    if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw new MemoryStoreError(413, 'memory document is too large')
    }
    const current = await this.read(kind)
    if (current.revision !== expectedRevision) {
      throw new MemoryStoreError(409, 'memory document changed; load the latest version before saving')
    }
    await mkdir(this.root, { recursive: true })
    if (current.exists) await this.saveHistory(kind, current.content, current.revision, reason)
    await this.atomicWrite(join(this.root, filenameFor(kind)), content)
    return this.read(kind)
  }

  async restorePrevious(kind: MemoryDocumentKind, expectedRevision: string): Promise<MemoryDocumentView> {
    const current = await this.read(kind)
    if (current.revision !== expectedRevision) {
      throw new MemoryStoreError(409, 'memory document changed; load the latest version before restoring')
    }
    const files = await this.historyFiles(kind)
    const latest = files.at(-1)
    if (latest === undefined) throw new MemoryStoreError(404, 'no previous memory revision is available')
    const content = await readFile(join(this.history, latest), 'utf8')
    if (current.exists) await this.saveHistory(kind, current.content, current.revision, 'restore')
    await this.atomicWrite(join(this.root, filenameFor(kind)), content)
    return this.read(kind)
  }

  async readState(): Promise<MemoryState> {
    try {
      const value: unknown = JSON.parse(await readFile(this.statePath, 'utf8'))
      if (typeof value !== 'object' || value === null) return { lastMaintenanceCursor: 0 }
      const state = value as Record<string, unknown>
      // `lastDailyCursor` is the pre-rename field carrying identical millisecond-cursor semantics.
      const cursor = state.lastMaintenanceCursor ?? state.lastDailyCursor
      const failure = validFailure(state.lastMaintenanceError)
      return {
        lastMaintenanceCursor: validCursor(cursor),
        ...typeof state.lastMaintenanceAt === 'string' ? { lastMaintenanceAt: state.lastMaintenanceAt } : {},
        ...failure === undefined ? {} : { lastMaintenanceError: failure },
        ...typeof state.lastProvider === 'string' ? { lastProvider: state.lastProvider } : {},
        ...typeof state.lastModel === 'string' ? { lastModel: state.lastModel } : {},
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
        return { lastMaintenanceCursor: 0 }
      }
      throw error
    }
  }

  async writeState(state: MemoryState): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await this.atomicWrite(this.statePath, `${JSON.stringify(state, null, 2)}\n`)
  }

  private async saveHistory(
    kind: MemoryDocumentKind,
    content: string,
    revision: string,
    reason: MemoryWriteReason,
  ): Promise<void> {
    await mkdir(this.history, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    const filename = `${kind}-${stamp}-${reason}-${revision.slice(0, 12)}-${randomUUID()}.md`
    await this.atomicWrite(join(this.history, filename), content)
  }

  private async historyFiles(kind: MemoryDocumentKind): Promise<string[]> {
    if (!await existsFile(this.history) && !await stat(this.history).then(info => info.isDirectory(), () => false)) return []
    return (await readdir(this.history))
      .filter(name => name.startsWith(`${kind}-`) && name.endsWith('.md'))
      .sort()
  }

  private async atomicWrite(path: string, content: string): Promise<void> {
    const temporary = `${path}.dsh-${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
      await rename(temporary, path)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }
}
