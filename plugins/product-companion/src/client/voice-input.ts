/** Browser-native microphone dictation. No model or AI processing is involved. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CompanionLocaleKey } from './locales.ts'

export type VoiceStage = 'idle' | 'listening' | 'error' | 'unsupported'

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
  shortcut: string
}

interface VoiceInputOptions {
  preferences: VoiceInputPreferences
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

function joinTranscript(...parts: string[]): string {
  return parts.map(part => part.trim()).filter(Boolean).join(' ')
}

const RECOGNITION_RESTART_DELAY_MS = 120

/** One microphone-recognition session at a time; unmount aborts it immediately. */
export function useVoiceInput({ preferences, t }: VoiceInputOptions): VoiceInputState {
  const constructor = recognitionConstructor()
  const [stage, setStage] = useState<VoiceStage>(constructor === undefined ? 'unsupported' : 'idle')
  const [liveText, setLiveText] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const listeningRequestedRef = useRef(false)
  const committedTranscriptRef = useRef('')
  const cycleTranscriptRef = useRef('')
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const commitCycle = useCallback(() => {
    committedTranscriptRef.current = joinTranscript(
      committedTranscriptRef.current,
      cycleTranscriptRef.current,
    )
    cycleTranscriptRef.current = ''
    return committedTranscriptRef.current
  }, [])

  const finish = useCallback(() => {
    const transcript = commitCycle()
    recognitionRef.current = null
    listeningRequestedRef.current = false
    committedTranscriptRef.current = ''
    cycleTranscriptRef.current = ''
    setLiveText('')
    if (transcript.length === 0) {
      announce(t('voice.noSpeech'), 'error')
      return
    }
    if (!insertVoiceText(transcript)) {
      announce(t('voice.composerMissing'), 'error')
      return
    }
    announce(t('voice.inserted'))
  }, [announce, commitCycle, t])

  const start = useCallback(() => {
    if (!preferences.enabled) return
    const Recognition = recognitionConstructor()
    if (Recognition === undefined) {
      setStage('unsupported')
      setFeedback(t('voice.unsupported'))
      return
    }
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    // The browser may rotate its own recognition session, but the product has
    // no countdown: keep listening until the user explicitly stops.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    listeningRequestedRef.current = true
    committedTranscriptRef.current = ''
    cycleTranscriptRef.current = ''
    recognition.onresult = (event) => {
      const transcript = transcriptOf(event.results)
      cycleTranscriptRef.current = joinTranscript(transcript.final, transcript.interim)
      setLiveText(transcript.interim || transcript.final)
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      // Chrome can end an otherwise healthy listening session after a period
      // of silence. Let onend renew it instead of imposing a product timeout.
      if (event.error === 'no-speech' && listeningRequestedRef.current) return
      listeningRequestedRef.current = false
      recognitionRef.current = null
      const key: CompanionLocaleKey = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'voice.permissionDenied'
        : 'voice.recognitionFailed'
      announce(t(key), 'error')
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return
      if (!listeningRequestedRef.current) {
        finish()
        return
      }
      commitCycle()
      setLiveText('')
      restartTimer.current = setTimeout(() => {
        restartTimer.current = null
        if (!mountedRef.current
          || !listeningRequestedRef.current
          || recognitionRef.current !== recognition) return
        try {
          recognition.start()
        } catch {
          finish()
        }
      }, RECOGNITION_RESTART_DELAY_MS)
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
    if (listeningRequestedRef.current) {
      listeningRequestedRef.current = false
      if (restartTimer.current !== null) {
        clearTimeout(restartTimer.current)
        restartTimer.current = null
      }
      const recognition = recognitionRef.current
      if (recognition === null) finish()
      else {
        try {
          recognition.stop()
        } catch {
          finish()
        }
      }
      return
    }
    start()
  }, [finish, start])

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
    if (preferences.enabled || !listeningRequestedRef.current) return
    listeningRequestedRef.current = false
    if (restartTimer.current !== null) {
      clearTimeout(restartTimer.current)
      restartTimer.current = null
    }
    const recognition = recognitionRef.current
    if (recognition === null) finish()
    else {
      try {
        recognition.stop()
      } catch {
        finish()
      }
    }
  }, [finish, preferences.enabled])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      listeningRequestedRef.current = false
      if (restartTimer.current !== null) clearTimeout(restartTimer.current)
      recognitionRef.current?.abort()
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current)
    }
  }, [])

  return { stage, liveText, feedback, supported: constructor !== undefined, toggle }
}
