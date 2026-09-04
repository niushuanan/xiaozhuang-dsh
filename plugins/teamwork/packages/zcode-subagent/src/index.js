/**
 * Z Code one-shot provider for the DSH profile.
 *
 * Each run starts Z Code's native app-server, materializes the selected model
 * and thought level as an ephemeral runtime model, and returns only the final
 * assistant text. The user's provider account remains the credential source;
 * no setting, session, or credential is persisted by this provider.
 */

import { randomUUID } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export const name = 'subagent-zcode-local'
export const inject = ['subagents', 'subprocess']

const DEFAULT_CLI_PATH = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs'
const DEFAULT_CONFIG_PATH = '~/.zcode/v2/config.json'
const DEFAULT_PROVIDER_ID = 'builtin:zai'
const DEFAULT_MODEL_ID = 'GLM-5.3'
const DEFAULT_PERMISSION_MODE = 'edit'
const DEFAULT_GRACE_MS = 3000
const MAX_FRAME_BYTES = 16 * 1024 * 1024
const POLL_INTERVAL_MS = 250

function expandHome(path) {
  return path === '~' ? homedir() : path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : path
}

function textPrompt(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('subagent-zcode-local: task must contain text')
  }
  const text = blocks.map((block) => {
    if (block == null || block.type !== 'text' || typeof block.text !== 'string') {
      throw new Error('subagent-zcode-local: task must contain only text blocks')
    }
    return block.text
  }).join('\n').trim()
  if (text.length === 0) throw new Error('subagent-zcode-local: task must not be empty')
  return text
}

async function loadNativeModel(config) {
  const configPath = expandHome(config.configPath ?? DEFAULT_CONFIG_PATH)
  const raw = JSON.parse(await readFile(configPath, 'utf8'))
  const providerId = config.providerId ?? DEFAULT_PROVIDER_ID
  const modelId = config.modelId ?? DEFAULT_MODEL_ID
  const provider = raw != null && typeof raw === 'object' && raw.provider != null
    ? raw.provider[providerId]
    : undefined
  if (provider == null || typeof provider !== 'object' || provider.enabled !== true) {
    throw new Error(`subagent-zcode-local: Z Code provider ${providerId} is not enabled`)
  }
  const definition = provider.models?.[modelId]
  if (definition == null || typeof definition !== 'object') {
    throw new Error(`subagent-zcode-local: Z Code model ${providerId}/${modelId} is unavailable`)
  }
  const options = provider.options
  const apiKey = options != null && typeof options.apiKey === 'string' ? options.apiKey : ''
  const baseURL = options != null && typeof options.baseURL === 'string' ? options.baseURL : ''
  if (apiKey.length === 0 || baseURL.length === 0) {
    throw new Error(`subagent-zcode-local: Z Code provider ${providerId} is missing account configuration`)
  }
  const reasoning = definition.reasoning
  const reasoningVariants = reasoning != null && Array.isArray(reasoning.variants)
    ? reasoning.variants.filter(value => typeof value === 'string' && value.length > 0)
    : []
  const reasoningEffort = config.reasoningEffort ?? reasoning?.defaultVariant
  if (reasoningEffort != null && !reasoningVariants.includes(reasoningEffort)) {
    throw new Error(`subagent-zcode-local: reasoning effort ${reasoningEffort} is unavailable for ${providerId}/${modelId}`)
  }
  const kind = provider.kind
  if (!['anthropic', 'openai', 'openai-compatible'].includes(kind)) {
    throw new Error(`subagent-zcode-local: unsupported Z Code provider kind ${String(kind)}`)
  }
  return { providerId, modelId, provider, definition, apiKey, baseURL, reasoningVariants, reasoningEffort, kind }
}

function runtimeModel(model) {
  const now = Date.now()
  const modelRef = {
    providerId: model.providerId,
    modelId: model.modelId,
    ...model.reasoningEffort == null ? {} : { variant: model.reasoningEffort },
  }
  const reasoning = model.reasoningVariants.length === 0
    ? undefined
    : {
        enabled: model.definition.reasoning?.enabled !== false,
        levels: model.reasoningVariants.map(value => ({ value, label: value.toUpperCase() })),
        ...model.definition.reasoning?.defaultVariant == null
          ? {}
          : { defaultLevel: model.definition.reasoning.defaultVariant },
      }
  const modalities = model.definition.modalities?.input
  return {
    revision: `dsh-zcode-${now}-${randomUUID()}`,
    generatedAt: now,
    model: modelRef,
    provider: {
      providerId: model.providerId,
      kind: model.kind,
      label: typeof model.provider.name === 'string' ? model.provider.name : model.providerId,
      source: 'ephemeral',
      baseURL: model.baseURL,
      apiKey: { source: 'inline', value: model.apiKey },
      apiKeyRequired: model.provider.options?.apiKeyRequired !== false,
      models: [{
        modelId: model.modelId,
        ...Number.isInteger(model.definition.limit?.context) && model.definition.limit.context > 0
          ? { contextWindow: model.definition.limit.context }
          : {},
        ...Number.isInteger(model.definition.limit?.output) && model.definition.limit.output > 0
          ? { maxOutputTokens: model.definition.limit.output }
          : {},
        ...reasoning == null ? {} : { reasoning },
        supportsImages: Array.isArray(modalities) && modalities.includes('image'),
        supportsPdf: Array.isArray(modalities) && modalities.includes('pdf'),
        supportsTools: true,
      }],
    },
    ...model.reasoningEffort == null ? {} : { thoughtLevel: model.reasoningEffort },
  }
}

