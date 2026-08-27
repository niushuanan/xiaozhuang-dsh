/**
 * Conversation outline rail. One dash per conversation turn in the loaded
 * history window, derived from the standard chat snapshot; the dash follows
 * the scrollport as the reader scrolls (scrollspy), hovering a dash previews
 * the turn's question and the answer's opening text, and clicking scrolls
 * that turn to the top of the conversation. Everything is presentation: the
 * snapshot comes from the session kit, and jump/scrollspy only walk the
 * anchor DOM the chat view already renders (`[data-chat-anchor-key]` inside
 * `[data-conversation-scroll]`).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ChatConversationViewNode, ChatSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './outline.module.css'

/** Full props: session-scope runtime seat + the locale seat + the paging callback. */
export type OutlineRailProps = PropsRuntime<'conversation.session.outline'>
  & PropsLocale<'outline'>
  & {
    /** Load one older history page through the session's object face. */
    loadOlder: () => void
  }

/** One turn in the outline: anchor key, question, and answer opening. */
export interface OutlineTurn {
  /** The turn's first rendered row key; also its `data-chat-anchor-key`. */
  key: string
  /** Single-line question text (truncated); empty when the window carries no prompt row. */
  question: string
  /** Opening text of the turn's final assistant message (truncated). */
  excerpt: string
  /** Answer-length bucket driving the dash width (0 short, 2 long). */
  weight: 0 | 1 | 2
}

const QUESTION_LIMIT = 80
const EXCERPT_LIMIT = 160
/** Dash renders once the loaded window spans this many turns. */
const MIN_TURNS = 3
/** Auto-paging cap while the window is too small to show the rail. */
const MAX_AUTO_PAGES = 3

/** Structural view of one content block (core blocks narrowed locally, the MessageItem pattern). */
type TextBlockLike = { type?: string; kind?: string; text?: string }

/** Collapse every whitespace run so one line renders out of message text. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Truncate on code points so an emoji split never produces a broken glyph. */
function truncate(text: string, limit: number): string {
  const chars = Array.from(text)
  return chars.length <= limit ? text : `${chars.slice(0, limit - 1).join('')}…`
}

function userText(content: readonly unknown[]): string {
  let out = ''
  for (const block of content) {
    const b = block as TextBlockLike
    if (b.type === 'text' && typeof b.text === 'string') out += out === '' ? b.text : ` ${b.text}`
  }
  return flatten(out)
}

function assistantText(blocks: readonly unknown[]): string {
  let out = ''
  for (const block of blocks) {
    const b = block as TextBlockLike
    if (b.kind === 'text' && typeof b.text === 'string') out += out === '' ? b.text : ` ${b.text}`
  }
  return out
}

/** Answer-length bucket: the mixed dash lengths echo the transcript's shape. */
function weightOf(answerChars: number): 0 | 1 | 2 {
  if (answerChars < 120) return 0
  return answerChars < 600 ? 1 : 2
}

/** The turn number a rendered row belongs to; session-level rows belong to none. */
function turnNumberOf(node: ChatConversationViewNode): number | undefined {
  if (node.location.kind === 'turn' || node.location.kind === 'step') {
    return node.location.turn as unknown as number
  }
  return undefined
}

/**
 * Derive the outline turns from the chat snapshot. Turn boundaries come from
 * the rows' `location.turn` — NOT from prompt rows, which the loaded window
 * may not carry (the coding transcript renders prompts only when their row
 * is in the window, and some surfaces fold them away entirely). A prompt or
 * steering row contributes its text to the next turn's preview; a turn with
 * no assistant text yet (running or refused) keeps an empty excerpt.
 */
