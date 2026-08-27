/**
 * AgentPtyRegistry unit tests against a Mock subprocess terminal handle: the
 * registry drives a `SubprocessTerminalHandle` (UTF-8 output stream + write /
 * signalForeground / resize / terminate), so the suite pins the registry's
 * uuid-keyed CRUD, transcript bounding, exit tracking, signal forwarding, and
 * change-event subscription without spawning a real shell.
 */
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type {
  SubprocessOutcome,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { AgentPtyRegistry, ALLOWED_SIGNALS, snapshotOf } from '../src/agent-pty.ts'

/** One controllable terminal stub backing a `SubprocessTerminalHandle`. */
class MockTerminal {
  readonly output = new PassThrough()
  readonly writes: string[] = []
  readonly resizes: Array<[number, number]> = []
  readonly signals: SubprocessTerminalSignal[] = []
  terminated = false
  exited = false
  exitCode: number | null = 0
  exitSignal: NodeJS.Signals | null = null
  private resolveDone!: (outcome: SubprocessOutcome) => void
  readonly done: Promise<SubprocessOutcome>

  constructor() {
    this.done = new Promise((resolve) => { this.resolveDone = resolve })
  }

  /** Feed UTF-8 output bytes into the live stream. */
  emit(data: string): void {
    this.output.write(Buffer.from(data, 'utf8'))
  }

  /** Settle the process exit fact (the registry's `done.then` observes it). */
  exit(exitCode: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.exited = true
    this.exitCode = exitCode
    this.exitSignal = signal
    this.resolveDone({ exitCode, signal })
    this.output.end()
  }

  asHandle(): SubprocessTerminalHandle {
    return {
      pid: 123,
      output: this.output,
      done: this.done,
      write: async (data: string) => { this.writes.push(data) },
      inspectForeground: async () => ({ processGroupId: 456, inputWaiting: false }),
      signalForeground: async (signal: SubprocessTerminalSignal) => { this.signals.push(signal); return 456 },
      resize: (cols: number, rows: number) => { this.resizes.push([cols, rows]) },
      terminate: async () => { this.terminated = true },
    }
  }
}

/** Build a registry whose spawn seam returns the given (or a fresh) mock. */
function makeRegistry(spawn?: (spec: SubprocessTerminalSpawnSpec) => SubprocessTerminalHandle): {
  registry: AgentPtyRegistry
  terminals: MockTerminal[]
} {
  const terminals: MockTerminal[] = []
  const registry = new AgentPtyRegistry('/bin/sh', [], 30_000, async (spec) => {
    if (spawn !== undefined) return spawn(spec)
    const terminal = new MockTerminal()
    terminals.push(terminal)
    return terminal.asHandle()
  })
  return { registry, terminals }
}

/** Wait until a terminal's transcript contains a substring (or timeout). */
async function waitForTranscript(
  registry: AgentPtyRegistry,
  uuid: string,
  needle: string,
  timeoutMs = 2000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const handle = registry.get(uuid)
    if (handle !== undefined && handle.transcript.includes(needle)) return handle.transcript
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  return registry.get(uuid)?.transcript ?? ''
}

/** Yield one macrotask so microtask chains (done.then) settle. */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('AgentPtyRegistry', () => {
  it('creates a terminal with a uuid, writes the command to stdin, and lists it', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'echo test', 'echo hello', '/cwd', 80, 24)
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(terminals[0]!.writes).toEqual(['echo hello\r'])
    const list = registry.list('s1')
    expect(list).toHaveLength(1)
    expect(list[0]!.uuid).toBe(uuid)
    expect(list[0]!.title).toBe('echo test')
    expect(list[0]!.command).toBe('echo hello')
    expect(list[0]!.exited).toBe(false)
  })

  it('spawns a bare shell when command is empty (no stdin write)', async () => {
    const { registry, terminals } = makeRegistry()
    await registry.create('s1', 'bare', '', '/cwd', 80, 24)
    expect(terminals[0]!.writes).toEqual([])
    expect(registry.list('s1')).toHaveLength(1)
  })

  it('sends raw text to stdin and reflects it in the transcript', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'sender', '', '/cwd', 80, 24)
    registry.send(uuid, 'echo sent\r')
    terminals[0]!.emit('sent-via-send\r\n')
    const transcript = await waitForTranscript(registry, uuid, 'sent-via-send')
    expect(transcript).toContain('sent-via-send')
    expect(terminals[0]!.writes).toContain('echo sent\r')
  })

  it('reads a bounded page of the transcript', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'reader', '', '/cwd', 80, 24)
    terminals[0]!.emit('line1\nline2\nline3\n')
    await waitForTranscript(registry, uuid, 'line3')
    const page = registry.read(uuid)
    expect(page.totalLines).toBeGreaterThan(0)
    expect(page.text).toContain('line1')
    const tail = registry.read(uuid, -2)
    expect(tail.lineEnd).toBe(tail.lineBegin + tail.text.split('\n').length)
  })

  it('clamps resize to the 2..1024 range and forwards it to the handle', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'resizer', '', '/cwd', 80, 24)
    expect(registry.resize(uuid, 5000, 1)).toEqual({ cols: 1024, rows: 2 })
    expect(registry.resize(uuid, -3, 80.9)).toEqual({ cols: 2, rows: 80 })
    expect(registry.resize(uuid, 120, 40)).toEqual({ cols: 120, rows: 40 })
    expect(terminals[0]!.resizes).toEqual([[1024, 2], [2, 80], [120, 40]])
  })

  it('assertOwned rejects a uuid owned by another session', async () => {
    const { registry } = makeRegistry()
    const mine = await registry.create('s1', 'mine', '', '/cwd', 80, 24)
    const theirs = await registry.create('s2', 'theirs', '', '/cwd', 80, 24)
    expect(() => registry.assertOwned(mine, 's1')).not.toThrow()
    expect(() => registry.assertOwned(theirs, 's1')).toThrow(/not found/)
    expect(() => registry.assertOwned('nope', 's1')).toThrow(/not found/)
  })

  it('closes a terminal idempotently and removes it from the list', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'closer', '', '/cwd', 80, 24)
    expect(registry.close(uuid)).toBe(true)
    expect(registry.close(uuid)).toBe(false)
    expect(registry.list('s1')).toHaveLength(0)
    expect(terminals[0]!.terminated).toBe(true)
  })

  it('scopes list by session id', async () => {
    const { registry } = makeRegistry()
    await registry.create('s1', 'a', '', '/cwd', 80, 24)
    await registry.create('s1', 'b', '', '/cwd', 80, 24)
    await registry.create('s2', 'c', '', '/cwd', 80, 24)
    expect(registry.list('s1')).toHaveLength(2)
    expect(registry.list('s2')).toHaveLength(1)
    expect(registry.list('s3')).toHaveLength(0)
  })

  it('fires change listeners on create, close, and exit', async () => {
    const { registry, terminals } = makeRegistry()
    let changes = 0
    registry.subscribe(() => { changes += 1 })
    const uuid = await registry.create('s1', 'watched', '', '/cwd', 80, 24)
    const afterCreate = changes
    expect(afterCreate).toBeGreaterThanOrEqual(1)
    terminals[0]!.exit(0)
    await tick()
    expect(changes).toBeGreaterThan(afterCreate)
    registry.close(uuid)
    expect(changes).toBeGreaterThan(afterCreate + 1)
  })

  it('disposeAll closes every terminal', async () => {
    const { registry, terminals } = makeRegistry()
    await registry.create('s1', 'a', '', '/cwd', 80, 24)
    await registry.create('s2', 'b', '', '/cwd', 80, 24)
    registry.disposeAll()
    expect(registry.list('s1')).toHaveLength(0)
    expect(registry.list('s2')).toHaveLength(0)
    expect(terminals.every(terminal => terminal.terminated)).toBe(true)
  })

  it('snapshotOf drops the handle, transcript, and sessionId', async () => {
    const { registry } = makeRegistry()
    const uuid = await registry.create('s1', 'snap', '', '/cwd', 80, 24)
    const snap = snapshotOf(registry.get(uuid)!)
    expect(snap.uuid).toBe(uuid)
    expect(snap.exited).toBe(false)
    expect('handle' in snap).toBe(false)
    expect('transcript' in snap).toBe(false)
    expect('sessionId' in snap).toBe(false)
    expect('sessionId' in registry.list('s1')[0]!).toBe(false)
  })

  it('ALLOWED_SIGNALS includes SIGINT, SIGTERM, SIGKILL, SIGHUP, SIGTSTP', () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGHUP', 'SIGTSTP']) {
      expect(ALLOWED_SIGNALS).toContain(signal)
    }
  })

  it('waitFor returns found for a needle already in the transcript', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'echo-test', '', '/cwd', 80, 24)
    terminals[0]!.emit('wait-for-fast\r\n')
    await waitForTranscript(registry, uuid, 'wait-for-fast')
    const result = await registry.waitFor(uuid, 'wait-for-fast', 500)
    expect(result.kind).toBe('found')
  })

  it('waitFor returns found after output arrives', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'async', '', '/cwd', 80, 24)
    const waitPromise = registry.waitFor(uuid, 'UNIQUE_NEEDLE_42', 2000)
    await tick()
    terminals[0]!.emit('prefix UNIQUE_NEEDLE_42 suffix\r\n')
    const result = await waitPromise
    expect(result.kind).toBe('found')
    if (result.kind === 'found') expect(result.needle).toBe('UNIQUE_NEEDLE_42')
  })

  it('waitFor returns timeout when the needle never appears', async () => {
    const { registry } = makeRegistry()
    const uuid = await registry.create('s1', 'silent', '', '/cwd', 80, 24)
    const result = await registry.waitFor(uuid, 'never-appears', 200)
    expect(result.kind).toBe('timeout')
  })

  it('waitFor rejects an empty needle and an unknown uuid', async () => {
    const { registry } = makeRegistry()
    const uuid = await registry.create('s1', 'empty-needle', '', '/cwd', 80, 24)
    await expect(registry.waitFor(uuid, '', 500)).rejects.toThrow()
    await expect(registry.waitFor('missing', 'foo', 500)).rejects.toThrow()
  })

  it('forwards every signal through signalForeground', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'signal-test', '', '/cwd', 80, 24)
    registry.signal(uuid, 'SIGINT')
    registry.signal(uuid, 'SIGTERM')
    await tick()
    expect(terminals[0]!.signals).toEqual(['SIGINT', 'SIGTERM'])
  })

  it('marks the handle exited with exitCode/exitSignal once done settles', async () => {
    const { registry, terminals } = makeRegistry()
    const uuid = await registry.create('s1', 'exiter', '', '/cwd', 80, 24)
    terminals[0]!.exit(3, 'SIGTERM')
    await tick()
    const handle = registry.get(uuid)!
    expect(handle.exited).toBe(true)
    expect(handle.exitCode).toBe(3)
    expect(handle.exitSignal).toBe('SIGTERM')
    const snap = snapshotOf(handle)
    expect(snap.exited).toBe(true)
    expect(snap.exitCode).toBe(3)
    expect(snap.exitSignal).toBe('SIGTERM')
  })
})
