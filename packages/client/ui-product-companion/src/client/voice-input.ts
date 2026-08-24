/** Browser-native speech recognition plus optional DSH-model text processing. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompanionLocaleKey } from './locales.ts'

export type VoiceStage = 'idle' | 'listening' | 'processing' | 'error' | 'unsupported'

interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined
}
interface SpeechRecognitionEventLike {
  readonly results: {
    readonly length: number
    readonly [index: number]: SpeechRecognitionResultLike | undefined
  }
}
interface SpeechRecognitionErrorEventLike { readonly error: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
interface SpeechRecognitionConstructor { new(): SpeechRecognitionLike }

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export interface VoiceInputPreferences {
  enabled: boolean
  processText: boolean
  provider: string
  model: string
  instruction: string
  shortcut: string
}

interface VoiceInputOptions {
  preferences: VoiceInputPreferences
  recordUsage?: (spokenSeconds: number, processedChars: number, estimatedSavedSeconds: number) => void
  t: (key: CompanionLocaleKey, params?: Record<string, unknown>) => string
}

export interface VoiceInputState {
  stage: VoiceStage
  liveText: string
  feedback: string | null
  supported: boolean
  toggle: () => void
}

function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

/** Match one persisted, browser-local key chord without stealing unrelated typing. */
export function matchesVoiceShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const pieces = shortcut.split('+').filter(Boolean)
  const key = pieces.at(-1)?.toLowerCase()
  if (key === undefined) return false
  const has = (name: string): boolean => pieces.some(piece => piece.toLowerCase() === name.toLowerCase())
  const eventKey = event.code === 'Space' ? 'space' : event.key.toLowerCase()
  return eventKey === key
    && event.metaKey === has('Meta')
    && event.ctrlKey === has('Control')
    && event.altKey === has('Alt')
    && event.shiftKey === has('Shift')
}

function composerTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('[data-composer-card] textarea')
}

const SENTENCE_PUNCTUATION = new Set('，。！？、；：,.!?;:')

function startsWithPunctuation(value: string): boolean {
  const first = value[0]
  return first !== undefined && SENTENCE_PUNCTUATION.has(first)
}

/** Insert at the current selection through the native setter so React sees the input. */
export function insertVoiceText(text: string): boolean {
  const input = composerTextarea()
  if (input === null) return false
  const start = input.selectionStart
  const end = input.selectionEnd
  const prefix = input.value.slice(0, start)
  const suffix = input.value.slice(end)
  const needsLeadingSpace = prefix.length > 0 && !/\s$/.test(prefix) && !startsWithPunctuation(text)
  const needsTrailingSpace = suffix.length > 0 && !/^\s/.test(suffix)
    && !startsWithPunctuation(suffix) && !/\s$/.test(text)
  const inserted = `${needsLeadingSpace ? ' ' : ''}${text}${needsTrailingSpace ? ' ' : ''}`
  const next = `${prefix}${inserted}${suffix}`
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  const setter = descriptor?.set?.bind(input)
  if (setter === undefined) input.value = next
  else setter(next)
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: inserted,
  }))
  const caret = prefix.length + inserted.length
  input.focus({ preventScroll: true })
  input.setSelectionRange(caret, caret)
  return true
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    return typeof body.error === 'string' ? body.error : `HTTP ${String(response.status)}`
  } catch {
    return `HTTP ${String(response.status)}`
  }
}

async function processTranscript(
  transcript: string,
  preferences: VoiceInputPreferences,
  signal: AbortSignal,
): Promise<string> {
  if (!preferences.processText) return transcript
  const response = await fetch('/plugins/ui-product-companion/api/voice/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: transcript,
      instruction: preferences.instruction,
      ...preferences.provider.length > 0 && preferences.model.length > 0
        ? { provider: preferences.provider, model: preferences.model }
        : {},
    }),
    signal,
  })
  if (!response.ok) throw new Error(await responseError(response))
  const body = await response.json() as { text?: unknown }
  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    throw new Error('empty processed text')
  }
  return body.text.trim()
}