export function deriveTurns(snapshot: Pick<ChatSnapshot, 'order' | 'nodes'>): readonly OutlineTurn[] {
  const turns: OutlineTurn[] = []
  let current: { turn: OutlineTurn; answerChars: number; number: number } | undefined
  let pendingQuestion = ''
  const push = (): void => {
    if (current === undefined) return
    turns.push({ ...current.turn, weight: weightOf(current.answerChars) })
  }
  for (const key of snapshot.order) {
    const node: ChatConversationViewNode | undefined = snapshot.nodes.get(key)
    if (node === undefined || node.visibility !== 'visible') continue
    if (node.kind === 'user' || node.kind === 'steering') {
      const question = truncate(userText((node.data as { content: readonly unknown[] }).content), QUESTION_LIMIT)
      const number = turnNumberOf(node)
      if (number !== undefined && (current === undefined || number !== current.number)) {
        // The prompt row opens its turn and anchors it.
        push()
        current = { turn: { key, question, excerpt: '', weight: 0 }, answerChars: 0, number }
        pendingQuestion = ''
      } else {
        pendingQuestion = question
      }
      continue
    }
    const number = turnNumberOf(node)
    if (number === undefined) continue
    if (current === undefined || number !== current.number) {
      push()
      current = { turn: { key, question: pendingQuestion, excerpt: '', weight: 0 }, answerChars: 0, number }
      pendingQuestion = ''
    }
    if (node.kind === 'assistant-step') {
      const text = assistantText((node.data as { blocks: readonly unknown[] }).blocks)
      current.answerChars += text.length
      // The preview shows the turn's FINAL answer: the last assistant text
      // in the turn overwrites earlier candidates.
      if (text !== '') current.turn.excerpt = truncate(flatten(text), EXCERPT_LIMIT)
    }
  }
  push()
  return turns
}

/**
 * Resolve the conversation scrollport from the rendered rail: the resident
 * skeleton mounts the rail seat inside the conversation column, next to the
 * scroll body. Null while unmounted or under a bare test container.
 */
function scrollportOf(rail: HTMLElement | null): HTMLElement | null {
  const seat = rail?.closest("[data-slot='conversation.session.outline']")
  return seat?.parentElement?.querySelector<HTMLElement>('[data-conversation-scroll]') ?? null
}

/** Anchor-row lookup keyed by `data-chat-anchor-key`, bounded to one pass. */
function anchorIndex(scroller: HTMLElement): Map<string, HTMLElement> {
  const index = new Map<string, HTMLElement>()
  for (const row of scroller.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    const key = row.dataset.chatAnchorKey
    if (key !== undefined && !index.has(key)) index.set(key, row)
  }
  return index
}

/**
 * The current turn: the last turn whose row top sits above the scrollport's
 * reading line, falling back to the first turn while the conversation is
 * scrolled above every row.
 */
function currentTurnKey(
  scroller: HTMLElement,
  turns: readonly OutlineTurn[],
  anchors: Map<string, HTMLElement>,
): string | undefined {
  const scrollerTop = scroller.getBoundingClientRect().top
  const readingLine = scrollerTop + 120
  let current: string | undefined
  for (const turn of turns) {
    const row = anchors.get(turn.key)
    if (row === undefined) continue
    if (row.getBoundingClientRect().top > readingLine) break
    current = turn.key
  }
  return current ?? turns.find(turn => anchors.has(turn.key))?.key
}

/**
 * The outline rail seat occupant. Renders nothing until the loaded window
 * spans at least {@link MIN_TURNS} turns; a window that small pages older
 * history in (bounded) so tool-heavy sessions still reach the threshold.
 */