function object(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function finalAssistant(snapshot) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : []
  const assistant = messages.filter(message => message?.info?.role === 'assistant').at(-1)
  if (assistant == null) return undefined
  const complete = assistant.info?.time?.completed != null || assistant.info?.finish != null || assistant.info?.error != null
  if (!complete) return undefined
  if (assistant.info?.error != null) return { error: true }
  const text = Array.isArray(assistant.parts)
    ? assistant.parts
      .filter(part => part?.type === 'text' && part.ignored !== true && typeof part.text === 'string')
      .map(part => part.text.trim())
      .filter(Boolean)
      .join('\n')
    : ''
  return text.length === 0 ? { error: true } : { text }
}

function delay(ms, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'))
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolveDelay()
    }, ms)
    const abort = () => {
      clearTimeout(timer)
      rejectDelay(signal.reason ?? new Error('aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

class ZCodeProtocolWire {
  constructor(input, output, permissionMode) {
    this.input = input
    this.output = output
    this.permissionMode = permissionMode
    this.buffer = ''
    this.sequence = 0
    this.pending = new Map()
    this.closed = false
    input.on('data', this.onData)
    input.on('error', this.onFailure)
    input.on('end', this.onEnd)
    output.on('error', this.onFailure)
  }

  onData = (chunk) => {
    this.buffer += chunk.toString()
    if (this.buffer.length > MAX_FRAME_BYTES) return this.fail(new Error('subagent-zcode-local: protocol frame is too large'))
    for (;;) {
      const index = this.buffer.indexOf('\n')
      if (index < 0) break
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim().length === 0) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        this.fail(new Error('subagent-zcode-local: Z Code returned invalid protocol JSON'))
        return
      }
      this.handle(message)
    }
  }

  onFailure = (error) => { this.fail(error instanceof Error ? error : new Error(String(error))) }
  onEnd = () => { this.fail(new Error('subagent-zcode-local: Z Code protocol ended early')) }

  handle(message) {
    const id = message?.id
    if ((typeof id === 'string' || typeof id === 'number') && typeof message.method === 'string') {
      this.answerServerRequest(id, message.method, object(message.params) ?? {})
      return
    }
    const pending = this.pending.get(String(id))
    if (pending == null) return
    this.pending.delete(String(id))
    pending.cleanup()
    if (message.error != null) {
      pending.reject(new Error(`subagent-zcode-local: ${pending.method} failed`))
    } else {
      pending.resolve(message.result)
    }
  }

  answerServerRequest(id, method, params) {
    if (method === 'session/requestRuntimePreferences') {
      this.write({ id, result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, askUserQuestionAutoResolutionEnabled: true } })
      return
    }
    if (method === 'interaction/requestPermission') {
      const allow = this.permissionMode !== 'plan'
      this.write({ id, result: { decision: allow ? 'allow' : 'deny', reason: allow ? 'Approved by the selected unattended Z Code mode' : 'Plan mode does not approve execution' } })
      return
    }
    if (method === 'interaction/requestUserInput') {
      this.write({ id, result: { action: 'decline', reason: 'The unattended Z Code collaborator cannot ask the user a follow-up question' } })
      return
    }
    if (method === 'interaction/requestProviderRuntimeHeaders') {
      this.write({ id, result: { headersApplied: false } })
      return
    }
    this.write({ id, error: { code: -32601, message: `Unsupported Z Code client request: ${method}` } })
  }

  write(message) {
    if (this.closed) throw new Error('subagent-zcode-local: protocol is closed')
    this.output.write(`${JSON.stringify(message)}\n`)
  }

  request(method, params, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('aborted'))
    const id = String(++this.sequence)
    return new Promise((resolveRequest, rejectRequest) => {
      const abort = () => {
        const pending = this.pending.get(id)
        if (pending == null) return
        this.pending.delete(id)
        pending.cleanup()
        rejectRequest(signal.reason ?? new Error('aborted'))
      }
      const cleanup = () => signal?.removeEventListener('abort', abort)
      this.pending.set(id, { method, resolve: resolveRequest, reject: rejectRequest, cleanup })
      signal?.addEventListener('abort', abort, { once: true })
      try {
        this.write({ id, method, params })
      } catch (error) {
        this.pending.delete(id)
        cleanup()
        rejectRequest(error)
      }
    })
  }

  fail(error) {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) {
      pending.cleanup()
      pending.reject(error)
    }
    this.pending.clear()
  }

  close() {
    this.fail(new Error('subagent-zcode-local: protocol closed'))
    this.input.off('data', this.onData)
    this.input.off('error', this.onFailure)
    this.input.off('end', this.onEnd)
    this.output.off('error', this.onFailure)
  }
}

