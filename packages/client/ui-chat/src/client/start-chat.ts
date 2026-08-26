import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Durable internal preset that identifies a plain Chat Session. */
export const CHAT_AGENT_PRESET = 'chat'

type ChatSessions = {
  readonly list: Pick<ISessions['list'], 'getSnapshot'>
  readonly create: ISessions['create']
  readonly open: ISessions['open']
  readonly openWhenReady: ISessions['openWhenReady']
}

/**
 * Gesture-level Chat Session orchestration. A blank chat is reusable state,
 * while one in-flight create owns every click until it settles.
 */
export class ChatStarter {
  private creating: Promise<SessionId> | undefined

  constructor(private readonly sessions: ChatSessions) {}

  /** Open an existing blank chat or create and open exactly one new chat. */
  start(): void {
    const list = this.sessions.list.getSnapshot()
    const reusable = list.ids.find((id) => {
      const row = list.byId[id]
      return row?.blank === true && row.agentPreset === CHAT_AGENT_PRESET
    })
    if (reusable !== undefined) {
      this.sessions.open(reusable)
      return
    }
    const pending = this.creating ?? this.sessions.create({ agentPreset: CHAT_AGENT_PRESET })
    if (this.creating === undefined) {
      this.creating = pending
      void pending.finally(() => {
        if (this.creating === pending) this.creating = undefined
      }).catch(() => undefined)
    }
    // Every click reclaims latest-navigation ownership, even when it shares
    // the same in-flight create started by an earlier click.
    this.sessions.openWhenReady(
      pending,
      (reason) => { console.warn('start chat failed:', reason) },
    )
  }
}