export function OutlineRail({ useSession, loadOlder, t }: OutlineRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  // Membership changes drive the rail (a row entering or leaving the window
  // moves turn boundaries); live node-content flushes need no re-render — a
  // turn's excerpt is complete by the time the next turn lands.
  const turns = useMemo(() => deriveTurns({ order, nodes }), [order, nodes])
  const railRef = useRef<HTMLElement | null>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  const autoPagesRef = useRef(0)
  const [current, setCurrent] = useState<string | undefined>(undefined)
  /** The hovered dash's viewport anchor: card x (its right edge + gap) and clamped center y. */
  const [hover, setHover] = useState<{ key: string; x: number; centerY: number } | undefined>(undefined)

  const hoverDash = (key: string, element: HTMLElement): void => {
    const rect = element.getBoundingClientRect()
    const margin = 140
    setHover({
      key,
      x: rect.right + 12,
      centerY: Math.max(margin, Math.min(rect.top + rect.height / 2, window.innerHeight - margin)),
    })
  }

  // A tool-heavy session's first page can span fewer turns than the rail
  // needs; pull bounded older pages until the threshold is met or the
  // history head is reached. The per-mount cap keeps a huge log from paging
  // unbounded just to light up three dashes.
  useEffect(() => {
    if (turns.length >= MIN_TURNS || !hasMore || loadingOlder) return
    if (autoPagesRef.current >= MAX_AUTO_PAGES) return
    autoPagesRef.current += 1
    loadOlder()
  }, [hasMore, loadOlder, loadingOlder, turns.length])

  // Scrollspy: follow the scrollport's reader position and content growth so
  // the active dash always mirrors what is on screen.
  useEffect(() => {
    const scroller = scrollportOf(railRef.current)
    if (scroller === null) return
    let raf = 0
    const update = (): void => {
      raf = 0
      setCurrent(currentTurnKey(scroller, turnsRef.current, anchorIndex(scroller)))
    }
    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(update)
    }
    schedule()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const flow = scroller.querySelector('[data-chat-flow]')
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(schedule)
    if (flow !== null && observer !== undefined) observer.observe(flow)
    return () => {
      scroller.removeEventListener('scroll', schedule)
      observer?.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [turns])

  const jump = (key: string): void => {
    const scroller = scrollportOf(railRef.current)
    if (scroller === null) return
    const row = anchorIndex(scroller).get(key)
    if (row === undefined) return
    const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTo({ top: scroller.scrollTop + offset - 16, behavior: 'smooth' })
  }

  if (turns.length < MIN_TURNS) return null
  const hoveredTurn = hover === undefined ? undefined : turns.find(turn => turn.key === hover.key)
  const hoveredIndex = hoveredTurn === undefined ? 0 : turns.indexOf(hoveredTurn)
  return (
    <nav ref={railRef} className={css.rail} aria-label={t('outline.rail.aria')}>
      {turns.map((turn, index) => {
        const active = current === turn.key
        const named = turn.question !== ''
        return (
          <div key={turn.key} className={css.slot}>
            <button
              type="button"
              className={clsx(css.tick, active && css.tickActive)}
              aria-label={named
                ? t('outline.turn.aria', { question: turn.question })
                : t('outline.turn.unnamed', { n: index + 1 })}
              aria-current={active ? 'true' : undefined}
              onClick={() => { jump(turn.key) }}
              onMouseEnter={(event) => { hoverDash(turn.key, event.currentTarget) }}
              onMouseLeave={() => { setHover(hovered => hovered?.key === turn.key ? undefined : hovered) }}
            >
              <span className={css.bar} data-weight={turn.weight} />
            </button>
          </div>
        )
      })}
      {hoveredTurn !== undefined && hover !== undefined && createPortal((
        // The preview lives on <body>: the rail clips its own box (zero-width
        // seat, capped dash column), so an in-rail card would be cut to a
        // sliver. Fixed positioning anchored to the hovered dash's viewport
        // rect, flipped straight right where the message column always is.
        <div className={css.card} role="tooltip" style={{ left: hover.x, top: hover.centerY }}>
          <div className={css.cardQuestion}>
            {hoveredTurn.question !== ''
              ? hoveredTurn.question
              : t('outline.turn.unnamed', { n: hoveredIndex + 1 })}
          </div>
          {hoveredTurn.excerpt !== '' && <div className={css.cardExcerpt}>{hoveredTurn.excerpt}</div>}
        </div>
      ), document.body)}
    </nav>
  )
}