async function runOneShot(wire, sessionId, prompt, signal) {
  await wire.request('session/send', { sessionId, content: prompt }, signal)
  for (;;) {
    const snapshot = await wire.request('session/read', { sessionId }, signal)
    const answer = finalAssistant(snapshot)
    if (answer?.text != null) return { output: [{ type: 'text', text: answer.text }], stopReason: 'completed' }
    if (answer?.error === true || snapshot?.projection?.status === 'error') {
      return { output: [], stopReason: 'error', diagnostic: 'Z Code did not complete the delegated task' }
    }
    await delay(POLL_INTERVAL_MS, signal)
  }
}

class ZCodeProvider {
  capabilities = Object.freeze({ outputSchema: false, depthLimit: false, toolFilter: false, persona: false })
  inheritsParentContext = false

  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.name = config.providerName ?? 'zcode'
  }

  async start(request) {
    if (request.signal.aborted) throw new Error('subagent-zcode-local: request was aborted before startup')
    const cwd = request.parent?.session?.header?.cwd
    if (typeof cwd !== 'string' || cwd.length === 0) {
      throw new Error('subagent-zcode-local: parent session has no working directory')
    }
    const cliPath = expandHome(this.config.cliPath ?? DEFAULT_CLI_PATH)
    await access(cliPath)
    const selected = await loadNativeModel(this.config)
    const selectedRuntime = runtimeModel(selected)
    const prompt = textPrompt(request.prompt)
    const permissionMode = this.config.permissionMode ?? DEFAULT_PERMISSION_MODE
    const graceMs = this.config.disposeGraceMs ?? DEFAULT_GRACE_MS
    const handle = this.ctx.subprocess.spawn({
      argv: [process.execPath, cliPath, 'app-server'],
      cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 256 * 1024 } },
      graceMs,
      signal: request.signal,
    })
    const wire = new ZCodeProtocolWire(handle.stdout, handle.stdin, permissionMode)
    let sessionId
    try {
      const snapshot = await wire.request('session/create', {
        workspace: { workspaceKey: cwd, workspacePath: cwd },
        mode: permissionMode,
        model: selectedRuntime.model,
        runtimeModel: selectedRuntime,
        ...selected.reasoningEffort == null ? {} : { thoughtLevel: selected.reasoningEffort },
        persistence: 'deferred',
      }, request.signal)
      sessionId = snapshot?.session?.sessionId
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error('subagent-zcode-local: Z Code returned an invalid session')
      }
    } catch (error) {
      wire.close()
      try { handle.stdin?.end() } catch {}
      handle.terminate()
      await handle.waitForExit().catch(() => {})
      throw error
    }

    let cleanupPromise
    const cleanup = async () => {
      if (cleanupPromise != null) return cleanupPromise
      cleanupPromise = (async () => {
        if (!wire.closed && sessionId != null) {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 1000)
          await wire.request('session/close', { sessionId }, controller.signal).catch(() => {})
          clearTimeout(timer)
        }
        wire.close()
        try { handle.stdin?.end() } catch {}
        handle.terminate()
        await handle.waitForExit().catch(() => {})
        await handle.done.catch(() => {})
      })()
      return cleanupPromise
    }

    const result = runOneShot(wire, sessionId, prompt, request.signal)
      .catch((error) => request.signal.aborted
        ? { output: [], stopReason: 'aborted' }
        : (this.ctx.logger.warn(`subagent-zcode-local "${this.name}": run failed: ${String(error)}`),
          { output: [], stopReason: 'error', diagnostic: 'Z Code could not complete the delegated task' }))
      .finally(cleanup)

    return {
      id: `zcode-${randomUUID()}`,
      localAgent: undefined,
      result,
      dispose: cleanup,
    }
  }
}

/** Register the Z Code provider on the shared subagent seam. */
export function apply(ctx, config = {}) {
  const permissionMode = config.permissionMode ?? DEFAULT_PERMISSION_MODE
  if (!['build', 'edit', 'plan', 'yolo'].includes(permissionMode)) {
    throw new Error(`subagent-zcode-local: unsupported permissionMode ${String(permissionMode)}`)
  }
  const graceMs = config.disposeGraceMs ?? DEFAULT_GRACE_MS
  if (!Number.isFinite(graceMs) || graceMs <= 0) {
    throw new Error('subagent-zcode-local: disposeGraceMs must be a positive number')
  }
  ctx.subagents.registerProvider(new ZCodeProvider(ctx, { ...config, permissionMode, disposeGraceMs: graceMs }))
}