function transcriptOf(results: SpeechRecognitionEventLike['results']): { final: string; interim: string } {
  const final: string[] = []
  const interim: string[] = []
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const text = result?.[0]?.transcript.trim()
    if (result === undefined || text === undefined || text.length === 0) continue
    if (result.isFinal) final.push(text)
    else interim.push(text)
  }
  return { final: final.join(' '), interim: interim.join(' ') }
}

/** One recognition session at a time; unmount aborts mic and model work immediately. */
export function useVoiceInput({ preferences, recordUsage, t }: VoiceInputOptions): VoiceInputState {
  const constructor = recognitionConstructor()
  const [stage, setStage] = useState<VoiceStage>(constructor === undefined ? 'unsupported' : 'idle')
  const [liveText, setLiveText] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef('')
  const startedAtRef = useRef(0)
  const processingRef = useRef<AbortController | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const announce = useCallback((message: string, nextStage: VoiceStage = 'idle') => {
    if (!mountedRef.current) return
    setFeedback(message)
    setStage(nextStage)
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => {
      if (!mountedRef.current) return
      setFeedback(null)
      if (nextStage === 'error') setStage('idle')
    }, 2_800)
  }, [])

  const finish = useCallback(async () => {
    const transcript = transcriptRef.current.trim()
    recognitionRef.current = null
    setLiveText('')
    if (transcript.length === 0) {
      announce(t('voice.noSpeech'), 'error')
      return
    }
    const spokenSeconds = Math.max(1, (performance.now() - startedAtRef.current) / 1_000)
    const controller = new AbortController()
    processingRef.current = controller
    setStage(preferences.processText ? 'processing' : 'idle')
    let output = transcript
    let fallback = false
    try {
      output = await processTranscript(transcript, preferences, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      fallback = true
      console.warn('[product-companion voice] text processing failed; using transcript:', error)
    } finally {
      if (processingRef.current === controller) processingRef.current = null
    }
    if (!mountedRef.current) return
    if (!insertVoiceText(output)) {
      announce(t('voice.composerMissing'), 'error')
      return
    }
    const typedSeconds = output.length / 4
    recordUsage?.(
      spokenSeconds,
      output.length,
      Math.max(0, typedSeconds - spokenSeconds),
    )
    announce(fallback ? t('voice.fallbackInserted') : t('voice.inserted'))
  }, [announce, preferences, recordUsage, t])

  const start = useCallback(() => {
    if (!preferences.enabled) return
    const Recognition = recognitionConstructor()
    if (Recognition === undefined) {
      setStage('unsupported')
      setFeedback(t('voice.unsupported'))
      return
    }
    processingRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    transcriptRef.current = ''
    startedAtRef.current = performance.now()
    recognition.onresult = (event) => {
      const transcript = transcriptOf(event.results)
      transcriptRef.current = transcript.final || transcript.interim || transcriptRef.current
      setLiveText(transcript.interim || transcript.final)
    }
    recognition.onerror = (event) => {
      recognitionRef.current = null
      if (event.error === 'aborted') return
      const key: CompanionLocaleKey = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'voice.permissionDenied'
        : event.error === 'no-speech'
          ? 'voice.noSpeech'
          : 'voice.recognitionFailed'
      announce(t(key), 'error')
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return
      void finish()
    }
    recognitionRef.current = recognition
    setFeedback(null)
    setLiveText('')
    setStage('listening')
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      announce(t('voice.recognitionFailed'), 'error')
    }
  }, [announce, finish, preferences.enabled, t])

  const toggle = useCallback(() => {
    if (stage === 'listening' && recognitionRef.current !== null) {
      recognitionRef.current.stop()
      return
    }
    if (stage === 'processing') return
    start()
  }, [stage, start])

  useEffect(() => {
    if (!preferences.enabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || document.querySelector('[data-voice-shortcut-recording]') !== null) return
      if (!matchesVoiceShortcut(event, preferences.shortcut)) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, [preferences.enabled, preferences.shortcut, toggle])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recognitionRef.current?.abort()
      processingRef.current?.abort()
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    }
  }, [])

  return { stage, liveText, feedback, supported: constructor !== undefined, toggle }
}
