/**
 * Conversation outline rail. One dash per user turn, derived from the
 * standard chat snapshot; the dash follows the scrollport as the reader
 * scrolls (scrollspy), hovering a dash previews the turn's question and the
 * answer's opening text, and clicking scrolls that turn to the top of the
 * conversation. Everything is presentation: the snapshot comes from the
 * session kit, and jump/scrollspy only walk the anchor DOM the chat view
 * already renders (`[data-chat-anchor-key]` inside
 * `[data-conversation-scroll]`).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ChatConversationViewNode, ChatSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './outline.module.css'

/** Full props: session-scope runtime seat + the locale seat. */
export type OutlineRailProps = PropsRuntime<'conversation.session.outline'> & PropsLocale<'outline'>

/** One user turn in the outline: anchor key, question, and answer opening. */
export interface OutlineTurn {
  /** The user node's key; also the rendered row's `data-chat-anchor-key`. */
  key: string
  /** Single-line question text (truncated). */
  question: string
  /** Opening text of the turn's first assistant message (truncated). */
  excerpt: string
  /** Answer-length bucket driving the dash width (0 short, 2 long). */
  weight: 0 | 1 | 2
}

const QUESTION_LIMIT = 80
const EXCERPT_LIMIT = 160
/** Dash renders once the conversation has this many user turns. */
const MIN_TURNS = 3

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

/**
 * Derive the outline turns from the chat snapshot: every visible `user`
 * message opens a turn; the turn's excerpt is the opening text of its first
 * assistant message. Steering/context/tool nodes never open a turn, and a
 * turn with no assistant text yet (running or refused) keeps an empty
 * excerpt.
 */
export function deriveTurns(snapshot: Pick<ChatSnapshot, 'order' | 'nodes'>): readonly OutlineTurn[] {
  const turns: OutlineTurn[] = []
  let current: { turn: OutlineTurn; answerChars: number } | undefined
  const push = (): void => {
    if (current === undefined) return
    turns.push({ ...current.turn, weight: weightOf(current.answerChars) })
  }
  for (const key of snapshot.order) {
    const node: ChatConversationViewNode | undefined = snapshot.nodes.get(key)
    if (node === undefined || node.visibility !== 'visible') continue
    if (node.kind === 'user') {
      push()
      const question = truncate(userText((node.data as { content: readonly unknown[] }).content), QUESTION_LIMIT)
      current = { turn: { key, question, excerpt: '', weight: 0 }, answerChars: 0 }
    } else if (node.kind === 'assistant' && current !== undefined) {
      const text = assistantText((node.data as { blocks: readonly unknown[] }).blocks)
      current.answerChars += text.length
      if (current.turn.excerpt === '' && text !== '') {
        current.turn.excerpt = truncate(flatten(text), EXCERPT_LIMIT)
      }
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
 * The outline rail seat occupant. Renders nothing until the conversation has
 * at least {@link MIN_TURNS} user turns.
 */
export function OutlineRail({ useSession, t }: OutlineRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  // Membership changes drive the rail (a user message opens a turn); live
  // node-content flushes need no re-render — a turn's excerpt is complete by
  // the time the next user message lands.
  const turns = useMemo(() => deriveTurns({ order, nodes }), [order, nodes])
  const railRef = useRef<HTMLElement | null>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  const [current, setCurrent] = useState<string | undefined>(undefined)
  const [hover, setHover] = useState<string | undefined>(undefined)

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
  return (
    <nav ref={railRef} className={css.rail} aria-label={t('outline.rail.aria')}>
      {turns.map((turn) => {
        const active = current === turn.key
        return (
          <div key={turn.key} className={css.slot}>
            <button
              type="button"
              className={clsx(css.tick, active && css.tickActive)}
              aria-label={t('outline.turn.aria', { question: turn.question })}
              aria-current={active ? 'true' : undefined}
              onClick={() => { jump(turn.key) }}
              onMouseEnter={() => { setHover(turn.key) }}
              onMouseLeave={() => { setHover(hovered => hovered === turn.key ? undefined : hovered) }}
            >
              <span className={css.bar} data-weight={turn.weight} />
            </button>
            {hover === turn.key && (
              <div className={css.card} role="tooltip">
                <div className={css.cardQuestion}>{turn.question}</div>
                {turn.excerpt !== '' && <div className={css.cardExcerpt}>{turn.excerpt}</div>}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
